/**
 * FOD Rooms — Edge Function: send-booking-notification
 *
 * Sends an email to ALL admin users whenever a new booking
 * request (single or batch) is submitted. Uses Gmail SMTP.
 *
 * Expected POST body:
 *   Single:  { booking, roomName }
 *   Batch:   { bookings, roomName, isBatch: true }
 *
 * Required env vars:
 *   GMAIL_EMAIL, GMAIL_APP_PASSWORD,
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import nodemailer from "npm:nodemailer@6.9.10";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── CORS headers ──────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── HTML cleanup helper to avoid Quoted-Printable glitches ──
function cleanHtml(html: string): string {
  return html
    .replace(/\r/g, "")                  // Remove carriage returns
    .split("\n")                         // Split by lines
    .map(line => line.trim())            // Trim leading/trailing whitespace
    .filter(line => line.length > 0)     // Remove empty lines
    .join("\n");                         // Join with simple newlines
}

// ── Booking details table (single booking) ────────────────────
function bookingDetailsHtml(booking: Record<string, string>, roomName: string): string {
  return `
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse; margin:12px 0; font-family:'Segoe UI',Arial,sans-serif; color:#1a1a2e;">
    <tr><td style="padding:8px 0; vertical-align:top; font-weight:600; width:120px; color:#555555; font-size:14px; font-family:'Segoe UI',Arial,sans-serif;">Room</td><td style="padding:8px 0; vertical-align:top; font-size:14px; font-family:'Segoe UI',Arial,sans-serif;">${roomName}</td></tr>
    <tr><td style="padding:8px 0; vertical-align:top; font-weight:600; width:120px; color:#555555; font-size:14px; font-family:'Segoe UI',Arial,sans-serif;">Requested By</td><td style="padding:8px 0; vertical-align:top; font-size:14px; font-family:'Segoe UI',Arial,sans-serif;">${booking.booker_name ?? ""} (${booking.email ?? ""})</td></tr>
    <tr><td style="padding:8px 0; vertical-align:top; font-weight:600; width:120px; color:#555555; font-size:14px; font-family:'Segoe UI',Arial,sans-serif;">Meeting</td><td style="padding:8px 0; vertical-align:top; font-size:14px; font-family:'Segoe UI',Arial,sans-serif;">${booking.meeting_title ?? ""}</td></tr>
    <tr><td style="padding:8px 0; vertical-align:top; font-weight:600; width:120px; color:#555555; font-size:14px; font-family:'Segoe UI',Arial,sans-serif;">Date</td><td style="padding:8px 0; vertical-align:top; font-size:14px; font-family:'Segoe UI',Arial,sans-serif;">${booking.date ?? ""}</td></tr>
    <tr><td style="padding:8px 0; vertical-align:top; font-weight:600; width:120px; color:#555555; font-size:14px; font-family:'Segoe UI',Arial,sans-serif;">Time</td><td style="padding:8px 0; vertical-align:top; font-size:14px; font-family:'Segoe UI',Arial,sans-serif;">${booking.start_time ?? ""} – ${booking.end_time ?? ""}</td></tr>
  </table>`;
}

// ── Build email body ──────────────────────────────────────────
function buildSingleHtml(booking: Record<string, string>, roomName: string): string {
  const rawHtml = `
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f6f8fa; width: 100%; font-family: 'Segoe UI',Arial,sans-serif;">
    <tr>
      <td align="center" style="padding: 24px 0;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background-color: #0f3460; background: linear-gradient(135deg,#0f3460,#16213e); color: #ffffff; padding: 20px 24px;">
              <h2 style="margin: 0; font-size: 20px; color: #ffffff; font-family: 'Segoe UI',Arial,sans-serif;">New Booking Request</h2>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px; font-family: 'Segoe UI',Arial,sans-serif; color: #1a1a2e; font-size: 14px; line-height: 1.5;">
              ${bookingDetailsHtml(booking, roomName)}
              <p style="margin-top: 16px; margin-bottom: 16px; font-size: 14px; line-height: 1.5;">Please log in to the <a href="https://fodbooking.netlify.app/" style="color: #0f3460; font-weight: bold; text-decoration: underline;">Admin Panel</a> to approve or reject this request.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 24px 24px 24px; font-family: 'Segoe UI',Arial,sans-serif; font-size: 12px; color: #999999; text-align: center;">
              FOD Room Booking System &mdash; MAHSA University
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
  return cleanHtml(rawHtml);
}

function buildBatchHtml(
  bookings: Record<string, string>[],
  roomName: string,
): string {
  const first = bookings[0];
  const datesHtml = bookings
    .map(
      (b) =>
        `<li>${b.date ?? ""} &mdash; ${b.start_time ?? ""} to ${b.end_time ?? ""}</li>`,
    )
    .join("");

  const rawHtml = `
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f6f8fa; width: 100%; font-family: 'Segoe UI',Arial,sans-serif;">
    <tr>
      <td align="center" style="padding: 24px 0;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background-color: #0f3460; background: linear-gradient(135deg,#0f3460,#16213e); color: #ffffff; padding: 20px 24px;">
              <h2 style="margin: 0; font-size: 20px; color: #ffffff; font-family: 'Segoe UI',Arial,sans-serif;">Batch Booking Request</h2>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px; font-family: 'Segoe UI',Arial,sans-serif; color: #1a1a2e; font-size: 14px; line-height: 1.5;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="width: 100%; border-collapse: collapse; margin: 12px 0; font-family: 'Segoe UI',Arial,sans-serif; color: #1a1a2e;">
                <tr><td style="padding: 8px 0; vertical-align: top; font-weight: 600; width: 120px; color: #555555; font-size: 14px; font-family: 'Segoe UI',Arial,sans-serif;">Room</td><td style="padding: 8px 0; vertical-align: top; font-size: 14px; font-family: 'Segoe UI',Arial,sans-serif;">${roomName}</td></tr>
                <tr><td style="padding: 8px 0; vertical-align: top; font-weight: 600; width: 120px; color: #555555; font-size: 14px; font-family: 'Segoe UI',Arial,sans-serif;">Requested By</td><td style="padding: 8px 0; vertical-align: top; font-size: 14px; font-family: 'Segoe UI',Arial,sans-serif;">${first.booker_name ?? ""} (${first.email ?? ""})</td></tr>
                <tr><td style="padding: 8px 0; vertical-align: top; font-weight: 600; width: 120px; color: #555555; font-size: 14px; font-family: 'Segoe UI',Arial,sans-serif;">Meeting</td><td style="padding: 8px 0; vertical-align: top; font-size: 14px; font-family: 'Segoe UI',Arial,sans-serif;">${first.meeting_title ?? ""}</td></tr>
              </table>
              <h3 style="margin-top: 16px; font-size: 16px; font-family: 'Segoe UI',Arial,sans-serif;">Requested Dates (${bookings.length})</h3>
              <ul style="margin: 8px 0; padding-left: 20px; font-size: 14px; line-height: 1.5; font-family: 'Segoe UI',Arial,sans-serif;">${datesHtml}</ul>
              <p style="margin-top: 16px; margin-bottom: 16px; font-size: 14px; line-height: 1.5;">Please log in to the <a href="https://fodbooking.netlify.app/" style="color: #0f3460; font-weight: bold; text-decoration: underline;">Admin Panel</a> to review these requests.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 24px 24px 24px; font-family: 'Segoe UI',Arial,sans-serif; font-size: 12px; color: #999999; text-align: center;">
              FOD Room Booking System &mdash; MAHSA University
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
  return cleanHtml(rawHtml);
}

// ── Main handler ──────────────────────────────────────────────
serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { booking, bookings, roomName, isBatch } = await req.json();

    let roomId: number | null = null;
    if (isBatch && bookings?.length) {
      roomId = bookings[0].room_id ? Number(bookings[0].room_id) : null;
    } else if (booking) {
      roomId = booking.room_id ? Number(booking.room_id) : null;
    }

    // ── Determine subject & body ────────────────────────────
    let subject: string;
    let html: string;

    if (isBatch && bookings?.length) {
      subject = `📅 Batch Booking Request: ${roomName} (${bookings.length} dates)`;
      html = buildBatchHtml(bookings, roomName);
    } else if (booking) {
      subject = `📅 New Booking Request: ${roomName} on ${booking.date ?? ""}`;
      html = buildSingleHtml(booking, roomName);
    } else {
      return new Response(
        JSON.stringify({ error: "Missing booking data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Fetch admin emails via service-role client ──────────
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let adminEmails: string[] = [];
    try {
      const { data: admins, error: dbError } = await supabase
        .from("admin_users")
        .select("id, email");
      if (dbError) throw dbError;

      let optOutIds = new Set<number>();
      if (roomId) {
        const { data: optOuts, error: optOutError } = await supabase
          .from("admin_room_opt_outs")
          .select("admin_id")
          .eq("room_id", roomId);
        if (!optOutError && optOuts) {
          optOutIds = new Set(optOuts.map((o: { admin_id: number }) => Number(o.admin_id)));
        }
      }

      adminEmails = (admins ?? [])
        .filter((a: { id: number; email: string }) => !optOutIds.has(Number(a.id)))
        .map((a: { email: string }) => a.email);
    } catch (err) {
      console.warn("Failed to fetch filtered admin emails, falling back to all admins:", err);
      const { data: admins, error: dbError } = await supabase
        .from("admin_users")
        .select("email");
      if (dbError) throw dbError;
      adminEmails = (admins ?? []).map((a: { email: string }) => a.email);
    }

    if (adminEmails.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "No admin emails configured to receive notifications" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Send via Gmail SMTP ─────────────────────────────────
    const gmailEmail = Deno.env.get("GMAIL_EMAIL")!;
    const gmailPassword = Deno.env.get("GMAIL_APP_PASSWORD")!;

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: gmailEmail,
        pass: gmailPassword,
      },
    });

    await transporter.sendMail({
      from: `FOD Room Booking <${gmailEmail}>`,
      to: gmailEmail,
      bcc: adminEmails,
      subject,
      text: "Please log in to the admin panel to review the request.",
      html,
    });

    return new Response(
      JSON.stringify({ ok: true, sent: adminEmails.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-booking-notification error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
