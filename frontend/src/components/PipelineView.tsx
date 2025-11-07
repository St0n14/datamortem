import { useState, useEffect } from 'react';
import { Play, Database, Check, X, Clock, Loader, AlertCircle } from 'lucide-react';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';

// Types
interface AnalysisModule {
  id: number;
  name: string;
  tool: string;
  description: string | null;
  enabled: boolean;
}

interface TaskRun {
  id: number;
  task_name: string;
  evidence_uid: string;
  status: 'queued' | 'running' | 'success' | 'error';
  celery_task_id: string | null;
  output_path: string | null;
  error_message: string | null;
  module_id: number | null;
  module?: AnalysisModule;
  created_at: string;
  updated_at: string;
  indexed: boolean;
}

interface PipelineViewProps {
  selectedEvidenceUid: string | null;
  darkMode: boolean;
}

export function PipelineView({ selectedEvidenceUid, darkMode }: PipelineViewProps) {
  const [modules, setModules] = useState<AnalysisModule[]>([]);
  const [taskRuns, setTaskRuns] = useState<TaskRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningTasks, setRunningTasks] = useState<Set<number>>(new Set());
  const [indexingTasks, setIndexingTasks] = useState<Set<number>>(new Set());

  const textWeak = darkMode ? 'text-slate-500' : 'text-gray-500';
  const textStrong = darkMode ? 'text-slate-100' : 'text-gray-900';
  const borderColor = darkMode ? 'border-slate-700' : 'border-gray-200';

  useEffect(() => {
    if (selectedEvidenceUid) {
      loadModules(selectedEvidenceUid);
      loadTaskRuns(selectedEvidenceUid);
    }
  }, [selectedEvidenceUid]);

  // Poll task runs every 3 seconds for running tasks
  useEffect(() => {
    if (selectedEvidenceUid && runningTasks.size > 0) {
      const interval = setInterval(() => loadTaskRuns(selectedEvidenceUid), 3000);
      return () => clearInterval(interval);
    }
  }, [selectedEvidenceUid, runningTasks.size]);

  const loadModules = async (evidenceUid: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pipeline?evidence_uid=${encodeURIComponent(evidenceUid)}`);
      const data = await res.json();
      setModules(data);
    } catch (error) {
      console.error('Failed to load modules:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTaskRuns = async (evidenceUid: string) => {
    try {
      const res = await fetch(`/api/pipeline/runs?evidence_uid=${encodeURIComponent(evidenceUid)}`);
      const data = await res.json();
      setTaskRuns(data);

      // Update running tasks
      const running = new Set<number>();
      data.forEach((task: TaskRun) => {
        if (task.status === 'running' || task.status === 'queued') {
          running.add(task.id);
        }
      });
      setRunningTasks(running);
    } catch (error) {
      console.error('Failed to load task runs:', error);
    }
  };

  const handleRunModule = async (moduleId: number) => {
    if (!selectedEvidenceUid) return;

    try {
      const res = await fetch('/api/pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module_id: moduleId,
          evidence_uid: selectedEvidenceUid,
        }),
      });

      if (!res.ok) throw new Error('Failed to run module');

      const taskRun = await res.json();
      setRunningTasks((prev) => new Set(prev).add(taskRun.task_run_id));
      loadTaskRuns(selectedEvidenceUid);
    } catch (error) {
      console.error('Failed to run module:', error);
    }
  };

  const handleIndexTaskRun = async (taskRunId: number) => {
    if (!selectedEvidenceUid) return;

    try {
      setIndexingTasks((prev) => new Set(prev).add(taskRunId));

      const res = await fetch('/api/indexing/task-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_run_id: taskRunId }),
      });

      if (!res.ok) throw new Error('Failed to index task run');

      // Refresh task runs after 2 seconds
      setTimeout(() => loadTaskRuns(selectedEvidenceUid), 2000);
    } catch (error) {
      console.error('Failed to index task run:', error);
    } finally {
      setIndexingTasks((prev) => {
        const next = new Set(prev);
        next.delete(taskRunId);
        return next;
      });
    }
  };

  const getStatusBadge = (status: TaskRun['status']) => {
    const badges = {
      success: darkMode
        ? 'bg-emerald-600/10 text-emerald-300 border-emerald-500/30'
        : 'bg-emerald-100 text-emerald-700 border-emerald-300',
      error: darkMode
        ? 'bg-rose-600/10 text-rose-300 border-rose-500/30'
        : 'bg-rose-100 text-rose-700 border-rose-300',
      running: darkMode
        ? 'bg-sky-600/10 text-sky-300 border-sky-500/30'
        : 'bg-sky-100 text-sky-700 border-sky-300',
      queued: darkMode
        ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
        : 'bg-amber-100 text-amber-700 border-amber-300',
    };
    return badges[status];
  };

  const getStatusIcon = (status: TaskRun['status']) => {
    switch (status) {
      case 'success':
        return <Check className="h-3 w-3" />;
      case 'error':
        return <X className="h-3 w-3" />;
      case 'running':
        return <Loader className="h-3 w-3 animate-spin" />;
      case 'queued':
        return <Clock className="h-3 w-3" />;
    }
  };

  const getTaskRunsForModule = (moduleId: number) => {
    return taskRuns.filter((tr) => tr.module_id === moduleId);
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className={`text-sm ${textWeak}`}>Loading pipeline...</div>
      </div>
    );
  }

  if (!selectedEvidenceUid) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className={`h-12 w-12 mx-auto mb-3 ${textWeak}`} />
        <div className={`text-sm ${textWeak}`}>No evidence selected</div>
      </div>
    );
  }

  return (
    <div className={`p-6 space-y-6 text-[12px] ${darkMode ? 'text-slate-200' : 'text-gray-800'}`}>
      {/* Modules Grid */}
      {modules.length > 0 ? (
        <div>
          <div className={`text-[10px] font-medium uppercase tracking-wide mb-4 ${textWeak}`}>
            Available Modules ({modules.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {modules.map((module) => {
              const moduleTaskRuns = getTaskRunsForModule(module.id);
              const lastRun = moduleTaskRuns[0];

              return (
                <div
                  key={module.id}
                  className={`rounded-lg border p-4 ${
                    darkMode
                      ? 'bg-slate-900 border-slate-700'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className={`font-semibold ${textStrong}`}>
                        {module.name}
                      </div>
                      {module.description && (
                        <div className={`text-[11px] mt-1 ${textWeak}`}>
                          {module.description}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      onClick={() => handleRunModule(module.id)}
                      disabled={!module.enabled}
                      className={`h-7 px-3 text-[11px] ${
                        darkMode
                          ? 'border-violet-600/30 bg-violet-950/40 text-violet-200 hover:bg-violet-900/30 disabled:opacity-50'
                          : 'border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-50'
                      }`}
                    >
                      <Play className="h-3 w-3 mr-1" />
                      Run
                    </Button>

                    {lastRun && (
                      <>
                        <Badge
                          className={`rounded-md text-[10px] border flex items-center gap-1 ${getStatusBadge(
                            lastRun.status
                          )}`}
                        >
                          {getStatusIcon(lastRun.status)}
                          {lastRun.status}
                        </Badge>

                        {lastRun.status === 'success' &&
                          (lastRun.indexed ? (
                            <Badge
                              className={`rounded-md text-[10px] border flex items-center gap-1 ${
                                darkMode
                                  ? 'bg-emerald-600/10 text-emerald-300 border-emerald-500/30'
                                  : 'bg-emerald-100 text-emerald-700 border-emerald-300'
                              }`}
                            >
                              <Database className="h-3 w-3" />
                              Indexed
                            </Badge>
                          ) : (
                            <Button
                              onClick={() => handleIndexTaskRun(lastRun.id)}
                              disabled={indexingTasks.has(lastRun.id)}
                              className={`h-7 px-3 text-[11px] ${
                                darkMode
                                  ? 'border-emerald-600/30 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-900/30 disabled:opacity-50'
                                  : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50'
                              }`}
                            >
                              {indexingTasks.has(lastRun.id) ? (
                                <>
                                  <Loader className="h-3 w-3 mr-1 animate-spin" />
                                  Indexing...
                                </>
                              ) : (
                                <>
                                  <Database className="h-3 w-3 mr-1" />
                                  Index
                                </>
                              )}
                            </Button>
                          ))}
                      </>
                    )}
                  </div>

                  {moduleTaskRuns.length > 0 && (
                    <div className={`mt-3 pt-3 border-t ${borderColor}`}>
                      <div className={`text-[10px] font-medium uppercase tracking-wide mb-2 ${textWeak}`}>
                        Recent Runs ({moduleTaskRuns.length})
                      </div>
                      <div className="space-y-1">
                        {moduleTaskRuns.slice(0, 3).map((tr) => (
                          <div
                            key={tr.id}
                            className="flex justify-between items-center text-[11px]"
                          >
                            <span className="flex items-center gap-1">
                              {getStatusIcon(tr.status)} #{tr.id}
                            </span>
                            <span className={textWeak}>
                              {new Date(tr.created_at).toLocaleTimeString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <AlertCircle className={`h-12 w-12 mx-auto mb-3 ${textWeak}`} />
          <div className={`text-sm ${textWeak}`}>No modules available</div>
          <div className={`text-[11px] mt-2 ${textWeak}`}>
            Run <code className={`px-1 py-0.5 rounded ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
              uv run python -m app.seed_modules
            </code> to create modules
          </div>
        </div>
      )}

      {/* Task Runs Table */}
      {taskRuns.length > 0 && (
        <div>
          <div className={`text-[10px] font-medium uppercase tracking-wide mb-4 ${textWeak}`}>
            All Task Runs ({taskRuns.length})
          </div>
          <div className={`rounded-lg border overflow-hidden ${
            darkMode ? 'border-slate-700' : 'border-gray-200'
          }`}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead
                  className={`text-[10px] uppercase tracking-wide border-b ${
                    darkMode
                      ? 'bg-slate-900 text-slate-500 border-slate-700'
                      : 'bg-white text-gray-500 border-gray-200'
                  }`}
                >
                  <tr>
                    <th className="px-4 py-2">ID</th>
                    <th className="px-4 py-2">Module</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Indexed</th>
                    <th className="px-4 py-2">Created</th>
                    <th className="px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className={darkMode ? 'divide-y divide-slate-800' : 'divide-y divide-gray-100'}>
                  {taskRuns.map((taskRun) => (
                    <tr
                      key={taskRun.id}
                      className={darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50'}
                    >
                      <td className={`px-4 py-2 text-[11px] ${textWeak}`}>#{taskRun.id}</td>
                      <td className={`px-4 py-2 text-[11px] font-medium ${textStrong}`}>
                        {taskRun.module?.name || taskRun.task_name}
                      </td>
                      <td className="px-4 py-2">
                        <Badge
                          className={`rounded-md text-[10px] border flex items-center gap-1 inline-flex ${getStatusBadge(
                            taskRun.status
                          )}`}
                        >
                          {getStatusIcon(taskRun.status)}
                          {taskRun.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        {taskRun.indexed ? (
                          <Badge
                            className={`rounded-md text-[10px] border ${
                              darkMode
                                ? 'bg-emerald-600/10 text-emerald-300 border-emerald-500/30'
                                : 'bg-emerald-100 text-emerald-700 border-emerald-300'
                            }`}
                          >
                            Yes
                          </Badge>
                        ) : taskRun.status === 'success' ? (
                          <Badge
                            className={`rounded-md text-[10px] border ${
                              darkMode
                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                : 'bg-amber-100 text-amber-700 border-amber-300'
                            }`}
                          >
                            No
                          </Badge>
                        ) : (
                          <span className={`text-[11px] ${textWeak}`}>-</span>
                        )}
                      </td>
                      <td className={`px-4 py-2 text-[11px] ${textWeak}`}>
                        {new Date(taskRun.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2">
                        {taskRun.status === 'success' && !taskRun.indexed && (
                          <Button
                            onClick={() => handleIndexTaskRun(taskRun.id)}
                            disabled={indexingTasks.has(taskRun.id)}
                            className={`h-6 px-2 text-[11px] ${
                              darkMode
                                ? 'border-emerald-600/30 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-900/30'
                                : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            {indexingTasks.has(taskRun.id) ? (
                              <>
                                <Loader className="h-3 w-3 animate-spin" />
                              </>
                            ) : (
                              <>
                                <Database className="h-3 w-3 mr-1" />
                                Index
                              </>
                            )}
                          </Button>
                        )}
                        {taskRun.status === 'error' && (
                          <Button
                            onClick={() => alert(taskRun.error_message || 'No error message')}
                            className={`h-6 px-2 text-[11px] ${
                              darkMode
                                ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                                : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100'
                            }`}
                          >
                            View Error
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
