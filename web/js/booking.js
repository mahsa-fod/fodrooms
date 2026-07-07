/**
 * FOD Rooms — Booking Portal
 * Handles two search strategies, date selection, and booking submission.
 */

(function () {
    'use strict';

    // ============================================
    // STATE
    // ============================================
    const state = {
        strategy: 'find-room',      // 'find-room' | 'pick-room'
        dateMode: 'specific',       // 'specific'  | 'recurring'
        timeSlots: [],              // all generated time slots
        rooms: [],                  // cached active rooms

        // Selected booking parameters
        selectedRoom: null,         // { id, name, capacity }
        selectedDates: [],          // ['YYYY-MM-DD', …]
        startTime: '',
        endTime: '',
    };

    // ============================================
    // DOM REFERENCES
    // ============================================
    const $ = (id) => document.getElementById(id);

    const els = {
        pageLoader:       $('page-loader'),
        bookingApp:       $('booking-app'),
        strategyTabs:     $('strategy-tabs'),

        // Strategy 1 — Find a Room
        s1Panel:          $('strategy-find-room'),
        s1Date:           $('s1-date'),
        s1Start:          $('s1-start-time'),
        s1End:            $('s1-end-time'),
        s1SearchBtn:      $('s1-search-btn'),
        s1Results:        $('s1-results'),
        s1RoomsContainer: $('s1-rooms-container'),

        // Strategy 2 — Pick a Room
        s2Panel:          $('strategy-pick-room'),
        s2Room:           $('s2-room'),
        s2Start:          $('s2-start-time'),
        s2End:            $('s2-end-time'),
        dateModeTabs:     $('date-mode-tabs'),
        modeSpecific:     $('mode-specific'),
        modeRecurring:    $('mode-recurring'),
        s2SpecificDate:   $('s2-specific-date'),
        s2CheckSpecificBtn:$('s2-check-specific-btn'),
        s2SpecificResults:$('s2-specific-results'),
        s2Weekday:        $('s2-weekday'),
        s2StartDate:      $('s2-start-date'),
        s2EndDate:        $('s2-end-date'),
        s2RecurringBtn:   $('s2-check-recurring-btn'),
        s2RecurringResults:$('s2-recurring-results'),

        // Booking form
        bookingForm:      $('booking-form-section'),
        summaryRoom:      $('summary-room'),
        summaryTime:      $('summary-time'),
        summaryDuration:  $('summary-duration'),
        summaryDates:     $('summary-dates'),
        bookerName:       $('booker-name'),
        bookerEmail:      $('booker-email'),
        meetingTitle:     $('meeting-title'),
        submitBtn:        $('submit-booking-btn'),

        // Success
        successSection:   $('success-section'),
        successMessage:   $('success-message'),
        newBookingBtn:    $('new-booking-btn'),
    };

    // ============================================
    // INITIALIZATION
    // ============================================
    async function init() {
        try {
            // Fetch operating hours and build time slots
            const hours = await db.getOperatingHours();
            state.timeSlots = generateTimeSlots(hours.start, hours.end, AppConfig.SLOT_INCREMENT_MINUTES);
            populateTimeDropdowns();

            // Set date constraints
            const today = dateToISO(getCurrentDate());
            els.s1Date.min = today;
            els.s1Date.value = today;
            els.s2SpecificDate.min = today;
            els.s2StartDate.min = today;
            els.s2EndDate.min = today;

            // Pre-load rooms for Strategy 2
            state.rooms = await db.getRooms();
            populateRoomDropdown();

            // Wire up all event listeners
            bindEvents();

            // Show the app
            els.pageLoader.classList.add('hidden');
            els.bookingApp.classList.remove('hidden');

            // Handle pre-filling from URL query parameters
            const urlParams = new URLSearchParams(window.location.search);
            const pRoomId = urlParams.get('room_id');
            const pDate = urlParams.get('date');
            const pStart = urlParams.get('start_time');
            const pEnd = urlParams.get('end_time');

            if (pRoomId && pDate && pStart && pEnd) {
                switchStrategy('pick-room');
                els.s2Room.value = pRoomId;
                els.s2SpecificDate.value = pDate;
                els.s2Start.value = pStart;
                populateEndTimeDropdown(els.s2Start, els.s2End);
                els.s2End.value = pEnd;
                await checkSpecificDateAvailability();
            }
        } catch (err) {
            console.error('Init error:', err);
            showToast('Failed to load booking portal: ' + err.message, 'error');
        }
    }

    // ============================================
    // POPULATE DROPDOWNS
    // ============================================
    function populateTimeDropdowns() {
        const slots = state.timeSlots;
        const buildOptions = (placeholder) => {
            let html = `<option value="">${placeholder}</option>`;
            for (const slot of slots) {
                html += `<option value="${slot}">${formatTime(slot)}</option>`;
            }
            return html;
        };

        // Strategy 1
        els.s1Start.innerHTML = buildOptions('Select start time');
        els.s1End.innerHTML = '<option value="">Select start time first</option>';
        els.s1End.disabled = true;

        // Strategy 2
        els.s2Start.innerHTML = buildOptions('Select start time');
        els.s2End.innerHTML = '<option value="">Select start time first</option>';
        els.s2End.disabled = true;
    }

    function populateEndTimeDropdown(startSelect, endSelect) {
        const startVal = startSelect.value;
        if (!startVal) {
            endSelect.innerHTML = '<option value="">Select start time first</option>';
            endSelect.disabled = true;
            return;
        }

        const startMinutes = timeToMinutes(startVal);
        const filtered = state.timeSlots.filter(s => timeToMinutes(s) > startMinutes);

        if (filtered.length === 0) {
            endSelect.innerHTML = '<option value="">No available end times</option>';
            endSelect.disabled = true;
            return;
        }

        let html = '<option value="">Select end time</option>';
        for (const slot of filtered) {
            html += `<option value="${slot}">${formatTime(slot)}</option>`;
        }
        endSelect.innerHTML = html;
        endSelect.disabled = false;
    }

    function populateRoomDropdown() {
        if (state.rooms.length === 0) {
            els.s2Room.innerHTML = '<option value="">No rooms available</option>';
            return;
        }
        let html = '<option value="">Select a room</option>';
        for (const room of state.rooms) {
            const cap = room.capacity ? ` (capacity: ${room.capacity})` : '';
            html += `<option value="${room.id}">${room.name}${cap}</option>`;
        }
        els.s2Room.innerHTML = html;
    }

    // ============================================
    // EVENT BINDING
    // ============================================
    function bindEvents() {
        // Strategy tabs
        els.strategyTabs.addEventListener('click', (e) => {
            const btn = e.target.closest('.strategy-tab');
            if (!btn) return;
            const strat = btn.dataset.strategy;
            if (strat === state.strategy) return;
            switchStrategy(strat);
        });

        // Strategy 1: time selectors
        els.s1Start.addEventListener('change', () => {
            populateEndTimeDropdown(els.s1Start, els.s1End);
            updateS1SearchButton();
            hideBookingForm();
        });
        els.s1End.addEventListener('change', () => {
            updateS1SearchButton();
            hideBookingForm();
        });
        els.s1Date.addEventListener('change', () => {
            updateS1SearchButton();
            hideBookingForm();
        });
        els.s1SearchBtn.addEventListener('click', searchAvailableRooms);

        // Strategy 2: room & time selectors
        els.s2Room.addEventListener('change', () => {
            updateS2Buttons();
            hideBookingForm();
        });
        els.s2Start.addEventListener('change', () => {
            populateEndTimeDropdown(els.s2Start, els.s2End);
            updateS2Buttons();
            hideBookingForm();
        });
        els.s2End.addEventListener('change', () => {
            updateS2Buttons();
            hideBookingForm();
        });

        // Date mode tabs
        els.dateModeTabs.addEventListener('click', (e) => {
            const btn = e.target.closest('.strategy-tab');
            if (!btn) return;
            const mode = btn.dataset.mode;
            if (mode === state.dateMode) return;
            switchDateMode(mode);
        });

        // Strategy 2: search buttons
        els.s2CheckSpecificBtn.addEventListener('click', checkSpecificDateAvailability);
        els.s2RecurringBtn.addEventListener('click', checkRecurringAvailability);

        // Specific fields
        els.s2SpecificDate.addEventListener('change', updateS2Buttons);

        // Recurring fields
        els.s2Weekday.addEventListener('change', updateS2RecurringButton);
        els.s2StartDate.addEventListener('change', updateS2RecurringButton);
        els.s2EndDate.addEventListener('change', updateS2RecurringButton);

        // Booking form submission
        els.submitBtn.addEventListener('click', submitBooking);

        // New booking
        els.newBookingBtn.addEventListener('click', resetAll);
    }

    // ============================================
    // STRATEGY SWITCHING
    // ============================================
    function switchStrategy(strat) {
        state.strategy = strat;
        hideBookingForm();

        // Update tab styles
        els.strategyTabs.querySelectorAll('.strategy-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.strategy === strat);
        });

        // Show/hide panels
        els.s1Panel.classList.toggle('active', strat === 'find-room');
        els.s2Panel.classList.toggle('active', strat === 'pick-room');

        // Clear previous results
        els.s1Results.classList.add('hidden');
        els.s2SpecificResults.classList.add('hidden');
        els.s2RecurringResults.classList.add('hidden');
    }

    function switchDateMode(mode) {
        state.dateMode = mode;
        hideBookingForm();

        els.dateModeTabs.querySelectorAll('.strategy-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.mode === mode);
        });

        els.modeSpecific.classList.toggle('active', mode === 'specific');
        els.modeRecurring.classList.toggle('active', mode === 'recurring');

        const specAction = $('s2-specific-action-container');
        const recurAction = $('s2-recurring-action-container');
        if (specAction) specAction.classList.toggle('hidden', mode !== 'specific');
        if (recurAction) recurAction.classList.toggle('hidden', mode !== 'recurring');

        // Clear results
        els.s2SpecificResults.classList.add('hidden');
        els.s2RecurringResults.classList.add('hidden');
    }

    // ============================================
    // BUTTON STATE MANAGEMENT
    // ============================================
    function updateS1SearchButton() {
        const ready = els.s1Date.value && els.s1Start.value && els.s1End.value;
        els.s1SearchBtn.disabled = !ready;
    }

    function updateS2Buttons() {
        const base = els.s2Room.value && els.s2Start.value && els.s2End.value;
        const specificReady = base && els.s2SpecificDate.value;
        els.s2CheckSpecificBtn.disabled = !specificReady;
        updateS2RecurringButton();
    }

    function updateS2RecurringButton() {
        const base = els.s2Room.value && els.s2Start.value && els.s2End.value;
        const recurring = els.s2Weekday.value !== '' && els.s2StartDate.value && els.s2EndDate.value;
        els.s2RecurringBtn.disabled = !(base && recurring);
    }

    // ============================================
    // STRATEGY 1 — Search Available Rooms
    // ============================================
    async function searchAvailableRooms() {
        const date = els.s1Date.value;
        const start = els.s1Start.value;
        const end = els.s1End.value;

        if (!date || !start || !end) {
            showToast('Please fill in date, start time, and end time.', 'warning');
            return;
        }

        setButtonLoading(els.s1SearchBtn, true);
        hideBookingForm();

        try {
            const rooms = await db.getAvailableRooms(date, start, end);
            renderAvailableRooms(rooms, date, start, end);
            els.s1Results.classList.remove('hidden');
        } catch (err) {
            showToast('Error searching rooms: ' + err.message, 'error');
        } finally {
            setButtonLoading(els.s1SearchBtn, false);
        }
    }

    function renderAvailableRooms(rooms, date, start, end) {
        if (rooms.length === 0) {
            els.s1RoomsContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">😔</div>
                    <p class="empty-state-text">No rooms available for this time slot. Try a different date or time.</p>
                </div>`;
            return;
        }

        const dur = durationMinutes(start, end);
        let html = `<p class="text-secondary text-sm mb-md">${rooms.length} room(s) available on ${formatDate(date)}, ${formatTime(start)} – ${formatTime(end)} (${dur} min)</p>`;
        html += '<div class="grid-2">';

        for (const room of rooms) {
            const cap = room.capacity ? `Capacity: ${room.capacity}` : 'Capacity: N/A';
            html += `
                <div class="card room-card" data-room-id="${room.id}" data-room-name="${escapeAttr(room.name)}" style="cursor:pointer;" tabindex="0" role="button" aria-label="Select ${escapeAttr(room.name)}">
                    <h4>${escapeHtml(room.name)}</h4>
                    <p class="text-sm text-secondary">${cap}</p>
                </div>`;
        }
        html += '</div>';
        els.s1RoomsContainer.innerHTML = html;

        // Bind click on room cards
        els.s1RoomsContainer.querySelectorAll('.room-card').forEach(card => {
            card.addEventListener('click', () => selectRoomFromS1(card, date, start, end));
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectRoomFromS1(card, date, start, end);
                }
            });
        });
    }

    function selectRoomFromS1(card, date, start, end) {
        // Highlight selected card
        els.s1RoomsContainer.querySelectorAll('.room-card').forEach(c => {
            c.classList.remove('card-elevated');
            c.style.borderColor = '';
        });
        card.classList.add('card-elevated');
        card.style.borderColor = 'var(--primary)';

        // Store state
        state.selectedRoom = {
            id: card.dataset.roomId,
            name: card.dataset.roomName,
        };
        state.selectedDates = [date];
        state.startTime = start;
        state.endTime = end;

        showBookingForm();
    }

    // ============================================
    // STRATEGY 2 — Check Specific Date Availability
    // ============================================
    async function checkSpecificDateAvailability() {
        const roomId = els.s2Room.value;
        const start = els.s2Start.value;
        const end = els.s2End.value;
        const date = els.s2SpecificDate.value;

        if (!roomId || !start || !end || !date) {
            showToast('Please select room, time range, and date.', 'warning');
            return;
        }

        setButtonLoading(els.s2CheckSpecificBtn, true);
        hideBookingForm();

        try {
            const conflicts = await db.checkConflicts(roomId, date, start, end);
            if (conflicts.length > 0) {
                const conflict = conflicts[0];
                const booker = conflict.booker_name || 'Reserved';
                const title = conflict.meeting_title || 'Private Event';
                els.s2SpecificResults.innerHTML = `
                    <div class="alert alert-warning">
                        <strong>The room is unavailable on ${formatDate(date)}</strong> during this time.
                        <br><span class="text-xs">Already booked: ${escapeHtml(title)} (${escapeHtml(booker)})</span>
                    </div>`;
                els.s2SpecificResults.classList.remove('hidden');
            } else {
                els.s2SpecificResults.innerHTML = `
                    <div class="alert alert-success">✅ The room is available on ${formatDate(date)}! Proceeding to booking form below.</div>`;
                els.s2SpecificResults.classList.remove('hidden');

                const roomOption = els.s2Room.options[els.s2Room.selectedIndex];
                const roomName = roomOption ? roomOption.textContent.split(' (')[0] : 'Unknown';

                state.selectedRoom = { id: roomId, name: roomName };
                state.selectedDates = [date];
                state.startTime = start;
                state.endTime = end;

                showBookingForm();
            }
        } catch (err) {
            showToast('Error checking availability: ' + err.message, 'error');
        } finally {
            setButtonLoading(els.s2CheckSpecificBtn, false);
        }
    }

    // ============================================
    // STRATEGY 2 — Check Recurring Availability
    // ============================================
    async function checkRecurringAvailability() {
        const roomId = els.s2Room.value;
        const start = els.s2Start.value;
        const end = els.s2End.value;
        const weekday = parseInt(els.s2Weekday.value, 10);
        const startDate = els.s2StartDate.value;
        const endDate = els.s2EndDate.value;

        if (!roomId || !start || !end || isNaN(weekday) || !startDate || !endDate) {
            showToast('Please fill in all recurring fields.', 'warning');
            return;
        }

        if (startDate > endDate) {
            showToast('Start date must be before recur until date.', 'warning');
            return;
        }

        setButtonLoading(els.s2RecurringBtn, true);
        hideBookingForm();

        try {
            const allDates = generateRecurringDates(weekday, endDate, startDate);

            if (allDates.length === 0) {
                els.s2RecurringResults.innerHTML = `
                    <div class="alert alert-warning">No ${AppConfig.WEEKDAY_NAMES[weekday]} dates found between ${formatDate(startDate)} and ${formatDate(endDate)}.</div>`;
                els.s2RecurringResults.classList.remove('hidden');
                return;
            }

            // Filter out dates with conflicts and build list of unavailable dates
            const available = [];
            const unavailable = [];
            for (const d of allDates) {
                const conflicts = await db.checkConflicts(roomId, d, start, end);
                if (conflicts.length === 0) {
                    available.push(d);
                } else {
                    const conflict = conflicts[0];
                    const booker = conflict.booker_name || 'Reserved';
                    const title = conflict.meeting_title || 'Private Event';
                    unavailable.push({ date: d, booker, title });
                }
            }

            let msg = '';
            if (unavailable.length > 0) {
                msg += `
                    <div class="alert alert-warning mb-md">
                        <strong>Unavailable Date(s) (${unavailable.length} of ${allDates.length}):</strong>
                        <ul style="margin-top:0.4rem; padding-left:1.2rem; font-size:0.75rem; text-align:left;">`;
                for (const item of unavailable) {
                    msg += `<li><strong>${formatDate(item.date)}</strong>: booked for "${escapeHtml(item.title)}" (${escapeHtml(item.booker)})</li>`;
                }
                msg += `</ul></div>`;
            }

            if (available.length === 0) {
                els.s2RecurringResults.innerHTML = msg + `
                    <div class="alert alert-danger">All ${allDates.length} ${AppConfig.WEEKDAY_NAMES[weekday]} slots are booked. Try a different time, day, or room.</div>`;
                els.s2RecurringResults.classList.remove('hidden');
                return;
            }

            if (available.length < allDates.length) {
                msg += `<div class="alert alert-info">${available.length} of ${allDates.length} ${AppConfig.WEEKDAY_NAMES[weekday]}s are available. Dates with conflicts are excluded.</div>`;
            }

            renderDateCheckboxes(available, els.s2RecurringResults, 'recurring', msg);
            els.s2RecurringResults.classList.remove('hidden');
        } catch (err) {
            showToast('Error checking recurring availability: ' + err.message, 'error');
        } finally {
            setButtonLoading(els.s2RecurringBtn, false);
        }
    }

    // ============================================
    // DATE CHECKBOX LIST (shared by both S2 modes)
    // ============================================
    function renderDateCheckboxes(dates, container, prefix, prefixHtml = '') {
        if (dates.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">😔</div>
                    <p class="empty-state-text">No available dates found. Try adjusting the time range.</p>
                </div>`;
            return;
        }

        let html = prefixHtml;
        html += `<p class="text-secondary text-sm mb-sm">${dates.length} available date(s) found</p>`;
        html += `
            <div class="checkbox-actions">
                <button class="btn btn-ghost btn-sm" id="${prefix}-select-all">Select All</button>
                <button class="btn btn-ghost btn-sm" id="${prefix}-deselect-all">Deselect All</button>
            </div>
            <div class="checkbox-list" id="${prefix}-date-list">`;

        for (const d of dates) {
            html += `
                <label class="checkbox-item">
                    <input type="checkbox" value="${d}" name="${prefix}-date-cb">
                    <span>${formatDate(d)}</span>
                </label>`;
        }
        html += '</div>';
        html += `<button class="btn btn-primary btn-full mt-md" id="${prefix}-confirm-dates-btn" disabled>✅ Confirm Selected Dates</button>`;

        container.innerHTML = html;

        // Wire events
        const checkboxes = container.querySelectorAll(`input[name="${prefix}-date-cb"]`);
        const confirmBtn = container.querySelector(`#${prefix}-confirm-dates-btn`);

        container.querySelector(`#${prefix}-select-all`).addEventListener('click', () => {
            checkboxes.forEach(cb => cb.checked = true);
            confirmBtn.disabled = false;
        });

        container.querySelector(`#${prefix}-deselect-all`).addEventListener('click', () => {
            checkboxes.forEach(cb => cb.checked = false);
            confirmBtn.disabled = true;
        });

        checkboxes.forEach(cb => {
            cb.addEventListener('change', () => {
                const anyChecked = [...checkboxes].some(c => c.checked);
                confirmBtn.disabled = !anyChecked;
            });
        });

        confirmBtn.addEventListener('click', () => {
            const selected = [...checkboxes].filter(c => c.checked).map(c => c.value);
            if (selected.length === 0) {
                showToast('Please select at least one date.', 'warning');
                return;
            }
            confirmS2Dates(selected);
        });
    }

    function confirmS2Dates(dates) {
        const roomId = els.s2Room.value;
        const roomOption = els.s2Room.options[els.s2Room.selectedIndex];
        const roomName = roomOption ? roomOption.textContent.split(' (')[0] : 'Unknown';

        state.selectedRoom = { id: roomId, name: roomName };
        state.selectedDates = dates;
        state.startTime = els.s2Start.value;
        state.endTime = els.s2End.value;

        showBookingForm();
    }

    // ============================================
    // BOOKING FORM — Show / Hide / Submit
    // ============================================
    function showBookingForm() {
        const { selectedRoom, selectedDates, startTime, endTime } = state;
        if (!selectedRoom || selectedDates.length === 0 || !startTime || !endTime) return;

        // Populate summary
        els.summaryRoom.textContent = selectedRoom.name;
        els.summaryTime.textContent = `${formatTime(startTime)} – ${formatTime(endTime)}`;
        els.summaryDuration.textContent = `${durationMinutes(startTime, endTime)} min`;

        if (selectedDates.length === 1) {
            els.summaryDates.textContent = formatDate(selectedDates[0]);
        } else {
            els.summaryDates.innerHTML = `${selectedDates.length} dates<br><span class="text-sm text-secondary">${selectedDates.map(formatDateShort).join(', ')}</span>`;
        }

        // Clear form fields (but keep previous values for convenience)
        els.bookingForm.classList.remove('hidden');
        els.bookingForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function hideBookingForm() {
        els.bookingForm.classList.add('hidden');
        state.selectedRoom = null;
        state.selectedDates = [];
    }

    async function submitBooking() {
        const name = els.bookerName.value.trim();
        const email = els.bookerEmail.value.trim();
        const title = els.meetingTitle.value.trim();

        // 1. Validate fields
        if (!name || !email || !title) {
            showToast('Please fill in all required fields.', 'warning');
            highlightEmptyFields();
            return;
        }

        // Basic email format check
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showToast('Please enter a valid email address.', 'warning');
            els.bookerEmail.focus();
            return;
        }

        const { selectedRoom, selectedDates, startTime, endTime } = state;
        if (!selectedRoom || selectedDates.length === 0) {
            showToast('No room or dates selected. Please start over.', 'error');
            return;
        }

        setButtonLoading(els.submitBtn, true);

        try {
            // 2. Validate email domain
            const domainValid = await db.validateEmailDomain(email);
            if (!domainValid) {
                showToast('Your email domain is not in the approved list. Please use your university email.', 'error');
                setButtonLoading(els.submitBtn, false);
                els.bookerEmail.focus();
                return;
            }

            // 3. Check for duplicates on each date
            for (const date of selectedDates) {
                const isDuplicate = await db.checkDuplicate(email, selectedRoom.id, date, startTime, endTime);
                if (isDuplicate) {
                    showToast(`You already have a booking for ${formatDate(date)} at this time.`, 'warning');
                    setButtonLoading(els.submitBtn, false);
                    return;
                }
            }

            // 4. Create booking(s)
            let bookings;
            if (selectedDates.length === 1) {
                bookings = await db.createBooking(
                    selectedRoom.id, name, email, title,
                    selectedDates[0], startTime, endTime
                );
            } else {
                bookings = await db.createBookingsBatch(
                    selectedRoom.id, name, email, title,
                    selectedDates, startTime, endTime
                );
            }

            // 5. Send email notification (non-blocking)
            if (selectedDates.length === 1) {
                EmailService.sendBookingNotification(
                    bookings[0], selectedRoom.name
                );
            } else {
                EmailService.sendBatchBookingNotification(
                    bookings, selectedRoom.name
                );
            }

            // 6. Show success
            const dateWord = selectedDates.length === 1 ? 'date' : `${selectedDates.length} dates`;
            els.successMessage.textContent =
                `Your booking for ${selectedRoom.name} across ${dateWord} has been submitted and is pending admin approval. You'll receive an email notification once reviewed.`;

            els.bookingForm.classList.add('hidden');
            els.s1Panel.classList.add('hidden');
            els.s2Panel.classList.add('hidden');
            els.strategyTabs.classList.add('hidden');
            els.successSection.classList.remove('hidden');
            els.successSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

            showToast('Booking submitted successfully!', 'success');
        } catch (err) {
            console.error('Booking error:', err);
            showToast('Failed to submit booking: ' + err.message, 'error');
        } finally {
            setButtonLoading(els.submitBtn, false);
        }
    }

    function highlightEmptyFields() {
        const fields = [
            { el: els.bookerName, label: 'Full Name' },
            { el: els.bookerEmail, label: 'Email' },
            { el: els.meetingTitle, label: 'Meeting Title' },
        ];
        for (const f of fields) {
            if (!f.el.value.trim()) {
                f.el.style.borderColor = 'var(--danger)';
                f.el.addEventListener('input', function handler() {
                    f.el.style.borderColor = '';
                    f.el.removeEventListener('input', handler);
                }, { once: true });
            }
        }
    }

    // ============================================
    // RESET
    // ============================================
    function resetAll() {
        // Reset state
        state.strategy = 'find-room';
        state.dateMode = 'specific';
        state.selectedRoom = null;
        state.selectedDates = [];
        state.startTime = '';
        state.endTime = '';

        // Reset form fields
        els.bookerName.value = '';
        els.bookerEmail.value = '';
        els.meetingTitle.value = '';

        // Reset Strategy 1
        const today = dateToISO(getCurrentDate());
        els.s1Date.value = today;
        els.s1Start.value = '';
        els.s1End.innerHTML = '<option value="">Select start time first</option>';
        els.s1End.disabled = true;
        els.s1SearchBtn.disabled = true;
        els.s1Results.classList.add('hidden');
        els.s1RoomsContainer.innerHTML = '';

        // Reset Strategy 2
        els.s2Room.value = '';
        els.s2Start.value = '';
        els.s2End.innerHTML = '<option value="">Select start time first</option>';
        els.s2End.disabled = true;
        els.s2SpecificDate.value = '';
        els.s2CheckSpecificBtn.disabled = true;
        els.s2Weekday.value = '';
        els.s2StartDate.value = '';
        els.s2EndDate.value = '';
        els.s2RecurringBtn.disabled = true;
        els.s2SpecificResults.classList.add('hidden');
        els.s2SpecificResults.innerHTML = '';
        els.s2RecurringResults.classList.add('hidden');
        els.s2RecurringResults.innerHTML = '';

        // Reset tabs
        switchStrategy('find-room');
        switchDateMode('specific');

        // Show/hide sections
        els.bookingForm.classList.add('hidden');
        els.successSection.classList.add('hidden');
        els.strategyTabs.classList.remove('hidden');
        els.s1Panel.classList.remove('hidden');
        els.s1Panel.classList.add('active');
        els.s2Panel.classList.remove('hidden');

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ============================================
    // UTILITIES
    // ============================================
    function timeToMinutes(timeStr) {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ============================================
    // BOOT
    // ============================================
    document.addEventListener('DOMContentLoaded', init);
})();
