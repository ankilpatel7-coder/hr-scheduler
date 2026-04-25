"use client";
import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setErr("Invalid email or password.");
      return;
    }
    router.push(params.get("callbackUrl") ?? "/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-between p-12 bg-ink text-paper relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06]"
             style={{
               backgroundImage:
                 "radial-gradient(circle at 1px 1px, #fbf9f4 1px, transparent 0)",
               backgroundSize: "18px 18px",
             }}
        />
        <div className="relative">
          <div className="text-[10px] tracking-[0.3em] uppercase text-paper/60">
            Shiftwork
          </div>
          <div className="display text-paper text-xl mt-1">Est. {new Date().getFullYear()}</div>
        </div>
        <div className="relative">
          <h1 className="display text-6xl lg:text-7xl leading-[0.95] font-light">
            The shift<br />
            <span className="italic text-rust">runs itself.</span>
          </h1>
          <p className="mt-6 max-w-sm text-paper/70 text-[15px] leading-relaxed">
            Scheduling, clock-in, timesheets, swaps, and time-off — for teams that would
            rather serve customers than wrangle spreadsheets.
          </p>
        </div>
        <div className="relative flex items-center gap-4 text-[11px] uppercase tracking-[0.2em] text-paper/50 flex-wrap">
          <span>Selfie verified</span>
          <span className="w-1 h-1 rounded-full bg-paper/30" />
          <span>Multi-location</span>
          <span className="w-1 h-1 rounded-full bg-paper/30" />
          <span>Export ready</span>
        </div>
      </div>

      <div className="flex items-center justify-center p-8 md:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-10">
            <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-2">
              Sign in
            </div>
            <h2 className="display text-4xl">Welcome back.</h2>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label>Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label>Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {err && (
              <div className="text-sm text-rust bg-rust/10 px-3 py-2 rounded border border-rust/20">
                {err}
              </div>
            )}
            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading ? "Signing in…" : "Sign in"}
            </button>
            <div className="text-right">
              <Link
                href="/forgot-password"
                className="text-xs text-smoke hover:text-ink underline underline-offset-4"
              >
                Forgot password?
              </Link>
            </div>
          </form>

          <div className="mt-8 pt-6 border-t border-dust">
            <div className="text-xs text-smoke">
              First-time setup?{" "}
              <Link href="/signup" className="text-ink underline underline-offset-4">
                Create an admin account
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-smoke">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
