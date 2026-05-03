"use client";

import { useState } from "react";
import { Key, Check, Copy } from "lucide-react";

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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resetPassword(adminId: string, adminName: string) {
    if (!confirm(`Reset password for ${adminName}? They'll lose access until you give them the new temporary password.`)) return;
    setResetting(adminId); setError(null);
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

  async function copyPassword(adminId: string, password: string) {
    await navigator.clipboard.writeText(password);
    setCopiedId(adminId);
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
            <button
              onClick={() => resetPassword(u.id, u.name)}
              disabled={resetting === u.id}
              className="text-xs text-rust hover:underline inline-flex items-center gap-1"
            >
              <Key size={11} /> {resetting === u.id ? "Resetting…" : "Reset password"}
            </button>
          </div>
          {tempPasswords[u.id] && (
            <div className="mt-2 border border-amber/40 bg-amber/5 rounded p-3">
              <div className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-1">
                Temporary password — save NOW (won&apos;t be shown again)
              </div>
              <div className="flex items-center gap-2">
                <code className="font-mono text-sm bg-ink/5 px-2 py-1 rounded flex-1">{tempPasswords[u.id]}</code>
                <button onClick={() => copyPassword(u.id, tempPasswords[u.id])} className="btn btn-secondary !px-2 !py-1">
                  {copiedId === u.id ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
              <div className="text-[10px] text-smoke mt-2">
                Send to {u.email} via secure channel (text, signal). They should change it immediately after first login.
              </div>
            </div>
          )}
        </li>
      ))}
      {error && <li className="py-2 text-xs text-rose">{error}</li>}
    </ul>
  );
}
