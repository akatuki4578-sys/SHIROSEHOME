"use client";
import { h, Fragment, useCallback, useEffect, useMemo, useState } from "../core/runtime.js";
import { supabase } from "../core/supabase.js";
const field = "mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm";
const secondary = "rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50";
const primary = "rounded-lg bg-[#252525] px-4 py-2 text-sm text-white disabled:opacity-40";
const blank = () => ({ title: "", body: "", category_id: null, favorite: false, tagsText: "", urlsText: "", imagesText: "" });
const lines = (value) => [...new Set(value.split(/\r?\n/).map(x => x.trim()).filter(Boolean))];
const tags = (value) => [...new Set(value.split(/[,、\n]/).map(x => x.trim()).filter(Boolean))];
const validUrls = (values) => values.every(x => { try {
    const u = new URL(x);
    return u.protocol === "https:" || u.protocol === "http:";
}
catch {
    return false;
} });
export default function InfoMemo() {
    const [categories, setCategories] = useState([]);
    const [memos, setMemos] = useState([]);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("all");
    const [favoritesOnly, setFavoritesOnly] = useState(false);
    const [selected, setSelected] = useState(null);
    const [draft, setDraft] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [pendingFiles, setPendingFiles] = useState([]);
    const [signedImages, setSignedImages] = useState({});
    const storagePrefix = "storage:";
    const cleanupTable = "personal_info_memo_image_cleanup";
    const bucket = "personal-info-memo-images";
    const stored = (url) => url.startsWith(storagePrefix);
    const imageUrl = (url) => stored(url) ? signedImages[url] : url;
    const openEditor = (m) => { setPendingFiles([]); edit(m); };
    useEffect(() => {
        if (!supabase)
            return;
        const paths = [...new Set(memos.flatMap(m => m.image_urls).filter(stored))];
        if (!paths.length) {
            setSignedImages({});
            return;
        }
        let cancelled = false;
        void Promise.all(paths.map(async (path) => {
            const result = await supabase.storage.from(bucket).createSignedUrl(path.slice(storagePrefix.length), 3600);
            return [path, result.data?.signedUrl ?? ""];
        })).then(entries => { if (!cancelled)
            setSignedImages(Object.fromEntries(entries)); });
        return () => { cancelled = true; };
    }, [memos]);
    // Deletions are queued before changing memo records, so failed Storage removals can be retried.
    async function queueCleanup(paths) {
        if (!supabase || !paths.length)
            return null;
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth.user)
            return "ログイン情報を確認できません。";
        const unique = [...new Set(paths)];
        const result = await supabase.from(cleanupTable).upsert(unique.map(path => ({ user_id: auth.user.id, path })), { onConflict: "user_id,path", ignoreDuplicates: true });
        return result.error?.message ?? null;
    }
    async function retryCleanup() {
        if (!supabase)
            return "Supabaseに接続できません。";
        const { data, error: readError } = await supabase.from(cleanupTable).select("id,path").limit(100);
        if (readError)
            return readError.message;
        if (!data?.length)
            return null;
        const paths = data.map(x => x.path);
        const removed = await supabase.storage.from(bucket).remove(paths);
        if (removed.error)
            return removed.error.message;
        const cleared = await supabase.from(cleanupTable).delete().in("id", data.map(x => x.id));
        return cleared.error?.message ?? null;
    }
    async function cleanupNotice() {
        const err = await retryCleanup();
        if (err)
            setError(`画像の完全削除が未完了です。再試行してください: ${err}`);
        return err;
    }
    const [error, setError] = useState("");
    const load = useCallback(async () => {
        if (!supabase) {
            setError("Supabaseの接続設定を確認してください。");
            setLoading(false);
            return;
        }
        setLoading(true);
        const [a, b] = await Promise.all([
            supabase.from("personal_info_memo_categories").select("id,name").order("name"),
            supabase.from("personal_info_memos").select("id,title,body,category_id,tags,source_urls,image_urls,favorite,updated_at").order("updated_at", { ascending: false }),
        ]);
        setLoading(false);
        if (a.error || b.error) {
            setError([a.error?.message, b.error?.message].filter(Boolean).join(" / "));
            return;
        }
        setCategories((a.data ?? []));
        setMemos((b.data ?? []));
        setError("");
    }, []);
    useEffect(() => { void load(); void cleanupNotice(); }, [load]);
    const filtered = useMemo(() => memos.filter(m => {
        const matchesCategory = filter === "all" || (filter === "none" ? !m.category_id : m.category_id === filter);
        const matchesSearch = [m.title, m.body, ...m.tags].join(" ").toLocaleLowerCase().includes(search.toLocaleLowerCase());
        return matchesCategory && matchesSearch && (!favoritesOnly || m.favorite);
    }), [memos, search, filter, favoritesOnly]);
    const current = memos.find(m => m.id === selected);
    const categoryLabel = (id) => categories.find(c => c.id === id)?.name ?? "未分類";
    const edit = (m) => { setDraft({ id: m.id, title: m.title, body: m.body, category_id: m.category_id, favorite: m.favorite, tagsText: m.tags.join("、"), urlsText: m.source_urls.join("\n"), imagesText: m.image_urls.join("\n") }); setError(""); };
    async function save() {
        if (!supabase || !draft || busy)
            return;
        if (!draft.title.trim()) {
            setError("タイトルを入力してください。");
            return;
        }
        const urls = lines(draft.urlsText), images = lines(draft.imagesText);
        if (pendingFiles.some(f => !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(f.type) || f.size > 10 * 1024 * 1024)) {
            setError("画像はJPEG・PNG・WebP・GIF形式、1枚10MB以内にしてください。");
            return;
        }
        if (pendingFiles.length + images.length > 30) {
            setError("画像は1件のメモにつき最大30枚です。");
            return;
        }
        if (!validUrls([...urls, ...images.filter(x => !stored(x))])) {
            setError("URLは http:// または https:// から入力してください。");
            return;
        }
        setBusy(true);
        setError("");
        const previous = draft.id ? (memos.find(m => m.id === draft.id)?.image_urls ?? []) : [];
        const removedPaths = previous.filter(x => stored(x) && !images.includes(x)).map(x => x.slice(storagePrefix.length));
        // Queue removals first; if the database update fails, discard queued removals before retrying.
        if (removedPaths.length) {
            const queueError = await queueCleanup(removedPaths);
            if (queueError) {
                setBusy(false);
                setError(`画像削除の準備に失敗しました: ${queueError}`);
                return;
            }
        }
        const payload = { title: draft.title.trim(), body: draft.body, category_id: draft.category_id || null, favorite: draft.favorite, tags: tags(draft.tagsText), source_urls: urls, image_urls: images };
        const result = draft.id
            ? await supabase.from("personal_info_memos").update(payload).eq("id", draft.id).select("id").single()
            : await supabase.from("personal_info_memos").insert(payload).select("id").single();
        if (result.error) {
            if (removedPaths.length)
                await supabase.from(cleanupTable).delete().in("path", removedPaths);
            setBusy(false);
            setError(result.error.message);
            return;
        }
        const memoId = result.data.id;
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (pendingFiles.length && !uid) {
            setBusy(false);
            setError("ログイン情報を取得できませんでした。");
            return;
        }
        const uploaded = [];
        for (const file of pendingFiles) {
            const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[file.type];
            const path = `${uid}/${memoId}/${crypto.randomUUID()}.${ext}`;
            const r = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
            if (r.error) {
                if (uploaded.length)
                    await queueCleanup(uploaded.map(x => x.slice(storagePrefix.length)));
                await cleanupNotice();
                setBusy(false);
                setError(`画像の保存に失敗しました: ${r.error.message}。再度保存してください。`);
                return;
            }
            uploaded.push(storagePrefix + path);
        }
        if (uploaded.length) {
            const r = await supabase.from("personal_info_memos").update({ image_urls: [...images, ...uploaded] }).eq("id", memoId);
            if (r.error) {
                await queueCleanup(uploaded.map(x => x.slice(storagePrefix.length)));
                await cleanupNotice();
                setBusy(false);
                setError(`画像の登録に失敗しました: ${r.error.message}`);
                return;
            }
        }
        const cleanupError = await retryCleanup();
        if (cleanupError)
            setError(`メモは保存しましたが画像の完全削除が未完了です: ${cleanupError}`);
        setBusy(false);
        setPendingFiles([]);
        setSelected(memoId);
        setDraft(null);
        await load();
    }
    async function remove(m) {
        if (!supabase || busy || !window.confirm(`「${m.title}」を完全削除しますか？添付画像も削除され、復元できません。`))
            return;
        setBusy(true);
        setError("");
        const paths = m.image_urls.filter(stored).map(x => x.slice(storagePrefix.length));
        const queueError = await queueCleanup(paths);
        if (queueError) {
            setBusy(false);
            setError(`削除準備に失敗しました: ${queueError}`);
            return;
        }
        const r = await supabase.from("personal_info_memos").delete().eq("id", m.id).select("id");
        if (r.error || !r.data?.length) {
            if (paths.length)
                await supabase.from(cleanupTable).delete().in("path", paths);
            setBusy(false);
            setError(r.error?.message ?? "メモを削除できませんでした。");
            return;
        }
        const cleanupError = await retryCleanup();
        setBusy(false);
        setSelected(null);
        setDraft(null);
        await load();
        if (cleanupError)
            setError(`メモは削除しましたが、添付画像の削除は未完了です。再試行してください: ${cleanupError}`);
    }
    async function toggleFavorite(m) {
        if (!supabase || busy)
            return;
        const r = await supabase.from("personal_info_memos").update({ favorite: !m.favorite }).eq("id", m.id);
        if (r.error)
            setError(r.error.message);
        else
            await load();
    }
    return h("section", { className: "max-w-5xl space-y-5" },
        error && h("div", { role: "alert", className: "rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" },
            h("p", null, error),
            h("button", { type: "button", className: "mt-2 rounded border border-red-300 px-3 py-1", disabled: busy, onClick: () => void cleanupNotice() }, "\u753B\u50CF\u524A\u9664\u3092\u518D\u8A66\u884C")),
        draft ? h("div", { className: "space-y-5 rounded-xl border bg-white p-5 sm:p-7" },
            h("h3", { className: "text-lg font-semibold" }, draft.id ? "情報メモを編集" : "情報メモを新規登録"),
            h("label", { className: "block text-sm" },
                "\u30BF\u30A4\u30C8\u30EB",
                h("input", { className: field, maxLength: 200, value: draft.title, onChange: e => setDraft({ ...draft, title: e.target.value }) })),
            h("label", { className: "block text-sm" },
                "\u30AB\u30C6\u30B4\u30EA",
                h("select", { className: field, value: draft.category_id ?? "", onChange: e => setDraft({ ...draft, category_id: e.target.value || null }) },
                    h("option", { value: "" }, "\u672A\u5206\u985E"),
                    categories.map(c => h("option", { key: c.id, value: c.id }, c.name)))),
            h("label", { className: "block text-sm" },
                "\u672C\u6587",
                h("textarea", { className: field, rows: 9, value: draft.body, onChange: e => setDraft({ ...draft, body: e.target.value }), placeholder: "\u3042\u3068\u3067\u8AAD\u307F\u8FD4\u3057\u305F\u3044\u5185\u5BB9\u3092\u307E\u3068\u3081\u308B" })),
            h("label", { className: "block text-sm" },
                "\u30BF\u30B0\uFF08\u30AB\u30F3\u30DE\u30FB\u8AAD\u70B9\u3067\u533A\u5207\u308B\uFF09",
                h("input", { className: field, value: draft.tagsText, onChange: e => setDraft({ ...draft, tagsText: e.target.value }), placeholder: "OBS\u3001\u8A2D\u5B9A\u3001\u914D\u4FE1" })),
            h("label", { className: "block text-sm" },
                "\u53C2\u8003URL\uFF081\u884C\u306B1\u4EF6\uFF09",
                h("textarea", { className: field, rows: 3, value: draft.urlsText, onChange: e => setDraft({ ...draft, urlsText: e.target.value }), placeholder: "https://example.com/article" })),
            h("label", { className: "block text-sm" },
                "\u753B\u50CF\u3092\u8FFD\u52A0\uFF08JPEG\u30FBPNG\u30FBWebP\u30FBGIF\u3001\u540410MB\u4EE5\u5185\uFF09",
                h("input", { type: "file", accept: "image/jpeg,image/png,image/webp,image/gif", multiple: true, className: field, onChange: e => {
                        const next = Array.from(e.target.files ?? []);
                        setPendingFiles(old => [...old, ...next]);
                        e.target.value = "";
                    } })),
            pendingFiles.length > 0 && h("div", { className: "space-y-2" }, pendingFiles.map((f, i) => h("div", { key: i, className: "flex items-center justify-between text-sm" },
                h("span", { className: "truncate" }, f.name),
                h("button", { className: secondary, onClick: () => setPendingFiles(v => v.filter((_, j) => j !== i)) }, "\u53D6\u308A\u6D88\u3059")))),
            h("label", { className: "block text-sm" },
                "\u753B\u50CFURL\u30FB\u4FDD\u5B58\u6E08\u307F\u753B\u50CF\uFF081\u884C\u306B1\u4EF6\u3001\u524A\u9664\u3059\u308B\u5834\u5408\u306F\u8A72\u5F53\u884C\u3092\u6D88\u3059\uFF09",
                h("textarea", { className: field, rows: 3, value: draft.imagesText, onChange: e => setDraft({ ...draft, imagesText: e.target.value }), placeholder: "https://example.com/image.png" })),
            h("label", { className: "flex items-center gap-2 text-sm" },
                h("input", { type: "checkbox", checked: draft.favorite, onChange: e => setDraft({ ...draft, favorite: e.target.checked }) }),
                "\u304A\u6C17\u306B\u5165\u308A"),
            h("div", { className: "flex gap-2" },
                h("button", { className: primary, disabled: busy, onClick: () => void save() }, "\u4FDD\u5B58"),
                h("button", { className: secondary, disabled: busy, onClick: () => setDraft(null) }, "\u30AD\u30E3\u30F3\u30BB\u30EB"))) : current ? h("div", { className: "space-y-5 rounded-xl border bg-white p-5 sm:p-7" },
            h("div", { className: "flex flex-wrap items-center gap-2" },
                h("button", { className: secondary, onClick: () => setSelected(null) }, "\u4E00\u89A7\u306B\u623B\u308B"),
                h("button", { className: secondary, onClick: () => openEditor(current) }, "\u7DE8\u96C6"),
                h("button", { className: secondary, onClick: () => void toggleFavorite(current) }, current.favorite ? "お気に入り解除" : "お気に入り登録"),
                h("button", { className: "ml-auto rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700", onClick: () => void remove(current) }, "\u524A\u9664")),
            h("div", null,
                h("p", { className: "mb-2 text-xs text-gray-500" },
                    categoryLabel(current.category_id),
                    " \u30FB \u66F4\u65B0 ",
                    new Date(current.updated_at).toLocaleDateString("ja-JP")),
                h("h3", { className: "text-xl font-semibold" }, current.title)),
            current.tags.length > 0 && h("div", { className: "flex flex-wrap gap-2" }, current.tags.map(t => h("span", { key: t, className: "rounded bg-gray-100 px-2 py-1 text-xs" }, t))),
            h("p", { className: "whitespace-pre-wrap break-words text-sm leading-7" }, current.body || "本文は未登録です。"),
            current.source_urls.length > 0 && h("div", { className: "space-y-2" },
                h("h4", { className: "font-medium" }, "\u53C2\u8003URL"),
                current.source_urls.map(u => h("a", { key: u, className: "block break-all text-sm text-blue-700 underline", href: u, target: "_blank", rel: "noopener noreferrer" }, u))),
            current.image_urls.length > 0 && h("div", { className: "space-y-2" },
                h("h4", { className: "font-medium" }, "\u753B\u50CF"),
                h("div", { className: "grid gap-3 sm:grid-cols-2" }, current.image_urls.map(u => h("a", { key: u, href: imageUrl(u) || "#", target: "_blank", rel: "noopener noreferrer", className: "block rounded-lg border p-2" },
                    imageUrl(u) ? h("img", { src: imageUrl(u), alt: "\u767B\u9332\u3057\u305F\u53C2\u8003\u753B\u50CF", loading: "lazy", className: "max-h-64 w-full object-contain" }) : h("span", { className: "text-xs text-gray-500" }, "\u753B\u50CF\u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093"),
                    h("span", { className: "mt-2 block truncate text-xs text-blue-700" }, "\u753B\u50CF\u3092\u958B\u304F")))))) : h(Fragment, null,
            h("div", { className: "flex flex-wrap items-center justify-between gap-3" },
                h("p", { className: "text-sm text-gray-500" }, "\u30CD\u30C3\u30C8\u3067\u898B\u3064\u3051\u305F\u60C5\u5831\u3084\u8C46\u77E5\u8B58\u3092\u4FDD\u5B58\u30FB\u6574\u7406"),
                h("div", { className: "flex gap-2" },
                    h("button", { className: primary, onClick: () => { setDraft(blank()); setPendingFiles([]); setError(""); } }, "\u65B0\u898F\u767B\u9332"))),
            h("input", { "aria-label": "\u60C5\u5831\u30E1\u30E2\u3092\u691C\u7D22", className: field + " !mt-0", placeholder: "\u30BF\u30A4\u30C8\u30EB\u30FB\u672C\u6587\u30FB\u30BF\u30B0\u3092\u691C\u7D22", value: search, onChange: e => setSearch(e.target.value) }),
            h("div", { className: "flex flex-wrap items-center gap-2" },
                [{ id: "all", name: "すべて" }, ...categories, { id: "none", name: "未分類" }].map(c => h("button", { key: c.id, onClick: () => setFilter(c.id), className: `rounded-lg border px-3 py-2 text-sm ${filter === c.id ? "border-[#252525] bg-[#252525] text-white" : "border-gray-300 bg-white hover:bg-gray-50"}` }, c.name)),
                h("label", { className: "ml-2 flex items-center gap-2 text-sm" },
                    h("input", { type: "checkbox", checked: favoritesOnly, onChange: e => setFavoritesOnly(e.target.checked) }),
                    "\u304A\u6C17\u306B\u5165\u308A\u306E\u307F")),
            loading ? h("p", { className: "text-sm text-gray-500" }, "\u8AAD\u307F\u8FBC\u307F\u4E2D...") : filtered.length === 0 ? h("p", { className: "rounded-xl border bg-white p-8 text-center text-sm text-gray-500" }, "\u8A72\u5F53\u3059\u308B\u30E1\u30E2\u304C\u3042\u308A\u307E\u305B\u3093\u3002") : h("div", { className: "grid gap-3 sm:grid-cols-2" }, filtered.map(m => h("button", { key: m.id, onClick: () => setSelected(m.id), className: "rounded-xl border bg-white p-5 text-left hover:bg-gray-50" },
                h("div", { className: "mb-2 flex items-start justify-between gap-3" },
                    h("h3", { className: "font-semibold" },
                        m.favorite ? "★ " : "",
                        m.title),
                    h("span", { className: "shrink-0 text-xs text-gray-500" }, categoryLabel(m.category_id))),
                h("p", { className: "line-clamp-3 whitespace-pre-wrap text-sm text-gray-500" }, m.body || "本文なし"),
                m.tags.length > 0 && h("p", { className: "mt-3 truncate text-xs text-gray-400" }, m.tags.join(" / ")))))));
}
