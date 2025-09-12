"use client";
import CheckInOut from "@/components/CheckInOut";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  PlayCircle,
  Plus,
  Calendar as CalendarIcon,
  Clock,
  LogOut,
  User,
  BarChart3,
  CheckSquare,
  Utensils,
  X,
  Users,
  Building2,
  Shield,
  ClipboardList,
  Settings2,
  Trash2,
  Edit3,
  RefreshCw,
} from "lucide-react";
import LunchCam from "@/components/LaunchCamera";

/* ================== Types ================== */
type CheckInOutData = {
  type: "checkin" | "checkout";
  timestamp: Date;
  employeeId: string;
};

type Task = {
  _id: string;
  title: string;
  description: string;
  status: "pending" | "in-progress" | "completed" | "cancelled";
  assignedBy?: string;
  assignedTo?: string;
  role?: string;
  priority: "low" | "medium" | "high";
  dueDate: string;
  createdAt?: string;
  progressUpdates: { message: string; timestamp: string }[];
};

type LunchLog = {
  type: "lunch-start" | "lunch-end";
  timestamp: string;
};

type LunchTime = {
  _id: string;
  employeeId: string;
  employeeName: string;
  startTime: string;
  endTime: string;
  days: string[];
};

type Holiday = {
  _id: string;
  date: string;
  description?: string;
};

type Permissions = {
  canCheckIn: boolean;
  canManageEmployees: boolean;
  canManageDepartments: boolean;
  canManageRoles: boolean;
  canAssignTasks: boolean;
  canAssignTasksAllDepartments: boolean;
  canViewAllTasks: boolean;
  canViewTasks: boolean;
  canViewReports: boolean;
};

type BroadcastMessage = {
  _id: string;
  subject: string;
  body: string;
  urgent?: boolean;
  createdAt: string; // ISO
  createdByName?: string;
  recipientCount?: number;
};

const PERM_DEFAULTS: Permissions = {
  canCheckIn: false,
  canManageEmployees: false,
  canManageDepartments: false,
  canManageRoles: false,
  canAssignTasks: false,
  canAssignTasksAllDepartments: false,
  canViewAllTasks: false,
  canViewTasks: false,
  canViewReports: false,
};

