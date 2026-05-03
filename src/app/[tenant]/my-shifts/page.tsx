"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/navbar";
import { format, isBefore } from "date-fns";
import { Repeat, X } from "lucide-react";

type Shift = {
  id: string;
  startTime: string;
  endTime: string;
  role: string | null;
  notes: string | null;
  published: boolean;
  location: { id: string; name: string } | null;
  swap: { id: string; status: string } | null;
};

export default function MyShiftsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [offerModal, setOfferModal] = useState<Shift | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  async function load() {
    setLoading(true);
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + 60);
    const past = new Date();
    past.setDate(past.getDate() - 30);
    const res = await fetch(
      `/api/shifts?from=${past.toISOString()}&to=${future.toISOString()}`
    );
    if (res.ok) {
      const d = await res.json();
      setShifts(d.shifts);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (session) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const now = new Date();
  const upcoming = shifts.filter((s) => !isBefore(new Date(s.endTime), now));
  const past = shifts.filter((s) => isBefore(new Date(s.endTime), now));

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-10">
          <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-2">
            Welcome back
          </div>
          <h1 className="display text-5xl">{session?.user?.name}</h1>
        </div>

        {loading ? (
          <div className="text-smoke">Loading…</div>
        ) : (
          <>
            <section className="mb-10">
              <h2 className="text-xs uppercase tracking-[0.2em] text-smoke mb-4">
                Upcoming · {upcoming.length}
              </h2>
              {upcoming.length === 0 ? (
                <div className="card p-8 text-center text-sm text-smoke italic">
                  No upcoming shifts. Your manager will publish them when ready.
                </div>
              ) : (
                <div className="space-y-3">
                  {upcoming.map((s) => (
                    <ShiftCard
                      key={s.id}
                      shift={s}
                      onOfferSwap={() => setOfferModal(s)}
                    />
                  ))}
                </div>
              )}
            </section>

            {past.length > 0 && (
              <section>
                <h2 className="text-xs uppercase tracking-[0.2em] text-smoke mb-4">
                  Recent · {past.length}
                </h2>
                <div className="space-y-2">
                  {past.slice(0, 10).map((s) => (
                    <ShiftCard key={s.id} shift={s} past />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {offerModal && (
        <OfferSwapModal
          shift={offerModal}
          onClose={() => setOfferModal(null)}
          onOffered={() => {
            setOfferModal(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function ShiftCard({
  shift,
  past,
  onOfferSwap,
}: {
  shift: Shift;
  past?: boolean;
  onOfferSwap?: () => void;
}) {
  const swapStatus = shift.swap?.status;
  const canOffer =
    !past && !shift.swap && new Date(shift.startTime) > new Date() && onOfferSwap;

  return (
    <div className={`card p-5 ${past ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="display text-2xl">
            {format(new Date(shift.startTime), "EEEE, MMMM d")}
          </div>
          <div className="text-lg font-mono mt-1">
            {format(new Date(shift.startTime), "h:mma")}
            <span className="text-smoke"> – </span>
            {format(new Date(shift.endTime), "h:mma")}
          </div>
          <div className="flex items-center gap-3 mt-2 text-sm text-smoke flex-wrap">
            {shift.location && <span>{shift.location.name}</span>}
            {shift.role && (
              <>
                {shift.location && <span className="w-1 h-1 rounded-full bg-smoke" />}
                <span>{shift.role}</span>
              </>
            )}
          </div>
          {shift.notes && (
            <div className="mt-2 text-sm text-ink/70 italic">"{shift.notes}"</div>
          )}
          {swapStatus && (
            <div className="mt-3">
              <span
                className={`chip ${
                  swapStatus === "OFFERED"
                    ? ""
                    : swapStatus === "CLAIMED"
                    ? "chip-moss"
                    : swapStatus === "APPROVED"
                    ? "chip-moss"
                    : "chip-rust"
                }`}
              >
                Swap {swapStatus.toLowerCase()}
              </span>
            </div>
          )}
        </div>
        {canOffer && (
          <button onClick={onOfferSwap} className="btn btn-secondary !py-1">
            <Repeat size={14} /> Offer for swap
          </button>
        )}
      </div>
    </div>
  );
}

function OfferSwapModal({
  shift,
  onClose,
  onOffered,
}: {
  shift: Shift;
  onClose: () => void;
  onOffered: () => void;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const res = await fetch("/api/swaps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shiftId: shift.id, note }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json();
      setErr(d.error ?? "Failed");
      return;
    }
    onOffered();
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-6">
      <div className="card w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 btn btn-ghost !p-1.5">
          <X size={16} />
        </button>
        <div className="mb-6">
          <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-1">
            Offer this shift
          </div>
          <h2 className="display text-2xl">
            {format(new Date(shift.startTime), "EEE, MMM d · h:mma")}
          </h2>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label>Message to coworkers (optional)</label>
            <textarea
              rows={3}
              placeholder="e.g. Need this off for a doctor's appointment"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {err && (
            <div className="text-sm text-rust bg-rust/10 px-3 py-2 rounded border border-rust/20">
              {err}
            </div>
          )}
          <div className="text-xs text-smoke bg-dust/30 px-3 py-2 rounded">
            Once offered, coworkers can claim it. A manager has to approve before it's
            final.
          </div>
          <button disabled={saving} className="btn btn-primary w-full">
            {saving ? "Posting…" : "Post swap offer"}
          </button>
        </form>
      </div>
    </div>
  );
}
