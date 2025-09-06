'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import '../dashboard.css';

/* ========= Types ========= */
interface Employee {
  _id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  position: string;
}
type ProgressRow = {
  taskId: string;
  taskTitle: string;
  assignedTo: string;
  employeeName: string;
  message: string;
  timestamp: string; // ISO
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

/* ========= Toasts (success popups) ========= */
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

/* ========= Holidays Modal ========= */
function HolidaysModal({
  open,
  onClose,
  onSuccess,
  onError,
  taskId,                 // optional future use
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  taskId?: string;
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
  // add below existing progress state
const [recentList, setRecentList] = useState<ProgressRow[]>([]);
const [lastQueryInfo, setLastQueryInfo] = useState<string>('');

// ---- ADD: helper to read logged-in user id from localStorage
const getUserId = () => {
  try {
    const raw = localStorage.getItem('employee');
    if (!raw) return null;
    const emp = JSON.parse(raw);
    return emp?.id || null;
  } catch {
    return null;
  }
};

const authHeaders = (): HeadersInit => {
  const h = new Headers();
  const uid = getUserId();
  if (uid) h.set('x-user-id', String(uid));
  return h;
};


  const fetchHolidays = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/holidays');
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

  // Fetch recent progress (fallback if no date clicked yet)
// Fetch recent progress (fallback if no date clicked yet)
const fetchRecentProgress = async () => {
  try {
    setProgLoading(true);
    setProgError(null);
// Usage (don’t spread):
const res = await fetch('/api/tasks/progress?limit=50', {
  headers: authHeaders(),
});
    if (!res.ok) throw new Error('Failed to load recent progress updates');
    const data = await res.json();

    console.log('Recent progress API:', data);
    setLastQueryInfo(
      `Recent (${Array.isArray(data.updates) ? data.updates.length : 0})`
    );

    const rows = Array.isArray(data.updates) ? data.updates : [];
    setProgressList(rows);
    setRecentList(rows);
  } catch (e: any) {
    const msg = e?.message || 'Failed to load progress updates';
    setProgError(msg);
    onError(msg);
  } finally {
    setProgLoading(false);
  }
};



// Fetch progress for a specific YYYY-MM-DD
const fetchProgressForDate = async (isoDay: string) => {
  try {
    setProgLoading(true);
    setProgError(null);
    const res = await fetch(
      `/api/tasks/progress?date=${encodeURIComponent(isoDay)}&limit=200`,
      { headers: { ...authHeaders() } }
    );
    if (!res.ok) throw new Error('Failed to load progress updates for day');
    const data = await res.json();

    console.log('Date progress API:', isoDay, data);
    setLastQueryInfo(
      `${isoDay} (${Array.isArray(data.updates) ? data.updates.length : 0})`
    );

    setProgressList(Array.isArray(data.updates) ? data.updates : []);
  } catch (e: any) {
    const msg = e?.message || 'Failed to load progress updates';
    setProgError(msg);
    onError(msg);
  } finally {
    setProgLoading(false);
  }
};


  useEffect(() => {
    if (open) {
      fetchHolidays();
      fetchRecentProgress();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);

  const onBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const addHoliday = async (date: Date, desc: string) => {
    // Save as UTC midnight
    const isoDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString();
    try {
      setSaving(true);
      setError(null);
      const res = await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: isoDate, description: desc }),
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
      const res = await fetch(`/api/holidays/${holidayId}`, { method: 'DELETE' });
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

  const handleDateClick = (date: Date) => {
  const normalized = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  )
    .toISOString()
    .split('T')[0];

  setSelectedDate(date);
  setProgressList([]);          // <- clear to show proper loading state
  setProgError(null);
  setLastQueryInfo('');         // optional: will be set after fetch
  fetchProgressForDate(normalized);

  const existing = holidays.find((h) => h.date.startsWith(normalized));
  if (existing) {
    if (confirm('Remove holiday for this date?')) removeHoliday(existing._id);
  }
};
  const isMarked = (date: Date) => {
    const normalized = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
      .toISOString()
      .split('T')[0];
    return holidays.some((h) => h.date.startsWith(normalized));
  };

  if (!open) return null;

  return (
    <div className="hm-backdrop" onClick={onBackdropClick} aria-modal="true" role="dialog">
      <div className="hm-modal" role="document" aria-labelledby="hm-title">
        <div className="hm-header">
          {lastQueryInfo && (
  <small className="muted" style={{ margin: '0 12px 8px' }}>
    Progress query: {lastQueryInfo}
  </small>
)}

          <h3 id="hm-title">Holiday Calendar</h3>
          <button className="hm-btn hm-secondary" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {error && (
          <div className="hm-error">
            <span>{error}</span>
            <button className="hm-btn hm-danger hm-sm" onClick={fetchHolidays}>Retry</button>
          </div>
        )}

        {/* Progress feed for selected day */}
        {selectedDate && (
          <div className="hm-subcard" style={{ marginBottom: 12 }}>
            <div className="hm-subhead">
              <strong>Progress on {selectedDate.toDateString()}</strong>
            </div>

            {progLoading ? (
              <small className="muted">Loading…</small>
            ) : progError ? (
              <div className="hm-error">
                <span>{progError}</span>
                <button
                  className="hm-btn hm-danger hm-sm"
                  onClick={() => {
                    const normalized = new Date(Date.UTC(
                      selectedDate.getFullYear(),
                      selectedDate.getMonth(),
                      selectedDate.getDate()
                    )).toISOString().split('T')[0];
                    fetchProgressForDate(normalized);
                  }}
                >
                  Retry
                </button>
              </div>
            ) : progressList.length === 0 ? (
              <small className="muted">No progress updates on this date</small>
            ) : (
              <div className="hm-feed">
                {progressList.map((p) => (
                  <div key={`${p.taskId}-${p.timestamp}`} className="hm-feed-item">
                    <div className="hm-feed-line">
                      <strong>{p.employeeName || 'Unknown'}</strong>
                      <span className="hm-feed-dot">•</span>
                      <em>{p.taskTitle || 'Untitled task'}</em>
                    </div>
                    <div className="hm-feed-msg">{p.message}</div>
                    <small className="hm-feed-time">{new Date(p.timestamp).toLocaleString()}</small>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
{/* Recent progress when no date is selected */}
{!selectedDate && (
  <div className="hm-subcard" style={{ marginBottom: 12 }}>
    <div className="hm-subhead">
      <strong>Recent progress</strong>
    </div>

    {progLoading ? (
      <small className="muted">Loading…</small>
    ) : progError ? (
      <div className="hm-error">
        <span>{progError}</span>
        <button className="hm-btn hm-danger hm-sm" onClick={fetchRecentProgress}>Retry</button>
      </div>
    ) : recentList.length === 0 ? (
      <small className="muted">No recent progress</small>
    ) : (
      <div className="hm-feed">
        {recentList.map((p) => (
          <div key={`${p.taskId}-${p.timestamp}`} className="hm-feed-item">
            <div className="hm-feed-line">
              <strong>{p.employeeName || 'Unknown'}</strong>
              <span className="hm-feed-dot">•</span>
              <em>{p.taskTitle || 'Untitled task'}</em>
            </div>
            <div className="hm-feed-msg">{p.message}</div>
            <small className="hm-feed-time">{new Date(p.timestamp).toLocaleString()}</small>
          </div>
        ))}
      </div>
    )}
  </div>
)}

        <div className="hm-grid">
          <div className="hm-cal">
            <Calendar
              onClickDay={handleDateClick}
              tileClassName={({ date }) => (isMarked(date) ? 'hm-mark' : undefined)}
              className="hm-react-calendar"
            />
            <p className="hm-hint">Click a date to see progress and add/remove a holiday</p>

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
                    onClick={() => { setSelectedDate(null); setDescription(''); }}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="hm-list">
            <div className="hm-listhead">
              <h4>All Holidays</h4>
              {loading ? <span className="hm-pill hm-gray">Loading…</span> : <span className="hm-pill hm-blue">{holidays.length}</span>}
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

/* ========= Main Dashboard ========= */
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
  const [newTask, setNewTask] = useState({
    title: '', description: '', assignedTo: '', priority: 'medium', dueDate: ''
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

  const router = useRouter();
  const { toasts, show, remove } = useToasts();

  useEffect(() => { fetchData(); }, []);
  useEffect(() => {
    if (searchTerm) {
      setFilteredAttendance(attendance.filter((r) =>
        r.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.employeeId.toLowerCase().includes(searchTerm.toLowerCase())
      ));
    } else {
      setFilteredAttendance(attendance);
    }
  }, [searchTerm, attendance]);

  const fetchData = async () => {
    setError(null);
    setLoading(true);
    try {
      const employee = localStorage.getItem('employee');
      if (!employee) throw new Error('User not logged in');

      const userId = JSON.parse(employee).id;
      if (!userId) throw new Error('Invalid user data');

      const results = await Promise.allSettled([
        fetch('/api/admin/employees', { headers: { 'x-user-id': userId } }),
        fetch('/api/departments', { headers: { 'x-user-id': userId } }),
        fetch('/api/roles', { headers: { 'x-user-id': userId } }),
        fetch('/api/tasks', { headers: { 'x-user-id': userId } }),
        fetch('/api/admin/attendance', { headers: { 'x-user-id': userId } }),
        fetch('/api/lunchtimes', { headers: { 'x-user-id': userId } }),
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

  /* ======= Helpers ======= */
  const handleRetry = () => fetchData();
  const handleLogout = () => router.push('/admin');
  const viewImage = (record: AttendanceRecord) => { setSelectedRecord(record); setShowImageModal(true); };

  /* ======= Employees ======= */
  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreating(true); setError(null);
      const res = await fetch('/api/admin/employees', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch(`/api/roles?id=${roleId}`, { method: 'DELETE' });
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch(`/api/lunchtimes?id=${id}`, { method: 'DELETE' });
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
    setNewTask({ title: t.title, description: t.description, assignedTo: t.assignedTo, priority: t.priority, dueDate: t.dueDate.split('T')[0] });
    setShowTaskForm(true);
  };
  const cancelTaskForm = () => {
    setEditingTask(null);
    setNewTask({ title: '', description: '', assignedTo: '', priority: 'medium', dueDate: '' });
    setShowTaskForm(false);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreating(true);
      const employee = localStorage.getItem('employee');
      if (!employee) throw new Error('User not logged in');
      const userId = JSON.parse(employee).id;
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ ...newTask, assignedBy: userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create task');
      setNewTask({ title: '', description: '', assignedTo: '', priority: 'medium', dueDate: '' });
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
      const employee = localStorage.getItem('employee');
      if (!employee) throw new Error('User not logged in');
      const userId = JSON.parse(employee).id;
      const res = await fetch(`/api/tasks/${editingTask}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify(newTask),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update task');
      setEditingTask(null);
      setNewTask({ title: '', description: '', assignedTo: '', priority: 'medium', dueDate: '' });
      setShowTaskForm(false);
      await fetchData();
      show('Task updated');
    } catch (e: any) { setError(e.message); show(e.message, 'error'); }
    finally { setCreating(false); }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Delete this task?')) return;
    try {
      const employee = localStorage.getItem('employee');
      if (!employee) throw new Error('User not logged in');
      const userId = JSON.parse(employee).id;
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE', headers: { 'x-user-id': userId } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete task');
      await fetchData();
      show('Task deleted');
    } catch (e: any) { setError(e.message); show(e.message, 'error'); }
  };

  /* ======= Attendance ======= */
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
      .map((row) => row.join(','))
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

  if (loading) return <div className="loading"><h2>Loading...</h2></div>;

  return (
    <div className="dashboard">
      <header className="header">
        <h1>Admin Dashboard</h1>
        <div className="header-actions">
          <button onClick={fetchData} className="btn info">Refresh</button>
          <button onClick={() => setShowHolidays(true)} className="btn success small">📅 Holidays</button>
          <button onClick={handleLogout} className="btn danger">Logout</button>
        </div>
      </header>

      <nav className="tabs">
        {['attendance', 'employees', 'departments', 'roles', 'tasks', 'lunchTime'].map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`tab ${activeTab === tab ? 'active' : ''}`}>
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
              <h2>Attendance Records ({filteredAttendance.length})</h2>
              <button onClick={exportToCSV} className="btn success">Export to CSV</button>
            </div>

            <div className="field">
              <input
                type="text"
                placeholder="Search by employee name or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input"
              />
            </div>

            {filteredAttendance.length === 0 ? (
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
                    {filteredAttendance.map((record) => (
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
            )}
          </section>
        )}

        {/* Employees */}
        {activeTab === 'employees' && (
          <section className="card">
            <div className="card-header">
              <h2>Employee Management</h2>
              <button onClick={() => setShowEmployeeForm(!showEmployeeForm)} className={`btn ${showEmployeeForm ? 'secondary' : 'success'}`}>
                {showEmployeeForm ? 'Cancel' : 'Add New Employee'}
              </button>
            </div>

            {showEmployeeForm && (
              <div className="subcard">
                <h3>Create New Employee</h3>
                <form onSubmit={handleCreateEmployee} className="form grid">
                  <div className="field">
                    <label>Name</label>
                    <input className="input" type="text" value={newEmployee.name} onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })} required disabled={creating} />
                  </div>
                  <div className="field">
                    <label>Email</label>
                    <input className="input" type="email" value={newEmployee.email} onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })} required disabled={creating} />
                  </div>
                  <div className="field">
                    <label>Password</label>
                    <input className="input" type="password" value={newEmployee.password} onChange={(e) => setNewEmployee({ ...newEmployee, password: e.target.value })} required disabled={creating} />
                  </div>
                  <div className="field">
                    <label>Department</label>
                    <select className="input" value={newEmployee.department} onChange={(e) => setNewEmployee({ ...newEmployee, department: e.target.value })} disabled={creating}>
                      {departments.map((d) => <option key={d._id} value={d.name}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Role</label>
                    <select className="input" value={newEmployee.role} onChange={(e) => setNewEmployee({ ...newEmployee, role: e.target.value })} disabled={creating}>
                      {roles.map((r) => <option key={r._id} value={r.name}>{r.name}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Position</label>
                    <input className="input" type="text" value={newEmployee.position} onChange={(e) => setNewEmployee({ ...newEmployee, position: e.target.value })} required disabled={creating} />
                  </div>
                  <div className="actions">
                    <button type="submit" disabled={creating} className={`btn ${creating ? 'secondary' : 'primary'}`}>{creating ? 'Creating…' : 'Create Employee'}</button>
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
              <button onClick={() => setShowDepartmentForm(!showDepartmentForm)} className={`btn ${showDepartmentForm ? 'secondary' : 'success'}`}>
                {showDepartmentForm ? 'Cancel' : 'Add Department'}
              </button>
            </div>

            {showDepartmentForm && (
              <div className="subcard">
                <h3>Create New Department</h3>
                <form onSubmit={handleCreateDepartment} className="form grid">
                  <div className="field">
                    <label>Name</label>
                    <input className="input" type="text" value={newDepartment.name} onChange={(e) => setNewDepartment({ ...newDepartment, name: e.target.value })} required disabled={creating} />
                  </div>
                  <div className="field">
                    <label>Description</label>
                    <textarea className="input textarea" value={newDepartment.description} onChange={(e) => setNewDepartment({ ...newDepartment, description: e.target.value })} disabled={creating} />
                  </div>
                  <div className="actions">
                    <button type="submit" disabled={creating} className={`btn ${creating ? 'secondary' : 'primary'}`}>{creating ? 'Creating…' : 'Create Department'}</button>
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
                    <tr><th>Name</th><th>Description</th></tr>
                  </thead>
                  <tbody>
                    {departments.map((d) => (
                      <tr key={d._id}>
                        <td>{d.name}</td>
                        <td>{d.description || 'No description'}</td>
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
                    <input className="input" type="text" value={newRole.name} onChange={(e) => setNewRole({ ...newRole, name: e.target.value })} required disabled={creating} />
                  </div>
                  <div className="field">
                    <label>Department</label>
                    <select className="input" value={newRole.department} onChange={(e) => setNewRole({ ...newRole, department: e.target.value })} disabled={creating}>
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
                            onChange={(e) => setNewRole({ ...newRole, permissions: { ...newRole.permissions, [permission]: e.target.checked } })}
                            disabled={creating}
                          />
                          <span>{permission.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}</span>
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
                            .map(([p]) => p.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())).join(', ')}
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
              <div className="modal-backdrop">
                <div className="modal">
                  <h3>{editingTask ? 'Edit Task' : 'Create New Task'}</h3>
                  <form onSubmit={editingTask ? handleUpdateTask : handleCreateTask} className="form grid">
                    <div className="field">
                      <label>Title</label>
                      <input className="input" type="text" value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} required disabled={creating} />
                    </div>
                    <div className="field">
                      <label>Description</label>
                      <textarea className="input textarea" value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} required disabled={creating} />
                    </div>
                    <div className="field">
                      <label>Assign To</label>
                      <select className="input" value={newTask.assignedTo} onChange={(e) => setNewTask({ ...newTask, assignedTo: e.target.value })} required disabled={creating}>
                        <option value="">Select Employee</option>
                        {employees.map((emp) => <option key={emp._id} value={emp._id}>{emp.name} ({emp.position})</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label>Priority</label>
                      <select className="input" value={newTask.priority} onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as 'low' | 'medium' | 'high' })} disabled={creating}>
                        <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Due Date</label>
                      <input className="input" type="date" value={newTask.dueDate} onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })} required disabled={creating} />
                    </div>
                    <div className="actions">
                      <button type="submit" disabled={creating} className={`btn ${creating ? 'secondary' : 'primary'}`}>
                        {creating ? (editingTask ? 'Updating…' : 'Creating…') : (editingTask ? 'Update Task' : 'Create Task')}
                      </button>
                      <button type="button" onClick={cancelTaskForm} className="btn secondary">Cancel</button>
                    </div>
                  </form>
                </div>
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
                              t.status === 'completed' ? 'badge-green' : t.status === 'in-progress' ? 'badge-cyan' : 'badge-gray'
                            }`}>{t.status}</span>
                          </td>
                          <td>{new Date(t.dueDate).toLocaleDateString()}</td>
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
                  setNewLunchTime({ employeeId: '', startTime: '12:00', endTime: '13:00', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] });
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
                    <select className="input" value={newLunchTime.employeeId} onChange={(e) => setNewLunchTime({ ...newLunchTime, employeeId: e.target.value })} required disabled={creating}>
                      <option value="">Select Employee</option>
                      {employees.map((emp) => <option key={emp._id} value={emp._id}>{emp.name} ({emp.position})</option>)}
                    </select>
                  </div>
                  <div className="grid-2">
                    <div className="field">
                      <label>Start Time</label>
                      <input className="input" type="time" value={newLunchTime.startTime} onChange={(e) => setNewLunchTime({ ...newLunchTime, startTime: e.target.value })} required disabled={creating} />
                    </div>
                    <div className="field">
                      <label>End Time</label>
                      <input className="input" type="time" value={newLunchTime.endTime} onChange={(e) => setNewLunchTime({ ...newLunchTime, endTime: e.target.value })} required disabled={creating} />
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
                    {lunchTimes.map((lt) => (
                      <tr key={lt._id}>
                        <td>{lt.employeeName}</td>
                        <td>{lt.startTime}</td>
                        <td>{lt.endTime}</td>
                        <td>{lt.days.join(', ')}</td>
                        <td className="table-actions">
                          <button onClick={() => handleEditLunchTime(lt)} className="btn info small">Edit</button>
                          <button onClick={() => handleDeleteLunchTime(lt._id)} className="btn danger small">Delete</button>
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

      {/* Toast container */}
      <Toasts toasts={toasts} onClose={remove} />
    </div>
  );
}
