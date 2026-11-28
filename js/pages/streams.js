import { fetchStreamMetadata, calendarMetadata } from "../shared/youtube-stream.js";
import { h, Fragment, useCallback, useEffect, useMemo, useState, useRouter } from "../core/runtime.js";
import { SUPABASE_URL, SUPABASE_KEY, isAuthorizedAdmin, supabase } from "../core/supabase.js";
import { MIN_MONTH, pad, dateString, monthIndex, colors, colorNames, isFixedType, displayEventTitle, isStreamType, formatDuration, inputClass, buttonClass } from "../shared/activity-utils.js";
const localDateTime = (value) => {
    if (!value)
        return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return "";
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const parseTimestamp = (value) => {
    const parts = value.trim().split(":");
    if (!parts.length || parts.length > 3 || parts.some(p => !/^\d+$/.test(p)))
        return null;
    const n = parts.map(Number);
    if (n.some(x => !Number.isSafeInteger(x)))
        return null;
    if (n.length > 1 && n.slice(1).some(x => x > 59))
        return null;
    return n.reduce((total, v) => total * 60 + v, 0);
};
// 数字だけ入力した場合は右から秒・分・時間の順に区切る。
const formatClipTimeInput = (value) => {
    const digits = value.replace(/\D/g, "").slice(0, 8);
    if (!digits)
        return "";
    if (digits.length <= 2)
        return digits;
    if (digits.length <= 4)
        return `${digits.slice(0, -2)}:${digits.slice(-2)}`;
    return `${digits.slice(0, -4)}:${digits.slice(-4, -2)}:${digits.slice(-2)}`;
};
const timestampLabel = (seconds) => {
    const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), sec = seconds % 60;
    return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};
