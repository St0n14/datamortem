import type {
  Case,
  Evidence,
  AnalysisModule,
  TaskRun,
  IndexTaskRunRequest,
  IndexTaskRunResponse,
  SearchRequest,
  SearchResponse,
  AggregateRequest,
  TimelineRequest,
  IndexStats,
} from '../types';

const API_BASE_URL = 'http://localhost:8000/api';

/**
 * Get the authentication token from localStorage
 */
const getToken = (): string | null => {
  return localStorage.getItem('auth_token');
};

// Helper function for API calls with authentication support
async function fetchAPI<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const token = getToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options?.headers,
  };

  // Add authorization header if token exists
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // If unauthorized, clear token and reload (will redirect to login)
  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('auth_token');
    window.location.reload();
    throw new Error('Authentication required');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

// Cases API
export const casesAPI = {
  list: () => fetchAPI<Case[]>('/cases'),

  create: (data: { case_id: string; note?: string }) =>
    fetchAPI<Case>('/cases', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (caseId: string, data: { note?: string; status?: string }) =>
    fetchAPI<Case>(`/cases/${caseId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (caseId: string) =>
    fetchAPI<void>(`/cases/${caseId}`, {
      method: 'DELETE',
    }),
};

// Evidence API
export const evidenceAPI = {
  list: (caseId?: string) => {
    const params = caseId ? `?case_id=${caseId}` : '';
    return fetchAPI<Evidence[]>(`/evidences${params}`);
  },

  create: (data: { evidence_uid: string; case_id: string; local_path: string }) =>
    fetchAPI<Evidence>('/evidences', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  upload: async (file: File, evidenceUid: string, caseId: string) => {
    const token = getToken();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('evidence_uid', evidenceUid);
    formData.append('case_id', caseId);

    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/evidences/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('auth_token');
      window.location.reload();
      throw new Error('Authentication required');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
  },
};

// Pipeline API
export const pipelineAPI = {
  listModules: (evidenceUid?: string) => {
    const params = evidenceUid ? `?evidence_uid=${evidenceUid}` : '';
    return fetchAPI<AnalysisModule[]>(`/pipeline${params}`);
  },

  run: (data: { module_id: number; evidence_uid: string }) =>
    fetchAPI<TaskRun>('/pipeline/run', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listRuns: (evidenceUid?: string) => {
    const params = evidenceUid ? `?evidence_uid=${evidenceUid}` : '';
    return fetchAPI<TaskRun[]>(`/pipeline/runs${params}`);
  },
};

// Indexing API
export const indexingAPI = {
  indexTaskRun: (data: IndexTaskRunRequest) =>
    fetchAPI<IndexTaskRunResponse>('/indexing/task-run', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  indexCase: (data: { case_id: string; force_reindex?: boolean }) =>
    fetchAPI<{ status: string; message: string }>('/indexing/case', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getCaseSummary: (caseId: string) =>
    fetchAPI<{
      case_id: string;
      total_task_runs: number;
      indexed_count: number;
      not_indexed_count: number;
    }>(`/indexing/case/${caseId}/summary`),
};

// Search API
export const searchAPI = {
  query: (data: SearchRequest) =>
    fetchAPI<SearchResponse>('/search/query', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  aggregate: (data: AggregateRequest) =>
    fetchAPI<{ aggregations: Record<string, any> }>('/search/aggregate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  timeline: (data: TimelineRequest) =>
    fetchAPI<{ timeline: any[] }>('/search/timeline', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  stats: (caseId: string) =>
    fetchAPI<IndexStats>(`/search/stats/${caseId}`),

  health: () =>
    fetchAPI<{ status: string; cluster: string }>('/search/health'),
};
