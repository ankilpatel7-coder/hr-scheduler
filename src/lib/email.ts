import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM ?? "Shiftwork <onboarding@resend.dev>";

const resend = apiKey ? new Resend(apiKey) : null;

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}) {
  if (!resend) {
    console.log("[email] RESEND_API_KEY not set — skipping email:", opts.subject);
    return { skipped: true };
  }
  try {
    const result = await resend.emails.send({
      from,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    return { sent: true, result };
  } catch (e) {
    console.error("[email] Failed to send:", e);
    return { failed: true, error: e };
  }
}

export function baseEmailTemplate(title: string, body: string, ctaHref?: string, ctaLabel?: string) {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f5f2ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;color:#1a1816;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ec;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fbf9f4;border:1px solid #ddd6c7;border-radius:6px;">
        <tr><td style="padding:32px 40px 16px;">
          <div style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#4a4742;">Shiftwork</div>
          <h1 style="margin:4px 0 24px;font-family:Georgia,serif;font-size:28px;font-weight:500;letter-spacing:-0.02em;">${title}</h1>
          ${body}
          ${ctaHref && ctaLabel ? `<div style="margin:28px 0 8px;"><a href="${ctaHref}" style="display:inline-block;background:#1a1816;color:#fbf9f4;padding:12px 20px;border-radius:4px;text-decoration:none;font-size:14px;font-weight:500;">${ctaLabel}</a></div>` : ""}
        </td></tr>
        <tr><td style="padding:20px 40px 32px;border-top:1px solid #ddd6c7;font-size:12px;color:#4a4742;">
          Sent by Shiftwork. If you didn't expect this email, you can safely ignore it.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
