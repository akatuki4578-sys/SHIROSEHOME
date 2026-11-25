import { h, Fragment, useCallback, useEffect, useMemo, useState, useRouter } from "../core/runtime.js";
import { SUPABASE_URL, SUPABASE_KEY, isAuthorizedAdmin, supabase } from "../core/supabase.js";
import { MIN_MONTH, pad, dateString, monthIndex, colors, colorNames, isFixedType, displayEventTitle, isStreamType, formatDuration, inputClass, buttonClass } from "../shared/activity-utils.js";
import { useActivityData } from "../shared/activity-data.js";
import Home from "./home.js";
import StreamManager from "./streams.js";
import Settings from "./settings.js";
import CreatorMemo from "./creator-memo.js";
import GameLibrary from "./games.js";
import InfoMemo from "./info-memo.js";
import Materials from "./materials.js";
const menus = ["ホーム", "配信管理", "クリエイターメモ", "使用素材", "ゲーム管理", "情報メモ", "各種設定"];
function AdminDashboard() {
    const [active, setActive] = useState("ホーム");
    const [focus, setFocus] = useState(null);
    const data = useActivityData();
    const router = useRouter();
    const openStream = (id) => { setFocus(id); setActive("配信管理"); };
    const clearFocus = useCallback(() => setFocus(null), []);
    async function logout() { await supabase?.auth.signOut(); router.replace("/login"); }
    return h("div", { className: "min-h-screen bg-[#f7f7f5] text-[#252525] md:flex" },
        h("aside", { className: "border-b border-[#e5e5e2] bg-white p-5 md:min-h-screen md:w-64 md:border-b-0 md:border-r" },
            h("div", { className: "mb-8" },
                h("h1", { className: "text-lg font-semibold tracking-wider" }, "SHIROSE HAMAYA"),
                h("p", { className: "mt-1 text-xs text-gray-500" }, "\u6D3B\u52D5\u7BA1\u7406\u30A2\u30D7\u30EA")),
            h("nav", { className: "grid grid-cols-2 gap-2 md:grid-cols-1" }, menus.map(menu => h("button", { key: menu, type: "button", onClick: () => setActive(menu), className: `rounded-lg px-4 py-3 text-left text-sm ${active === menu ? "bg-[#252525] text-white" : "text-gray-600 hover:bg-gray-100"}` }, menu))),
            h("button", { onClick: () => void logout(), className: "mt-8 rounded-lg border border-gray-300 px-4 py-2 text-sm" }, "\u30ED\u30B0\u30A2\u30A6\u30C8")),
        h("main", { className: "w-full min-w-0 flex-1 p-5 md:p-10" },
            h("header", { className: "mb-8 border-b border-[#e5e5e2] pb-6" },
                h("h2", { className: "text-2xl font-semibold" }, active)),
            active === "ホーム" ? h(Home, { data: data, openStream: openStream }) : active === "配信管理" ? h(StreamManager, { data: data, focusedId: focus, clearFocus: clearFocus }) : active === "各種設定" ? h(Settings, { data: data }) : active === "ゲーム管理" ? h(GameLibrary, {data, openStream}) : active === "情報メモ" ? h(InfoMemo, null) : active === "使用素材" ? h(Materials, null) : h(CreatorMemo, null),
            data.error && active !== "ホーム" && h("p", { role: "alert", className: "mt-4 text-sm text-red-700" }, data.error)));
}
export default function AdminPage() {
    const router = useRouter();
    const [authorized, setAuthorized] = useState(false);
    useEffect(() => { let alive = true; void isAuthorizedAdmin().then(ok => { if (!alive)
        return; if (ok)
        setAuthorized(true);
    else
        router.replace("/login"); }).catch(() => { if (alive)
        router.replace("/login"); }); return () => { alive = false; }; }, [router]);
    if (!authorized)
        return h("main", { className: "flex min-h-screen items-center justify-center bg-[#f7f7f5] text-sm text-gray-600" }, "\u8A8D\u8A3C\u3092\u78BA\u8A8D\u3057\u3066\u3044\u307E\u3059...");
    return h(AdminDashboard, null);
}
