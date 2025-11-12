import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  AlertCircle,
  Check,
  Clock,
  Database,
  FileCode2,
  Loader,
  Play,
  Terminal,
  X,
} from 'lucide-react';

import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { indexingAPI, pipelineAPI, scriptsAPI } from '../services/api';
import type { AnalysisModule, TaskRun, Script } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface PipelineViewProps {
  selectedEvidenceUid: string | null;
  darkMode: boolean;
  isActive?: boolean;
}

const badgeClass = (status: TaskRun['status'], darkMode: boolean) => {
  const palette = {
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
  return palette[status];
};

const statusIcon = (status: TaskRun['status']) => {
  switch (status) {
    case 'success':
      return <Check className="h-3 w-3" />;
    case 'error':
      return <X className="h-3 w-3" />;
    case 'running':
      return <Loader className="h-3 w-3 animate-spin" />;
    case 'queued':
      return <Clock className="h-3 w-3" />;
    default:
      return null;
  }
};

export function PipelineView({ selectedEvidenceUid, darkMode, isActive }: PipelineViewProps) {
  const [modules, setModules] = useState<AnalysisModule[]>([]);
  const [taskRuns, setTaskRuns] = useState<TaskRun[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);

  const [modulesLoading, setModulesLoading] = useState(true);
  const [scriptsLoading, setScriptsLoading] = useState(false);

  const [runningTasks, setRunningTasks] = useState<Set<number>>(new Set());
  const [indexingTasks, setIndexingTasks] = useState<Set<number>>(new Set());
  const [runningScriptId, setRunningScriptId] = useState<number | null>(null);

  const [scriptError, setScriptError] = useState<string | null>(null);
  const [scriptSuccess, setScriptSuccess] = useState<string | null>(null);

  const { user } = useAuth();
  const role = user?.role ?? 'viewer';
  const hasPipelineWriteAccess = role !== 'viewer';
  const canRunCustomScripts = role === 'superadmin' || role === 'admin';

  const textWeak = darkMode ? 'text-slate-500' : 'text-gray-500';
  const textStrong = darkMode ? 'text-slate-100' : 'text-gray-900';
  const borderColor = darkMode ? 'border-slate-700' : 'border-gray-200';

  const loadScripts = useCallback(async () => {
    setScriptsLoading(true);
    setScriptError(null);
    try {
      const data = await scriptsAPI.myScripts();
      console.log('[PipelineView] Loaded scripts:', data);
      setScripts(data);
    } catch (error) {
      console.error('[PipelineView] Failed to load user scripts:', error);
      // Silently fail if no scripts installed - this is normal for new users
      setScripts([]);
    } finally {
      setScriptsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedEvidenceUid) {
      setModules([]);
      setTaskRuns([]);
      setRunningTasks(new Set());
      return;
    }

    loadModules(selectedEvidenceUid);
    loadTaskRuns(selectedEvidenceUid);
  }, [selectedEvidenceUid]);

  useEffect(() => {
    loadScripts();
  }, [loadScripts]);

  // Recharger les scripts quand l'onglet Pipeline devient actif
  // Cela permet d'afficher les scripts installés depuis le marketplace
  useEffect(() => {
    if (isActive) {
      loadScripts();
    }
  }, [isActive, loadScripts]);

  // Écouter les événements d'installation de script depuis le marketplace
  useEffect(() => {
    const handleScriptInstalled = () => {
      // Recharger les scripts quand un script est installé depuis le marketplace
      loadScripts();
    };

    window.addEventListener('script-installed', handleScriptInstalled);
    return () => {
      window.removeEventListener('script-installed', handleScriptInstalled);
    };
  }, [loadScripts]);

  useEffect(() => {
    if (!selectedEvidenceUid || runningTasks.size === 0) {
      return;
    }
    const interval = setInterval(() => loadTaskRuns(selectedEvidenceUid), 3000);
    return () => clearInterval(interval);
  }, [selectedEvidenceUid, runningTasks.size]);

  const loadModules = async (evidenceUid: string) => {
    setModulesLoading(true);
    try {
      const data = await pipelineAPI.listModules(evidenceUid);
      setModules(data);
    } catch (error: any) {
      // 404 is expected when evidence doesn't exist - don't log as error
      if (error.message && (error.message.includes('404') || error.message.includes('Not Found') || error.message.includes('Evidence not found'))) {
        setModules([]);
      } else {
        console.error('Failed to load modules:', error);
        setModules([]);
      }
    } finally {
      setModulesLoading(false);
    }
  };

  const loadTaskRuns = async (evidenceUid: string) => {
    try {
      const data = await pipelineAPI.listRuns(evidenceUid);
      setTaskRuns(data);

      const running = new Set<number>();
      data.forEach((run) => {
        if (run.status === 'running' || run.status === 'queued') {
          running.add(run.id);
        }
      });
      setRunningTasks(running);
    } catch (error: any) {
      // 404 is expected when evidence doesn't exist - don't log as error
      if (error.message && (error.message.includes('404') || error.message.includes('Not Found') || error.message.includes('Evidence not found'))) {
        setTaskRuns([]);
        setRunningTasks(new Set());
      } else {
        console.error('Failed to load task runs:', error);
        setTaskRuns([]);
        setRunningTasks(new Set());
      }
    }
  };

  const handleRunModule = async (moduleId: number) => {
    if (!selectedEvidenceUid) {
      return;
    }

    if (!hasPipelineWriteAccess) {
      return;
    }

    try {
      const response = await pipelineAPI.run({
        module_id: moduleId,
        evidence_uid: selectedEvidenceUid,
      });
      setRunningTasks((prev) => new Set(prev).add(response.task_run_id));
      loadTaskRuns(selectedEvidenceUid);
    } catch (error) {
      console.error('Failed to run module:', error);
    }
  };

  const handleRunScript = async (scriptId: number) => {
    if (!canRunCustomScripts) {
      setScriptError('Exécution réservée aux admins et superadmins.');
      return;
    }

    if (!selectedEvidenceUid) {
      setScriptError('Select an evidence before running a script.');
      return;
    }

    try {
      setRunningScriptId(scriptId);
      setScriptError(null);
      setScriptSuccess(null);
      await scriptsAPI.run(scriptId, { evidence_uid: selectedEvidenceUid });
      setScriptSuccess(`Script #${scriptId} launched. Track its status below.`);
      loadTaskRuns(selectedEvidenceUid);
    } catch (error: any) {
      console.error('Failed to run script:', error);
      setScriptError(error?.message || 'Unable to run script.');
    } finally {
      setRunningScriptId(null);
    }
  };

  const handleIndexTaskRun = async (taskRunId: number) => {
    if (!selectedEvidenceUid) {
      return;
    }

    if (!hasPipelineWriteAccess) {
      return;
    }

    try {
      setIndexingTasks((prev) => new Set(prev).add(taskRunId));
      await indexingAPI.indexTaskRun({ task_run_id: taskRunId });
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

  const getTaskRunsForModule = (moduleId: number) =>
    taskRuns.filter((run) => run.module_id === moduleId);

  const scriptTaskRuns = useMemo(
    () => taskRuns.filter((run) => run.script_id),
    [taskRuns],
  );

  if (!selectedEvidenceUid) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className={`mx-auto mb-3 h-12 w-12 ${textWeak}`} />
        <div className={`text-sm ${textWeak}`}>Select an evidence to view the pipeline.</div>
      </div>
    );
  }

  if (modulesLoading) {
    return (
      <div className="p-8 text-center">
        <div className={`text-sm ${textWeak}`}>Loading pipeline…</div>
      </div>
    );
  }

  return (
    <div className={`p-6 space-y-6 text-[12px] ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
      {/* Modules */}
      {modules.length > 0 ? (
        <div>
          <div className={`text-[10px] font-medium uppercase tracking-wide mb-4 ${textWeak}`}>
            Analysis Modules ({modules.length})
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {modules.map((module) => {
              const moduleRuns = getTaskRunsForModule(module.id);
              const lastRun = moduleRuns[0];

              return (
                <div
                  key={module.id}
                  className={`rounded-lg border p-4 ${
                    darkMode ? 'border-slate-700 bg-slate-900' : 'border-gray-200 bg-slate-50'
                  }`}
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div>
                      <div className={`font-semibold ${textStrong}`}>{module.name}</div>
                      {module.description && (
                        <div className={`mt-1 text-[11px] ${textWeak}`}>{module.description}</div>
                      )}
                    </div>
                  </div>

                    <div className="flex flex-wrap items-center gap-2">
                    {(() => {
                      const moduleDisabled = !module.enabled || !hasPipelineWriteAccess;
                      const moduleTitle = !hasPipelineWriteAccess
                        ? 'Profil en lecture seule : exécution désactivée.'
                        : !module.enabled
                        ? 'Module désactivé.'
                        : undefined;
                      return (
                        <Button
                          onClick={() => handleRunModule(module.id)}
                          disabled={moduleDisabled}
                          title={moduleTitle}
                          className={`h-7 px-3 text-[11px] ${
                            darkMode
                              ? 'border-violet-600/30 bg-violet-950/40 text-violet-200 hover:bg-violet-900/30'
                              : 'border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100'
                          } ${moduleDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <Play className="mr-1 h-3 w-3" />
                          Run
                        </Button>
                      );
                    })()}

                    {lastRun && (
                      <Badge
                        className={`inline-flex items-center gap-1 rounded-md border text-[10px] ${badgeClass(
                          lastRun.status,
                          darkMode,
                        )}`}
                      >
                        {statusIcon(lastRun.status)}
                        {lastRun.status}
                      </Badge>
                    )}
                  </div>

                  {moduleRuns.length > 0 && (
                    <div className={`mt-3 border-t pt-3 ${borderColor}`}>
                      <div className={`mb-2 text-[10px] font-medium uppercase tracking-wide ${textWeak}`}>
                        Recent Runs ({moduleRuns.length})
                      </div>
                      <div className="space-y-1">
                        {moduleRuns.slice(0, 3).map((run) => (
                          <div key={run.id} className="flex items-center justify-between text-[11px]">
                            <span className="flex items-center gap-1">
                              {statusIcon(run.status)} #{run.id}
                            </span>
                            <span className={textWeak}>
                              {run.started_at_utc
                                ? new Date(run.started_at_utc).toLocaleTimeString()
                                : '—'}
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
        <div className="text-center">
          <AlertCircle className={`mx-auto mb-3 h-10 w-10 ${textWeak}`} />
          <p className={`text-sm ${textWeak}`}>No modules registered</p>
        </div>
      )}

      {/* Custom scripts */}
      <div
        className={`rounded-xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-900/80' : 'border-gray-200 bg-slate-50'}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className={`flex items-center gap-2 text-sm font-semibold ${textStrong}`}>
              <FileCode2 className="h-4 w-4" />
              My Scripts
            </div>
            <p className={`text-xs ${textWeak}`}>
              {canRunCustomScripts
                ? 'Install scripts from the Marketplace, then launch them here on the selected evidence.'
                : 'Script execution is restricted to admin and superadmin roles.'}
            </p>
          </div>
          <div className="space-y-1 text-xs text-right">
            {scriptSuccess && <p className="text-emerald-400">{scriptSuccess}</p>}
            {scriptError && <p className="text-rose-400">{scriptError}</p>}
          </div>
        </div>
        {scriptsLoading ? (
          <div className={`mt-3 text-sm ${textWeak}`}>Loading scripts…</div>
        ) : scripts.length === 0 ? (
          <div className={`mt-3 text-sm ${textWeak}`}>
            {canRunCustomScripts
              ? 'No scripts installed yet. Visit the Marketplace tab to install scripts.'
              : 'No scripts available for this profile.'}
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {scripts.map((script) => {
              const runsForScript = scriptTaskRuns.filter((run) => run.script_id === script.id);
              const requirementPreview = script.requirements
                ? script.requirements.split(/\r?\n/).filter((line) => line.trim().length > 0)
                : [];
              const runnable = script.language === 'python';
              const scriptDisabled =
                !selectedEvidenceUid || runningScriptId === script.id || !runnable || !canRunCustomScripts;
              const buttonTitle = !selectedEvidenceUid
                ? 'Select an evidence first.'
                : !canRunCustomScripts
                ? 'Script execution is limited to admin and superadmin roles.'
                : !runnable
                ? 'Only Python scripts are supported at the moment.'
                : undefined;
              return (
                <div
                  key={script.id}
                  className={`rounded-lg border p-4 ${
                    darkMode ? 'border-slate-800 bg-slate-900/70' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className={`font-semibold ${textStrong}`}>{script.name}</p>
                    {script.description && (
                      <p className={`mt-1 text-xs ${textWeak}`}>{script.description}</p>
                    )}
                  </div>
                  <Badge
                    className={`text-[10px] uppercase ${
                      darkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-50 text-slate-700'
                    }`}
                  >
                    {script.language}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <Badge
                    className={`border ${
                      darkMode ? 'border-slate-700 bg-slate-900 text-slate-200' : 'border-gray-300 bg-white text-gray-700'
                    }`}
                  >
                    Python {script.python_version || '3.x'}
                  </Badge>
                  {requirementPreview.length > 0 && (
                    <span className={textWeak}>{requirementPreview.length} dépendance{requirementPreview.length > 1 ? 's' : ''}</span>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => handleRunScript(script.id)}
                    disabled={scriptDisabled}
                    title={buttonTitle}
                    className={`h-8 px-3 text-[11px] ${
                      darkMode
                        ? 'border-violet-600/30 bg-violet-950/40 text-violet-200 hover:bg-violet-900/30 disabled:opacity-50'
                        : 'border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-50'
                    }`}
                  >
                    {runningScriptId === script.id ? (
                      <>
                        <Loader className="mr-1 h-3 w-3 animate-spin" />
                        Running…
                      </>
                    ) : !canRunCustomScripts ? (
                      <>Access restricted</>
                    ) : runnable ? (
                      <>
                        <Terminal className="mr-1 h-3 w-3" />
                        Run
                      </>
                    ) : (
                      <>Langage non supporté</>
                    )}
                  </Button>
                  {runsForScript.length > 0 && (
                    <Badge
                      className={`text-[10px] ${
                        darkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-50 text-slate-700'
                      }`}
                    >
                      Runs: {runsForScript.length}
                    </Badge>
                  )}
                </div>
                {requirementPreview.length > 0 && (
                  <pre className={`mt-3 max-h-24 overflow-auto text-[11px] rounded border px-2 py-1 ${darkMode ? 'border-slate-800 bg-slate-900 text-slate-200' : 'border-gray-200 bg-white text-gray-700'}`}>
                    {requirementPreview.join('\n')}
                  </pre>
                )}
                {!canRunCustomScripts && (
                  <p className={`mt-2 text-[11px] ${textWeak}`}>
                    Execution reserved for admin and superadmin accounts.
                  </p>
                )}
                {canRunCustomScripts && !runnable && (
                  <p className={`mt-2 text-[11px] ${textWeak}`}>
                    L'exécution automatique n'est disponible que pour les scripts Python pour le moment.
                  </p>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Task runs */}
      {taskRuns.length > 0 && (
        <div>
          <div className={`text-[10px] font-medium uppercase tracking-wide mb-4 ${textWeak}`}>
            All Task Runs ({taskRuns.length})
          </div>
          <div
            className={`rounded-lg border overflow-hidden ${
              darkMode ? 'border-slate-700' : 'border-gray-200'
            }`}
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead
                  className={`text-[10px] uppercase tracking-wide border-b ${
                    darkMode
                      ? 'bg-slate-900 text-slate-500 border-slate-700'
                      : 'bg-slate-50 text-gray-500 border-gray-200'
                  }`}
                >
                  <tr>
                    <th className="px-4 py-2">ID</th>
                    <th className="px-4 py-2">Module / Script</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Indexed</th>
                    <th className="px-4 py-2">Timestamp</th>
                    <th className="px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className={darkMode ? 'divide-y divide-slate-800' : 'divide-y divide-gray-100'}>
                  {taskRuns.map((run) => (
                    <tr
                      key={run.id}
                      className={darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-slate-100'}
                    >
                      <td className={`px-4 py-2 text-[11px] ${textWeak}`}>#{run.id}</td>
                      <td className={`px-4 py-2 text-[11px] font-medium ${textStrong}`}>
                        {run.script_name ? `Script • ${run.script_name}` : run.module?.name || run.task_name}
                      </td>
                      <td className="px-4 py-2">
                        <Badge
                          className={`inline-flex items-center gap-1 rounded-md border text-[10px] ${badgeClass(
                            run.status,
                            darkMode,
                          )}`}
                        >
                          {statusIcon(run.status)}
                          {run.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        {run.indexed ? (
                          <Badge
                            className={`rounded-md text-[10px] border ${
                              darkMode
                                ? 'bg-emerald-600/10 text-emerald-300 border-emerald-500/30'
                                : 'bg-emerald-100 text-emerald-700 border-emerald-300'
                            }`}
                          >
                            Yes
                          </Badge>
                        ) : run.status === 'success' ? (
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
                          <span className={`text-[11px] ${textWeak}`}>—</span>
                        )}
                      </td>
                      <td className={`px-4 py-2 text-[11px] ${textWeak}`}>
                        {run.started_at_utc
                          ? new Date(run.started_at_utc).toLocaleString()
                          : run.ended_at_utc
                          ? new Date(run.ended_at_utc).toLocaleString()
                          : '—'}
                      </td>
                      <td className="px-4 py-2">
                        {run.status === 'success' && !run.indexed && !run.script_id && (
                          <Button
                            onClick={() => handleIndexTaskRun(run.id)}
                            disabled={indexingTasks.has(run.id) || !hasPipelineWriteAccess}
                            title={!hasPipelineWriteAccess ? 'Profil en lecture seule : action indisponible.' : undefined}
                            className={`h-6 px-2 text-[11px] ${
                              darkMode
                                ? 'border-emerald-600/30 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-900/30'
                                : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            } ${(indexingTasks.has(run.id) || !hasPipelineWriteAccess) ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {indexingTasks.has(run.id) ? (
                              <Loader className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <Database className="mr-1 h-3 w-3" />
                                Index
                              </>
                            )}
                          </Button>
                        )}
                        {run.status === 'error' && (
                          <Button
                            onClick={() => alert(run.error_message || 'No error message')}
                            className={`h-6 px-2 text-[11px] ${
                              darkMode
                                ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                                : 'border-gray-300 bg-slate-50 text-slate-800 hover:bg-slate-200'
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
