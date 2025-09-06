export const defaultRoles = {
  ADMIN: {
    name: 'Admin',
    department: 'Administration',
    permissions: {
      canCheckIn: true,
      canManageEmployees: true,
      canManageDepartments: true,
      canManageRoles: true,
      canAssignTasks: true,
      canViewAllTasks: true,
      canViewReports: true
    }
  },
  CTO: {
    name: 'CTO',
    department: 'Technology',
    permissions: {
      canCheckIn: true,
      canManageEmployees: true,
      canManageDepartments: false,
      canManageRoles: false,
      canAssignTasks: true,
      canViewAllTasks: true,
      canViewReports: true
    }
  },
  HR_MANAGER: {
    name: 'HR Manager',
    department: 'Human Resources',
    permissions: {
      canCheckIn: true,
      canManageEmployees: true,
      canManageDepartments: false,
      canManageRoles: false,
      canAssignTasks: true,
      canViewAllTasks: false,
      canViewReports: true
    }
  },
  MANAGER: {
    name: 'Manager',
    department: 'General',
    permissions: {
      canCheckIn: true,
      canManageEmployees: false,
      canManageDepartments: false,
      canManageRoles: false,
      canAssignTasks: true,
      canViewAllTasks: false,
      canViewReports: false
    }
  },
  EMPLOYEE: {
    name: 'Employee',
    department: 'General',
    permissions: {
      canCheckIn: true,
      canManageEmployees: false,
      canManageDepartments: false,
      canManageRoles: false,
      canAssignTasks: false,
      canViewAllTasks: false,
      canViewReports: false
    }
  },
  INTERN: {
    name: 'Intern',
    department: 'General',
    permissions: {
      canCheckIn: true,
      canManageEmployees: false,
      canManageDepartments: false,
      canManageRoles: false,
      canAssignTasks: false,
      canViewAllTasks: false,
      canViewReports: false
    }
  }
};

export const defaultDepartments = [
  { name: 'Administration', description: 'Administrative department' },
  { name: 'Technology', description: 'IT and Technology department' },
  { name: 'Human Resources', description: 'HR department' },
  { name: 'Marketing', description: 'Digital Marketing department' },
  { name: 'Finance', description: 'Finance and Accounting department' },
  { name: 'Operations', description: 'Operations department' },
  { name: 'General', description: 'General department' }
];