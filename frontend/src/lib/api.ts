export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const url = `${BACKEND_URL}${endpoint}`;
  
  // Enforce sharing credentials/cookies for authorization
  options.credentials = 'include';
  
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  options.headers = headers;

  const res = await fetch(url, options);
  if (!res.ok) {
    let errMsg = 'Request failed';
    try {
      const data = await res.json();
      errMsg = data.error || errMsg;
    } catch (_) {}
    throw new Error(errMsg);
  }

  try {
    return await res.json();
  } catch (_) {
    return null;
  }
}
