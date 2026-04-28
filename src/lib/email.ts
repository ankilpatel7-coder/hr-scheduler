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
    return { skipped: true, reason: "missing_api_key" as const };
  }
  console.log(`[email] Sending "${opts.subject}" to`, opts.to, `from "${from}"`);
  try {
    const result = await resend.emails.send({
      from,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    if ((result as any)?.error) {
      console.error("[email] Resend returned error:", (result as any).error);
      return { failed: true, error: (result as any).error };
    }
    console.log("[email] Sent OK, id:", (result as any)?.data?.id ?? "(none)");
    return { sent: true, result };
  } catch (e: any) {
    console.error("[email] Throw:", e?.message ?? e);
    return { failed: true, error: e?.message ?? String(e) };
  }
}

export function baseEmailTemplate(
  title: string,
  body: string,
  ctaHref?: string,
  ctaLabel?: string
) {
  // Dark navy theme matching the v3 app
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#0a0e1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;color:#f0f4ff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0e1a;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0f1626;border:1px solid #1e2a44;border-radius:10px;overflow:hidden;">
        <tr><td style="padding:32px 40px 16px;">
          <div style="display:inline-block;padding:6px 12px;background:linear-gradient(135deg,#3b82f6,#06b6d4);border-radius:4px;margin-bottom:20px;">
            <span style="color:white;font-weight:700;font-size:14px;letter-spacing:-0.02em;">Shiftwork</span>
          </div>
          <h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:28px;font-weight:500;letter-spacing:-0.02em;color:#f0f4ff;">${title}</h1>
          <div style="color:#c4cee0;line-height:1.6;">${body}</div>
          ${
            ctaHref && ctaLabel
              ? `<div style="margin:28px 0 8px;"><a href="${ctaHref}" style="display:inline-block;background:linear-gradient(135deg,#3b82f6 0%,#06b6d4 100%);color:white;padding:12px 22px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;box-shadow:0 4px 14px rgba(59,130,246,0.35);">${ctaLabel} →</a></div>`
              : ""
          }
        </td></tr>
        <tr><td style="padding:20px 40px 32px;border-top:1px solid #1e2a44;font-size:12px;color:#7a8aa8;">
          Sent by Shiftwork. If you didn't expect this email, you can safely ignore it.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
