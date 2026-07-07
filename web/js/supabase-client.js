/**
 * FOD Rooms — Supabase Client & Database Operations
 * All CRUD operations for rooms, bookings, admin users, domains, and settings.
 *
 * ⚠️  CONFIGURATION: Update the URL and ANON_KEY below with your Supabase project values.
 *     The anon key is safe for client-side use — it respects RLS policies.
 *     NEVER put the service_role_key in client-side code.
 */

// ============================================
// ⚠️ UPDATE THESE WITH YOUR SUPABASE PROJECT VALUES
// ============================================
const SUPABASE_URL = 'https://iagqrhkzxacmxsrvxipz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__mPD7RJvdv10wnmtHyoKzw_LgPlIT0T';

// Initialize the Supabase client safely (handling offline & file:// protocol storage restrictions)
if (typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function') {
    const options = {};
    try {
        const testKey = '__storage_test__';
        window.localStorage.setItem(testKey, testKey);
        window.localStorage.removeItem(testKey);
    } catch (e) {
        console.warn('localStorage is not accessible (common under file:// protocol). Session persistence is disabled.');
        options.auth = {
            persistSession: false
        };
    }
    window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, options);
} else {
    console.error('Supabase library failed to load or initialize. Please check your internet connection.');
    window.supabase = {
        auth: {
            async signInWithPassword() { throw new Error('Supabase client failed to load. Please check your internet connection.'); },
            async signUp() { throw new Error('Supabase client failed to load. Please check your internet connection.'); },
            async signOut() { },
            async getSession() { return { data: { session: null } }; },
            onAuthStateChange() { }
        },
        from() {
            const mockQuery = {
                select() { return mockQuery; },
                insert() { return mockQuery; },
                update() { return mockQuery; },
                delete() { return mockQuery; },
                eq() { return mockQuery; },
                neq() { return mockQuery; },
                lt() { return mockQuery; },
                gt() { return mockQuery; },
                in() { return mockQuery; },
                gte() { return mockQuery; },
                lte() { return mockQuery; },
                order() { return mockQuery; },
                single() { return mockQuery; },
                then(onfulfilled) {
                    onfulfilled({ data: null, error: new Error('Supabase client failed to load.') });
                }
            };
            return mockQuery;
        },
        functions: {
            async invoke() { throw new Error('Supabase client failed to load.'); }
        }
    };
}


// ============================================
// ROOM OPERATIONS
// ============================================

