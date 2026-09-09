export const $ = (selector) => document.querySelector(selector);
export const $$ = (selector) => [...document.querySelectorAll(selector)];

const csrfToken = () =>
  document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('ttrpg_csrf='))
    ?.split('=')[1] || '';

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.method && options.method !== 'GET') {
    headers['X-CSRF-Token'] = csrfToken();
  }

  const response = await fetch('/api' + path, { ...options, headers });
  const data = await response.json().catch(() => ({ error: 'Respuesta inválida' }));
  if (!response.ok) throw new Error(data.error || 'Error');
  return data;
}

export function toast(text) {
  const element = $('#toast');
  element.textContent = text;
  element.classList.add('show');
  clearTimeout(element.timeout);
  element.timeout = setTimeout(() => element.classList.remove('show'), 2500);
}

export function esc(value) {
  return String(value ?? '').replace(
    /[&<>'"]/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character],
  );
}
