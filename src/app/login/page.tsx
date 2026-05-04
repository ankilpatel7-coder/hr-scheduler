"use client";
import { Suspense, useEffect, useState } from "react";
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

  // v13: if a mobile user lands here (e.g. via a stale link), bounce them to
  // the PIN keypad at /m/login instead of showing the desktop email+password form.
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      const ua = navigator.userAgent;
      if (/iPhone|iPad|iPod|Android|Mobile|webOS|BlackBerry|Windows Phone/i.test(ua)) {
        router.replace("/m/login");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setErr("Invalid email or password.");
      return;
    }
    // v12.2: redirect to "/" — the root page handles smart routing
    // (super-admin → /superadmin, tenant user → /<slug>/dashboard)
    router.push(params.get("callbackUrl") ?? "/");
    router.refresh();
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-between p-12 relative overflow-hidden border-r border-dust">
        <div className="absolute inset-0">
          <div className="absolute inset-0 opacity-[0.06]" style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, var(--text-secondary) 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}/>
          <div className="absolute -top-32 -right-32 w-[400px] h-[400px] rounded-full bg-rust/[0.06] blur-[100px]"></div>
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-md bg-rust flex items-center justify-center">
              <span className="font-display text-white font-bold text-lg leading-none">S</span>
            </div>
            <div>
              <div className="display text-xl text-ink">Shiftwork</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-smoke">Operations console</div>
            </div>
          </div>
        </div>

        <div className="relative z-10">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-moss mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-moss"></span>
            System online
          </div>
          <h1 className="display text-6xl lg:text-7xl leading-[0.95] font-light text-ink">
            The shift<br />
            <span className="text-rust italic">runs itself.</span>
          </h1>
          <p className="mt-6 max-w-sm text-smoke text-[15px] leading-relaxed">
            Real-time scheduling, selfie-verified clock-in, automated payroll — built for teams that ship.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-4 font-mono text-[11px] uppercase tracking-[0.2em] text-smoke flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-moss"></span> Multi-location</span>
          <span className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-moss"></span> Selfie verified</span>
          <span className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-moss"></span> Export ready</span>
        </div>
      </div>

      <div className="flex items-center justify-center p-8 md:p-12 relative">
        <div className="w-full max-w-sm relative z-10 animate-slide-up">
          <div className="mb-10">
            <div className="label-eyebrow mb-3">Sign in</div>
            <h2 className="display text-4xl text-ink">Welcome back.</h2>
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
              <div className="text-sm text-rose px-3 py-2 rounded border border-rose/30" style={{ background: "rgba(244,63,94,0.1)" }}>
                {err}
              </div>
            )}
            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading ? "Authenticating…" : "Sign in →"}
            </button>
            <div className="text-right">
              <Link href="/forgot-password" className="text-xs text-smoke hover:text-rust transition-colors">
                Forgot password?
              </Link>
            </div>
          </form>

          <div className="mt-8 pt-6 border-t border-dust">
            <div className="text-xs text-smoke">
              First-time setup?{" "}
              <Link href="/signup" className="text-rust hover:text-glow transition-colors">
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
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-smoke">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
