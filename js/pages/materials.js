"use client";
import { h, useCallback, useEffect, useMemo, useState } from "../core/runtime.js";
import { supabase } from "../core/supabase.js";
const empty = () => ({ name: "", category: "", creator: "", source_url: "", terms_url: "", storage_url: "", memo: "" });
const inputStyle = "mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm";
const buttonStyle = "rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-40";
const isUrl = (value) => { if (!value.trim())
    return true; try {
    return ["http:", "https:"].includes(new URL(value).protocol);
}
catch {
    return false;
} };
export default function Materials() {
    const [items, setItems] = useState([]);
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState("");
    const [draft, setDraft] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const load = useCallback(async () => {
        if (!supabase) {
            setError("Supabaseの接続設定を確認してください。");
            setLoading(false);
            return;
        }
        setLoading(true);
        const result = await supabase.from("personal_used_materials")
            .select("id,name,category,creator,source_url,terms_url,storage_url,memo,created_at")
            .order("created_at", { ascending: false });
        if (result.error)
            setError(result.error.message);
        else {
            setItems((result.data ?? []));
            setError("");
        }
        setLoading(false);
    }, []);
    useEffect(() => { void load(); }, [load]);
    const categories = useMemo(() => [...new Set(items.map(x => x.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja")), [items]);
    const visible = useMemo(() => items.filter(x => {
        const text = [x.name, x.category, x.creator, x.memo].join(" ").toLowerCase();
        return (!category || x.category === category) && text.includes(query.trim().toLowerCase());
    }), [items, category, query]);
    async function save() {
        if (!supabase || !draft || busy)
            return;
        if (!draft.name.trim()) {
            setError("素材名を入力してください。");
            return;
        }
        if (![draft.source_url, draft.terms_url, draft.storage_url].every(isUrl)) {
            setError("URLはhttp://またはhttps://から入力してください。");
            return;
        }
        setBusy(true);
        setError("");
        const payload = {
            name: draft.name.trim(), category: draft.category.trim(), creator: draft.creator.trim(),
            source_url: draft.source_url.trim(), terms_url: draft.terms_url.trim(),
            storage_url: draft.storage_url.trim(), memo: draft.memo.trim(),
        };
        const result = draft.id
            ? await supabase.from("personal_used_materials").update(payload).eq("id", draft.id)
            : await supabase.from("personal_used_materials").insert(payload);
        setBusy(false);
        if (result.error) {
            setError(result.error.message);
            return;
        }
        setDraft(null);
        await load();
    }
    async function remove(item) {
        if (!supabase || busy || !window.confirm(`「${item.name}」を削除しますか？`))
            return;
        setBusy(true);
        setError("");
        const result = await supabase.from("personal_used_materials").delete().eq("id", item.id);
        setBusy(false);
        if (result.error) {
            setError(result.error.message);
            return;
        }
        await load();
    }
    const link = (url, title) => url ? h("a", { href: url, target: "_blank", rel: "noopener noreferrer", className: "rounded-md border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50" }, title) : null;
    return h("section", { className: "space-y-5" },
        h("div", { className: "flex flex-wrap items-center justify-between gap-3" },
            h("p", { className: "text-sm text-gray-500" }, "\u914D\u4FE1\u306A\u3069\u3067\u4F7F\u7528\u3059\u308B\u7D20\u6750\u306E\u914D\u5E03\u5143\u30FB\u5229\u7528\u898F\u7D04\u30FB\u4FDD\u5B58\u5148\u3092\u7BA1\u7406\u3057\u307E\u3059\u3002"),
            h("button", { type: "button", onClick: () => { setError(""); setDraft(empty()); }, className: "rounded-md bg-[#252525] px-4 py-2 text-sm text-white" }, "\u7D20\u6750\u3092\u767B\u9332")),
        h("div", { className: "grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px]" },
            h("input", { "aria-label": "\u7D20\u6750\u3092\u691C\u7D22", placeholder: "\u7D20\u6750\u540D\u30FB\u5236\u4F5C\u8005\u306A\u3069\u3067\u691C\u7D22", className: inputStyle + " !mt-0", value: query, onChange: e => setQuery(e.target.value) }),
            h("select", { "aria-label": "\u30AB\u30C6\u30B4\u30EA\u30FC\u3067\u7D5E\u308A\u8FBC\u307F", className: inputStyle + " !mt-0", value: category, onChange: e => setCategory(e.target.value) },
                h("option", { value: "" }, "\u3059\u3079\u3066\u306E\u30AB\u30C6\u30B4\u30EA\u30FC"),
                categories.map(x => h("option", { key: x, value: x }, x)))),
        error && h("p", { role: "alert", className: "text-sm text-red-700" }, error),
        loading ? h("p", { className: "text-sm text-gray-500" }, "\u8AAD\u307F\u8FBC\u307F\u4E2D...") : visible.length === 0 ? h("div", { className: "rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500" }, items.length ? "該当する素材がありません。" : "登録済みの素材はありません。") :
            h("div", { className: "grid gap-3 lg:grid-cols-2" }, visible.map(item => h("article", { key: item.id, className: "rounded-lg border border-gray-200 bg-white p-4" },
                h("div", { className: "flex items-start justify-between gap-3" },
                    h("div", { className: "min-w-0" },
                        h("h3", { className: "break-words font-semibold" }, item.name),
                        item.category && h("p", { className: "mt-1 text-xs text-gray-500" }, item.category),
                        item.creator && h("p", { className: "mt-2 text-sm" },
                            "\u5236\u4F5C\u8005\uFF1A",
                            item.creator)),
                    h("div", { className: "flex shrink-0 gap-2" },
                        h("button", { type: "button", className: buttonStyle, onClick: () => { setError(""); setDraft({ ...item }); } }, "\u7DE8\u96C6"),
                        h("button", { type: "button", className: buttonStyle, disabled: busy, onClick: () => void remove(item) }, "\u524A\u9664"))),
                item.memo && h("p", { className: "mt-3 whitespace-pre-wrap break-words text-sm text-gray-600" }, item.memo),
                h("div", { className: "mt-4 flex flex-wrap gap-2" },
                    link(item.source_url, "配布元"),
                    link(item.terms_url, "利用規約"),
                    link(item.storage_url, "保存先"))))),
        draft && h("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4", onMouseDown: e => { if (e.target === e.currentTarget && !busy)
                setDraft(null); } },
            h("div", { role: "dialog", "aria-modal": "true", "aria-labelledby": "material-editor-title", className: "max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl sm:p-6" },
                h("h3", { id: "material-editor-title", className: "mb-4 font-semibold" }, draft.id ? "素材を編集" : "素材を登録"),
                h("div", { className: "grid gap-4 sm:grid-cols-2" },
                    [["name", "素材名"], ["category", "カテゴリー"], ["creator", "制作者"], ["source_url", "配布元URL"], ["terms_url", "利用規約URL"], ["storage_url", "保存先URL"]].map(([key, label]) => h("label", { key: key, className: "block text-sm" },
                        label,
                        key === "name" && "（必須）",
                        h("input", { className: inputStyle, type: key.endsWith("_url") ? "url" : "text", value: draft[key], onChange: e => setDraft(prev => prev ? { ...prev, [key]: e.target.value } : prev) }))),
                    h("label", { className: "block text-sm sm:col-span-2" },
                        "\u30E1\u30E2",
                        h("textarea", { rows: 4, className: inputStyle, value: draft.memo, onChange: e => setDraft(prev => prev ? { ...prev, memo: e.target.value } : prev) }))),
                error && h("p", { role: "alert", className: "mt-3 text-sm text-red-700" }, error),
                h("div", { className: "mt-5 flex justify-end gap-2" },
                    h("button", { type: "button", disabled: busy, className: buttonStyle, onClick: () => { setDraft(null); setError(""); } }, "\u30AD\u30E3\u30F3\u30BB\u30EB"),
                    h("button", { type: "button", disabled: busy || !draft.name.trim(), className: "rounded-md bg-[#252525] px-4 py-2 text-sm text-white disabled:opacity-40", onClick: () => void save() }, busy ? "保存中..." : "保存")))));
}
