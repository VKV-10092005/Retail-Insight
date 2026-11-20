import { fetchWithRetry } from './fetchWithRetry.js';
import { authApiUrl } from './apiUrl.js';
import { getAuthHeaders } from './tokenStorage.js';

export async function authRequest(path, { method = 'GET', body } = {}) {
  const res = await fetchWithRetry(authApiUrl(path), {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Requested-With': 'retail-web',
      ...getAuthHeaders()
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) {
    if (res.status === 423 && data?.code === 'ACCOUNT_TEMP_LOCKED') {
      window.dispatchEvent(new CustomEvent('account-temp-locked', { detail: data }));
    }
    const error = new Error(data?.message || 'Không thể kết nối dịch vụ');
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}
