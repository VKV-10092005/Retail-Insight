/**
 * Cấu hình tập trung 5 Role thực tế trong hệ thống Retail Insight
 * Khớp chính xác với ENUM('OWNER','MANAGER','INVENTORY','CASHIER','PLATFORM_ADMIN') trong MySQL retail_app
 */

export const ROLES = {
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  INVENTORY: 'INVENTORY',
  CASHIER: 'CASHIER',
  PLATFORM_ADMIN: 'PLATFORM_ADMIN'
};

export const ROLE_LABELS = {
  [ROLES.OWNER]: 'Chủ cửa hàng',
  [ROLES.MANAGER]: 'Quản lý chi nhánh',
  [ROLES.INVENTORY]: 'Nhân viên kho',
  [ROLES.CASHIER]: 'Nhân viên thu ngân',
  [ROLES.PLATFORM_ADMIN]: 'Quản trị nền tảng'
};

// Alias tương thích ngược cho các component hiện có
export const roles = ROLE_LABELS;

export const DEFAULT_ROUTES = {
  [ROLES.OWNER]: '/',
  [ROLES.MANAGER]: '/',
  [ROLES.INVENTORY]: '/inventory',
  [ROLES.CASHIER]: '/sales',
  [ROLES.PLATFORM_ADMIN]: '/admin'
};

export function getDefaultRoute(role) {
  return DEFAULT_ROUTES[role] || '/';
}

export const ROLE_ALLOWED_ROUTES = {
  [ROLES.OWNER]: [
    '/',
    '/reports',
    '/sales',
    '/sales/history',
    '/products',
    '/products/new',
    '/inventory',
    '/receipts',
    '/stock-operations',
    '/forecast',
    '/forecast/total',
    '/forecast/multi',
    '/alerts',
    '/replenishment',
    '/branches',
    '/users',
    '/staff',
    '/support',
    '/agency-profile',
    '/profile',
    '/settings',
    '/guide',
    '/change-password',
    '/market',
    '/assistant'
  ],
  [ROLES.MANAGER]: [
    '/',
    '/reports',
    '/sales',
    '/sales/history',
    '/products',
    '/products/new',
    '/inventory',
    '/receipts',
    '/stock-operations',
    '/forecast',
    '/forecast/total',
    '/forecast/multi',
    '/alerts',
    '/replenishment',
    '/support',
    '/agency-profile',
    '/profile',
    '/settings',
    '/guide',
    '/change-password',
    '/market',
    '/assistant'
  ],
  [ROLES.INVENTORY]: [
    '/inventory',
    '/receipts',
    '/stock-operations',
    '/products',
    '/products/new',
    '/support',
    '/agency-profile',
    '/profile',
    '/settings',
    '/guide',
    '/change-password'
  ],
  [ROLES.CASHIER]: [
    '/sales',
    '/sales/history',
    '/products',
    '/products/new',
    '/support',
    '/agency-profile',
    '/profile',
    '/settings',
    '/guide',
    '/change-password'
  ],
  [ROLES.PLATFORM_ADMIN]: [
    '/admin',
    '/admin/tickets',
    '/admin/system',
    '/admin/security',
    '/research',
    '/support',
    '/agency-profile',
    '/profile',
    '/settings',
    '/change-password'
  ]
};

export function isRouteAllowed(role, pathname) {
  if (!role) return false;
  const allowed = ROLE_ALLOWED_ROUTES[role];
  if (!allowed) return false;
  // Chuẩn hóa path: bỏ trailing slash nếu có (trừ '/')
  const normalized = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return allowed.includes(normalized);
}
