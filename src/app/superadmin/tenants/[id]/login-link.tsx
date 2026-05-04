"use client";

import { useState } from "react";
import { Copy, Check, Send } from "lucide-react";

export default function LoginLink({
  slug,
  businessName,
  adminEmail,
}: {
  slug: string;
  businessName: string;
  adminEmail: string | null;
}) {
  const [copied, setCopied] = useState<"link" | "email" | null>(null);

  // For v12.0 (no per-tenant URL routing yet), all tenants share the global /login.
  // For v12.1 with /[tenant]/ routing, this becomes /<slug>/login.
  // We add ?tenant=<slug> as a hint the login page can use for branding.
  const origin = typeof window !== "undefined" ? window.location.origin : "https://hr-scheduler-2r1u.vercel.app";
  const loginUrl = `${origin}/login?tenant=${slug}`;
  const kioskUrl = `${origin}/m/kiosk/${slug}`;

  const emailSubject = `Your ${businessName} Shiftwork login`;
  const emailBody = `Hi,

You've been set up as an admin on Shiftwork for ${businessName}.

Log in here: ${loginUrl}

Email: ${adminEmail ?? "<your admin email>"}
Password: <sent separately>

Once logged in, please change your password immediately via the key icon in the top-right of the page.`;

  const mailto = adminEmail
    ? `mailto:${adminEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`
    : null;

  async function copyLink() {
    await navigator.clipboard.writeText(loginUrl);
    setCopied("link");
    setTimeout(() => setCopied(null), 2000);
  }

  async function copyKiosk() {
    await navigator.clipboard.writeText(kioskUrl);
    setCopied("kiosk");
    setTimeout(() => setCopied(null), 2000);
  }

  async function copyEmail() {
    await navigator.clipboard.writeText(emailBody);
    setCopied("email");
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="card p-6">
      <h2 className="display text-2xl text-ink mb-1">Login link</h2>
      <p className="text-sm text-smoke mb-4">
        Send this to {businessName}'s admin so they can log in.
      </p>

      <div className="space-y-3">
        <div>
          <label className="block label-eyebrow mb-1">URL</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={loginUrl}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs"
            />
            <button onClick={copyLink} className="btn btn-secondary !px-3" title="Copy link">
              {copied === "link" ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <div className="text-[11px] text-smoke mt-1">
            Admin login URL — for the admin to access the desktop dashboard.
          </div>
        </div>

        <div className="border-t border-dust pt-3">
          <label className="block label-eyebrow mb-1">📱 Mobile clock-in (kiosk URL for employees)</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={kioskUrl}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs"
            />
            <button onClick={copyKiosk} className="btn btn-secondary !px-3" title="Copy kiosk URL">
              {copied === "kiosk" ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <div className="text-[11px] text-smoke mt-1">
            Bookmark this on the shared iPad/iPhone employees use to clock in. Opens directly to a 4-digit PIN keypad. Each employee enters their PIN → takes a selfie → clocks in/out → device auto-signs-out for the next employee.
          </div>
        </div>

        <div className="border-t border-dust pt-3">
          <label className="block label-eyebrow mb-2">Send via email</label>
          <div className="flex gap-2 flex-wrap">
            {mailto ? (
              <a href={mailto} className="btn btn-primary">
                <Send size={14} /> Open in email client
              </a>
            ) : (
              <span className="text-xs text-smoke italic">No admin email on file. Add an admin first.</span>
            )}
            <button onClick={copyEmail} className="btn btn-secondary">
              {copied === "email" ? <Check size={14} /> : <Copy size={14} />}
              {copied === "email" ? " Copied" : " Copy email body"}
            </button>
          </div>
          <div className="text-[11px] text-smoke mt-2">
            The email body includes the login URL + a placeholder for the password. Send the password separately via a secure channel (text, signal, etc.) — never put it in the email.
          </div>
        </div>
      </div>
    </div>
  );
}
