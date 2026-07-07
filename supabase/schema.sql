-- ============================================
-- FOD ROOMS — FULL DATABASE SCHEMA
-- Run this in the Supabase SQL Editor to
-- initialize all tables, indexes, and seed data.
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. ROOMS — Physical venue inventory
-- ============================================
CREATE TABLE rooms (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    capacity INT NOT NULL DEFAULT 10,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. BOOKINGS — Reservation ledger
-- ============================================
CREATE TABLE bookings (
    id BIGSERIAL PRIMARY KEY,
    room_id BIGINT REFERENCES rooms(id) ON DELETE CASCADE,
    booker_name TEXT NOT NULL,
    email TEXT NOT NULL,
    meeting_title TEXT NOT NULL,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    handled_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. ADMIN USERS — Tracks who has admin access
-- ============================================
CREATE TABLE admin_users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. ALLOWED DOMAINS — Admin-configurable
--    email domain whitelist
-- ============================================
CREATE TABLE allowed_domains (
    id BIGSERIAL PRIMARY KEY,
    domain TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. APP SETTINGS — Key-value configuration
-- ============================================
CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_bookings_room_date ON bookings (room_id, date);
CREATE INDEX idx_bookings_date_time ON bookings (date, start_time, end_time);
CREATE INDEX idx_bookings_status ON bookings (status);
CREATE INDEX idx_bookings_email ON bookings (email);

-- ============================================
-- SEED DATA
-- ============================================

-- Default room
INSERT INTO rooms (name, capacity)
VALUES ('Main Executive Boardroom 101', 25);

-- Allowed email domains for MAHSA University
INSERT INTO allowed_domains (domain) VALUES
    ('@mahsa.edu.my'),
    ('@mahsastudent.edu.my');

-- Default application settings
INSERT INTO app_settings (key, value) VALUES
    ('operating_hours_start', '08:00'),
    ('operating_hours_end', '18:00'),
    ('min_booking_minutes', '30'),
    ('timezone', 'Asia/Kuala_Lumpur');

-- ============================================
-- 6. ADMIN ROOM OPT-OUTS — Tracks which rooms
--    admins choose to opt-out of email notifications for
-- ============================================
CREATE TABLE admin_room_opt_outs (
    id BIGSERIAL PRIMARY KEY,
    admin_id BIGINT REFERENCES admin_users(id) ON DELETE CASCADE,
    room_id BIGINT REFERENCES rooms(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(admin_id, room_id)
);

