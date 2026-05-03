"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ChangePasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setMsg(null);

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      setMsg("Password updated successfully.");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setSubmitting(false);
    } catch (err: any) {
      setError(err?.message ?? "Network error");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card p-6 space-y-4">
      <div>
        <label>Current password</label>
        <input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
      </div>
      <div>
        <label>New password</label>
        <input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" minLength={8} />
        <div className="text-[11px] text-smoke mt-1">At least 8 characters.</div>
      </div>
      <div>
        <label>Confirm new password</label>
        <input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" minLength={8} />
      </div>
      {error && <div className="text-sm text-rose bg-rose/10 px-3 py-2 rounded border border-rose/30">{error}</div>}
      {msg && <div className="text-sm" style={{ color: "#059669" }}>{msg}</div>}
      <div className="flex justify-end pt-2 border-t border-dust">
        <button type="submit" disabled={submitting} className="btn btn-primary">
          {submitting ? "Updating…" : "Update password"}
        </button>
      </div>
    </form>
  );
}