// --- Push helpers/state ---
function urlBase64ToUint8Array(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/* ================== Component ================== */
export default function Dashboard() {
  /* --------- Auth / Identity --------- */
  const [employeeId, setEmployeeId] = useState<string>("");
  const [employeeName, setEmployeeName] = useState<string>("");
  const [employeeRole, setEmployeeRole] = useState<string>(""); // role NAME string
  const [perms, setPerms] = useState<Permissions>(PERM_DEFAULTS);
  const router = useRouter();

  /* --------- Employee self data --------- */
  const [checkRecords, setCheckRecords] = useState<CheckInOutData[]>([]);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [lunchTimes, setLunchTimes] = useState<LunchTime[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [lunchLogs, setLunchLogs] = useState<LunchLog[]>([]);
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "attendance" | "tasks" | "lunch" | "holidays" | "admin"
  >("dashboard");

  /* --------- UI state --------- */
  const [showProgressForm, setShowProgressForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState("");
  const [showCameraPopup, setShowCameraPopup] = useState(false);
  const [checkType, setCheckType] = useState<"checkin" | "checkout" | null>(
    null
  );
  const [showHolidayRequestForm, setShowHolidayRequestForm] = useState(false);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayMessage, setHolidayMessage] = useState("");

  /* --------- Admin datasets & forms --------- */
  const [employees, setEmployees] = useState<
    Array<{
      _id: string;
      name: string;
      email: string;
      department: string;
      role: string;
      position: string;
    }>
  >([]);

  const [departments, setDepartments] = useState<
    Array<{ _id: string; name: string; description?: string }>
  >([]);
  const [roles, setRoles] = useState<
    Array<{
      _id: string;
      name: string;
      department: string;
      permissions: Permissions;
    }>
  >([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Admin forms
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [showDepartmentForm, setShowDepartmentForm] = useState(false);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);

  const [editingRole, setEditingRole] = useState<(typeof roles)[number] | null>(
    null
  );
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const [newEmployee, setNewEmployee] = useState({
    name: "",
    email: "",
    password: "",
    department: "General",
    role: "Employee",
    position: "",
  });

  const [newDepartment, setNewDepartment] = useState({
    name: "",
    description: "",
  });

  const [newRole, setNewRole] = useState({
    name: "",
    department: "General",
    permissions: {
      canCheckIn: true,
      canManageEmployees: false,
      canManageDepartments: false,
      canManageRoles: false,
      canAssignTasks: false,
      canAssignTasksAllDepartments: false,
      canViewAllTasks: false,
      canViewTasks: true,
      canViewReports: false,
    } as Permissions,
  });

  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    assignedTo: "",
    priority: "medium",
    dueDate: "",
  });

  // Holidays (admin) helpers
  const [selectedHolidayDate, setSelectedHolidayDate] = useState<string>("");
  const [holidayDesc, setHolidayDesc] = useState<string>("");
  const [savingHoliday, setSavingHoliday] = useState(false);
  const [announcements, setAnnouncements] = useState<BroadcastMessage[]>([]);
  const [loadingAnnouncements, setLoadingAnnouncements] =
    useState<boolean>(false);
  const [showUrgent, setShowUrgent] = useState<boolean>(false);

  const [showLunchCam, setShowLunchCam] = useState(false);
  const [lunchType, setLunchType] = useState<
    "lunch-start" | "lunch-end" | null
  >(null);

  const [pushReady, setPushReady] = useState<boolean>(false);
  const [pushError, setPushError] = useState<string | null>(null);

  const registerForPush = useCallback(async () => {
    try {
      setPushError(null);

      if (!employeeId) return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setPushError("Browser does not support push");
        return;
      }

      // 1) register the service worker
      const reg = await navigator.serviceWorker.register("/sw.js");

      // 2) ask permission
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setPushError("Notifications permission was not granted");
        return;
      }

      // 3) get VAPID public key
      const r = await fetch("/api/push/public-key");
      const { publicKey } = await r.json();
      if (!publicKey) throw new Error("Missing VAPID public key");

      // 4) create or reuse a subscription
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      // 5) send to server (associate with employee)
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildAuthHeaders() },
        body: JSON.stringify({ subscription: sub }),
      });

      setPushReady(true);
    } catch (e: any) {
      console.error(e);
      setPushReady(false);
      setPushError(e?.message || "Failed to enable notifications");
    }
  }, [employeeId]);

  useEffect(() => {
    if (employeeId) {
      registerForPush();
    }
  }, [employeeId, registerForPush]);

  /* ================== Identity bootstrap ================== */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("employee");
      if (!raw) {
        router.push("/");
        return;
      }
      const emp = JSON.parse(raw);
      setEmployeeId(emp.id);
      localStorage.setItem("userId", emp.id);
      setEmployeeName(emp.name);
      if (emp.role) setEmployeeRole(emp.role as string);
    } catch {
      router.push("/");
    }
  }, [router]);

  /* ================== Load permissions ================== */
  useEffect(() => {
    async function loadPermissions(roleName: string) {
      try {
        const res = await fetch("/api/roles"); // public roles list
        if (!res.ok) throw new Error("Failed to fetch roles");
        const data = await res.json();
        const r = (data.roles || []) as Array<{
          name: string;
          permissions: Permissions;
        }>;
        const match = r.find((x) => x.name === roleName);
        setPerms(match?.permissions ?? PERM_DEFAULTS);
      } catch (e) {
        console.error("Failed to load permissions:", e);
        setPerms(PERM_DEFAULTS);
      }
    }
    if (employeeRole) loadPermissions(employeeRole);
  }, [employeeRole]);

  function formatDue(iso?: string) {
    if (!iso) return "";
    const d = new Date(iso);

    // if no time was provided, many tasks will be saved at 00:00
    const showTime = d.getHours() !== 0 || d.getMinutes() !== 0;

    const datePart = d.toLocaleDateString();
    const timePart = showTime
      ? " • " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "";

    return `${datePart}${timePart}`;
  }

  function buildAuthHeaders(): Record<string, string> {
    try {
      if (typeof window === "undefined") return {};
      const raw = localStorage.getItem("employee");
      if (!raw) return {};
      const id = JSON.parse(raw)?.id;
      return id ? { "x-user-id": String(id) } : {};
    } catch {
      return {};
    }
  }

  const loadAnnouncements = useCallback(async (empId: string) => {
    if (!empId) return;
    try {
      setLoadingAnnouncements(true);
      const res = await fetch("/api/messages", {
        headers: { "x-user-id": empId },
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to load announcements");

      const list: BroadcastMessage[] = Array.isArray(data.messages)
        ? data.messages
        : [];
      setAnnouncements(list);

      // Urgent banner logic: show once per newest message id (persist in localStorage)
      if (list.length > 0 && list[0].urgent) {
        const lastSeen = localStorage.getItem("lastSeenAnnouncementId");
        if (lastSeen !== list[0]._id) setShowUrgent(true);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAnnouncements(false);
    }
  }, []);

  /* ================== Employee actions ================== */
  async function submitHolidayRequest() {
    try {
      const res = await fetch("/api/holiday-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          employeeName,
          date: holidayDate,
          message: holidayMessage,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to submit holiday request");

      alert("Holiday request submitted successfully!");
      setShowHolidayRequestForm(false);
      setHolidayDate("");
      setHolidayMessage("");
    } catch (err) {
      console.error("Error submitting holiday request:", err);
      alert("Could not submit holiday request");
    }
  }

  const loadLunchLogs = useCallback(async (empId: string) => {
    if (!empId) return;
    try {
      const res = await fetch(`/api/lunch/log?employeeId=${empId}`);
      const data = await res.json();
      setLunchLogs(data.logs || []);
    } catch (e) {
      console.error("Failed to load lunch logs", e);
    }
  }, []);

  const loadAttendance = useCallback(async (empId: string) => {
    if (!empId) return;
    try {
      const res = await fetch(
        `/api/admin/attendance?employeeId=${empId}&limit=20`
      );
      const data = await res.json();
      const mapped: CheckInOutData[] = (data.attendance || []).map(
        (r: any) => ({
          type: r.type,
          timestamp: new Date(r.timestamp),
          employeeId:
            typeof r.employeeId === "object" ? r.employeeId?._id : r.employeeId,
        })
      );
      setCheckRecords(mapped);
    } catch (e) {
      console.error("Failed to load attendance", e);
    }
  }, []);

  const loadTasks = useCallback(
    async (empId: string) => {
      if (!empId) return;
      try {
        const res = await fetch(`/api/tasks`, {
          headers: { "x-user-id": empId },
        });
        const data = await res.json();
        const tasks = data.tasks || [];
        setMyTasks(tasks.filter((t: Task) => t.assignedTo === empId));
        // If admin can view, keep all too:
        if (perms.canViewAllTasks) setAllTasks(tasks);
      } catch (e) {
        console.error("Failed to load tasks", e);
      }
    },
    [perms.canViewAllTasks]
  );

  const loadLunchTimes = useCallback(async (empId: string) => {
    if (!empId) return;
    try {
      const res = await fetch(`/api/lunchtimes?employeeId=${empId}`);
      const data = await res.json();
      setLunchTimes(data.lunchTimes || []);
    } catch (e) {
      console.error("Failed to load lunch times", e);
    }
  }, []);

  const loadHolidays = useCallback(async () => {
    try {
      const res = await fetch("/api/holidays");
      const data = await res.json();
      setHolidays(data.holidays || []);
    } catch (e) {
      console.error("Failed to load holidays", e);
    }
  }, []);

  // Admin loads
  const loadAdminSets = useCallback(
    async (empId: string) => {
      if (!empId) return;
      try {
        setAdminError(null);
        const [eRes, dRes, rRes, tRes] = await Promise.all([
          perms.canManageEmployees
            ? fetch("/api/admin/employees", { headers: { "x-user-id": empId } })
            : Promise.resolve(null),
          perms.canManageDepartments
            ? fetch("/api/departments", { headers: { "x-user-id": empId } })
            : Promise.resolve(null),
          perms.canManageRoles || perms.canAssignTasks || perms.canViewAllTasks
            ? fetch("/api/roles", { headers: { "x-user-id": empId } })
            : Promise.resolve(null),
          perms.canViewAllTasks || perms.canAssignTasks
            ? fetch("/api/admin/tasks", { headers: { "x-user-id": empId } })
            : Promise.resolve(null),
        ]);

        if (eRes && eRes.ok) setEmployees((await eRes.json()).employees || []);
        if (dRes && dRes.ok)
          setDepartments((await dRes.json()).departments || []);
        if (rRes && rRes.ok) setRoles((await rRes.json()).roles || []);
        if (tRes && tRes.ok) setAllTasks((await tRes.json()).tasks || []);
      } catch (e: any) {
        setAdminError(e?.message || "Failed to load admin datasets");
      }
    },
    [
      perms.canManageEmployees,
      perms.canManageDepartments,
      perms.canManageRoles,
      perms.canAssignTasks,
      perms.canViewAllTasks,
    ]
  );

  /* ================== Unified loader ================== */
  useEffect(() => {
    if (employeeId) {
      loadAttendance(employeeId);
      loadTasks(employeeId);
      loadLunchTimes(employeeId);
      loadLunchLogs(employeeId);
      loadHolidays();
      loadAdminSets(employeeId);
      loadAnnouncements(employeeId); // ✅ add this
    }
  }, [
    employeeId,
    loadAttendance,
    loadTasks,
    loadLunchTimes,
    loadLunchLogs,
    loadHolidays,
    loadAdminSets,
    loadAnnouncements,
  ]);

  /* ================== Self task actions ================== */
  const updateTaskStatus = async (taskId: string, status: Task["status"]) => {
    try {
      const token = localStorage.getItem("token");
      const userId = localStorage.getItem("userId");
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (userId) headers["x-user-id"] = userId;

      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ status }),
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.error || "Failed to update task");

      setMyTasks((prev) =>
        prev.map((t) => (t._id === taskId ? updated.task : t))
      );
      if (status === "completed") alert("Task marked as completed!");
    } catch (err: any) {
      console.error("Error updating task:", err);
      alert(err.message || "Failed to update task");
    }
  };

  async function addProgressUpdate(taskId: string, message: string) {
    try {
      if (!employeeId) throw new Error("Employee ID not found");
      if (!message.trim()) return;

      const res = await fetch(`/api/tasks/${taskId}/progress`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": employeeId, // REQUIRED for auth in the route
        },
        body: JSON.stringify({ message }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");

      // Use returned task or optimistic-update
      setMyTasks((prev) =>
        prev.map((task) =>
          task._id === taskId
            ? {
                ...task,
                progressUpdates: [
                  ...task.progressUpdates,
                  { message, timestamp: new Date().toISOString() },
                ],
              }
            : task
        )
      );

      setShowProgressForm(false);
      setSelectedTask(null);
      setProgressMessage("");
    } catch (err: any) {
      console.error("Error adding progress:", err);
      alert(err.message || "Failed to add progress update");
    }
  }

  /* ================== Admin: Employee CRUD ================== */
  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreating(true);
      const res = await fetch("/api/admin/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newEmployee),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || "Failed to create employee");
      setNewEmployee({
        name: "",
        email: "",
        password: "",
        department: "General",
        role: "Employee",
        position: "",
      });
      setShowEmployeeForm(false);
      await loadAdminSets(employeeId);
      alert("Employee created");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCreating(false);
    }
  };

  /* ================== Admin: Department CRUD ================== */
  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreating(true);
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newDepartment),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create department");
      setNewDepartment({ name: "", description: "" });
      setShowDepartmentForm(false);
      await loadAdminSets(employeeId);
      alert("Department created");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCreating(false);
    }
  };

  /* ================== Admin: Roles CRUD ================== */
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreating(true);
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRole),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create role");

      setNewRole({
        name: "",
        department: "General",
        permissions: {
          canCheckIn: true,
          canManageEmployees: false,
          canManageDepartments: false,
          canManageRoles: false,
          canAssignTasks: false,
          canViewAllTasks: false,
          canViewTasks: true,
          canViewReports: false,
          canAssignTasksAllDepartments: false,
        },
      });
      setShowRoleForm(false);
      await loadAdminSets(employeeId);
      alert("Role created");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleEditRole = (role: (typeof roles)[number]) => {
    setEditingRole(role);
    setNewRole({
      name: role.name,
      department: role.department,
      permissions: {
        ...role.permissions,
        canViewTasks: role.permissions.canViewTasks ?? true,
      },
    });
    setShowRoleForm(true);
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRole) return;
    try {
      setCreating(true);
      const res = await fetch("/api/roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingRole._id, ...newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update role");
      setEditingRole(null);
      setNewRole({
        name: "",
        department: "General",
        permissions: {
          canCheckIn: true,
          canManageEmployees: false,
          canManageDepartments: false,
          canManageRoles: false,
          canAssignTasks: false,
          canViewAllTasks: false,
          canViewTasks: true,
          canViewReports: false,
          canAssignTasksAllDepartments: false,
        },
      });
      setShowRoleForm(false);
      await loadAdminSets(employeeId);
      alert("Role updated");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!confirm("Delete this role?")) return;
    try {
      const res = await fetch(`/api/roles?id=${roleId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete role");
      await loadAdminSets(employeeId);
      alert("Role deleted");
    } catch (e: any) {
      alert(e.message);
    }
  };

  /* ================== Admin: Tasks CRUD ================== */
  const startEditingTask = (t: Task) => {
    setEditingTaskId(t._id);
    setNewTask({
      title: t.title,
      description: t.description,
      assignedTo: t.assignedTo || "",
      priority: t.priority,
      dueDate: t.dueDate?.split("T")[0] || "",
    });
    setShowTaskForm(true);
  };

  const cancelTaskForm = () => {
    setEditingTaskId(null);
    setNewTask({
      title: "",
      description: "",
      assignedTo: "",
      priority: "medium",
      dueDate: "",
    });
    setShowTaskForm(false);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreating(true);
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": employeeId,
        },
        body: JSON.stringify({ ...newTask, assignedBy: employeeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create task");
      setNewTask({
        title: "",
        description: "",
        assignedTo: "",
        priority: "medium",
        dueDate: "",
      });
      setShowTaskForm(false);
      await loadTasks(employeeId);
      await loadAdminSets(employeeId);
      alert("Task created");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTaskId) return;
    try {
      setCreating(true);
      const res = await fetch(`/api/tasks/${editingTaskId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": employeeId,
        },
        body: JSON.stringify(newTask),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update task");
      setEditingTaskId(null);
      setNewTask({
        title: "",
        description: "",
        assignedTo: "",
        priority: "medium",
        dueDate: "",
      });
      setShowTaskForm(false);
      await loadTasks(employeeId);
      await loadAdminSets(employeeId);
      alert("Task updated");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm("Delete this task?")) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "DELETE",
        headers: { ...buildAuthHeaders() },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete task");
      await loadTasks(employeeId);
      await loadAdminSets(employeeId);
      alert("Task deleted");
    } catch (e: any) {
      alert(e.message);
    }
  };

  /* ================== Admin: Holidays (Calendar) ================== */
  const addHoliday = async () => {
    if (!selectedHolidayDate) return;
    try {
      setSavingHoliday(true);
      const iso = new Date(
        selectedHolidayDate + "T00:00:00.000Z"
      ).toISOString();
      const res = await fetch("/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: iso, description: holidayDesc }),
      });
      if (!res.ok) throw new Error("Failed to save holiday");
      setSelectedHolidayDate("");
      setHolidayDesc("");
      await loadHolidays();
      alert("Holiday added");
    } catch (e: any) {
      alert(e.message || "Failed to save holiday");
    } finally {
      setSavingHoliday(false);
    }
  };

  const removeHoliday = async (holidayId: string) => {
    if (!confirm("Remove this holiday?")) return;
    try {
      const res = await fetch(`/api/holidays/${holidayId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove holiday");
      await loadHolidays();
      alert("Holiday removed");
    } catch (e: any) {
      alert(e.message || "Failed to remove holiday");
    }
  };

  /* ================== Helpers ================== */
  const handleCheckInOut = (data: CheckInOutData) => {
    setCheckRecords((prev) => [{ ...data }, ...prev]);
  };
  const handleLogout = () => {
    localStorage.removeItem("employee");
    localStorage.removeItem("token");
    router.push("/");
  };
  const getPriorityColor = (priority: Task["priority"]) =>
    priority === "high"
      ? "priority-high"
      : priority === "medium"
      ? "priority-medium"
      : "priority-low";
  const getStatusColor = (status: Task["status"]) =>
    status === "completed"
      ? "status-completed"
      : status === "in-progress"
      ? "status-in-progress"
      : "status-pending";

  if (!employeeId) return null;

  /* ================== Render ================== */
  return (
    <div className="dashboard-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <User size={20} />
          <span>Employee Portal</span>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            <BarChart3 size={18} />
            <span>Dashboard</span>
          </button>

          <button
            className={`nav-item ${activeTab === "attendance" ? "active" : ""}`}
            onClick={() => setActiveTab("attendance")}
          >
            <Clock size={18} />
            <span>Attendance</span>
          </button>

          {perms.canViewTasks && (
            <button
              className={`nav-item ${activeTab === "tasks" ? "active" : ""}`}
              onClick={() => setActiveTab("tasks")}
            >
              <CheckSquare size={18} />
              <span>Tasks</span>
            </button>
          )}

          <button
            className={`nav-item ${activeTab === "lunch" ? "active" : ""}`}
            onClick={() => setActiveTab("lunch")}
          >
            <Utensils size={18} />
            <span>Lunch</span>
          </button>

          <button
            className={`nav-item ${activeTab === "holidays" ? "active" : ""}`}
            onClick={() => setActiveTab("holidays")}
          >
            <CalendarIcon size={18} />
            <span>Holidays</span>
          </button>

          {(perms.canManageEmployees ||
            perms.canManageDepartments ||
            perms.canManageRoles ||
            perms.canAssignTasks ||
            perms.canViewAllTasks) && (
            <button
              className={`nav-item ${activeTab === "admin" ? "active" : ""}`}
              onClick={() => setActiveTab("admin")}
            >
              <Settings2 size={18} />
              <span>Admin</span>
            </button>
          )}
        </nav>

        <button className="logout-btn" onClick={handleLogout}>
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </aside>

      {/* Main content */}
      <main className="main-content">
        <header className="content-header">
          <h1>Welcome back, {employeeName}</h1>
          <p>Here`s your daily overview</p>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginTop: 6,
            }}
          >
            {pushReady ? (
              <span className="badge badge-green">Notifications On</span>
            ) : (
              <>
                <span className="badge badge-gray">Notifications Off</span>
                <button className="btn secondary" onClick={registerForPush}>
                  Enable
                </button>
              </>
            )}
            {pushError && (
              <span className="badge badge-red" title={pushError}>
                Push Error
              </span>
            )}
          </div>
        </header>

        {/* Urgent company announcement banner */}
        {announcements.length > 0 && announcements[0].urgent && showUrgent && (
          <div className="urgent-banner" role="alert">
            <div className="urgent-left">
              <strong>URGENT:</strong> {announcements[0].subject}
              <span className="urgent-time">
                {new Date(announcements[0].createdAt).toLocaleString()}
              </span>
            </div>
            <div className="urgent-actions">
              <button
                className="btn primary"
                onClick={() => {
                  alert(
                    `${announcements[0].subject}\n\n${announcements[0].body}`
                  );
                  localStorage.setItem(
                    "lastSeenAnnouncementId",
                    announcements[0]._id
                  );
                  setShowUrgent(false);
                }}
              >
                View
              </button>
              <button
                className="btn secondary"
                onClick={() => {
                  localStorage.setItem(
                    "lastSeenAnnouncementId",
                    announcements[0]._id
                  );
                  setShowUrgent(false);
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Company Announcements */}
        <div className="card">
          <div className="card-header">
            <h2>Company Announcements</h2>
            {loadingAnnouncements ? (
              <span className="badge badge-gray">Loading…</span>
            ) : (
              <button
                className="btn icon"
                title="Refresh"
                onClick={() => loadAnnouncements(employeeId)}
              >
                <RefreshCw size={16} />
              </button>
            )}
          </div>

          {announcements.length === 0 ? (
            <p className="no-data">No announcements yet</p>
          ) : (
            <div className="ann-list">
              {announcements.slice(0, 10).map((m) => (
                <div
                  key={m._id}
                  className={`ann-item ${m.urgent ? "ann-urgent" : ""}`}
                >
                  <div className="ann-top">
                    <span className="ann-subject">{m.subject}</span>
                    <span className="ann-time">
                      {new Date(m.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="ann-body">{m.body}</p>
                  <div className="ann-meta">
                    {m.urgent ? (
                      <span className="badge badge-red">URGENT</span>
                    ) : (
                      <span className="badge badge-cyan">General</span>
                    )}
                    {m.createdByName && (
                      <span className="ann-by">by {m.createdByName}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ===== Dashboard ===== */}
        {activeTab === "dashboard" && (
          <section className="dashboard-section">
            <div className="welcome-card">
              <h2>Good day at work!</h2>
              <p>Check in to start tracking your working hours</p>

              {perms.canCheckIn && (
                <div className="check-buttons">
                  <button
                    className="primary-btn"
                    onClick={() => {
                      setCheckType("checkin");
                      setShowCameraPopup(true);
                    }}
                  >
                    Check In
                  </button>
                  {/* <button
                    className="secondary-btn"
                    onClick={() => {
                      setCheckType("checkout");
                      setShowCameraPopup(true);
                    }}
                  >
                    Check Out
                  </button> */}
                </div>
              )}

              {showCameraPopup && perms.canCheckIn && (
                <div className="modal-overlay">
                  <div className="modal camera-modal">
                    <div className="modal-header">
                      <h3>
                        {checkType === "checkin" ? "Check In" : "Check Out"} -{" "}
                        {employeeName}
                      </h3>
                      <button
                        className="close-btn"
                        onClick={() => setShowCameraPopup(false)}
                      >
                        <X size={20} />
                      </button>
                    </div>
                    <div className="camera-content">
                      <CheckInOut
                        employeeId={employeeId}
                        employeeName={employeeName}
                        onCheckInOut={(data) => {
                          handleCheckInOut(data);
                          setShowCameraPopup(false);
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="stats-grid">
              <div className="stat-card">
                <h3>{myTasks.length}</h3>
                <p>Assigned Tasks</p>
              </div>
              <div className="stat-card">
                <h3>
                  {myTasks.filter((t) => t.status === "completed").length}
                </h3>
                <p>Completed Tasks</p>
              </div>
              <div className="stat-card">
                <h3>
                  {checkRecords.filter((r) => r.type === "checkin").length}
                </h3>
                <p>Check-ins This Week</p>
              </div>
            </div>
          </section>
        )}

        {/* ===== Attendance ===== */}
        {activeTab === "attendance" && (
          <section className="attendance-section">
            <div className="section-header">
              <h2>Attendance Records</h2>
              <button
                className="btn icon"
                title="Refresh"
                onClick={() => loadAttendance(employeeId)}
              >
                <RefreshCw size={16} />
              </button>
            </div>
            {checkRecords.length === 0 ? (
              <p className="no-data">No attendance records found</p>
            ) : (
              <div className="records-list">
                {checkRecords.map((record, index) => (
                  <div key={index} className="record-item">
                    <div className={`record-type ${record.type}`}>
                      {record.type === "checkin" ? "Checked In" : "Checked Out"}
                    </div>
                    <div className="record-time">
                      {record.timestamp.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ===== Tasks (self) ===== */}
        {activeTab === "tasks" && perms.canViewTasks && (
          <section className="tasks-section">
            <div className="section-header">
              <h2>Your Tasks</h2>
              <span className="task-count">{myTasks.length} tasks</span>
            </div>

            {myTasks.length === 0 ? (
              <p className="no-data">No tasks assigned to you</p>
            ) : (
              <div className="tasks-grid">
                {myTasks.map((task) => (
                  <div key={task._id} className="task-card">
                    <div className="task-header">
                      <h3>{task.title}</h3>
                      <div className="task-actions">
                        <button
                          onClick={() =>
                            updateTaskStatus(task._id, "in-progress")
                          }
                          disabled={task.status === "in-progress"}
                          className="action-btn"
                          title="Mark as in progress"
                        >
                          <PlayCircle size={16} />
                        </button>
                        <button
                          onClick={() =>
                            updateTaskStatus(task._id, "completed")
                          }
                          disabled={task.status === "completed"}
                          className="action-btn"
                          title="Mark as completed"
                        >
                          <CheckCircle size={16} />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedTask(task._id);
                            setShowProgressForm(true);
                          }}
                          className="action-btn"
                          title="Add progress update"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>

                    <p className="task-description">{task.description}</p>

                    <div className="task-meta">
                      <span
                        className={`priority-badge ${getPriorityColor(
                          task.priority
                        )}`}
                      >
                        {task.priority}
                      </span>
                      <span
                        className={`status-badge ${getStatusColor(
                          task.status
                        )}`}
                      >
                        {task.status.replace("-", " ")}
                      </span>
                      {task.dueDate && (
                        <span className="due-date">
                          Due: {formatDue(task.dueDate)}
                        </span>
                      )}
                    </div>

                    {task.progressUpdates?.length > 0 && (
                      <div className="progress-updates">
                        <h4>Progress Updates</h4>
                        {task.progressUpdates.map((update, index) => (
                          <div key={index} className="progress-item">
                            <p>{update.message}</p>
                            <span className="progress-time">
                              {new Date(update.timestamp).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Progress Update Modal */}
            {showProgressForm && (
              <div className="modal-overlay">
                <div className="modal">
                  <h3>Add Progress Update</h3>
                  <textarea
                    value={progressMessage}
                    onChange={(e) => setProgressMessage(e.target.value)}
                    placeholder="What progress have you made on this task?"
                    rows={4}
                  />
                  <div className="modal-actions">
                    <button
                      onClick={() => {
                        setShowProgressForm(false);
                        setSelectedTask(null);
                        setProgressMessage("");
                      }}
                      className="secondary-btn"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() =>
                        selectedTask &&
                        addProgressUpdate(selectedTask, progressMessage)
                      }
                      className="primary-btn"
                      disabled={!progressMessage.trim()}
                    >
                      Add Update
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ===== Lunch ===== */}
        {activeTab === "lunch" && (
          <section className="lunch-section">
            <div className="section-header">
              <h2>Your Lunch</h2>
              <div className="section-actions">
                <button
                  className="btn primary"
                  onClick={() => {
                    setLunchType("lunch-start");
                    setShowLunchCam(true);
                  }}
                >
                  Start Lunch
                </button>

                <button
                  className="btn secondary"
                  onClick={() => {
                    setLunchType("lunch-end");
                    setShowLunchCam(true);
                  }}
                >
                  End Lunch
                </button>
              </div>
            </div>

            {lunchTimes.length === 0 ? (
              <p className="no-data">No lunch schedule assigned</p>
            ) : (
              <div className="lunch-cards">
                {lunchTimes.map((lunch) => (
                  <div key={lunch._id} className="lunch-card">
                    <h3>Scheduled Lunch Time</h3>
                    <p className="lunch-time">
                      {lunch.startTime} - {lunch.endTime}
                    </p>
                    <p className="lunch-days">{lunch.days.join(", ")}</p>
                  </div>
                ))}
              </div>
            )}

            <h3 style={{ marginTop: "20px" }}>Lunch Records</h3>
            {lunchLogs.length === 0 ? (
              <p className="no-data">No lunch records found</p>
            ) : (
              <div className="records-list">
                {lunchLogs.map((log, i) => (
                  <div key={i} className="record-item">
                    <div className={`record-type ${log.type}`}>
                      {log.type === "lunch-start"
                        ? "Lunch Started"
                        : "Lunch Ended"}
                    </div>
                    <div className="record-time">
                      {new Date(log.timestamp).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
        {showLunchCam && lunchType && (
          <div className="modal-overlay">
            <div className="modal camera-modal">
              <div className="modal-header">
                <h3>
                  {lunchType === "lunch-start" ? "Start Lunch" : "End Lunch"} –{" "}
                  {employeeName}
                </h3>
                <button
                  className="close-btn"
                  onClick={() => {
                    setShowLunchCam(false);
                    setLunchType(null);
                  }}
                >
                  ✕
                </button>
              </div>
              <div className="camera-content">
                <LunchCam
                  employeeId={employeeId}
                  type={lunchType}
                  onDone={async () => {
                    setShowLunchCam(false);
                    setLunchType(null);
                    await loadLunchLogs(employeeId); // refresh list
                  }}
                  onCancel={() => {
                    setShowLunchCam(false);
                    setLunchType(null);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ===== Holidays (self view + request) ===== */}
        {activeTab === "holidays" && (
          <section className="holidays-section">
            <div className="section-header">
              <h2>Company Holidays</h2>
              <button
                className="primary-btn"
                onClick={() => setShowHolidayRequestForm(true)}
              >
                Request Holiday
              </button>
            </div>

            {holidays.length === 0 ? (
              <p className="no-data">No holidays scheduled</p>
            ) : (
              <div className="holidays-list">
                {holidays
                  .sort(
                    (a, b) =>
                      new Date(a.date).getTime() - new Date(b.date).getTime()
                  )
                  .map((holiday) => (
                    <div key={holiday._id} className="holiday-item">
                      <div className="holiday-date">
                        {new Date(holiday.date).toLocaleDateString("en-US", {
                          weekday: "long",
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </div>
                      {holiday.description && (
                        <div className="holiday-description">
                          {holiday.description}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}

            {showHolidayRequestForm && (
              <div className="modal-overlay">
                <div className="modal">
                  <h3>Request a Holiday</h3>
                  <input
                    type="date"
                    value={holidayDate}
                    onChange={(e) => setHolidayDate(e.target.value)}
                    className="date-input"
                  />
                  <textarea
                    value={holidayMessage}
                    onChange={(e) => setHolidayMessage(e.target.value)}
                    placeholder="Enter your holiday request message..."
                    rows={4}
                  />
                  <div className="modal-actions">
                    <button
                      className="secondary-btn"
                      onClick={() => {
                        setShowHolidayRequestForm(false);
                        setHolidayDate("");
                        setHolidayMessage("");
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="primary-btn"
                      onClick={submitHolidayRequest}
                      disabled={!holidayDate || !holidayMessage.trim()}
                    >
                      Submit Request
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ===== Admin Console (gated) ===== */}
        {activeTab === "admin" && (
          <section className="admin-section">
            <div className="card admin-banner">
              <h2>Admin Console</h2>
              <p>
                Manage employees, departments, roles, tasks and holidays. You
                see only what your role permits.
              </p>
              <button
                className="btn info"
                onClick={() => loadAdminSets(employeeId)}
              >
                <RefreshCw size={16} /> Refresh
              </button>
            </div>

            {adminError && <div className="error-box">{adminError}</div>}

            {/* Employees */}
            {perms.canManageEmployees && (
              <section className="card">
                <div className="card-header">
                  <h3>
                    <Users size={16} /> Employee Management
                  </h3>
                  <button
                    className={`btn ${
                      showEmployeeForm ? "secondary" : "success"
                    }`}
                    onClick={() => setShowEmployeeForm(!showEmployeeForm)}
                  >
                    {showEmployeeForm ? "Cancel" : "Add New Employee"}
                  </button>
                </div>

                {showEmployeeForm && (
                  <div className="subcard">
                    <h4>Create New Employee</h4>
                    <form onSubmit={handleCreateEmployee} className="form grid">
                      <div className="field">
                        <label>Name</label>
                        <input
                          className="input"
                          type="text"
                          value={newEmployee.name}
                          onChange={(e) =>
                            setNewEmployee({
                              ...newEmployee,
                              name: e.target.value,
                            })
                          }
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
                          onChange={(e) =>
                            setNewEmployee({
                              ...newEmployee,
                              email: e.target.value,
                            })
                          }
                          required
                          disabled={creating}
                        />
                      </div>
                      <div className="field">
                        <label>Password</label>
                        <input
                          className="input"
                          type="password"
                          value={newEmployee.password}
                          onChange={(e) =>
                            setNewEmployee({
                              ...newEmployee,
                              password: e.target.value,
                            })
                          }
                          required
                          disabled={creating}
                        />
                      </div>
                      <div className="field">
                        <label>Department</label>
                        <select
                          className="input"
                          value={newEmployee.department}
                          onChange={(e) =>
                            setNewEmployee({
                              ...newEmployee,
                              department: e.target.value,
                            })
                          }
                          disabled={creating}
                        >
                          {departments.map((d) => (
                            <option key={d._id} value={d.name}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Role</label>
                        <select
                          className="input"
                          value={newEmployee.role}
                          onChange={(e) =>
                            setNewEmployee({
                              ...newEmployee,
                              role: e.target.value,
                            })
                          }
                          disabled={creating}
                        >
                          {roles.map((r) => (
                            <option key={r._id} value={r.name}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Position</label>
                        <input
                          className="input"
                          type="text"
                          value={newEmployee.position}
                          onChange={(e) =>
                            setNewEmployee({
                              ...newEmployee,
                              position: e.target.value,
                            })
                          }
                          required
                          disabled={creating}
                        />
                      </div>
                      <div className="actions">
                        <button
                          type="submit"
                          disabled={creating}
                          className={`btn ${
                            creating ? "secondary" : "primary"
                          }`}
                        >
                          {creating ? "Creating…" : "Create Employee"}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                <h4>Employees ({employees.length})</h4>
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
            {perms.canManageDepartments && (
              <section className="card">
                <div className="card-header">
                  <h3>
                    <Building2 size={16} /> Department Management
                  </h3>
                  <button
                    className={`btn ${
                      showDepartmentForm ? "secondary" : "success"
                    }`}
                    onClick={() => setShowDepartmentForm(!showDepartmentForm)}
                  >
                    {showDepartmentForm ? "Cancel" : "Add Department"}
                  </button>
                </div>

                {showDepartmentForm && (
                  <div className="subcard">
                    <h4>Create New Department</h4>
                    <form
                      onSubmit={handleCreateDepartment}
                      className="form grid"
                    >
                      <div className="field">
                        <label>Name</label>
                        <input
                          className="input"
                          type="text"
                          value={newDepartment.name}
                          onChange={(e) =>
                            setNewDepartment({
                              ...newDepartment,
                              name: e.target.value,
                            })
                          }
                          required
                          disabled={creating}
                        />
                      </div>
                      <div className="field">
                        <label>Description</label>
                        <textarea
                          className="input textarea"
                          value={newDepartment.description}
                          onChange={(e) =>
                            setNewDepartment({
                              ...newDepartment,
                              description: e.target.value,
                            })
                          }
                          disabled={creating}
                        />
                      </div>
                      <div className="actions">
                        <button
                          type="submit"
                          disabled={creating}
                          className={`btn ${
                            creating ? "secondary" : "primary"
                          }`}
                        >
                          {creating ? "Creating…" : "Create Department"}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                <h4>Departments ({departments.length})</h4>
                {departments.length === 0 ? (
                  <p className="empty">No departments found</p>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {departments.map((d) => (
                          <tr key={d._id}>
                            <td>{d.name}</td>
                            <td>{d.description || "No description"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* Roles */}
            {perms.canManageRoles && (
              <section className="card">
                <div className="card-header">
                  <h3>
                    <Shield size={16} /> Role Management
                  </h3>
                  <button
                    onClick={() => {
                      setEditingRole(null);
                      setNewRole({
                        name: "",
                        department: "General",
                        permissions: {
                          canCheckIn: true,
                          canManageEmployees: false,
                          canManageDepartments: false,
                          canManageRoles: false,
                          canAssignTasks: false,
                          canViewAllTasks: false,
                          canViewTasks: true,
                          canViewReports: false,
                          canAssignTasksAllDepartments: false,
                        },
                      });
                      setShowRoleForm(!showRoleForm);
                    }}
                    className={`btn ${showRoleForm ? "secondary" : "success"}`}
                  >
                    {showRoleForm ? "Cancel" : "Add Role"}
                  </button>
                </div>

                {showRoleForm && (
                  <div className="subcard">
                    <h4>{editingRole ? "Edit Role" : "Create New Role"}</h4>
                    <form
                      onSubmit={
                        editingRole ? handleUpdateRole : handleCreateRole
                      }
                      className="form grid"
                    >
                      <div className="field">
                        <label>Name</label>
                        <input
                          className="input"
                          type="text"
                          value={newRole.name}
                          onChange={(e) =>
                            setNewRole({ ...newRole, name: e.target.value })
                          }
                          required
                          disabled={creating}
                        />
                      </div>
                      <div className="field">
                        <label>Department</label>
                        <select
                          className="input"
                          value={newRole.department}
                          onChange={(e) =>
                            setNewRole({
                              ...newRole,
                              department: e.target.value,
                            })
                          }
                          disabled={creating}
                        >
                          {departments.map((d) => (
                            <option key={d._id} value={d.name}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Permissions</label>
                        <div className="checkbox-grid">
                          {Object.entries(newRole.permissions).map(
                            ([permission, value]) => (
                              <label key={permission} className="checkbox-row">
                                <input
                                  type="checkbox"
                                  checked={value as boolean}
                                  onChange={(e) =>
                                    setNewRole({
                                      ...newRole,
                                      permissions: {
                                        ...newRole.permissions,
                                        [permission]: e.target.checked,
                                      },
                                    })
                                  }
                                  disabled={creating}
                                />
                                <span>
                                  {permission
                                    .replace(/([A-Z])/g, " $1")
                                    .replace(/^./, (s) => s.toUpperCase())}
                                </span>
                              </label>
                            )
                          )}
                        </div>
                      </div>
                      <div className="actions">
                        <button
                          type="submit"
                          disabled={creating}
                          className={`btn ${
                            creating ? "secondary" : "primary"
                          }`}
                        >
                          {creating
                            ? editingRole
                              ? "Updating…"
                              : "Creating…"
                            : editingRole
                            ? "Update Role"
                            : "Create Role"}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                <h4>Roles ({roles.length})</h4>
                {roles.length === 0 ? (
                  <p className="empty">No roles found</p>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Department</th>
                          <th>Permissions</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {roles.map((r) => (
                          <tr key={r._id}>
                            <td>{r.name}</td>
                            <td>{r.department}</td>
                            <td>
                              {Object.entries(r.permissions)
                                .filter(([_, v]) => v)
                                .map(([p]) =>
                                  p
                                    .replace(/([A-Z])/g, " $1")
                                    .replace(/^./, (s) => s.toUpperCase())
                                )
                                .join(", ")}
                            </td>
                            <td className="table-actions">
                              <button
                                onClick={() => handleEditRole(r)}
                                className="btn info small"
                              >
                                <Edit3 size={14} /> Edit
                              </button>
                              <button
                                onClick={() => handleDeleteRole(r._id)}
                                className="btn danger small"
                              >
                                <Trash2 size={14} /> Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* Tasks (admin) */}
            {(perms.canAssignTasks || perms.canViewAllTasks) && (
              <section className="card">
                <div className="card-header">
                  <h3>
                    <ClipboardList size={16} /> Task Management
                  </h3>
                  {perms.canAssignTasks && (
                    <button
                      className="btn success"
                      onClick={() => setShowTaskForm(true)}
                    >
                      Add New Task
                    </button>
                  )}
                </div>

                {showTaskForm && (
                  <div className="modal-backdrop">
                    <div className="modal">
                      <h3>{editingTaskId ? "Edit Task" : "Create New Task"}</h3>
                      <form
                        onSubmit={
                          editingTaskId ? handleUpdateTask : handleCreateTask
                        }
                        className="form grid"
                      >
                        <div className="field">
                          <label>Title</label>
                          <input
                            className="input"
                            type="text"
                            value={newTask.title}
                            onChange={(e) =>
                              setNewTask({ ...newTask, title: e.target.value })
                            }
                            required
                            disabled={creating}
                          />
                        </div>
                        <div className="field">
                          <label>Description</label>
                          <textarea
                            className="input textarea"
                            value={newTask.description}
                            onChange={(e) =>
                              setNewTask({
                                ...newTask,
                                description: e.target.value,
                              })
                            }
                            required
                            disabled={creating}
                          />
                        </div>
                        <div className="field">
                          <label>Assign To</label>
                          <select
                            className="input"
                            value={newTask.assignedTo}
                            onChange={(e) =>
                              setNewTask({
                                ...newTask,
                                assignedTo: e.target.value,
                              })
                            }
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
                        <div className="field">
                          <label>Priority</label>
                          <select
                            className="input"
                            value={newTask.priority}
                            onChange={(e) =>
                              setNewTask({
                                ...newTask,
                                priority: e.target.value as
                                  | "low"
                                  | "medium"
                                  | "high",
                              })
                            }
                            disabled={creating}
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>Due Date</label>
                          <input
                            className="input"
                            type="date"
                            value={newTask.dueDate}
                            onChange={(e) =>
                              setNewTask({
                                ...newTask,
                                dueDate: e.target.value,
                              })
                            }
                            required
                            disabled={creating}
                          />
                        </div>
                        <div className="actions">
                          <button
                            type="submit"
                            disabled={creating}
                            className={`btn ${
                              creating ? "secondary" : "primary"
                            }`}
                          >
                            {creating
                              ? editingTaskId
                                ? "Updating…"
                                : "Creating…"
                              : editingTaskId
                              ? "Update Task"
                              : "Create Task"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelTaskForm}
                            className="btn secondary"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                <h4>Tasks ({allTasks.length})</h4>
                {allTasks.length === 0 ? (
                  <p className="empty">No tasks found</p>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Title</th>
                          <th>Assigned To</th>
                          <th>Priority</th>
                          <th>Status</th>
                          <th>Due Date</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allTasks.map((t) => {
                          const emp = employees.find(
                            (e) => e._id === t.assignedTo
                          );
                          return (
                            <tr key={t._id}>
                              <td>{t.title}</td>
                              <td>
                                {emp
                                  ? `${emp.name} (${emp.position})`
                                  : "Unknown"}
                              </td>
                              <td>
                                <span
                                  className={`badge ${
                                    t.priority === "high"
                                      ? "badge-red"
                                      : t.priority === "medium"
                                      ? "badge-amber"
                                      : "badge-green"
                                  }`}
                                >
                                  {t.priority}
                                </span>
                              </td>
                              <td>
                                <span
                                  className={`badge ${
                                    t.status === "completed"
                                      ? "badge-green"
                                      : t.status === "in-progress"
                                      ? "badge-cyan"
                                      : "badge-gray"
                                  }`}
                                >
                                  {t.status}
                                </span>
                              </td>
                              <td>{t.dueDate ? formatDue(t.dueDate) : "-"}</td>
                              <td className="table-actions">
                                {perms.canAssignTasks && (
                                  <>
                                    <button
                                      onClick={() => startEditingTask(t)}
                                      className="btn info small"
                                    >
                                      <Edit3 size={14} /> Edit
                                    </button>
                                    <button
                                      onClick={() => handleDeleteTask(t._id)}
                                      className="btn danger small"
                                    >
                                      <Trash2 size={14} /> Delete
                                    </button>
                                  </>
                                )}
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

            {/* Holidays admin (allow under dept manage or reports) */}
            {(perms.canManageDepartments || perms.canViewReports) && (
              <section className="card">
                <div className="card-header">
                  <h3>
                    <CalendarIcon size={16} /> Holidays (Admin)
                  </h3>
                </div>

                <div className="subcard">
                  <h4>Add Holiday</h4>
                  <div className="form grid-2">
                    <div className="field">
                      <label>Date</label>
                      <input
                        className="input"
                        type="date"
                        value={selectedHolidayDate}
                        onChange={(e) => setSelectedHolidayDate(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Description (optional)</label>
                      <input
                        className="input"
                        type="text"
                        value={holidayDesc}
                        onChange={(e) => setHolidayDesc(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="actions">
                    <button
                      className="btn primary"
                      disabled={!selectedHolidayDate || savingHoliday}
                      onClick={addHoliday}
                    >
                      {savingHoliday ? "Saving…" : "Save Holiday"}
                    </button>
                  </div>
                </div>

                <h4>All Holidays</h4>
                {holidays.length === 0 ? (
                  <p className="empty">No holidays yet</p>
                ) : (
                  <ul className="hm-ul">
                    {holidays
                      .slice()
                      .sort(
                        (a, b) =>
                          new Date(a.date).getTime() -
                          new Date(b.date).getTime()
                      )
                      .map((h) => (
                        <li key={h._id} className="hm-li">
                          <div className="hm-li-main">
                            <strong>{new Date(h.date).toDateString()}</strong>
                            {h.description && (
                              <p className="hm-desc">{h.description}</p>
                            )}
                          </div>
                          <button
                            className="btn danger small"
                            onClick={() => removeHoliday(h._id)}
                          >
                            <Trash2 size={14} /> Remove
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </section>
            )}
          </section>
        )}
      </main>

      {/* Styles */}
      <style jsx>{`
        /* Base */
        .dashboard-container {
          display: flex;
          min-height: 100vh;
          font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
        }
        .sidebar {
          width: 280px;
          background: linear-gradient(180deg, #2c3e50 0%, #34495e 100%);
          color: white;
          display: flex;
          flex-direction: column;
          padding: 20px 0;
          box-shadow: 2px 0 10px rgba(0, 0, 0, 0.1);
        }
        .sidebar-header {
          padding: 0 20px 20px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 18px;
          font-weight: 600;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          margin-bottom: 20px;
        }
        .sidebar-nav {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 5px;
          padding: 0 10px;
        }
        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 15px;
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.7);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
          text-align: left;
        }
        .nav-item:hover {
          background: rgba(255, 255, 255, 0.1);
          color: white;
        }
        .nav-item.active {
          background: rgba(52, 152, 219, 0.2);
          color: white;
          border-left: 4px solid #3498db;
        }

        /* 🔹 Fixed logout button */
        .logout-btn {
          position: fixed;
          bottom: 20px;
          left: 20px;
          width: 240px;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 10px;
          padding: 12px;
          background: rgba(231, 76, 60, 0.8);
          border: none;
          color: #fff;
          border-radius: 9999px;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.3s ease;
        }
        .logout-btn:hover {
          background: rgba(231, 76, 60, 1);
        }

        /* ===== Announcements ===== */
        .urgent-banner {
          background: #fff0f0;
          border: 1px solid #ffd6d6;
          color: #b71c1c;
          padding: 14px 16px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 18px;
          box-shadow: 0 6px 20px rgba(183, 28, 28, 0.08);
        }
        .urgent-left {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .urgent-left strong {
          letter-spacing: 0.5px;
        }
        .urgent-time {
          font-size: 12px;
          color: #8b0000;
        }

        .ann-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .ann-item {
          background: #fafbfc;
          border: 1px solid #eef1f4;
          border-radius: 12px;
          padding: 14px;
        }
        .ann-item.ann-urgent {
          background: #fff7f7;
          border-color: #ffd6d6;
        }
        .ann-top {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 6px;
        }
        .ann-subject {
          font-weight: 700;
          color: #2c3e50;
        }
        .ann-time {
          color: #7f8c8d;
          font-size: 12px;
        }
        .ann-body {
          color: #4d6273;
          margin: 6px 0 10px;
          white-space: pre-wrap;
          line-height: 1.5;
        }
        .ann-meta {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .ann-by {
          color: #6b7f90;
          font-size: 12px;
        }

        .main-content {
          flex: 1;
          padding: 30px;
          overflow-y: auto;
        }
        .content-header {
          margin-bottom: 30px;
        }
        .content-header h1 {
          font-size: 28px;
          color: #2c3e50;
          margin: 0 0 5px 0;
          font-weight: 700;
        }
        .content-header p {
          color: #7f8c8d;
          margin: 0;
          font-size: 16px;
        }

        /* Cards / commons */
        .card {
          background: white;
          padding: 20px;
          border-radius: 15px;
          box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1);
          margin-bottom: 24px;
        }
        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .subcard {
          background: #fafbfc;
          padding: 16px;
          border-radius: 12px;
          margin-bottom: 12px;
        }
        .empty,
        .no-data {
          text-align: center;
          color: #7f8c8d;
          padding: 20px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 5px 20px rgba(0, 0, 0, 0.05);
        }
        .error-box {
          background: #fff2f0;
          color: #c0392b;
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
        }

        /* Buttons */
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          font-weight: 600;
        }
        .btn.primary,
        .primary-btn {
          background: #3498db;
          color: #fff;
        }
        .btn.primary:hover,
        .primary-btn:hover {
          background: #2980b9;
        }
        .btn.secondary,
        .secondary-btn {
          background: #ecf0f1;
          color: #2c3e50;
        }
        .btn.secondary:hover,
        .secondary-btn:hover {
          background: #e2e7ea;
        }
        .btn.success {
          background: #27ae60;
          color: #fff;
        }
        .btn.success:hover {
          background: #1f8a4d;
        }
        .btn.danger {
          background: #e74c3c;
          color: #fff;
        }
        .btn.danger:hover {
          background: #c0392b;
        }
        .btn.info {
          background: #16a085;
          color: #fff;
        }
        .btn.info:hover {
          background: #12806a;
        }
        .btn.icon {
          padding: 6px 8px;
          background: #ecf0f1;
        }

        /* 🔹 Rounded check-in/out buttons */
        .primary-btn {
          border-radius: 9999px;
          padding: 10px 20px;
          font-weight: 600;
        }

        .table-wrap {
          overflow-x: auto;
          border-radius: 12px;
          border: 1px solid #eef1f4;
        }
        .table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
        }
        .table thead th {
          background: #f7f9fc;
          color: #2c3e50;
          text-align: left;
          padding: 12px;
          font-weight: 700;
          border-bottom: 1px solid #eef1f4;
        }
        .table tbody td {
          padding: 12px;
          border-bottom: 1px solid #f0f2f5;
          color: #34495e;
        }
        .table-actions {
          display: flex;
          gap: 8px;
        }

        /* Dashboard section */
        .welcome-card {
          background: white;
          padding: 30px;
          border-radius: 15px;
          box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1);
          margin-bottom: 30px;
          text-align: center;
        }
        .welcome-card h2 {
          color: #2c3e50;
          margin: 0 0 10px 0;
        }
        .welcome-card p {
          color: #7f8c8d;
          margin: 0 0 20px 0;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }
        .stat-card {
          background: white;
          padding: 25px;
          border-radius: 15px;
          box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1);
          text-align: center;
        }
        .stat-card h3 {
          font-size: 32px;
          color: #3498db;
          margin: 0 0 10px 0;
          font-weight: 700;
        }

        /* Section header */
        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .section-header h2 {
          color: #2c3e50;
          margin: 0;
          font-size: 24px;
        }
        .task-count {
          background: #3498db;
          color: white;
          padding: 5px 12px;
          border-radius: 20px;
          font-size: 14px;
        }

        /* Tasks */
        .tasks-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 20px;
        }
        .task-card {
          background: white;
          padding: 20px;
          border-radius: 15px;
          box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1);
        }
        .task-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 15px;
        }
        .task-header h3 {
          overflow-wrap: anywhere; /* just in case the title is one long token */
          word-break: break-word;
        }
        .task-actions {
          display: flex;
          gap: 8px;
        }
        .action-btn {
          background: #f8f9fa;
          border: none;
          padding: 8px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        .action-btn:hover {
          background: #e9ecef;
        }
        .action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .task-description {
          /* existing: color, margin, line-height ... */
          overflow-wrap: anywhere; /* breaks very long words/strings */
          word-break: break-word; /* legacy fallback */
          white-space: pre-wrap; /* keep user newlines but still wrap */
          max-width: 100%;
          display: -webkit-box;
          -webkit-line-clamp: 4; /* show up to 4 lines */
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .task-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 15px;
        }
        .priority-badge,
        .status-badge {
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        }
        .priority-high {
          background: #ffeaea;
          color: #e74c3c;
        }
        .priority-medium {
          background: #fff3cd;
          color: #f39c12;
        }
        .priority-low {
          background: #e8f5e8;
          color: #27ae60;
        }
        .status-completed {
          background: #e8f5e8;
          color: #27ae60;
        }
        .status-in-progress {
          background: #e3f2fd;
          color: #1976d2;
        }
        .status-pending {
          background: #fff3cd;
          color: #f39c12;
        }
        .due-date {
          background: #f8f9fa;
          color: #6c757d;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
        }
        .progress-updates {
          border-top: 1px solid #eee;
          padding-top: 15px;
        }
        .progress-item {
          background: #f8f9fa;
          padding: 10px;
          border-radius: 8px;
          margin-bottom: 8px;
        }
        .progress-time {
          font-size: 11px;
          color: #7f8c8d;
        }

        /* Attendance */
        .records-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .record-item {
          background: white;
          padding: 15px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .record-type {
          padding: 5px 12px;
          border-radius: 15px;
          font-size: 12px;
          font-weight: 600;
        }
        .record-type.checkin {
          background: #e8f5e8;
          color: #27ae60;
        }
        .record-type.checkout {
          background: #ffeaea;
          color: #e74c3c;
        }
        .record-time {
          color: #7f8c8d;
          font-size: 14px;
        }

        /* Lunch */
        .lunch-cards {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
        }
        .lunch-card {
          background: white;
          padding: 20px;
          border-radius: 15px;
          box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1);
          text-align: center;
        }
        .lunch-time {
          font-size: 18px;
          color: #3498db;
          margin: 0 0 10px 0;
          font-weight: 600;
        }
        .lunch-days {
          color: #7f8c8d;
          margin: 0;
        }

        /* Holidays self view */
        .holidays-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .holiday-item {
          background: white;
          padding: 20px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
        .holiday-date {
          color: #2c3e50;
          font-weight: 600;
          margin-bottom: 5px;
        }
        .holiday-description {
          color: #7f8c8d;
          margin: 0;
        }

        /* Admin banner */
        .admin-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .admin-banner h2 {
          margin: 0;
        }
        .admin-section .card h3,
        .admin-section .card h4 {
          margin: 0;
        }

        /* Forms */
        .form.grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
        }
        .grid-2 {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .field label {
          font-weight: 600;
          color: #2c3e50;
        }
        .input,
        .textarea,
        select {
          padding: 10px 12px;
          border: 1px solid #e0e6ed;
          border-radius: 8px;
          background: #fff;
          color: #2c3e50;
        }
        .textarea {
          min-height: 110px;
          resize: vertical;
        }
        .actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 8px;
        }
        .checkbox-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 8px;
          margin-top: 8px;
        }
        .checkbox-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        /* Badges */
        .badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
        }
        .badge-red {
          background: #ffeaea;
          color: #e74c3c;
        }
        .badge-amber {
          background: #fff3cd;
          color: #f39c12;
        }
        .badge-green {
          background: #e8f5e8;
          color: #27ae60;
        }
        .badge-cyan {
          background: #e3f2fd;
          color: #1976d2;
        }
        .badge-gray {
          background: #ecf0f1;
          color: #7f8c8d;
        }

        /* Modal */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .modal {
          background: white;
          padding: 30px;
          border-radius: 15px;
          width: 90%;
          max-width: 600px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        }
        .camera-modal {
          background: white;
          border-radius: 15px;
          width: 100%;
          max-width: 600px;
          max-height: 90vh;
          overflow: hidden;
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid #eee;
        }
        .modal-header h3 {
          margin: 0;
          color: #2c3e50;
        }
        .close-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: #7f8c8d;
          padding: 5px;
          border-radius: 4px;
        }
        .close-btn:hover {
          background: #f8f9fa;
        }
        .camera-content {
          padding: 20px;
          max-height: calc(90vh - 80px);
          overflow-y: auto;
        }

        /* Holidays admin list */
        .hm-ul {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .hm-li {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          background: #fff;
          border: 1px solid #eef1f4;
          border-radius: 12px;
          padding: 12px 14px;
        }
        .hm-li-main {
          display: flex;
          flex-direction: column;
        }
        .hm-desc {
          margin: 6px 0 0;
          color: #5a6c7d;
        }
      `}</style>
    </div>
  );
}
