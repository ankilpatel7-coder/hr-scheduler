"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export default function PinForm({ hasExistingPin }: { hasExistingPin: boolean }) {
  const router = useRouter();
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setMsg(null);
    if (newPin !== confirmPin) { setError("New PIN and confirmation do not match."); return; }
    if (!/^\d{4}$/.test(newPin)) { setError("PIN must be exactly 4 digits."); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/me/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin: hasExistingPin ? currentPin : undefined, newPin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      setMsg("PIN saved. You can now use it to clock in from the mobile app.");
      setCurrentPin(""); setNewPin(""); setConfirmPin("");
      setSubmitting(false);
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Network error");
      setSubmitting(false);
    }
  }

  async function onClearPin() {
    if (!confirm("Remove your PIN? You won't be able to clock in from the mobile app until you set a new one.")) return;
    setSubmitting(true); setError(null);
    try {
      const res = await fetch("/api/me/pin", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      setMsg("PIN removed.");
      router.refresh();
      setSubmitting(false);
    } catch (err: any) {
      setError(err?.message ?? "Network error");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card p-6 space-y-4">
      {hasExistingPin && (
        <div>
          <label>Current PIN</label>
          <input
            type="password"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            required
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            autoComplete="current-password"
            placeholder="••••"
            className="text-center font-mono text-2xl tracking-[0.5em]"
          />
        </div>
      )}
      <div>
        <label>New 4-digit PIN</label>
        <input
          type="password"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          required
          value={newPin}
          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          autoComplete="new-password"
          placeholder="••••"
          className="text-center font-mono text-2xl tracking-[0.5em]"
        />
        <div className="text-[11px] text-smoke mt-1">Avoid 0000, 1234, your birth year, etc.</div>
      </div>
      <div>
        <label>Confirm new PIN</label>
        <input
          type="password"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          required
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          autoComplete="new-password"
          placeholder="••••"
          className="text-center font-mono text-2xl tracking-[0.5em]"
        />
      </div>
      {error && <div className="text-sm text-rose bg-rose/10 px-3 py-2 rounded border border-rose/30">{error}</div>}
      {msg && <div className="text-sm" style={{ color: "#059669" }}>{msg}</div>}
      <div className="flex justify-between items-center pt-2 border-t border-dust">
        {hasExistingPin ? (
          <button type="button" onClick={onClearPin} disabled={submitting} className="text-rose text-xs hover:underline inline-flex items-center gap-1">
            <Trash2 size={12} /> Remove PIN
          </button>
        ) : <span />}
        <button type="submit" disabled={submitting} className="btn btn-primary">
          {submitting ? "Saving…" : hasExistingPin ? "Update PIN" : "Set PIN"}
        </button>
      </div>
    </form>
  );
}
