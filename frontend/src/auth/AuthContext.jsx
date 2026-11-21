import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authRequest } from '../services/auth';
import { authApiUrl } from '../services/apiUrl';
import { staffSessionRequest } from '../services/staff-session';
import { roles, ROLE_LABELS, ROLES, getDefaultRoute } from '../config/roles';
import { getAccessToken, getRefreshToken, getAuthHeaders, setTokens, clearTokens } from '../services/tokenStorage';

export { roles, ROLE_LABELS, ROLES, getDefaultRoute };

const Context = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [impersonating, setImpersonating] = useState(false);
  const [staffEnabled, setStaffEnabled] = useState(false);

  const clearError = useCallback(() => {
    setError('');
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await authRequest('/me');
      setUser(data.user);
      setImpersonating(data.user?.impersonating === true);
      return data.user;
    } catch (err) {
      if (err.status === 401) {
        const storedRefreshToken = getRefreshToken();
        if (storedRefreshToken) {
          try {
            const refreshRes = await authRequest('/refresh', {
              method: 'POST',
              body: { refreshToken: storedRefreshToken }
            });
            if (refreshRes?.accessToken || refreshRes?.token) {
              setTokens({
                accessToken: refreshRes.accessToken || refreshRes.token,
                refreshToken: refreshRes.refreshToken
              });
              const retryMe = await authRequest('/me');
              setUser(retryMe.user);
              setImpersonating(retryMe.user?.impersonating === true);
              return retryMe.user;
            }
          } catch {
            clearTokens();
          }
        }
      }
      throw err;
    }
  }, []);

  function updateUser(patch) {
    setUser(current => (current ? { ...current, ...patch } : current));
  }

  async function impersonateStaff(id) {
    const data = await staffSessionRequest(`/staff/${encodeURIComponent(id)}/impersonate`);
    setUser(data.user);
    setImpersonating(true);
    setError('');
    return data.user;
  }

  async function returnToOwner() {
    const data = await staffSessionRequest('/staff/impersonate/return');
    setUser(data.user);
    setImpersonating(false);
    setError('');
    return data.user;
  }

  // Khởi tạo phiên: Chỉ gọi /auth/me khi đã có token và không phải trang public
  useEffect(() => {
    const pathname = typeof window !== 'undefined' ? window.location.pathname || '' : '';
    const isPublic = ['/login', '/register', '/welcome', '/forgot-password'].some(p => pathname.startsWith(p));
    const token = getAccessToken();

    if (!isPublic && token) {
      refresh()
        .catch(e => {
          if (e.status !== 401) setError(e.message);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [refresh]);

  // Lắng nghe sự kiện hết hạn phiên
  useEffect(() => {
    const expired = () => {
      const pathname = typeof window !== 'undefined' ? window.location.pathname || '' : '';
      const isPublic = ['/login', '/register', '/welcome', '/forgot-password'].some(p => pathname.startsWith(p));
      const hasToken = Boolean(getAccessToken());

      clearTokens();
      setUser(null);
      setImpersonating(false);

      if (!isPublic && hasToken) {
        setError('Phiên đăng nhập đã hết hạn.');
      }
    };
    window.addEventListener('auth-expired', expired);
    return () => window.removeEventListener('auth-expired', expired);
  }, []);

  async function login(data) {
    setError('');
    const res = await authRequest('/login', { method: 'POST', body: data });
    setTokens({
      accessToken: res?.accessToken || res?.token,
      refreshToken: res?.refreshToken
    });
    const u = await refresh();
    return u;
  }

  async function logout({ skipServer = false } = {}) {
    const logoutRequest = skipServer ? null : fetch(authApiUrl('/logout'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Requested-With': 'retail-web', ...getAuthHeaders() }
    });
    window.dispatchEvent(new Event('auth-logout'));
    clearTokens();
    setUser(null);
    setImpersonating(false);
    setStaffEnabled(false);
    setError('');
    navigate('/login', { replace: true });
    try {
      if (logoutRequest) await logoutRequest;
    } catch {
      // Local logout is authoritative even if the server session already expired.
    }
  }

  const unavailable = () => {
    setError('Chức năng này không còn sử dụng mô phỏng. Sử dụng trang Quản lý nhân viên để quản lý nhân sự thực tế.');
    return false;
  };

  return (
    <Context.Provider
      value={{
        user,
        impersonating,
        impersonateStaff,
        returnToOwner,
        loading,
        error,
        clearError,
        login,
        logout,
        refresh,
        updateUser,
        register: async data => {
          const res = await authRequest('/register', { method: 'POST', body: data });
          setTokens({
            accessToken: res?.accessToken || res?.token,
            refreshToken: res?.refreshToken
          });
          return res;
        },
        users: user ? [user] : [],
        requests: [],
        roles,
        staffEnabled,
        setStaffEnabled,
        approve: unavailable,
        reject: unavailable,
        setRole: unavailable,
        setStatus: unavailable,
        addStaff: unavailable
      }}
    >
      {children}
    </Context.Provider>
  );
}

export const useAuth = () => {
  const c = useContext(Context);
  if (!c) throw Error('AuthProvider missing');
  return c;
};
