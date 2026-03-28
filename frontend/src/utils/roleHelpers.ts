export const getRoleColor = (role: string): string => {
  switch (role) {
    case 'admin': return '#e74c3c';
    case 'manager': return '#f39c12';
    case 'accountant': return '#3498db';
    case 'viewer': return '#95a5a6';
    default: return '#636e72';
  }
};

export const getRoleName = (role: string): string => {
  switch (role) {
    case 'admin': return 'Admin';
    case 'manager': return 'Manager';
    case 'accountant': return 'Buchhalter';
    case 'viewer': return 'Nur Lesen';
    default: return role;
  }
};

export const getRoleIcon = (role: string): 'shield-checkmark' | 'briefcase' | 'calculator' | 'eye' => {
  switch (role) {
    case 'admin': return 'shield-checkmark';
    case 'manager': return 'briefcase';
    case 'accountant': return 'calculator';
    default: return 'eye';
  }
};
