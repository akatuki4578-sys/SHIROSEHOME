const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const NextResponse = { json: (body: unknown, init: ResponseInit = {}) => Response.json(body, { ...init, headers: { ...cors, ...init.headers } }) };

const videoId = (value: string) => {
  try {
    const u = new URL(value);
    let id = "";
    if (["youtu.be", "www.youtu.be"].includes(u.hostname)) id = u.pathname.split("/")[1] || "";
    else if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(u.hostname))
      id = u.pathname === "/watch" ? u.searchParams.get("v") || "" : /^\/(live|shorts|embed)\//.test(u.pathname) ? u.pathname.split("/")[2] || "" : "";
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
};
const jsonError = (message: string, status: number) => NextResponse.json({ error: message }, { status });

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return jsonError("Method not allowed", 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const youtubeKey = Deno.env.get("YOUTUBE_API_KEY");
  if (!supabaseUrl || !anonKey || !youtubeKey) return jsonError("サーバー設定を確認してください。", 503);
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return jsonError("認証が必要です。", 401);
  const authHeaders = { apikey: anonKey, Authorization: `Bearer ${token}` };
  try {
    const auth = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: authHeaders, cache: "no-store" });
    if (!auth.ok) return jsonError("認証が必要です。", 401);
    const user = await auth.json();
    if (!user.id) return jsonError("認証が必要です。", 401);
    const admin = await fetch(`${supabaseUrl}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`, { headers: authHeaders, cache: "no-store" });
    if (!admin.ok || !(await admin.json()).length) return jsonError("権限がありません。", 403);
    const body = await request.json();
    const id = typeof body?.url === "string" ? videoId(body.url) : null;
    if (!id) return jsonError("YouTubeのURLを確認してください。", 400);
    const api = new URL("https://www.googleapis.com/youtube/v3/videos");
    api.searchParams.set("part", "snippet,liveStreamingDetails");
    api.searchParams.set("id", id);
    api.searchParams.set("key", youtubeKey);
    const response = await fetch(api, { cache: "no-store" });
    if (!response.ok) return jsonError("YouTubeから取得できませんでした。API設定・利用上限を確認してください。", 502);
    const result = await response.json();
    const item = result.items?.[0];
    if (!item) return jsonError("動画が見つからないか、取得できません。", 404);
    const live = item.liveStreamingDetails || {};
    const start = live.actualStartTime || null;
    const end = live.actualEndTime || null;
    const durationMinutes = start && end ? Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)) : null;
    return NextResponse.json({
      title: item.snippet?.title || null,
      thumbnail: item.snippet?.thumbnails?.maxres?.url || item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || null,
      scheduledAt: live.scheduledStartTime || null,
      actualStartAt: start,
      actualEndAt: end,
      durationMinutes,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch { return jsonError("取得に失敗しました。", 500); }
});
