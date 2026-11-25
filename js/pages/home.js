import { h, Fragment, useCallback, useEffect, useMemo, useState, useRouter } from "../core/runtime.js";
import { SUPABASE_URL, SUPABASE_KEY, isAuthorizedAdmin, supabase } from "../core/supabase.js";
import { MIN_MONTH, pad, dateString, monthIndex, colors, colorNames, isFixedType, displayEventTitle, isStreamType, formatDuration, inputClass, buttonClass } from "../shared/activity-utils.js";
export default function Home({ data, openStream }) {
    const { types, events, streams, load } = data;
    const [month, setMonth] = useState(() => Math.max(MIN_MONTH, monthIndex(new Date())));
    const [draft, setDraft] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const year = Math.floor(month / 12);
    const monthNumber = month % 12;
    const currentPrefix = `${year}-${pad(monthNumber + 1)}`;
    const monthly = events.filter(e => e.event_date.startsWith(currentPrefix));
    const streamMap = useMemo(() => new Map(streams.map(s => [s.calendar_event_id, s])), [streams]);
    const eventMap = useMemo(() => { const m = new Map(); for (const e of monthly)
        m.set(e.event_date, [...(m.get(e.event_date) ?? []), e]); return m; }, [monthly]);
    const typeMap = useMemo(() => new Map(types.map(t => [t.id, t])), [types]);
    const completed = monthly.flatMap(e => { const s = streamMap.get(e.id); return s?.status === "completed" ? [{ event: e, stream: s }] : []; });
    const streamDays = new Set(completed.map(x => x.event.event_date)).size;
    const totalMinutes = completed.reduce((n, x) => n + (x.stream.duration_minutes ?? 0), 0);
    const firstWeekday = new Date(year, monthNumber, 1).getDay();
    const days = new Date(year, monthNumber + 1, 0).getDate();
    const cells = Math.ceil((firstWeekday + days) / 7) * 7;
    const defaultType = types.find(t => t.system_key === "stream")?.id ?? types[0]?.id ?? "";
    const newDraft = (date) => ({ event_date: date, title: "", category_id: defaultType, start_time: "", notes: "" });
    function edit(e) { setDraft({ id: e.id, event_date: e.event_date, title: e.title, category_id: e.category_id, start_time: e.start_time?.slice(0, 5) ?? "", notes: e.notes ?? "" }); }
    async function save() {
        if (!supabase || !draft || busy)
            return;
        if (!draft.category_id || draft.event_date < "2026-10-01") {
            setError("入力内容を確認してください。");
            return;
        }
        setBusy(true);
        setError("");
        const payload = { event_date: draft.event_date, title: draft.title.trim(), category_id: draft.category_id, start_time: draft.start_time || null, notes: draft.notes.trim() || null };
        const result = draft.id
            ? await supabase.from("personal_calendar_events").update(payload).eq("id", draft.id).select("id").single()
            : await supabase.from("personal_calendar_events").insert(payload).select("id").single();
        if (result.error || !result.data) {
            setError(result.error?.message ?? "保存できませんでした。");
            setBusy(false);
            return;
        }
        const id = result.data.id;
        const stream = streamMap.get(id);
        const shouldHaveStream = isStreamType(typeMap.get(draft.category_id));
        if (shouldHaveStream && !stream) {
            const r = await supabase.from("personal_streams").insert({ calendar_event_id: id });
            if (r.error)
                setError(`予定は保存されましたが、配信管理との連携に失敗しました: ${r.error.message}`);
        }
        else if (!shouldHaveStream && stream) {
            // 配信記録がある場合は誤消去を避けるため種類変更を取り消す
            await supabase.from("personal_calendar_events").update({ category_id: types.find(t => t.system_key === "stream")?.id ?? draft.category_id }).eq("id", id);
            setError("配信管理に登録済みの予定は、配信以外の種類へ変更できません。");
        }
        setBusy(false);
        setDraft(null);
        await load();
    }
    async function remove() {
        if (!supabase || !draft?.id || busy || !window.confirm("この予定と紐づく配信情報を削除しますか？"))
            return;
        setBusy(true);
        const r = await supabase.from("personal_calendar_events").delete().eq("id", draft.id);
        setBusy(false);
        if (r.error) {
            setError(r.error.message);
            return;
        }
        setDraft(null);
        await load();
    }
    return h("section", { className: "space-y-6" },
        h("div", { className: "month-navigation home-month-navigation" },
            h("strong", { className: "text-lg" }, `${year}年${monthNumber + 1}月`),
            h("div", { className: "month-buttons" },
                h("button", { className: buttonClass, disabled: month <= MIN_MONTH, onClick: () => setMonth(v => v - 1) }, "前月"),
                h("button", { className: buttonClass, onClick: () => setMonth(v => v + 1) }, "翌月"))),
        h("div", { className: "home-summary-grid grid gap-4 sm:grid-cols-3" }, [["総配信時間", formatDuration(totalMinutes)], ["配信日数", `${streamDays}日`], ["配信回数", `${completed.length}回`]].map(([label, value]) => h("div", { key: label, className: "rounded-xl border border-gray-200 bg-white p-6" },
            h("p", { className: "text-sm text-gray-500" }, label),
            h("p", { className: "mt-5 text-2xl font-semibold" }, value)))),
        h("div", { className: "overflow-hidden rounded-xl border border-gray-200 bg-white" },
            h("div", { className: "flex items-center justify-between border-b border-gray-200 p-4" },
                h("h3", { className: "font-semibold" }, "\u30AB\u30EC\u30F3\u30C0\u30FC"),
                h("button", { className: "rounded-lg bg-[#252525] px-4 py-2 text-sm text-white", onClick: () => setDraft(newDraft(dateString(year, monthNumber, 1))) }, "\u4E88\u5B9A\u3092\u8FFD\u52A0")),
            h("div", { className: "grid grid-cols-7 bg-gray-50 text-center text-xs text-gray-500" }, ["日", "月", "火", "水", "木", "金", "土"].map(d => h("div", { key: d, className: "border-b py-3" }, d))),
            h("div", { className: "grid grid-cols-7" }, Array.from({ length: cells }, (_, i) => {
                const d = i - firstWeekday + 1, valid = d > 0 && d <= days;
                const date = valid ? dateString(year, monthNumber, d) : "";
                return h("div", { key: i, className: `relative min-h-24 border-b border-r border-gray-100 sm:min-h-32 ${valid ? "bg-white hover:bg-gray-50" : "bg-gray-50"}` }, valid && h(Fragment, null,
                    h("button", { type: "button", "aria-label": `${date}の予定`, onClick: () => { setDraft(newDraft(date)); }, className: "absolute inset-0 z-0 w-full cursor-pointer" }),
                    h("div", { className: "pointer-events-none relative z-10 p-2 text-xs" }, d),
                    h("div", { className: "relative z-10 space-y-1 px-1 pb-2" }, (eventMap.get(date) ?? []).map(e => h("button", { key: e.id, onClick: () => edit(e), className: `block w-full truncate rounded px-1 py-1 text-left text-[10px] sm:text-xs ${colors[typeMap.get(e.category_id)?.color ?? "gray"]}`, title: displayEventTitle(e, typeMap.get(e.category_id)) },
                        e.start_time?.slice(0, 5),
                        " ",
                        displayEventTitle(e, typeMap.get(e.category_id)))))));
            }))),
        data.loading && h("p", { className: "text-sm" }, "\u8AAD\u307F\u8FBC\u307F\u4E2D..."),
        (data.error || error) && h("p", { role: "alert", className: "text-sm text-red-700" }, error || data.error),
        draft && h("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4", onMouseDown: e => { if (e.target === e.currentTarget && !busy)
                setDraft(null); } },
            h("div", { role: "dialog", "aria-modal": "true", "aria-labelledby": "event-title", className: "max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl" },
                h("h3", { id: "event-title", className: "mb-5 font-semibold" }, draft.id ? "予定を編集" : "予定を追加"),
                h("div", { className: "space-y-4" },
                    h("label", { className: "block text-sm" },
                        "\u65E5\u4ED8",
                        h("input", { className: inputClass, type: "date", min: "2026-10-01", value: draft.event_date, onChange: e => setDraft(v => v && ({ ...v, event_date: e.target.value })) })),
                    h("label", { className: "block text-sm" },
                        "\u4E88\u5B9A\u540D\uFF08\u4EFB\u610F\uFF09",
                        h("input", { className: inputClass, maxLength: 120, value: draft.title, onChange: e => setDraft(v => v && ({ ...v, title: e.target.value })) })),
                    h("label", { className: "block text-sm" },
                        "\u7A2E\u985E",
                        h("select", { className: inputClass, value: draft.category_id, onChange: e => setDraft(v => v && ({ ...v, category_id: e.target.value })) }, types.map(t => h("option", { key: t.id, value: t.id }, t.name)))),
                    h("label", { className: "block text-sm" },
                        "\u958B\u59CB\u6642\u523B",
                        h("input", { className: inputClass, type: "time", value: draft.start_time, onChange: e => setDraft(v => v && ({ ...v, start_time: e.target.value })) })),
                    h("label", { className: "block text-sm" },
                        "\u30E1\u30E2",
                        h("textarea", { className: inputClass, rows: 3, maxLength: 2000, value: draft.notes, onChange: e => setDraft(v => v && ({ ...v, notes: e.target.value })) }))),
                h("div", { className: "mt-6 flex flex-wrap gap-2" },
                    h("button", { disabled: busy, className: "rounded-lg bg-[#252525] px-5 py-2 text-sm text-white disabled:opacity-40", onClick: () => void save() }, "\u4FDD\u5B58"),
                    h("button", { className: buttonClass, disabled: busy, onClick: () => setDraft(null) }, "\u30AD\u30E3\u30F3\u30BB\u30EB"),
                    draft.id && isStreamType(typeMap.get(draft.category_id)) && h("button", { className: buttonClass, onClick: () => { const id = draft.id; setDraft(null); openStream(id); } }, "\u914D\u4FE1\u7BA1\u7406\u3067\u958B\u304F"),
                    draft.id && h("button", { className: "ml-auto rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700", disabled: busy, onClick: () => void remove() }, "\u524A\u9664")))));
}
