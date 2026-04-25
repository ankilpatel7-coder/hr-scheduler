"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/navbar";
import { Plus, X, Check, Ban } from "lucide-react";
import { format } from "date-fns";

type Req = {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "DENIED" | "CANCELED";
  decisionNote: string | null;
  decidedAt: string | null;
  user: { id: string; name: string; department: string | null };
  decider: { name: string } | null;
};

export default function TimeOffPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [requests, setRequests] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [scope, setScope] = useState<"mine" | "all">("all");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const role = (session?.user as any)?.role;
  const canApprove = role === "ADMIN" || role === "MANAGER";

  async function load() {
    const q = role === "EMPLOYEE" ? "?scope=mine" : scope === "mine" ? "?scope=mine" : "";
    const res = await fetch(`/api/time-off${q}`);
    if (res.ok) {
      const d = await res.json();
      setRequests(d.requests);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (session) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, scope]);

  async function decide(id: string, decision: "APPROVED" | "DENIED", note?: string) {
    await fetch("/api/time-off/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, decision, note }),
    });
    load();
  }

  async function cancelMine(id: string) {
    if (!confirm("Cancel this request?")) return;
    await fetch(`/api/time-off?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-baseline justify-between mb-8 flex-wrap gap-4">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-2">
              PTO / leave
            </div>
            <h1 className="display text-5xl">Time off</h1>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn btn-primary">
            <Plus size={16} /> New request
          </button>
        </div>

        {canApprove && (
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setScope("all")}
              className={`btn btn-secondary ${scope === "all" ? "!bg-ink !text-paper !border-ink" : ""}`}
            >
              All team
            </button>
            <button
              onClick={() => setScope("mine")}
              className={`btn btn-secondary ${scope === "mine" ? "!bg-ink !text-paper !border-ink" : ""}`}
            >
              Just mine
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-smoke">Loading…</div>
        ) : requests.length === 0 ? (
          <div className="card p-8 text-center text-sm text-smoke italic">
            No time-off requests.
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <div key={r.id} className="card p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{r.user.name}</span>
                      <StatusChip status={r.status} />
                    </div>
                    <div className="text-sm text-smoke">
                      {format(new Date(r.startDate), "MMM d, yyyy")} –{" "}
                      {format(new Date(r.endDate), "MMM d, yyyy")}
                    </div>
                    {r.reason && (
                      <div className="text-sm text-ink/70 mt-2 italic">"{r.reason}"</div>
                    )}
                    {r.decider && (
                      <div className="text-xs text-smoke mt-2">
                        Decided by {r.decider.name}
                        {r.decisionNote && <> · "{r.decisionNote}"</>}
                      </div>
                    )}
                  </div>
                  {canApprove && r.status === "PENDING" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => decide(r.id, "APPROVED")}
                        className="btn btn-secondary !py-1 text-moss !border-moss"
                      >
                        <Check size={14} /> Approve
                      </button>
                      <button
                        onClick={() => {
                          const note = prompt("Reason for denial (optional):") ?? undefined;
                          decide(r.id, "DENIED", note);
                        }}
                        className="btn btn-secondary !py-1 text-rust !border-rust"
                      >
                        <Ban size={14} /> Deny
                      </button>
                    </div>
                  )}
                  {r.status === "PENDING" &&
                    r.user.id === (session?.user as any)?.id && (
                      <button onClick={() => cancelMine(r.id)} className="btn btn-ghost !py-1">
                        Cancel
                      </button>
                    )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: "chip",
    APPROVED: "chip chip-moss",
    DENIED: "chip chip-rust",
    CANCELED: "chip",
  };
  return <span className={map[status] ?? "chip"}>{status.toLowerCase()}</span>;
}

function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({ startDate: "", endDate: "", reason: "" });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    const res = await fetch("/api/time-off", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json();
      setErr(d.error ?? "Failed");
      return;
    }
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-6">
      <div className="card w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 btn btn-ghost !p-1.5">
          <X size={16} />
        </button>
        <div className="mb-6">
          <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-1">
            Request
          </div>
          <h2 className="display text-2xl">Time off</h2>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>Start date</label>
              <input
                type="date"
                required
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div>
              <label>End date</label>
              <input
                type="date"
                required
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label>Reason (optional)</label>
            <textarea
              rows={2}
              placeholder="Family trip, doctor visit, etc."
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </div>
          {err && (
            <div className="text-sm text-rust bg-rust/10 px-3 py-2 rounded border border-rust/20">
              {err}
            </div>
          )}
          <button disabled={saving} className="btn btn-primary w-full">
            {saving ? "Submitting…" : "Submit request"}
          </button>
        </form>
      </div>
    </div>
  );
}
