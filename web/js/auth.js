/**
 * FOD Rooms — Authentication Module
 * Handles admin sign-in, sign-up, session management, and bootstrap.
 */

const Auth = {
    /**
     * Sign in with email and password.
     * @returns {{ user, session } | null}
     */
    async signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (error) throw error;
        return data;
    },

    /**
     * Register a new account.
     * @returns {{ user, session } | null}
     */
    async signUp(email, password) {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });
        if (error) throw error;
        return data;
    },

    /**
     * Sign out the current user.
     */
    async signOut() {
        await supabase.auth.signOut();
    },

    /**
     * Get the current session (if any).
     * @returns {object|null}
     */
    async getSession() {
        const { data: { session } } = await supabase.auth.getSession();
        return session;
    },

    /**
     * Get the current user's email (if signed in).
     * @returns {string|null}
     */
    async getCurrentEmail() {
        const session = await this.getSession();
        return session?.user?.email || null;
    },

    /**
     * If admin_users table is empty, bootstrap the first user as admin.
     * @returns {boolean} - true if bootstrapped
     */
    async autoBootstrapAdmin(email) {
        const count = await db.getAdminCount();
        if (count === 0) {
            await db.addAdmin(email, 'System Admin');
            return true;
        }
        return false;
    },

    /**
     * Full admin authentication flow:
     * 1. Sign in / Sign up
     * 2. Bootstrap first admin if needed
     * 3. Verify admin access
     *
     * @returns {{ email: string, bootstrapped: boolean }}
     * @throws {Error} with user-friendly message
     */
    async authenticateAdmin(email, password, isSignUp = false) {
        // 1. Auth
        if (isSignUp) {
            const isAdm = await db.isAdmin(email);
            if (!isAdm) {
                throw new Error('This email is not whitelisted as an admin. Please contact an administrator.');
            }
            const result = await this.signUp(email, password);
            if (!result?.user) throw new Error('Registration failed. The email may already be registered.');
        } else {
            const result = await this.signIn(email, password);
            if (!result?.user) throw new Error('Invalid email or password.');
        }

        // 2. Bootstrap
        const bootstrapped = await this.autoBootstrapAdmin(email);

        // 3. Admin check
        const isAdmin = await db.isAdmin(email);
        if (!isAdmin) {
            await this.signOut();
            throw new Error('⛔ Access denied. Your account is not registered as an admin.');
        }

        return { email: email.toLowerCase().trim(), bootstrapped };
    },

    /**
     * Send password reset link to user's email.
     */
    async resetPassword(email) {
        const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + window.location.pathname,
        });
        if (error) throw error;
        return data;
    },

    /**
     * Update user's password (used in recovery flow).
     */
    async updatePassword(newPassword) {
        const { data, error } = await supabase.auth.updateUser({
            password: newPassword,
        });
        if (error) throw error;
        return data;
    },

    /**
     * Listen for auth state changes.
     */
    onAuthStateChange(callback) {
        supabase.auth.onAuthStateChange((event, session) => {
            callback(event, session);
        });
    },
};
