const TOKEN_KEY = 'krishichain.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

// Set by AuthContext so an expired session can clear itself from here,
// which is the only place that sees every 401.
let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';

  const token = tokenStore.get();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Could not reach the server. Check that the API is running.');
  }

  const text = await response.text();

  // A dev-proxy error page is HTML, and parsing it unconditionally turns
  // "the API is down" into "Unexpected token '<'".
  let data = null;
  if (text) {
    const isJson = (response.headers.get('content-type') || '').includes('application/json');
    if (isJson) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('The server sent a malformed response.');
      }
    } else if (!response.ok) {
      throw new Error(`The server returned ${response.status}. It may be starting up.`);
    }
  }

  if (response.status === 401 && auth && token) {
    tokenStore.clear();
    if (onUnauthorized) onUnauthorized();
    throw new Error(data?.error || 'Your session has expired. Please sign in again.');
  }

  if (!response.ok) {
    throw new Error(data?.error || `Request failed (${response.status})`);
  }
  return data;
}
