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
  Script,
  ScriptSummary,
  Rule,
} from '../types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:8080/api';

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
  if (response.status === 401) {
    localStorage.removeItem('auth_token');
    window.location.reload();
    throw new Error('Authentication required');
  }

  if (response.status === 403) {
    const errorBody = await response.json().catch(() => ({ detail: 'Forbidden' }));
    throw new Error(errorBody.detail || 'Forbidden');
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
    fetchAPI<{ task_run_id: number; status: string }>('/pipeline/run', {
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

// Scripts API
export const scriptsAPI = {
  list: () => fetchAPI<Script[]>('/scripts'),

  create: (data: {
    name: string;
    description?: string;
    language: 'python' | 'perl' | 'rust';
    source_code: string;
    python_version?: string;
    requirements?: string;
  }) =>
    fetchAPI<Script>('/scripts', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        python_version: data.python_version ?? '3.11',
        requirements: data.requirements,
      }),
    }),

  get: (scriptId: number) => fetchAPI<Script>(`/scripts/${scriptId}`),

  run: (scriptId: number, payload: { evidence_uid: string }) =>
    fetchAPI<{ task_run_id: number; status: string; evidence_uid: string; script_id: number | null; celery_task_id?: string | null }>(
      `/scripts/${scriptId}/run`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  marketplace: () => fetchAPI<ScriptSummary[]>('/scripts/marketplace'),

  approve: (scriptId: number, approved = true) =>
    fetchAPI<{ id: number; is_approved: boolean }>(`/scripts/${scriptId}/approve?approved=${approved}`, {
      method: 'POST',
    }),

  assign: (scriptId: number, userId: number) =>
    fetchAPI<{ status: string; user_id: number; script_id: number }>(`/scripts/${scriptId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    }),

  importFromGitHub: (data: { repo_url: string; branch?: string; scripts_path?: string }) =>
    fetchAPI<{ status: string; imported: number; skipped: number; errors?: string[] | null }>('/scripts/import-github', {
      method: 'POST',
      body: JSON.stringify({
        repo_url: data.repo_url,
        branch: data.branch || 'main',
        scripts_path: data.scripts_path || 'scripts',
      }),
    }),

  install: (scriptId: number) =>
    fetchAPI<{ status: string; script_id: number }>(`/scripts/${scriptId}/install`, {
      method: 'POST',
    }),

  myScripts: () => fetchAPI<Script[]>('/scripts/my-scripts'),

  uninstallFromAll: (scriptId: number) =>
    fetchAPI<{ status: string; script_id: number; uninstalled_from: number }>(`/scripts/${scriptId}/uninstall-all`, {
      method: 'DELETE',
    }),
};

// Rules API
export const rulesAPI = {
  list: () => fetchAPI<Rule[]>('/rules'),
  create: (data: {
    name: string;
    logic: string;
    severity: Rule['severity'];
    tags: string[];
    scope: string;
    rule_type: Rule['rule_type'];
    applies_to: string;
  }) =>
    fetchAPI<Rule>('/rules', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Health/Status API
export interface ServiceStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  message: string;
}

export interface SystemStatus {
  api: ServiceStatus;
  postgres: ServiceStatus;
  redis: ServiceStatus;
  celery: ServiceStatus;
  opensearch: ServiceStatus;
}

export const healthAPI = {
  getStatus: () => fetchAPI<SystemStatus>('/health/status'),
};
