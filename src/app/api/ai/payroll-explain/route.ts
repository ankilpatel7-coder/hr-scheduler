/**
 * AI: explain a paystub in plain English.
 *
 * POST /api/ai/payroll-explain  { payStubId: string }
 *   Loads the paystub, formats all the numbers, asks Gemini to walk through
 *   the gross → deductions → net math like a friendly accountant.
 *
 * The employee can view their own stub; admin/manager can view anyone's
 * in-tenant.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getServerAuth } from "@/lib/auth";
import { generateText, aiAvailable } from "@/lib/ai/gemini";

const bodySchema = z.object({
  payStubId: z.string().min(1),
});

export async function POST(req: Request) {
  if (!aiAvailable()) {
    return NextResponse.json(
      { error: "AI not configured. Set GROQ_API_KEY env var (https://console.groq.com/keys)." },
      { status: 500 },
    );
  }

  const session = await getServerAuth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;
  const role = (session.user as any).role as string;
  const tenantId = (session.user as any).tenantId as string | null;
  if (!tenantId) return NextResponse.json({ error: "No tenant context" }, { status: 400 });

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const stub = await prisma.payStub.findFirst({
    where: {
      id: parsed.data.payStubId,
      payPeriod: { tenantId },
    },
    include: {
      payPeriod: { select: { periodStart: true, periodEnd: true, payDate: true } },
      employee: { select: { id: true, name: true } },
    },
  });
  if (!stub) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Permission: own stub, or manager/admin
  if (stub.employeeId !== userId && role !== "ADMIN" && role !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const prompt = `You are a friendly payroll assistant. Explain this paystub to ${stub.employee.name} in plain English, ~150 words. Walk through the math step-by-step using the actual dollar amounts. Use short paragraphs and bullet points. Don't editorialize or add disclaimers.

Pay period: ${stub.payPeriod.periodStart.toISOString().slice(0,10)} to ${stub.payPeriod.periodEnd.toISOString().slice(0,10)}
Pay date: ${stub.payPeriod.payDate.toISOString().slice(0,10)}

Hours worked:
- Regular: ${stub.regularHours} hrs × $${stub.hourlyRate.toFixed(2)}/hr = $${stub.regularPay.toFixed(2)}
- Overtime: ${stub.overtimeHours} hrs × $${(stub.hourlyRate * 1.5).toFixed(2)}/hr = $${stub.overtimePay.toFixed(2)}
- GROSS PAY: $${stub.grossPay.toFixed(2)}

Pre-tax deductions (lower your taxable income):
- 401(k) contribution: $${stub.preTax401k.toFixed(2)}
- Health insurance: $${stub.preTaxHealth.toFixed(2)}
- HSA: $${stub.preTaxHsa.toFixed(2)}
- FSA: $${stub.preTaxFsa.toFixed(2)}
- Total pre-tax: $${stub.preTaxDeductions.toFixed(2)}

Taxes withheld:
- Federal income tax: $${stub.federalIncomeTax.toFixed(2)}
- Social Security (6.2%): $${stub.socialSecurityTax.toFixed(2)}
- Medicare (1.45%): $${stub.medicareTax.toFixed(2)}
${stub.additionalMedicareTax > 0 ? `- Additional Medicare (0.9% on wages >$200k): $${stub.additionalMedicareTax.toFixed(2)}\n` : ""}- State income tax (${stub.taxState ?? "?"}): $${stub.stateIncomeTax.toFixed(2)}
${stub.localIncomeTax > 0 ? `- Local tax (${stub.localTaxJurisdiction ?? "local"}): $${stub.localIncomeTax.toFixed(2)}\n` : ""}- Extra withholding (W-4 4c): $${stub.extraWithholding.toFixed(2)}

NET PAY (take-home): $${stub.netPay.toFixed(2)}

Total taxes/deductions: $${stub.totalDeductions.toFixed(2)}

Explain in this structure:
1. **How you earned $${stub.grossPay.toFixed(2)}**: the hours × rate math
2. **Pre-tax deductions**: why these reduce your tax bill
3. **Taxes**: federal, FICA, state breakdown
4. **Your take-home**: $${stub.netPay.toFixed(2)}, and what that represents
5. End with a one-line summary like "You worked X hours and took home $Y this period."

Use markdown formatting (bold, bullets). Be warm and clear, not robotic.`;

  try {
    const explanation = await generateText(prompt, { model: "flash" });
    return NextResponse.json({ explanation });
  } catch (e: any) {
    return NextResponse.json(
      { error: `AI request failed: ${e.message}` },
      { status: 500 },
    );
  }
}
