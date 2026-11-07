const TOKEN_KEY = 'raisingGameToken';

function authToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export async function requestCanvasJson(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  const token = authToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { error: text }; }
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || payload.message || payload.detail || `请求失败 (${response.status})`);
  }
  return payload;
}
