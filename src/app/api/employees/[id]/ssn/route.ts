/**
 * /api/employees/[id]/ssn
 *
 * PATCH  Set the employee's SSN. Admin only. Body: { ssn: "XXX-XX-XXXX" or 9 digits }.
 *        Encrypts at rest. Returns the masked form (***-**-1234).
 * DELETE Clear the stored SSN. Admin only.
 *
 * SECURITY:
 *   - Plaintext SSN never leaves this endpoint — we never echo it back.
 *   - GET is intentionally NOT implemented. Decryption happens server-side
 *     only in the W-2 / EFW2 generation paths.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { encryptSsn, maskSsn, ssnEncryptionAvailable } from "@/lib/ssn-crypto";

const patchSchema = z.object({
  ssn: z
    .string()
    .transform((s) => s.replace(/\D/g, ""))
    .refine((s) => /^\d{9}$/.test(s), "SSN must be 9 digits."),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  if (!ssnEncryptionAvailable()) {
    return NextResponse.json(
      {
        error:
          "SSN_ENCRYPTION_KEY is not configured. Generate a key with `openssl rand -base64 32` " +
          "and set it as an env var (Vercel + local .env) before using SSN features.",
      },
      { status: 500 },
    );
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid SSN" },
      { status: 400 },
    );
  }

  const employee = await prisma.user.findFirst({
    where: { id: params.id, tenantId: auth.tenantId },
    select: { id: true },
  });
  if (!employee) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { encrypted, last4 } = encryptSsn(parsed.data.ssn);
  await prisma.user.update({
    where: { id: params.id },
    data: { ssnEncrypted: encrypted, ssnLast4: last4 },
  });

  return NextResponse.json({ ok: true, masked: maskSsn(last4) });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const employee = await prisma.user.findFirst({
    where: { id: params.id, tenantId: auth.tenantId },
    select: { id: true },
  });
  if (!employee) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.user.update({
    where: { id: params.id },
    data: { ssnEncrypted: null, ssnLast4: null },
  });

  return NextResponse.json({ ok: true });
}
