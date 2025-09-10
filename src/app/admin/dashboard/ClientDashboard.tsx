'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import './dashboard.css';

/* ===================== Auth headers helper ===================== */
function buildAuthHeaders(): Record<string, string> {
  try {
    if (typeof window === 'undefined') return {};
    const raw = localStorage.getItem('employee');
    if (!raw) return {};
    const id = JSON.parse(raw)?.id;
    return id ? { 'x-user-id': String(id) } : {};
  } catch {
    return {};
  }
}

/* ===================== Types ===================== */
interface Employee {
  _id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  position: string;
  isPaused?: boolean;
}
type ProgressRow = {
  taskId: string;
  taskTitle: string;
  assignedTo: string;
  employeeName: string;
  message: string;
  timestamp: string; // ISO
};

type ProgressUpdate = {
  _id: string;
  employeeName: string;
  taskTitle: string;
  message: string;
  timestamp: string;
};

type HolidayRequest = {
  _id: string;
  employeeName: string;
  date: string;
  message: string;
};

type NewTaskForm = {
  title: string;
  description: string;
  assignedTo: string;
  priority: 'low' | 'medium' | 'high';
  dueDate: string;   // yyyy-mm-dd
  dueTime: string;   // HH:mm
  status?: Task['status']; // keep existing status even if you don't edit it
};

type LunchOverview = {
  success: true;
  employeeId: string;
  employeeName?: string;
  range: { from: string; to: string };
  schedule?: LunchTime;
  scheduleWindow?: { start?: string; end?: string };
  logs: Array<{ _id?: string; type: 'lunch-start'|'lunch-end'; timestamp: string; imageData?: string }>;
  pairs: Array<{
    date: string;
    start: { timestamp: string; imageData?: string } | null;
    end: { timestamp: string; imageData?: string } | null;
    durationMs: number;
    durationHMS: string;
  }>;
  byDay: Array<{
    date: string;
    totalMs: number;
    totalHMS: string;
    items: Array<{ start: string | null; end: string | null; durationMs: number; durationHMS: string }>;
  }>;
  today: {
    inProgress: boolean;
    startedAt: string | null;
    endedAt: string | null;
    durationMs: number;
    durationHMS: string;
    withinSchedule?: boolean;
  };
  totals: { totalMs: number; totalHMS: string; days: number; avgPerDayMs: number; avgPerDayHMS: string };
};


interface Department {
  _id: string;
  name: string;
  description?: string;
}

interface Role {
  _id: string;
  name: string;
  department: string;
  permissions: {
    canCheckIn: boolean;
    canManageEmployees: boolean;
    canManageDepartments: boolean;
    canManageRoles: boolean;
    canAssignTasks: boolean;
    canViewAllTasks: boolean;
    canViewTasks: boolean;
    canViewReports: boolean;
  };
}

interface Task {
  _id: string;
  title: string;
  description: string;
  assignedBy: string;
  assignedTo: string;
  role?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled';
  dueDate: string;
  createdAt: string;
  progressUpdates: { message: string; timestamp: string }[];
}

interface AttendanceRecord {
  _id: string;
  employeeId: string;
  employeeName: string;
  type: 'checkin' | 'checkout';
  timestamp: string;
  imageData?: string;
  createdAt: string;
}

interface LunchTime {
  _id: string;
  employeeId: string;
  employeeName: string;
  startTime: string;
  endTime: string;
  days: string[];
}

interface Holiday {
  _id: string;
  date: string;
  description?: string;
}

interface BroadcastMessage {
  _id: string;
  subject: string;
  body: string;
  urgent?: boolean;
  createdAt: string;           // ISO
  createdByName?: string;      // optional
  recipientCount?: number;     // optional
}

