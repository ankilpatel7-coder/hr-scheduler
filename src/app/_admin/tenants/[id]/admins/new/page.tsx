"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function AddAdminPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError(null);
    try {
      const res = await fetch(`/api/_admin/tenants/${id}/admins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      setTempPassword(data.tempPassword);
      setSubmitting(false);
    } catch (err: any) {
      setError(err?.message ?? "Network error");
      setSubmitting(false);
    }
  }

  if (tempPassword) {
    return (
      <div className="space-y-6 max-w-2xl">
        <Link href={`/_admin/tenants/${id}`} className="text-smoke hover:text-ink text-sm inline-flex items-center gap-1">
          <ArrowLeft size={14} /> Back to tenant
        </Link>
        <div className="card p-6 border-l-4" style={{ borderLeftColor: "#10b981" }}>
          <div className="label-eyebrow mb-1" style={{ color: "#059669" }}>Admin created</div>
          <h1 className="display text-3xl text-ink mb-4">{name} added as admin</h1>
          <div className="border border-amber/40 bg-amber/5 rounded p-4 mb-4">
            <div className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">⚠ Save this password NOW</div>
            <div className="font-mono text-sm space-y-1">
              <div><span className="text-smoke">Email:</span> {email}</div>
              <div><span className="text-smoke">Password:</span> <span className="bg-ink/5 px-2 py-0.5 rounded">{tempPassword}</span></div>
            </div>
          </div>
          <Link href={`/_admin/tenants/${id}`} className="btn btn-primary">Back to tenant</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-md">
      <Link href={`/_admin/tenants/${id}`} className="text-smoke hover:text-ink text-sm inline-flex items-center gap-1">
        <ArrowLeft size={14} /> Back to tenant
      </Link>
      <div>
        <div className="label-eyebrow mb-1">New admin</div>
        <h1 className="display text-3xl text-ink">Add admin user</h1>
      </div>
      <form onSubmit={onSubmit} className="card p-6 space-y-4">
        <div>
          <label>Full name *</label>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label>Email *</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value.toLowerCase())} />
        </div>
        {error && <div className="text-sm text-rose bg-rose/10 px-3 py-2 rounded border border-rose/30">{error}</div>}
        <div className="flex justify-end gap-2 pt-2 border-t border-dust">
          <Link href={`/_admin/tenants/${id}`} className="btn btn-secondary">Cancel</Link>
          <button type="submit" disabled={submitting} className="btn btn-primary">
            {submitting ? "Creating…" : "Create admin"}
          </button>
        </div>
      </form>
    </div>
  );
}
