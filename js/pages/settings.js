import { h, Fragment, useCallback, useEffect, useMemo, useState, useRouter } from "../core/runtime.js";
import { SUPABASE_URL, SUPABASE_KEY, isAuthorizedAdmin, supabase } from "../core/supabase.js";
import { MIN_MONTH, pad, dateString, monthIndex, colors, colorNames, isFixedType, displayEventTitle, isStreamType, formatDuration, inputClass, buttonClass } from "../shared/activity-utils.js";
function EventTypeSettings({ data }) {
    const { types, events, load } = data;
    const [name, setName] = useState("");
    const [color, setColor] = useState("gray");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    async function add() { if (!supabase || !name.trim() || busy)
        return; setBusy(true); const r = await supabase.from("personal_calendar_event_types").insert({ name: name.trim(), color, sort_order: types.length * 10 + 10 }); setBusy(false); if (r.error)
        setError(r.error.message);
    else {
        setName("");
        setError("");
        await load();
    } }
    async function rename(t) { if (!supabase || isFixedType(t))
        return; const value = window.prompt("種類の名前", t.name)?.trim(); if (!value || value === t.name)
        return; const r = await supabase.from("personal_calendar_event_types").update({ name: value }).eq("id", t.id); if (r.error)
        setError(r.error.message);
    else
        await load(); }
    async function recolor(t, next) { if (!supabase || isFixedType(t))
        return; const r = await supabase.from("personal_calendar_event_types").update({ color: next }).eq("id", t.id); if (r.error)
        setError(r.error.message);
    else
        await load(); }
    async function remove(t) { if (!supabase)
        return; if (isFixedType(t)) {
        setError("固定の種類は削除できません。");
        return;
    } if (events.some(e => e.category_id === t.id)) {
        setError("使用中の種類は削除できません。予定の種類を変更してください。");
        return;
    } if (!window.confirm(`「${t.name}」を削除しますか？`))
        return; const r = await supabase.from("personal_calendar_event_types").delete().eq("id", t.id); if (r.error)
        setError(r.error.message);
    else {
        setError("");
        await load();
    } }
    return h("section", { className: "max-w-2xl rounded-xl border border-gray-200 bg-white p-5" },
        h("h3", { className: "mb-5 font-semibold" }, "\u4E88\u5B9A\u306E\u7A2E\u985E\u7BA1\u7406"),
        h("div", { className: "space-y-3" }, types.map(t => h("div", { key: t.id, className: "flex flex-wrap items-center gap-2 border-b pb-3" },
            h("span", { className: `min-w-28 rounded px-3 py-2 text-sm ${colors[t.color] ?? colors.gray}` }, t.name),
            h("select", { disabled: isFixedType(t), "aria-label": `${t.name}の色`, className: "rounded border p-2 text-sm disabled:opacity-50", value: t.color, onChange: e => void recolor(t, e.target.value) }, Object.entries(colorNames).map(([value, label]) => h("option", { key: value, value: value }, label))),
            !isFixedType(t) && h("button", { className: buttonClass, onClick: () => void rename(t) }, "\u540D\u524D\u5909\u66F4"),
            !isFixedType(t) && h("button", { className: buttonClass, onClick: () => void remove(t) }, "\u524A\u9664")))),
        h("div", { className: "mt-6 flex flex-wrap items-end gap-2" },
            h("label", { className: "flex-1 text-sm" },
                "\u65B0\u3057\u3044\u7A2E\u985E",
                h("input", { className: inputClass, maxLength: 40, value: name, onChange: e => setName(e.target.value) })),
            h("label", { className: "text-sm" },
                "\u8272",
                h("select", { className: inputClass, value: color, onChange: e => setColor(e.target.value) }, Object.entries(colorNames).map(([value, label]) => h("option", { key: value, value: value }, label)))),
            h("button", { className: "rounded-lg bg-[#252525] px-4 py-2 text-sm text-white", disabled: busy || !name.trim(), onClick: () => void add() }, "\u8FFD\u52A0")),
        error && h("p", { role: "alert", className: "mt-4 text-sm text-red-700" }, error));
}
function CatalogSettings({ table, title }) {
    const [items, setItems] = useState([]);
    const [name, setName] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const reload = useCallback(async () => {
        if (!supabase)
            return;
        const result = await supabase.from(table).select("id,name").order("name");
        if (result.error)
            setError(result.error.message);
        else {
            setItems(result.data || []);
            setError("");
        }
    }, [table]);
    useEffect(() => { void reload(); }, [reload]);
    async function add() {
        if (!supabase || !name.trim() || busy)
            return;
        setBusy(true);
        const result = await supabase.from(table).insert({ name: name.trim() });
        setBusy(false);
        if (result.error)
            setError(result.error.message);
        else {
            setName("");
            await reload();
        }
    }
    async function rename(item) {
        if (!supabase || busy)
            return;
        const next = window.prompt("名前を変更", item.name)?.trim();
        if (!next || next === item.name)
            return;
        setBusy(true);
        const result = await supabase.from(table).update({ name: next }).eq("id", item.id);
        // 既存配信の文字列は維持。次に編集する際は旧データとして表示する。
        setBusy(false);
        if (result.error)
            setError(result.error.message);
        else
            await reload();
    }
    async function remove(item) {
        if (!supabase || busy || !window.confirm(`「${item.name}」を登録一覧から削除しますか？`))
            return;
        setBusy(true);
        const result = await supabase.from(table).delete().eq("id", item.id);
        setBusy(false);
        if (result.error)
            setError(result.error.message);
        else
            await reload();
    }
    return h("section", { className: "max-w-2xl rounded-xl border border-gray-200 bg-white p-5" },
        h("h3", { className: "mb-5 font-semibold" }, title),
        h("div", { className: "space-y-2" }, items.map(item => h("div", { key: item.id, className: "flex items-center gap-2 border-b border-gray-100 py-2" },
            h("span", { className: "min-w-0 flex-1 break-words text-sm" }, item.name),
            h("button", { className: buttonClass, disabled: busy, onClick: () => void rename(item) }, "\u7DE8\u96C6"),
            h("button", { className: buttonClass, disabled: busy, onClick: () => void remove(item) }, "\u524A\u9664")))),
        h("div", { className: "mt-5 flex gap-2" },
            h("input", { "aria-label": "\u767B\u9332\u3059\u308B\u540D\u524D", className: inputClass + " !mt-0", maxLength: 120, value: name, onChange: e => setName(e.target.value) }),
            h("button", { className: "rounded-lg bg-[#252525] px-4 py-2 text-sm text-white disabled:opacity-40", disabled: busy || !name.trim(), onClick: () => void add() }, "\u8FFD\u52A0")),
        error && h("p", { role: "alert", className: "mt-3 text-sm text-red-700" }, error));
}
function CreatorFieldSettings() {
    const [rows, setRows] = useState([]);
    const [name, setName] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const reload = useCallback(async () => { if (!supabase)
        return; const r = await supabase.from("personal_creator_fields").select("id,name").order("name"); if (r.error)
        setError(r.error.message);
    else {
        setRows(r.data || []);
        setError("");
    } }, []);
    useEffect(() => { void reload(); }, [reload]);
    async function add() { if (!supabase || busy || !name.trim())
        return; setBusy(true); const r = await supabase.from("personal_creator_fields").insert({ name: name.trim() }); setBusy(false); if (r.error)
        setError(r.error.message);
    else {
        setName("");
        await reload();
    } }
    async function rename(row) { if (!supabase || busy)
        return; const next = window.prompt("担当分野の名称", row.name)?.trim(); if (!next || next === row.name)
        return; setBusy(true); const r = await supabase.from("personal_creator_fields").update({ name: next }).eq("id", row.id); setBusy(false); if (r.error)
        setError(r.error.message);
    else
        await reload(); }
    async function remove(row) { if (!supabase || busy || !window.confirm(`「${row.name}」を削除しますか？クリエイターの担当分野からも外れます。`))
        return; setBusy(true); const r = await supabase.from("personal_creator_fields").delete().eq("id", row.id); setBusy(false); if (r.error)
        setError(r.error.message);
    else
        await reload(); }
    return h("section", { className: "max-w-2xl rounded-xl border border-gray-200 bg-white p-5" },
        h("h3", { className: "mb-5 font-semibold" }, "\u62C5\u5F53\u5206\u91CE\u7BA1\u7406"),
        h("div", { className: "space-y-2" }, rows.map(row => h("div", { key: row.id, className: "flex items-center gap-2 border-b border-gray-100 py-2" },
            h("span", { className: "min-w-0 flex-1 break-words text-sm" }, row.name),
            h("button", { className: buttonClass, disabled: busy, onClick: () => void rename(row) }, "\u7DE8\u96C6"),
            h("button", { className: buttonClass, disabled: busy, onClick: () => void remove(row) }, "\u524A\u9664")))),
        h("div", { className: "mt-5 flex gap-2" },
            h("input", { "aria-label": "\u65B0\u3057\u3044\u62C5\u5F53\u5206\u91CE", className: inputClass + " !mt-0", value: name, maxLength: 80, onChange: e => setName(e.target.value) }),
            h("button", { className: "rounded-lg bg-[#252525] px-4 py-2 text-sm text-white disabled:opacity-40", disabled: busy || !name.trim(), onClick: () => void add() }, "\u8FFD\u52A0")),
        error && h("p", { role: "alert", className: "mt-3 text-sm text-red-700" }, error));
}
function InfoMemoCategorySettings() {
    const [rows, setRows] = useState([]);
    const [name, setName] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const reload = useCallback(async () => {
        if (!supabase) {
            setError("Supabaseに接続できません。");
            return;
        }
        const result = await supabase.from("personal_info_memo_categories").select("id,name").order("name");
        if (result.error)
            setError(result.error.message);
        else {
            setRows(result.data ?? []);
            setError("");
        }
    }, []);
    useEffect(() => { void reload(); }, [reload]);
    async function add() {
        if (!supabase || busy || !name.trim())
            return;
        setBusy(true);
        const result = await supabase.from("personal_info_memo_categories").insert({ name: name.trim() });
        setBusy(false);
        if (result.error)
            setError(result.error.message);
        else {
            setName("");
            await reload();
        }
    }
    async function rename(row) {
        if (!supabase || busy)
            return;
        const next = window.prompt("カテゴリー名", row.name)?.trim();
        if (!next || next === row.name)
            return;
        setBusy(true);
        const result = await supabase.from("personal_info_memo_categories").update({ name: next }).eq("id", row.id);
        setBusy(false);
        if (result.error)
            setError(result.error.message);
        else
            await reload();
    }
    async function remove(row) {
        if (!supabase || busy || !window.confirm(`「${row.name}」を削除しますか？このカテゴリーの情報メモは未分類になります。`))
            return;
        setBusy(true);
        const result = await supabase.from("personal_info_memo_categories").delete().eq("id", row.id);
        setBusy(false);
        if (result.error)
            setError(result.error.message);
        else
            await reload();
    }
    return h("section", { className: "max-w-2xl rounded-xl border border-gray-200 bg-white p-5" },
        h("h3", { className: "mb-5 font-semibold" }, "\u30AB\u30C6\u30B4\u30EA\u30FC"),
        h("p", { className: "mb-4 text-sm text-gray-500" }, "\u60C5\u5831\u30E1\u30E2\u3067\u4F7F\u7528\u3059\u308B\u30AB\u30C6\u30B4\u30EA\u30FC\u3092\u7BA1\u7406\u3057\u307E\u3059\u3002"),
        h("div", { className: "space-y-2" }, rows.map(row => h("div", { key: row.id, className: "flex items-center gap-2 border-b border-gray-100 py-2" },
            h("span", { className: "min-w-0 flex-1 break-words text-sm" }, row.name),
            h("button", { className: buttonClass, disabled: busy, onClick: () => void rename(row) }, "\u7DE8\u96C6"),
            h("button", { className: buttonClass, disabled: busy, onClick: () => void remove(row) }, "\u524A\u9664")))),
        h("div", { className: "mt-5 flex gap-2" },
            h("input", { "aria-label": "\u65B0\u3057\u3044\u30AB\u30C6\u30B4\u30EA\u30FC\u540D", className: inputClass + " !mt-0", maxLength: 80, value: name, onChange: e => setName(e.target.value) }),
            h("button", { className: "rounded-lg bg-[#252525] px-4 py-2 text-sm text-white disabled:opacity-40", disabled: busy || !name.trim(), onClick: () => void add() }, "\u8FFD\u52A0")),
        error && h("p", { role: "alert", className: "mt-3 text-sm text-red-700" }, error));
}
export default function Settings({ data }) {
    const [section, setSection] = useState(null);
    if (section)
        return h("div", { className: "space-y-5" },
            h("button", { className: buttonClass, onClick: () => setSection(null) }, "\u8A2D\u5B9A\u4E00\u89A7\u306B\u623B\u308B"),
            section === "types" ? h(EventTypeSettings, { data: data }) : section === "people" ? h(CatalogSettings, { table: "personal_stream_collaborators", title: "\u30B3\u30E9\u30DC\u76F8\u624B\u7BA1\u7406" }) : section === "creator-fields" ? h(CreatorFieldSettings, null) : h(InfoMemoCategorySettings, null));
    return h("div", { className: "space-y-5" },
        h("section", { className: "rounded-xl border border-gray-200 bg-white p-4 sm:p-5" },
            h("h3", { className: "mb-4 font-semibold" }, "\u767B\u9332\u30C7\u30FC\u30BF\u7BA1\u7406"),
            h("div", { className: "grid gap-2 sm:grid-cols-2" }, [["people", "コラボ相手管理"], ["creator-fields", "担当分野管理"], ["categories", "カテゴリー"]].map(([key, title]) => h("button", { key: key, className: "rounded-md border border-gray-200 bg-white px-3 py-2.5 text-left text-sm font-medium hover:border-gray-300 hover:bg-gray-50", onClick: () => setSection(key) }, title)))),
        h("section", { className: "rounded-xl border border-gray-200 bg-white p-4 sm:p-5" },
            h("h3", { className: "mb-4 font-semibold" }, "\u30AB\u30EC\u30F3\u30C0\u30FC\u8A2D\u5B9A"),
            h("button", { className: "w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-left text-sm font-medium hover:border-gray-300 hover:bg-gray-50 sm:max-w-xs", onClick: () => setSection("types") }, "\u4E88\u5B9A\u306E\u7A2E\u985E\u7BA1\u7406")));
}