/* ===================== Toasts ===================== */
type Toast = { id: number; message: string; type?: 'success' | 'error' };
function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const show = (message: string, type: 'success' | 'error' = 'success') => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  };
  const remove = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));
  return { toasts, show, remove };
}
function Toasts({ toasts, onClose }: { toasts: Toast[]; onClose: (id: number) => void }) {
  return (
    <div className="toast-wrap" aria-live="polite" aria-atomic="true">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type === 'error' ? 'toast-error' : 'toast-success'}`}>
          <span>{t.message}</span>
          <button className="toast-x" onClick={() => onClose(t.id)} aria-label="Close">✕</button>
        </div>
      ))}
    </div>
  );
}



/* ===================== Date helpers (UTC) ===================== */
const dayKeyUTC = (d: Date) =>
  new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().split('T')[0];
const holidayKeyUTC = (iso: string) =>
  new Date(iso).toISOString().split('T')[0];

type RangeKind = 'weekly' | 'monthly' | 'yearly' | 'custom';
function startOfWeekUTC(d: Date) {
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = copy.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = (day + 6) % 7;   // Monday=0
  copy.setUTCDate(copy.getUTCDate() - diff);
  return copy;
}
function endOfWeekUTC(d: Date) {
  const s = startOfWeekUTC(d);
  const e = new Date(s);
  e.setUTCDate(e.getUTCDate() + 6);
  return e;
}
function startOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function endOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}
function startOfYearUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}
function endOfYearUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), 11, 31));
}
function isoDate(d: Date) { return d.toISOString().split('T')[0]; }
function within(tsISO: string, start: Date, end: Date) {
  const t = new Date(tsISO).getTime();
  return t >= start.getTime() && t <= (new Date(end.getTime() + 86399_999)).getTime(); // inclusive day
}
function csvEscape(val: any): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
// ---- image helpers (client-safe) ----
function toDisplayableImageClient(anyImg?: any): string | undefined {
  if (!anyImg) return undefined;

  // already a URL or data URL or raw base64
  if (typeof anyImg === 'string') return anyImg;

  // Mongo Buffer serialized to JSON: { type: 'Buffer', data: number[] }
  if (anyImg?.type === 'Buffer' && Array.isArray(anyImg.data)) {
    const bytes = Uint8Array.from(anyImg.data);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);
    return `data:image/jpeg;base64,${b64}`;
  }

  return undefined;
}

function toImgSrc(s?: string) {
  if (!s) return '';
  if (s.startsWith('data:') || s.startsWith('http') || s.startsWith('/')) return s;
  return `data:image/jpeg;base64,${s}`;
}

// Accepts string OR populated object and returns the string _id, or null.
type MaybeObjId = string | { _id?: string; id?: string; name?: string } | null | undefined;
function asId(v: MaybeObjId): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v._id || v.id || null;
  return null;
}
function asName(lt: any, employees: Employee[]): string {
  // Prefer denormalized employeeName
  if (lt?.employeeName) return lt.employeeName;
  // If employeeId is populated, try its name
  if (lt?.employeeId && typeof lt.employeeId === 'object' && lt.employeeId.name) return lt.employeeId.name;
  // Fallback: look it up
  const id = asId(lt?.employeeId);
  return employees.find(e => e._id === id)?.name || 'Unknown';
}

// --- lunch inspector fmt helpers ---
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });

const fmtTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString() : '—';

const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`;


/* ===================== Holidays Modal ===================== */
function HolidaysModal({
  open,
  onClose,
  onSuccess,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progLoading, setProgLoading] = useState(false);
  const [progError, setProgError] = useState<string | null>(null);
  const [progressList, setProgressList] = useState<ProgressRow[]>([]);
  const [holidayRequests, setHolidayRequests] = useState<HolidayRequest[]>([]);

  // Daily report
  const [reportDate, setReportDate] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportAttendance, setReportAttendance] = useState<AttendanceRecord[]>([]);
  const [reportProgress, setReportProgress] = useState<
    { taskTitle: string; employeeName: string; message: string; timestamp: string }[]
  >([]);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  


  

  const fetchHolidays = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/holidays', { headers: { ...buildAuthHeaders() } });
      if (!res.ok) throw new Error(`Failed to load holidays (${res.status})`);
      const data = await res.json();
      setHolidays(data.holidays || []);
    } catch (e: any) {
      const msg = e?.message || 'Failed to load holidays';
      setError(msg);
      onError(msg);
    } finally {
      setLoading(false);
    }
  };

  const fetchProgressUpdates = async () => {
    try {
      setProgLoading(true);
      setProgError(null);
      const res = await fetch('/api/tasks/progress?limit=50', { headers: { ...buildAuthHeaders() } });
      if (!res.ok) throw new Error('Failed to load progress updates');
      const data = await res.json();
      setProgressList(Array.isArray(data.updates) ? data.updates : []);
    } catch (e: any) {
      const msg = e?.message || 'Failed to load progress updates';
      setProgError(msg);
      onError(msg);
    } finally {
      setProgLoading(false);
    }
  };
  



  const fetchHolidayRequests = async () => {
    try {
      const res = await fetch('/api/holiday-requests', { headers: { ...buildAuthHeaders() } });
      if (!res.ok) return;
      const data = await res.json();
      setHolidayRequests(data.requests || []);
    } catch {
      /* optional */
    }
  };

  useEffect(() => {
    if (open) {
      fetchHolidays();
      fetchProgressUpdates();
      fetchHolidayRequests();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);

  const onBackdropClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const addHoliday = async (date: Date, desc: string) => {
    const iso = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString();
    try {
      setSaving(true);
      setError(null);
      const res = await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
        body: JSON.stringify({ date: iso, description: desc }),
      });
      if (!res.ok) throw new Error('Failed to save holiday');
      setDescription('');
      setSelectedDate(null);
      await fetchHolidays();
      onSuccess('Holiday added');
    } catch (e: any) {
      const msg = e?.message || 'Failed to save';
      setError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  const removeHoliday = async (holidayId: string) => {
    try {
      setSaving(true);
      setError(null);
      const res = await fetch(`/api/holidays/${holidayId}`, {
        method: 'DELETE',
        headers: { ...buildAuthHeaders() },
      });
      if (!res.ok) throw new Error('Failed to remove holiday');
      await fetchHolidays();
      onSuccess('Holiday removed');
    } catch (e: any) {
      const msg = e?.message || 'Failed to remove';
      setError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  const loadDailyReport = async (yyyy_mm_dd: string) => {
    try {
      setReportLoading(true);
      setReportError(null);
      setReportAttendance([]);
      setReportProgress([]);

      const res = await fetch(`/api/reports/daily?date=${yyyy_mm_dd}`, { headers: { ...buildAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load daily report');

      setReportAttendance(Array.isArray(data.attendance) ? data.attendance : []);
      setReportProgress(Array.isArray(data.progress) ? data.progress : []);
    } catch (e: any) {
      setReportError(e?.message || 'Failed to load daily report');
    } finally {
      setReportLoading(false);
    }
  };

  const handleDateClick = (date: Date) => {
    const normalized = dayKeyUTC(date);
    const existing = holidays.find((h) => holidayKeyUTC(h.date) === normalized);
    if (existing) {
      if (confirm('Remove holiday for this date?')) removeHoliday(existing._id);
    } else {
      setSelectedDate(date);
    }
    setReportDate(normalized);
    loadDailyReport(normalized);
  };

  const isMarked = (date: Date) => {
    const normalized = dayKeyUTC(date);
    return holidays.some((h) => holidayKeyUTC(h.date) === normalized);
  };

  if (!open) return null;

  return (
    <div className="hm-backdrop" onClick={onBackdropClick} aria-modal="true" role="dialog">
      <div className="hm-modal" role="document" aria-labelledby="hm-title">
        <div className="hm-header">
          <h3 id="hm-title">Holiday Calendar</h3>
          <button className="hm-btn hm-secondary" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {error && (
          <div className="hm-error">
            <span>{error}</span>
            <button className="hm-btn hm-danger hm-sm" onClick={fetchHolidays}>Retry</button>
          </div>
        )}

        <div className="hm-section">
          <h4 className="hm-section-title">Employee Progress Updates</h4>

          {progLoading ? (
            <small className="hm-muted">Loading…</small>
          ) : progError ? (
            <div className="hm-error">
              <span>{progError}</span>
              <button className="hm-btn hm-danger hm-sm" onClick={fetchProgressUpdates}>Retry</button>
            </div>
          ) : progressList.length === 0 ? (
            <small className="hm-muted">No updates</small>
          ) : (
            <div className="prog-list">
              {progressList.map((p) => (
                <div className="prog-item" key={`${p.taskId}-${p.timestamp}`}>
                  <div className="prog-top">
                    <span className="prog-employee">{p.employeeName}</span>
                    <span className="prog-task">on {p.taskTitle}</span>
                  </div>
                  <p className="prog-msg">{p.message}</p>
                  <div className="prog-time">{new Date(p.timestamp).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}

          <div className="hm-section">
            <h4 className="hm-section-title">Holiday Requests</h4>
            {holidayRequests.length === 0 ? (
              <small className="hm-muted">No holiday requests</small>
            ) : (
              <div className="hr-list">
                {holidayRequests.map((h) => (
                  <div className="hr-item" key={h._id}>
                    <div className="hr-row">
                      <span className="hr-name">{h.employeeName}</span>
                      <span className="hr-date">{new Date(h.date).toLocaleDateString()}</span>
                    </div>
                    <p className="hr-msg">{h.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="hm-grid">
          <div className="hm-cal">
            <Calendar
              onClickDay={handleDateClick}
              tileClassName={({ date }) => (isMarked(date) ? 'hm-mark' : undefined)}
              className="hm-react-calendar"
            />
            <p className="hm-hint">Click a date to add/remove a holiday and view the daily report</p>

            {selectedDate && (
              <div className="hm-subcard">
                <div className="hm-subhead">
                  <strong>Add Holiday</strong>
                  <span className="hm-datechip">{selectedDate.toDateString()}</span>
                </div>
                <textarea
                  className="hm-input hm-textarea"
                  placeholder="Optional description…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <div className="hm-actions">
                  <button
                    className="hm-btn hm-primary"
                    onClick={() => addHoliday(selectedDate, description)}
                    disabled={saving}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    className="hm-btn hm-secondary"
                    onClick={() => {
                      setSelectedDate(null);
                      setDescription('');
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {reportDate && (
              <div className="hm-subcard" style={{ marginTop: 12 }}>
                <div className="hm-subhead">
                  <strong>Daily Report</strong>
                  <span className="hm-datechip">{new Date(reportDate).toDateString()}</span>
                </div>

                {reportLoading ? (
                  <small className="hm-muted">Loading…</small>
                ) : reportError ? (
                  <div className="hm-error">
                    <span>{reportError}</span>
                    <button className="hm-btn hm-danger hm-sm" onClick={() => loadDailyReport(reportDate!)}>Retry</button>
                  </div>
                ) : (
                  <>
                    <div className="hm-section" style={{ marginTop: 8 }}>
                      <h4 className="hm-section-title">Check-ins / Check-outs</h4>
                      {reportAttendance.length === 0 ? (
                        <small className="hm-muted">No attendance records</small>
                      ) : (
                        <div className="table-wrap">
                          <table className="table">
                            <thead>
                              <tr><th>Employee</th><th>Type</th><th>Time</th></tr>
                            </thead>
                            <tbody>
                              {reportAttendance.map((r) => (
                                <tr key={r._id}>
                                  <td>
                                    {r.employeeName ??
                                      (typeof (r as any).employeeId === 'object' && (r as any).employeeId
                                        ? (r as any).employeeId.name
                                        : '')}
                                  </td>
                                  <td>
                                    <span className={`badge ${r.type === 'checkin' ? 'badge-green' : 'badge-red'}`}>
                                      {r.type.toUpperCase()}
                                    </span>
                                  </td>
                                  <td>{new Date(r.timestamp).toLocaleTimeString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <div className="hm-section" style={{ marginTop: 12 }}>
                      <h4 className="hm-section-title">Progress Updates</h4>
                      {reportProgress.length === 0 ? (
                        <small className="hm-muted">No progress updates</small>
                      ) : (
                        <div className="prog-list">
                          {reportProgress.map((p, i) => (
                            <div className="prog-item" key={`${p.taskTitle}-${i}`}>
                              <div className="prog-top">
                                <span className="prog-employee">{p.employeeName}</span>
                                <span className="prog-task">on {p.taskTitle}</span>
                              </div>
                              <p className="prog-msg">{p.message}</p>
                              <div className="prog-time">{new Date(p.timestamp).toLocaleString()}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="hm-list">
            <div className="hm-listhead">
              <h4>All Holidays</h4>
              {loading ? (
                <span className="hm-pill hm-gray">Loading…</span>
              ) : (
                <span className="hm-pill hm-blue">{holidays.length}</span>
              )}
            </div>

            {holidays.length === 0 ? (
              <div className="hm-empty">No holidays yet</div>
            ) : (
              <ul className="hm-ul">
                {holidays
                  .slice()
                  .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                  .map((h) => (
                    <li key={h._id} className="hm-li">
                      <div className="hm-li-main">
                        <strong>{new Date(h.date).toDateString()}</strong>
                        {h.description && <p className="hm-desc">{h.description}</p>}
                      </div>
                      <button
                        className="hm-btn hm-danger hm-sm"
                        onClick={() => removeHoliday(h._id)}
                        disabled={saving}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===================== Main Dashboard ===================== */
export default function AdminDashboard() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [filteredAttendance, setFilteredAttendance] = useState<AttendanceRecord[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lunchTimes, setLunchTimes] = useState<LunchTime[]>([]);

  const [activeTab, setActiveTab] = useState('attendance');
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [showDepartmentForm, setShowDepartmentForm] = useState(false);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showLunchForm, setShowLunchForm] = useState(false);
  const [showHolidays, setShowHolidays] = useState(false);

  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [editingLunchTime, setEditingLunchTime] = useState<LunchTime | null>(null);

  const [newEmployee, setNewEmployee] = useState({
    name: '', email: '', password: '',
    department: 'General', role: 'Employee', position: ''
  });
  const [newDepartment, setNewDepartment] = useState({ name: '', description: '' });
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);

  const [newRole, setNewRole] = useState({
    name: '',
    department: 'General',
    permissions: {
      canCheckIn: true,
      canManageEmployees: false,
      canManageDepartments: false,
      canManageRoles: false,
      canAssignTasks: false,
      canViewAllTasks: false,
      canViewTasks: true,
      canViewReports: false,
    },
  });
const [newTask, setNewTask] = useState<NewTaskForm>({
  title: '', description: '', assignedTo: '',
  priority: 'medium', dueDate: '', dueTime: '17:00',
});
  const [newLunchTime, setNewLunchTime] = useState({
    employeeId: '', startTime: '12:00', endTime: '13:00',
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  });

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [messages, setMessages] = useState<BroadcastMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [newMsg, setNewMsg] = useState({ subject: '', body: '', urgent: false });

  // Messages / progress feed
const [progressFeed, setProgressFeed] = useState<ProgressRow[]>([]);
const [progressLoading, setProgressLoading] = useState(false);
const [progressError, setProgressError] = useState<string | null>(null);
const [progressDate, setProgressDate] = useState<string>(''); // yyyy-mm-dd (optional filter)


  // Export CSV state
  const [exportOpen, setExportOpen] = useState(false);
  const [exportKind, setExportKind] = useState<RangeKind>('monthly');
  const [exportStart, setExportStart] = useState<string>(''); // yyyy-mm-dd
  const [exportEnd, setExportEnd] = useState<string>('');     // yyyy-mm-dd
  const [exporting, setExporting] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  // Attendance sub-view (new)
  type AttendanceView = 'all' | 'checkin' | 'checkout' | 'paired';
  const [attendanceView, setAttendanceView] = useState<AttendanceView>('all');

  const [inspectEmployee, setInspectEmployee] = useState<{ id: string; name: string } | null>(null);
const [lunchOverview, setLunchOverview] = useState<LunchOverview | null>(null);
const [loadingLunch, setLoadingLunch] = useState(false);
const [inspectDate, setInspectDate] = useState<string>(new Date().toISOString().split('T')[0]); // yyyy-mm-dd
const [showLunchImage, setShowLunchImage] = useState<string | null>(null);

const [lunchRangeKind, setLunchRangeKind] = useState<'7d'|'30d'|'custom'>('30d');
const [lunchRangeStart, setLunchRangeStart] = useState<string>(''); // yyyy-mm-dd
const [lunchRangeEnd, setLunchRangeEnd] = useState<string>('');     // yyyy-mm-dd

const [deletingId, setDeletingId] = useState<string | null>(null);



type FeedMode = 'unified' | 'progress' | 'broadcasts';
const [feedMode, setFeedMode] = useState<FeedMode>('unified');

type FeedItem = {
  kind: 'progress' | 'broadcast';
  ts: string;
  title: string;
  who?: string;
  body: string;
  urgent?: boolean;
};

const unifiedFeed = useMemo<FeedItem[]>(() => {
  const a: FeedItem[] = (progressFeed || []).map(p => ({
    kind: 'progress',
    ts: p.timestamp,
    title: p.taskTitle || 'Task update',
    who: p.employeeName || 'Unknown',
    body: p.message,
  }));
  const b: FeedItem[] = (messages || []).map(m => ({
    kind: 'broadcast',
    ts: m.createdAt,
    title: m.subject,
    who: m.createdByName || 'Admin',
    body: m.body,
    urgent: !!m.urgent,
  }));
  return [...a, ...b].sort((x, y) => new Date(y.ts).getTime() - new Date(x.ts).getTime());
}, [progressFeed, messages]);


const authHeaders = (): HeadersInit => {
  try {
    const raw = localStorage.getItem('employee');
    const id = raw ? JSON.parse(raw).id : null;
    return id ? { 'x-user-id': String(id) } : {};
  } catch { return {}; }
};


const startEditDepartment = (dept: Department) => {
  setEditingDepartment(dept);
  setNewDepartment({ name: dept.name, description: dept.description || '' });
  setShowDepartmentForm(true);
};

const cancelDepartmentForm = () => {
  setEditingDepartment(null);
  setNewDepartment({ name: '', description: '' });
  setShowDepartmentForm(false);
};

const handleUpdateDepartment = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!editingDepartment) return;

  try {
    setCreating(true);
    const res = await fetch('/api/departments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
      body: JSON.stringify({
        id: editingDepartment._id,
        name: newDepartment.name,
        description: newDepartment.description,
      }),
    });
    const data = await res.json();
    if (!res.ok || data?.error) throw new Error(data?.error || 'Failed to update department');

    setEditingDepartment(null);
    setNewDepartment({ name: '', description: '' });
    setShowDepartmentForm(false);
    await fetchData();
    show('Department updated');
  } catch (err: any) {
    setError(err.message || 'Failed to update department');
    show(err.message || 'Failed to update department', 'error');
  } finally {
    setCreating(false);
  }
};

const handleDeleteDepartment = async (deptId: string) => {
  if (!confirm('Delete this department?')) return;
  try {
    const res = await fetch(`/api/departments?id=${deptId}`, {
      method: 'DELETE',
      headers: { ...buildAuthHeaders() },
    });
    const data = await res.json();
    if (!res.ok || data?.error) throw new Error(data?.error || 'Failed to delete department');

    await fetchData();
    show('Department deleted');
  } catch (err: any) {
    setError(err.message || 'Failed to delete department');
    show(err.message || 'Failed to delete department', 'error');
  }
};


async function fetchProgressUpdates(date?: string) {
  try {
    setProgressLoading(true);
    setProgressError(null);

    const qs = new URLSearchParams({ limit: '100' });
    if (date) qs.set('date', date);           // backend supports ?date=YYYY-MM-DD
    const res = await fetch(`/api/tasks/progress?${qs}`, { headers: { ...authHeaders() } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load progress updates');

    setProgressFeed(Array.isArray(data.updates) ? data.updates : []);
  } catch (e:any) {
    setProgressError(e.message || 'Failed to load progress updates');
  } finally {
    setProgressLoading(false);
  }
}

useEffect(() => {
  if (activeTab === 'messages') {
    fetchProgressUpdates(progressDate || undefined);
  }
}, [activeTab, progressDate]);


function toISODate(d: Date) { return d.toISOString().split('T')[0]; }



function openInspector(lt: any) {
  const id = asId(lt.employeeId);
  if (!id) { show('This lunch assignment has no employee id', 'error'); return; }
  setInspectEmployee({ id, name: asName(lt, employees) });
  const today = new Date().toISOString().split('T')[0];
setInspectDate(today);
loadLunchForDay(id, today);
}

useEffect(() => {
  if (!inspectEmployee) return;
  loadLunchForDay(inspectEmployee.id, inspectDate);
}, [inspectEmployee?.id, inspectDate]);

// --- Lunch inspector date helpers (UTC day keys, inclusive) ---
function dateKeyUTC(d: Date) {
  // yyyy-mm-dd using UTC (same as your dayKeyUTC helper style)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .split('T')[0];
}



async function loadLunchForDay(empId: string, yyyy_mm_dd: string) {
  try {
    setLoadingLunch(true);
    const qs = new URLSearchParams({
      employeeId: empId,
      from: yyyy_mm_dd,
      to: yyyy_mm_dd,
    }).toString();

    const res = await fetch(`/api/lunch/overview?${qs}`, { headers: { ...buildAuthHeaders() } });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load lunch data');
    setLunchOverview(data);
  } catch (e: any) {
    setLunchOverview(null);
    alert(e?.message || 'Failed to load lunch overview');
  } finally {
    setLoadingLunch(false);
  }
}

// Place this inside AdminDashboard component, below the lunchRange state:
// const [lunchRangeKind, setLunchRangeKind] = useState<'7d'|'30d'|'custom'>('30d');
// const [lunchRangeStart, setLunchRangeStart] = useState<string>('');
// const [lunchRangeEnd, setLunchRangeEnd] = useState<string>('');

function computeLunchRange() {
  // returns:
  //  - from/to as yyyy-mm-dd (UTC day keys)
  //  - fromISO/toISO as inclusive UTC bounds for the API
  const today = new Date();
  const toUTC = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const yyyy_mm_dd = (d: Date) => toUTC(d).toISOString().split('T')[0];

  let start: Date;
  let end: Date;

  if (lunchRangeKind === '7d') {
    end = toUTC(today);
    start = new Date(end);
    start.setUTCDate(end.getUTCDate() - 6); // include today -> 7 days total
  } else if (lunchRangeKind === '30d') {
    end = toUTC(today);
    start = new Date(end);
    start.setUTCDate(end.getUTCDate() - 29); // include today -> 30 days total
  } else {
    // custom
    if (!lunchRangeStart || !lunchRangeEnd) {
      throw new Error('Please pick a start and end date for the custom range.');
    }
    start = new Date(`${lunchRangeStart}T00:00:00.000Z`);
    end = new Date(`${lunchRangeEnd}T00:00:00.000Z`);
    if (end.getTime() < start.getTime()) {
      throw new Error('End date must be on/after the start date.');
    }
  }

  const from = yyyy_mm_dd(start);
  const to = yyyy_mm_dd(end);

  // Inclusive ISO bounds for the server
  const fromISO = new Date(`${from}T00:00:00.000Z`).toISOString();
  const toISO = new Date(`${to}T23:59:59.999Z`).toISOString();

  return { from, to, fromISO, toISO };
}



async function loadLunchOverviewFor(empId: string) {
  try {
    setLoadingLunch(true);
    const { from, to, fromISO, toISO } = computeLunchRange();

    // send both "employeeId" and "id" to be resilient to the API
    const qs = new URLSearchParams({
      employeeId: empId,
      id: empId,
      from,
      to,
      fromISO,
      toISO,
      tzOffset: String(new Date().getTimezoneOffset()), // useful server-side if you use it
    }).toString();

    const res = await fetch(`/api/lunch/overview?${qs}`, { headers: { ...buildAuthHeaders() } });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load lunch data');
    setLunchOverview(data);
  } catch (e: any) {
    show(e?.message || 'Failed to load lunch overview', 'error');
    setLunchOverview(null);
  } finally {
    setLoadingLunch(false);
  }
}

// Auto-refresh when the range or inspected person changes
useEffect(() => {
  if (!inspectEmployee) return;
  loadLunchOverviewFor(inspectEmployee.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [inspectEmployee?.id, lunchRangeKind, lunchRangeStart, lunchRangeEnd]);




  const router = useRouter();
  const { toasts, show, remove } = useToasts();

  useEffect(() => { fetchData(); }, []);

  // Enrich attendance with fallback name (if API didn't populate)
  const enrichedAttendance = useMemo(
    () =>
      attendance.map((r) => ({
        ...r,
        employeeName:
          r.employeeName ||
          employees.find((e) => e._id === r.employeeId)?.name ||
          '',
      })),
    [attendance, employees]
  );

  // --- SEARCH: name, id, and date (supports combined tokens like "john 2025-10-04") ---
  function dateVariants(tsISO: string): string[] {
    const d = new Date(tsISO);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');

    const iso = `${y}-${m}-${dd}`; // 2025-10-04
    const dmy = `${dd}-${m}-${y}`; // 04-10-2025
    const mdy = `${m}-${dd}-${y}`; // 10-04-2025

    // Localized human formats
    const local = d.toLocaleDateString();
    const shortText = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); // Oct 4, 2025
    const longText = d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });   // October 4, 2025

    return [iso, dmy, mdy, local, shortText, longText].map(s => s.toLowerCase());
  }

  useEffect(() => {
    const base = enrichedAttendance;

    if (!searchTerm.trim()) {
      setFilteredAttendance(base);
      return;
    }

    const tokens = searchTerm
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const next = base.filter((r) => {
      const name = (r.employeeName || '').toLowerCase();
      const id = (r.employeeId || '').toLowerCase();
      const dates = dateVariants(r.timestamp);

      // every token must match name OR id OR any date representation
      return tokens.every((t) => {
        if (name.includes(t)) return true;
        if (id.includes(t)) return true;
        return dates.some((ds) => ds.includes(t));
      });
    });

    setFilteredAttendance(next);
  }, [searchTerm, enrichedAttendance]);

  const normalizedLunchTimes = useMemo(() => {
  return lunchTimes.map((lt: any) => ({
    ...lt,
    employeeId: asId(lt.employeeId) ?? String(lt.employeeId ?? ''),
    employeeName: asName(lt, employees),
  }));
}, [lunchTimes, employees]);


  // Derive the current list for the simple views
  const viewAttendance = useMemo(() => {
    if (attendanceView === 'checkin') return filteredAttendance.filter(r => r.type === 'checkin');
    if (attendanceView === 'checkout') return filteredAttendance.filter(r => r.type === 'checkout');
    return filteredAttendance; // 'all'
  }, [filteredAttendance, attendanceView]);

  // Build "paired" rows from the *filtered* attendance
  type PairedRow = {
    key: string;
    employeeId: string;
    employeeName: string;
    date: string; // yyyy-mm-dd
    firstCheckIn?: AttendanceRecord;
    lastCheckOut?: AttendanceRecord;
  };

  const pairedRows = useMemo<PairedRow[]>(() => {
    const map = new Map<string, PairedRow>();
    for (const r of filteredAttendance) {
      const dateKey = new Date(r.timestamp).toISOString().split('T')[0]; // yyyy-mm-dd
      const key = `${r.employeeId}__${dateKey}`;
      const existing =
        map.get(key) ||
        ({
          key,
          employeeId: r.employeeId,
          employeeName: r.employeeName,
          date: dateKey,
        } as PairedRow);

      if (r.type === 'checkin') {
        if (!existing.firstCheckIn || new Date(r.timestamp) < new Date(existing.firstCheckIn.timestamp)) {
          existing.firstCheckIn = r;
        }
      } else {
        if (!existing.lastCheckOut || new Date(r.timestamp) > new Date(existing.lastCheckOut.timestamp)) {
          existing.lastCheckOut = r;
        }
      }
      existing.employeeName = existing.employeeName || r.employeeName;
      map.set(key, existing);
    }
    const rows = Array.from(map.values());
    rows.sort((a, b) => {
      const tA = new Date(a.date).getTime();
      const tB = new Date(b.date).getTime();
      if (tA !== tB) return tB - tA; // latest date first
      return (a.employeeName || '').localeCompare(b.employeeName || '');
    });
    return rows;
  }, [filteredAttendance]);

  const fetchData = async () => {
    setError(null);
    setLoading(true);
    try {
      const headersOnlyAuth = { ...buildAuthHeaders() };

      const results = await Promise.allSettled([
        fetch('/api/admin/employees', { headers: headersOnlyAuth }),
        fetch('/api/departments',     { headers: headersOnlyAuth }),
        fetch('/api/roles',           { headers: headersOnlyAuth }),
        fetch('/api/tasks',           { headers: headersOnlyAuth }),
        fetch('/api/admin/attendance',{ headers: headersOnlyAuth }),
        fetch('/api/lunchtimes',      { headers: headersOnlyAuth }),
      ]);

      const parseResult = async (r: PromiseSettledResult<Response>) => {
        if (r.status === 'fulfilled') {
          const res = r.value;
          if (!res.ok) throw new Error(`API Error: ${res.status}`);
          return res.json();
        }
        return null;
      };

      const [eData, dData, rData, tData, aData, lData] = await Promise.all(results.map(parseResult));

      setEmployees(eData?.employees || []);
      setDepartments(dData?.departments || []);
      setRoles(rData?.roles || []);
      setTasks(tData?.tasks || []);
      setAttendance(aData?.attendance || []);
      setLunchTimes(lData?.lunchTimes || []);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    try {
      setLoadingMessages(true);
      const res = await fetch('/api/messages', { headers: { ...buildAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load messages');
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (e:any) {
      show(e.message || 'Failed to load messages', 'error');
    } finally {
      setLoadingMessages(false);
    }
  };

  const sendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMsg.subject.trim() || !newMsg.body.trim()) {
      show('Subject and message are required', 'error');
      return;
    }
    try {
      setSendingMsg(true);
      const res = await fetch('/api/messages/broadcast', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(newMsg),
  credentials: 'include',
});
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to send');

      show('Message sent to all employees');
      setNewMsg({ subject: '', body: '', urgent: false });
      fetchMessages();
    } catch (e:any) {
      show(e.message || 'Failed to send message', 'error');
    } finally {
      setSendingMsg(false);
    }
  };


  const startEditEmployee = (emp: Employee) => {
  setEditingEmployee(emp);
  setNewEmployee({
    name: emp.name,
    email: emp.email,
    password: '',                 // keep blank; only send if user sets a new one
    department: emp.department,
    role: emp.role,
    position: emp.position,
  });
  setShowEmployeeForm(true);
};

const cancelEmployeeForm = () => {
  setEditingEmployee(null);
  setNewEmployee({
    name: '', email: '', password: '',
    department: 'General', role: 'Employee', position: ''
  });
  setShowEmployeeForm(false);
};

const handleUpdateEmployee = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!editingEmployee) return;

  try {
    setCreating(true); setError(null);

    // only include password if user provided a new one
    const payload: any = {
      id: editingEmployee._id,
      name: newEmployee.name,
      email: newEmployee.email,
      department: newEmployee.department,
      role: newEmployee.role,
      position: newEmployee.position,
    };
    if (newEmployee.password && newEmployee.password.trim().length > 0) {
      payload.password = newEmployee.password;
    }

    const res = await fetch('/api/admin/employees', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update employee');

    setEditingEmployee(null);
    setShowEmployeeForm(false);
    setNewEmployee({ name: '', email: '', password: '', department: 'General', role: 'Employee', position: '' });
    await fetchData();
    show('Employee updated');
  } catch (e: any) { setError(e.message); show(e.message, 'error'); }
  finally { setCreating(false); }
};

const handleDeleteEmployee = async (employeeId: string) => {
  if (!confirm('Delete this employee?')) return;
  try {
    const res = await fetch(`/api/admin/employees?id=${employeeId}`, {
      method: 'DELETE',
      headers: { ...buildAuthHeaders() },
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete employee');

    await fetchData();
    show('Employee deleted');
  } catch (e: any) { setError(e.message); show(e.message, 'error'); }
};

const handleTogglePauseEmployee = async (emp: Employee) => {
  const next = !emp.isPaused;
  try {
    const res = await fetch('/api/admin/employees', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
      body: JSON.stringify({ id: emp._id, isPaused: next }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update pause state');
    await fetchData();
    show(next ? 'Employee paused' : 'Employee resumed');
  } catch (e: any) {
    show(e.message || 'Failed to update pause state', 'error');
  }
};


  /* ======= Small helpers ======= */
  const handleRetry = () => fetchData();
  const handleLogout = () => router.push('/admin');
  const viewImage = (record: AttendanceRecord) => { setSelectedRecord(record); setShowImageModal(true); };

  /* ======= EXPORT CSV (Range) ======= */
  function computeRange(kind: RangeKind, s?: string, e?: string) {
    const today = new Date();
    let start: Date, end: Date;
    if (kind === 'weekly') {
      start = startOfWeekUTC(today);
      end = endOfWeekUTC(today);
    } else if (kind === 'monthly') {
      start = startOfMonthUTC(today);
      end = endOfMonthUTC(today);
    } else if (kind === 'yearly') {
      start = startOfYearUTC(today);
      end = endOfYearUTC(today);
    } else {
      if (!s || !e) throw new Error('Please pick start & end dates');
      start = new Date(`${s}T00:00:00.000Z`);
      end = new Date(`${e}T00:00:00.000Z`);
      if (end.getTime() < start.getTime()) throw new Error('End date must be after start date');
    }
    return { start, end };
  }

  async function fetchProgressForRange(start: Date, end: Date) {
    const results: ProgressRow[] = [];
    const cursor = new Date(start);
    while (cursor.getTime() <= end.getTime()) {
      const d = isoDate(cursor);
      try {
        const res = await fetch(`/api/tasks/progress?date=${d}&limit=500`, { headers: { ...buildAuthHeaders() } });
        if (res.ok) {
          const j = await res.json();
          if (Array.isArray(j.updates)) {
            for (const u of j.updates) results.push(u);
          }
        }
      } catch { /* swallow */ }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return results;
  }

  function buildCSV(
    range: { start: Date; end: Date },
    data: {
      attendance: AttendanceRecord[];
      progress: ProgressRow[];
      tasks: Task[];
      employees: Employee[];
      departments: Department[];
      roles: Role[];
      lunchTimes: LunchTime[];
      messages: BroadcastMessage[];
    }
  ) {
    const lines: string[] = [];
    const { start, end } = range;
    lines.push(`Report Range,${isoDate(start)},${isoDate(end)}`);
    lines.push('');

    // Attendance
    lines.push('Attendance');
    lines.push([
      'Employee Name','Employee ID','Type','Timestamp ISO','Date','Time','Image Available'
    ].map(csvEscape).join(','));
    data.attendance.forEach(r => {
      lines.push([
        r.employeeName,
        r.employeeId,
        r.type.toUpperCase(),
        new Date(r.timestamp).toISOString(),
        new Date(r.timestamp).toLocaleDateString(),
        new Date(r.timestamp).toLocaleTimeString(),
        r.imageData ? 'Yes' : 'No',
      ].map(csvEscape).join(','));
    });
    lines.push('');

    // Progress
    lines.push('Progress Updates');
    lines.push(['Employee Name','Task Title','Message','Timestamp ISO'].map(csvEscape).join(','));
    data.progress.forEach(p => {
      lines.push([
        p.employeeName, p.taskTitle, p.message, new Date(p.timestamp).toISOString()
      ].map(csvEscape).join(','));
    });
    lines.push('');

    // Tasks
    lines.push('Tasks');
    lines.push(['Title','Assigned To (ID)','Priority','Status','Due Date','Created At'].map(csvEscape).join(','));
    data.tasks.forEach(t => {
      lines.push([
        t.title,
        t.assignedTo,
        t.priority,
        t.status,
        new Date(t.dueDate).toISOString(),
        new Date(t.createdAt).toISOString(),
      ].map(csvEscape).join(','));
    });
    lines.push('');

    // Employees
    lines.push('Employees');
    lines.push(['Name','Email','Department','Role','Position','_id'].map(csvEscape).join(','));
    data.employees.forEach(e => {
      lines.push([
        e.name, e.email, e.department, e.role, e.position, e._id
      ].map(csvEscape).join(','));
    });
    lines.push('');

    // Departments
    lines.push('Departments');
    lines.push(['Name','Description','_id'].map(csvEscape).join(','));
    data.departments.forEach(d => {
      lines.push([d.name, d.description ?? '', d._id].map(csvEscape).join(','));
    });
    lines.push('');

    // Roles
    lines.push('Roles');
    lines.push(['Name','Department','Permissions','_id'].map(csvEscape).join(','));
    data.roles.forEach(r => {
      const perms = Object.entries(r.permissions).filter(([_,v]) => v)
        .map(([k]) => k).join('|');
      lines.push([r.name, r.department, perms, r._id].map(csvEscape).join(','));
    });
    lines.push('');

    // Lunch Times
    lines.push('Lunch Times');
    lines.push(['Employee Name','Start Time','End Time','Days','_id'].map(csvEscape).join(','));
    data.lunchTimes.forEach(lt => {
      lines.push([lt.employeeName, lt.startTime, lt.endTime, lt.days.join('|'), lt._id].map(csvEscape).join(','));
    });
    lines.push('');

    // Broadcast Messages
    lines.push('Broadcast Messages');
    lines.push(['Created At','Subject','Urgent','By','Recipients','Body','_id'].map(csvEscape).join(','));
    data.messages.forEach(m => {
      lines.push([
        new Date(m.createdAt).toISOString(),
        m.subject,
        m.urgent ? 'Yes' : 'No',
        m.createdByName ?? 'Admin',
        String(m.recipientCount ?? ''),
        m.body,
        m._id,
      ].map(csvEscape).join(','));
    });

    return lines.join('\n');
  }

  async function handleExportCSV() {
    try {
      setExporting(true);

      const { start, end } = computeRange(
        exportKind,
        exportStart || undefined,
        exportEnd || undefined
      );

      // Filter client-side data by range
      const attInRange = attendance.filter(a => within(a.timestamp, start, end));
      const msgsInRange = messages.filter(m => within(m.createdAt, start, end));

      // Tasks: createdAt OR dueDate within range
      const tasksInRange = tasks.filter(t =>
        within(t.createdAt, start, end) || within(t.dueDate, start, end)
      );

      // Progress: fetch per-day across the range
      const progressInRange = await fetchProgressForRange(start, end);

      const csv = buildCSV(
        { start, end },
        {
          attendance: attInRange,
          progress: progressInRange,
          tasks: tasksInRange,
          employees,
          departments,
          roles,
          lunchTimes,
          messages: msgsInRange,
        }
      );

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const fname = `report_${isoDate(start)}_to_${isoDate(end)}.csv`;
      a.href = url;
      a.download = fname;
      a.click();
      window.URL.revokeObjectURL(url);
      setExportOpen(false);
      show(`Exported ${fname}`);
    } catch (e: any) {
      show(e?.message || 'Failed to export', 'error');
    } finally {
      setExporting(false);
    }
  }

  /* ======= Employees ======= */
  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreating(true); setError(null);
      const res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
        body: JSON.stringify(newEmployee),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create employee');
      setNewEmployee({ name: '', email: '', password: '', department: 'General', role: 'Employee', position: '' });
      setShowEmployeeForm(false);
      await fetchData();
      show('Employee created');
    } catch (e: any) { setError(e.message); show(e.message, 'error'); }
    finally { setCreating(false); }
  };

  /* ======= Departments ======= */
  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreating(true);
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
        body: JSON.stringify(newDepartment),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create department');
      setNewDepartment({ name: '', description: '' });
      setShowDepartmentForm(false);
      await fetchData();
      show('Department created');
    } catch (e: any) { setError(e.message); show(e.message, 'error'); }
    finally { setCreating(false); }
  };

  /* ======= Roles ======= */
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreating(true);
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
        body: JSON.stringify(newRole),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create role');

      setNewRole({
        name: '',
        department: 'General',
        permissions: {
          canCheckIn: true, canManageEmployees: false, canManageDepartments: false,
          canManageRoles: false, canAssignTasks: false, canViewAllTasks: false,
          canViewTasks: true, canViewReports: false,
        },
      });
      setShowRoleForm(false);
      await fetchData();
      show('Role created');
    } catch (e: any) { setError(e.message); show(e.message, 'error'); }
    finally { setCreating(false); }
  };

  const handleEditRole = (role: Role) => {
    setEditingRole(role);
    setNewRole({
      name: role.name,
      department: role.department,
      permissions: { ...role.permissions, canViewTasks: role.permissions.canViewTasks ?? true },
    });
    setShowRoleForm(true);
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRole) return;
    try {
      setCreating(true);
      const res = await fetch('/api/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
        body: JSON.stringify({ id: editingRole._id, ...newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update role');
      setEditingRole(null);
      setNewRole({
        name: '',
        department: 'General',
        permissions: {
          canCheckIn: true, canManageEmployees: false, canManageDepartments: false,
          canManageRoles: false, canAssignTasks: false, canViewAllTasks: false,
          canViewTasks: true, canViewReports: false,
        },
      });
      setShowRoleForm(false);
      await fetchData();
      show('Role updated');
    } catch (e: any) { setError(e.message); show(e.message, 'error'); }
    finally { setCreating(false); }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!confirm('Delete this role?')) return;
    try {
      const res = await fetch(`/api/roles?id=${roleId}`, { method: 'DELETE', headers: { ...buildAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete role');
      await fetchData();
      show('Role deleted');
    } catch (e: any) { setError(e.message); show(e.message, 'error'); }
  };

  /* ======= Lunch Times ======= */
  const handleCreateLunchTime = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreating(true);
      const res = await fetch('/api/lunchtimes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
        body: JSON.stringify(newLunchTime),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create lunch time');
      setNewLunchTime({ employeeId: '', startTime: '12:00', endTime: '13:00', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] });
      setShowLunchForm(false);
      await fetchData();
      show('Lunch time assigned');
    } catch (e: any) { setError(e.message); show(e.message, 'error'); }
    finally { setCreating(false); }
  };

  const handleUpdateLunchTime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLunchTime) return;
    try {
      setCreating(true);
      const res = await fetch('/api/lunchtimes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
        body: JSON.stringify({ id: editingLunchTime._id, ...newLunchTime }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update lunch time');
      setEditingLunchTime(null);
      setNewLunchTime({ employeeId: '', startTime: '12:00', endTime: '13:00', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] });
      setShowLunchForm(false);
      await fetchData();
      show('Lunch time updated');
    } catch (e: any) { setError(e.message); show(e.message, 'error'); }
    finally { setCreating(false); }
  };

  const handleDeleteLunchTime = async (id: string) => {
    if (!confirm('Delete this lunch time?')) return;
    try {
      const res = await fetch(`/api/lunchtimes?id=${id}`, { method: 'DELETE', headers: { ...buildAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete lunch time');
      await fetchData();
      show('Lunch time deleted');
    } catch (e: any) { setError(e.message); show(e.message, 'error'); }
  };

  const handleEditLunchTime = (lt: LunchTime) => {
    setEditingLunchTime(lt);
    setNewLunchTime({ employeeId: lt.employeeId, startTime: lt.startTime, endTime: lt.endTime, days: [...lt.days] });
    setShowLunchForm(true);
  };

  /* ======= Tasks ======= */
const startEditingTask = (t: Task) => {
  setEditingTask(t._id);
  const { time } = splitISOToLocalDateTime(t.dueDate);
  setNewTask({
    title: t.title,
    description: t.description,
    assignedTo: t.assignedTo,
    priority: t.priority,
    dueDate: t.dueDate.split('T')[0],
    dueTime: time,
    status: t.status, // ← preserve it
  });
  setShowTaskForm(true);
};
  const cancelTaskForm = () => {
    setEditingTask(null);
    setNewTask({ title: '', description: '', assignedTo: '', priority: 'medium', dueDate: '', dueTime: '17:00' });
    setShowTaskForm(false);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreating(true);
          const dueISO = toDueISO(newTask.dueDate, newTask.dueTime);
    const payload = {
      ...newTask,
      dueDate: dueISO,     // <— combined value
    };
      const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
      body: JSON.stringify(payload),
    });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create task');
      setNewTask({ title: '', description: '', assignedTo: '', priority: 'medium', dueDate: '', dueTime: '17:00' });
      setShowTaskForm(false);
      await fetchData();
      show('Task created');
    } catch (e: any) { setError(e.message); show(e.message, 'error'); }
    finally { setCreating(false); }
  };

 const handleUpdateTask = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!editingTask) return;

  try {
    setCreating(true);
    const dueISO = toDueISO(newTask.dueDate, newTask.dueTime);

    const payload: any = {
      id: editingTask,                // ← crucial: send id in body
      title: newTask.title,
      description: newTask.description,
      assignedTo: newTask.assignedTo,
      priority: newTask.priority,
      dueDate: dueISO,
    };
    if (newTask.status) payload.status = newTask.status; // keep status as-is

    const res = await fetch('/api/tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update task');

    setEditingTask(null);
    setNewTask({ title: '', description: '', assignedTo: '', priority: 'medium', dueDate: '', dueTime: '17:00' });
    setShowTaskForm(false);
    await fetchData();
    show('Task updated');
  } catch (e: any) {
    setError(e.message); show(e.message, 'error');
  } finally {
    setCreating(false);
  }
};

const handleDeleteBroadcast = async (id: string) => {
  if (!confirm('Delete this broadcast?')) return;
  try {
    setDeletingId(id);
    const res = await fetch(`/api/messages/${id}`, {
      method: 'DELETE',
      headers: { ...buildAuthHeaders() },
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete');
    // instant UI update
    setMessages(prev => prev.filter(m => m._id !== id));
    show('Message deleted');
  } catch (e: any) {
    show(e?.message || 'Failed to delete', 'error');
  } finally {
    setDeletingId(null);
  }
};

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Delete this task?')) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE', headers: { ...buildAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete task');
      await fetchData();
      show('Task deleted');
    } catch (e: any) { setError(e.message); show(e.message, 'error'); }
  };

  /* ======= Attendance (simple export) ======= */
  const exportToCSV = () => {
    const csvContent = [
      ['Employee Name', 'Employee ID', 'Type', 'Date', 'Time', 'Image Available'],
      ...filteredAttendance.map((record) => [
        record.employeeName,
        record.employeeId,
        record.type,
        new Date(record.timestamp).toLocaleDateString(),
        new Date(record.timestamp).toLocaleTimeString(),
        record.imageData ? 'Yes' : 'No',
      ]),
    ]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'attendance-records.csv';
    link.click();
    window.URL.revokeObjectURL(url);
    show('Attendance exported');
  };

/* ===================== Task date helpers ===================== */
function toDueISO(dateYYYYMMDD: string, timeHHMM?: string) {
  if (!dateYYYYMMDD) return '';
  const time = /^\d{2}:\d{2}$/.test(timeHHMM || '') ? timeHHMM : '17:00'; // default 5pm local
  const dt = new Date(`${dateYYYYMMDD}T${time}:00`);
  return dt.toISOString();
}

function splitISOToLocalDateTime(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` };
}

  if (loading) return <div className="loading"><h2>Loading...</h2></div>;

  return (
    <div className="dashboard">
      <header className="header">
        <h1>Admin Dashboard</h1>
        <div className="header-actions">
          <button onClick={fetchData} className="btn info">Refresh</button>

          <button onClick={() => setExportOpen(true)} className="btn primary small">⬇ Export CSV (Range)</button>

          <button onClick={() => setShowHolidays(true)} className="btn success small">📅 Holidays</button>
          <button onClick={handleLogout} className="btn danger logout-fixed">
            Logout
          </button>
        </div>
      </header>

      <nav className="tabs">
        {['attendance', 'employees', 'departments', 'roles', 'tasks', 'lunchTime', 'messages'].map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              if (tab === 'messages') fetchMessages();
            }}
            className={`tab ${activeTab === tab ? 'active' : ''}`}
          >
            {tab}
          </button>
        ))}
      </nav>

      <main className="content">
        {error && (
          <div className="error-box">
            <span>{error}</span>
            <button onClick={handleRetry} className="btn danger small">Retry</button>
          </div>
        )}

        {/* Attendance */}
        {activeTab === 'attendance' && (
          <section className="card">
            <div className="card-header">
              <h2>Attendance Records ({attendanceView === 'paired' ? pairedRows.length : viewAttendance.length})</h2>
              <button onClick={exportToCSV} className="btn success">Export to CSV</button>
            </div>

            {/* Sub-tabs for attendance view */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {(['all', 'checkin', 'checkout', 'paired'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setAttendanceView(v)}
                  className={`btn ${attendanceView === v ? 'primary' : 'secondary'} small`}
                >
                  {v === 'all' ? 'All' : v === 'checkin' ? 'Check-ins' : v === 'checkout' ? 'Check-outs' : 'Paired (cols)'}
                </button>
              ))}
            </div>

            <div className="field">
              <input
                type="text"
                placeholder="Search by employee name, ID, or date (e.g., 2025-10-04, Oct 4, 2025)…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input"
              />
            </div>

            {/* Standard list views */}
            {attendanceView !== 'paired' ? (
              (viewAttendance.length === 0 ? (
                <div className="empty">{searchTerm ? 'No matching records found' : 'No attendance records found'}</div>
              ) : (
                <div className="table-wrap trello-table">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Employee ID</th>
                        <th>Type</th>
                        <th>Date & Time</th>
                        <th>Image</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewAttendance.map((record) => (
                        <tr key={record._id}>
                          <td>{record.employeeName}</td>
                          <td>{record.employeeId}</td>
                          <td>
                            <span className={`badge ${record.type === 'checkin' ? 'badge-green' : 'badge-red'}`}>
                              {record.type.toUpperCase()}
                            </span>
                          </td>
                          <td>{new Date(record.timestamp).toLocaleString()}</td>
                          <td>
                            {record.imageData ? (
                              <button onClick={() => viewImage(record)} className="btn primary small">View Image</button>
                            ) : (
                              <span className="muted">No image</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            ) : (
              // Paired (columns) view
              (pairedRows.length === 0 ? (
                <div className="empty">{searchTerm ? 'No matching records found' : 'No attendance records found'}</div>
              ) : (
                <div className="table-wrap trello-table">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Employee ID</th>
                        <th>Date</th>
                        <th>First Check-in</th>
                        <th>Last Check-out</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pairedRows.map((row) => (
                        <tr key={row.key}>
                          <td>{row.employeeName}</td>
                          <td>{row.employeeId}</td>
                          <td>{new Date(row.date).toLocaleDateString()}</td>
                          <td>{row.firstCheckIn ? new Date(row.firstCheckIn.timestamp).toLocaleTimeString() : '—'}</td>
                          <td>{row.lastCheckOut ? new Date(row.lastCheckOut.timestamp).toLocaleTimeString() : '—'}</td>
                          <td>
                            {row.firstCheckIn?.imageData && (
                              <button onClick={() => viewImage(row.firstCheckIn!)} className="btn small">View In</button>
                            )}{' '}
                            {row.lastCheckOut?.imageData && (
                              <button onClick={() => viewImage(row.lastCheckOut!)} className="btn small">View Out</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </section>
        )}

        {/* Messages */}
        {activeTab === 'messages' && (
  <section className="card">
    <div className="card-header" style={{ alignItems: 'center', gap: 8 }}>
      <h2 style={{ margin: 0 }}>Messages & Progress</h2>

      {/* Mode toggle */}
      <div className="actions" style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        <button
          className={`btn ${feedMode === 'unified' ? 'primary' : 'secondary'} small`}
          onClick={() => setFeedMode('unified')}
        >
          Unified
        </button>
        <button
          className={`btn ${feedMode === 'progress' ? 'primary' : 'secondary'} small`}
          onClick={() => setFeedMode('progress')}
        >
          Progress
        </button>
        <button
          className={`btn ${feedMode === 'broadcasts' ? 'primary' : 'secondary'} small`}
          onClick={() => setFeedMode('broadcasts')}
        >
          Broadcasts
        </button>
      </div>
    </div>

    {/* Controls for Progress filter (only shown when Unified or Progress) */}
    {(feedMode === 'unified' || feedMode === 'progress') && (
      <div className="subcard" style={{ marginBottom: 12 }}>
        <div className="card-header" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>Progress Updates</h3>
          <div className="actions" style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <input
              className="input"
              type="date"
              value={progressDate}
              onChange={(e) => setProgressDate(e.target.value)}
              aria-label="Filter by date"
            />
            <button
              className="btn secondary"
              onClick={() => fetchProgressUpdates(progressDate || undefined)}
              disabled={progressLoading}
            >
              {progressLoading ? 'Loading…' : 'Reload'}
            </button>
            <button
              className="btn secondary"
              onClick={() => { setProgressDate(''); fetchProgressUpdates(); }}
              disabled={progressLoading}
            >
              Clear
            </button>
          </div>
        </div>

        {progressError && (
          <div className="error-box">
            <span>{progressError}</span>
            <button
              onClick={() => fetchProgressUpdates(progressDate || undefined)}
              className="btn danger small"
            >
              Retry
            </button>
          </div>
        )}

        {feedMode === 'progress' && (
          <>
            {progressLoading ? (
              <p className="muted">Loading…</p>
            ) : (progressFeed.length === 0 ? (
              <p className="empty">
                No progress updates{progressDate ? ` on ${new Date(progressDate).toDateString()}` : ''}.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Time</th><th>Employee</th><th>Task</th><th>Update</th></tr>
                  </thead>
                  <tbody>
                    {progressFeed.map((p) => (
                      <tr key={`${p.taskId}-${p.timestamp}`}>
                        <td>{new Date(p.timestamp).toLocaleString()}</td>
                        <td>{p.employeeName || 'Unknown'}</td>
                        <td>{p.taskTitle || 'Untitled task'}</td>
                        <td>{p.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </>
        )}
      </div>
    )}

    {/* Broadcast composer + history (hidden if Progress-only mode) */}
    {feedMode !== 'progress' && (
      <>
        <div className="subcard">
          <h3>Send a message to all employees</h3>
          <form onSubmit={sendBroadcast} className="form grid">
            <div className="field">
              <label>Subject</label>
              <input
                className="input"
                type="text"
                maxLength={120}
                value={newMsg.subject}
                onChange={(e) => setNewMsg({ ...newMsg, subject: e.target.value })}
                placeholder="Company update, urgent notice, etc."
                required
                disabled={sendingMsg}
              />
            </div>
            <div className="field">
              <label>Message</label>
              <textarea
                className="input textarea"
                rows={5}
                value={newMsg.body}
                onChange={(e) => setNewMsg({ ...newMsg, body: e.target.value })}
                placeholder="Write your announcement…"
                required
                disabled={sendingMsg}
              />
              <small className="muted">Tip: Keep it short.</small>
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={newMsg.urgent}
                onChange={(e) => setNewMsg({ ...newMsg, urgent: e.target.checked })}
                disabled={sendingMsg}
              />
              <span>Mark as urgent</span>
            </label>
            <div className="actions">
              <button type="submit" className={`btn ${sendingMsg ? 'secondary' : 'primary'}`} disabled={sendingMsg}>
                {sendingMsg ? 'Sending…' : 'Send to All Employees'}
              </button>
            </div>
          </form>
        </div>

        <div className="card-header">
          <h3>Previous Broadcasts</h3>
          {loadingMessages ? <span className="hm-pill hm-gray">Loading…</span> :
            <span className="hm-pill hm-blue">{messages.length}</span>}
        </div>

        {messages.length === 0 ? (
          <p className="empty">No messages yet</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Sent</th>
                  <th>Subject</th>
                  <th>Urgent</th>
                  <th>Recipients</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
  {messages.map((m) => (
    <tr key={m._id}>
      <td>{new Date(m.createdAt).toLocaleString()}</td>
      <td>
        <details>
          <summary><strong>{m.subject}</strong></summary>
          <div className="msg-body">{m.body}</div>
        </details>
      </td>
      <td>{m.urgent ? <span className="badge badge-red">URGENT</span> : <span className="badge badge-gray">Normal</span>}</td>
      <td>{m.recipientCount ?? employees.length}</td>
      <td>{m.createdByName || 'Admin'}</td>
      <td className="table-actions">
        <button
          onClick={() => handleDeleteBroadcast(m._id)}
          className="btn danger small"
          disabled={deletingId === m._id}
        >
          {deletingId === m._id ? 'Deleting…' : 'Delete'}
        </button>
      </td>
    </tr>
  ))}
</tbody>

            </table>
          </div>
        )}
      </>
    )}

    {/* Unified timeline (only when feedMode === 'unified') */}
    {feedMode === 'unified' && (
      <div className="subcard" style={{ marginTop: 16 }}>
        <h3>Unified Feed</h3>
        {progressLoading && loadingMessages ? (
          <p className="muted">Loading…</p>
        ) : unifiedFeed.length === 0 ? (
          <p className="empty">Nothing to show yet.</p>
        ) : (
          <div className="hm-feed">
            {unifiedFeed.map((item, idx) => (
              <div key={`${item.kind}-${idx}-${item.ts}`} className="hm-feed-item">
                <div className="hm-feed-line">
                  <strong>{item.who}</strong>
                  <span className="hm-feed-dot">•</span>
                  <em>{item.title}</em>
                  <span className="hm-feed-dot">•</span>
                  {item.kind === 'broadcast'
                    ? (item.urgent ? <span className="badge badge-red">URGENT</span> : <span className="badge badge-gray">Broadcast</span>)
                    : <span className="badge badge-blue">Progress</span>
                  }
                </div>
                <div className="hm-feed-msg">{item.body}</div>
                <small className="hm-feed-time">{new Date(item.ts).toLocaleString()}</small>
              </div>
            ))}
          </div>
        )}
      </div>
    )}
  </section>
)}


        {/* Employees */}
        {activeTab === 'employees' && (
          <section className="card">
            <div className="card-header">
              <h2>Employee Management</h2>
              <button
                onClick={() => setShowEmployeeForm(!showEmployeeForm)}
                className={`btn ${showEmployeeForm ? 'secondary' : 'success'}`}
              >
                {showEmployeeForm ? 'Cancel' : 'Add New Employee'}
              </button>
            </div>

            {showEmployeeForm && (
  <div className="subcard">
    <h3>{editingEmployee ? 'Edit Employee' : 'Create New Employee'}</h3>
    <form onSubmit={editingEmployee ? handleUpdateEmployee : handleCreateEmployee} className="form grid">
      <div className="field">
        <label>Name</label>
        <input
          className="input"
          type="text"
          value={newEmployee.name}
          onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
          required
          disabled={creating}
        />
      </div>
      <div className="field">
        <label>Email</label>
        <input
          className="input"
          type="email"
          value={newEmployee.email}
          onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
          required
          disabled={creating}
        />
      </div>
      <div className="field">
        <label>{editingEmployee ? 'New Password (optional)' : 'Password'}</label>
        <input
          className="input"
          type="password"
          value={newEmployee.password}
          onChange={(e) => setNewEmployee({ ...newEmployee, password: e.target.value })}
          required={!editingEmployee}
          disabled={creating}
          placeholder={editingEmployee ? 'Leave blank to keep current password' : ''}
        />
      </div>
      <div className="field">
        <label>Department</label>
        <select
          className="input"
          value={newEmployee.department}
          onChange={(e) => setNewEmployee({ ...newEmployee, department: e.target.value })}
          disabled={creating}
        >
          {departments.map((d) => (
            <option key={d._id} value={d.name}>{d.name}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Role</label>
        <select
          className="input"
          value={newEmployee.role}
          onChange={(e) => setNewEmployee({ ...newEmployee, role: e.target.value })}
          disabled={creating}
        >
          {roles.map((r) => (
            <option key={r._id} value={r.name}>{r.name}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Position</label>
        <input
          className="input"
          type="text"
          value={newEmployee.position}
          onChange={(e) => setNewEmployee({ ...newEmployee, position: e.target.value })}
          required
          disabled={creating}
        />
      </div>
      <div className="actions">
        <button type="submit" disabled={creating} className={`btn ${creating ? 'secondary' : 'primary'}`}>
          {creating ? (editingEmployee ? 'Updating…' : 'Creating…') : (editingEmployee ? 'Update Employee' : 'Create Employee')}
        </button>
        <button
          type="button"
          onClick={editingEmployee ? cancelEmployeeForm : () => setShowEmployeeForm(false)}
          className="btn secondary"
          disabled={creating}
        >
          Cancel
        </button>
      </div>
    </form>
  </div>
)}


            <h3>Employees ({employees.length})</h3>
            {employees.length === 0 ? (
              <p className="empty">No employees found</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                 <thead>
  <tr>
    <th>Name</th>
    <th>Email</th>
    <th>Department</th>
    <th>Role</th>
    <th>Position</th>
    <th>Status</th>     {/* NEW */}
    <th>Actions</th>
  </tr>
</thead>
<tbody>
  {employees.map((e) => (
    <tr key={e._id}>
      <td>{e.name}</td>
      <td>{e.email}</td>
      <td>{e.department}</td>
      <td>{e.role}</td>
      <td>{e.position}</td>
<td>
  {e.isPaused
    ? <span className="badge badge-amber">Paused</span>
    : <span className="badge badge-green">Active</span>}
</td>
      <td className="table-actions">
        <button onClick={() => startEditEmployee(e)} className="btn info small">Edit</button>
        <button onClick={() => handleTogglePauseEmployee(e)} className="btn secondary small">
          {e.isPaused ? 'Resume' : 'Pause'}
        </button>
        <button onClick={() => handleDeleteEmployee(e._id)} className="btn danger small">Delete</button>
      </td>
    </tr>
  ))}
</tbody>


                </table>
              </div>
            )}
          </section>
        )}

        {/* Departments */}
        {activeTab === 'departments' && (
          <section className="card">
            <div className="card-header">
              <h2>Department Management</h2>
              <button
                onClick={() => setShowDepartmentForm(!showDepartmentForm)}
                className={`btn ${showDepartmentForm ? 'secondary' : 'success'}`}
              >
                {showDepartmentForm ? 'Cancel' : 'Add Department'}
              </button>
            </div>

            {showDepartmentForm && (
  <div className="subcard">
    <h3>{editingDepartment ? 'Edit Department' : 'Create New Department'}</h3>
    <form
      onSubmit={editingDepartment ? handleUpdateDepartment : handleCreateDepartment}
      className="form grid"
    >
      <div className="field">
        <label>Name</label>
        <input
          className="input"
          type="text"
          value={newDepartment.name}
          onChange={(e) => setNewDepartment({ ...newDepartment, name: e.target.value })}
          required
          disabled={creating}
        />
      </div>
      <div className="field">
        <label>Description</label>
        <textarea
          className="input textarea"
          value={newDepartment.description}
          onChange={(e) => setNewDepartment({ ...newDepartment, description: e.target.value })}
          disabled={creating}
        />
      </div>
      <div className="actions">
        <button
          type="submit"
          disabled={creating}
          className={`btn ${creating ? 'secondary' : 'primary'}`}
        >
          {creating
            ? (editingDepartment ? 'Updating…' : 'Creating…')
            : (editingDepartment ? 'Update Department' : 'Create Department')}
        </button>
        <button
          type="button"
          onClick={cancelDepartmentForm}
          className="btn secondary"
          disabled={creating}
        >
          Cancel
        </button>
      </div>
    </form>
  </div>
)}


           <h3>Departments ({departments.length})</h3>
{departments.length === 0 ? (
  <p className="empty">No departments found</p>
) : (
  <div className="table-wrap">
    <table className="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Description</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {departments.map((d) => (
          <tr key={d._id}>
            <td>{d.name}</td>
            <td>{d.description || 'No description'}</td>
            <td className="table-actions">
              <button onClick={() => startEditDepartment(d)} className="btn info small">Edit</button>
              <button onClick={() => handleDeleteDepartment(d._id)} className="btn danger small">Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}

          </section>
        )}

        {/* Roles */}
        {activeTab === 'roles' && (
          <section className="card">
            <div className="card-header">
              <h2>Role Management</h2>
              <button
                onClick={() => {
                  setEditingRole(null);
                  setNewRole({
                    name: '',
                    department: 'General',
                    permissions: {
                      canCheckIn: true, canManageEmployees: false, canManageDepartments: false,
                      canManageRoles: false, canAssignTasks: false, canViewAllTasks: false,
                      canViewTasks: true, canViewReports: false,
                    },
                  });
                  setShowRoleForm(!showRoleForm);
                }}
                className={`btn ${showRoleForm ? 'secondary' : 'success'}`}
              >
                {showRoleForm ? 'Cancel' : 'Add Role'}
              </button>
            </div>

            {showRoleForm && (
              <div className="subcard">
                <h3>{editingRole ? 'Edit Role' : 'Create New Role'}</h3>
                <form onSubmit={editingRole ? handleUpdateRole : handleCreateRole} className="form grid">
                  <div className="field">
                    <label>Name</label>
                    <input
                      className="input"
                      type="text"
                      value={newRole.name}
                      onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                      required
                      disabled={creating}
                    />
                  </div>
                  <div className="field">
                    <label>Department</label>
                    <select
                      className="input"
                      value={newRole.department}
                      onChange={(e) => setNewRole({ ...newRole, department: e.target.value })}
                      disabled={creating}
                    >
                      {departments.map((d) => <option key={d._id} value={d.name}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Permissions</label>
                    <div className="checkbox-grid">
                      {Object.entries(newRole.permissions).map(([permission, value]) => (
                        <label key={permission} className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={value}
                            onChange={(e) =>
                              setNewRole({
                                ...newRole,
                                permissions: { ...newRole.permissions, [permission]: e.target.checked },
                              })
                            }
                            disabled={creating}
                          />
                          <span>
                            {permission.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="actions">
                    <button type="submit" disabled={creating} className={`btn ${creating ? 'secondary' : 'primary'}`}>
                      {creating ? (editingRole ? 'Updating…' : 'Creating…') : (editingRole ? 'Update Role' : 'Create Role')}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <h3>Roles ({roles.length})</h3>
            {roles.length === 0 ? (
              <p className="empty">No roles found</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Name</th><th>Department</th><th>Permissions</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {roles.map((r) => (
                      <tr key={r._id}>
                        <td>{r.name}</td>
                        <td>{r.department}</td>
                        <td>
                          {Object.entries(r.permissions).filter(([_, v]) => v)
                            .map(([p]) => p.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()))
                            .join(', ')}
                        </td>
                        <td className="table-actions">
                          <button onClick={() => handleEditRole(r)} className="btn info small">Edit</button>
                          <button onClick={() => handleDeleteRole(r._id)} className="btn danger small">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Tasks */}
        {activeTab === 'tasks' && (
          <section className="card">
            <div className="card-header">
              <h2>Task Management</h2>
              <button onClick={() => setShowTaskForm(true)} className="btn success">Add New Task</button>
            </div>

           {showTaskForm && (
  <div className="subcard">
    <div className="card-header" style={{ marginBottom: 8 }}>
      <h3 style={{ margin: 0 }}>{editingTask ? 'Edit Task' : 'Create New Task'}</h3>
      <div className="actions">
        <button type="button" onClick={cancelTaskForm} className="btn secondary">Close</button>
      </div>
    </div>

    <form onSubmit={editingTask ? handleUpdateTask : handleCreateTask} className="form grid-2">
      {/* Title */}
      <div className="field">
        <label>Title</label>
        <input
          className="input"
          type="text"
          value={newTask.title}
          onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
          required
          disabled={creating}
          placeholder="Short task title"
        />
      </div>

      {/* Assign To */}
      <div className="field">
        <label>Assign To</label>
        <select
          className="input"
          value={newTask.assignedTo}
          onChange={(e) => setNewTask({ ...newTask, assignedTo: e.target.value })}
          required
          disabled={creating}
        >
          <option value="">Select Employee</option>
          {employees.map((emp) => (
            <option key={emp._id} value={emp._id}>
              {emp.name} ({emp.position})
            </option>
          ))}
        </select>
      </div>

      {/* Priority */}
      <div className="field">
        <label>Priority</label>
        <select
          className="input"
          value={newTask.priority}
          onChange={(e) =>
            setNewTask({ ...newTask, priority: e.target.value as 'low' | 'medium' | 'high' })
          }
          disabled={creating}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>

      {/* Due Date */}
      <div className="field">
        <label>Due Date</label>
        <input
          className="input"
          type="date"
          min={new Date().toISOString().split('T')[0]}
          value={newTask.dueDate}
          onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
          required
          disabled={creating}
        />
      </div>

      <div className="field">
  <label>Due Time</label>
  <input
    className="input"
    type="time"
    value={newTask.dueTime}
    onChange={(e) => setNewTask({ ...newTask, dueTime: e.target.value })}
    disabled={creating}
    required
  />
</div>

      {/* Description (full width) */}
      <div className="field span-2">
        <label>Description</label>
        <textarea
          className="input textarea"
          value={newTask.description}
          onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
          required
          disabled={creating}
          placeholder="What needs to be done? Add details, links, acceptance criteria…"
        />
      </div>

      {/* Actions (full width) */}
      <div className="actions span-2" style={{ justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={cancelTaskForm}
          className="btn secondary"
          disabled={creating}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={creating}
          className={`btn ${creating ? 'secondary' : 'primary'}`}
        >
          {creating ? (editingTask ? 'Updating…' : 'Creating…') : (editingTask ? 'Update Task' : 'Create Task')}
        </button>
      </div>
    </form>
  </div>
)}


            <h3>Tasks ({tasks.length})</h3>
            {tasks.length === 0 ? (
              <p className="empty">No tasks found</p>
            ) : (
              <div className="table-wrap trello-table">
                <table className="table">
                  <thead>
                    <tr><th>Title</th><th>Assigned To</th><th>Priority</th><th>Status</th><th>Due Date</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {tasks.map((t) => {
                      const emp = employees.find((e) => e._id === t.assignedTo);
                      return (
                        <tr key={t._id}>
                          <td>{t.title}</td>
                          <td>{emp ? `${emp.name} (${emp.position})` : 'Unknown'}</td>
                          <td>
                            <span className={`badge ${
                              t.priority === 'high' ? 'badge-red' : t.priority === 'medium' ? 'badge-amber' : 'badge-green'
                            }`}>{t.priority}</span>
                          </td>
                          <td>
                            <span className={`badge ${
                              t.status === 'completed' ? 'badge-green'
                                : t.status === 'in-progress' ? 'badge-cyan'
                                : 'badge-gray'
                            }`}>{t.status}</span>
                          </td>
                                                  <td>{new Date(t.dueDate).toLocaleString()}</td>
                          <td className="table-actions">
                            <button onClick={() => startEditingTask(t)} className="btn info small">Edit</button>
                            <button onClick={() => handleDeleteTask(t._id)} className="btn danger small">Delete</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Lunch Times */}
        {activeTab === 'lunchTime' && (
          <section className="card">
            <div className="card-header">
              <h2>Lunch Time Management</h2>
              <button
                onClick={() => {
                  setEditingLunchTime(null);
                  setNewLunchTime({
                    employeeId: '',
                    startTime: '12:00',
                    endTime: '13:00',
                    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
                  });
                  setShowLunchForm(!showLunchForm);
                }}
                className={`btn ${showLunchForm ? 'secondary' : 'success'}`}
              >
                {showLunchForm ? 'Cancel' : 'Add Lunch Time'}
              </button>
            </div>

            {showLunchForm && (
              <div className="subcard">
                <h3>{editingLunchTime ? 'Edit Lunch Time' : 'Assign Lunch Time'}</h3>
                <form onSubmit={editingLunchTime ? handleUpdateLunchTime : handleCreateLunchTime} className="form grid">
                  <div className="field">
                    <label>Employee</label>
                    <select
                      className="input"
                      value={newLunchTime.employeeId}
                      onChange={(e) => setNewLunchTime({ ...newLunchTime, employeeId: e.target.value })}
                      required
                      disabled={creating}
                    >
                      <option value="">Select Employee</option>
                      {employees.map((emp) => (
                        <option key={emp._id} value={emp._id}>
                          {emp.name} ({emp.position})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid-2">
                    <div className="field">
                      <label>Start Time</label>
                      <input
                        className="input"
                        type="time"
                        value={newLunchTime.startTime}
                        onChange={(e) => setNewLunchTime({ ...newLunchTime, startTime: e.target.value })}
                        required
                        disabled={creating}
                      />
                    </div>
                    <div className="field">
                      <label>End Time</label>
                      <input
                        className="input"
                        type="time"
                        value={newLunchTime.endTime}
                        onChange={(e) => setNewLunchTime({ ...newLunchTime, endTime: e.target.value })}
                        required
                        disabled={creating}
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label>Days</label>
                    <div className="checkbox-grid">
                      {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((day) => (
                        <label key={day} className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={newLunchTime.days.includes(day)}
                            onChange={(e) => {
                              const updated = e.target.checked
                                ? [...newLunchTime.days, day]
                                : newLunchTime.days.filter((d) => d !== day);
                              setNewLunchTime({ ...newLunchTime, days: updated });
                            }}
                            disabled={creating}
                          />
                          <span>{day}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="actions">
                    <button type="submit" disabled={creating} className={`btn ${creating ? 'secondary' : 'primary'}`}>
                      {creating ? (editingLunchTime ? 'Updating…' : 'Creating…') : (editingLunchTime ? 'Update Lunch Time' : 'Create Lunch Time')}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <h3>Assigned Lunch Times ({lunchTimes.length})</h3>
            {lunchTimes.length === 0 ? (
              <p className="empty">No lunch times assigned</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Employee</th><th>Start Time</th><th>End Time</th><th>Days</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                   {normalizedLunchTimes.map((lt) => (
  <tr key={lt._id}>
    <td>{lt.employeeName}</td>
    <td>{lt.startTime}</td>
    <td>{lt.endTime}</td>
    <td>{lt.days.join(', ')}</td>
    <td className="table-actions">
      <button onClick={() => handleEditLunchTime(lt)} className="btn info small">Edit</button>
      <button onClick={() => handleDeleteLunchTime(lt._id)} className="btn danger small">Delete</button>
      <button onClick={() => openInspector(lt)} className="btn primary small">Inspect</button>
    </td>
  </tr>
))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
{inspectEmployee && (
  <div className="modal-backdrop">
    <div className="modal" style={{ maxWidth: 720 }}>
      <div className="card-header" style={{ marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Lunch Inspector — {inspectEmployee.name}</h3>
          <small className="muted">Pick a date to see start/end and photos.</small>
        </div>
        <div className="actions" style={{ gap: 8 }}>
          <input
            className="input"
            type="date"
            value={inspectDate}
            onChange={(e) => setInspectDate(e.target.value)}
            aria-label="Date"
          />
          <button className="btn secondary" onClick={() => setInspectEmployee(null)}>Close</button>
        </div>
      </div>

      {loadingLunch ? (
        <p className="muted">Loading…</p>
      ) : (() => {
          const pair = lunchOverview?.pairs?.find(p => p.date === inspectDate);
          if (!pair) return <p className="muted">No lunch data for {new Date(inspectDate).toDateString()}.</p>;

          return (
            <div className="card" style={{ display:'grid', gap:16 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                {/* Start */}
                <div className="subcard">
                  <h4 style={{ marginTop: 0 }}>Start</h4>
                  <div style={{ marginBottom: 8 }}>
                    <strong>Time:</strong> {pair.start ? new Date(pair.start.timestamp).toLocaleTimeString() : '—'}
                  </div>
                  {pair.start?.imageData ? (
                    <img
                      src={toImgSrc(pair.start.imageData)}
                      alt="Lunch start"
                      style={{ width:'100%', borderRadius:12, maxHeight:360, objectFit:'contain', background:'#f7f7f9' }}
                      onClick={() => setShowLunchImage(pair.start!.imageData!)}
                    />
                  ) : <span className="muted">No image</span>}
                </div>

                {/* End */}
                <div className="subcard">
                  <h4 style={{ marginTop: 0 }}>End</h4>
                  <div style={{ marginBottom: 8 }}>
                    <strong>Time:</strong> {pair.end ? new Date(pair.end.timestamp).toLocaleTimeString() : '—'}
                  </div>
                  {pair.end?.imageData ? (
                    <img
                      src={toImgSrc(pair.end.imageData)}
                      alt="Lunch end"
                      style={{ width:'100%', borderRadius:12, maxHeight:360, objectFit:'contain', background:'#f7f7f9' }}
                      onClick={() => setShowLunchImage(pair.end!.imageData!)}
                    />
                  ) : <span className="muted">No image</span>}
                </div>
              </div>
            </div>
          );
        })()
      }
    </div>
  </div>
)}




{/* Lunch image viewer (separate from attendance image modal) */}
{showLunchImage && (
  <div className="modal-backdrop">
    <div className="modal modal-image">
      <img src={toImgSrc(showLunchImage)} alt="Lunch capture" />
      <div className="actions"><button onClick={() => setShowLunchImage(null)} className="btn secondary">Close</button></div>
    </div>
  </div>
)}

      {/* Attendance Image Modal */}
      {showImageModal && selectedRecord && (
        <div className="modal-backdrop">
          <div className="modal modal-image">
            <h3>{selectedRecord.employeeName} - {selectedRecord.type.toUpperCase()}</h3>
            <p className="muted">{new Date(selectedRecord.timestamp).toLocaleString()}</p>
            <img src={selectedRecord.imageData} alt={`${selectedRecord.employeeName} ${selectedRecord.type}`} />
            <div className="actions">
              <button onClick={() => setShowImageModal(false)} className="btn secondary">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Holidays Popup */}
      <HolidaysModal
        open={showHolidays}
        onClose={() => setShowHolidays(false)}
        onSuccess={(m) => show(m)}
        onError={(m) => show(m, 'error')}
      />

      {/* Export Modal */}
      {exportOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Export CSV</h3>
            <div className="form grid">
              <div className="field">
                <label>Range</label>
                <select
                  className="input"
                  value={exportKind}
                  onChange={(e) => setExportKind(e.target.value as RangeKind)}
                >
                  <option value="weekly">This Week</option>
                  <option value="monthly">This Month</option>
                  <option value="yearly">This Year</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              {exportKind === 'custom' && (
                <>
                  <div className="field">
                    <label>Start date</label>
                    <input
                      className="input"
                      type="date"
                      value={exportStart}
                      onChange={(e) => setExportStart(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>End date</label>
                    <input
                      className="input"
                      type="date"
                      value={exportEnd}
                      onChange={(e) => setExportEnd(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="actions">
              <button className="btn secondary" onClick={() => setExportOpen(false)} disabled={exporting}>
                Cancel
              </button>
              <button className={`btn ${exporting ? 'secondary' : 'primary'}`} onClick={handleExportCSV} disabled={exporting}>
                {exporting ? 'Preparing…' : 'Download CSV'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast container */}
      <Toasts toasts={toasts} onClose={remove} />
    </div>
  );
}
