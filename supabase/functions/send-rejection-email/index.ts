/**
 * FOD Rooms — Edge Function: send-rejection-email
 *
 * Sends a rejection notification email to the BOOKER
 * after an admin declines their booking. Uses Gmail SMTP.
 *
 * Expected POST body:
 *   { booking, roomName }
 *
 * Required env vars:
 *   GMAIL_EMAIL, GMAIL_APP_PASSWORD
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import nodemailer from "npm:nodemailer@6.9.10";

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

// ── Main handler ──────────────────────────────────────────────
serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { booking, roomName, adminName } = await req.json();

    if (!booking?.email) {
      return new Response(
        JSON.stringify({ error: "Missing booking data or email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const subject = `❌ Booking Not Approved: ${roomName} on ${booking.date ?? ""}`;

    const rawHtml = `
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f6f8fa; width: 100%; font-family: 'Segoe UI',Arial,sans-serif;">
      <tr>
        <td align="center" style="padding: 24px 0;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
            <tr>
              <td style="background-color: #721c24; background: linear-gradient(135deg,#721c24,#c0392b); color: #ffffff; padding: 20px 24px;">
                <h2 style="margin: 0; font-size: 20px; color: #ffffff; font-family: 'Segoe UI',Arial,sans-serif;">Booking Update</h2>
              </td>
            </tr>
            <tr>
              <td style="padding: 24px; font-family: 'Segoe UI',Arial,sans-serif; color: #1a1a2e; font-size: 14px; line-height: 1.5;">
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="width: 100%; border-collapse: collapse; margin: 12px 0; font-family: 'Segoe UI',Arial,sans-serif; color: #1a1a2e;">
                  <tr><td style="padding: 8px 0; vertical-align: top; font-weight: 600; width: 120px; color: #555555; font-size: 14px; font-family: 'Segoe UI',Arial,sans-serif;">Room</td><td style="padding: 8px 0; vertical-align: top; font-size: 14px; font-family: 'Segoe UI',Arial,sans-serif;">${roomName}</td></tr>
                  <tr><td style="padding: 8px 0; vertical-align: top; font-weight: 600; width: 120px; color: #555555; font-size: 14px; font-family: 'Segoe UI',Arial,sans-serif;">Requested By</td><td style="padding: 8px 0; vertical-align: top; font-size: 14px; font-family: 'Segoe UI',Arial,sans-serif;">${booking.booker_name ?? ""} (${booking.email})</td></tr>
                  <tr><td style="padding: 8px 0; vertical-align: top; font-weight: 600; width: 120px; color: #555555; font-size: 14px; font-family: 'Segoe UI',Arial,sans-serif;">Meeting</td><td style="padding: 8px 0; vertical-align: top; font-size: 14px; font-family: 'Segoe UI',Arial,sans-serif;">${booking.meeting_title ?? ""}</td></tr>
                  <tr><td style="padding: 8px 0; vertical-align: top; font-weight: 600; width: 120px; color: #555555; font-size: 14px; font-family: 'Segoe UI',Arial,sans-serif;">Date</td><td style="padding: 8px 0; vertical-align: top; font-size: 14px; font-family: 'Segoe UI',Arial,sans-serif;">${booking.date ?? ""}</td></tr>
                  <tr><td style="padding: 8px 0; vertical-align: top; font-weight: 600; width: 120px; color: #555555; font-size: 14px; font-family: 'Segoe UI',Arial,sans-serif;">Time</td><td style="padding: 8px 0; vertical-align: top; font-size: 14px; font-family: 'Segoe UI',Arial,sans-serif;">${booking.start_time ?? ""} – ${booking.end_time ?? ""}</td></tr>
                </table>
                <p style="margin-top: 16px; margin-bottom: 16px; font-size: 14px; line-height: 1.5;">
                  <table border="0" cellspacing="0" cellpadding="0" style="display: inline-block; border-collapse: separate;">
                    <tr>
                      <td align="center" valign="middle" style="background-color: #f8d7da; color: #721c24; font-family: 'Segoe UI',Arial,sans-serif; font-size: 13px; font-weight: 600; padding: 4px 12px; border-radius: 20px;">
                        NOT APPROVED
                      </td>
                    </tr>
                  </table>
                </p>
                <p style="margin-top: 16px; margin-bottom: 16px; font-size: 14px; line-height: 1.5;">Unfortunately, your booking was declined by <strong>${adminName || "an administrator"}</strong>.</p>
                <p style="margin-top: 16px; margin-bottom: 16px; font-size: 14px; line-height: 1.5;">Please contact the administrator if you have questions or would like to request an alternative time.</p>
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
    const html = cleanHtml(rawHtml);

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
      to: booking.email,
      subject,
      text: "Your booking request could not be approved.",
      html,
    });

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-rejection-email error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
