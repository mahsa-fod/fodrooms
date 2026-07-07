/**
 * FOD Rooms — Calendar View
 * Weekly schedule grid showing room bookings.
 */

(function () {
    'use strict';

    // ============================================
    // STATE
    // ============================================

    let rooms = [];
    let selectedRoomId = null;
    let weekStartDate = null;        // YYYY-MM-DD string (always a Monday)
    let cachedTimeSlots = [];
    let cachedBookings = [];
    let selectedDate = null;         // YYYY-MM-DD
    let selectedSlots = [];          // Array of HH:MM strings (sorted)

    // ============================================
    // DOM REFERENCES
    // ============================================

    const roomSelect      = document.getElementById('room-select');
    const weekDateInput   = document.getElementById('week-date-input');
    const btnPrev         = document.getElementById('btn-prev-week');
    const btnNext         = document.getElementById('btn-next-week');
    const calendarWrapper = document.getElementById('calendar-wrapper');
    const calendarLoading = document.getElementById('calendar-loading');
    const calendarLegend  = document.getElementById('calendar-legend');
    const selectionPanel  = document.getElementById('selection-panel');
    const selectionText   = document.getElementById('selection-text');
    const btnMakeBooking  = document.getElementById('btn-make-booking-panel');

    // ============================================
    // INIT
    // ============================================

    document.addEventListener('DOMContentLoaded', async () => {
        // Compute current Monday
        const todayISO = dateToISO(getCurrentDate());
        weekStartDate = getWeekStart(todayISO);
        weekDateInput.value = weekStartDate;

        await loadRooms();
        bindEvents();
    });

    // ============================================
    // LOAD ROOMS
    // ============================================

    async function loadRooms() {
        try {
            rooms = await db.getRooms();

            if (!rooms || rooms.length === 0) {
                roomSelect.innerHTML = '<option value="">No rooms available</option>';
                showToast('No active rooms configured.', 'warning');
                return;
            }

            roomSelect.innerHTML = '<option value="">-- Select a Room --</option>' + rooms.map(r =>
                `<option value="${r.id}">🏢 ${escapeHTML(r.name)} (capacity: ${r.capacity ?? '?'})</option>`
            ).join('');

            selectedRoomId = '';
            roomSelect.value = '';
            await renderCalendar();
        } catch (err) {
            showToast('Failed to load rooms: ' + err.message, 'error');
            roomSelect.innerHTML = '<option value="">Error loading rooms</option>';
        }
    }

    // ============================================
    // EVENTS
    // ============================================

    function bindEvents() {
        roomSelect.addEventListener('change', () => {
            selectedRoomId = roomSelect.value;
            renderCalendar();
        });

        btnPrev.addEventListener('click', () => {
            weekStartDate = addDays(weekStartDate, -7);
            weekDateInput.value = weekStartDate;
            renderCalendar();
        });

        btnNext.addEventListener('click', () => {
            weekStartDate = addDays(weekStartDate, 7);
            weekDateInput.value = weekStartDate;
            renderCalendar();
        });

        weekDateInput.addEventListener('change', () => {
            const picked = weekDateInput.value;
            if (!picked) return;
            weekStartDate = getWeekStart(picked);
            weekDateInput.value = weekStartDate;
            renderCalendar();
        });

        calendarWrapper.addEventListener('click', (e) => {
            const cell = e.target.closest('.cell-selectable');
            if (!cell) return;

            const clickedDate = cell.dataset.date;
            const clickedTime = cell.dataset.time;

            handleSlotSelection(clickedDate, clickedTime);
        });

        if (btnMakeBooking) {
            btnMakeBooking.addEventListener('click', () => {
                if (selectedRoomId && selectedDate && selectedSlots.length > 0) {
                    const startTime = selectedSlots[0];
                    const lastSlotIdx = cachedTimeSlots.indexOf(selectedSlots[selectedSlots.length - 1]);
                    const endTime = cachedTimeSlots[lastSlotIdx + 1];
                    window.location.href = `book.html?room_id=${selectedRoomId}&date=${selectedDate}&start_time=${startTime}&end_time=${endTime}`;
                }
            });
        }
    }

    // ============================================
    // RENDER CALENDAR
    // ============================================

    async function renderCalendar() {
        // Clear selection
        selectedDate = null;
        selectedSlots = [];
        updateSelectionUI();

        if (!selectedRoomId) {
            calendarWrapper.innerHTML = `
                <div class="alert alert-info" style="background-color: rgba(37, 99, 235, 0.08); border-color: rgba(37, 99, 235, 0.2); color: var(--primary-dark); padding: 2rem; text-align: center; border-radius: var(--radius-md);">
                    <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">🏢</div>
                    <strong>Please select a room to view the calendar schedule.</strong>
                </div>`;
            calendarLoading.style.display = 'none';
            calendarLegend.style.display = 'none';
            return;
        }
        if (!weekStartDate) return;

        // Show spinner
        calendarLoading.classList.remove('hidden');
        calendarLegend.style.display = 'none';

        // Reset wrapper to only contain loader
        calendarWrapper.innerHTML = '';
        calendarWrapper.appendChild(calendarLoading);
        calendarLoading.style.display = '';

        try {
            // Fetch operating hours + bookings in parallel
            const endDate = addDays(weekStartDate, 6);

            const [opHours, bookings] = await Promise.all([
                db.getOperatingHours(),
                db.getBookingsForRoomRange(selectedRoomId, weekStartDate, endDate),
            ]);

            const timeSlots = generateTimeSlots(opHours.start, opHours.end, AppConfig.SLOT_INCREMENT_MINUTES);
            cachedTimeSlots = timeSlots;
            cachedBookings = bookings;

            if (!timeSlots || timeSlots.length < 2) {
                calendarWrapper.innerHTML =
                    '<div class="alert alert-danger">Operating hours are misconfigured.</div>';
                return;
            }

            // Build week dates array (Mon–Sun)
            const weekDates = [];
            for (let i = 0; i < 7; i++) {
                weekDates.push(addDays(weekStartDate, i));
            }

            const todayISO = dateToISO(getCurrentDate());
            const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

            // ------------------------------------------------------------------
            // BUILD HTML TABLE
            // ------------------------------------------------------------------
            let html = '<div class="calendar-container"><table class="calendar-table">';

            // Header row
            html += '<thead><tr><th class="time-col">Time</th>';
            for (let d = 0; d < 7; d++) {
                const dd = weekDates[d];
                const isToday = dd === todayISO;
                const cls = isToday ? ' class="th-today"' : '';
                const dateLabel = formatDateShort(dd);
                html += `<th${cls}>${dayLabels[d]}<br><span style="font-size:0.62rem;color:rgba(255, 255, 255, 0.75);font-weight:400;">${dateLabel}</span></th>`;
            }
            html += '</tr></thead><tbody>';

            // Data rows — each slot except the last (the last is only an end boundary)
            for (let i = 0; i < timeSlots.length - 1; i++) {
                const slotTime = timeSlots[i];
                html += `<tr><td class="time-label">${slotTime}</td>`;

                for (let d = 0; d < 7; d++) {
                    const dd = weekDates[d];
                    const isToday = dd === todayISO;
                    const booking = findBookingForSlot(bookings, dd, slotTime);

                    if (booking) {
                        const status = booking.status;
                        const statusCls = status === 'approved' ? 'approved' : 'pending';
                        const title = escapeHTML(booking.meeting_title || 'Reserved');
                        const booker = escapeHTML(booking.booker_name || '');
                        html +=
                            `<td class="cell-booked ${statusCls}">` +
                            `<div class="booking-title">${title}</div>` +
                            `<div class="booking-booker">${booker}</div>` +
                            `<span class="booking-status">${status}</span></td>`;
                    } else {
                        const todayCls = isToday ? ' cell-today' : '';
                        html += `<td class="cell-available cell-selectable${todayCls}" data-date="${dd}" data-time="${slotTime}">—</td>`;
                    }
                }

                html += '</tr>';
            }

            html += '</tbody></table></div>';

            // Insert into DOM
            calendarWrapper.innerHTML = html;
            calendarLegend.style.display = '';
        } catch (err) {
            calendarWrapper.innerHTML =
                `<div class="alert alert-danger">Failed to load bookings: ${escapeHTML(err.message)}</div>`;
            showToast('Error loading calendar: ' + err.message, 'error');
        }
    }

    // ============================================
    // BOOKING LOOKUP
    // ============================================

    /**
     * Return the booking occupying a specific date + time slot, or null.
     * A booking occupies a slot when booking.start_time <= slotTime < booking.end_time
     */
    function findBookingForSlot(bookings, dateStr, slotTime) {
        for (const b of bookings) {
            // Normalise date (could come back as a Date or string)
            const bDate = typeof b.date === 'string'
                ? b.date
                : dateToISO(new Date(b.date));

            if (bDate !== dateStr) continue;

            // Normalise times to HH:MM for comparison
            const bStart = normaliseTime(b.start_time);
            const bEnd   = normaliseTime(b.end_time);

            if (bStart <= slotTime && slotTime < bEnd) {
                return b;
            }
        }
        return null;
    }

    /**
     * Ensure a time value is in "HH:MM" format.
     * Handles "HH:MM:SS" from the database.
     */
    function normaliseTime(t) {
        if (!t) return '00:00';
        const str = String(t);
        return str.length > 5 ? str.substring(0, 5) : str;
    }

    // ============================================
    // UTILITIES
    // ============================================

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ============================================
    // SLOT SELECTION HELPERS
    // ============================================

    function getSlotsRange(startTime, endTime) {
        const startIdx = cachedTimeSlots.indexOf(startTime);
        const endIdx = cachedTimeSlots.indexOf(endTime);
        if (startIdx === -1 || endIdx === -1) return [];
        const minIdx = Math.min(startIdx, endIdx);
        const maxIdx = Math.max(startIdx, endIdx);
        return cachedTimeSlots.slice(minIdx, maxIdx + 1);
    }

    function handleSlotSelection(clickedDate, clickedTime) {
        if (selectedDate !== clickedDate) {
            // New day selected: reset selection to just this slot
            selectedDate = clickedDate;
            selectedSlots = [clickedTime];
        } else {
            // Same day: check if already selected
            const idx = selectedSlots.indexOf(clickedTime);
            if (idx !== -1) {
                // Toggle off
                if (selectedSlots.length === 1) {
                    selectedDate = null;
                    selectedSlots = [];
                } else {
                    // Reset to just this clicked slot
                    selectedSlots = [clickedTime];
                }
            } else {
                // Extend selection
                const newMin = selectedSlots.reduce((a, b) => a < b ? a : b, clickedTime);
                const newMax = selectedSlots.reduce((a, b) => a > b ? a : b, clickedTime);

                const startIdx = cachedTimeSlots.indexOf(newMin);
                const endIdx = cachedTimeSlots.indexOf(newMax);

                if (startIdx !== -1 && endIdx !== -1) {
                    const range = cachedTimeSlots.slice(startIdx, endIdx + 1);

                    // Check if there are any bookings on this range
                    const hasConflict = range.some(slot => findBookingForSlot(cachedBookings, selectedDate, slot) !== null);

                    if (hasConflict) {
                        // Reset selection to just the clicked slot if there's an intermediate booking
                        selectedSlots = [clickedTime];
                    } else {
                        selectedSlots = range;
                    }
                } else {
                    selectedSlots = [clickedTime];
                }
            }
        }

        updateSelectionUI();
    }

    function updateSelectionUI() {
        // Toggle selected classes
        const cells = calendarWrapper.querySelectorAll('.cell-selectable');
        cells.forEach(cell => {
            const date = cell.dataset.date;
            const time = cell.dataset.time;
            const isSelected = (selectedDate === date && selectedSlots.includes(time));
            cell.classList.toggle('cell-selected', isSelected);
        });

        // Show/hide bottom panel
        if (selectionPanel && selectionText) {
            if (selectedSlots.length > 0 && selectedRoomId) {
                const roomObj = rooms.find(r => r.id === selectedRoomId);
                const roomName = roomObj ? roomObj.name : 'Selected Room';
                const startTime = selectedSlots[0];
                const lastSlotIdx = cachedTimeSlots.indexOf(selectedSlots[selectedSlots.length - 1]);
                const endTime = cachedTimeSlots[lastSlotIdx + 1];

                selectionText.textContent = `${roomName} on ${formatDate(selectedDate)} at ${formatTime(startTime)} – ${formatTime(endTime)}`;
                selectionPanel.classList.remove('hidden');
            } else {
                selectionPanel.classList.add('hidden');
            }
        }
    }

})();
