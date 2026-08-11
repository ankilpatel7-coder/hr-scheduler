"use client";

/**
 * Reset PIN button — admin/manager action on an employee.
 *
 * Calls POST /api/employees/[id]/pin, which generates a PIN guaranteed not to
 * collide with any other active employee in the tenant, then reveals it once
 * in a modal so the admin can pass it along. The PIN is stored as a bcrypt
 * hash and can never be retrieved again.
 *
 * The reveal is a modal rather than inline so it can sit in a tight flex row
 * of action buttons without distorting the layout.
 */

import { useState } from "react";
import { KeyRound, Copy, Check, X } from "lucide-react";

export default function ResetPinButton({
  employeeId,
  employeeName,
}: {
  employeeId: string;
  employeeName: string;
}) {
  const [busy, setBusy] = useState(false);
  const [newPin, setNewPin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function resetPin() {
    const confirmed = window.confirm(
      `Reset the clock-in PIN for ${employeeName}?\n\n` +
        `Their current PIN stops working immediately. You'll get a new one to give them.`,
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/employees/${employeeId}/pin`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      setNewPin(data.tempPin ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Network error");
    } finally {
      setBusy(false);
    }
  }

  async function copyPin() {
    if (!newPin) return;
    try {
      await navigator.clipboard.writeText(newPin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be blocked; the PIN is on screen regardless.
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={resetPin}
        disabled={busy}
        className="btn btn-secondary disabled:opacity-50"
        title="Generate a new clock-in PIN for this employee"
      >
        <KeyRound size={14} />
        {busy ? "Resetting…" : "Reset PIN"}
      </button>

      {error && (
        <div className="text-xs text-rose self-center">{error}</div>
      )}

      {newPin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(44, 44, 42, 0.45)" }}
          onClick={() => setNewPin(null)}
        >
          <div
            className="card p-6 w-full max-w-sm text-center relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setNewPin(null)}
              className="absolute top-3 right-3 text-smoke hover:text-ink p-1 rounded"
              aria-label="Close"
            >
              <X size={16} />
            </button>

            <div className="label-eyebrow mb-1">New PIN</div>
            <h3 className="display text-xl text-ink mb-4">{employeeName}</h3>

            <div className="flex items-center justify-center gap-3 mb-4">
              <span className="font-mono text-4xl tracking-[0.4em] text-ink pl-[0.4em]">
                {newPin}
              </span>
              <button
                type="button"
                onClick={copyPin}
                className="text-smoke hover:text-ink p-1.5 rounded border border-dust"
                title="Copy PIN"
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
            </div>

            <p className="text-xs text-smoke leading-relaxed">
              Give this to {employeeName} now — it can&rsquo;t be shown again.
              They can pick their own later from Change PIN.
            </p>

            <button
              type="button"
              onClick={() => setNewPin(null)}
              className="btn btn-primary w-full mt-5"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
