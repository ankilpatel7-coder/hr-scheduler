import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { sendEmail, baseEmailTemplate } from "@/lib/email";

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase();

  // Always return success to avoid revealing whether an email exists
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.active) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordReset.create({
      data: { userId: user.id, token, expiresAt },
    });

    const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`;
    await sendEmail({
      to: user.email,
      subject: "Reset your Shiftwork password",
      html: baseEmailTemplate(
        "Reset your password",
        `<p style="margin:0 0 16px;color:#1a1816;line-height:1.6;">Hi ${user.name}, we received a request to reset your password. Click the button below to choose a new one. This link will expire in 1 hour.</p><p style="margin:0;color:#4a4742;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>`,
        resetUrl,
        "Reset password"
      ),
    });
  }

  return NextResponse.json({ ok: true });
}
