/**
 * FOD Rooms — Email Service (Edge Function Invocation)
 * Calls Supabase Edge Functions to send transactional emails via Gmail SMTP.
 */

const EmailService = {
    /**
     * Notify all admins about a new booking request.
     */
    async sendBookingNotification(booking, roomName) {
        try {
            await supabase.functions.invoke('send-booking-notification', {
                body: { booking, roomName },
            });
        } catch (err) {
            console.warn('Email notification failed (non-blocking):', err);
        }
    },

    /**
     * Notify all admins about a batch booking request.
     */
    async sendBatchBookingNotification(bookings, roomName) {
        try {
            await supabase.functions.invoke('send-booking-notification', {
                body: { bookings, roomName, isBatch: true },
            });
        } catch (err) {
            console.warn('Batch email notification failed (non-blocking):', err);
        }
    },

    /**
     * Notify the user that their booking has been approved.
     */
    async sendApprovalEmail(booking, roomName, adminName) {
        try {
            await supabase.functions.invoke('send-approval-email', {
                body: { booking, roomName, adminName },
            });
        } catch (err) {
            console.warn('Approval email failed (non-blocking):', err);
        }
    },

    /**
     * Notify the user that their booking has been rejected.
     */
    async sendRejectionEmail(booking, roomName, adminName) {
        try {
            await supabase.functions.invoke('send-rejection-email', {
                body: { booking, roomName, adminName },
            });
        } catch (err) {
            console.warn('Rejection email failed (non-blocking):', err);
        }
    },
};
