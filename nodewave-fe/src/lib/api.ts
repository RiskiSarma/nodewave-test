import { useAuth } from '@/stores/auth';
import axios, { type AxiosError } from 'axios';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const http = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BE_URL ?? 'http://localhost:8080',
});

http.interceptors.request.use((config) => {
  const token = useAuth.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (r) => r,
  (error: AxiosError<{ error?: { code: string; message: string; details?: unknown } }>) => {
    const status = error.response?.status ?? 0;
    const body = error.response?.data?.error;
    // Expired / revoked session -> drop it; the route guard sends the user to /login.
    if (status === 401 && useAuth.getState().token) useAuth.getState().clear();
    throw new ApiError(
      status,
      body?.code ?? (status === 0 ? 'NETWORK_ERROR' : 'ERROR'),
      body?.message ?? (status === 0 ? 'Cannot reach the server' : 'Unexpected error'),
      body?.details,
    );
  },
);

interface Envelope<T> {
  success: boolean;
  data: T;
}

export const api = {
  get: async <T>(url: string, params?: Record<string, unknown>) =>
    (await http.get<Envelope<T>>(url, { params })).data.data,
  post: async <T>(url: string, body?: unknown) =>
    (await http.post<Envelope<T>>(url, body)).data.data,
  patch: async <T>(url: string, body?: unknown) =>
    (await http.patch<Envelope<T>>(url, body)).data.data,
  delete: async <T>(url: string, params?: Record<string, unknown>) =>
    (await http.delete<Envelope<T>>(url, { params })).data.data,
};

/**
 * Standard list contract (@nodewave/prisma-ezfilter):
 * JSON-encode filters / searchFilters / rangedFilters, keep the rest as plain params.
 */
export interface ListParams {
  filters?: Record<string, unknown>;
  searchFilters?: Record<string, unknown>;
  rangedFilters?: { key: string; start: string | number; end: string | number }[];
  orderKey?: string;
  orderRule?: 'asc' | 'desc';
  page?: number;
  rows?: number;
}

export const listParams = (p: ListParams) => {
  const out: Record<string, unknown> = {};
  if (p.filters && Object.keys(p.filters).length) out.filters = JSON.stringify(p.filters);
  if (p.searchFilters && Object.keys(p.searchFilters).length)
    out.searchFilters = JSON.stringify(p.searchFilters);
  if (p.rangedFilters?.length) out.rangedFilters = JSON.stringify(p.rangedFilters);
  if (p.orderKey) out.orderKey = p.orderKey;
  if (p.orderRule) out.orderRule = p.orderRule;
  if (p.page) out.page = p.page;
  if (p.rows) out.rows = p.rows;
  return out;
};

export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong';
