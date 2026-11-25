import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
export { SUPABASE_URL, SUPABASE_KEY };
export const supabase=SUPABASE_URL&&SUPABASE_KEY?window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY):null;
export async function isAuthorizedAdmin(){if(!supabase)return false;const {data,error}=await supabase.auth.getUser();if(error||!data.user)return false;const r=await supabase.from('admin_users').select('user_id').eq('user_id',data.user.id).maybeSingle();return !r.error&&!!r.data;}
