"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowRight, Delete } from "lucide-react";

const REMEMBERED_EMAIL_KEY = "shiftwork_mobile_email";

export default function MobileLoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "pin">("email");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // On first render: if email is remembered from previous login, skip directly to PIN keypad
  useEffect(() => {
    try {
      const remembered = localStorage.getItem(REMEMBERED_EMAIL_KEY);
      if (remembered) {
        setEmail(remembered);
        setStep("pin");
      }
    } catch {}
    setHydrated(true);
  }, []);

  function pressDigit(d: string) {
    setError(null);
    if (pin.length < 4) {
      const next = pin + d;
      setPin(next);
      if (next.length === 4) submit(next);
    }
  }

  function backspace() {
    setError(null);
    setPin((p) => p.slice(0, -1));
  }

  function forgetEmail() {
    try { localStorage.removeItem(REMEMBERED_EMAIL_KEY); } catch {}
    setEmail("");
    setPin("");
    setError(null);
    setStep("email");
  }

  async function submit(pinValue: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await signIn("credentials", {
        email: email.toLowerCase().trim(),
        password: pinValue,
        redirect: false,
      });
      if (res?.error) {
        setError("Email or PIN is incorrect.");
        setPin("");
        setSubmitting(false);
        return;
      }
      // Remember email for next time
      try { localStorage.setItem(REMEMBERED_EMAIL_KEY, email.toLowerCase().trim()); } catch {}
      router.push("/m");
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Network error");
      setPin("");
      setSubmitting(false);
    }
  }

  // Don't render anything until we've checked localStorage (avoids flash of email screen)
  if (!hydrated) {
    return <div className="min-h-screen flex items-center justify-center text-smoke text-sm">Loading…</div>;
  }

  // EMAIL ENTRY STEP (first-ever login on this device)
  if (step === "email") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-xs">
          <div className="text-center mb-10">
            <div className="inline-block w-16 h-16 rounded-2xl bg-rust flex items-center justify-center mb-4">
              <span className="display text-3xl font-bold text-white">S</span>
            </div>
            <h1 className="display text-3xl text-ink">Shiftwork</h1>
            <p className="text-sm text-smoke mt-1">Enter your email to begin</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!email.includes("@")) { setError("Enter a valid email."); return; }
              setError(null);
              setStep("pin");
            }}
            className="space-y-4"
          >
            <div>
              <label>Email</label>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
              />
            </div>
            {error && <div className="text-sm text-rose">{error}</div>}
            <button type="submit" className="btn btn-primary w-full">
              Continue <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // PIN KEYPAD STEP
  const digits = ["1","2","3","4","5","6","7","8","9","","0",""];
  return (
    <div className="min-h-screen flex flex-col items-center justify-between p-6 select-none">
      <div className="w-full max-w-xs mt-8">
        <button onClick={forgetEmail} className="text-xs text-smoke hover:text-ink">
          ← Use a different email
        </button>
        <div className="text-center mt-6">
          <div className="text-xs text-smoke">{email}</div>
          <h2 className="display text-2xl text-ink mt-2">Enter your 4-digit PIN</h2>
        </div>

        <div className="flex justify-center gap-4 my-8">
          {[0,1,2,3].map((i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 ${
                pin.length > i ? "bg-ink border-ink" : "border-dust"
              }`}
            />
          ))}
        </div>

        {error && <div className="text-sm text-rose text-center mb-2">{error}</div>}
        {submitting && <div className="text-sm text-smoke text-center">Signing in…</div>}
      </div>

      <div className="grid grid-cols-3 gap-3 w-full max-w-xs mb-8">
        {digits.map((d, i) => {
          if (d === "" && i === 9) return <div key={i} />;
          if (d === "" && i === 11) {
            return (
              <button
                key={i}
                onClick={backspace}
                disabled={submitting}
                className="aspect-square rounded-full bg-paper border border-dust flex items-center justify-center hover:bg-dust/40 active:bg-dust"
                aria-label="Delete"
              >
                <Delete size={22} className="text-smoke" />
              </button>
            );
          }
          return (
            <button
              key={i}
              onClick={() => pressDigit(d)}
              disabled={submitting || pin.length >= 4}
              className="aspect-square rounded-full bg-paper border border-dust text-2xl font-mono text-ink hover:bg-dust/40 active:bg-dust disabled:opacity-40"
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}
