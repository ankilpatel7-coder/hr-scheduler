"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT",
  "NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

export default function NewTenantPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);

  const [form, setForm] = useState({
    slug: "",
    businessName: "",
    legalName: "",
    state: "KY",
    addressLine1: "",
    city: "",
    zip: "",
    phone: "",
    federalEIN: "",
    stateTaxId: "",
    // Initial admin
    adminEmail: "",
    adminName: "",
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Auto-generate slug from business name
  function onBusinessNameBlur() {
    if (!form.slug && form.businessName) {
      const slug = form.businessName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32);
      update("slug", slug);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/superadmin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      setTempPassword(data.tempPassword);
      setCreatedSlug(data.tenant.slug);
      setSubmitting(false);
    } catch (err: any) {
      setError(err?.message ?? "Network error");
      setSubmitting(false);
    }
  }

  // Success state
  if (createdSlug && tempPassword) {
    return (
      <div className="space-y-6 max-w-2xl">
        <Link href="/superadmin/tenants" className="text-smoke hover:text-ink text-sm inline-flex items-center gap-1">
          <ArrowLeft size={14} /> Back to businesses
        </Link>
        <div className="card p-6 border-l-4" style={{ borderLeftColor: "#10b981" }}>
          <div className="label-eyebrow mb-1" style={{ color: "#059669" }}>Tenant created</div>
          <h1 className="display text-3xl text-ink mb-4">{form.businessName} is ready</h1>
          <p className="text-sm text-smoke mb-4">
            URL: <code className="font-mono text-rust bg-rust/5 px-1.5 py-0.5 rounded">/{createdSlug}</code>
          </p>
          <div className="border border-amber/40 bg-amber/5 rounded p-4 mb-4">
            <div className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">
              ⚠ Save this password NOW — it won't be shown again
            </div>
            <div className="font-mono text-sm space-y-1">
              <div><span className="text-smoke">Email:</span> {form.adminEmail}</div>
              <div><span className="text-smoke">Password:</span> <span className="bg-ink/5 px-2 py-0.5 rounded">{tempPassword}</span></div>
            </div>
            <div className="text-xs text-smoke mt-3">
              Send these credentials securely to the new business admin. They should reset their password immediately after first login.
            </div>
          </div>
          <div className="flex gap-2">
            <Link href={`/superadmin/tenants`} className="btn btn-secondary">Back to list</Link>
            <Link href={`/${createdSlug}`} target="_blank" className="btn btn-primary">Open dashboard →</Link>
          </div>
        </div>
      </div>
    );
  }

  // Form state
  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/superadmin/tenants" className="text-smoke hover:text-ink text-sm inline-flex items-center gap-1">
        <ArrowLeft size={14} /> Back to businesses
      </Link>
      <div>
        <div className="label-eyebrow mb-1">New business</div>
        <h1 className="display text-4xl text-ink">Add a tenant</h1>
        <p className="text-sm text-smoke mt-1">
          Creates a new business + an initial admin account. The admin gets a temporary password that you give them out-of-band.
        </p>
      </div>

      <form onSubmit={onSubmit} className="card p-6 space-y-5">
        <Section title="Business">
          <Field label="Business name *">
            <input
              type="text"
              required
              value={form.businessName}
              onChange={(e) => update("businessName", e.target.value)}
              onBlur={onBusinessNameBlur}
              placeholder="Greenreleaf"
            />
          </Field>
          <Field label="URL slug *" hint="Lowercase letters, numbers, hyphens. Becomes the URL: /<slug>">
            <input
              type="text"
              required
              pattern="[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?"
              value={form.slug}
              onChange={(e) => update("slug", e.target.value.toLowerCase())}
              placeholder="greenreleaf"
            />
          </Field>
          <Field label="Legal name" hint="For tax forms. Defaults to business name if blank.">
            <input
              type="text"
              value={form.legalName}
              onChange={(e) => update("legalName", e.target.value)}
              placeholder="Greenreleaf LLC"
            />
          </Field>
          <Field label="State *" hint="Determines payroll tax rules">
            <select required value={form.state} onChange={(e) => update("state", e.target.value)}>
              {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </Section>

        <Section title="Address (optional — fill in later via Settings)">
          <Field label="Street address">
            <input type="text" value={form.addressLine1} onChange={(e) => update("addressLine1", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City">
              <input type="text" value={form.city} onChange={(e) => update("city", e.target.value)} />
            </Field>
            <Field label="ZIP">
              <input type="text" value={form.zip} onChange={(e) => update("zip", e.target.value)} maxLength={10} />
            </Field>
          </div>
          <Field label="Phone">
            <input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
          </Field>
        </Section>

        <Section title="Tax IDs (optional — required before running first payroll)">
          <Field label="Federal EIN" hint="9 digits, no dash">
            <input type="text" value={form.federalEIN} onChange={(e) => update("federalEIN", e.target.value.replace(/\D/g, ""))} maxLength={9} />
          </Field>
          <Field label="State tax ID">
            <input type="text" value={form.stateTaxId} onChange={(e) => update("stateTaxId", e.target.value)} />
          </Field>
        </Section>

        <Section title="Initial admin">
          <Field label="Admin name *">
            <input type="text" required value={form.adminName} onChange={(e) => update("adminName", e.target.value)} placeholder="Jane Doe" />
          </Field>
          <Field label="Admin email *" hint="Used for login. Must be unique across the entire app.">
            <input type="email" required value={form.adminEmail} onChange={(e) => update("adminEmail", e.target.value.toLowerCase())} />
          </Field>
        </Section>

        {error && (
          <div className="text-sm text-rose bg-rose/10 px-3 py-2 rounded border border-rose/30">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-dust">
          <Link href="/superadmin/tenants" className="btn btn-secondary">Cancel</Link>
          <button type="submit" disabled={submitting} className="btn btn-primary">
            {submitting ? "Creating…" : "Create business"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="label-eyebrow">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label>{label}</label>
      {children}
      {hint && <div className="text-[11px] text-smoke mt-1">{hint}</div>}
    </div>
  );
}