const db = {
    /**
     * Fetch all active rooms, ordered by name.
     */
    async getRooms() {
        const { data, error } = await supabase
            .from('rooms')
            .select('*')
            .eq('is_active', true)
            .order('name');
        if (error) throw error;
        return data;
    },

    /**
     * Fetch all rooms including inactive, ordered by name.
     */
    async getAllRooms() {
        const { data, error } = await supabase
            .from('rooms')
            .select('*')
            .order('name');
        if (error) throw error;
        return data;
    },

    /**
     * Fetch a single room by its ID.
     */
    async getRoomById(roomId) {
        const { data, error } = await supabase
            .from('rooms')
            .select('*')
            .eq('id', roomId)
            .single();
        if (error) throw error;
        return data;
    },

    /**
     * Insert a new room.
     */
    async createRoom(name, capacity) {
        const { data, error } = await supabase
            .from('rooms')
            .insert({ name, capacity })
            .select();
        if (error) throw error;
        return data;
    },

    /**
     * Update a room's fields.
     */
    async updateRoom(roomId, updates) {
        const { data, error } = await supabase
            .from('rooms')
            .update(updates)
            .eq('id', roomId)
            .select();
        if (error) throw error;
        return data;
    },

    /**
     * Delete a room by ID.
     */
    async deleteRoom(roomId) {
        const { data, error } = await supabase
            .from('rooms')
            .delete()
            .eq('id', roomId);
        if (error) throw error;
        return data;
    },

    /**
     * Count future pending/approved bookings for a room.
     */
    async getFutureBookingsForRoom(roomId) {
        const today = dateToISO(getCurrentDate());
        const { count, error } = await supabase
            .from('bookings')
            .select('id', { count: 'exact', head: true })
            .eq('room_id', roomId)
            .gte('date', today)
            .in('status', ['pending', 'approved']);
        if (error) throw error;
        return count || 0;
    },


    // ============================================
    // BOOKING — CONFLICT & DUPLICATE CHECKS
    // ============================================

    /**
     * Find bookings that overlap with the requested time slot.
     * Overlap: existing.start < requested.end AND existing.end > requested.start
     */
    async checkConflicts(roomId, bookingDate, startTime, endTime, excludeBookingId) {
        let query = supabase
            .from('bookings')
            .select('*')
            .eq('room_id', roomId)
            .eq('date', bookingDate)
            .in('status', ['pending', 'approved'])
            .lt('start_time', endTime)
            .gt('end_time', startTime);

        if (excludeBookingId) {
            query = query.neq('id', excludeBookingId);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data;
    },

    /**
     * Check if this exact booking already exists for this user.
     */
    async checkDuplicate(email, roomId, bookingDate, startTime, endTime) {
        const { data, error } = await supabase
            .from('bookings')
            .select('id')
            .eq('email', email.toLowerCase().trim())
            .eq('room_id', roomId)
            .eq('date', bookingDate)
            .eq('start_time', startTime)
            .eq('end_time', endTime)
            .in('status', ['pending', 'approved']);
        if (error) throw error;
        return data.length > 0;
    },


    // ============================================
    // BOOKING — AVAILABILITY QUERIES
    // ============================================

    /**
     * Return active rooms with no conflicting bookings for the given slot.
     */
    async getAvailableRooms(bookingDate, startTime, endTime) {
        const allRooms = await this.getRooms();
        const available = [];
        for (const room of allRooms) {
            const conflicts = await this.checkConflicts(room.id, bookingDate, startTime, endTime);
            if (conflicts.length === 0) {
                available.push(room);
            }
        }
        return available;
    },

    /**
     * Return dates (up to daysAhead from today) with no conflicts.
     */
    async getAvailableDates(roomId, startTime, endTime, daysAhead = 90) {
        const today = dateToISO(getCurrentDate());
        const available = [];
        for (let i = 0; i < daysAhead; i++) {
            const checkDate = addDays(today, i);
            const conflicts = await this.checkConflicts(roomId, checkDate, startTime, endTime);
            if (conflicts.length === 0) {
                available.push(checkDate);
            }
        }
        return available;
    },


    // ============================================
    // BOOKING — CRUD
    // ============================================

    /**
     * Create a single booking with status 'pending'.
     */
    async createBooking(roomId, bookerName, email, meetingTitle, bookingDate, startTime, endTime) {
        const { data, error } = await supabase
            .from('bookings')
            .insert({
                room_id: roomId,
                booker_name: bookerName.trim(),
                email: email.toLowerCase().trim(),
                meeting_title: meetingTitle.trim(),
                date: bookingDate,
                start_time: startTime,
                end_time: endTime,
                status: 'pending',
            })
            .select();
        if (error) throw error;
        return data;
    },

    /**
     * Create multiple bookings in a single batch insert.
     */
    async createBookingsBatch(roomId, bookerName, email, meetingTitle, dates, startTime, endTime) {
        const records = dates.map(d => ({
            room_id: roomId,
            booker_name: bookerName.trim(),
            email: email.toLowerCase().trim(),
            meeting_title: meetingTitle.trim(),
            date: d,
            start_time: startTime,
            end_time: endTime,
            status: 'pending',
        }));

        const { data, error } = await supabase
            .from('bookings')
            .insert(records)
            .select();
        if (error) throw error;
        return data;
    },

    /**
     * Admin creates a booking directly — auto-approved.
     */
    async createBookingDirect(roomId, bookerName, email, meetingTitle, bookingDate, startTime, endTime, adminName) {
        const { data, error } = await supabase
            .from('bookings')
            .insert({
                room_id: roomId,
                booker_name: bookerName.trim(),
                email: email.toLowerCase().trim(),
                meeting_title: meetingTitle.trim(),
                date: bookingDate,
                start_time: startTime,
                end_time: endTime,
                status: 'approved',
                handled_by: adminName || null,
            })
            .select();
        if (error) throw error;
        return data;
    },

    /**
     * Fetch a single booking by ID, including room details.
     */
    async getBookingById(bookingId) {
        const { data, error } = await supabase
            .from('bookings')
            .select('*, rooms(name, capacity)')
            .eq('id', bookingId)
            .single();
        if (error) throw error;
        return data;
    },

    /**
     * Fetch all pending bookings with room details, oldest first.
     */
    async getPendingBookings() {
        const { data, error } = await supabase
            .from('bookings')
            .select('*, rooms(name, capacity)')
            .eq('status', 'pending')
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data;
    },

    /**
     * Fetch all bookings, optionally filtered by status, newest date first.
     */
    async getAllBookings(statusFilter) {
        let query = supabase
            .from('bookings')
            .select('*, rooms(name, capacity)');

        if (statusFilter && statusFilter !== 'all') {
            query = query.eq('status', statusFilter);
        }

        const { data, error } = await query
            .order('date', { ascending: false })
            .order('start_time');
        if (error) throw error;
        return data;
    },

    /**
     * Fetch bookings for a room within a date range.
     */
    async getBookingsForRoomRange(roomId, startDate, endDate) {
        const { data, error } = await supabase
            .from('bookings')
            .select('*, rooms(name, capacity)')
            .eq('room_id', roomId)
            .gte('date', startDate)
            .lte('date', endDate)
            .in('status', ['pending', 'approved'])
            .order('date')
            .order('start_time');
        if (error) throw error;
        return data;
    },

    /**
     * Approve or reject a booking.
     */
    async updateBookingStatus(bookingId, status, adminName) {
        const { data, error } = await supabase
            .from('bookings')
            .update({
                status,
                updated_at: new Date().toISOString(),
                handled_by: adminName || null,
            })
            .eq('id', bookingId)
            .select();
        if (error) throw error;
        return data;
    },

    /**
     * Edit any fields on a booking (admin use).
     */
    async editBooking(bookingId, updates) {
        updates.updated_at = new Date().toISOString();
        const { data, error } = await supabase
            .from('bookings')
            .update(updates)
            .eq('id', bookingId)
            .select();
        if (error) throw error;
        return data;
    },

    /**
     * Hard-delete a booking.
     */
    async deleteBooking(bookingId) {
        const { data, error } = await supabase
            .from('bookings')
            .delete()
            .eq('id', bookingId);
        if (error) throw error;
        return data;
    },


    // ============================================
    // ADMIN USER OPERATIONS
    // ============================================

    /**
     * Fetch all admin users ordered by email.
     */
    async getAdminUsers() {
        const { data, error } = await supabase
            .from('admin_users')
            .select('*')
            .order('email');
        if (error) throw error;
        return data;
    },

    /**
     * Fetch a single admin user by email.
     */
    async getAdminByEmail(email) {
        const { data, error } = await supabase
            .from('admin_users')
            .select('*')
            .eq('email', email.toLowerCase().trim())
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    /**
     * Check if an email has admin access.
     */
    async isAdmin(email) {
        const { data, error } = await supabase
            .from('admin_users')
            .select('id')
            .eq('email', email.toLowerCase().trim());
        if (error) throw error;
        return data.length > 0;
    },

    /**
     * Return the total number of admin users.
     */
    async getAdminCount() {
        const { count, error } = await supabase
            .from('admin_users')
            .select('id', { count: 'exact', head: true });
        if (error) throw error;
        return count || 0;
    },

    /**
     * Add a new admin user by email.
     */
    async addAdmin(email, displayName) {
        const data = { email: email.toLowerCase().trim() };
        if (displayName) data.display_name = displayName.trim();
        const { data: result, error } = await supabase
            .from('admin_users')
            .insert(data)
            .select();
        if (error) throw error;
        return result;
    },

    /**
     * Remove an admin user by ID.
     */
    async removeAdmin(adminId) {
        const { data, error } = await supabase
            .from('admin_users')
            .delete()
            .eq('id', adminId);
        if (error) throw error;
        return data;
    },

    /**
     * Update an admin user's display name or other details.
     */
    async updateAdmin(adminId, updates) {
        const { data, error } = await supabase
            .from('admin_users')
            .update(updates)
            .eq('id', adminId)
            .select();
        if (error) throw error;
        return data;
    },

    /**
     * Return a list of all admin email addresses.
     */
    async getAdminEmails() {
        const { data, error } = await supabase
            .from('admin_users')
            .select('email');
        if (error) throw error;
        return data.map(row => row.email);
    },


    // ============================================
    // ALLOWED EMAIL DOMAINS
    // ============================================

    /**
     * Fetch all allowed email domains.
     */
    async getAllowedDomains() {
        const { data, error } = await supabase
            .from('allowed_domains')
            .select('*')
            .order('domain');
        if (error) throw error;
        return data;
    },

    /**
     * Validate that an email's domain is in the allowed list.
     */
    async validateEmailDomain(email) {
        const domains = await this.getAllowedDomains();
        const emailLower = email.toLowerCase().trim();
        return domains.some(d => emailLower.endsWith(d.domain.toLowerCase()));
    },

    /**
     * Add an allowed email domain.
     */
    async addAllowedDomain(domain) {
        if (!domain.startsWith('@')) domain = '@' + domain;
        const { data, error } = await supabase
            .from('allowed_domains')
            .insert({ domain: domain.toLowerCase().trim() })
            .select();
        if (error) throw error;
        return data;
    },

    /**
     * Remove an allowed email domain by ID.
     */
    async removeAllowedDomain(domainId) {
        const { data, error } = await supabase
            .from('allowed_domains')
            .delete()
            .eq('id', domainId);
        if (error) throw error;
        return data;
    },


    // ============================================
    // APP SETTINGS
    // ============================================

    /**
     * Get a single setting value by key.
     */
    async getSetting(key, defaultVal) {
        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', key)
                .single();
            if (error) return defaultVal;
            return data.value;
        } catch {
            return defaultVal;
        }
    },

    /**
     * Upsert a setting.
     */
    async updateSetting(key, value) {
        const { data, error } = await supabase
            .from('app_settings')
            .upsert({
                key,
                value: String(value),
                updated_at: new Date().toISOString(),
            })
            .select();
        if (error) throw error;
        return data;
    },

    /**
     * Read operating hours from app_settings.
     * @returns {{ start: string, end: string }} - HH:MM format
     */
    async getOperatingHours() {
        const start = await this.getSetting('operating_hours_start', AppConfig.DEFAULT_OPERATING_START);
        const end = await this.getSetting('operating_hours_end', AppConfig.DEFAULT_OPERATING_END);
        return { start, end };
    },

    /**
     * Fetch all pending/approved bookings across all rooms in a date range.
     */
    async getBookingsForDateRange(startDate, endDate) {
        const { data, error } = await supabase
            .from('bookings')
            .select('*, rooms(name, capacity)')
            .gte('date', startDate)
            .lte('date', endDate)
            .in('status', ['pending', 'approved']);
        if (error) throw error;
        return data;
    },

    /**
     * Create multiple bookings directly (auto-approved).
     */
    async createBookingsDirectBatch(records) {
        const { data, error } = await supabase
            .from('bookings')
            .insert(records)
            .select();
        if (error) throw error;
        return data;
    },

    /**
     * Get all room notification opt-outs.
     */
    async getAdminRoomOptOuts() {
        const { data, error } = await supabase
            .from('admin_room_opt_outs')
            .select('*');
        if (error) throw error;
        return data;
    },

    /**
     * Opt-out an admin from room notifications.
     */
    async addAdminOptOut(adminId, roomId) {
        const { data, error } = await supabase
            .from('admin_room_opt_outs')
            .insert({ admin_id: adminId, room_id: roomId })
            .select();
        if (error) throw error;
        return data;
    },

    /**
     * Opt-in an admin to room notifications (remove opt-out).
     */
    async removeAdminOptOut(adminId, roomId) {
        const { data, error } = await supabase
            .from('admin_room_opt_outs')
            .delete()
            .eq('admin_id', adminId)
            .eq('room_id', roomId);
        if (error) throw error;
        return data;
    }
};
