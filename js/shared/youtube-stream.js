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

export function calendarMetadata(metadata, fallback) {
    const raw = metadata.actual_start_at || metadata.youtube_scheduled_at;
    const d = raw ? new Date(raw) : null;
    const parts = d && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(d) : [];
    const v = Object.fromEntries(parts.map(p=>[p.type,p.value]));
    return {event_date:v.year?`${v.year}-${v.month}-${v.day}`:fallback.event_date,title:metadata.youtube_title ?? fallback.title,start_time:v.hour?`${v.hour}:${v.minute}`:fallback.start_time};
}
