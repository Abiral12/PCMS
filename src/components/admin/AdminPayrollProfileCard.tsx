"use client";

import { useEffect, useMemo, useState } from "react";

type Employee = {
  _id: string;
  name: string;
  position: string;
};

type PayrollProfile = {
  employeeId: string;
  baseSalary: number;
  cycleDays: number;
  effectiveFrom: string; // ISO
  perDayRounding: "none" | "floor" | "round" | "ceil";
  excludeWeekdays: number[];
};

function fmtNPR(n: number) {
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("en-NP").format(n);
}

export default function AdminPayrollProfileCard({ employees }: { employees: Employee[] }) {
  const [employeeId, setEmployeeId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [baseSalary, setBaseSalary] = useState<number>(0);
  const [cycleDays, setCycleDays] = useState<number>(30);
  const [effectiveFrom, setEffectiveFrom] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [perDayRounding, setPerDayRounding] = useState<PayrollProfile["perDayRounding"]>("round");
  const [excludeWeekdays, setExcludeWeekdays] = useState<number[]>([6]); // default Saturday

  const selectedEmployeeLabel = useMemo(() => {
    const e = employees.find((x) => x._id === employeeId);
    return e ? `${e.name} (${e.position || "—"})` : "";
  }, [employeeId, employees]);

  const perDayPreview = useMemo(() => {
    if (!cycleDays || cycleDays <= 0) return 0;
    const raw = baseSalary / cycleDays;
    if (!Number.isFinite(raw)) return 0;

    switch (perDayRounding) {
      case "none":
        return raw;
      case "floor":
        return Math.floor(raw);
      case "ceil":
        return Math.ceil(raw);
      case "round":
      default:
        return Math.round(raw);
    }
  }, [baseSalary, cycleDays, perDayRounding]);

  async function loadProfile(empId: string) {
    setError(null);
    setOk(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/payroll/profile?employeeId=${encodeURIComponent(empId)}`, {
        method: "GET",
        headers: { "content-type": "application/json" },
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "Failed to load profile");

      const profile: PayrollProfile | null = data.profile;
      if (profile) {
        setBaseSalary(Number(profile.baseSalary) || 0);
        setCycleDays(Number(profile.cycleDays) || 30);
        setEffectiveFrom(new Date(profile.effectiveFrom).toISOString().slice(0, 10));
        setPerDayRounding(profile.perDayRounding || "round");
        setExcludeWeekdays(Array.isArray(profile.excludeWeekdays) ? profile.excludeWeekdays : [6]);
      } else {
        // default for new profile
        setBaseSalary(0);
        setCycleDays(30);
        setEffectiveFrom(new Date().toISOString().slice(0, 10));
        setPerDayRounding("round");
        setExcludeWeekdays([6]);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    if (!employeeId) return;

    setError(null);
    setOk(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/payroll/profile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employeeId,
          baseSalary,
          cycleDays,
          effectiveFrom,
          perDayRounding,
          excludeWeekdays,
        }),
      });

      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "Failed to save");
      setOk("Saved payroll profile.");
    } catch (e: any) {
      setError(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function toggleExcludeDay(dow: number) {
    setExcludeWeekdays((prev) => (prev.includes(dow) ? prev.filter((x) => x !== dow) : [...prev, dow].sort()));
  }

  return (
    <section className="card payroll-card">
      <div className="card-header payroll-header">
        <div>
          <h2 className="payroll-title">Salary Settings</h2>
          <div className="payroll-subtitle">Set base salary and cycle days (24 / 30 / custom) per employee.</div>
        </div>
      </div>

      <div className="payroll-body">
        {/* Employee select (same style as your other select) */}
        <div className="payroll-row">
          <div className="filter-group">
            <label className="filter-label">Employee</label>
            <select
              className="input input--v2"
              value={employeeId}
              onChange={(e) => {
                const id = e.target.value;
                setEmployeeId(id);
                if (id) loadProfile(id);
              }}
            >
              <option value="">Select employee…</option>
              {employees.map((emp) => (
                <option key={emp._id} value={emp._id}>
                  {emp.name} ({emp.position || "—"})
                </option>
              ))}
            </select>
          </div>

          <div className="payroll-meta">
            {employeeId ? <span className="payroll-pill">{selectedEmployeeLabel}</span> : null}
            {loading ? <span className="payroll-hint">Loading…</span> : null}
          </div>
        </div>

        {/* Salary */}
        <div className="payroll-grid">
          <div className="filter-group">
            <label className="filter-label">Base Salary (NPR)</label>
            <input
              className="input input--v2"
              type="number"
              min={0}
              step={1}
              value={Number.isFinite(baseSalary) ? baseSalary : 0}
              onChange={(e) => setBaseSalary(Number(e.target.value))}
              placeholder="e.g. 18200"
              disabled={!employeeId}
            />
            <div className="payroll-hint">Preview: {fmtNPR(baseSalary)} NPR</div>
          </div>

          {/* Cycle days quick select */}
          <div className="filter-group">
            <label className="filter-label">Cycle Days</label>

            <div className="payroll-segment">
              <button
                type="button"
                className={`payroll-seg-btn ${cycleDays === 24 ? "is-active" : ""}`}
                onClick={() => setCycleDays(24)}
                disabled={!employeeId}
              >
                24 days
              </button>
              <button
                type="button"
                className={`payroll-seg-btn ${cycleDays === 30 ? "is-active" : ""}`}
                onClick={() => setCycleDays(30)}
                disabled={!employeeId}
              >
                30 days
              </button>
              <div className="payroll-custom">
                <input
                  className="input input--v2"
                  type="number"
                  min={1}
                  max={365}
                  value={cycleDays}
                  onChange={(e) => setCycleDays(Number(e.target.value))}
                  disabled={!employeeId}
                />
              </div>
            </div>

            <div className="payroll-hint">
              Per-day (preview): {fmtNPR(perDayPreview)} NPR/day
            </div>
          </div>

          {/* Effective from */}
          <div className="filter-group">
            <label className="filter-label">Effective From</label>
            <input
              className="input input--v2"
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              disabled={!employeeId}
            />
          </div>

          {/* Rounding */}
          <div className="filter-group">
            <label className="filter-label">Per-day Rounding</label>
            <select
              className="input input--v2"
              value={perDayRounding}
              onChange={(e) => setPerDayRounding(e.target.value as any)}
              disabled={!employeeId}
            >
              <option value="round">Round</option>
              <option value="floor">Floor</option>
              <option value="ceil">Ceil</option>
              <option value="none">None</option>
            </select>
          </div>

          {/* Exclude weekdays */}
          <div className="filter-group payroll-weekdays">
            <label className="filter-label">Exclude Weekdays (no absent deduction)</label>
            <div className="payroll-weekday-row">
              {[
                { label: "Sun", v: 0 },
                { label: "Mon", v: 1 },
                { label: "Tue", v: 2 },
                { label: "Wed", v: 3 },
                { label: "Thu", v: 4 },
                { label: "Fri", v: 5 },
                { label: "Sat", v: 6 },
              ].map((d) => (
                <button
                  key={d.v}
                  type="button"
                  className={`payroll-day-btn ${excludeWeekdays.includes(d.v) ? "is-active" : ""}`}
                  onClick={() => toggleExcludeDay(d.v)}
                  disabled={!employeeId}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <div className="payroll-hint">Default is Saturday excluded.</div>
          </div>
        </div>

        {/* Actions */}
        <div className="payroll-actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={saveProfile}
            disabled={!employeeId || saving}
          >
            {saving ? "Saving…" : "Save Salary Settings"}
          </button>

          {error ? <div className="payroll-error">{error}</div> : null}
          {ok ? <div className="payroll-ok">{ok}</div> : null}
        </div>
      </div>
    </section>
  );
}
