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

// Helper function for API calls
async function fetchAPI<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

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
