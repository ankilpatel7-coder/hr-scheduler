"use client";
import { useState } from "react";
import Link from "next/link";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    setSubmitted(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-md card p-8">
        <div className="mb-6">
          <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-1">
            Recover access
          </div>
          <h1 className="display text-3xl">Reset password</h1>
        </div>

        {submitted ? (
          <div className="space-y-4">
            <div className="card p-4 bg-moss/10 border-moss/20 text-sm">
              If an account exists for that email, we've sent a reset link. Check your
              inbox (and spam folder).
            </div>
            <Link href="/login" className="text-ink underline underline-offset-4 text-sm">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
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
            <button disabled={loading} className="btn btn-primary w-full">
              {loading ? "Sending…" : "Send reset link"}
            </button>
            <div className="text-xs text-smoke pt-2">
              Remember your password?{" "}
              <Link href="/login" className="text-ink underline underline-offset-4">
                Sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
