-- ============================================================
-- FOD ROOMS — Row Level Security (RLS) Policies
-- ============================================================
--
-- Run this in the Supabase SQL Editor AFTER the initial
-- schema.sql has been executed and all tables exist.
--
-- Tables covered:
--   rooms, bookings, admin_users, allowed_domains, app_settings,
--   admin_room_opt_outs
--
-- Design:
--   • Public users can READ rooms, bookings, allowed_domains,
--     and app_settings so the front-end works without login.
--   • Anyone can INSERT bookings (public booking form).
--   • Only authenticated admins can UPDATE / DELETE bookings
--     and write to rooms, admin_users, allowed_domains,
--     app_settings, and admin_room_opt_outs.
--   • Edge Functions use the service_role key which bypasses
--     RLS entirely — they are not affected by these policies.
-- ============================================================


-- ============================================================
-- 0. HELPER FUNCTION — is_admin()
-- ============================================================
-- Returns TRUE if the currently authenticated user's email
-- exists in the admin_users table. Marked SECURITY DEFINER so
-- it can read admin_users even before RLS policies are applied.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE email = auth.email()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 1. ROOMS
-- ============================================================
-- Anyone can view rooms (the booking form needs them).
-- Only admins can create, update, or delete rooms.
-- ============================================================

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rooms_select_public"
  ON rooms FOR SELECT
  USING (true);

CREATE POLICY "rooms_insert_admin"
  ON rooms FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "rooms_update_admin"
  ON rooms FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "rooms_delete_admin"
  ON rooms FOR DELETE
  USING (public.is_admin());


-- ============================================================
-- 2. BOOKINGS
-- ============================================================
-- Anyone can view bookings (calendar view, conflict checks).
-- Anyone can insert bookings (the public booking form).
-- Only admins can update bookings (approve / reject / edit).
-- Only admins can delete bookings.
-- ============================================================

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bookings_select_public"
  ON bookings FOR SELECT
  USING (true);

CREATE POLICY "bookings_insert_public"
  ON bookings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "bookings_update_admin"
  ON bookings FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "bookings_delete_admin"
  ON bookings FOR DELETE
  USING (public.is_admin());


-- ============================================================
-- 3. ADMIN USERS
-- ============================================================
-- Admins can view the admin list (needed for the admin panel).
-- Admins can add or remove other admins.
-- Non-admin authenticated users can read (needed for the
-- is_admin check on the client side).
--
-- NOTE: Edge Functions use service_role and bypass RLS, so
-- the send-booking-notification function can always read
-- admin emails regardless of these policies.
-- ============================================================

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_users_select_authenticated"
  ON admin_users FOR SELECT
  USING (true);

CREATE POLICY "admin_users_insert_admin"
  ON admin_users FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_users_update_admin"
  ON admin_users FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_users_delete_admin"
  ON admin_users FOR DELETE
  USING (public.is_admin());


-- ============================================================
-- 4. ALLOWED DOMAINS
-- ============================================================
-- Anyone can read (the booking form validates email domains).
-- Only admins can add or remove allowed domains.
-- ============================================================

ALTER TABLE allowed_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allowed_domains_select_public"
  ON allowed_domains FOR SELECT
  USING (true);

CREATE POLICY "allowed_domains_insert_admin"
  ON allowed_domains FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "allowed_domains_update_admin"
  ON allowed_domains FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "allowed_domains_delete_admin"
  ON allowed_domains FOR DELETE
  USING (public.is_admin());


-- ============================================================
-- 5. APP SETTINGS
-- ============================================================
-- Anyone can read settings (operating hours, timezone, etc.).
-- Only admins can create or update settings.
-- ============================================================

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings_select_public"
  ON app_settings FOR SELECT
  USING (true);

CREATE POLICY "app_settings_insert_admin"
  ON app_settings FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "app_settings_update_admin"
  ON app_settings FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "app_settings_delete_admin"
  ON app_settings FOR DELETE
  USING (public.is_admin());


-- ============================================================
-- NOTES
-- ============================================================
-- 1. The very first admin must be inserted BEFORE RLS is
--    enabled, or via the Supabase Dashboard / service_role key.
--    After the first admin exists, subsequent admins can be
--    added through the Admin Panel.
--
-- 2. If you need to allow the anon key (unauthenticated) to
--    insert bookings, the "bookings_insert_public" policy
--    uses WITH CHECK (true) which permits this.
--
-- 3. To test policies, use the Supabase SQL Editor:
--      SET request.jwt.claims = '{"email":"admin@mahsa.edu.my"}';
--      SET role = 'authenticated';
--      SELECT * FROM rooms;  -- should work
--      INSERT INTO rooms (name) VALUES ('Test');  -- only if admin
--
-- 4. Edge Functions that use SUPABASE_SERVICE_ROLE_KEY bypass
--    RLS entirely. This is intentional for server-side
--    operations like fetching admin emails for notifications.
-- ============================================================


-- ============================================================
-- 6. ADMIN ROOM OPT-OUTS
-- ============================================================
ALTER TABLE admin_room_opt_outs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_room_opt_outs_select_public"
  ON admin_room_opt_outs FOR SELECT
  USING (public.is_admin());

CREATE POLICY "admin_room_opt_outs_insert_admin"
  ON admin_room_opt_outs FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_room_opt_outs_delete_admin"
  ON admin_room_opt_outs FOR DELETE
  USING (public.is_admin());

