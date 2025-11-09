import { useState, useEffect } from 'react';
import { Play, Database, Check, X, Clock, Loader, AlertCircle, Activity } from 'lucide-react';
import { evidenceAPI, pipelineAPI, indexingAPI, scriptsAPI } from '../services/api';
import type { Evidence, AnalysisModule, TaskRun, Script } from '../types';

export default function PipelineView() {
  const [evidences, setEvidences] = useState<Evidence[]>([]);
  const [selectedEvidence, setSelectedEvidence] = useState<string>('');
  const [modules, setModules] = useState<AnalysisModule[]>([]);
  const [userScripts, setUserScripts] = useState<Script[]>([]);
  const [taskRuns, setTaskRuns] = useState<TaskRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningTasks, setRunningTasks] = useState<Set<number>>(new Set());
  const [indexingTasks, setIndexingTasks] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    loadEvidences();
    loadUserScripts();
  }, []);

  useEffect(() => {
    if (selectedEvidence) {
      loadModules();
      loadTaskRuns();
    }
  }, [selectedEvidence]);

  // Poll task runs every 3 seconds
  useEffect(() => {
    if (selectedEvidence && runningTasks.size > 0) {
      const interval = setInterval(loadTaskRuns, 3000);
      return () => clearInterval(interval);
    }
  }, [selectedEvidence, runningTasks.size]);

  const loadEvidences = async () => {
    try {
      setLoading(true);
      const data = await evidenceAPI.list();
      setEvidences(data);
      if (data.length > 0 && !selectedEvidence) {
        setSelectedEvidence(data[0].evidence_uid);
      }
    } catch (error) {
      showMessage('error', `Failed to load evidences: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const loadModules = async () => {
    try {
      const data = await pipelineAPI.listModules(selectedEvidence);
      setModules(data);
    } catch (error) {
      showMessage('error', `Failed to load modules: ${error}`);
    }
  };

  const loadUserScripts = async () => {
    try {
      const data = await scriptsAPI.myScripts();
      setUserScripts(data);
    } catch (error) {
      console.error('Failed to load user scripts:', error);
    }
  };

  const loadTaskRuns = async () => {
    try {
      const data = await pipelineAPI.listRuns(selectedEvidence);
      setTaskRuns(data);

      const running = new Set<number>();
      data.forEach((task) => {
        if (task.status === 'running' || task.status === 'queued') {
          running.add(task.id);
        }
      });
      setRunningTasks(running);
    } catch (error) {
      console.error('Failed to load task runs:', error);
    }
  };

  const handleRunModule = async (moduleId: number, moduleName: string) => {
    if (!selectedEvidence) return;

    try {
      const taskRun = await pipelineAPI.run({
        module_id: moduleId,
        evidence_uid: selectedEvidence,
      });

      showMessage('success', `Started ${moduleName} (Task ID: ${taskRun.task_run_id})`);
      setRunningTasks((prev) => new Set(prev).add(taskRun.task_run_id));
      loadTaskRuns();
    } catch (error) {
      showMessage('error', `Failed to start ${moduleName}: ${error}`);
    }
  };

  const handleRunScript = async (scriptId: number, scriptName: string) => {
    if (!selectedEvidence) return;

    try {
      const taskRun = await scriptsAPI.run(scriptId, { evidence_uid: selectedEvidence });

      showMessage('success', `Started ${scriptName} (Task ID: ${taskRun.task_run_id})`);
      setRunningTasks((prev) => new Set(prev).add(taskRun.task_run_id));
      loadTaskRuns();
    } catch (error) {
      showMessage('error', `Failed to start ${scriptName}: ${error}`);
    }
  };

  const handleIndexTaskRun = async (taskRunId: number, taskName: string) => {
    try {
      setIndexingTasks((prev) => new Set(prev).add(taskRunId));

      await indexingAPI.indexTaskRun({ task_run_id: taskRunId });

      showMessage('success', `Indexation started for ${taskName}!`);
      setTimeout(() => loadTaskRuns(), 2000);
    } catch (error) {
      showMessage('error', `Failed to index ${taskName}: ${error}`);
    } finally {
      setIndexingTasks((prev) => {
        const next = new Set(prev);
        next.delete(taskRunId);
        return next;
      });
    }
  };

  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const getStatusIcon = (status: TaskRun['status']) => {
    switch (status) {
      case 'success':
        return <Check size={16} className="text-green-600" />;
      case 'error':
        return <X size={16} className="text-red-600" />;
      case 'running':
        return <Loader size={16} className="text-blue-600 animate-spin" />;
      case 'queued':
        return <Clock size={16} className="text-yellow-600" />;
      default:
        return null;
    }
  };

  const getTaskRunsForModule = (moduleId: number) => {
    return taskRuns.filter((tr) => tr.module_id === moduleId);
  };

  const getTaskRunsForScript = (scriptId: number) => {
    return taskRuns.filter((tr) => tr.script_id === scriptId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-timesketch-accent mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading pipeline...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-slate-50 border-b border-gray-200 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Activity className="text-timesketch-accent" size={32} />
              Analysis Pipeline
            </h1>
            <p className="text-gray-600 mt-1">
              Run forensic analysis modules on evidence
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Message */}
          {message && (
            <div
              className={`rounded-lg p-4 ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-800 border border-green-200'
                  : message.type === 'error'
                  ? 'bg-red-50 text-red-800 border border-red-200'
                  : 'bg-blue-50 text-blue-800 border border-blue-200'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Evidence Selector */}
          <div className="ts-card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Evidence</h2>
            <select
              value={selectedEvidence}
              onChange={(e) => setSelectedEvidence(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-timesketch-accent focus:border-transparent"
            >
              <option value="">-- Select Evidence --</option>
              {evidences.map((evidence) => (
                <option key={evidence.id} value={evidence.evidence_uid}>
                  {evidence.evidence_uid} ({evidence.case_id})
                </option>
              ))}
            </select>
          </div>

          {/* Modules */}
          {selectedEvidence && modules.length > 0 && (
            <div className="ts-card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Available Modules ({modules.length})
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {modules.map((module) => {
                  const moduleTaskRuns = getTaskRunsForModule(module.id);
                  const lastRun = moduleTaskRuns[0];

                  return (
                    <div key={module.id} className="border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow bg-slate-50">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-gray-900">{module.name}</h3>
                          {!module.enabled && (
                            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded mt-1 inline-block">
                              Disabled
                            </span>
                          )}
                        </div>
                      </div>

                      {module.description && (
                        <p className="text-sm text-gray-600 mb-4">{module.description}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => handleRunModule(module.id, module.name)}
                          disabled={!module.enabled}
                          className="btn-primary btn-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Play size={14} />
                          Run
                        </button>

                        {lastRun && (
                          <>
                            <span className={`status-${lastRun.status} flex items-center gap-1`}>
                              {getStatusIcon(lastRun.status)}
                              {lastRun.status}
                            </span>

                            {lastRun.status === 'success' &&
                              (lastRun.indexed ? (
                                <span className="status-success flex items-center gap-1">
                                  <Database size={12} />
                                  Indexed
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleIndexTaskRun(lastRun.id, module.name)}
                                  disabled={indexingTasks.has(lastRun.id)}
                                  className="btn-primary btn-sm bg-green-600 hover:bg-green-700 disabled:opacity-50"
                                >
                                  {indexingTasks.has(lastRun.id) ? (
                                    <>
                                      <Loader size={12} className="animate-spin" />
                                      Indexing...
                                    </>
                                  ) : (
                                    <>
                                      <Database size={12} />
                                      Index
                                    </>
                                  )}
                                </button>
                              ))}
                          </>
                        )}
                      </div>

                      {moduleTaskRuns.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <p className="text-xs font-semibold text-gray-500 mb-2">
                            Recent Runs ({moduleTaskRuns.length})
                          </p>
                          {moduleTaskRuns.slice(0, 3).map((tr) => (
                            <div key={tr.id} className="flex justify-between items-center text-xs text-gray-600 mb-1">
                              <span className="flex items-center gap-1">
                                {getStatusIcon(tr.status)} #{tr.id}
                              </span>
                              <span>{new Date(tr.created_at).toLocaleTimeString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* User Scripts */}
          {selectedEvidence && userScripts.length > 0 && (
            <div className="ts-card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                My Scripts ({userScripts.length})
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {userScripts.map((script) => {
                  const scriptTaskRuns = getTaskRunsForScript(script.id);
                  const lastRun = scriptTaskRuns[0];
                  const isRunnable = script.language === 'python';

                  return (
                    <div key={script.id} className="border border-blue-200 rounded-lg p-5 hover:shadow-md transition-shadow bg-blue-50">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-gray-900">{script.name}</h3>
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded mt-1 inline-block">
                            {script.language}
                          </span>
                          {!isRunnable && (
                            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded mt-1 inline-block ml-1">
                              View Only
                            </span>
                          )}
                        </div>
                      </div>

                      {script.description && (
                        <p className="text-sm text-gray-600 mb-4">{script.description}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => handleRunScript(script.id, script.name)}
                          disabled={!isRunnable}
                          className="btn-primary btn-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Play size={14} />
                          Run
                        </button>

                        {lastRun && (
                          <>
                            <span className={`status-${lastRun.status} flex items-center gap-1`}>
                              {getStatusIcon(lastRun.status)}
                              {lastRun.status}
                            </span>

                            {lastRun.status === 'success' &&
                              (lastRun.indexed ? (
                                <span className="status-success flex items-center gap-1">
                                  <Database size={12} />
                                  Indexed
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleIndexTaskRun(lastRun.id, script.name)}
                                  disabled={indexingTasks.has(lastRun.id)}
                                  className="btn-primary btn-sm bg-green-600 hover:bg-green-700 disabled:opacity-50"
                                >
                                  {indexingTasks.has(lastRun.id) ? (
                                    <>
                                      <Loader size={12} className="animate-spin" />
                                      Indexing...
                                    </>
                                  ) : (
                                    <>
                                      <Database size={12} />
                                      Index
                                    </>
                                  )}
                                </button>
                              ))}
                          </>
                        )}
                      </div>

                      {scriptTaskRuns.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-blue-200">
                          <p className="text-xs font-semibold text-gray-500 mb-2">
                            Recent Runs ({scriptTaskRuns.length})
                          </p>
                          {scriptTaskRuns.slice(0, 3).map((tr) => (
                            <div key={tr.id} className="flex justify-between items-center text-xs text-gray-600 mb-1">
                              <span className="flex items-center gap-1">
                                {getStatusIcon(tr.status)} #{tr.id}
                              </span>
                              <span>{new Date(tr.created_at).toLocaleTimeString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Task Runs Table */}
          {selectedEvidence && taskRuns.length > 0 && (
            <div className="ts-card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Task Runs ({taskRuns.length})
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">ID</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Module</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Indexed</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Created</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {taskRuns.map((taskRun) => (
                      <tr key={taskRun.id} className="hover:bg-slate-100">
                        <td className="px-4 py-3 text-sm">#{taskRun.id}</td>
                        <td className="px-4 py-3 text-sm font-medium">
                          {taskRun.module?.name || taskRun.task_name}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`status-${taskRun.status} flex items-center gap-1 inline-flex`}>
                            {getStatusIcon(taskRun.status)}
                            {taskRun.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {taskRun.indexed ? (
                            <span className="status-success inline-flex items-center gap-1">
                              <Database size={12} /> Yes
                            </span>
                          ) : taskRun.status === 'success' ? (
                            <span className="status-warning inline-flex items-center gap-1">
                              <AlertCircle size={12} /> No
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {new Date(taskRun.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          {taskRun.status === 'success' && !taskRun.indexed && (
                            <button
                              onClick={() =>
                                handleIndexTaskRun(taskRun.id, taskRun.module?.name || taskRun.task_name)
                              }
                              disabled={indexingTasks.has(taskRun.id)}
                              className="btn-primary btn-sm bg-green-600 hover:bg-green-700"
                            >
                              {indexingTasks.has(taskRun.id) ? (
                                <>
                                  <Loader size={12} />
                                  Indexing...
                                </>
                              ) : (
                                <>
                                  <Database size={12} />
                                  Index
                                </>
                              )}
                            </button>
                          )}
                          {taskRun.status === 'error' && (
                            <button
                              onClick={() => alert(taskRun.error_message || 'No error message')}
                              className="btn-secondary btn-sm"
                            >
                              View Error
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {selectedEvidence && modules.length === 0 && (
            <div className="ts-card text-center py-12">
              <AlertCircle className="mx-auto h-16 w-16 text-gray-400" />
              <p className="mt-4 text-gray-600 text-lg">No modules available</p>
              <p className="text-gray-500 text-sm mt-2">
                Run <code className="bg-gray-100 px-2 py-1 rounded">uv run python -m app.seed_modules</code> to create modules
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
