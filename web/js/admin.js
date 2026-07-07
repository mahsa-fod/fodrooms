/**
 * FOD Rooms — Admin Dashboard
 * Complete admin panel: auth gate, review queue, bookings CRUD, rooms, admins, settings.
 */

(function () {
    'use strict';

    // Safe sessionStorage wrapper to prevent crashes when sessionStorage is disabled (e.g. file:// protocol)
    const safeSessionStorage = {
        _data: {},
        getItem(key) {
            try {
                return window.sessionStorage.getItem(key);
            } catch (e) {
                return this._data[key] || null;
            }
        },
        setItem(key, value) {
            try {
                window.sessionStorage.setItem(key, value);
            } catch (e) {
                this._data[key] = String(value);
            }
        },
        removeItem(key) {
            try {
                window.sessionStorage.removeItem(key);
            } catch (e) {
                delete this._data[key];
            }
        }
    };

    // ============================================
    // STATE
    // ============================================
    let adminEmail = null;
    let adminDisplayName = null;
    let cachedRooms = [];
    let cachedOperatingHours = { start: AppConfig.DEFAULT_OPERATING_START, end: AppConfig.DEFAULT_OPERATING_END };
    let isRegisterMode = false;
    let cachedPendingBookings = [];
    let cachedAllBookings = [];
    let currentAuthMode = 'signin'; // 'signin', 'register', 'forgot', 'recovery'

    // ============================================
    // DOM REFERENCES
    // ============================================
    const $ = (id) => document.getElementById(id);

    const loginGate = $('login-gate');
    const dashboard = $('admin-dashboard');
    const loginForm = $('login-form');
    const tabSignin = $('tab-signin');
    const tabRegister = $('tab-register');
    const confirmPwGroup = $('confirm-pw-group');
    const btnLogin = $('btn-login');
    const sidebarAdminInfo = $('sidebar-admin-info');
    const sidebarAdminEmail = $('sidebar-admin-email');
    const btnLogout = $('btn-logout');

    const authTitle = $('auth-title');
    const authTabs = $('auth-tabs');
    const emailGroup = $('email-group');
    const passwordGroup = $('password-group');
    const recoveryPwGroup = $('recovery-pw-group');
    const btnBackToLogin = $('btn-back-to-login');
    const linkForgotPw = $('link-forgot-pw');

    // ============================================
    // INITIALIZATION
    // ============================================
    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        setupAuthModeToggle();
        setupForgotPasswordEvents();
        setupLoginForm();
        setupLogout();
        setupTabs();

        // Listen for PASSWORD_RECOVERY event from Supabase
        try {
            Auth.onAuthStateChange((event, session) => {
                if (event === 'PASSWORD_RECOVERY') {
                    console.log('Password recovery mode activated via email link.');
                    switchToRecoveryMode();
                }
            });
        } catch (err) {
            console.warn('Failed to initialize auth state listener:', err);
        }

        // Check existing session (skip if resetting password)
        try {
            const session = await Auth.getSession();
            if (session && session.user && currentAuthMode !== 'recovery') {
                const email = session.user.email;
                const isAdm = await db.isAdmin(email);
                if (isAdm) {
                    adminEmail = email;
                    safeSessionStorage.setItem('admin_email', email);
                    showDashboard();
                    return;
                }
            }
        } catch (err) {
            console.warn('Session check failed:', err);
        }

        // Check sessionStorage fallback (skip if resetting password)
        const stored = safeSessionStorage.getItem('admin_email');
        if (stored && currentAuthMode !== 'recovery') {
            // Validate it's still a valid admin
            try {
                const isAdm = await db.isAdmin(stored);
                if (isAdm) {
                    adminEmail = stored;
                    showDashboard();
                    return;
                }
            } catch (err) {
                safeSessionStorage.removeItem('admin_email');
            }
        }

        if (currentAuthMode !== 'recovery') {
            showLoginGate();
        }
    }

    // ============================================
    // AUTH MODE TOGGLE (Sign In / Register / Forgot / Recovery)
    // ============================================
    function setupAuthModeToggle() {
        tabSignin.addEventListener('click', () => {
            switchToSignInMode();
        });

        tabRegister.addEventListener('click', () => {
            switchToRegisterMode();
        });
    }

    function setupForgotPasswordEvents() {
        if (linkForgotPw) {
            linkForgotPw.addEventListener('click', (e) => {
                e.preventDefault();
                switchToForgotPasswordMode();
            });
        }
        if (btnBackToLogin) {
            btnBackToLogin.addEventListener('click', (e) => {
                e.preventDefault();
                switchToSignInMode();
            });
        }
    }

    function switchToSignInMode() {
        currentAuthMode = 'signin';
        isRegisterMode = false;
        tabSignin.classList.add('active');
        tabRegister.classList.remove('active');
        authTitle.textContent = '🔐 Admin Authentication';
        authTabs.classList.remove('hidden');
        emailGroup.classList.remove('hidden');
        passwordGroup.classList.remove('hidden');
        confirmPwGroup.classList.add('hidden');
        recoveryPwGroup.classList.add('hidden');
        btnBackToLogin.classList.add('hidden');
        btnLogin.textContent = 'Sign In';
        if (linkForgotPw) linkForgotPw.classList.remove('hidden');

        // Update HTML5 validation requirements
        $('login-email').required = true;
        $('login-password').required = true;
        $('login-confirm-pw').required = false;
        $('recovery-password').required = false;
    }

    function switchToRegisterMode() {
        currentAuthMode = 'register';
        isRegisterMode = true;
        tabRegister.classList.add('active');
        tabSignin.classList.remove('active');
        authTitle.textContent = '🔐 Admin Authentication';
        authTabs.classList.remove('hidden');
        emailGroup.classList.remove('hidden');
        passwordGroup.classList.remove('hidden');
        confirmPwGroup.classList.remove('hidden');
        recoveryPwGroup.classList.add('hidden');
        btnBackToLogin.classList.add('hidden');
        btnLogin.textContent = 'Register';
        if (linkForgotPw) linkForgotPw.classList.add('hidden');

        // Update HTML5 validation requirements
        $('login-email').required = true;
        $('login-password').required = true;
        $('login-confirm-pw').required = true;
        $('recovery-password').required = false;
    }

    function switchToForgotPasswordMode() {
        currentAuthMode = 'forgot';
        authTitle.textContent = '🔑 Reset Password';
        authTabs.classList.add('hidden');
        emailGroup.classList.remove('hidden');
        passwordGroup.classList.add('hidden');
        confirmPwGroup.classList.add('hidden');
        recoveryPwGroup.classList.add('hidden');
        btnBackToLogin.classList.remove('hidden');
        btnLogin.textContent = 'Send Reset Link';

        // Update HTML5 validation requirements
        $('login-email').required = true;
        $('login-password').required = false;
        $('login-confirm-pw').required = false;
        $('recovery-password').required = false;
    }

    function switchToRecoveryMode() {
        currentAuthMode = 'recovery';
        authTitle.textContent = '🆕 Choose New Password';
        authTabs.classList.add('hidden');
        emailGroup.classList.add('hidden');
        passwordGroup.classList.add('hidden');
        confirmPwGroup.classList.add('hidden');
        recoveryPwGroup.classList.remove('hidden');
        btnBackToLogin.classList.remove('hidden');
        btnLogin.textContent = 'Update Password';

        // Update HTML5 validation requirements
        $('login-email').required = false;
        $('login-password').required = false;
        $('login-confirm-pw').required = false;
        $('recovery-password').required = true;

        showLoginGate();
    }

    // ============================================
    // LOGIN FORM
    // ============================================
    function setupLoginForm() {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (currentAuthMode === 'forgot') {
                const email = $('login-email').value.trim();
                if (!email) {
                    showToast('Please enter your email address.', 'warning');
                    return;
                }

                setButtonLoading(btnLogin, true);
                try {
                    await Auth.resetPassword(email);
                    showToast('📧 Reset link sent! Check your inbox for the recovery email.', 'success', 7000);
                    switchToSignInMode();
                } catch (err) {
                    showToast(err.message || 'Failed to send reset link.', 'error');
                } finally {
                    setButtonLoading(btnLogin, false);
                }
            } else if (currentAuthMode === 'recovery') {
                const newPassword = $('recovery-password').value;
                if (!newPassword || newPassword.length < 6) {
                    showToast('Password must be at least 6 characters.', 'warning');
                    return;
                }

                setButtonLoading(btnLogin, true);
                try {
                    await Auth.updatePassword(newPassword);
                    showToast('🎉 Password updated! You can now sign in with your new password.', 'success', 5000);
                    
                    // Clear active recovery session
                    await Auth.signOut();
                    switchToSignInMode();
                } catch (err) {
                    showToast(err.message || 'Failed to update password.', 'error');
                } finally {
                    setButtonLoading(btnLogin, false);
                }
            } else {
                // Standard Sign In / Register
                const email = $('login-email').value.trim();
                const password = $('login-password').value;
                const confirmPw = $('login-confirm-pw').value;

                if (!email || !password) {
                    showToast('Please fill in all fields.', 'warning');
                    return;
                }

                if (isRegisterMode) {
                    if (password !== confirmPw) {
                        showToast('Passwords do not match.', 'error');
                        return;
                    }
                    // Prevent registration of non-whitelisted emails
                    try {
                        const isWhitelisted = await db.isAdmin(email);
                        if (!isWhitelisted) {
                            showToast('This email is not whitelisted as an admin. Please contact an administrator.', 'warning');
                            return;
                        }
                    } catch (err) {
                        console.warn('Pre-check for whitelisted admin failed:', err);
                    }
                }

                setButtonLoading(btnLogin, true);
                try {
                    const result = await Auth.authenticateAdmin(email, password, isRegisterMode);
                    adminEmail = result.email;
                    safeSessionStorage.setItem('admin_email', adminEmail);

                    if (result.bootstrapped) {
                        showToast('🎉 You are the first admin! Account bootstrapped successfully.', 'success', 5000);
                    } else {
                        showToast('Welcome back!', 'success');
                    }
                    showDashboard();
                } catch (err) {
                    console.error('Authentication error details:', err);
                    let errorMsg = 'Authentication failed.';
                    if (err) {
                        if (typeof err === 'string') {
                            errorMsg = err;
                        } else if (err.message && typeof err.message === 'string') {
                            errorMsg = err.message;
                        } else if (err.error_description && typeof err.error_description === 'string') {
                            errorMsg = err.error_description;
                        } else {
                            try {
                                const stringified = JSON.stringify(err);
                                if (stringified && stringified !== '{}') {
                                    errorMsg = stringified;
                                } else {
                                    errorMsg = err.toString() || 'Authentication failed.';
                                }
                            } catch {
                                errorMsg = err.toString() || 'Authentication failed.';
                            }
                        }
                    }
                    showToast(errorMsg, 'error');
                } finally {
                    setButtonLoading(btnLogin, false);
                }
            }
        });
    }

    // ============================================
    // LOGOUT
    // ============================================
    function setupLogout() {
        btnLogout.addEventListener('click', async () => {
            try {
                await Auth.signOut();
            } catch (err) {
                console.warn('Sign out error:', err);
            }
            safeSessionStorage.removeItem('admin_email');
            adminEmail = null;
            window.location.reload();
        });
    }

    // ============================================
    // SHOW / HIDE GATES
    // ============================================
    function showLoginGate() {
        loginGate.classList.remove('hidden');
        dashboard.classList.add('hidden');
        sidebarAdminInfo.classList.add('hidden');
    }

    function showDashboard() {
        loginGate.classList.add('hidden');
        dashboard.classList.remove('hidden');
        sidebarAdminInfo.classList.remove('hidden');
        sidebarAdminEmail.textContent = adminEmail;

        updateSidebarAdminName();

        // Load initial data
        loadCoreData();
    }

    async function updateSidebarAdminName() {
        if (!adminEmail) return;
        try {
            const adminUser = await db.getAdminByEmail(adminEmail);
            if (adminUser && adminUser.display_name) {
                adminDisplayName = adminUser.display_name;
                sidebarAdminEmail.textContent = adminUser.display_name;
            } else {
                adminDisplayName = adminEmail;
                sidebarAdminEmail.textContent = adminEmail;
            }
        } catch (err) {
            console.warn('Failed to fetch admin details for sidebar:', err);
            adminDisplayName = adminEmail;
            sidebarAdminEmail.textContent = adminEmail;
        }
    }

    function populateRoomFilters() {
        const reviewFilter = $('review-room-filter');
        const bookingsFilter = $('bookings-room-filter');

        const optionsHtml = '<option value="all">All Rooms</option>' +
            cachedRooms.map(r => `<option value="${r.id}">${r.name}</option>`).join('');

        if (reviewFilter) reviewFilter.innerHTML = optionsHtml;
        if (bookingsFilter) bookingsFilter.innerHTML = optionsHtml;
    }

    function isDateMatch(dateStr, filterType, tabName) {
        if (!dateStr || filterType === 'all') return true;

        const todayStr = dateToISO(getCurrentDate());
        if (filterType === 'day') {
            return dateStr === todayStr;
        }

        if (filterType === 'week') {
            const pickerId = tabName === 'review' ? 'review-week-picker' : 'bookings-week-picker';
            const pickerVal = $(pickerId) ? $(pickerId).value : '';
            if (!pickerVal) {
                const mondayStr = getWeekStart(todayStr);
                const sundayStr = addDays(mondayStr, 6);
                return dateStr >= mondayStr && dateStr <= sundayStr;
            }
            const parts = pickerVal.split('-W');
            if (parts.length !== 2) return true;
            const year = parseInt(parts[0], 10);
            const week = parseInt(parts[1], 10);
            const monday = getMondayOfISOWeek(week, year);
            const mondayStr = dateToISO(monday);
            const sundayStr = addDays(mondayStr, 6);
            return dateStr >= mondayStr && dateStr <= sundayStr;
        }

        if (filterType === 'month') {
            const pickerId = tabName === 'review' ? 'review-month-picker' : 'bookings-month-picker';
            const pickerVal = $(pickerId) ? $(pickerId).value : '';
            if (!pickerVal) {
                const today = getCurrentDate();
                const monthPrefix = today.toISOString().substring(0, 7);
                return dateStr.startsWith(monthPrefix);
            }
            return dateStr.startsWith(pickerVal);
        }

        return true;
    }

    function getISOWeekString(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        const year = d.getUTCFullYear();
        const week = String(weekNo).padStart(2, '0');
        return `${year}-W${week}`;
    }

    function getMondayOfISOWeek(w, y) {
        const simple = new Date(Date.UTC(y, 0, 1 + (w - 1) * 7));
        const dow = simple.getUTCDay();
        const ISOweekStart = simple;
        if (dow <= 4) {
            ISOweekStart.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
        } else {
            ISOweekStart.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
        }
        return new Date(ISOweekStart.getUTCFullYear(), ISOweekStart.getUTCMonth(), ISOweekStart.getUTCDate());
    }

    async function loadCoreData() {
        try {
            cachedRooms = await db.getAllRooms();
            cachedOperatingHours = await db.getOperatingHours();
            populateRoomFilters();
        } catch (err) {
            console.warn('Failed to load core data:', err);
        }

        // Load active tab
        loadReviewQueue();
    }

    // ============================================
    // TAB SWITCHING
    // ============================================
    function switchTab(tabId) {
        // Sync desktop tabs active state
        const tabsContainer = $('admin-tabs');
        if (tabsContainer) {
            tabsContainer.querySelectorAll('.tab').forEach(t => {
                if (t.dataset.tab === tabId) {
                    t.classList.add('active');
                } else {
                    t.classList.remove('active');
                }
            });
        }

        // Sync mobile dropdown switcher
        const mobileSelect = $('admin-tabs-mobile');
        if (mobileSelect) {
            mobileSelect.value = tabId;
        }

        // Show/hide tab content
        document.querySelectorAll('#admin-dashboard > .tab-content').forEach(tc => tc.classList.remove('active'));
        const target = $(tabId);
        if (target) target.classList.add('active');

        // Load data for the tab
        switch (tabId) {
            case 'tab-review': loadReviewQueue(); break;
            case 'tab-bookings': loadAllBookings(); break;
            case 'tab-make-bookings': initMakeBookingsTab(); break;
            case 'tab-rooms': loadRooms(); break;
            case 'tab-admins': loadAdmins(); break;
            case 'tab-settings': loadSettings(); break;
        }
    }

    function setupTabs() {
        const tabsContainer = $('admin-tabs');
        if (tabsContainer) {
            tabsContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.tab');
                if (!btn) return;
                switchTab(btn.dataset.tab);
            });
        }

        const mobileSelect = $('admin-tabs-mobile');
        if (mobileSelect) {
            mobileSelect.addEventListener('change', (e) => {
                switchTab(e.target.value);
            });
        }
    }

    // ============================================
    // HELPER: populate time selects
    // ============================================
    function populateTimeSelect(selectEl, selectedVal, placeholder = 'Select Time') {
        const slots = generateTimeSlots(cachedOperatingHours.start, cachedOperatingHours.end, AppConfig.SLOT_INCREMENT_MINUTES);
        // Normalize selectedVal: Supabase returns "HH:MM:SS", slots are "HH:MM"
        const normalizedVal = selectedVal ? selectedVal.substring(0, 5) : '';
        selectEl.innerHTML = '';
        if (!normalizedVal) {
            const emptyOpt = document.createElement('option');
            emptyOpt.value = '';
            emptyOpt.textContent = `-- ${placeholder} --`;
            emptyOpt.disabled = true;
            emptyOpt.selected = true;
            selectEl.appendChild(emptyOpt);
        }
        slots.forEach(slot => {
            const opt = document.createElement('option');
            opt.value = slot;
            opt.textContent = formatTime(slot);
            if (slot === normalizedVal) opt.selected = true;
            selectEl.appendChild(opt);
        });
    }

    function populateRoomSelect(selectEl, selectedId, placeholder = 'Select Room') {
        selectEl.innerHTML = '';
        if (!selectedId) {
            const emptyOpt = document.createElement('option');
            emptyOpt.value = '';
            emptyOpt.textContent = `-- ${placeholder} --`;
            emptyOpt.disabled = true;
            emptyOpt.selected = true;
            selectEl.appendChild(emptyOpt);
        }
        const activeRooms = cachedRooms.filter(r => r.is_active);
        activeRooms.forEach(room => {
            const opt = document.createElement('option');
            opt.value = room.id;
            opt.textContent = `${room.name} (capacity: ${room.capacity})`;
            if (room.id == selectedId) opt.selected = true;
            selectEl.appendChild(opt);
        });
    }

    function populateRoomSelectAll(selectEl, selectedId, placeholder = 'Select Room') {
        selectEl.innerHTML = '';
        if (!selectedId) {
            const emptyOpt = document.createElement('option');
            emptyOpt.value = '';
            emptyOpt.textContent = `-- ${placeholder} --`;
            emptyOpt.disabled = true;
            emptyOpt.selected = true;
            selectEl.appendChild(emptyOpt);
        }
        cachedRooms.forEach(room => {
            const opt = document.createElement('option');
            opt.value = room.id;
            opt.textContent = `${room.name} (capacity: ${room.capacity})${room.is_active ? '' : ' [INACTIVE]'}`;
            if (room.id == selectedId) opt.selected = true;
            selectEl.appendChild(opt);
        });
    }

    function statusBadge(status) {
        const cls = status === 'approved' ? 'badge-approved' : status === 'rejected' ? 'badge-rejected' : 'badge-pending';
        return `<span class="badge ${cls}">${status}</span>`;
    }

    function escHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    // ============================================
    // TAB 1: REVIEW QUEUE
    // ============================================
    async function loadReviewQueue() {
        const loading = $('review-loading');
        const list = $('review-list');
        loading.classList.remove('hidden');
        list.innerHTML = '';

        try {
            cachedPendingBookings = await db.getPendingBookings();
            loading.classList.add('hidden');
            renderReviewQueue();
        } catch (err) {
            loading.classList.add('hidden');
            showToast('Failed to load pending bookings: ' + err.message, 'error');
        }
    }

    function renderReviewQueue() {
        const list = $('review-list');
        const roomFilter = $('review-room-filter').value;
        const dateFilter = $('review-date-filter').value;

        // Filter bookings
        const filtered = cachedPendingBookings.filter(b => {
            const matchesRoom = (roomFilter === 'all' || String(b.room_id) === roomFilter);
            const matchesDate = isDateMatch(b.date, dateFilter, 'review');
            return matchesRoom && matchesDate;
        });

        if (filtered.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🎉</div>
                    <p class="empty-state-text">No pending bookings matching the selected filters.</p>
                </div>`;
            const bulkActionsContainer = $('review-bulk-actions');
            if (bulkActionsContainer) bulkActionsContainer.classList.add('hidden');
            return;
        }

        const bulkActionsContainer = $('review-bulk-actions');
        if (bulkActionsContainer) bulkActionsContainer.classList.remove('hidden');

        let html = '';
        filtered.forEach(b => {
            const roomName = b.rooms ? b.rooms.name : 'Unknown Room';
            html += `
            <div class="card review-card mb-sm animate-slideUp">
                <div class="review-card-container">
                    <div class="review-card-info">
                        <div class="review-card-title-row">
                            <h3>${escHtml(b.meeting_title)}</h3>
                            <span class="badge badge-info" style="font-size: 0.7rem; padding: 2px 8px;">${escHtml(roomName)}</span>
                        </div>
                        <div class="review-card-meta-row">
                            <span class="meta-item">🗓️ <strong>${formatDate(b.date)}</strong> (${formatTime(b.start_time)} – ${formatTime(b.end_time)})</span>
                            <span class="meta-item text-secondary">👤 ${escHtml(b.booker_name)} (${escHtml(b.email)})</span>
                        </div>
                    </div>
                    <div class="review-card-actions">
                        <label class="review-card-checkbox-label">
                            <input type="checkbox" id="send-email-${b.id}" checked>
                            <span>Email booker</span>
                        </label>
                        <div class="review-card-buttons">
                            <button class="btn btn-approve btn-sm" data-action="approve" data-id="${b.id}" data-room="${escHtml(roomName)}">✅ Approve</button>
                            <button class="btn btn-danger btn-sm" data-action="reject" data-id="${b.id}" data-room="${escHtml(roomName)}">❌ Reject</button>
                        </div>
                    </div>
                </div>
            </div>`;
        });
        list.innerHTML = html;

        // Attach event listeners
        list.removeEventListener('click', handleReviewAction);
        list.addEventListener('click', handleReviewAction);
    }

    async function handleReviewAction(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;
        const bookingId = btn.dataset.id;
        const roomName = btn.dataset.room;
        const adminName = adminDisplayName || adminEmail || 'Admin';

        const sendEmailCheckbox = $(`send-email-${bookingId}`);
        const shouldSendEmail = sendEmailCheckbox ? sendEmailCheckbox.checked : true;

        if (action === 'approve') {
            setButtonLoading(btn, true);
            try {
                const updated = await db.updateBookingStatus(bookingId, 'approved', adminName);
                const booking = updated && updated[0] ? updated[0] : { id: bookingId };
                if (shouldSendEmail) {
                    await EmailService.sendApprovalEmail(booking, roomName, adminName);
                }
                showToast('Booking approved!', 'success');
                loadReviewQueue();
            } catch (err) {
                showToast('Failed to approve: ' + err.message, 'error');
                setButtonLoading(btn, false);
            }
        } else if (action === 'reject') {
            setButtonLoading(btn, true);
            try {
                const updated = await db.updateBookingStatus(bookingId, 'rejected', adminName);
                const booking = updated && updated[0] ? updated[0] : { id: bookingId };
                if (shouldSendEmail) {
                    await EmailService.sendRejectionEmail(booking, roomName, adminName);
                }
                showToast('Booking rejected.', 'info');
                loadReviewQueue();
            } catch (err) {
                showToast('Failed to reject: ' + err.message, 'error');
                setButtonLoading(btn, false);
            }
        }
    }

    async function handleBulkApprove() {
        const roomFilter = $('review-room-filter').value;
        const dateFilter = $('review-date-filter').value;

        const filtered = cachedPendingBookings.filter(b => {
            const matchesRoom = (roomFilter === 'all' || String(b.room_id) === roomFilter);
            const matchesDate = isDateMatch(b.date, dateFilter, 'review');
            return matchesRoom && matchesDate;
        });

        if (filtered.length === 0) {
            showToast('No pending bookings to approve.', 'warning');
            return;
        }

        const res = await showConfirmBulkAction(
            'Approve All Requests',
            `Are you sure you want to approve all ${filtered.length} pending requests?`,
            'btn-approve'
        );
        if (!res.confirmed) return;

        const btn = $('btn-approve-all');
        const btnReject = $('btn-reject-all');
        setButtonLoading(btn, true);
        if (btnReject) btnReject.disabled = true;

        let successCount = 0;
        let failCount = 0;
        const adminName = adminDisplayName || adminEmail || 'Admin';

        for (const b of filtered) {
            try {
                const roomName = b.rooms ? b.rooms.name : 'Unknown Room';
                const updated = await db.updateBookingStatus(b.id, 'approved', adminName);
                const booking = updated && updated[0] ? updated[0] : { id: b.id };
                if (res.sendEmail) {
                    await EmailService.sendApprovalEmail(booking, roomName, adminName);
                }
                successCount++;
            } catch (err) {
                console.error(`Failed to approve booking ${b.id}:`, err);
                failCount++;
            }
        }

        setButtonLoading(btn, false);
        if (btnReject) btnReject.disabled = false;

        if (failCount === 0) {
            showToast(`Successfully approved all ${successCount} bookings!`, 'success');
        } else {
            showToast(`Approved ${successCount} bookings. Failed to approve ${failCount} bookings.`, 'warning');
        }

        loadReviewQueue();
    }

    async function handleBulkReject() {
        const roomFilter = $('review-room-filter').value;
        const dateFilter = $('review-date-filter').value;

        const filtered = cachedPendingBookings.filter(b => {
            const matchesRoom = (roomFilter === 'all' || String(b.room_id) === roomFilter);
            const matchesDate = isDateMatch(b.date, dateFilter, 'review');
            return matchesRoom && matchesDate;
        });

        if (filtered.length === 0) {
            showToast('No pending bookings to reject.', 'warning');
            return;
        }

        const res = await showConfirmBulkAction(
            'Reject All Requests',
            `Are you sure you want to reject all ${filtered.length} pending requests?`,
            'btn-danger'
        );
        if (!res.confirmed) return;

        const btn = $('btn-reject-all');
        const btnApprove = $('btn-approve-all');
        setButtonLoading(btn, true);
        if (btnApprove) btnApprove.disabled = true;

        let successCount = 0;
        let failCount = 0;
        const adminName = adminDisplayName || adminEmail || 'Admin';

        for (const b of filtered) {
            try {
                const roomName = b.rooms ? b.rooms.name : 'Unknown Room';
                const updated = await db.updateBookingStatus(b.id, 'rejected', adminName);
                const booking = updated && updated[0] ? updated[0] : { id: b.id };
                if (res.sendEmail) {
                    await EmailService.sendRejectionEmail(booking, roomName, adminName);
                }
                successCount++;
            } catch (err) {
                console.error(`Failed to reject booking ${b.id}:`, err);
                failCount++;
            }
        }

        setButtonLoading(btn, false);
        if (btnApprove) btnApprove.disabled = false;

        if (failCount === 0) {
            showToast(`Successfully rejected all ${successCount} bookings.`, 'info');
        } else {
            showToast(`Rejected ${successCount} bookings. Failed to reject ${failCount} bookings.`, 'warning');
        }

        loadReviewQueue();
    }

    // ============================================
    // TAB 2: ALL BOOKINGS
    // ============================================
    async function loadAllBookings() {
        const loading = $('bookings-loading');
        const container = $('bookings-table-container');
        loading.classList.remove('hidden');
        container.innerHTML = '';

        const filter = $('bookings-status-filter').value;
        try {
            cachedAllBookings = await db.getAllBookings(filter);
            loading.classList.add('hidden');
            renderAllBookings();
        } catch (err) {
            loading.classList.add('hidden');
            showToast('Failed to load bookings: ' + err.message, 'error');
        }
    }

    function renderAllBookings() {
        const container = $('bookings-table-container');
        const roomFilter = $('bookings-room-filter').value;
        const dateFilter = $('bookings-date-filter').value;

        // Filter bookings in memory
        const filtered = cachedAllBookings.filter(b => {
            const matchesRoom = (roomFilter === 'all' || String(b.room_id) === roomFilter);
            const matchesDate = isDateMatch(b.date, dateFilter, 'bookings');
            return matchesRoom && matchesDate;
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📭</div>
                    <p class="empty-state-text">No bookings found matching the selected filters.</p>
                </div>`;
            return;
        }

        let html = `
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Room</th>
                        <th>Booker</th>
                        <th>Email</th>
                        <th>Meeting</th>
                        <th>Date</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Status</th>
                        <th>Actioned By</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>`;

        filtered.forEach(b => {
            const roomName = b.rooms ? b.rooms.name : 'Unknown';
            html += `
                <tr>
                    <td>${escHtml(roomName)}</td>
                    <td>${escHtml(b.booker_name)}</td>
                    <td class="text-xs">${escHtml(b.email)}</td>
                    <td>${escHtml(b.meeting_title)}</td>
                    <td>${formatDateShort(b.date)}</td>
                    <td>${formatTime(b.start_time)}</td>
                    <td>${formatTime(b.end_time)}</td>
                    <td>${statusBadge(b.status)}</td>
                    <td>${escHtml(b.handled_by || '—')}</td>
                    <td>
                        <button class="btn btn-ghost btn-sm" data-toggle-edit="${b.id}">✏️</button>
                        <button class="btn btn-ghost btn-sm text-danger" data-delete-booking="${b.id}">🗑️</button>
                    </td>
                </tr>
                <tr class="hidden" id="edit-row-${b.id}">
                    <td colspan="10">
                        <div class="card" style="margin: 0.5rem 0;">
                            <h4 class="mb-sm">Edit Booking</h4>
                            <div class="form-row">
                                <div class="form-group">
                                    <label class="form-label">Room</label>
                                    <select class="form-select" id="edit-room-${b.id}"></select>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">Date</label>
                                    <input type="date" class="form-input" id="edit-date-${b.id}" value="${b.date}">
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label class="form-label">Start</label>
                                    <select class="form-select" id="edit-start-${b.id}"></select>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">End</label>
                                    <select class="form-select" id="edit-end-${b.id}"></select>
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label class="form-label">Meeting Title</label>
                                    <input type="text" class="form-input" id="edit-title-${b.id}" value="${escHtml(b.meeting_title)}">
                                </div>
                                <div class="form-group">
                                    <label class="form-label">Status</label>
                                    <select class="form-select" id="edit-status-${b.id}">
                                        <option value="pending" ${b.status === 'pending' ? 'selected' : ''}>Pending</option>
                                        <option value="approved" ${b.status === 'approved' ? 'selected' : ''}>Approved</option>
                                        <option value="rejected" ${b.status === 'rejected' ? 'selected' : ''}>Rejected</option>
                                    </select>
                                </div>
                            </div>
                            <div class="flex gap-sm mt-sm">
                                <button class="btn btn-primary btn-sm" data-save-edit="${b.id}">💾 Save</button>
                                <button class="btn btn-outline btn-sm" data-cancel-edit="${b.id}">Cancel</button>
                            </div>
                        </div>
                    </td>
                </tr>`;
        });

        html += `</tbody></table></div>`;
        container.innerHTML = html;

        // Populate edit form selects after DOM insertion
        filtered.forEach(b => {
            const roomSel = $(`edit-room-${b.id}`);
            const startSel = $(`edit-start-${b.id}`);
            const endSel = $(`edit-end-${b.id}`);
            if (roomSel) populateRoomSelectAll(roomSel, b.room_id);
            if (startSel) populateTimeSelect(startSel, b.start_time);
            if (endSel) populateTimeSelect(endSel, b.end_time);
        });

        // Delegate events on container
        container.removeEventListener('click', handleBookingsTableAction);
        container.addEventListener('click', handleBookingsTableAction);
    }

    function exportBookingsToCSV() {
        if (!cachedAllBookings || cachedAllBookings.length === 0) {
            showToast('No bookings to export.', 'warning');
            return;
        }

        const roomFilter = $('bookings-room-filter').value;
        const dateFilter = $('bookings-date-filter').value;

        // Filter bookings in memory using the same logic as renderAllBookings
        const filtered = cachedAllBookings.filter(b => {
            const matchesRoom = (roomFilter === 'all' || String(b.room_id) === roomFilter);
            const matchesDate = isDateMatch(b.date, dateFilter, 'bookings');
            return matchesRoom && matchesDate;
        });

        if (filtered.length === 0) {
            showToast('No bookings found matching filters to export.', 'warning');
            return;
        }

        // CSV Header
        const headers = ['ID', 'Room Name', 'Booker Name', 'Booker Email', 'Meeting Title', 'Date', 'Start Time', 'End Time', 'Status', 'Handled By', 'Created At'];
        
        // Map room ID to room name
        const roomMap = {};
        if (cachedRooms) {
            cachedRooms.forEach(r => {
                roomMap[r.id] = r.name;
            });
        }

        const rows = filtered.map(b => [
            b.id,
            roomMap[b.room_id] || `Room #${b.room_id}`,
            b.booker_name,
            b.email,
            b.meeting_title,
            b.date,
            b.start_time,
            b.end_time,
            b.status,
            b.handled_by || '',
            b.created_at
        ]);

        // Escape double quotes and join with commas
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(val => {
                const str = String(val === null || val === undefined ? '' : val);
                return `"${str.replace(/"/g, '""')}"`;
            }).join(','))
        ].join('\n');

        // Create download link
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `bookings_export_${new Date().toISOString().substring(0, 10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async function handleBookingsTableAction(e) {
        const target = e.target.closest('[data-toggle-edit], [data-cancel-edit], [data-save-edit], [data-delete-booking]');
        if (!target) return;

        if (target.dataset.toggleEdit) {
            const id = target.dataset.toggleEdit;
            const row = $(`edit-row-${id}`);
            if (row) row.classList.toggle('hidden');
        }

        if (target.dataset.cancelEdit) {
            const id = target.dataset.cancelEdit;
            const row = $(`edit-row-${id}`);
            if (row) row.classList.add('hidden');
        }

        if (target.dataset.saveEdit) {
            const id = target.dataset.saveEdit;
            await saveBookingEdit(id, target);
        }

        if (target.dataset.deleteBooking) {
            const id = target.dataset.deleteBooking;
            await deleteBooking(id);
        }
    }

    async function saveBookingEdit(bookingId, btn) {
        const roomId = $(`edit-room-${bookingId}`).value;
        const date = $(`edit-date-${bookingId}`).value;
        const startTime = $(`edit-start-${bookingId}`).value;
        const endTime = $(`edit-end-${bookingId}`).value;
        const title = $(`edit-title-${bookingId}`).value.trim();
        const status = $(`edit-status-${bookingId}`).value;

        if (!roomId || !date || !startTime || !endTime || !title) {
            showToast('All fields are required.', 'warning');
            return;
        }

        if (startTime >= endTime) {
            showToast('Start time must be before end time.', 'warning');
            return;
        }

        setButtonLoading(btn, true);
        try {
            // Conflict check (exclude self)
            const conflicts = await db.checkConflicts(roomId, date, startTime, endTime, bookingId);
            if (conflicts.length > 0) {
                showToast('Time conflict with another booking!', 'error');
                setButtonLoading(btn, false);
                return;
            }

            const updates = {
                room_id: roomId,
                date,
                start_time: startTime,
                end_time: endTime,
                meeting_title: title,
                status,
            };
            if (status === 'approved' || status === 'rejected') {
                updates.handled_by = adminDisplayName || adminEmail || 'Admin';
            }

            await db.editBooking(bookingId, updates);

            showToast('Booking updated!', 'success');
            loadAllBookings();
        } catch (err) {
            showToast('Failed to update: ' + err.message, 'error');
            setButtonLoading(btn, false);
        }
    }

    async function deleteBooking(bookingId) {
        const confirmed = await showConfirm('Delete Booking', 'Are you sure you want to permanently delete this booking? This cannot be undone.');
        if (!confirmed) return;

        try {
            await db.deleteBooking(bookingId);
            showToast('Booking deleted.', 'success');
            loadAllBookings();
        } catch (err) {
            showToast('Failed to delete: ' + err.message, 'error');
        }
    }

    // Status & Filter changes
    document.addEventListener('DOMContentLoaded', () => {
        const filter = $('bookings-status-filter');
        if (filter) {
            filter.addEventListener('change', () => {
                if (!dashboard.classList.contains('hidden')) {
                    loadAllBookings();
                }
            });
        }

        const bookingsRoomFilter = $('bookings-room-filter');
        if (bookingsRoomFilter) {
            bookingsRoomFilter.addEventListener('change', () => {
                if (!dashboard.classList.contains('hidden')) {
                    renderAllBookings();
                }
            });
        }

        const reviewDateFilter = $('review-date-filter');
        const reviewWeekPicker = $('review-week-picker');
        const reviewMonthPicker = $('review-month-picker');

        function updateReviewPickersVisibility() {
            if (!reviewDateFilter) return;
            const val = reviewDateFilter.value;
            if (reviewWeekPicker) reviewWeekPicker.classList.toggle('hidden', val !== 'week');
            if (reviewMonthPicker) reviewMonthPicker.classList.toggle('hidden', val !== 'month');
            if (val === 'week' && reviewWeekPicker && !reviewWeekPicker.value) {
                reviewWeekPicker.value = getISOWeekString(getCurrentDate());
            }
            if (val === 'month' && reviewMonthPicker && !reviewMonthPicker.value) {
                reviewMonthPicker.value = dateToISO(getCurrentDate()).substring(0, 7);
            }
        }

        if (reviewDateFilter) {
            reviewDateFilter.addEventListener('change', () => {
                updateReviewPickersVisibility();
                if (!dashboard.classList.contains('hidden')) {
                    renderReviewQueue();
                }
            });
        }
        if (reviewWeekPicker) {
            reviewWeekPicker.addEventListener('change', () => {
                if (!dashboard.classList.contains('hidden')) {
                    renderReviewQueue();
                }
            });
        }
        if (reviewMonthPicker) {
            reviewMonthPicker.addEventListener('change', () => {
                if (!dashboard.classList.contains('hidden')) {
                    renderReviewQueue();
                }
            });
        }

        const bookingsDateFilter = $('bookings-date-filter');
        const bookingsWeekPicker = $('bookings-week-picker');
        const bookingsMonthPicker = $('bookings-month-picker');

        function updateBookingsPickersVisibility() {
            if (!bookingsDateFilter) return;
            const val = bookingsDateFilter.value;
            if (bookingsWeekPicker) bookingsWeekPicker.classList.toggle('hidden', val !== 'week');
            if (bookingsMonthPicker) bookingsMonthPicker.classList.toggle('hidden', val !== 'month');
            if (val === 'week' && bookingsWeekPicker && !bookingsWeekPicker.value) {
                bookingsWeekPicker.value = getISOWeekString(getCurrentDate());
            }
            if (val === 'month' && bookingsMonthPicker && !bookingsMonthPicker.value) {
                bookingsMonthPicker.value = dateToISO(getCurrentDate()).substring(0, 7);
            }
        }

        if (bookingsDateFilter) {
            bookingsDateFilter.addEventListener('change', () => {
                updateBookingsPickersVisibility();
                if (!dashboard.classList.contains('hidden')) {
                    renderAllBookings();
                }
            });
        }
        if (bookingsWeekPicker) {
            bookingsWeekPicker.addEventListener('change', () => {
                if (!dashboard.classList.contains('hidden')) {
                    renderAllBookings();
                }
            });
        }
        if (bookingsMonthPicker) {
            bookingsMonthPicker.addEventListener('change', () => {
                if (!dashboard.classList.contains('hidden')) {
                    renderAllBookings();
                }
            });
        }

        const exportBtn = $('btn-export-bookings');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportBookingsToCSV);
        }

        const approveAllBtn = $('btn-approve-all');
        if (approveAllBtn) {
            approveAllBtn.addEventListener('click', handleBulkApprove);
        }

        const rejectAllBtn = $('btn-reject-all');
        if (rejectAllBtn) {
            rejectAllBtn.addEventListener('click', handleBulkReject);
        }
    });

    // Create Booking form (attach once)
    let createBookingFormAttached = false;
    function setupCreateBookingForm() {
        if (createBookingFormAttached) return;
        createBookingFormAttached = true;

        const form = $('create-booking-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const roomId = $('new-booking-room').value;
            const date = $('new-booking-date').value;
            const startTime = $('new-booking-start').value;
            const endTime = $('new-booking-end').value;
            const name = $('new-booking-name').value.trim();
            const email = $('new-booking-email').value.trim();
            const title = $('new-booking-title').value.trim();

            if (!roomId || !date || !startTime || !endTime || !name || !email || !title) {
                showToast('Please fill in all fields.', 'warning');
                return;
            }
            if (startTime >= endTime) {
                showToast('Start time must be before end time.', 'warning');
                return;
            }

            const btn = $('btn-create-booking');
            setButtonLoading(btn, true);
            try {
                const conflicts = await db.checkConflicts(roomId, date, startTime, endTime);
                if (conflicts.length > 0) {
                    showToast('Time conflict! This room is already booked for that slot.', 'error');
                    setButtonLoading(btn, false);
                    return;
                }

                const adminName = adminDisplayName || adminEmail || 'Admin';
                const created = await db.createBookingDirect(roomId, name, email, title, date, startTime, endTime, adminName);
                const shouldSendEmail = $('new-booking-send-email').checked;
                if (shouldSendEmail && created && created[0]) {
                    const roomOption = $('new-booking-room').options[$('new-booking-room').selectedIndex];
                    const roomName = roomOption ? roomOption.textContent.split(' (')[0] : 'Unknown';
                    await EmailService.sendApprovalEmail(created[0], roomName, adminName);
                }

                showToast('Booking created (auto-approved)!', 'success');
                form.reset();
                // Re-populate selects after reset to empty defaults
                populateRoomSelect($('new-booking-room'));
                populateTimeSelect($('new-booking-start'), '');
                populateTimeSelect($('new-booking-end'), '');
                $('new-booking-date').min = dateToISO(getCurrentDate());
                loadAllBookings();
            } catch (err) {
                showToast('Failed to create booking: ' + err.message, 'error');
            } finally {
                setButtonLoading(btn, false);
            }
        });
    }

    let makeBookingsSubtabsAttached = false;
    function setupMakeBookingsSubtabs() {
        if (makeBookingsSubtabsAttached) return;
        const subtabsContainer = $('make-bookings-subtabs');
        if (!subtabsContainer) return;
        makeBookingsSubtabsAttached = true;

        subtabsContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.strategy-tab');
            if (!btn) return;
            const subtabId = btn.dataset.subtab;

            // Update active sub-tab button
            subtabsContainer.querySelectorAll('.strategy-tab').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');

            // Show/hide sub-tab content
            document.querySelectorAll('#tab-make-bookings .subtab-content').forEach(sc => {
                if (sc.id === subtabId) {
                    sc.classList.remove('hidden');
                } else {
                    sc.classList.add('hidden');
                }
            });
        });
    }

    async function initMakeBookingsTab() {
        populateRoomSelect($('new-booking-room'));
        populateTimeSelect($('new-booking-start'), '');
        populateTimeSelect($('new-booking-end'), '');
        $('new-booking-date').min = dateToISO(getCurrentDate());
        setupCreateBookingForm();
        setupMakeBookingsSubtabs();
        await initUploadTab();
    }

    // ============================================
    // TAB 3: MANAGE ROOMS
    // ============================================
    async function loadRooms() {
        const loading = $('rooms-loading');
        const list = $('rooms-list');
        loading.classList.remove('hidden');
        list.innerHTML = '';

        setupAddRoomForm();

        try {
            cachedRooms = await db.getAllRooms();
            populateRoomFilters();
            loading.classList.add('hidden');

            if (!cachedRooms || cachedRooms.length === 0) {
                list.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🏗️</div>
                        <p class="empty-state-text">No rooms configured yet. Add one below!</p>
                    </div>`;
                return;
            }

            let html = '';
            cachedRooms.forEach(room => {
                html += `
                <div class="card mb-md animate-slideUp">
                    <div class="flex justify-between items-center flex-wrap gap-sm">
                        <div>
                            <h3>${escHtml(room.name)}</h3>
                            <p class="text-sm text-secondary">Capacity: ${room.capacity} people</p>
                        </div>
                        <div class="flex items-center gap-sm">
                            <div class="toggle-wrapper">
                                <label class="text-xs text-muted">Active</label>
                                <input type="checkbox" class="toggle" data-toggle-room="${room.id}" ${room.is_active ? 'checked' : ''}>
                            </div>
                            <span class="badge ${room.is_active ? 'badge-approved' : 'badge-rejected'}">${room.is_active ? 'Active' : 'Inactive'}</span>
                            <button class="btn btn-outline btn-xs" data-edit-room-btn="${room.id}">✏️ Edit</button>
                        </div>
                    </div>

                    <!-- Hidden Edit section (shows inline when '✏️ Edit' is clicked) -->
                    <div class="edit-room-form-section mt-md hidden" id="edit-room-form-${room.id}" style="border-top: 1px solid var(--border); padding-top: 1rem;">
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Room Name</label>
                                <input type="text" class="form-input" id="edit-room-name-${room.id}" value="${escHtml(room.name)}">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Capacity</label>
                                <input type="number" class="form-input" id="edit-room-cap-${room.id}" value="${room.capacity}" min="1">
                            </div>
                        </div>
                        <div class="flex gap-sm mt-sm flex-wrap action-group">
                            <button class="btn btn-primary btn-sm" data-save-room="${room.id}">💾 Save</button>
                            <button class="btn btn-danger btn-sm" data-delete-room="${room.id}" data-room-name="${escHtml(room.name)}">🗑️ Delete Room</button>
                            <button class="btn btn-ghost btn-sm" data-cancel-edit-room="${room.id}">Cancel</button>
                        </div>
                    </div>
                </div>`;
            });

            list.innerHTML = html;

            // Delegate all room actions
            list.addEventListener('click', handleRoomAction);
            list.addEventListener('change', handleRoomToggle);
        } catch (err) {
            loading.classList.add('hidden');
            showToast('Failed to load rooms: ' + err.message, 'error');
        }
    }

    function handleRoomAction(e) {
        const target = e.target.closest('[data-edit-room-btn], [data-save-room], [data-delete-room], [data-cancel-edit-room]');
        if (!target) return;

        if (target.dataset.editRoomBtn) {
            const id = target.dataset.editRoomBtn;
            const form = $(`edit-room-form-${id}`);
            if (form) form.classList.toggle('hidden');
        }

        if (target.dataset.cancelEditRoom) {
            const id = target.dataset.cancelEditRoom;
            const form = $(`edit-room-form-${id}`);
            if (form) form.classList.add('hidden');
        }

        if (target.dataset.saveRoom) {
            saveRoom(target.dataset.saveRoom, target);
        }

        if (target.dataset.deleteRoom) {
            deleteRoom(target.dataset.deleteRoom, target.dataset.roomName);
        }
    }

    async function handleRoomToggle(e) {
        const toggle = e.target.closest('[data-toggle-room]');
        if (!toggle) return;

        const roomId = toggle.dataset.toggleRoom;
        const isActive = toggle.checked;

        try {
            await db.updateRoom(roomId, { is_active: isActive });
            showToast(`Room ${isActive ? 'activated' : 'deactivated'}.`, 'success');
            loadRooms();
        } catch (err) {
            showToast('Failed to toggle room: ' + err.message, 'error');
            toggle.checked = !isActive; // Revert
        }
    }

    async function saveRoom(roomId, btn) {
        const name = $(`edit-room-name-${roomId}`).value.trim();
        const capacity = parseInt($(`edit-room-cap-${roomId}`).value, 10);

        if (!name || !capacity || capacity < 1) {
            showToast('Please provide a valid name and capacity.', 'warning');
            return;
        }

        setButtonLoading(btn, true);
        try {
            await db.updateRoom(roomId, { name, capacity });
            showToast('Room updated!', 'success');
            loadRooms();
        } catch (err) {
            showToast('Failed to update room: ' + err.message, 'error');
            setButtonLoading(btn, false);
        }
    }

    async function deleteRoom(roomId, roomName) {
        try {
            const futureCount = await db.getFutureBookingsForRoom(roomId);
            let msg = `Are you sure you want to delete "${roomName}"?`;
            if (futureCount > 0) {
                msg += `\n\n⚠️ WARNING: This room has ${futureCount} future booking(s) that will also be affected!`;
            }

            const confirmed = await showConfirm('Delete Room', msg);
            if (!confirmed) return;

            await db.deleteRoom(roomId);
            showToast('Room deleted.', 'success');
            loadRooms();
        } catch (err) {
            showToast('Failed to delete room: ' + err.message, 'error');
        }
    }

    // Add Room form
    let addRoomFormAttached = false;
    function setupAddRoomForm() {
        if (addRoomFormAttached) return;
        addRoomFormAttached = true;

        $('add-room-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = $('new-room-name').value.trim();
            const capacity = parseInt($('new-room-capacity').value, 10);

            if (!name || !capacity || capacity < 1) {
                showToast('Please provide a valid name and capacity.', 'warning');
                return;
            }

            const btn = $('btn-add-room');
            setButtonLoading(btn, true);
            try {
                await db.createRoom(name, capacity);
                showToast('Room created!', 'success');
                $('add-room-form').reset();
                loadRooms();
            } catch (err) {
                showToast('Failed to create room: ' + err.message, 'error');
            } finally {
                setButtonLoading(btn, false);
            }
        });
    }

    // ============================================
    // TAB 4: MANAGE ADMINS
    // ============================================
    async function loadAdmins() {
        const loading = $('admins-loading');
        const list = $('admins-list');
        loading.classList.remove('hidden');
        list.innerHTML = '';

        setupAddAdminForm();

        try {
            const admins = await db.getAdminUsers();
            const optOuts = await db.getAdminRoomOptOuts();
            const adminCount = admins.length;
            loading.classList.add('hidden');

            if (!admins || admins.length === 0) {
                list.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">👤</div>
                        <p class="empty-state-text">No admins configured.</p>
                    </div>`;
                return;
            }

            let html = '<div class="admin-list">';
            admins.forEach(adm => {
                const isSelf = adminEmail && adm.email.toLowerCase() === adminEmail.toLowerCase();
                const isLastAdmin = adminCount <= 1;
                const canRemove = !isSelf && !isLastAdmin;

                const created = adm.created_at ? new Date(adm.created_at).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric'
                }) : 'N/A';

                const adminOptOuts = optOuts.filter(o => Number(o.admin_id) === Number(adm.id)).map(o => Number(o.room_id));
                const activeRooms = cachedRooms.filter(r => r.is_active);
                let roomsNotificationsHtml = '';
                if (activeRooms.length > 0) {
                    roomsNotificationsHtml = `
                        <div class="admin-notifications-section" style="border-top: 1px solid var(--border); padding-top: 0.7rem; margin-top: 0.7rem;">
                            <span class="text-xs font-semibold text-secondary block mb-xs">🔔 Email Notifications for Rooms:</span>
                            <div class="flex flex-wrap gap-sm">
                                ${activeRooms.map(room => {
                                    const isOptedOut = adminOptOuts.includes(Number(room.id));
                                    return `
                                        <label class="checkbox-item" style="display: flex; align-items: center; gap: 0.25rem; font-size: 0.75rem; cursor: pointer; margin-right: 0.5rem; margin-bottom: 0;">
                                            <input type="checkbox" class="admin-opt-out-checkbox" data-admin-id="${adm.id}" data-room-id="${room.id}" ${!isOptedOut ? 'checked' : ''} style="width: auto; cursor: pointer;">
                                            <span>${escHtml(room.name)}</span>
                                        </label>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                }

                html += `
                <div class="admin-list-item animate-slideUp">
                    <div class="admin-list-avatar">${(adm.display_name || adm.email).charAt(0).toUpperCase()}</div>
                    <div class="admin-list-info">
                        <div class="admin-list-name">
                            ${escHtml(adm.display_name || '(No Display Name)')}
                            ${isSelf ? '<span class="badge badge-info" style="font-size:0.65rem; padding: 1px 6px; margin-left: 6px;">You</span>' : ''}
                        </div>
                        <div class="admin-list-email">${escHtml(adm.email)}</div>
                        <div class="admin-list-meta">Added ${created}</div>
                    </div>
                    <div class="admin-list-actions">
                        <button class="btn btn-outline btn-xs" data-edit-admin-btn="${adm.id}">✏️ Edit</button>
                        ${canRemove ? `<button class="btn btn-danger btn-xs" data-remove-admin="${adm.id}" data-admin-email="${escHtml(adm.email)}">🗑️</button>` : ''}
                        ${isLastAdmin && isSelf ? '<span class="text-xs text-muted">Last admin</span>' : ''}
                    </div>
                </div>
                <!-- Inline Edit + Notifications Panel -->
                <div class="hidden edit-admin-panel" id="edit-admin-form-${adm.id}">
                    <div class="edit-admin-fields">
                        <div class="form-group">
                            <label class="form-label text-xs">Display Name</label>
                            <input type="text" class="form-input form-input-sm" id="edit-admin-name-input-${adm.id}" value="${escHtml(adm.display_name || '')}" placeholder="Enter display name">
                        </div>
                        <div class="edit-admin-buttons">
                            <button class="btn btn-approve btn-sm" data-save-admin-name="${adm.id}">💾 Save</button>
                            <button class="btn btn-ghost btn-sm" data-cancel-edit-admin="${adm.id}">Cancel</button>
                        </div>
                    </div>
                    ${roomsNotificationsHtml}
                </div>`;
            });
            html += '</div>';

            list.innerHTML = html;
            list.removeEventListener('click', handleAdminAction);
            list.addEventListener('click', handleAdminAction);
        } catch (err) {
            loading.classList.add('hidden');
            showToast('Failed to load admins: ' + err.message, 'error');
        }
    }

    async function handleAdminAction(e) {
        if (e.target.classList.contains('admin-opt-out-checkbox')) {
            const adminId = parseInt(e.target.dataset.adminId, 10);
            const roomId = parseInt(e.target.dataset.roomId, 10);
            const receiveNotifications = e.target.checked;
            
            try {
                if (receiveNotifications) {
                    await db.removeAdminOptOut(adminId, roomId);
                    showToast('Opted in to room notifications.', 'success');
                } else {
                    await db.addAdminOptOut(adminId, roomId);
                    showToast('Opted out from room notifications.', 'success');
                }
            } catch (err) {
                showToast('Failed to update notification preference: ' + err.message, 'error');
                e.target.checked = !receiveNotifications; // revert
            }
            return;
        }

        const target = e.target.closest('[data-remove-admin], [data-edit-admin-btn], [data-save-admin-name], [data-cancel-edit-admin]');
        if (!target) return;

        if (target.dataset.editAdminBtn) {
            const id = target.dataset.editAdminBtn;
            const form = $(`edit-admin-form-${id}`);
            if (form) form.classList.toggle('hidden');
        } else if (target.dataset.cancelEditAdmin) {
            const id = target.dataset.cancelEditAdmin;
            const form = $(`edit-admin-form-${id}`);
            if (form) form.classList.add('hidden');
        } else if (target.dataset.saveAdminName) {
            const id = target.dataset.saveAdminName;
            const nameInput = $(`edit-admin-name-input-${id}`);
            const displayName = nameInput.value.trim();

            setButtonLoading(target, true);
            try {
                await db.updateAdmin(id, { display_name: displayName || null });
                showToast('Admin display name updated.', 'success');
                loadAdmins();
                updateSidebarAdminName();
            } catch (err) {
                showToast('Failed to update display name: ' + err.message, 'error');
                setButtonLoading(target, false);
            }
        } else if (target.dataset.removeAdmin) {
            const adminId = target.dataset.removeAdmin;
            const email = target.dataset.adminEmail;

            const confirmed = await showConfirm('Remove Admin', `Remove admin access for ${email}?`);
            if (!confirmed) return;

            setButtonLoading(target, true);
            try {
                await db.removeAdmin(adminId);
                showToast('Admin removed.', 'success');
                loadAdmins();
            } catch (err) {
                showToast('Failed to remove admin: ' + err.message, 'error');
                setButtonLoading(target, false);
            }
        }
    }

    // Add admin form
    let addAdminFormAttached = false;
    function setupAddAdminForm() {
        if (addAdminFormAttached) return;
        addAdminFormAttached = true;

        $('add-admin-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = $('new-admin-email').value.trim();
            const displayName = $('new-admin-name').value.trim();

            if (!email) {
                showToast('Email is required.', 'warning');
                return;
            }

            const btn = $('btn-add-admin');
            setButtonLoading(btn, true);
            try {
                // Check if already admin
                const existing = await db.isAdmin(email);
                if (existing) {
                    showToast('This email is already an admin.', 'warning');
                    setButtonLoading(btn, false);
                    return;
                }

                await db.addAdmin(email, displayName || null);
                showToast('Admin added!', 'success');
                $('add-admin-form').reset();
                loadAdmins();
            } catch (err) {
                showToast('Failed to add admin: ' + err.message, 'error');
            } finally {
                setButtonLoading(btn, false);
            }
        });
    }

    // ============================================
    // TAB 5: SETTINGS
    // ============================================
    async function loadSettings() {
        loadDomains();
        loadOperatingHours();
        loadMinDuration();
    }

    // ----- Allowed Email Domains -----
    async function loadDomains() {
        const loading = $('domains-loading');
        const list = $('domains-list');
        loading.classList.remove('hidden');
        list.innerHTML = '';

        setupAddDomainForm();

        try {
            const domains = await db.getAllowedDomains();
            loading.classList.add('hidden');

            if (!domains || domains.length === 0) {
                list.innerHTML = '<p class="text-sm text-muted">No domains configured. All emails are accepted.</p>';
                return;
            }

            let html = '';
            domains.forEach(d => {
                html += `
                <div class="flex justify-between items-center mb-sm" style="padding: 0.4rem 0.6rem; background: var(--bg-input); border-radius: var(--radius-sm);">
                    <span class="text-sm font-semibold">${escHtml(d.domain)}</span>
                    <button class="btn btn-ghost btn-sm text-danger" data-remove-domain="${d.id}">🗑️</button>
                </div>`;
            });
            list.innerHTML = html;

            list.addEventListener('click', async (e) => {
                const btn = e.target.closest('[data-remove-domain]');
                if (!btn) return;
                const domainId = btn.dataset.removeDomain;
                try {
                    await db.removeAllowedDomain(domainId);
                    showToast('Domain removed.', 'success');
                    loadDomains();
                } catch (err) {
                    showToast('Failed to remove domain: ' + err.message, 'error');
                }
            });
        } catch (err) {
            loading.classList.add('hidden');
            showToast('Failed to load domains: ' + err.message, 'error');
        }
    }

    let addDomainFormAttached = false;
    function setupAddDomainForm() {
        if (addDomainFormAttached) return;
        addDomainFormAttached = true;

        $('add-domain-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const domain = $('new-domain').value.trim();
            if (!domain) return;

            try {
                await db.addAllowedDomain(domain);
                showToast('Domain added!', 'success');
                $('new-domain').value = '';
                loadDomains();
            } catch (err) {
                showToast('Failed to add domain: ' + err.message, 'error');
            }
        });
    }

    // ----- Operating Hours -----
    async function loadOperatingHours() {
        try {
            cachedOperatingHours = await db.getOperatingHours();
            $('hours-current').innerHTML = `Current: <strong>${formatTime(cachedOperatingHours.start)}</strong> — <strong>${formatTime(cachedOperatingHours.end)}</strong>`;
            $('settings-hours-start').value = cachedOperatingHours.start;
            $('settings-hours-end').value = cachedOperatingHours.end;
        } catch (err) {
            showToast('Failed to load operating hours.', 'error');
        }

        setupOperatingHoursForm();
    }

    let opHoursFormAttached = false;
    function setupOperatingHoursForm() {
        if (opHoursFormAttached) return;
        opHoursFormAttached = true;

        $('operating-hours-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const start = $('settings-hours-start').value;
            const end = $('settings-hours-end').value;

            if (!start || !end) {
                showToast('Please set both start and end times.', 'warning');
                return;
            }
            if (start >= end) {
                showToast('Start must be before end.', 'warning');
                return;
            }

            const btn = $('btn-save-hours');
            setButtonLoading(btn, true);
            try {
                await db.updateSetting('operating_hours_start', start);
                await db.updateSetting('operating_hours_end', end);
                cachedOperatingHours = { start, end };
                showToast('Operating hours saved!', 'success');
                loadOperatingHours();
            } catch (err) {
                showToast('Failed to save: ' + err.message, 'error');
            } finally {
                setButtonLoading(btn, false);
            }
        });
    }

    // ----- Min Booking Duration -----
    async function loadMinDuration() {
        try {
            const val = await db.getSetting('min_booking_minutes', String(AppConfig.MIN_BOOKING_MINUTES));
            $('min-duration-current').innerHTML = `Current: <strong>${val} minutes</strong>`;
            $('settings-min-duration').value = val;
        } catch (err) {
            showToast('Failed to load min duration.', 'error');
        }

        setupMinDurationForm();
    }

    let minDurFormAttached = false;
    function setupMinDurationForm() {
        if (minDurFormAttached) return;
        minDurFormAttached = true;

        $('min-duration-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const val = parseInt($('settings-min-duration').value, 10);
            if (!val || val < 10) {
                showToast('Minimum is 10 minutes.', 'warning');
                return;
            }

            const btn = $('btn-save-duration');
            setButtonLoading(btn, true);
            try {
                await db.updateSetting('min_booking_minutes', String(val));
                showToast('Minimum duration saved!', 'success');
                loadMinDuration();
            } catch (err) {
                showToast('Failed to save: ' + err.message, 'error');
            } finally {
                setButtonLoading(btn, false);
            }
        });
    }

    // ============================================
    // TAB 6: EXCEL UPLOAD LOGIC
    // ============================================
    let uploadEventsAttached = false;
    let parsedBookings = [];
    let cachedAllowedDomains = [];
    let cachedMinBookingDuration = AppConfig.MIN_BOOKING_MINUTES;

    async function initUploadTab() {
        try {
            cachedAllowedDomains = await db.getAllowedDomains();
            const minDur = await db.getSetting('min_booking_minutes', String(AppConfig.MIN_BOOKING_MINUTES));
            cachedMinBookingDuration = parseInt(minDur, 10) || AppConfig.MIN_BOOKING_MINUTES;
        } catch (err) {
            console.warn("Failed to load domains/settings for upload validations:", err);
        }

        setupUploadTabEvents();
    }

    function setupUploadTabEvents() {
        if (uploadEventsAttached) return;
        uploadEventsAttached = true;

        const dropZone = $('file-drop-zone');
        const fileInput = $('bulk-file-input');
        const downloadBtn = $('btn-download-template');
        const importBtn = $('btn-import-bookings');
        const clearBtn = $('btn-clear-upload');

        // Download Template
        if (downloadBtn) {
            downloadBtn.addEventListener('click', downloadExcelTemplate);
        }

        // Drop Zone Drag & Drop
        if (dropZone) {
            dropZone.addEventListener('click', () => fileInput.click());

            ['dragenter', 'dragover'].forEach(eventName => {
                dropZone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    dropZone.classList.add('dragover');
                }, false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    dropZone.classList.remove('dragover');
                }, false);
            });

            dropZone.addEventListener('drop', (e) => {
                const dt = e.dataTransfer;
                const files = dt.files;
                if (files.length > 0) {
                    fileInput.files = files;
                    handleFileSelect(files[0]);
                }
            }, false);
        }

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                handleFileSelect(file);
            });
        }

        if (importBtn) {
            importBtn.addEventListener('click', handleImportClick);
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', clearUploadState);
        }
    }

    function downloadExcelTemplate() {
        if (typeof XLSX === 'undefined') {
            showToast("SheetJS library not loaded yet.", "error");
            return;
        }
        
        const headers = [
            ["Room Name", "Booker Name", "Booker Email", "Meeting Title", "Date", "Start Time", "End Time"],
            ["Meeting Room A", "John Doe", "john.doe@mahsa.edu.my", "Project Kickoff", "2026-07-01", "09:00", "10:30"],
            ["Meeting Room B", "Jane Smith", "jane.smith@mahsa.edu.my", "Staff Meeting", "2026-07-01", "14:00", "15:00"]
        ];

        try {
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(headers);

            ws['!cols'] = [
                { wch: 20 }, // Room Name
                { wch: 18 }, // Booker Name
                { wch: 25 }, // Booker Email
                { wch: 22 }, // Meeting Title
                { wch: 12 }, // Date
                { wch: 10 }, // Start Time
                { wch: 10 }  // End Time
            ];

            XLSX.utils.book_append_sheet(wb, ws, "FOD Bulk Bookings");
            XLSX.writeFile(wb, "FOD_Bulk_Booking_Template.xlsx");
            showToast("Template downloaded successfully!", "success");
        } catch (err) {
            showToast("Failed to generate template: " + err.message, "error");
        }
    }

    function handleFileSelect(file) {
        if (!file) return;

        const fileInfo = $('file-info');
        if (fileInfo) {
            fileInfo.textContent = `📄 Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            fileInfo.classList.remove('hidden');
        }

        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                if (typeof XLSX === 'undefined') {
                    showToast("XLSX parser library not loaded.", "error");
                    return;
                }
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
                await processParsedRows(rows);
            } catch (err) {
                showToast("Error reading spreadsheet: " + err.message, "error");
            }
        };
        reader.readAsArrayBuffer(file);
    }

    async function processParsedRows(rows) {
        if (!rows || rows.length < 2) {
            showToast("The file is empty or missing data rows.", "warning");
            return;
        }

        const headers = rows[0].map(h => String(h).trim().toLowerCase());
        const colIndices = {
            room: headers.indexOf("room name"),
            booker: headers.indexOf("booker name"),
            email: headers.indexOf("booker email"),
            title: headers.indexOf("meeting title"),
            date: headers.indexOf("date"),
            start: headers.indexOf("start time"),
            end: headers.indexOf("end time")
        };

        const missing = Object.keys(colIndices).filter(k => colIndices[k] === -1);
        if (missing.length > 0) {
            showToast("Missing column headers: " + missing.join(", "), "error");
            return;
        }

        const parsedRecords = [];
        
        const formatExcelTime = (val) => {
            if (val === undefined || val === null || val === "") return "";
            
            const num = Number(val);
            if (!isNaN(num) && num >= 0 && num < 1) {
                const totalMinutes = Math.round(num * 24 * 60);
                const hours = Math.floor(totalMinutes / 60);
                const minutes = totalMinutes % 60;
                return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
            }

            let clean = String(val).trim();

            const ampmMatch = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
            if (ampmMatch) {
                let h = parseInt(ampmMatch[1], 10);
                const m = ampmMatch[2];
                const period = ampmMatch[3].toUpperCase();
                if (period === 'PM' && h < 12) h += 12;
                if (period === 'AM' && h === 12) h = 0;
                return `${String(h).padStart(2, '0')}:${m}`;
            }

            const hmsMatch = clean.match(/^(\d{1,2}):(\d{2}):\d{2}$/);
            if (hmsMatch) {
                return `${String(hmsMatch[1]).padStart(2, '0')}:${hmsMatch[2]}`;
            }

            const hmMatch = clean.match(/^(\d{1,2}):(\d{2})$/);
            if (hmMatch) {
                return `${String(hmMatch[1]).padStart(2, '0')}:${hmMatch[2]}`;
            }

            return clean;
        };

        const formatExcelDate = (val) => {
            if (val === undefined || val === null || val === "") return "";
            
            const num = Number(val);
            if (!isNaN(num) && num > 30000) {
                const date = new Date((num - 25569) * 86400 * 1000);
                return dateToISO(date);
            }

            let clean = String(val).trim();
            const d = new Date(clean);
            if (!isNaN(d.getTime())) {
                return dateToISO(d);
            }
            return clean;
        };

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row.length === 0 || row.every(val => val === undefined || val === null || String(val).trim() === "")) {
                continue;
            }

            const getVal = (idx) => {
                const val = row[idx];
                return val !== undefined && val !== null ? String(val).trim() : "";
            };

            parsedRecords.push({
                rowIndex: i + 1,
                roomName: getVal(colIndices.room),
                bookerName: getVal(colIndices.booker),
                email: getVal(colIndices.email),
                meetingTitle: getVal(colIndices.title),
                date: formatExcelDate(row[colIndices.date]),
                startTime: formatExcelTime(row[colIndices.start]),
                endTime: formatExcelTime(row[colIndices.end]),
                roomId: null,
                status: 'pending',
                errorMessage: ''
            });
        }

        if (parsedRecords.length === 0) {
            showToast("No valid booking rows found in sheet.", "warning");
            return;
        }

        parsedBookings = parsedRecords;
        await validateParsedRecords();
    }

    async function validateParsedRecords() {
        const previewSection = $('upload-preview-section');
        const alertBox = $('upload-global-alert');
        if (previewSection) previewSection.classList.remove('hidden');
        if (alertBox) alertBox.classList.add('hidden');

        parsedBookings.forEach(record => {
            const matchedRoom = cachedRooms.find(r => r.name.toLowerCase().trim() === record.roomName.toLowerCase().trim());
            if (!matchedRoom) {
                record.status = 'error';
                record.errorMessage = 'Room not found';
                return;
            }
            if (!matchedRoom.is_active) {
                record.status = 'error';
                record.errorMessage = 'Room is inactive';
                return;
            }
            record.roomId = matchedRoom.id;

            if (!record.bookerName) {
                record.status = 'error';
                record.errorMessage = 'Missing booker name';
                return;
            }
            if (!record.meetingTitle) {
                record.status = 'error';
                record.errorMessage = 'Missing meeting title';
                return;
            }

            if (!record.email) {
                record.status = 'error';
                record.errorMessage = 'Missing booker email';
                return;
            }
            const emailLower = record.email.toLowerCase();
            const hasAllowedDomain = cachedAllowedDomains.some(d => emailLower.endsWith(d.domain.toLowerCase()));
            if (!hasAllowedDomain) {
                record.status = 'error';
                record.errorMessage = 'Email domain not allowed';
                return;
            }

            if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date)) {
                record.status = 'error';
                record.errorMessage = 'Invalid Date (use YYYY-MM-DD)';
                return;
            }

            const timeRegex = /^\d{2}:\d{2}$/;
            if (!timeRegex.test(record.startTime) || !timeRegex.test(record.endTime)) {
                record.status = 'error';
                record.errorMessage = 'Invalid time format (use HH:MM)';
                return;
            }

            if (record.startTime >= record.endTime) {
                record.status = 'error';
                record.errorMessage = 'Start time must be before End time';
                return;
            }

            const duration = durationMinutes(record.startTime, record.endTime);
            if (duration < cachedMinBookingDuration) {
                record.status = 'error';
                record.errorMessage = `Duration below minimum (${cachedMinBookingDuration} mins)`;
                return;
            }

            if (record.startTime < cachedOperatingHours.start || record.endTime > cachedOperatingHours.end) {
                record.status = 'error';
                record.errorMessage = `Outside operating hours (${formatTime(cachedOperatingHours.start)} - ${formatTime(cachedOperatingHours.end)})`;
                return;
            }

            record.status = 'valid';
        });

        const validDates = parsedBookings.filter(r => r.status === 'valid').map(r => r.date);
        if (validDates.length > 0) {
            const minDate = validDates.reduce((a, b) => a < b ? a : b);
            const maxDate = validDates.reduce((a, b) => a > b ? a : b);

            try {
                const dbBookings = await db.getBookingsForDateRange(minDate, maxDate);

                parsedBookings.forEach((record, index) => {
                    if (record.status !== 'valid') return;

                    const dbConflict = dbBookings.find(dbb => 
                        dbb.room_id === record.roomId &&
                        dbb.date === record.date &&
                        dbb.start_time < record.endTime &&
                        dbb.end_time > record.startTime
                    );

                    if (dbConflict) {
                        record.status = 'conflict';
                        record.errorMessage = `Conflict: ${dbConflict.meeting_title} (${formatTime(dbConflict.start_time)}-${formatTime(dbConflict.end_time)})`;
                        return;
                    }

                    const internalConflict = parsedBookings.slice(0, index).find(prev => 
                        prev.status === 'valid' &&
                        prev.roomId === record.roomId &&
                        prev.date === record.date &&
                        prev.startTime < record.endTime &&
                        prev.endTime > record.startTime
                    );

                    if (internalConflict) {
                        record.status = 'conflict';
                        record.errorMessage = `Conflict with Row ${internalConflict.rowIndex}`;
                    }
                });
            } catch (err) {
                console.error("Conflict checking query failed:", err);
                if (alertBox) {
                    alertBox.textContent = "⚠️ Warning: Database conflict check failed. Availability could not be verified: " + err.message;
                    alertBox.classList.remove('hidden');
                }
            }
        }

        renderPreviewTable();
    }

    function renderPreviewTable() {
        const body = $('preview-table-body');
        if (!body) return;
        body.innerHTML = '';

        let total = parsedBookings.length;
        let validCount = 0;
        let errorCount = 0;

        parsedBookings.forEach(b => {
            let badgeClass = 'badge-pending';
            let badgeText = 'Pending';

            if (b.status === 'valid') {
                badgeClass = 'badge-approved';
                badgeText = '✅ Ready';
                validCount++;
            } else if (b.status === 'conflict') {
                badgeClass = 'badge-warning';
                badgeText = '⚠️ Conflict';
                errorCount++;
            } else if (b.status === 'error') {
                badgeClass = 'badge-rejected';
                badgeText = '❌ Error';
                errorCount++;
            }

            const tr = document.createElement('tr');
            tr.className = b.status === 'error' ? 'row-error' : b.status === 'conflict' ? 'row-conflict' : '';
            tr.innerHTML = `
                <td><strong>#${b.rowIndex}</strong></td>
                <td>${escHtml(b.roomName)}</td>
                <td>${escHtml(b.bookerName)}</td>
                <td><span class="text-xs">${escHtml(b.email)}</span></td>
                <td>${escHtml(b.meetingTitle)}</td>
                <td><code class="text-xs">${b.date}</code></td>
                <td><code class="text-xs">${formatTime(b.startTime)} - ${formatTime(b.endTime)}</code></td>
                <td>
                    <span class="badge ${badgeClass}" title="${escHtml(b.errorMessage)}">${badgeText}</span>
                    ${b.errorMessage ? `<div class="text-xs text-danger font-semibold mt-xs" style="max-width: 200px; line-height:1.2;">${escHtml(b.errorMessage)}</div>` : ''}
                </td>
            `;
            body.appendChild(tr);
        });

        const totalBadge = $('badge-total-rows');
        const validBadge = $('badge-valid-rows');
        const invalidBadge = $('badge-invalid-rows');
        const importBtn = $('btn-import-bookings');

        if (totalBadge) totalBadge.textContent = `Total: ${total}`;
        if (validBadge) validBadge.textContent = `Valid: ${validCount}`;
        if (invalidBadge) invalidBadge.textContent = `Issues: ${errorCount}`;

        if (importBtn) {
            importBtn.disabled = validCount === 0;
            importBtn.textContent = `🚀 Import ${validCount} Valid Booking${validCount === 1 ? '' : 's'}`;
        }
    }

    async function handleImportClick() {
        const validRecords = parsedBookings.filter(b => b.status === 'valid');
        if (validRecords.length === 0) {
            showToast("No valid rows to import.", "warning");
            return;
        }

        const importBtn = $('btn-import-bookings');
        setButtonLoading(importBtn, true);

        const recordsToInsert = validRecords.map(r => ({
            room_id: r.roomId,
            booker_name: r.bookerName.trim(),
            email: r.email.toLowerCase().trim(),
            meeting_title: r.meetingTitle.trim(),
            date: r.date,
            start_time: r.startTime,
            end_time: r.endTime,
            status: 'approved',
            handled_by: adminDisplayName || adminEmail || 'Admin'
        }));

        try {
            const insertedData = await db.createBookingsDirectBatch(recordsToInsert);

            const shouldSendEmail = $('upload-send-email').checked;
            if (shouldSendEmail && insertedData && insertedData.length > 0) {
                insertedData.forEach(booking => {
                    const roomObj = cachedRooms.find(r => r.id === booking.room_id);
                    const roomName = roomObj ? roomObj.name : 'Selected Room';
                    EmailService.sendApprovalEmail(booking, roomName).catch(err => {
                        console.warn(`Failed to send bulk approval email to ${booking.email}:`, err);
                    });
                });
            }

            showToast(`🎉 Successfully imported ${insertedData.length} bookings!`, "success");
            clearUploadState();
            
            loadAllBookings();
        } catch (err) {
            showToast("Bulk import failed: " + err.message, "error");
        } finally {
            setButtonLoading(importBtn, false);
        }
    }

    function clearUploadState() {
        parsedBookings = [];
        const fileInput = $('bulk-file-input');
        if (fileInput) fileInput.value = '';
        
        const fileInfo = $('file-info');
        if (fileInfo) {
            fileInfo.classList.add('hidden');
            fileInfo.textContent = '';
        }

        const previewSection = $('upload-preview-section');
        if (previewSection) previewSection.classList.add('hidden');

        const body = $('preview-table-body');
        if (body) body.innerHTML = '';

        const alertBox = $('upload-global-alert');
        if (alertBox) alertBox.classList.add('hidden');
    }

})();
