"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  Circle,
  Filter,
  Clock,
  Sparkles,
  X,
} from "lucide-react";

type TodoItem = {
  id: string;
  text: string;
  done: boolean;
  createdAt: string; // ISO
};

type Slot = {
  start: string; // ISO
  end: string;   // ISO
  text: string;
};

type Session = {
  checkIn: string;         // ISO
  checkOut: string | null; // ISO | null
  slots: Slot[];
};

type WorkbookDay = {
  date: string; // YYYY-MM-DD
  todos: TodoItem[];
  sessions: Session[];
  notes: string;
  updatedAt: string | null; // ISO | null
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function kathmanduYMD(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kathmandu",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const y = parts.find((p) => p.type === "year")?.value || "1970";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const day = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${day}`;
}

function toIsoMaybe(v: any) {
  if (!v) return null;
  try {
    return new Date(v).toISOString();
  } catch {
    return null;
  }
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtRange(start: Date, end: Date) {
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}

function toDate(x: string | Date) {
  return x instanceof Date ? x : new Date(x);
}

async function apiFetch<T>(
  url: string,
  opts: RequestInit & { employeeId: string }
): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "x-employee-id": opts.employeeId, // TEMP auth; replace later with session
      ...(opts.headers ?? {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as any)?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

// Attendance types expected from /api/attendance
type AttendanceRec = { type: "checkin" | "checkout"; timestamp: string | Date };
type Props = {
  employeeId: string;
  employeeName: string;
  onValidationChange?: (v: { canSubmit: boolean; missingCount: number }) => void;
};
// Build sessions: checkin->checkout (supports multiple)
function buildSessions(records: AttendanceRec[]) {
  const sorted = [...records].sort(
    (a, b) => toDate(a.timestamp).getTime() - toDate(b.timestamp).getTime()
  );

  const sessions: Array<{ checkIn: Date; checkOut: Date | null }> = [];
  let open: Date | null = null;

  for (const r of sorted) {
    const t = toDate(r.timestamp);
    if (r.type === "checkin") {
      if (!open) open = t;
    } else {
      if (open) {
        sessions.push({ checkIn: open, checkOut: t });
        open = null;
      }
    }
  }

  if (open) sessions.push({ checkIn: open, checkOut: null });
  return sessions;
}

function generateSlots(checkIn: Date, end: Date) {
  const slots: Array<{ start: Date; end: Date }> = [];
  let cursor = new Date(checkIn.getTime());

  while (cursor.getTime() < end.getTime()) {
    const next = new Date(cursor.getTime() + 60 * 60 * 1000);
    slots.push({
      start: new Date(cursor.getTime()),
      end: new Date(Math.min(next.getTime(), end.getTime())),
    });
    cursor = next;
  }

  return slots;
}

function mergeTexts(existing: Session | undefined, ci: Date, co: Date | null, end: Date) {
  const existingMap = new Map<number, string>();
  for (const s of existing?.slots || []) {
    existingMap.set(new Date(s.start).getTime(), s.text || "");
  }

  const generated = generateSlots(ci, end);
  const slots: Slot[] = generated.map((g) => ({
    start: g.start.toISOString(),
    end: g.end.toISOString(),
    text: existingMap.get(g.start.getTime()) ?? "",
  }));

  return {
    checkIn: ci.toISOString(),
    checkOut: co ? co.toISOString() : null,
    slots,
  } satisfies Session;
}

export default function WorkbookTab(props: {
  employeeId: string;
  employeeName?: string;
  onValidationChange?: (v: { canSubmit: boolean; missingCount: number }) => void;
}) {


  const { employeeId } = props;

  const today = useMemo(() => kathmanduYMD(new Date()), []);
  const [date, setDate] = useState<string>(today);

  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [notes, setNotes] = useState<string>("");

  const [newTodo, setNewTodo] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [onlyFilledSlots, setOnlyFilledSlots] = useState(false);

  // Dirty/pending save tracking (prevents “Saved” incorrectly)
  const pendingSaves = useRef(0);
  const [dirty, setDirty] = useState(false);

  // Debounce timers
  const notesTimer = useRef<number | null>(null);
  const slotTimers = useRef<Record<string, number | null>>({}); // key by slotStart ISO
const reconcileSeq = useRef(0);

  const markPending = () => {
    pendingSaves.current += 1;
    setDirty(true);
  };

  const markSettled = () => {
    pendingSaves.current = Math.max(0, pendingSaves.current - 1);
    if (pendingSaves.current === 0) setDirty(false);
  };

  // -------- Load day from API --------
  const loadDay = useCallback(
    async (targetDate: string) => {
      if (!employeeId) return;
      setLoading(true);
      setErrMsg(null);

      try {
        const data = await apiFetch<{ day: any }>(
          `/api/workbook/day?date=${encodeURIComponent(targetDate)}`,
          { method: "GET", employeeId }
        );

        const day = data.day ?? {};
        setTodos(Array.isArray(day.todos) ? day.todos : []);
        setSessions(Array.isArray(day.sessions) ? day.sessions : []);
        setNotes(typeof day.notes === "string" ? day.notes : "");
        setSavedAt(toIsoMaybe(day.updatedAt));
        pendingSaves.current = 0;
        setDirty(false);
      } catch (e: any) {
        setErrMsg(e?.message ?? "Failed to load workbook");
      } finally {
        setLoading(false);
      }
    },
    [employeeId]
  );

  useEffect(() => {
    loadDay(date);
  }, [date, employeeId, loadDay]);

  // -------- Reconcile sessions/slots from Attendance --------
 const reconcileAttendance = useCallback(async (targetDate: string) => {
  if (!employeeId) return;

  const seq = ++reconcileSeq.current;

  try {
    const a = await apiFetch<{ attendance: any[] }>(
  `/api/attendance?employeeId=${encodeURIComponent(employeeId)}&limit=200`,
  { method: "GET", employeeId }
);

    if (seq !== reconcileSeq.current) return; // ignore stale response

    const raw: any[] = Array.isArray(a.attendance) ? a.attendance : [];

    const todays = raw.filter((r) => {
      const ts = new Date(r.timestamp);
      return kathmanduYMD(ts) === targetDate;
    });

    const built = buildSessions(
      todays.map((r) => ({ type: r.type, timestamp: r.timestamp }))
    );

    const now = new Date();
    const isToday = targetDate === today;

    setSessions((prev) => {
      const existingByCI = new Map<number, Session>();
      for (const s of prev) existingByCI.set(new Date(s.checkIn).getTime(), s);

      const nextSessions: Session[] = built.map((s) => {
        const existing = existingByCI.get(s.checkIn.getTime());

        const end = s.checkOut
          ? s.checkOut
          : isToday
            ? now
            : s.checkIn;

        return mergeTexts(existing, s.checkIn, s.checkOut, end);
      });

      return nextSessions;
    });
  } catch (e: any) {
    setErrMsg(e?.message ?? "Failed to reconcile attendance");
  }
}, [employeeId, today]);


useEffect(() => {
  if (!employeeId) return;
  reconcileAttendance(date);
}, [employeeId, date, reconcileAttendance]);

useEffect(() => {
  if (date !== today) return;
  const t = window.setInterval(() => reconcileAttendance(date), 60_000);
  return () => window.clearInterval(t);
}, [date, today, reconcileAttendance]);


  // -------- TODOS (unchanged) --------
  async function addTodo() {
    const text = newTodo.trim();
    if (!text) return;

    const optimistic: TodoItem = {
      id: crypto.randomUUID(),
      text,
      done: false,
      createdAt: new Date().toISOString(),
    };

    setTodos((prev) => [optimistic, ...prev]);
    setNewTodo("");
    markPending();

    try {
      const resp = await apiFetch<{ ok: boolean; day?: any }>(`/api/workbook/todos`, {
        method: "POST",
        employeeId,
        body: JSON.stringify({ date, id: optimistic.id, text }),
      });

      const day = resp.day;
      if (day) {
        setTodos(Array.isArray(day.todos) ? day.todos : []);
        setSavedAt(toIsoMaybe(day.updatedAt));
      }
    } catch (e: any) {
      setErrMsg(e?.message ?? "Failed to add todo");
      loadDay(date);
    } finally {
      markSettled();
    }
  }

  async function toggleTodo(id: string) {
    const current = todos.find((t) => t.id === id);
    const nextDone = !(current?.done ?? false);

    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: nextDone } : t)));
    markPending();

    try {
      const resp = await apiFetch<{ ok: boolean; day?: any }>(`/api/workbook/todos`, {
        method: "PATCH",
        employeeId,
        body: JSON.stringify({ date, id, done: nextDone }),
      });
      const day = resp.day;
      if (day) {
        setTodos(Array.isArray(day.todos) ? day.todos : []);
        setSavedAt(toIsoMaybe(day.updatedAt));
      }
    } catch (e: any) {
      setErrMsg(e?.message ?? "Failed to update todo");
      loadDay(date);
    } finally {
      markSettled();
    }
  }

  async function updateTodoText(id: string, text: string) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, text } : t)));
    markPending();

    try {
      const resp = await apiFetch<{ ok: boolean; day?: any }>(`/api/workbook/todos`, {
        method: "PATCH",
        employeeId,
        body: JSON.stringify({ date, id, text }),
      });
      const day = resp.day;
      if (day) {
        setTodos(Array.isArray(day.todos) ? day.todos : []);
        setSavedAt(toIsoMaybe(day.updatedAt));
      }
    } catch (e: any) {
      setErrMsg(e?.message ?? "Failed to edit todo");
      loadDay(date);
    } finally {
      markSettled();
    }
  }

  async function deleteTodo(id: string) {
    const before = todos;
    setTodos((prev) => prev.filter((t) => t.id !== id));
    markPending();

    try {
      const resp = await apiFetch<{ ok: boolean; day?: any }>(`/api/workbook/todos`, {
        method: "DELETE",
        employeeId,
        body: JSON.stringify({ date, id }),
      });
      const day = resp.day;
      if (day) {
        setTodos(Array.isArray(day.todos) ? day.todos : []);
        setSavedAt(toIsoMaybe(day.updatedAt));
      }
    } catch (e: any) {
      setErrMsg(e?.message ?? "Failed to delete todo");
      setTodos(before);
    } finally {
      markSettled();
    }
  }

  async function clearDone() {
    const doneIds = todos.filter((t) => t.done).map((t) => t.id);
    if (doneIds.length === 0) return;

    setSaving(true);
    setErrMsg(null);

    try {
      for (const id of doneIds) {
        await apiFetch(`/api/workbook/todos`, {
          method: "DELETE",
          employeeId,
          body: JSON.stringify({ date, id }),
        });
      }
      await loadDay(date);
    } catch (e: any) {
      setErrMsg(e?.message ?? "Failed to clear done");
      await loadDay(date);
    } finally {
      setSaving(false);
    }
  }

  // -------- SLOT SAVE (debounced) --------
  function setSlotText(
  sessionCheckIn: string,
  sessionCheckOut: string | null,
  slotStart: string,
  slotEnd: string,
  text: string
) {
  // Local UI update
  setSessions((prev) =>
    prev.map((s) => {
      if (s.checkIn !== sessionCheckIn) return s;
      return {
        ...s,
        checkOut: sessionCheckOut, // keep in sync
        slots: s.slots.map((sl) => (sl.start === slotStart ? { ...sl, text } : sl)),
      };
    })
  );

  const key = `${sessionCheckIn}__${slotStart}`;

  // ---- pending tracking (see Fix 3 below) ----
  if (!slotTimers.current[key]) markPending(); // only once per pending timer

  const prevTimer = slotTimers.current[key];
  if (prevTimer) window.clearTimeout(prevTimer);

  slotTimers.current[key] = window.setTimeout(async () => {
    try {
      await apiFetch(`/api/workbook/slot`, {
        method: "PUT",
        employeeId,
        body: JSON.stringify({
          date,
          sessionCheckIn,
          sessionCheckOut,
          slotStart,
          slotEnd,
          text,
        }),
      });
    } catch (e: any) {
      setErrMsg(e?.message ?? "Failed to save slot");
    } finally {
      slotTimers.current[key] = null;
      markSettled();
    }
  }, 500);
}


  // -------- NOTES (debounced) --------
  function onNotesChange(v: string) {
    setNotes(v);
    markPending();

    if (notesTimer.current) window.clearTimeout(notesTimer.current);
    notesTimer.current = window.setTimeout(async () => {
      try {
        await apiFetch(`/api/workbook/notes`, {
          method: "PUT",
          employeeId,
          body: JSON.stringify({ date, notes: v }),
        });
      } catch (e: any) {
        setErrMsg(e?.message ?? "Failed to save notes");
      } finally {
        markSettled();
      }
    }, 650);
  }

  async function saveNow() {
    setSaving(true);
    setErrMsg(null);
    try {
      await apiFetch(`/api/workbook/notes`, {
        method: "PUT",
        employeeId,
        body: JSON.stringify({ date, notes }),
      });
      await loadDay(date);
    } catch (e: any) {
      setErrMsg(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // -------- Derived UI values --------
  const todoStats = useMemo(() => {
    const total = todos.length;
    const done = todos.filter((t) => t.done).length;
    const pending = total - done;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, done, pending, pct };
  }, [todos]);

  const filledSlotCount = useMemo(() => {
    let n = 0;
    for (const s of sessions) {
      for (const sl of s.slots) {
        if ((sl.text ?? "").trim()) n += 1;
      }
    }
    return n;
  }, [sessions]);

    const { missingCount, totalSlots } = useMemo(() => {
    let total = 0;
    let missing = 0;

    for (const s of sessions) {
      for (const sl of s.slots) {
        total += 1;
        if (!String(sl.text ?? "").trim()) missing += 1;
      }
    }
    return { totalSlots: total, missingCount: missing };
  }, [sessions]);

  const canSubmit = useMemo(() => {
    // You can tighten this if you want (e.g., also require !dirty)
    return totalSlots > 0 && missingCount === 0;
  }, [totalSlots, missingCount]);

  useEffect(() => {
    props.onValidationChange?.({ canSubmit, missingCount });
  }, [canSubmit, missingCount, props]);


  const sessionsToRender = useMemo(() => {
    if (!onlyFilledSlots) return sessions;

    return sessions
      .map((s) => ({
        ...s,
        slots: s.slots.filter((sl) => (sl.text ?? "").trim().length > 0),
      }))
      .filter((s) => s.slots.length > 0);
  }, [sessions, onlyFilledSlots]);

  return (
    <section className="wb-wrap">
      {/* Header */}
      <div className="wb-header">
        <div className="wb-title">
          <div className="wb-title-row">
            <h2>Workbook</h2>
            <span className={`wb-status ${dirty ? "warn" : "ok"}`}>
              {loading ? "Loading..." : dirty ? "Unsaved" : "Saved"}
            </span>
          </div>
          <p className="wb-sub">Daily to-do + attendance-based hourly sessions (saved in database)</p>
          {errMsg && <div className="wb-error">{errMsg}</div>}
        </div>

        <div className="wb-actions">
          <div className="wb-date">
            <span className="wb-label">Date</span>
            <input
              className="wb-input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="wb-btnrow">
            <button
              className={`wb-btn ghost ${onlyFilledSlots ? "active" : ""}`}
              onClick={() => setOnlyFilledSlots((s) => !s)}
              title="Show only filled slots"
              disabled={loading}
            >
              <Filter size={16} />
              Filled only
            </button>

            <button className="wb-btn primary" onClick={saveNow} disabled={loading || saving}>
              <Save size={16} />
              {saving ? "Saving..." : "Save"}
            </button>
          </div>

          <div className="wb-meta">
            <span className="wb-meta-pill">
              <Sparkles size={14} />
              To-do: {todoStats.done}/{todoStats.total} ({todoStats.pct}%)
            </span>
            <span className="wb-meta-pill">
              <Clock size={14} />
              Slots filled: {filledSlotCount}
            </span>
            {savedAt && <span className="wb-meta-text">Last saved: {new Date(savedAt).toLocaleString()}</span>}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="wb-grid">
        {/* To-do */}
        <div className="wb-card">
          <div className="wb-card-head">
            <div>
              <h3>Daily To-Do</h3>
              <div className="wb-progress">
                <div className="wb-progress-track">
                  <div className="wb-progress-bar" style={{ width: `${todoStats.pct}%` }} />
                </div>
                <span className="wb-progress-text">
                  {todoStats.pending} pending • {todoStats.done} done
                </span>
              </div>
            </div>

            <div className="wb-card-actions">
              <button
                className="wb-btn ghost sm"
                onClick={clearDone}
                disabled={loading || saving || todoStats.done === 0}
                title="Remove completed tasks"
              >
                <X size={16} />
                Clear done
              </button>
            </div>
          </div>

          <div className="wb-todo-add">
            <input
              className="wb-input"
              placeholder="Add a task for today..."
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addTodo();
              }}
              disabled={loading}
            />
            <button className="wb-btn success" onClick={addTodo} disabled={loading || !newTodo.trim()}>
              <Plus size={16} />
              Add
            </button>
          </div>

          {todos.length === 0 ? (
            <p className="wb-empty">No to-do items for this day.</p>
          ) : (
            <div className="wb-todo-list">
              {todos.map((t) => (
                <div key={t.id} className={`wb-todo-item ${t.done ? "done" : ""}`}>
                  <button
                    className="wb-icon"
                    onClick={() => toggleTodo(t.id)}
                    title={t.done ? "Mark pending" : "Mark done"}
                    disabled={loading}
                  >
                    {t.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                  </button>

                  <input
                    className="wb-todo-input"
                    value={t.text}
                    onChange={(e) => updateTodoText(t.id, e.target.value)}
                    disabled={loading}
                  />

                  <button className="wb-icon danger" onClick={() => deleteTodo(t.id)} title="Delete" disabled={loading}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sessions + Slots */}
        <div className="wb-card">
          <div className="wb-card-head">
            <div>
              <h3>Attendance Sessions</h3>
              <p className="wb-hint">
                Slots are generated from check-in time and stop at checkout (active session extends until now).
              </p>
            </div>
          </div>

          <div className="wb-hours">
            {sessionsToRender.length === 0 ? (
              <p className="wb-empty">
                No sessions found for this date. Check in to start hourly logs.
              </p>
            ) : (
              sessionsToRender.map((s, si) => {
                const ci = new Date(s.checkIn);
                const co = s.checkOut ? new Date(s.checkOut) : null;

                return (
                  <div key={s.checkIn} className="subcard">
                    <div className="session-head">
                      <div>
                        <div className="session-title">
                          Session {si + 1} • {fmtTime(ci)} → {co ? fmtTime(co) : "Active"}
                        </div>
                        <div className="session-sub">
                          {co ? "Closed session" : "Active session (adds new slot every hour)"}
                        </div>
                      </div>
                      {!co && <span className="badge badge-green">Active</span>}
                    </div>

                    <div className="wb-hours" style={{ marginTop: 12 }}>
                      {s.slots.length === 0 ? (
                        <p className="wb-empty">No slots generated yet.</p>
                      ) : (
                        s.slots.map((sl) => {
                          const st = new Date(sl.start);
                          const en = new Date(sl.end);

                          return (
                            <div key={sl.start} className="wb-hour-row">
                              <div className="wb-hour-left">
                                <div className="wb-hour-chip">{fmtTime(st)}</div>
                                <div className="wb-hour-sub">{fmtTime(en)}</div>
                              </div>

                              <div className="wb-hour-right">
                                <div className="wb-hour-title">{fmtRange(st, en)}</div>
                                <textarea
                                  className="wb-textarea"
                                  rows={2}
                                  placeholder="What did you work on in this slot?"
                                  value={sl.text ?? ""}
                                  onChange={(e) => setSlotText(s.checkIn, s.checkOut, sl.start, sl.end, e.target.value)}

                                  disabled={loading}
                                />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="wb-notes">
            <label className="wb-label">Daily Notes / Summary</label>
            <textarea
              className="wb-textarea"
              rows={4}
              placeholder="Optional: summary, blockers, next steps..."
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>
      </div>

      {/* Your styles + small add-ons */}
      <style jsx>{`
        .wb-wrap { padding: 14px 6px; }

        .wb-header {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
          padding: 14px 14px 10px;
          border-radius: 18px;
          border: 1px solid rgba(0,0,0,0.06);
          background: radial-gradient(1200px 180px at 20% 0%, rgba(99,102,241,0.10), transparent 60%),
                      radial-gradient(1000px 180px at 90% 0%, rgba(16,185,129,0.10), transparent 55%),
                      rgba(255,255,255,0.7);
          backdrop-filter: blur(8px);
        }

        .wb-title h2 { margin: 0; font-size: 22px; letter-spacing: -0.02em; color: #0f172a; }
        .wb-title-row { display: flex; align-items: center; gap: 10px; }
        .wb-sub { margin: 6px 0 0; color: #64748b; font-size: 13px; }

        .wb-error {
          margin-top: 10px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(239,68,68,0.20);
          background: rgba(239,68,68,0.06);
          color: #991b1b;
          font-weight: 800;
          font-size: 13px;
        }

        .wb-status {
          font-size: 12px;
          font-weight: 700;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(0,0,0,0.08);
          background: rgba(255,255,255,0.7);
        }
        .wb-status.ok { color: #065f46; border-color: rgba(16,185,129,0.25); background: rgba(16,185,129,0.10); }
        .wb-status.warn { color: #92400e; border-color: rgba(245,158,11,0.35); background: rgba(245,158,11,0.12); }

        .wb-actions { display: grid; gap: 10px; }
        .wb-date { display: grid; gap: 6px; width: fit-content; }
        .wb-btnrow { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }

        .wb-meta { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 4px; }
        .wb-meta-pill {
          display: inline-flex; gap: 8px; align-items: center;
          padding: 7px 10px; border-radius: 999px;
          border: 1px solid rgba(0,0,0,0.06);
          background: rgba(255,255,255,0.7);
          color: #0f172a; font-size: 12px; font-weight: 700;
        }
        .wb-meta-text { color: #64748b; font-size: 12px; }

        .wb-grid {
          margin-top: 14px;
          display: grid;
          grid-template-columns: 1fr 1.25fr;
          gap: 14px;
          align-items: start;
        }

        .wb-card {
          border-radius: 18px;
          border: 1px solid rgba(0,0,0,0.06);
          background: rgba(255,255,255,0.82);
          backdrop-filter: blur(8px);
          box-shadow: 0 10px 30px rgba(2, 6, 23, 0.06);
          padding: 14px;
        }

        .wb-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
        .wb-card h3 { margin: 0; font-size: 16px; letter-spacing: -0.01em; color: #0f172a; }
        .wb-hint { margin: 6px 0 0; font-size: 12px; color: #64748b; }

        .wb-label { font-size: 12px; font-weight: 700; color: #475569; }

        .wb-input {
          width: 100%;
          min-width: 240px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(0,0,0,0.08);
          background: rgba(255,255,255,0.9);
          outline: none;
          color: #0f172a;
        }
        .wb-input:focus { border-color: rgba(99,102,241,0.45); box-shadow: 0 0 0 4px rgba(99,102,241,0.12); }

        .wb-textarea {
          width: 100%;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(0,0,0,0.08);
          background: rgba(255,255,255,0.9);
          outline: none;
          resize: vertical;
          color: #0f172a;
        }
        .wb-textarea:focus { border-color: rgba(99,102,241,0.45); box-shadow: 0 0 0 4px rgba(99,102,241,0.12); }

        .wb-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 12px; border-radius: 12px;
          border: 1px solid rgba(0,0,0,0.08);
          background: rgba(255,255,255,0.85);
          cursor: pointer;
          font-weight: 800; font-size: 13px; color: #0f172a;
          transition: transform 0.04s ease, background 0.12s ease, box-shadow 0.12s ease;
          user-select: none;
        }
        .wb-btn:hover { background: rgba(255,255,255,0.95); box-shadow: 0 10px 25px rgba(2, 6, 23, 0.08); }
        .wb-btn:active { transform: translateY(1px); }
        .wb-btn:disabled { opacity: 0.55; cursor: not-allowed; box-shadow: none; }

        .wb-btn.sm { padding: 8px 10px; font-size: 12px; border-radius: 10px; }
        .wb-btn.ghost.active { border-color: rgba(99,102,241,0.35); box-shadow: 0 0 0 4px rgba(99,102,241,0.10); }
        .wb-btn.primary { border-color: rgba(99,102,241,0.35); background: rgba(99,102,241,0.14); }
        .wb-btn.success { border-color: rgba(16,185,129,0.35); background: rgba(16,185,129,0.14); }

        .wb-progress { margin-top: 8px; display: grid; gap: 6px; }
        .wb-progress-track {
          height: 8px; width: 240px; max-width: 100%;
          border-radius: 999px; background: rgba(2, 6, 23, 0.07);
          overflow: hidden;
        }
        .wb-progress-bar { height: 100%; border-radius: 999px; background: rgba(16,185,129,0.65); }
        .wb-progress-text { font-size: 12px; color: #64748b; font-weight: 700; }

        .wb-todo-add {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          align-items: center;
          margin-bottom: 12px;
        }

        .wb-todo-list { display: flex; flex-direction: column; gap: 10px; }

        .wb-todo-item {
          display: grid;
          grid-template-columns: 42px 1fr 42px;
          gap: 10px;
          align-items: center;
          padding: 10px;
          border-radius: 14px;
          border: 1px solid rgba(0,0,0,0.06);
          background: rgba(255,255,255,0.85);
        }
        .wb-todo-item.done { border-color: rgba(16,185,129,0.20); background: rgba(16,185,129,0.08); }

        .wb-icon {
          display: inline-flex; align-items: center; justify-content: center;
          width: 38px; height: 38px;
          border-radius: 12px;
          border: 1px solid rgba(0,0,0,0.06);
          background: rgba(255,255,255,0.9);
          cursor: pointer;
        }
        .wb-icon:hover { box-shadow: 0 10px 20px rgba(2, 6, 23, 0.08); }
        .wb-icon.danger { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.18); }

        .wb-todo-input {
          width: 100%;
          border: 0;
          outline: none;
          background: transparent;
          padding: 6px 4px;
          color: #0f172a;
          font-weight: 700;
        }

        .wb-hours { display: flex; flex-direction: column; gap: 12px; }
        .wb-hour-row {
          display: grid;
          grid-template-columns: 120px 1fr;
          gap: 12px;
          align-items: stretch;
          padding: 10px;
          border-radius: 16px;
          border: 1px solid rgba(0,0,0,0.06);
          background: rgba(255,255,255,0.85);
        }

        .wb-hour-left {
          position: sticky;
          top: 12px;
          align-self: start;
          display: grid;
          gap: 6px;
          padding: 8px;
          border-radius: 14px;
          background: rgba(15,23,42,0.03);
          border: 1px solid rgba(0,0,0,0.05);
        }
        .wb-hour-chip { font-weight: 900; color: #0f172a; font-size: 13px; }
        .wb-hour-sub { font-size: 12px; color: #64748b; font-weight: 700; }
        .wb-hour-right { display: grid; gap: 8px; }
        .wb-hour-title { font-size: 12px; font-weight: 900; color: #334155; }

        .wb-notes { margin-top: 14px; display: grid; gap: 8px; }

        .wb-empty {
          color: #64748b;
          font-size: 13px;
          font-weight: 700;
          padding: 10px;
          border-radius: 14px;
          background: rgba(15,23,42,0.03);
          border: 1px dashed rgba(0,0,0,0.10);
        }

        .subcard {
          border-radius: 16px;
          border: 1px solid rgba(0,0,0,0.06);
          background: rgba(255,255,255,0.78);
          padding: 12px;
        }

        .session-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .session-title {
          font-weight: 900;
          color: #0f172a;
          font-size: 13px;
        }

        .session-sub {
          margin-top: 4px;
          font-size: 12px;
          color: #64748b;
          font-weight: 700;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(0,0,0,0.08);
          background: rgba(255,255,255,0.7);
          font-weight: 900;
          font-size: 12px;
        }
        .badge-green {
          color: #065f46;
          border-color: rgba(16,185,129,0.25);
          background: rgba(16,185,129,0.10);
        }

        @media (max-width: 980px) {
          .wb-grid { grid-template-columns: 1fr; }
          .wb-input { min-width: 0; }
          .wb-hour-row { grid-template-columns: 1fr; }
          .wb-hour-left { position: static; }
          .wb-progress-track { width: 100%; }
        }
      `}</style>
    </section>
  );
}
