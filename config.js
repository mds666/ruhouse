/*
 * Rubbish House / Supabase configuration
 * ------------------------------------------------------------
 * Leave both values empty to keep the local demo mode.
 *
 * 1. Create a Supabase project.
 * 2. Run /supabase/schema.sql and optionally /supabase/seed-demo.sql.
 * 3. Enable Authentication > Providers > Anonymous Sign-Ins.
 * 4. Paste your Project URL and anon public key below.
 *
 * Only the anon public key belongs here.
 * NEVER put a service_role / secret key in front-end code.
 */
window.RUHOUSE_CONFIG = {
  supabaseUrl: "https://qmfqncpoqpdofskolqix.supabase.co",
  supabaseAnonKey: "sb_publishable_magsMihtXvWqaDP3Gk_eDg_XJ7yv2rE",
  storageBucket: "room-photos"
};
