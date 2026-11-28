import { SUPABASE_URL, SUPABASE_KEY, supabase } from "../core/supabase.js";
export async function fetchStreamMetadata(url) {
            const { data: sessionData, error: authError } = await supabase.auth.getSession();
            if (authError || !sessionData.session)
                throw new Error("再ログインしてください。");
            const response = await fetch(`${SUPABASE_URL}/functions/v1/youtube-video`, {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${sessionData.session.access_token}` },
                body: JSON.stringify({ url: url }),
            });
            const result = await response.json();
            if (!response.ok)
                throw new Error(result.error || "取得できませんでした。");
    return { youtube_title: result.title ?? null, youtube_thumbnail: result.thumbnail ?? null, youtube_scheduled_at: result.scheduledAt ?? null, actual_start_at: result.actualStartAt ?? null, actual_end_at: result.actualEndAt ?? null, duration_minutes: result.durationMinutes ?? null, ...(result.actualEndAt ? {status:"completed"} : result.actualStartAt ? {status:"live"} : result.scheduledAt ? {status:"scheduled"} : {}) };
}
