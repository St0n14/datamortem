// API Types for dataMortem

export interface Case {
  id: number;
  case_id: string;
  note: string | null;
  status: 'open' | 'closed' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface Evidence {
  id: number;
  evidence_uid: string;
  case_id: string;
  local_path: string;
  created_at: string;
}

export interface AnalysisModule {
  id: number;
  name: string;
  tool: string;
  description: string | null;
  enabled: boolean;
}

export interface TaskRun {
  id: number;
  task_name: string;
  evidence_uid: string;
  case_id: string;
  status: 'queued' | 'running' | 'success' | 'error';
  celery_task_id: string | null;
  output_path: string | null;
  error_message: string | null;
  module_id: number | null;
  module?: AnalysisModule;
  created_at: string;
  updated_at: string;
  indexed_at?: string | null;
  indexed: boolean;
}

export interface IndexTaskRunRequest {
  task_run_id: number;
}

export interface IndexTaskRunResponse {
  status: string;
  message: string;
  task_run_id: number;
  celery_task_id: string;
}

export interface SearchRequest {
  query: string;
  case_id: string;
  size?: number;
  from_?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  filters?: Record<string, any>;
}

export interface SearchHit {
  _id: string;
  _index: string;
  _score: number;
  _source: Record<string, any>;
}

export interface SearchResponse {
  hits: SearchHit[];
  total: number;
  took: number;
  max_score: number;
}

export interface AggregateRequest {
  case_id: string;
  field: string;
  size?: number;
}

export interface TimelineRequest {
  case_id: string;
  interval?: string;
  start_time?: string;
  end_time?: string;
}

export interface IndexStats {
  case_id: string;
  index_name: string;
  document_count: number;
  size_in_bytes: number;
  health: string;
}
