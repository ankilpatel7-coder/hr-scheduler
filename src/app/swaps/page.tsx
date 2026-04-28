"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/navbar";
import LocationFilter from "@/components/location-filter";
import { format } from "date-fns";
import { Check, Ban, Hand } from "lucide-react";

type Swap = {
  id: string;
  status: "OFFERED" | "CLAIMED" | "APPROVED" | "DENIED" | "CANCELED";
  note: string | null;
  shift: {
    id: string;
    startTime: string;
    endTime: string;
    role: string | null;
    location: { id: string; name: string } | null;
    employee: { id: string; name: string };
  };
  offeredBy: { id: string; name: string };
  claimedBy: { id: string; name: string } | null;
};

export default function SwapsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationFilter, setLocationFilter] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const userId = (session?.user as any)?.id;
  const role = (session?.user as any)?.role;
  const canDecide = role === "ADMIN" || role === "MANAGER";

  async function load() {
    const q = locationFilter ? `?locationId=${locationFilter}` : "";
    const res = await fetch(`/api/swaps${q}`);
    if (res.ok) {
      const d = await res.json();
      setSwaps(d.swaps);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (session) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, locationFilter]);

  async function claim(id: string) {
    const res = await fetch("/api/swaps/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const d = await res.json();
      alert(d.error ?? "Failed");
      return;
    }
    load();
  }

  async function decide(id: string, decision: "APPROVED" | "DENIED") {
    await fetch("/api/swaps/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, decision }),
    });
    load();
  }

  async function cancel(id: string) {
    if (!confirm("Cancel this swap offer?")) return;
    await fetch(`/api/swaps?id=${id}`, { method: "DELETE" });
    load();
  }

  const open = swaps.filter((s) => s.status === "OFFERED" || s.status === "CLAIMED");
  const closed = swaps.filter((s) => !["OFFERED", "CLAIMED"].includes(s.status));

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-baseline justify-between mb-8 flex-wrap gap-4">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-2">
              Shift coverage
            </div>
            <h1 className="display text-5xl">Swap board</h1>
          </div>
          <LocationFilter value={locationFilter} onChange={setLocationFilter} />
        </div>

        {loading ? (
          <div className="text-smoke">Loading…</div>
        ) : (
          <>
            <section className="mb-10">
              <h2 className="text-xs uppercase tracking-[0.2em] text-smoke mb-4">
                Open · {open.length}
              </h2>
              {open.length === 0 ? (
                <div className="card p-8 text-center text-sm text-smoke italic">
                  No open swaps. Offer a shift by going to <strong>My Shifts</strong>.
                </div>
              ) : (
                <div className="space-y-3">
                  {open.map((s) => (
                    <SwapCard
                      key={s.id}
                      swap={s}
                      userId={userId}
                      canDecide={canDecide}
                      onClaim={() => claim(s.id)}
                      onCancel={() => cancel(s.id)}
                      onDecide={(d) => decide(s.id, d)}
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="text-xs uppercase tracking-[0.2em] text-smoke mb-4">
                Resolved · {closed.length}
              </h2>
              {closed.length === 0 ? (
                <div className="card p-6 text-sm text-smoke italic">
                  No resolved swaps yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {closed.slice(0, 10).map((s) => (
                    <SwapCard
                      key={s.id}
                      swap={s}
                      userId={userId}
                      canDecide={false}
                      onClaim={() => {}}
                      onCancel={() => {}}
                      onDecide={() => {}}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function SwapCard({
  swap,
  userId,
  canDecide,
  onClaim,
  onCancel,
  onDecide,
}: {
  swap: Swap;
  userId: string;
  canDecide: boolean;
  onClaim: () => void;
  onCancel: () => void;
  onDecide: (d: "APPROVED" | "DENIED") => void;
}) {
  const isOfferer = swap.offeredBy.id === userId;
  const statusColor: Record<string, string> = {
    OFFERED: "chip",
    CLAIMED: "chip chip-moss",
    APPROVED: "chip chip-moss",
    DENIED: "chip chip-rust",
    CANCELED: "chip",
  };
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium">{swap.offeredBy.name}</span>
            <span className="text-smoke text-sm">is offering</span>
            <span className={statusColor[swap.status] ?? "chip"}>
              {swap.status.toLowerCase()}
            </span>
          </div>
          <div className="text-sm">
            <strong>{format(new Date(swap.shift.startTime), "EEE, MMM d")}</strong>
            <span className="text-smoke"> · </span>
            {format(new Date(swap.shift.startTime), "h:mma")} –{" "}
            {format(new Date(swap.shift.endTime), "h:mma")}
            {swap.shift.location && (
              <>
                <span className="text-smoke"> · </span>
                {swap.shift.location.name}
              </>
            )}
          </div>
          {swap.note && (
            <div className="text-sm text-ink/70 mt-2 italic">"{swap.note}"</div>
          )}
          {swap.claimedBy && (
            <div className="text-sm mt-2">
              <span className="text-smoke">Claimed by </span>
              <strong>{swap.claimedBy.name}</strong>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {swap.status === "OFFERED" && !isOfferer && (
            <button onClick={onClaim} className="btn btn-primary !py-1">
              <Hand size={14} /> I'll take it
            </button>
          )}
          {swap.status === "OFFERED" && isOfferer && (
            <button onClick={onCancel} className="btn btn-ghost !py-1">
              Cancel offer
            </button>
          )}
          {swap.status === "CLAIMED" && canDecide && (
            <>
              <button
                onClick={() => onDecide("APPROVED")}
                className="btn btn-secondary !py-1 text-moss !border-moss"
              >
                <Check size={14} /> Approve
              </button>
              <button
                onClick={() => onDecide("DENIED")}
                className="btn btn-secondary !py-1 text-rust !border-rust"
              >
                <Ban size={14} /> Deny
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
