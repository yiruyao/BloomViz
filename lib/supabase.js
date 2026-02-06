import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
// Vercel/Supabase integration may use either name
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY). Add them in Vercel Environment Variables.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey);
