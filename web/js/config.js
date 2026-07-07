/**
 * FOD Rooms — Application Configuration
 * Timezone, operating hours, time-slot helpers, and formatting utilities.
 */

const AppConfig = {
    TIMEZONE: 'Asia/Kuala_Lumpur',
    DEFAULT_OPERATING_START: '08:00',
    DEFAULT_OPERATING_END: '18:00',
    MIN_BOOKING_MINUTES: 30,
    SLOT_INCREMENT_MINUTES: 30,
    APP_TITLE: 'FOD Room Booking',
    APP_ICON: '🏢',
    WEEKDAY_NAMES: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
};

/**
 * Get current date/time in Malaysia timezone.
 */
function getCurrentDateTime() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: AppConfig.TIMEZONE }));
}

function getCurrentDate() {
    const dt = getCurrentDateTime();
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

/**
 * Generate an array of time strings (HH:MM) from start to end in increments.
 * @param {string} start - e.g. "08:00"
 * @param {string} end   - e.g. "18:00"
 * @param {number} increment - minutes
 * @returns {string[]}
 */
function generateTimeSlots(start, end, increment) {
    start = start || AppConfig.DEFAULT_OPERATING_START;
    end = end || AppConfig.DEFAULT_OPERATING_END;
    increment = increment || AppConfig.SLOT_INCREMENT_MINUTES;

    const slots = [];
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let current = sh * 60 + sm;
    const endMin = eh * 60 + em;

    while (current <= endMin) {
        const h = Math.floor(current / 60);
        const m = current % 60;
        slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        current += increment;
    }
    return slots;
}

/**
 * Format a time string (HH:MM) to 12-hour format (e.g. "2:30 PM").
 */
function formatTime(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Format a date string (YYYY-MM-DD) to a readable form (e.g. "Monday, June 16, 2026").
 */
function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

/**
 * Format date as short form (e.g. "16 Jun").
 */
function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/**
 * Calculate duration in minutes between two HH:MM time strings.
 */
function durationMinutes(startStr, endStr) {
    const [sh, sm] = startStr.split(':').map(Number);
    const [eh, em] = endStr.split(':').map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
}

/**
 * Convert a Date object to YYYY-MM-DD string.
 */
function dateToISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * Add days to a date string.
 */
function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return dateToISO(d);
}

/**
 * Get the Monday of the week containing a date.
 */
function getWeekStart(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay(); // 0=Sun
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    d.setDate(diff);
    return dateToISO(d);
}

/**
 * Generate recurring dates for a given weekday (0=Mon…6=Sun)
 * from startDateStr until endDate (inclusive).
 */
function generateRecurringDates(dayOfWeekIndex, endDateStr, startDateStr) {
    const start = startDateStr ? new Date(startDateStr + 'T00:00:00') : getCurrentDate();
    const endDate = new Date(endDateStr + 'T00:00:00');
    const dates = [];

    // Find first occurrence of target weekday on or after start date
    const startDay = (start.getDay() + 6) % 7; // Convert Sun=0 to Mon=0
    let daysAhead = (dayOfWeekIndex - startDay + 7) % 7;

    const first = new Date(start);
    first.setDate(first.getDate() + daysAhead);

    const current = new Date(first);
    while (current <= endDate) {
        dates.push(dateToISO(current));
        current.setDate(current.getDate() + 7);
    }
    return dates;
}


/* ============================================
   UI HELPERS — Toast, Modal, Loading
   ============================================ */

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {number} duration - ms
 */
function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * Show a confirmation modal.
 * @returns {Promise<boolean>}
 */
function showConfirm(title, message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3 class="modal-title">${title}</h3>
                    <button class="modal-close" data-action="cancel">&times;</button>
                </div>
                <div class="modal-body">
                    <p>${message}</p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" data-action="cancel">Cancel</button>
                    <button class="btn btn-danger" data-action="confirm">Confirm</button>
                </div>
            </div>
        `;

        overlay.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            if (action === 'confirm') { overlay.remove(); resolve(true); }
            else if (action === 'cancel' || e.target === overlay) { overlay.remove(); resolve(false); }
        });

        document.body.appendChild(overlay);
    });
}

/**
 * Show a confirmation modal for bulk actions with an email notification checkbox.
 * @returns {Promise<{confirmed: boolean, sendEmail: boolean}>}
 */
function showConfirmBulkAction(title, message, confirmBtnClass = 'btn-danger') {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3 class="modal-title">${title}</h3>
                    <button class="modal-close" data-action="cancel">&times;</button>
                </div>
                <div class="modal-body">
                    <p class="mb-md">${message}</p>
                    <label class="checkbox-item" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; margin-top: 1.25rem;">
                        <input type="checkbox" id="bulk-confirm-send-email" checked style="width: auto; cursor: pointer;">
                        <span>Send confirmation email notifications to bookers</span>
                    </label>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" data-action="cancel">Cancel</button>
                    <button class="btn ${confirmBtnClass}" data-action="confirm">Confirm</button>
                </div>
            </div>
        `;

        overlay.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            if (action === 'confirm') {
                const sendEmail = !!document.getElementById('bulk-confirm-send-email')?.checked;
                overlay.remove();
                resolve({ confirmed: true, sendEmail });
            } else if (action === 'cancel' || e.target === overlay) {
                overlay.remove();
                resolve({ confirmed: false, sendEmail: false });
            }
        });

        document.body.appendChild(overlay);
    });
}

/**
 * Set a button to loading state.
 */
function setButtonLoading(btn, loading) {
    if (loading) {
        btn.classList.add('loading');
        btn.disabled = true;
        btn._originalText = btn.textContent;
    } else {
        btn.classList.remove('loading');
        btn.disabled = false;
        if (btn._originalText) btn.textContent = btn._originalText;
    }
}

/**
 * Trigger confetti celebration.
 */
function showConfetti() {
    const container = document.createElement('div');
    container.className = 'confetti-container';
    const colors = ['#6C63FF', '#00D2FF', '#FFB300', '#00C853', '#FF5252', '#E040FB'];

    for (let i = 0; i < 60; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = Math.random() * 100 + '%';
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.animationDelay = Math.random() * 1.5 + 's';
        piece.style.animationDuration = (2 + Math.random() * 2) + 's';
        piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
        piece.style.width = (5 + Math.random() * 8) + 'px';
        piece.style.height = piece.style.width;
        container.appendChild(piece);
    }

    document.body.appendChild(container);
    setTimeout(() => container.remove(), 4000);
}


/* ============================================
   SIDEBAR TOGGLE (MOBILE)
   ============================================ */

function initSidebar() {
    const hamburger = document.getElementById('hamburger');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (!hamburger || !sidebar) return;

    hamburger.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        if (overlay) overlay.classList.toggle('active');
    });

    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        });
    }

    // Mark active nav link
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-link').forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPage || (currentPage === 'index.html' && href === 'book.html')) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// Initialize sidebar on DOM ready
document.addEventListener('DOMContentLoaded', initSidebar);
