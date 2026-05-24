"use client";

/**
 * Tenant prefs panel — toggles for house shifts visibility + break selfies.
 * Drops alongside ClockApprovalPanel on the Settings page.
 *
 * GET /api/tenant/settings to load current values, PATCH to save.
 */

import { useEffect, useState } from "react";
import { Building2, Camera, Loader2, Check, AlertCircle } from "lucide-react";

export default function TenantPrefsPanel() {
  const [enableHouseShifts, setEnableHouseShifts] = useState(false);
  const [requireBreakSelfie, setRequireBreakSelfie] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tenant/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.tenant) {
          setEnableHouseShifts(!!j.tenant.enableHouseShifts);
          setRequireBreakSelfie(j.tenant.requireBreakSelfie ?? true);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function save<T extends string, V>(field: T, value: V) {
    setSaving(true);
    setSaved(false);
    setErr(null);
    try {
      const res = await fetch("/api/tenant/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-6">
      <div className="flex items-start gap-3 mb-4">
        <Building2 className="text-rust mt-1 shrink-0" size={20} />
        <div>
          <h2 className="display text-xl text-ink">Tenant preferences</h2>
          <p className="text-sm text-smoke mt-0.5">
            Scheduling + clock-in behavior for everyone in this tenant.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-smoke">Loading…</div>
      ) : (
        <div className="space-y-4">
          <Toggle
            label="Enable House Shifts"
            description="Allow posting unassigned (open) shifts that any employee can be assigned to. Hidden by default."
            checked={enableHouseShifts}
            disabled={saving}
            onChange={(v) => {
              setEnableHouseShifts(v);
              save("enableHouseShifts", v);
            }}
          />
          <Toggle
            label="Require selfie when starting a break"
            description="Employees take a quick selfie before going on break, the same way clock-in works."
            icon={<Camera size={14} />}
            checked={requireBreakSelfie}
            disabled={saving}
            onChange={(v) => {
              setRequireBreakSelfie(v);
              save("requireBreakSelfie", v);
            }}
          />

          {saving && (
            <div className="inline-flex items-center gap-1.5 text-xs text-smoke">
              <Loader2 size={12} className="animate-spin" /> Saving…
            </div>
          )}
          {saved && (
            <div className="inline-flex items-center gap-1.5 text-xs text-moss">
              <Check size={12} /> Saved
            </div>
          )}
          {err && (
            <div className="inline-flex items-center gap-1.5 text-xs text-red-700">
              <AlertCircle size={12} /> {err}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
  icon,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  icon?: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 w-4 h-4"
      />
      <div className="flex-1">
        <div className="text-sm font-medium text-ink inline-flex items-center gap-1.5">
          {icon}
          {label}
        </div>
        <div className="text-xs text-smoke mt-0.5">{description}</div>
      </div>
    </label>
  );
}
