const DEFAULT_API_URL = 'http://localhost:5000';

export const appConfig = Object.freeze({
  apiUrl: (import.meta.env.VITE_API_URL ?? DEFAULT_API_URL).replace(/\/$/, ''),
});
