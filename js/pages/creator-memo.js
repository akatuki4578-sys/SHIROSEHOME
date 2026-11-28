"use client";
import { h, Fragment, useCallback, useEffect, useMemo, useState } from "../core/runtime.js";
import { supabase } from "../core/supabase.js";
const input = "mt-1 w-full rounded-lg border border-gray-300 bg-white p-2 text-sm";
const btn = "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-40";
const primary = "rounded-lg bg-[#252525] px-4 py-2 text-sm text-white disabled:opacity-40";
const defaultAreas = ["イラスト", "Live2D", "動画編集", "デザイン", "音楽", "その他"];
const statuses = ["見積待ち", "依頼中", "納品済み"];
const progressGroup = s => ["相談中", "見積待ち"].includes(s) ? "見積待ち" : ["制作中", "確認中"].includes(s) ? "依頼中" : s;
const progressLabel = s => progressGroup(s) === "見積待ち" ? "見積中" : progressGroup(s);
const payments = ["未払い", "一部支払い", "支払い済み"];
// SNSのプロフィール画像は外部サービス経由で取得します。取得できない場合は頭文字を表示します。
function socialAvatar(contacts) {
    const candidates = contacts.map(c => {
        try {
            const url = new URL(c.value);
            const host = url.hostname.toLowerCase().replace(/^www\./, "");
            const segments = url.pathname.split("/").filter(Boolean);
            const user = segments[0]?.replace(/^@/, "");
            if (!user || !/^[a-zA-Z0-9_.-]+$/.test(user))
                return null;
            if (host === "x.com" || host === "twitter.com")
                return { priority: 0, src: `https://unavatar.io/twitter/${encodeURIComponent(user)}`, href: url.href };
            if (host === "instagram.com")
                return { priority: 1, src: `https://unavatar.io/instagram/${encodeURIComponent(user)}`, href: url.href };
            if (host === "github.com")
                return { priority: 2, src: `https://unavatar.io/github/${encodeURIComponent(user)}`, href: url.href };
            return null;
        }
        catch {
            return null;
        }
    }).filter((x) => x !== null);
    return candidates.sort((a, b) => a.priority - b.priority)[0] || null;
}
function CreatorAvatar({ creator, compact = false }) {
    const avatar = socialAvatar(creator.contacts);
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [avatar?.src]);
    const fallback = h("span", { className: `${compact ? "text-xl" : "text-3xl"} font-semibold text-gray-500`, "aria-hidden": "true" }, creator.name.trim().slice(0, 1) || "?");
    const content = h("span", { className: `flex ${compact ? "h-16 w-16" : "h-28 w-28"} shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50` }, avatar && !failed ? h("img", { src: avatar.src, alt: `${creator.name}のSNSアイコン`, className: "h-full w-full object-cover", referrerPolicy: "no-referrer", onError: () => setFailed(true) }) : fallback);
    return compact ? content : avatar ? h("a", { href: avatar.href, target: "_blank", rel: "noopener noreferrer", title: "SNS\u30D7\u30ED\u30D5\u30A3\u30FC\u30EB\u3092\u958B\u304F", className: "shrink-0" }, content) : content;
}
const blankCreator = () => ({ id: "", name: "", fields: [], contacts: [], rate_note: "", memo: "", favorite: false, drive_folder_url: "" });
const blankRequest = (creator_id = "") => ({ id: "", creator_id, title: "", description: "", requested_on: null, due_on: null, estimated_amount: null, agreed_amount: null, paid_amount: null, progress: "見積待ち", payment_status: "未払い", delivery_url: "", memo: "", paid_on: null, request_page_url: null });
const amount = (v) => v === null ? "—" : `${v.toLocaleString("ja-JP")}円`;
const numeric = (v) => v === "" ? null : Number(v);
const yen = (n) => `${n.toLocaleString("ja-JP")}円`;
function RequestDetails({ requestId, creatorFolder, editing, onTotalChange, }) {
    const [items, setItems] = useState([]);
    const [schedules, setSchedules] = useState([]);
    const [assets, setAssets] = useState([]);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [newItem, setNewItem] = useState({ name: "", amount: "", note: "" });
    const [editingItem, setEditingItem] = useState(null);
    const [itemDraft, setItemDraft] = useState({ name: "", amount: "", note: "" });
    const [newSchedule, setNewSchedule] = useState({ title: "", due_on: "", status: "予定" });
    const [newAsset, setNewAsset] = useState({ name: "", kind: "folder", url: "", note: "" });
    const load = useCallback(async () => {
        if (!supabase || !requestId)
            return;
        const [a, b, c] = await Promise.all([
            supabase.from("personal_creator_request_items").select("*").eq("request_id", requestId).order("sort_order"),
            supabase.from("personal_creator_request_schedule").select("*").eq("request_id", requestId).order("sort_order"),
            supabase.from("personal_creator_request_assets").select("*").eq("request_id", requestId).order("sort_order")
        ]);
        if (a.error || b.error || c.error)
            setError([a.error?.message, b.error?.message, c.error?.message].filter(Boolean).join(" / "));
        else {
            const rows = (a.data || []);
            setItems(rows);
            onTotalChange(rows.reduce((sum, x) => sum + x.amount, 0));
            setSchedules((b.data || []));
            setAssets((c.data || []));
            setError("");
        }
    }, [requestId, onTotalChange]);
    useEffect(() => { void load(); }, [load]);
    async function syncTotal() {
        if (!supabase || !requestId)
            return;
        const { data, error: e } = await supabase.from("personal_creator_request_items").select("amount").eq("request_id", requestId);
        if (e) {
            setError(e.message);
            return;
        }
        const total = (data || []).reduce((sum, x) => sum + Number(x.amount), 0);
        onTotalChange(total);
        const result = await supabase.from("personal_creator_requests").update({ paid_amount: total }).eq("id", requestId);
        if (result.error)
            setError(result.error.message);
    }
    async function insert(table, values) {
        if (!supabase || busy || !requestId)
            return false;
        setBusy(true);
        setError("");
        const { error: e } = await supabase.from(table).insert({ request_id: requestId, ...values });
        setBusy(false);
        if (e) {
            setError(e.message);
            return false;
        }
        await load();
        if (table === "personal_creator_request_items")
            await syncTotal();
        return true;
    }
    async function update(table, id, values) {
        if (!supabase || busy)
            return;
        setBusy(true);
        setError("");
        const { error: e } = await supabase.from(table).update(values).eq("id", id).eq("request_id", requestId);
        setBusy(false);
        if (e)
            setError(e.message);
        else {
            await load();
            if (table === "personal_creator_request_items")
                await syncTotal();
        }
    }
    async function remove(table, id) {
        if (!supabase || busy || !window.confirm("この項目を削除しますか？"))
            return;
        setBusy(true);
        setError("");
        const { error: e } = await supabase.from(table).delete().eq("id", id).eq("request_id", requestId);
        setBusy(false);
        if (e)
            setError(e.message);
        else {
            await load();
            if (table === "personal_creator_request_items")
                await syncTotal();
        }
    }
    if (!requestId)
        return h("p", { className: "text-sm text-gray-500" }, "\u6599\u91D1\u5185\u8A33\u30FB\u7D0D\u54C1\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB\u30FB\u4F5C\u54C1\u30EA\u30F3\u30AF\u306F\u3001\u4F9D\u983C\u3092\u4FDD\u5B58\u3057\u305F\u3042\u3068\u306B\u767B\u9332\u3067\u304D\u307E\u3059\u3002");
    const itemTable = "personal_creator_request_items", scheduleTable = "personal_creator_request_schedule", assetTable = "personal_creator_request_assets";
    return h("div", { className: "space-y-6" },
        h("div", { className: "space-y-3 rounded-lg border border-gray-200 p-4" },
            h("h4", { className: "font-semibold" }, "\u6599\u91D1\u5185\u8A33"),
            h("div", { className: "space-y-2" }, items.map(x => h("div", { key: x.id, className: "text-sm" }, editing && editingItem === x.id ? h("div", { className: "flex flex-wrap items-center gap-2" },
                h("input", { style: { flex: "1 1 100px", width: "auto" }, "aria-label": "\u5546\u54C1\u540D", className: input + " !mt-0 min-w-0", value: itemDraft.name, onChange: e => setItemDraft(v => ({ ...v, name: e.target.value })) }),
                h("input", { style: { flex: "1 1 100px", width: "auto" }, "aria-label": "\u91D1\u984D", className: input + " !mt-0 min-w-0", type: "number", step: "1", value: itemDraft.amount, onChange: e => setItemDraft(v => ({ ...v, amount: e.target.value })) }),
                h("input", { style: { flex: "1 1 100px", width: "auto" }, "aria-label": "\u5099\u8003", className: input + " !mt-0 min-w-0", value: itemDraft.note, onChange: e => setItemDraft(v => ({ ...v, note: e.target.value })) }),
                h("span", { className: "flex gap-1" },
                    h("button", { className: btn, disabled: busy || !itemDraft.name.trim() || !/^[-]?\d+$/.test(itemDraft.amount) || !Number.isSafeInteger(Number(itemDraft.amount)), onClick: async () => { await update(itemTable, x.id, { name: itemDraft.name.trim(), amount: Number(itemDraft.amount), note: itemDraft.note }); setEditingItem(null); } }, "\u4FDD\u5B58"),
                    h("button", { className: btn, onClick: () => setEditingItem(null) }, "\u53D6\u6D88"))) : h(Fragment, null,
                h("div", { className: "flex items-center gap-2" },
                    h("span", { className: "min-w-0 break-words flex-1" }, x.name),
                    h("span", { className: "text-right shrink-0" }, yen(x.amount))),
                x.note && h("div", { className: "text-xs text-gray-600 break-words" }, x.note),
                editing ? h("span", { className: "flex gap-1", style: { justifyContent: "flex-end" } },
                    h("button", { className: btn, disabled: busy, onClick: () => { setEditingItem(x.id); setItemDraft({ name: x.name, amount: String(x.amount), note: x.note }); } }, "\u7DE8\u96C6"),
                    h("button", { className: btn, disabled: busy, onClick: () => void remove(itemTable, x.id) }, "\u524A\u9664")) : h("span", null))))),
            editing && h("div", { className: "flex flex-wrap items-end gap-2" },
                h("label", { className: "min-w-32 flex-[2] text-xs" },
                    "\u5546\u54C1\u540D",
                    h("input", { className: input, value: newItem.name, onChange: e => setNewItem(v => ({ ...v, name: e.target.value })) })),
                h("label", { className: "w-28 text-xs" },
                    "\u91D1\u984D",
                    h("input", { className: input, type: "number", step: "1", value: newItem.amount, onChange: e => setNewItem(v => ({ ...v, amount: e.target.value })) })),
                h("label", { className: "min-w-32 flex-[2] text-xs" },
                    "\u5099\u8003",
                    h("input", { className: input, value: newItem.note, onChange: e => setNewItem(v => ({ ...v, note: e.target.value })) })),
                h("button", { className: btn, disabled: busy || !newItem.name.trim() || !/^[-]?\d+$/.test(newItem.amount) || !Number.isSafeInteger(Number(newItem.amount)), onClick: async () => { if (await insert(itemTable, { name: newItem.name.trim(), amount: Number(newItem.amount), note: newItem.note, sort_order: items.length * 10 }))
                        setNewItem({ name: "", amount: "", note: "" }); } }, "\u8FFD\u52A0")),
            h("div", { className: "flex items-center justify-between gap-3 pt-3 text-sm" },
                h("div", null,
                    h("span", { className: "font-semibold" }, "\u652F\u6255\u91D1\u984D\uFF1A"),
                    h("strong", null, yen(items.reduce((sum, x) => sum + x.amount, 0))),
                    h("p", { className: "mt-1 text-xs text-gray-500" }, "\u6599\u91D1\u5185\u8A33\u304B\u3089\u81EA\u52D5\u8A08\u7B97")))),
        h("div", { className: "space-y-3 rounded-lg border border-gray-200 p-4" },
            h("h4", { className: "font-semibold" }, "\u7D0D\u54C1\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB"),
            schedules.map(x => h("div", { key: x.id, className: "flex flex-wrap items-center gap-3 text-sm" },
                h("span", { className: "min-w-0 flex-[2]" }, x.title),
                h("span", { className: "w-28" }, x.due_on || "日付未定"),
                h("span", { className: "w-20" }, x.status),
                editing && h(Fragment, null,
                    h("button", { className: btn, disabled: busy, onClick: () => { const title = window.prompt("納品内容", x.title); if (title === null || !title.trim())
                            return; const due_on = window.prompt("日付（YYYY-MM-DD、空欄可）", x.due_on || ""); if (due_on === null || due_on !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(due_on)) {
                            setError("日付を確認してください。");
                            return;
                        } const status = window.prompt("状態（予定・進行中・納品済み）", x.status); if (status === null || !["予定", "進行中", "納品済み"].includes(status)) {
                            setError("状態を確認してください。");
                            return;
                        } void update(scheduleTable, x.id, { title: title.trim(), due_on: due_on || null, status }); } }, "\u7DE8\u96C6"),
                    h("button", { className: btn, disabled: busy, onClick: () => void remove(scheduleTable, x.id) }, "\u524A\u9664")))),
            editing && h("div", { className: "flex flex-wrap items-end gap-2" },
                h("label", { className: "min-w-36 flex-[2] text-xs" },
                    "\u7D0D\u54C1\u5185\u5BB9",
                    h("input", { className: input, value: newSchedule.title, onChange: e => setNewSchedule(v => ({ ...v, title: e.target.value })) })),
                h("label", { className: "w-36 text-xs" },
                    "\u65E5\u4ED8",
                    h("input", { className: input, type: "date", value: newSchedule.due_on, onChange: e => setNewSchedule(v => ({ ...v, due_on: e.target.value })) })),
                h("label", { className: "w-28 text-xs" },
                    "\u72B6\u614B",
                    h("select", { className: input, value: newSchedule.status, onChange: e => setNewSchedule(v => ({ ...v, status: e.target.value })) }, ["予定", "進行中", "納品済み"].map(x => h("option", { key: x }, x)))),
                h("button", { className: btn, disabled: busy || !newSchedule.title.trim(), onClick: async () => { if (await insert(scheduleTable, { title: newSchedule.title.trim(), due_on: newSchedule.due_on || null, status: newSchedule.status, note: "", sort_order: schedules.length * 10 }))
                        setNewSchedule({ title: "", due_on: "", status: "予定" }); } }, "\u8FFD\u52A0"))),
        h("div", { className: "space-y-3 rounded-lg border border-gray-200 p-4" },
            h("h4", { className: "font-semibold" }, "\u4F9D\u983C\u4F5C\u54C1\u30FBGoogle Drive"),
            creatorFolder && h("a", { href: creatorFolder, target: "_blank", rel: "noopener noreferrer", className: "inline-block text-sm underline" }, "\u30AF\u30EA\u30A8\u30A4\u30BF\u30FC\u306EGoogle Drive\u30D5\u30A9\u30EB\u30C0\u30FC\u3092\u958B\u304F"),
            assets.map(x => h("div", { key: x.id, className: "flex flex-wrap items-center gap-2 text-sm" },
                h("span", { className: "min-w-24 flex-1 break-words" }, x.name),
                h("span", { className: "w-24" }, x.kind === "folder" ? "フォルダー" : "ファイル"),
                h("a", { className: "min-w-24 flex-[2] break-all underline", href: x.url, target: "_blank", rel: "noopener noreferrer" }, x.url),
                h("span", { className: "min-w-16 flex-1 break-words" }, x.note || "—"),
                editing && h(Fragment, null,
                    h("button", { className: btn, disabled: busy, onClick: () => { const name = window.prompt("作品名", x.name); if (name === null || !name.trim())
                            return; const kind = window.prompt("種類（folder / file）", x.kind); if (kind !== "folder" && kind !== "file")
                            return; const url = window.prompt("Google Drive URL", x.url); if (url === null || !validDriveUrl(url)) {
                            setError("Google DriveのURLを確認してください。");
                            return;
                        } const note = window.prompt("メモ", x.note); if (note === null)
                            return; void update(assetTable, x.id, { name: name.trim(), kind, url: url.trim(), note }); } }, "\u7DE8\u96C6"),
                    h("button", { className: btn, disabled: busy, onClick: () => void remove(assetTable, x.id) }, "\u524A\u9664")))),
            editing && h("div", { className: "flex flex-wrap items-end gap-2" },
                h("label", { className: "min-w-24 flex-1 text-xs" },
                    "\u4F5C\u54C1\u540D",
                    h("input", { className: input, value: newAsset.name, onChange: e => setNewAsset(v => ({ ...v, name: e.target.value })) })),
                h("label", { className: "w-28 text-xs" },
                    "\u7A2E\u985E",
                    h("select", { className: input, value: newAsset.kind, onChange: e => setNewAsset(v => ({ ...v, kind: e.target.value })) },
                        h("option", { value: "folder" }, "\u30D5\u30A9\u30EB\u30C0\u30FC"),
                        h("option", { value: "file" }, "\u30D5\u30A1\u30A4\u30EB"))),
                h("label", { className: "min-w-32 flex-[2] text-xs" },
                    "URL",
                    h("input", { className: input, type: "url", value: newAsset.url, onChange: e => setNewAsset(v => ({ ...v, url: e.target.value })) })),
                h("label", { className: "min-w-24 flex-1 text-xs" },
                    "\u30E1\u30E2",
                    h("input", { className: input, value: newAsset.note, onChange: e => setNewAsset(v => ({ ...v, note: e.target.value })) })),
                h("button", { className: btn, disabled: busy || !newAsset.name.trim() || !validDriveUrl(newAsset.url), onClick: async () => { if (await insert(assetTable, { name: newAsset.name.trim(), kind: newAsset.kind, url: newAsset.url.trim(), note: newAsset.note, sort_order: assets.length * 10 }))
                        setNewAsset({ name: "", kind: "folder", url: "", note: "" }); } }, "\u8FFD\u52A0"))),
        error && h("p", { role: "alert", className: "text-sm text-red-700" }, error));
}
function validDriveUrl(value) { try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "drive.google.com" || url.hostname === "docs.google.com");
}
catch {
    return false;
} }
export default function CreatorMemo() {
    const [tab, setTab] = useState("creators");
    const [creators, setCreators] = useState([]);
    const [requests, setRequests] = useState([]);
    const [areas, setAreas] = useState(defaultAreas);
    const [creatorDraft, setCreatorDraft] = useState(null);
    const [requestDraft, setRequestDraft] = useState(null);
    const [creatorEditing, setCreatorEditing] = useState(false);
    const [requestEditing, setRequestEditing] = useState(false);
    const [search, setSearch] = useState("");
    const [area, setArea] = useState("すべて");
    const [favorites, setFavorites] = useState(false);
    const [status, setStatus] = useState("すべて");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const reload = useCallback(async () => {
        if (!supabase)
            return;
        const [a, b, c] = await Promise.all([supabase.from("personal_creators").select("*").order("name"), supabase.from("personal_creator_requests").select("*").order("created_at", { ascending: false }), supabase.from("personal_creator_fields").select("name").order("name")]);
        if (a.error || b.error || c.error)
            setError([a.error?.message, b.error?.message, c.error?.message].filter(Boolean).join(" / "));
        else {
            setCreators((a.data || []));
            setRequests((b.data || []));
            setAreas((c.data || []).map(x => x.name));
            setError("");
        }
        setLoading(false);
    }, []);
    useEffect(() => { void reload(); }, [reload]);
    const onTotalChange = useCallback((total) => setRequestDraft(v => v ? { ...v, paid_amount: total } : v), []);
    const creatorMap = useMemo(() => new Map(creators.map(c => [c.id, c])), [creators]);
    const visibleCreators = creators.filter(c => (!favorites || c.favorite) && (area === "すべて" || c.fields.includes(area)) && [c.name, ...c.fields, c.memo].join(" ").toLowerCase().includes(search.toLowerCase()));
    const visibleRequests = requests.filter(r => (status === "すべて" || progressGroup(r.progress) === status) && [r.title, r.description, creatorMap.get(r.creator_id)?.name || ""].join(" ").toLowerCase().includes(search.toLowerCase()));
    async function saveCreator() {
        if (!supabase || !creatorDraft || busy)
            return;
        if (!creatorDraft.name.trim()) {
            setError("クリエイター名を入力してください。");
            return;
        }
        setBusy(true);
        setError("");
        const payload = { name: creatorDraft.name.trim(), fields: creatorDraft.fields, contacts: creatorDraft.contacts.filter(x => x.value.trim()).map(x => ({ label: x.label.trim(), value: x.value.trim() })), rate_note: creatorDraft.rate_note, memo: creatorDraft.memo, favorite: creatorDraft.favorite, drive_folder_url: creatorDraft.drive_folder_url };
        const result = creatorDraft.id ? await supabase.from("personal_creators").update(payload).eq("id", creatorDraft.id) : await supabase.from("personal_creators").insert(payload);
        setBusy(false);
        if (result.error) {
            setError(result.error.message);
            return;
        }
        await reload();
        if (creatorDraft.id) {
            setCreatorDraft({ ...creatorDraft });
            setCreatorEditing(false);
        }
        else {
            setCreatorDraft(null);
            setCreatorEditing(false);
        }
    }
    async function saveRequest() {
        if (!supabase || !requestDraft || busy)
            return;
        if (!requestDraft.creator_id || !requestDraft.title.trim()) {
            setError("担当クリエイターと依頼名を入力してください。");
            return;
        }
        if ([requestDraft.paid_amount].some(x => x !== null && (!Number.isSafeInteger(x) || x < 0))) {
            setError("金額を確認してください。");
            return;
        }
        setBusy(true);
        setError("");
        const { id, ...values } = requestDraft;
        const payload = { ...values, title: values.title.trim(), estimated_amount: null, request_page_url: values.request_page_url?.trim() || null };
        const result = id ? await supabase.from("personal_creator_requests").update(payload).eq("id", id) : await supabase.from("personal_creator_requests").insert(payload).select("id").single();
        setBusy(false);
        if (result.error) {
            setError(result.error.message);
            return;
        }
        await reload();
        if (id) {
            setRequestDraft({ ...requestDraft });
            setRequestEditing(false);
        }
        else {
            setRequestDraft({ ...requestDraft, id: result.data?.id || "" });
            setRequestEditing(true);
        }
    }
    async function removeCreator() {
        if (!supabase || !creatorDraft?.id || busy)
            return;
        if (requests.some(r => r.creator_id === creatorDraft.id)) {
            setError("依頼履歴があるクリエイターは削除できません。先に依頼履歴を整理してください。");
            return;
        }
        if (!window.confirm("このクリエイターを削除しますか？"))
            return;
        setBusy(true);
        const r = await supabase.from("personal_creators").delete().eq("id", creatorDraft.id);
        setBusy(false);
        if (r.error) {
            setError(r.error.message);
            return;
        }
        setCreatorDraft(null);
        setCreatorEditing(false);
        await reload();
    }
    async function removeRequest() {
        if (!supabase || !requestDraft?.id || busy || !window.confirm("この依頼履歴を削除しますか？"))
            return;
        setBusy(true);
        const r = await supabase.from("personal_creator_requests").delete().eq("id", requestDraft.id);
        setBusy(false);
        if (r.error) {
            setError(r.error.message);
            return;
        }
        setRequestDraft(null);
        setRequestEditing(false);
        await reload();
    }
    const count = (id) => requests.filter(r => r.creator_id === id).length;
    return h("section", { className: "space-y-5" },
        h("div", { className: "flex flex-wrap items-center justify-between gap-3" },
            h("div", { className: "flex gap-2" },
                h("button", { className: tab === "creators" ? primary : btn, onClick: () => { setTab("creators"); setSearch(""); } }, "\u30AF\u30EA\u30A8\u30A4\u30BF\u30FC\u4E00\u89A7"),
                h("button", { className: tab === "requests" ? primary : btn, onClick: () => { setTab("requests"); setSearch(""); } }, "\u4F9D\u983C\u7BA1\u7406")),
            h("button", { className: primary, onClick: () => { setError(""); if (tab === "creators") {
                    setCreatorDraft(blankCreator());
                    setCreatorEditing(true);
                }
                else {
                    setRequestDraft(blankRequest(creators[0]?.id || ""));
                    setRequestEditing(true);
                } } }, tab === "creators" ? "クリエイター登録" : "新規依頼")),
        h("div", { className: "flex flex-wrap gap-3" },
            h("input", { className: input + " !mt-0 min-w-48 flex-1", placeholder: "\u691C\u7D22", "aria-label": "\u691C\u7D22", value: search, onChange: e => setSearch(e.target.value) }),
            tab === "creators" ? h(Fragment, null,
                h("select", { className: input + " !mt-0 w-auto", value: area, onChange: e => setArea(e.target.value) },
                    h("option", null, "\u3059\u3079\u3066"),
                    areas.map(a => h("option", { key: a }, a))),
                h("label", { className: "flex items-center gap-2 text-sm" },
                    h("input", { type: "checkbox", checked: favorites, onChange: e => setFavorites(e.target.checked) }),
                    "\u304A\u6C17\u306B\u5165\u308A\u306E\u307F")) : h("select", { className: input + " !mt-0 w-auto", value: status, onChange: e => setStatus(e.target.value) },
                h("option", null, "\u3059\u3079\u3066"),
                statuses.map(s => h("option", { key: s, value: s }, progressLabel(s))))),
        loading && h("p", { className: "text-sm" }, "\u8AAD\u307F\u8FBC\u307F\u4E2D..."),
        !loading && tab === "creators" && h("div", { className: "grid gap-3 md:grid-cols-2 xl:grid-cols-3" },
            visibleCreators.map(c => h("button", { key: c.id, onClick: () => { setError(""); setCreatorDraft(structuredClone(c)); setCreatorEditing(false); }, className: "rounded-xl border bg-white p-5 text-left hover:bg-gray-50" },
                h("div", { className: "flex items-start justify-between gap-3" },
                    h("div", { className: "min-w-0 flex-1" },
                        h("div", { className: "flex items-start justify-between gap-2" },
                            h("strong", { className: "break-all" }, c.name),
                            h("span", null, c.favorite ? "★" : "")),
                        h("p", { className: "mt-2 text-xs text-gray-500" }, c.fields.join(" / ")),
                        h("p", { className: "mt-4 text-sm" },
                            "\u4F9D\u983C\u5C65\u6B74 ",
                            count(c.id),
                            "\u4EF6")),
                    h(CreatorAvatar, { creator: c, compact: true })))),
            visibleCreators.length === 0 && h("p", { className: "text-sm text-gray-500" }, "0\u4EF6")),
        !loading && tab === "requests" && h("div", { className: "space-y-2" },
            visibleRequests.map(r => h("button", { key: r.id, onClick: () => { setError(""); setRequestDraft({ ...r }); setRequestEditing(false); }, className: "flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 text-left hover:bg-gray-50" },
                h("div", null,
                    h("strong", null, r.title),
                    h("p", { className: "mt-1 text-xs text-gray-500" },
                        creatorMap.get(r.creator_id)?.name || "担当者未登録",
                        " / \u7D0D\u671F ",
                        r.due_on || "未設定")),
                h("div", { className: "text-right text-sm" },
                    h("p", null,
                        progressLabel(r.progress),
                        " / ",
                        r.payment_status)))),
            visibleRequests.length === 0 && h("p", { className: "text-sm text-gray-500" }, "0\u4EF6")),
        error && h("p", { role: "alert", className: "text-sm text-red-700" }, error),
        creatorDraft && h("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4", onMouseDown: e => { if (e.target === e.currentTarget && !busy)
                setCreatorDraft(null); } },
            h("div", { role: "dialog", "aria-modal": "true", "aria-label": "\u30AF\u30EA\u30A8\u30A4\u30BF\u30FC\u8A73\u7D30", className: "max-h-[90vh] w-full max-w-2xl space-y-2 overflow-y-auto rounded-xl bg-white p-6" },
                h("div", { className: "flex items-center justify-between gap-3" },
                    h("h3", { className: "text-lg font-semibold" }, creatorDraft.id ? "クリエイター詳細" : "クリエイター登録"),
                    h("div", { className: "flex gap-2" },
                        creatorDraft.id && !creatorEditing && h("button", { className: primary, onClick: () => setCreatorEditing(true) }, "\u7DE8\u96C6"),
                        h("button", { className: btn, onClick: () => setCreatorDraft(null) }, "\u9589\u3058\u308B"))),
                creatorEditing ? h(Fragment, null,
                    h("label", { className: "block text-sm" },
                        "\u6D3B\u52D5\u540D",
                        h("input", { className: input, maxLength: 120, value: creatorDraft.name, onChange: e => setCreatorDraft(v => v && ({ ...v, name: e.target.value })) })),
                    h("div", null,
                        h("p", { className: "text-sm" }, "\u62C5\u5F53\u5206\u91CE"),
                        h("div", { className: "mt-2 flex flex-wrap gap-3" }, areas.map(a => h("label", { key: a, className: "flex items-center gap-1 text-sm" },
                            h("input", { type: "checkbox", checked: creatorDraft.fields.includes(a), onChange: e => setCreatorDraft(v => v && ({ ...v, fields: e.target.checked ? [...v.fields, a] : v.fields.filter(x => x !== a) })) }),
                            a)))),
                    h("div", { className: "space-y-3" },
                        h("div", { className: "flex items-center justify-between gap-2" },
                            h("h4", { className: "text-sm font-semibold" }, "SNS\u30FB\u4F9D\u983C\u30B5\u30A4\u30C8"),
                            h("button", { className: btn, type: "button", onClick: () => setCreatorDraft(v => v && ({ ...v, contacts: [...v.contacts, { label: "", value: "" }] })) }, "\u8FFD\u52A0")),
                        creatorDraft.contacts.map((c, i) => h("div", { key: i, className: "grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] items-end gap-2" },
                            h("label", { className: "min-w-0 text-xs text-gray-600" },
                                "\u540D\u79F0",
                                h("input", { "aria-label": `SNS・依頼サイト ${i + 1} の名称`, className: input + " !mt-1 w-full min-w-0", placeholder: "\u4F8B\uFF1AX\u3001\u3064\u306A\u3050", value: c.label, onChange: e => setCreatorDraft(v => v && ({ ...v, contacts: v.contacts.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })) })),
                            h("label", { className: "min-w-0 text-xs text-gray-600" },
                                "URL",
                                h("input", { "aria-label": `SNS・依頼サイト ${i + 1} のURL`, type: "url", className: input + " !mt-1 w-full min-w-0", placeholder: "https://...", value: c.value, onChange: e => setCreatorDraft(v => v && ({ ...v, contacts: v.contacts.map((x, j) => j === i ? { ...x, value: e.target.value } : x) })) })),
                            h("button", { className: btn + " shrink-0", type: "button", onClick: () => setCreatorDraft(v => v && ({ ...v, contacts: v.contacts.filter((_, j) => j !== i) })) }, "\u524A\u9664"))),
                        creatorDraft.contacts.length === 0 && h("p", { className: "text-sm text-gray-500" }, "\u672A\u767B\u9332\u3067\u3059\u3002\u300C\u8FFD\u52A0\u300D\u304B\u3089\u540D\u79F0\u3068URL\u3092\u767B\u9332\u3067\u304D\u307E\u3059\u3002")),
                    h("label", { className: "block text-sm" },
                        "Google Drive\uFF08\u30AF\u30EA\u30A8\u30A4\u30BF\u30FC\u5C02\u7528\u30D5\u30A9\u30EB\u30C0\u30FC\uFF09",
                        h("input", { className: input, type: "url", value: creatorDraft.drive_folder_url || "", onChange: e => setCreatorDraft(v => v && ({ ...v, drive_folder_url: e.target.value })) })),
                    h("label", { className: "block text-sm" },
                        "\u5099\u8003",
                        h("textarea", { className: input, rows: 4, value: creatorDraft.memo, onChange: e => setCreatorDraft(v => v && ({ ...v, memo: e.target.value })) })),
                    h("label", { className: "flex gap-2 text-sm" },
                        h("input", { type: "checkbox", checked: creatorDraft.favorite, onChange: e => setCreatorDraft(v => v && ({ ...v, favorite: e.target.checked })) }),
                        "\u304A\u6C17\u306B\u5165\u308A"),
                    h("div", { className: "flex flex-wrap gap-2" },
                        h("button", { className: primary, disabled: busy, onClick: () => void saveCreator() }, "\u4FDD\u5B58"),
                        h("button", { className: btn, disabled: busy, onClick: () => { if (creatorDraft.id) {
                                setCreatorDraft(structuredClone(creators.find(x => x.id === creatorDraft.id) || creatorDraft));
                                setCreatorEditing(false);
                            }
                            else
                                setCreatorDraft(null); } }, "\u30AD\u30E3\u30F3\u30BB\u30EB"),
                        creatorDraft.id && h("button", { className: btn + " ml-auto text-red-700", disabled: busy, onClick: () => void removeCreator() }, "\u524A\u9664"))) : h(Fragment, null,
                    h("div", { className: "flex items-start justify-between gap-4" },
                        h("div", { className: "min-w-0" },
                            h("h4", { className: "break-words text-xl font-semibold" }, creatorDraft.name),
                            h("p", { className: "mt-1 text-sm text-gray-500" }, creatorDraft.fields.join(" / ") || "担当分野未設定"),
                    h("div", { className: "mt-2 space-y-1" },
                        h("h4", { className: "font-semibold" }, "SNS\u30FB\u4F9D\u983C\u30B5\u30A4\u30C8"),
                        h("div", { className: "flex flex-wrap gap-2" }, creatorDraft.contacts.length ? creatorDraft.contacts.map((c, i) => /^https?:\/\//.test(c.value) ? h("a", { key: i, href: c.value, target: "_blank", rel: "noopener noreferrer", className: "rounded-full border border-gray-300 px-4 py-1.5 text-sm hover:bg-gray-50" }, c.label || "リンク") : h("span", { key: i, className: "rounded-full border border-gray-300 px-4 py-1.5 text-sm" }, c.label || "リンク")) : h("p", { className: "text-sm text-gray-500" }, "\u672A\u767B\u9332")))),
                        h(CreatorAvatar, { creator: creatorDraft })),
                    h("div", { className: "space-y-1" },
                        h("h4", { className: "font-semibold" }, "Google Drive"),
                        creatorDraft.drive_folder_url ? h("a", { className: "text-sm underline", href: creatorDraft.drive_folder_url, target: "_blank", rel: "noopener noreferrer" }, "\u30AF\u30EA\u30A8\u30A4\u30BF\u30FC\u30D5\u30A9\u30EB\u30C0\u30FC\u3092\u958B\u304F") : h("p", { className: "text-sm text-gray-500" }, "\u672A\u767B\u9332")),
                    h("div", { className: "space-y-1" },
                        h("h4", { className: "font-semibold" }, "\u5099\u8003"),
                        h("p", { className: "whitespace-pre-wrap text-sm" }, creatorDraft.memo || "—"))),
                creatorDraft.id && !creatorEditing && h("div", { className: "space-y-2 border-t pt-4" },
                    h("div", { className: "flex items-center justify-between" },
                        h("h4", { className: "font-semibold" }, "\u4F9D\u983C\u5C65\u6B74"),
                        h("button", { className: primary, onClick: () => { const id = creatorDraft.id; setCreatorDraft(null); setTab("requests"); setRequestDraft(blankRequest(id)); setRequestEditing(true); } }, "\u4F9D\u983C\u8FFD\u52A0")),
                    requests.filter(r => r.creator_id === creatorDraft.id).map(r => h("button", { key: r.id, className: "block w-full rounded-md border border-gray-200 p-3 text-left text-sm hover:bg-gray-50", onClick: () => { setCreatorDraft(null); setTab("requests"); setRequestDraft({ ...r }); setRequestEditing(false); } },
                        r.title,
                        " / ",
                        progressLabel(r.progress)))),
                error && h("p", { role: "alert", className: "text-sm text-red-700" }, error))),
        requestDraft && h("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4", onMouseDown: e => { if (e.target === e.currentTarget && !busy)
                setRequestDraft(null); } },
            h("div", { role: "dialog", "aria-modal": "true", "aria-label": "\u4F9D\u983C\u8A73\u7D30", className: "max-h-[90vh] w-full max-w-3xl space-y-5 overflow-y-auto rounded-xl bg-white p-6" },
                h("div", { className: "flex items-center justify-between gap-3" },
                    h("h3", { className: "text-lg font-semibold" }, requestDraft.id ? "依頼詳細" : "依頼追加"),
                    h("div", { className: "flex gap-2" },
                        requestDraft.id && !requestEditing && h("button", { className: primary, onClick: () => setRequestEditing(true) }, "\u7DE8\u96C6"),
                        h("button", { className: btn, onClick: () => setRequestDraft(null) }, "\u9589\u3058\u308B"))),
                requestEditing ? h(Fragment, null,
                    h("label", { className: "block text-sm" },
                        "\u62C5\u5F53\u30AF\u30EA\u30A8\u30A4\u30BF\u30FC",
                        h("select", { className: input, value: requestDraft.creator_id, onChange: e => setRequestDraft(v => v && ({ ...v, creator_id: e.target.value })) },
                            h("option", { value: "" }, "\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044"),
                            creators.map(c => h("option", { key: c.id, value: c.id }, c.name)))),
                    h("label", { className: "block text-sm" },
                        "\u4F9D\u983C\u540D",
                        h("input", { className: input, maxLength: 200, value: requestDraft.title, onChange: e => setRequestDraft(v => v && ({ ...v, title: e.target.value })) })),
                    h("label", { className: "block text-sm" },
                        "\u4F9D\u983C\u30DA\u30FC\u30B8URL",
                        h("input", { className: input, type: "url", placeholder: "https://tsunagu.cloud/products/...", value: requestDraft.request_page_url || "", onChange: e => setRequestDraft(v => v && ({ ...v, request_page_url: e.target.value })) })),
                    h("div", { className: "grid gap-3 sm:grid-cols-2" }, [["requested_on", "依頼日"], ["due_on", "納期"]].map(([key, label]) => h("label", { key: key, className: "text-sm" },
                        label,
                        h("input", { className: input, type: "date", value: requestDraft[key] || "", onChange: e => setRequestDraft(v => v && ({ ...v, [key]: e.target.value || null })) })))),
                    h("div", { className: "grid gap-3 sm:grid-cols-2" },
                        h("label", { className: "text-sm" },
                            "\u9032\u6357",
                            h("select", { className: input, value: progressGroup(requestDraft.progress), onChange: e => setRequestDraft(v => v && ({ ...v, progress: e.target.value })) }, statuses.map(s => h("option", { key: s, value: s }, progressLabel(s))), !statuses.includes(progressGroup(requestDraft.progress)) && h("option", { value: requestDraft.progress, disabled: true }, progressLabel(requestDraft.progress) + "（旧データ）"))),
                        h("label", { className: "text-sm" },
                            "\u652F\u6255\u3044",
                            h("select", { className: input, value: requestDraft.payment_status, onChange: e => setRequestDraft(v => v && ({ ...v, payment_status: e.target.value })) }, payments.map(s => h("option", { key: s }, s))))),
                    h("label", { className: "block text-sm" },
                        "\u652F\u6255\u65E5",
                        h("input", { className: input, type: "date", value: requestDraft.paid_on || "", onChange: e => setRequestDraft(v => v && ({ ...v, paid_on: e.target.value || null })) })),
                    h("label", { className: "block text-sm" },
                        "\u5099\u8003",
                        h("textarea", { className: input, rows: 3, value: requestDraft.memo, onChange: e => setRequestDraft(v => v && ({ ...v, memo: e.target.value })) }))) : h(Fragment, null,
                    h("div", null,
                        h("h4", { className: "text-xl font-semibold" }, requestDraft.title),
                        h("p", { className: "text-sm text-gray-500" }, creatorMap.get(requestDraft.creator_id)?.name || "担当者未登録")),
                    h("div", { className: "space-y-1" },
                        h("h4", { className: "font-semibold" }, "\u4F9D\u983C\u30DA\u30FC\u30B8"),
                        requestDraft.request_page_url ? h("a", { href: requestDraft.request_page_url, target: "_blank", rel: "noopener noreferrer", className: "inline-block max-w-full break-all rounded-full border border-gray-300 px-4 py-1.5 text-sm hover:bg-gray-50" }, "\u4F9D\u983C\u30DA\u30FC\u30B8\u3092\u958B\u304F") : h("p", { className: "text-sm text-gray-500" }, "\u672A\u767B\u9332")),
                    h("div", { className: "grid grid-cols-2 gap-3 text-sm" },
                        h("div", null,
                            "\u4F9D\u983C\u65E5\uFF1A",
                            requestDraft.requested_on || "—"),
                        h("div", null,
                            "\u7D0D\u671F\uFF1A",
                            requestDraft.due_on || "—"),
                        h("div", null,
                            "\u9032\u6357\uFF1A",
                            progressLabel(requestDraft.progress)),
                        h("div", null,
                            "\u652F\u6255\u3044\uFF1A",
                            requestDraft.payment_status),
                        h("div", null,
                            "\u652F\u6255\u65E5\uFF1A",
                            requestDraft.paid_on || "—")),
                    h("div", null,
                        h("h4", { className: "font-semibold" }, "\u5099\u8003"),
                        h("p", { className: "whitespace-pre-wrap text-sm" }, requestDraft.memo || "—"))),
                h(RequestDetails, { requestId: requestDraft.id, creatorFolder: creatorMap.get(requestDraft.creator_id)?.drive_folder_url || "", editing: requestEditing, onTotalChange: onTotalChange }),
                requestEditing && h("div", { className: "flex flex-wrap gap-2" },
                    h("button", { className: primary, disabled: busy, onClick: () => void saveRequest() }, "\u4FDD\u5B58"),
                    h("button", { className: btn, disabled: busy, onClick: () => { if (requestDraft.id) {
                            setRequestDraft({ ...requests.find(r => r.id === requestDraft.id) || requestDraft });
                            setRequestEditing(false);
                        }
                        else
                            setRequestDraft(null); } }, "\u30AD\u30E3\u30F3\u30BB\u30EB"),
                    requestDraft.id && h("button", { className: btn + " ml-auto text-red-700", disabled: busy, onClick: () => void removeRequest() }, "\u524A\u9664")),
                error && h("p", { role: "alert", className: "text-sm text-red-700" }, error))));
}
