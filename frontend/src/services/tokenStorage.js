/**
 * Quản lý Token & Auth Events độc lập - Không import chéo để tránh Circular Dependency
 */

export function getAccessToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
}

export function getRefreshToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('refreshToken') || '';
}

export function setTokens({ accessToken, token, refreshToken } = {}) {
  if (typeof window === 'undefined') return;
  const access = accessToken || token;
  if (access) {
    localStorage.setItem('accessToken', access);
    localStorage.setItem('token', access);
  }
  if (refreshToken) {
    localStorage.setItem('refreshToken', refreshToken);
  }
}

export function clearTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
}

export function getAuthHeaders() {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function dispatchAuthExpired() {
  if (typeof window === 'undefined') return;
  const pathname = window.location.pathname || '';
  const isPublic = ['/login', '/register', '/welcome', '/forgot-password'].some(p => pathname.startsWith(p));
  const hasToken = Boolean(getAccessToken());
  if (!isPublic && hasToken) {
    window.dispatchEvent(new Event('auth-expired'));
  }
}
