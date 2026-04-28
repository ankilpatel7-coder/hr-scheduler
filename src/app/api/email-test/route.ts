import { NextResponse } from "next/server";
import { sendEmail, baseEmailTemplate } from "@/lib/email";
import { requireRole } from "@/lib/guards";

export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;

  const { to } = await req.json().catch(() => ({}));
  if (!to || typeof to !== "string") {
    return NextResponse.json({ error: "Missing 'to' field" }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  // Reveal config status without leaking the actual key
  const config = {
    RESEND_API_KEY: apiKey
      ? `set (length ${apiKey.length}, starts with ${apiKey.slice(0, 4)})`
      : "MISSING",
    EMAIL_FROM: from ?? "MISSING (using fallback)",
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "MISSING",
  };

  const result = await sendEmail({
    to,
    subject: "Shiftwork test — emails are working",
    html: baseEmailTemplate(
      "Test successful",
      `<p style="margin:0 0 12px;">If you're reading this, your Resend setup is working correctly.</p>
       <p style="margin:0;color:#7a8aa8;font-size:13px;">Sent from your Shiftwork admin diagnostic page at ${new Date().toISOString()}.</p>`
    ),
  });

  return NextResponse.json({ config, result });
}