const youtubeVideoId = (value) => {
    try {
        const u = new URL(value);
        const host = u.hostname.toLowerCase();
        let id = "";
        if (host === "youtu.be" || host === "www.youtu.be")
            id = u.pathname.split("/")[1] || "";
        else if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host))
            id = u.pathname === "/watch" ? u.searchParams.get("v") || "" : /^\/(live|shorts|embed)\//.test(u.pathname) ? u.pathname.split("/")[2] || "" : "";
        return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    catch {
        return null;
    }
};
const splitPeople = (value) => (value || "").split(/[,、\n]/).map(v => v.trim()).filter(Boolean);
function useCatalogs() {
    const [games, setGames] = useState([]);
    const [people, setPeople] = useState([]);
    const [catalogError, setCatalogError] = useState("");
    const reload = useCallback(async () => {
        if (!supabase)
            return;
        const [g, p] = await Promise.all([
            supabase.from("personal_game_library").select("id,title,status").order("title"),
            supabase.from("personal_stream_collaborators").select("id,name").order("name"),
        ]);
        if (g.error || p.error)
            setCatalogError([g.error?.message, p.error?.message].filter(Boolean).join(" / "));
        else {
            setGames((g.data || []).map(x => ({...x, name:x.title})));
            setPeople(p.data || []);
            setCatalogError("");
        }
    }, []);
    useEffect(() => { void reload(); }, [reload]);
    return { games, people, catalogError, reload };
}
export default function StreamManager({ data, focusedId, clearFocus }) {
    const { events, streams, types, load } = data;
    const [selected, setSelected] = useState(null);
    const [creating, setCreating] = useState(false);
    const [newDate, setNewDate] = useState(() => {
        const d = new Date();
        return dateString(d.getFullYear(), d.getMonth(), d.getDate());
    });
    const [newType, setNewType] = useState("stream");
    const [newTitle, setNewTitle] = useState("");
    const [newTime, setNewTime] = useState("");
    const [newUrl, setNewUrl] = useState("");
    const [createError, setCreateError] = useState("");
    const [form, setForm] = useState(null);
    const [eventDraft, setEventDraft] = useState(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [monthFilter, setMonthFilter] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
    });
    const catalog = useCatalogs();
    const [peopleDraft, setPeopleDraft] = useState([]);
    const [fetchingYoutube, setFetchingYoutube] = useState(false);
    const [youtubeMessage, setYoutubeMessage] = useState("");
    const [clips, setClips] = useState([]);
    const [clipTime, setClipTime] = useState("");
    const [newGameName, setNewGameName] = useState("");
    const [newPersonName, setNewPersonName] = useState("");
    const [addingCatalog, setAddingCatalog] = useState(null);
    const [clipNote, setClipNote] = useState("");
    const [editingClipId, setEditingClipId] = useState(null);
    const [editClipTime, setEditClipTime] = useState("");
    const [editClipNote, setEditClipNote] = useState("");
    const [clipError, setClipError] = useState("");
    const [clipsLoading, setClipsLoading] = useState(false);
    const streamMap = useMemo(() => new Map(streams.map(s => [s.calendar_event_id, s])), [streams]);
    const typeMap = useMemo(() => new Map(types.map(t => [t.id, t])), [types]);
    const streamEvents = useMemo(() => events.filter(e => isStreamType(typeMap.get(e.category_id))).sort((a, b) => b.event_date.localeCompare(a.event_date)), [events, typeMap]);
    const months = [...new Set([...streamEvents.map(e => e.event_date.slice(0, 7)), monthFilter])].sort().reverse();
    const filtered = streamEvents.filter(e => {
        const stream = streamMap.get(e.id);
        if (monthFilter !== "all" && !e.event_date.startsWith(monthFilter))
            return false;
        if (statusFilter !== "all" && stream?.status !== statusFilter)
            return false;
        const term = search.trim().toLocaleLowerCase();
        return !term || [e.title, e.event_date, catalog.games.find(g => g.id === stream?.game_id)?.name, stream?.collaborators, stream?.youtube_url].some(x => (x || "").toLocaleLowerCase().includes(term));
    });
    useEffect(() => { if (focusedId) {
        setSelected(focusedId);
        clearFocus();
    } }, [focusedId, clearFocus]);
    useEffect(() => {
        const found = streams.find(s => s.calendar_event_id === selected) ?? null;
        setForm(found ? { ...found, status: found.actual_end_at ? "completed" : found.status } : null);
        setPeopleDraft(splitPeople(found?.collaborators ?? null));
        setError("");
    }, [selected, streams]);
    useEffect(() => {
        let alive = true;
        setClips([]);
        setClipError("");
        const stream = streams.find(s => s.calendar_event_id === selected);
        if (!supabase || !stream)
            return;
        setClipsLoading(true);
        void supabase.from("personal_stream_clips").select("id,stream_id,timestamp_seconds,note").eq("stream_id", stream.id).order("timestamp_seconds").then(({ data, error }) => {
            if (!alive)
                return;
            setClipsLoading(false);
            if (error)
                setClipError(error.message);
            else
                setClips((data || []));
        });
        return () => { alive = false; };
    }, [selected, streams]);
    const event = events.find(e => e.id === selected);
    useEffect(() => { setEventDraft(event ? {...event,title:streamMap.get(event.id)?.youtube_title || event.title,notes:event.notes ?? streamMap.get(event.id)?.private_notes ?? "",start_time:event.start_time?.slice(0,5)||""} : null); }, [event]);
    const videoId = youtubeVideoId(form?.youtube_url || "");
    async function createStream() {
        if (!supabase || busy)
            return;
        const category = types.find(t => t.system_key === newType);
        if (!category || !/^\d{4}-\d{2}-\d{2}$/.test(newDate) || newDate < "2026-10-01" ||
            Number.isNaN(new Date(newDate + "T00:00:00").getTime())) {
            setCreateError("日付と種類を確認してください。");
            return;
        }
        if (newUrl.trim() && !youtubeVideoId(newUrl.trim())) {
            setCreateError("YouTubeのURLを確認してください。");
            return;
        }
        setBusy(true);
        setCreateError("");
        try {
            const metadata = newUrl.trim() ? await fetchStreamMetadata(newUrl.trim()) : {};
            const shared = calendarMetadata(metadata, {event_date:newDate,title:newTitle.trim(),start_time:newTime||null});
            const eventResult = await supabase.from("personal_calendar_events")
                .insert({ ...shared, category_id: category.id, notes: null })
                .select("id").single();
            if (eventResult.error || !eventResult.data)
                throw new Error(eventResult.error?.message || "登録できませんでした。");
            const eventId = eventResult.data.id;
            // 配信情報の作成に失敗した場合は、作成した予定も元に戻す。
            const streamResult = await supabase.from("personal_streams")
                .insert({ calendar_event_id: eventId, youtube_url: newUrl.trim() || null, ...metadata, youtube_title: shared.title });
            if (streamResult.error) {
                const rollback = await supabase.from("personal_calendar_events").delete().eq("id", eventId);
                throw new Error(streamResult.error.message + (rollback.error ? " / 予定の削除にも失敗しました: " + rollback.error.message : ""));
            }
            setCreating(false);
            setNewTitle("");
            setNewTime("");
            setNewUrl("");
            setSearch("");
            setMonthFilter(shared.event_date.slice(0, 7));
            setStatusFilter("all");
            await load();
            setSelected(eventId);
        }
        catch (e) {
            setCreateError(e instanceof Error ? e.message : "登録できませんでした。");
        }
        finally {
            setBusy(false);
        }
    }
    async function fetchYoutube() {
        if (!supabase || !form || fetchingYoutube || busy)
            return;
        const id = youtubeVideoId(form.youtube_url || "");
        if (!id) {
            setError("YouTubeのURLを確認してください。");
            return;
        }
        setFetchingYoutube(true);
        setError("");
        setYoutubeMessage("");
        try {
            const metadata = await fetchStreamMetadata(form.youtube_url);
            setForm(previous => previous && previous.id === form.id && previous.youtube_url === form.youtube_url ? {...previous, ...metadata} : previous);
            setEventDraft(previous => previous && previous.id === event.id ? {...previous,...calendarMetadata(metadata,previous)} : previous);
            setYoutubeMessage("取得しました。保存すると反映されます。");
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "取得できませんでした。");
        }
        finally {
            setFetchingYoutube(false);
        }
    }
    async function save() {
        if (!supabase || !form || !event || !eventDraft || busy || fetchingYoutube)
            return;
        if (form.youtube_url?.trim() && !videoId) {
            setError("YouTubeのURLを確認してください。");
            return;
        }
        if (form.duration_minutes !== null && (!Number.isSafeInteger(form.duration_minutes) || form.duration_minutes < 0)) {
            setError("配信時間を確認してください。");
            return;
        }
        if (form.actual_start_at && form.actual_end_at && new Date(form.actual_end_at) < new Date(form.actual_start_at)) {
            setError("終了日時が開始日時より前です。");
            return;
        }
        setBusy(true);
        setError("");
        if (!eventDraft.event_date || eventDraft.event_date < "2026-10-01") {setError("日付を確認してください。");setBusy(false);return;}
        const er = await supabase.from("personal_calendar_events").update({event_date:eventDraft.event_date,title:eventDraft.title.trim(),start_time:eventDraft.start_time||null,category_id:eventDraft.category_id,notes:eventDraft.notes||null}).eq("id",event.id);
        if(er.error){setError(er.error.message);setBusy(false);return;}
        const r = await supabase.from("personal_streams").update({ youtube_url: form.youtube_url?.trim() || null, status: form.actual_end_at ? "completed" : form.status, actual_start_at: form.actual_start_at ? new Date(form.actual_start_at).toISOString() : null, actual_end_at: form.actual_end_at ? new Date(form.actual_end_at).toISOString() : null, duration_minutes: form.duration_minutes, game_id: form.game_id || null, game: null, collaborators: peopleDraft.map(v => v.trim()).filter(Boolean).join(", ") || null, private_notes: eventDraft.notes || null, youtube_title: eventDraft.title.trim() || null, youtube_thumbnail: form.youtube_thumbnail || null, youtube_scheduled_at: form.youtube_scheduled_at || null }).eq("id", form.id);
        setBusy(false);
        if (r.error) {
            setError("予定は保存されましたが、配信情報の保存に失敗しました: " + r.error.message);
            return;
        }
        setMonthFilter(eventDraft.event_date.slice(0,7));
        await load();
        requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "smooth" }));
    }
    async function deleteStream() {
        if (!supabase || !event || !form || busy || !window.confirm("この配信とカレンダーの予定、切り抜きメモを削除しますか？"))
            return;
        setBusy(true);
        setError("");
        // 削除はDBの外部キー CASCADE に依存しないよう、子から順に処理する。
        const clipsResult = await supabase.from("personal_stream_clips").delete().eq("stream_id", form.id);
        if (clipsResult.error) {
            setError(clipsResult.error.message);
            setBusy(false);
            return;
        }
        const streamResult = await supabase.from("personal_streams").delete().eq("id", form.id);
        if (streamResult.error) {
            setError(streamResult.error.message);
            setBusy(false);
            return;
        }
        const eventResult = await supabase.from("personal_calendar_events").delete().eq("id", event.id);
        setBusy(false);
        if (eventResult.error) {
            setError("配信情報は削除されましたが、カレンダーの予定が残っています: " + eventResult.error.message);
            await load();
            return;
        }
        setSelected(null);
        setForm(null);
        await load();
    }
    async function addCatalogInline(kind) {
        if (!supabase || addingCatalog || busy)
            return;
        const name = (kind === "game" ? newGameName : newPersonName).trim();
        if (!name) {
            setError("登録する名前を入力してください。");
            return;
        }
        const existing = kind === "game" ? catalog.games : catalog.people;
        if (existing.some(item => item.name.trim().toLowerCase() === name.toLowerCase())) {
            setError("すでに登録されています。リストから選択してください。");
            return;
        }
        setAddingCatalog(kind);
        setError("");
        const table = kind === "game" ? "personal_game_library" : "personal_stream_collaborators";
        const { data: inserted, error: insertError } = await supabase.from(table).insert(kind === "game" ? {title:name,status:"wanted"} : {name}).select("id").single();
        if (insertError) {
            setError(insertError.message);
            setAddingCatalog(null);
            return;
        }
        await catalog.reload();
        if (kind === "game") {
            setForm(v => v && ({ ...v, game_id: inserted.id }));
            setNewGameName("");
        }
        else {
            setPeopleDraft(v => {
                const emptyIndex = v.findIndex(person => !person);
                return emptyIndex >= 0 ? v.map((person, index) => index === emptyIndex ? name : person) : [...v, name];
            });
            setNewPersonName("");
        }
        setAddingCatalog(null);
    }
    async function addClip() {
        if (!supabase || !form || busy)
            return;
        const seconds = parseTimestamp(clipTime);
        if (seconds === null) {
            setClipError("時間を確認してください（例：123 → 1:23、10203 → 1:02:03）。");
            return;
        }
        setBusy(true);
        setClipError("");
        const r = await supabase.from("personal_stream_clips").insert({ stream_id: form.id, timestamp_seconds: seconds, note: clipNote.trim() }).select("id,stream_id,timestamp_seconds,note").single();
        setBusy(false);
        if (r.error) {
            setClipError(r.error.message);
            return;
        }
        setClips(old => [...old, r.data].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds));
        setClipTime("");
        setClipNote("");
    }
    function startEditClip(clip) {
        setEditingClipId(clip.id);
        setEditClipTime(timestampLabel(clip.timestamp_seconds));
        setEditClipNote(clip.note);
        setClipError("");
    }
    async function saveEditedClip() {
        if (!supabase || !form || !editingClipId || busy)
            return;
        const seconds = parseTimestamp(editClipTime);
        if (seconds === null) {
            setClipError("タイムスタンプを確認してください。");
            return;
        }
        setBusy(true);
        setClipError("");
        const result = await supabase.from("personal_stream_clips")
            .update({ timestamp_seconds: seconds, note: editClipNote.trim() })
            .eq("id", editingClipId).eq("stream_id", form.id)
            .select("id,stream_id,timestamp_seconds,note").single();
        setBusy(false);
        if (result.error) {
            setClipError(result.error.message);
            return;
        }
        setClips(old => old.map(c => c.id === editingClipId ? result.data : c)
            .sort((a, b) => a.timestamp_seconds - b.timestamp_seconds || a.id.localeCompare(b.id)));
        setEditingClipId(null);
    }
    async function deleteClip(id) {
        if (!supabase || busy || !window.confirm("切り抜きメモを削除しますか？"))
            return;
        setBusy(true);
        setClipError("");
        const r = await supabase.from("personal_stream_clips").delete().eq("id", id);
        setBusy(false);
        if (r.error)
            setClipError(r.error.message);
        else {
            setClips(old => old.filter(c => c.id !== id));
            if (editingClipId === id)
                setEditingClipId(null);
        }
    }
    return h(Fragment, null,
        creating && h("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4", onMouseDown: e => { if (e.target === e.currentTarget && !busy)
                setCreating(false); } },
            h("div", { role: "dialog", "aria-modal": "true", "aria-labelledby": "new-stream-title", className: "max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl" },
                h("h3", { id: "new-stream-title", className: "mb-5 font-semibold" }, "\u65B0\u898F\u914D\u4FE1\u767B\u9332"),
                h("div", { className: "space-y-4" },
                    h("label", { className: "block text-sm" },
                        "\u914D\u4FE1\u65E5",
                        h("input", { type: "date", min: "2026-10-01", className: inputClass, value: newDate, onChange: e => setNewDate(e.target.value) })),
                    h("label", { className: "block text-sm" },
                        "\u7A2E\u985E",
                        h("select", { className: inputClass, value: newType, onChange: e => setNewType(e.target.value) },
                            h("option", { value: "stream" }, "\u914D\u4FE1"),
                            h("option", { value: "collab" }, "\u30B3\u30E9\u30DC"))),
                    h("label", { className: "block text-sm" },
                        "\u4E88\u5B9A\u540D\uFF08\u4EFB\u610F\uFF09",
                        h("input", { className: inputClass, maxLength: 120, value: newTitle, onChange: e => setNewTitle(e.target.value) })),
                    h("label", { className: "block text-sm" },
                        "\u958B\u59CB\u6642\u523B\uFF08\u4EFB\u610F\uFF09",
                        h("input", { type: "time", className: inputClass, value: newTime, onChange: e => setNewTime(e.target.value) })),
                    h("label", { className: "block text-sm" },
                        "YouTube\u914D\u4FE1URL\uFF08\u4EFB\u610F\uFF09",
                        h("input", { type: "url", className: inputClass, placeholder: "https://www.youtube.com/watch?v=...", value: newUrl, onChange: e => setNewUrl(e.target.value) }))),
                createError && h("p", { role: "alert", className: "mt-4 text-sm text-red-700" }, createError),
                h("div", { className: "mt-6 flex gap-2" },
                    h("button", { disabled: busy, className: "rounded-lg bg-[#252525] px-5 py-2 text-sm text-white disabled:opacity-40", onClick: () => void createStream() }, busy ? "登録中" : "登録"),
                    h("button", { disabled: busy, className: buttonClass, onClick: () => setCreating(false) }, "\u30AD\u30E3\u30F3\u30BB\u30EB")))),
        h("section", { className: "stream-split" },
            h("div", { className: "min-w-0 rounded-xl border bg-white p-4" },
                h("div", { className: "mb-4 flex flex-wrap items-center justify-between gap-2" },
                    h("h3", { className: "font-semibold" },
                        "\u914D\u4FE1\u4E00\u89A7 ",
                        h("span", { className: "text-xs font-normal text-gray-500" },
                            filtered.length,
                            "\u4EF6")),
                    h("button", { type: "button", className: "rounded-lg bg-[#252525] px-4 py-2 text-sm text-white", onClick: () => { setCreateError(""); setCreating(true); } }, "\u65B0\u898F\u914D\u4FE1\u767B\u9332")),
                h("input", { className: inputClass, "aria-label": "\u914D\u4FE1\u691C\u7D22", placeholder: "\u30BF\u30A4\u30C8\u30EB\u30FB\u30B2\u30FC\u30E0\u30FB\u30B3\u30E9\u30DC\u76F8\u624B", value: search, onChange: e => setSearch(e.target.value) }),
                h("div", { className: "my-3 grid grid-cols-2 gap-2" },
                    h("select", { className: inputClass, "aria-label": "\u5E74\u6708", value: monthFilter, onChange: e => setMonthFilter(e.target.value) },
                        h("option", { value: "all" }, "\u3059\u3079\u3066\u306E\u6708"),
                        months.map(m => h("option", { key: m, value: m },
                            m.replace("-", "年"),
                            "\u6708"))),
                    h("select", { className: inputClass, "aria-label": "\u72B6\u614B", value: statusFilter, onChange: e => setStatusFilter(e.target.value) },
                        h("option", { value: "all" }, "\u3059\u3079\u3066\u306E\u72B6\u614B"),
                        h("option", { value: "scheduled" }, "\u4E88\u5B9A"),
                        h("option", { value: "live" }, "\u914D\u4FE1\u4E2D"),
                        h("option", { value: "completed" }, "\u7D42\u4E86"))),
                h("div", { className: "max-h-[70vh] grid grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2" },
                    filtered.map(e => {
                        const stream = streamMap.get(e.id);
                        return h("button", { key: e.id, onClick: () => setSelected(e.id), className: `overflow-hidden rounded-lg border text-left text-sm ${selected === e.id ? "border-gray-800 bg-gray-50" : "border-gray-200 bg-white hover:bg-gray-50"}` },
                            stream?.youtube_thumbnail ? h("img", { src: stream.youtube_thumbnail, alt: "", loading: "lazy", referrerPolicy: "no-referrer", className: "aspect-video w-full object-cover" }) : h("div", { className: "flex aspect-video items-center justify-center bg-gray-100 text-xs text-gray-400" }, "\u30B5\u30E0\u30CD\u30A4\u30EB\u306A\u3057"),
                            h("div", { className: "space-y-1 p-3" },
                                h("span", { className: "flex justify-between gap-2 text-xs text-gray-500" },
                                    h("span", null,
                                        e.event_date,
                                        " ",
                                        e.start_time?.slice(0, 5)),
                                    h("span", null, stream?.status === "completed" ? "終了" : stream?.status === "live" ? "配信中" : "予定")),
                                h("span", { className: "block line-clamp-2 font-medium" }, e.title.trim() || stream?.youtube_title || displayEventTitle(e, typeMap.get(e.category_id))),
                                stream?.game_id && h("span", { className: "block truncate text-xs text-gray-500" }, catalog.games.find(g => g.id === stream.game_id)?.name || "ゲーム情報読み込み中")));
                    }),
                    filtered.length === 0 && h("p", { className: "col-span-full py-8 text-center text-sm text-gray-500" }, "0\u4EF6"))),
            h("div", { className: "min-w-0 rounded-xl border bg-white p-5" }, event && form ? h(Fragment, null,
                h("h3", { className: "mb-1 font-semibold" }, (event.title.trim() || form.youtube_title || displayEventTitle(event, typeMap.get(event.category_id)))),
                h("p", { className: "mb-5 text-sm text-gray-500" },
                    event.event_date,
                    " ",
                    event.start_time?.slice(0, 5)),
                h("div", { className: "space-y-4" },
                    eventDraft && h(Fragment,null,
                        h("label",{className:"block text-sm"},"配信日",h("input",{className:inputClass,type:"date",value:eventDraft.event_date,onChange:e=>{const d=e.target.value;setEventDraft(v=>({...v,event_date:d}));setForm(v=>({...v,actual_start_at:v.actual_start_at&&d?d+"T"+localDateTime(v.actual_start_at).slice(11):v.actual_start_at}));}})),
                        h("label",{className:"block text-sm"},"種類",h("select",{className:inputClass,value:eventDraft.category_id,onChange:e=>setEventDraft(v=>({...v,category_id:e.target.value}))},types.filter(isStreamType).map(t=>h("option",{key:t.id,value:t.id},t.name)))),
                        h("label",{className:"block text-sm"},"YouTubeタイトル",h("input",{className:inputClass,value:eventDraft.title,onChange:e=>setEventDraft(v=>({...v,title:e.target.value}))}))),
                    videoId && h("div", { className: "flex flex-wrap gap-2" },
                        h("a", { className: buttonClass, href: `https://www.youtube.com/watch?v=${videoId}`, target: "_blank", rel: "noopener noreferrer" }, "YouTube\u3067\u958B\u304F"),
                        h("a", { className: buttonClass, href: `https://studio.youtube.com/video/${videoId}/edit`, target: "_blank", rel: "noopener noreferrer" }, "YouTube Studio")),
                    h("label", { className: "block text-sm" },
                        "YouTube URL ",
                        h("span", { className: "font-bold text-red-600", "aria-label": "\u60C5\u5831\u53D6\u5F97\u5BFE\u8C61" }, "*"),
                        h("input", { className: inputClass, type: "url", placeholder: "https://www.youtube.com/watch?v=...", value: form.youtube_url ?? "", onChange: e => setForm(v => v && ({ ...v, youtube_url: e.target.value })) })),
                    h("button", { type: "button", className: buttonClass, disabled: !videoId || fetchingYoutube || busy, onClick: () => void fetchYoutube() }, fetchingYoutube ? "取得中" : "情報を取得・再取得"),
                    youtubeMessage && h("p", { className: "text-sm text-gray-600" }, youtubeMessage),
                    form.youtube_thumbnail && h("img", { src: form.youtube_thumbnail, alt: "YouTube\u30B5\u30E0\u30CD\u30A4\u30EB", className: "w-full max-w-sm rounded-lg", referrerPolicy: "no-referrer" }),
                    h("label",{className:"block text-sm"},"開始日時",h("input",{className:inputClass,type:"datetime-local",value:eventDraft?.start_time ? eventDraft.event_date+"T"+eventDraft.start_time : "",onChange:e=>{const value=e.target.value;setEventDraft(v=>({...v,event_date:value?value.slice(0,10):v.event_date,start_time:value.slice(11)}));setForm(v=>({...v,actual_start_at:v.status!=="scheduled"?value:v.actual_start_at,youtube_scheduled_at:v.status==="scheduled"?(value?new Date(value).toISOString():null):v.youtube_scheduled_at}));}})),
                    h("label",{className:"block text-sm"},"終了日時",h("input",{className:inputClass,type:"datetime-local",value:localDateTime(form.actual_end_at),onChange:e=>setForm(v=>({...v,actual_end_at:e.target.value,status:e.target.value?"completed":v.actual_start_at?"live":"scheduled"}))})),
                    h("div", { className: "grid gap-4 grid-cols-2" },
                        h("label", { className: "block text-sm" },
                            "\u72B6\u614B",
                            h("select", { className: inputClass, value: form.actual_end_at ? "completed" : form.status, onChange: e => setForm(v => v && ({ ...v, status: e.target.value })) },
                                h("option", { value: "scheduled" }, "\u4E88\u5B9A"),
                                h("option", { value: "live" }, "\u914D\u4FE1\u4E2D"),
                                h("option", { value: "completed" }, "\u7D42\u4E86"))),
                        h("label", { className: "block text-sm" },
                            "\u914D\u4FE1\u6642\u9593\uFF08\u5206\uFF09",
                            h("input", { className: inputClass, type: "number", min: "0", value: form.duration_minutes ?? "", onChange: e => setForm(v => v && ({ ...v, duration_minutes: e.target.value === "" ? null : Number(e.target.value) })) }))),
                    h("label", { className: "block text-sm" },
                        "\u30B2\u30FC\u30E0",
                        h("select", { className: inputClass, value: form.game_id ?? "", onChange: e => setForm(v => v && ({ ...v, game_id: e.target.value })) },
                            h("option", { value: "" }, "\u9078\u629E\u306A\u3057"),
                            catalog.games.map(g => h("option", { key: g.id, value: g.id }, g.name + (g.status === "played" ? "（プレイ済み）" : "（チェック）"))),
                            form.game_id && !catalog.games.some(g => g.id === form.game_id) && h("option", { value: form.game_id }, "登録済みゲーム（読み込み中）"))),
                    h("div", { className: "flex flex-wrap gap-2" },
                        h("input", { className: inputClass + " !mt-0 min-w-0 flex-1", "aria-label": "\u65B0\u3057\u3044\u30B2\u30FC\u30E0\u540D", placeholder: "\u65B0\u3057\u3044\u30B2\u30FC\u30E0\u3092\u767B\u9332", value: newGameName, onChange: e => setNewGameName(e.target.value) }),
                        h("button", { type: "button", className: buttonClass, disabled: !!addingCatalog || busy || !newGameName.trim(), onClick: () => void addCatalogInline("game") }, "\u30B2\u30FC\u30E0\u3092\u767B\u9332")),
                    h("div", { className: "space-y-2" },
                        h("span", { className: "block text-sm" }, "\u30B3\u30E9\u30DC\u76F8\u624B"),
                        peopleDraft.map((person, i) => h("div", { key: i, className: "flex items-center gap-2" },
                            h("select", { "aria-label": `コラボ相手${i + 1}`, className: inputClass + " !mt-0 min-w-0 flex-1", value: person, onChange: e => setPeopleDraft(old => old.map((v, j) => i === j ? e.target.value : v)) },
                                h("option", { value: "" }, "\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044"),
                                catalog.people.map(p => h("option", { key: p.id, value: p.name }, p.name)),
                                person && !catalog.people.some(p => p.name === person) && h("option", { value: person },
                                    person,
                                    "\uFF08\u65E7\u30C7\u30FC\u30BF\uFF09")),
                            h("button", { type: "button", className: buttonClass, onClick: () => setPeopleDraft(old => old.filter((_, j) => i !== j)) }, "\u524A\u9664"))),
                        h("button", { type: "button", className: buttonClass, onClick: () => setPeopleDraft(old => [...old, ""]) }, "\u76F8\u624B\u3092\u8FFD\u52A0"),
                        h("div", { className: "flex flex-wrap gap-2" },
                            h("input", { className: inputClass + " !mt-0 min-w-0 flex-1", "aria-label": "\u65B0\u3057\u3044\u30B3\u30E9\u30DC\u76F8\u624B\u540D", placeholder: "\u65B0\u3057\u3044\u30B3\u30E9\u30DC\u76F8\u624B\u3092\u767B\u9332", value: newPersonName, onChange: e => setNewPersonName(e.target.value) }),
                            h("button", { type: "button", className: buttonClass, disabled: !!addingCatalog || busy || !newPersonName.trim(), onClick: () => void addCatalogInline("person") }, "\u30B3\u30E9\u30DC\u76F8\u624B\u3092\u767B\u9332"))),
                    h("label", { className: "block text-sm" },
                        "\u5099\u8003",
                        h("textarea", { className: inputClass, rows: 4, value: eventDraft?.notes ?? "", onChange: e => setEventDraft(v => v && ({ ...v, notes: e.target.value })) }))),
                h("div", { className: "mt-5 flex flex-wrap items-center gap-3" },
                    h("button", { className: "rounded-lg bg-[#252525] px-5 py-2 text-sm text-white disabled:opacity-40", disabled: busy || fetchingYoutube, onClick: () => void save() }, busy ? "保存中" : "保存"),
                    h("button", { className: "ml-auto rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700 disabled:opacity-40", disabled: busy, onClick: () => void deleteStream() }, "\u914D\u4FE1\u3092\u524A\u9664"),
                    error && h("p", { role: "alert", className: "text-sm text-red-700" }, error)),
                h("div", { className: "mt-8 border-t pt-6" },
                    h("h4", { className: "mb-4 font-semibold" }, "\u5207\u308A\u629C\u304D\u30E1\u30E2"),
                    h("div", { className: "flex flex-wrap items-end gap-2 sm:flex-nowrap" },
                        h("label", { className: "w-28 shrink-0 text-sm" },
                            "\u30BF\u30A4\u30E0\u30B9\u30BF\u30F3\u30D7",
                            h("input", { className: inputClass, placeholder: "\u4F8B\uFF1A123", inputMode: "numeric", value: clipTime, onChange: e => setClipTime(formatClipTimeInput(e.target.value)) })),
                        h("label", { className: "min-w-0 flex-1 text-sm" },
                            "\u5185\u5BB9",
                            h("input", { className: inputClass, value: clipNote, onChange: e => setClipNote(e.target.value) })),
                        h("button", { className: buttonClass, disabled: busy || !clipTime.trim(), onClick: () => void addClip() }, "\u8FFD\u52A0")),
                    clipError && h("p", { role: "alert", className: "mt-2 text-sm text-red-700" }, clipError),
                    h("div", { className: "mt-4 space-y-2" }, clipsLoading ? h("p", { className: "text-sm text-gray-500" }, "\u8AAD\u307F\u8FBC\u307F\u4E2D") :
                        [...clips].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds || a.id.localeCompare(b.id)).map(c => h("div", { key: c.id, className: "rounded-lg border p-2 text-sm" }, editingClipId === c.id ?
                            h("div", { className: "flex flex-wrap items-center gap-2 sm:flex-nowrap" },
                                h("input", { "aria-label": "\u7DE8\u96C6\u3059\u308B\u30BF\u30A4\u30E0\u30B9\u30BF\u30F3\u30D7", className: inputClass + " !mt-0 w-28 shrink-0", inputMode: "numeric", value: editClipTime, onChange: e => setEditClipTime(formatClipTimeInput(e.target.value)) }),
                                h("input", { "aria-label": "\u7DE8\u96C6\u3059\u308B\u5185\u5BB9", className: inputClass + " !mt-0 min-w-0 flex-1", value: editClipNote, onChange: e => setEditClipNote(e.target.value) }),
                                h("button", { className: buttonClass, disabled: busy || !editClipTime.trim(), onClick: () => void saveEditedClip() }, "\u4FDD\u5B58"),
                                h("button", { className: buttonClass, disabled: busy, onClick: () => setEditingClipId(null) }, "\u53D6\u6D88")) :
                            h("div", { className: "flex items-center gap-2" },
                                h("span", { className: "w-20 shrink-0 font-mono text-gray-600" }, timestampLabel(c.timestamp_seconds)),
                                h("span", { className: "min-w-0 flex-1 whitespace-pre-wrap break-words" }, c.note),
                                videoId && h("a", { className: "shrink-0 text-xs underline", target: "_blank", rel: "noopener noreferrer", href: `https://www.youtube.com/watch?v=${videoId}&t=${c.timestamp_seconds}s` }, "\u518D\u751F"),
                                h("button", { className: "shrink-0 text-xs underline", disabled: busy, onClick: () => startEditClip(c) }, "\u7DE8\u96C6"),
                                h("button", { className: "shrink-0 text-xs text-red-700", disabled: busy, onClick: () => void deleteClip(c.id) }, "\u524A\u9664"))))))) : h("h3", { className: "font-semibold" }, "\u914D\u4FE1\u3092\u9078\u629E"))));
}
