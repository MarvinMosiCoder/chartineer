import axios from 'axios';

// Same-origin Laravel session and CSRF handling; no second backend or bearer token.
const api = axios.create({ baseURL: '/memecoin-api', timeout: 60000, headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' } });
api.interceptors.request.use(config => {
    config.url = config.url.replace(/^\/memecoin(?=\/|$)/, '');
    return config;
});
export default api;

export function errorMessage(error, fallback) {
    const data = error.response?.data;
    if (data?.errors) return Object.values(data.errors).flat().join(' ');
    return typeof data?.message === 'string' ? data.message : typeof data?.detail === 'string' ? data.detail : fallback;
}
