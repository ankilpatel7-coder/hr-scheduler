"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/navbar";
import {
  Mail,
  Check,
  AlertTriangle,
  Send,
  Database,
  Trash2,
  HardDrive,
} from "lucide-react";

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated" && (session?.user as any)?.role !== "ADMIN") {
      router.push("/dashboard");
    }
  }, [status, session, router]);

  if (status !== "authenticated") return null;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-4xl mx-auto px-6 py-10 animate-fade-in">
        <div className="mb-10 animate-slide-up">
          <div className="label-eyebrow mb-3">Admin · System</div>
          <h1 className="display text-5xl text-ink">Settings</h1>
        </div>

        <div className="space-y-6">
          <DatabasePanel />
          <EmailPanel email={session?.user?.email ?? ""} />
        </div>
      </main>
    </div>
  );
}

function DatabasePanel() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<any>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/db-stats");
    if (res.ok) setStats(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function cleanupHalf() {
    if (
      !confirm(
        "DELETE OLDEST half of records?\n\n" +
          "This will permanently delete approximately the oldest 50% of clock entries, shifts, " +
          "decided time-off requests, and resolved swaps.\n\n" +
          "Records from the last 30 days are protected and won't be touched.\n\n" +
          "⚠️ Make sure you've EXPORTED a backup first (Timesheets → Export → CSV/Excel)."
      )
    )
      return;
    setCleanupRunning(true);
    setCleanupResult(null);
    const res = await fetch("/api/admin/db-cleanup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "DELETE", mode: "half" }),
    });
    const data = await res.json();
    setCleanupRunning(false);
    setCleanupResult(data);
    setTimeout(load, 1500);
  }

  async function cleanupOlderThan(days: number) {
    const cutoff = new Date(Date.now() - days * 86400_000)
      .toISOString()
      .slice(0, 10);
    if (
      !confirm(
        `DELETE all records older than ${days} days (before ${cutoff})?\n\n` +
          `Records from the last 30 days are always protected.\n\n` +
          `⚠️ Export a backup first.`
      )
    )
      return;
    setCleanupRunning(true);
    setCleanupResult(null);
    const res = await fetch("/api/admin/db-cleanup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirm: "DELETE",
        mode: "olderThan",
        olderThan: cutoff,
      }),
    });
    const data = await res.json();
    setCleanupRunning(false);
    setCleanupResult(data);
    setTimeout(load, 1500);
  }

  return (
    <div className="card p-7 animate-slide-up">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-11 h-11 rounded-lg bg-rust/15 border border-rust/30 flex items-center justify-center flex-shrink-0">
          <Database size={20} className="text-rust" />
        </div>
        <div className="flex-1">
          <h2 className="display text-2xl text-ink mb-1">Database</h2>
          <p className="text-sm text-smoke">
            Storage usage and cleanup. Free Neon tier is 0.5 GB.
          </p>
        </div>
        <button
          onClick={load}
          className="btn btn-ghost !text-xs"
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {stats ? (
        <>
          {/* Usage bar */}
          <div className="mb-6">
            <div className="flex items-baseline justify-between mb-2">
              <div className="display text-3xl text-ink tabular-nums">
                {stats.totalMB.toFixed(1)}
                <span className="text-base font-normal text-smoke ml-1">MB</span>
                <span className="text-sm text-smoke font-mono mx-2">/</span>
                <span className="text-base font-normal text-smoke">512 MB</span>
              </div>
              <div
                className={`font-mono text-sm ${
                  stats.usedPercent > 80
                    ? "text-rose"
                    : stats.usedPercent > 50
                    ? "text-amber"
                    : "text-moss"
                }`}
              >
                {stats.usedPercent.toFixed(1)}% used
              </div>
            </div>
            <div className="h-3 rounded-full bg-paper/60 border border-dust overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  stats.usedPercent > 80
                    ? "bg-gradient-to-r from-amber to-rose"
                    : stats.usedPercent > 50
                    ? "bg-gradient-to-r from-glow to-amber"
                    : "bg-rust"
                }`}
                style={{ width: `${Math.min(stats.usedPercent, 100)}%` }}
              ></div>
            </div>
          </div>

          {/* Record counts */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
            <CountCell label="Users" value={stats.counts.users} />
            <CountCell label="Locations" value={stats.counts.locations} />
            <CountCell label="Shifts" value={stats.counts.shifts} />
            <CountCell label="Clock entries" value={stats.counts.clockEntries} />
            <CountCell label="Time off" value={stats.counts.timeOff} />
            <CountCell label="Swaps" value={stats.counts.swaps} />
          </div>

          {/* Top tables */}
          <details className="mb-6">
            <summary className="label-eyebrow cursor-pointer hover:text-rust transition-colors">
              Storage by table
            </summary>
            <div className="card p-3 mt-2 font-mono text-xs space-y-1">
              {stats.tables.map((t: any) => (
                <div key={t.table} className="flex justify-between text-smoke">
                  <span className="text-ink">{t.table}</span>
                  <span>{(t.bytes / 1024).toFixed(0)} KB</span>
                </div>
              ))}
            </div>
          </details>

          {/* Cleanup */}
          <div className="card p-4 bg-amber/5 border-amber/30">
            <div className="flex items-start gap-3 mb-4">
              <HardDrive size={18} className="text-amber flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-ink mb-1">Cleanup oldest records</div>
                <div className="text-xs text-smoke leading-relaxed">
                  Deletes oldest clock entries, completed shifts, and resolved time-off /
                  swaps. Records from the <strong className="text-ink">last 30 days</strong>{" "}
                  are always protected.
                  <br />
                  <strong className="text-amber">Always export a backup first</strong> —
                  Kentucky requires keeping payroll records for at least 1 year (KRS 337.320).
                </div>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => cleanupOlderThan(365)}
                disabled={cleanupRunning}
                className="btn btn-secondary text-xs"
              >
                Older than 1 year
              </button>
              <button
                onClick={() => cleanupOlderThan(180)}
                disabled={cleanupRunning}
                className="btn btn-secondary text-xs"
              >
                Older than 6 months
              </button>
              <button
                onClick={cleanupHalf}
                disabled={cleanupRunning}
                className="btn btn-secondary text-xs text-amber border-amber/40"
              >
                <Trash2 size={12} /> Delete oldest half
              </button>
            </div>

            {cleanupResult && (
              <div className="mt-4 card p-3 font-mono text-xs">
                {cleanupResult.ok ? (
                  <div className="text-moss flex items-center gap-2 mb-2">
                    <Check size={14} /> Cleanup complete
                  </div>
                ) : (
                  <div className="text-rose flex items-center gap-2 mb-2">
                    <AlertTriangle size={14} /> Failed: {cleanupResult.error}
                  </div>
                )}
                {cleanupResult.deleted && (
                  <div className="text-smoke space-y-0.5">
                    <div>Clock entries deleted: <span className="text-ink">{cleanupResult.deleted.clockEntries}</span></div>
                    <div>Shifts deleted: <span className="text-ink">{cleanupResult.deleted.shifts}</span></div>
                    <div>Swaps deleted: <span className="text-ink">{cleanupResult.deleted.swaps}</span></div>
                    <div>Time-offs deleted: <span className="text-ink">{cleanupResult.deleted.timeOffs}</span></div>
                  </div>
                )}
                {cleanupResult.note && (
                  <div className="mt-2 text-amber text-[11px]">{cleanupResult.note}</div>
                )}
              </div>
            )}
          </div>

          {stats.oldestClockEntry && (
            <div className="text-xs text-smoke mt-3">
              Oldest clock entry:{" "}
              <span className="font-mono text-ink">
                {new Date(stats.oldestClockEntry).toLocaleDateString()}
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="text-smoke">Loading database stats…</div>
      )}
    </div>
  );
}

function CountCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="display text-2xl text-ink tabular-nums">{value.toLocaleString()}</div>
      <div className="label-eyebrow !text-[9px] mt-1">{label}</div>
    </div>
  );
}

function EmailPanel({ email }: { email: string }) {
  const [to, setTo] = useState(email);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function sendTest(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/email-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      setResult(await res.json());
    } catch (e: any) {
      setResult({ error: e.message ?? String(e) });
    }
    setSending(false);
  }

  return (
    <div className="card p-7 animate-slide-up">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-11 h-11 rounded-lg bg-rust/15 border border-rust/30 flex items-center justify-center flex-shrink-0">
          <Mail size={20} className="text-rust" />
        </div>
        <div>
          <h2 className="display text-2xl text-ink mb-1">Email diagnostics</h2>
          <p className="text-sm text-smoke">
            Verify Resend is wired up. If this fails, password resets and notifications
            won't work.
          </p>
        </div>
      </div>

      <form onSubmit={sendTest} className="space-y-4">
        <div>
          <label>Send to</label>
          <input
            type="email"
            required
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <button disabled={sending} className="btn btn-primary">
          <Send size={14} /> {sending ? "Sending…" : "Send test email"}
        </button>
      </form>

      {result && (
        <div className="mt-6 space-y-3">
          <div className="label-eyebrow">Result</div>
          <div className="card p-4 font-mono text-xs">
            <div className="mb-3">
              <div className="text-smoke mb-1">Configuration:</div>
              <ConfigRow label="RESEND_API_KEY" value={result.config?.RESEND_API_KEY} />
              <ConfigRow label="EMAIL_FROM" value={result.config?.EMAIL_FROM} />
              <ConfigRow label="NEXTAUTH_URL" value={result.config?.NEXTAUTH_URL} />
            </div>
            <div>
              <div className="text-smoke mb-1">Send result:</div>
              {result.result?.sent && (
                <div className="text-moss flex items-center gap-2">
                  <Check size={14} /> Sent successfully
                </div>
              )}
              {result.result?.skipped && (
                <div className="text-amber flex items-center gap-2">
                  <AlertTriangle size={14} /> Skipped: {result.result.reason}
                </div>
              )}
              {result.result?.failed && (
                <div className="text-rose">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle size={14} /> Failed
                  </div>
                  <pre className="text-[11px] whitespace-pre-wrap">
                    {JSON.stringify(result.result.error, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  const ok = value && !value.includes("MISSING");
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-moss" : "bg-rose"}`}></span>
      <span className="text-ink min-w-[140px]">{label}</span>
      <span className="text-smoke">{value}</span>
    </div>
  );
}
