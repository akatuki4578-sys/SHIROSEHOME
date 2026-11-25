import { h, Fragment, useCallback, useEffect, useMemo, useState, useRouter } from "../core/runtime.js";
import { SUPABASE_URL, SUPABASE_KEY, isAuthorizedAdmin, supabase } from "../core/supabase.js";
import { MIN_MONTH, pad, dateString, monthIndex, colors, colorNames, isFixedType, displayEventTitle, isStreamType, formatDuration, inputClass, buttonClass } from "../shared/activity-utils.js";
export function useActivityData() {
    const [types, setTypes] = useState([]);
    const [events, setEvents] = useState([]);
    const [streams, setStreams] = useState([]);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const load = useCallback(async () => {
        if (!supabase) {
            setError("接続設定を確認してください。");
            setLoading(false);
            return;
        }
        setLoading(true);
        const [a, b, c] = await Promise.all([
            supabase.from("personal_calendar_event_types").select("id,name,color,system_key,sort_order").order("sort_order"),
            supabase.from("personal_calendar_events").select("id,event_date,title,category_id,start_time,notes").order("event_date"),
            supabase.from("personal_streams").select("id,calendar_event_id,youtube_url,status,actual_start_at,actual_end_at,duration_minutes,game,game_id,collaborators,private_notes,youtube_title,youtube_thumbnail,youtube_scheduled_at"),
        ]);
        if (a.error || b.error || c.error)
            setError([a.error?.message, b.error?.message, c.error?.message].filter(Boolean).join(" / "));
        else {
            setTypes((a.data ?? []));
            setEvents((b.data ?? []));
            setStreams((c.data ?? []));
            setError("");
        }
        setLoading(false);
    }, []);
    useEffect(() => { void load(); }, [load]);
    return { types, events, streams, error, loading, load };
}
