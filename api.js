const API = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/$/, '');
const API_ORIGIN = API.replace(/\/api$/, '');

export async function request(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...(options.body instanceof FormData ? {} : {'Content-Type':'application/json'}), ...(token ? {Authorization:`Bearer ${token}`} : {}), ...options.headers };
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export function assetUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}

export { API, API_ORIGIN };
