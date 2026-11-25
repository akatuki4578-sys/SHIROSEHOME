"use client";
import { useRouter } from "../core/runtime.js";
import { h, useEffect, useState } from "../core/runtime.js";
import { isAuthorizedAdmin, supabase } from "../core/supabase.js";
export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => {
        let alive = true;
        void isAuthorizedAdmin().then((ok) => {
            if (alive && ok)
                router.replace("/admin");
        });
        return () => { alive = false; };
    }, [router]);
    async function handleSubmit(event) {
        event.preventDefault();
        setError("");
        if (!supabase) {
            setError("Supabaseの接続設定がありません。config.jsを確認してください。");
            return;
        }
        setBusy(true);
        try {
            const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
            if (signInError) {
                setError("ログインできませんでした。メールアドレス・パスワード・メール確認状態を確認してください。");
                return;
            }
            if (!(await isAuthorizedAdmin())) {
                await supabase.auth.signOut();
                setError("このアカウントには管理者権限がありません。");
                return;
            }
            router.replace("/admin");
        }
        catch {
            setError("通信に失敗しました。接続設定とネットワークを確認してください。");
        }
        finally {
            setBusy(false);
        }
    }
    return (h("main", { className: "flex min-h-screen items-center justify-center bg-[#f7f7f5] px-6 text-[#252525]" },
        h("section", { className: "w-full max-w-md rounded-xl border border-gray-200 bg-white p-8" },
            h("p", { className: "text-xs tracking-widest text-gray-500" }, "SHIROSE HAMAYA"),
            h("h1", { className: "mt-4 text-2xl font-semibold" }, "\u7BA1\u7406\u8005\u30ED\u30B0\u30A4\u30F3"),
            h("form", { onSubmit: handleSubmit, className: "mt-6 space-y-4" },
                h("label", { className: "block text-sm" },
                    "\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9",
                    h("input", { className: "mt-2 w-full rounded-lg border border-gray-300 px-3 py-3", type: "email", autoComplete: "email", value: email, onChange: (e) => setEmail(e.target.value), required: true })),
                h("label", { className: "block text-sm" },
                    "\u30D1\u30B9\u30EF\u30FC\u30C9",
                    h("input", { className: "mt-2 w-full rounded-lg border border-gray-300 px-3 py-3", type: "password", autoComplete: "current-password", value: password, onChange: (e) => setPassword(e.target.value), required: true })),
                error && h("p", { role: "alert", className: "text-sm text-red-700" }, error),
                h("button", { type: "submit", disabled: busy, className: "w-full rounded-lg bg-[#252525] px-5 py-3 text-sm text-white disabled:opacity-50" }, busy ? "確認中..." : "ログイン")))));
}
