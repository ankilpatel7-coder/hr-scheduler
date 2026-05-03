"use client";

import { useState } from "react";
import { Key, Check, Copy, Hash } from "lucide-react";

type Admin = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  superAdmin: boolean;
};

export default function AdminsList({ admins }: { admins: Admin[] }) {
  const [resetting, setResetting] = useState<string | null>(null);
  const [tempPasswords, setTempPasswords] = useState<Record<string, string>>({});
  const [tempPins, setTempPins] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resetPassword(adminId: string, adminName: string) {
    if (!confirm(`Reset password for ${adminName}? They'll lose access until you give them the new temporary password.`)) return;
    setResetting(adminId + ":pwd"); setError(null);
    try {
      const res = await fetch(`/api/superadmin/users/${adminId}/reset-password`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        setResetting(null);
        return;
      }
      setTempPasswords((p) => ({ ...p, [adminId]: data.tempPassword }));
      setResetting(null);
    } catch (err: any) {
      setError(err?.message ?? "Network error");
      setResetting(null);
    }
  }

  async function resetPin(adminId: string, adminName: string) {
    if (!confirm(`Reset 4-digit PIN for ${adminName}? They'll need the new PIN to clock in via mobile.`)) return;
    setResetting(adminId + ":pin"); setError(null);
    try {
      const res = await fetch(`/api/superadmin/users/${adminId}/reset-pin`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        setResetting(null);
        return;
      }
      setTempPins((p) => ({ ...p, [adminId]: data.tempPin }));
      setResetting(null);
    } catch (err: any) {
      setError(err?.message ?? "Network error");
      setResetting(null);
    }
  }

  async function copyValue(id: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (admins.length === 0) {
    return <div className="text-sm text-smoke italic">No admin users for this tenant. Use the &quot;Add admin&quot; button below.</div>;
  }

  return (
    <ul className="divide-y divide-dust">
      {admins.map((u) => (
        <li key={u.id} className="py-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="font-medium text-ink text-sm">
                {u.name}
                {u.superAdmin && <span className="ml-2 chip" style={{ color: "#7c3aed", borderColor: "rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.08)" }}>Super-admin</span>}
                {!u.active && <span className="ml-2 chip" style={{ color: "#dc2626" }}>Inactive</span>}
              </div>
              <div className="text-xs text-smoke">{u.email}</div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => resetPassword(u.id, u.name)}
                disabled={resetting !== null}
                className="text-xs text-rust hover:underline inline-flex items-center gap-1"
              >
                <Key size={11} /> {resetting === u.id + ":pwd" ? "Resetting…" : "Reset password"}
              </button>
              <button
                onClick={() => resetPin(u.id, u.name)}
                disabled={resetting !== null}
                className="text-xs text-rust hover:underline inline-flex items-center gap-1"
              >
                <Hash size={11} /> {resetting === u.id + ":pin" ? "Resetting…" : "Reset PIN"}
              </button>
            </div>
          </div>
          {tempPasswords[u.id] && (
            <div className="mt-2 border border-amber/40 bg-amber/5 rounded p-3">
              <div className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-1">
                Temporary password — save NOW (won&apos;t be shown again)
              </div>
              <div className="flex items-center gap-2">
                <code className="font-mono text-sm bg-ink/5 px-2 py-1 rounded flex-1">{tempPasswords[u.id]}</code>
                <button onClick={() => copyValue(u.id + ":pwd", tempPasswords[u.id])} className="btn btn-secondary !px-2 !py-1">
                  {copiedId === u.id + ":pwd" ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
              <div className="text-[10px] text-smoke mt-2">
                Send to {u.email} via secure channel (text, signal). They should change it immediately after first login.
              </div>
            </div>
          )}
          {tempPins[u.id] && (
            <div className="mt-2 border border-blue-300 bg-blue-50 rounded p-3">
              <div className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider mb-1">
                Temporary 4-digit PIN — save NOW
              </div>
              <div className="flex items-center gap-2">
                <code className="font-mono text-2xl tracking-[0.4em] bg-ink/5 px-3 py-1 rounded flex-1 text-center">{tempPins[u.id]}</code>
                <button onClick={() => copyValue(u.id + ":pin", tempPins[u.id])} className="btn btn-secondary !px-2 !py-1">
                  {copiedId === u.id + ":pin" ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
              <div className="text-[10px] text-smoke mt-2">
                Send to {u.email} via secure channel. They should change it via /change-pin after first use.
              </div>
            </div>
          )}
        </li>
      ))}
      {error && <li className="py-2 text-xs text-rose">{error}</li>}
    </ul>
  );
}
