// API Types for Requiem

export type UserRole = 'superadmin' | 'admin' | 'analyst' | 'viewer';

export interface UserAccount {
  id: number;
  email: string;
  username: string;
  full_name?: string | null;
  role: UserRole;
  is_active: boolean;
  email_verified: boolean;
  otp_enabled: boolean;
  created_at_utc: string;
  last_login_utc?: string | null;
}

export interface Case {
  case_id: string;
  note: string | null;
  status: 'open' | 'closed';
  created_at_utc: string;
  hedgedoc_url?: string | null;
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
  status: 'queued' | 'running' | 'success' | 'error';
  celery_task_id?: string | null;
  output_path?: string | null;
  error_message?: string | null;
  module_id?: number | null;
  script_id?: number | null;
  script_name?: string | null;
  module?: AnalysisModule;
  started_at_utc?: string | null;
  ended_at_utc?: string | null;
  progress_message?: string | null;
  created_at?: string;
  updated_at?: string;
  indexed_at?: string | null;
  indexed?: boolean;
  case_id?: string;
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

export interface CaseIndexSummary {
  case_id: string;
  total_task_runs: number;
  indexed_count: number;
  not_indexed_count: number;
}

export interface Script {
  id: number;
  name: string;
  description?: string | null;
  language: string;
  python_version: string;
  requirements?: string | null;
  source_code: string;
  created_at_utc: string;
  is_approved: boolean;
  published_at?: string | null;
}

export interface ScriptSummary {
  id: number;
  name: string;
  description?: string | null;
  language: string;
  python_version: string;
  requirements?: string | null;
  is_approved: boolean;
  published_at?: string | null;
}

export interface ServiceStatusInfo {
  status: string;
  message?: string;
}

export interface AdminStats {
  users: {
    total: number;
    active_last_15m: number;
  };
  cases: {
    total: number;
    evidences: number;
  };
  task_runs: {
    total: number;
    running: number;
    queued: number;
  };
  services: Record<string, ServiceStatusInfo>;
  generated_at: string;
}

export interface Rule {
  id: number;
  name: string;
  logic: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
  scope: string;
  rule_type: 'yara' | 'custom' | 'network' | 'hayabusa' | 'sigma';
  applies_to: string;
  created_at: string;
}
