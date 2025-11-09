import { useEffect, useState } from 'react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { scriptsAPI } from '../services/api';
import type { Script } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface ScriptsViewProps {
  darkMode: boolean;
}

export function ScriptsView({ darkMode }: ScriptsViewProps) {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [myScripts, setMyScripts] = useState<Script[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [runningScriptId, setRunningScriptId] = useState<number | null>(null);
  const [runTargets, setRunTargets] = useState<Record<number, string>>({});
  const [formState, setFormState] = useState({
    name: '',
    description: '',
    source_code: '',
    language: 'python' as 'python' | 'perl' | 'rust',
  });
  const [githubForm, setGithubForm] = useState({
    repo_url: '',
    branch: 'main',
    scripts_path: 'scripts',
  });
  const [isImporting, setIsImporting] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    loadScripts();
    if (!isAdmin) {
      loadMyScripts();
    }
  }, [isAdmin]);

  const loadScripts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Admin: load all scripts, Non-admin: load marketplace only
      const data = isAdmin ? await scriptsAPI.list() : await scriptsAPI.marketplace();
      setScripts(data);
    } catch (err: any) {
      setError(err.message || 'Unable to load scripts');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMyScripts = async () => {
    try {
      const data = await scriptsAPI.myScripts();
      setMyScripts(data);
    } catch (err: any) {
      console.error('Failed to load installed scripts:', err);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAdmin) {
      setError("Seuls les administrateurs peuvent créer des scripts.");
      return;
    }
    if (!formState.name || !formState.source_code) {
      setError('Name and script body are required.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await scriptsAPI.create({
        name: formState.name,
        description: formState.description,
        language: formState.language,
        source_code: formState.source_code,
      });
      setScripts((prev) => [created, ...prev]);
      setFormState({ name: '', description: '', source_code: '', language: formState.language });
      setSuccess('Script enregistré avec succès.');
    } catch (err: any) {
      setError(err.message || 'Impossible de sauvegarder le script.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = async (source: string) => {
    try {
      await navigator.clipboard.writeText(source);
      setSuccess('Script copié dans le presse-papiers.');
    } catch {
      setError('Impossible de copier le script.');
    }
  };

  const handleRunScript = async (scriptId: number) => {
    if (!isAdmin) {
      setError("Seuls les administrateurs peuvent exécuter les scripts.");
      return;
    }
    const target = (runTargets[scriptId] || '').trim();
    if (!target) {
      setError("Merci d'indiquer un evidence_uid avant d'exécuter le script.");
      return;
    }
    setRunningScriptId(scriptId);
    setError(null);
    setSuccess(null);
    try {
      await scriptsAPI.run(scriptId, { evidence_uid: target });
      setSuccess(`Script #${scriptId} exécuté : suivez le statut dans Pipeline.`);
    } catch (err: any) {
      setError(err.message || "Impossible d'exécuter le script.");
    } finally {
      setRunningScriptId(null);
    }
  };

  const handleApprove = async (scriptId: number, approved: boolean) => {
    if (!isAdmin) {
      setError("Seuls les administrateurs peuvent approuver des scripts.");
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await scriptsAPI.approve(scriptId, approved);
      setSuccess(approved ? 'Script approuvé pour le marketplace!' : 'Approbation retirée.');
      // Recharger la liste
      await loadScripts();
    } catch (err: any) {
      setError(err.message || "Impossible de modifier l'approbation.");
    }
  };

  const handleInstall = async (scriptId: number) => {
    setError(null);
    setSuccess(null);
    try {
      const result = await scriptsAPI.install(scriptId);
      if (result.status === 'already_installed') {
        setSuccess('Ce script est déjà installé dans votre profil.');
      } else {
        setSuccess('Script installé! Il est maintenant disponible dans Pipeline.');
      }
      await loadMyScripts();
    } catch (err: any) {
      setError(err.message || "Impossible d'installer le script.");
    }
  };

  const handleGitHubImport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAdmin) {
      setError("Seuls les administrateurs peuvent importer depuis GitHub.");
      return;
    }
    if (!githubForm.repo_url) {
      setError('URL du repository GitHub requise.');
      return;
    }

    setIsImporting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await scriptsAPI.importFromGitHub(githubForm);
      const msg = `Import terminé: ${result.imported} script(s) importé(s), ${result.skipped} ignoré(s).`;
      setSuccess(result.errors && result.errors.length > 0 ? `${msg} Erreurs: ${result.errors.join(', ')}` : msg);
      setGithubForm({ repo_url: '', branch: 'main', scripts_path: 'scripts' });
      await loadScripts();
    } catch (err: any) {
      setError(err.message || 'Impossible d\'importer depuis GitHub.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className={darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-gray-200 bg-white'}>
        <CardContent className="space-y-4 p-6">
          <div>
            <h2 className={`text-lg font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>Marketplace / Scripts d'analyse</h2>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
              {isAdmin
                ? 'Réservé aux administrateurs. Choisissez Python pour exécuter automatiquement (Perl/Rust : stockage uniquement).'
                : "Impossible de créer ou lancer un script sans autorisation. Parcourez le catalogue et contactez un administrateur pour l'installation."}
            </p>
          </div>

          {isAdmin ? (
            <>
              <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-200' : 'text-gray-700'}`}>
                    Nom
                  </label>
                  <Input
                    value={formState.name}
                    onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Ex: enrich_process_metadata"
                  />
                </div>
                <div>
                  <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-200' : 'text-gray-700'}`}>
                    Description (optionnel)
                  </label>
                  <Input
                    value={formState.description}
                    onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
                    placeholder="Détail du rôle du script"
                  />
                </div>
                <div>
                  <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-200' : 'text-gray-700'}`}>
                    Langage
                  </label>
                  <select
                    value={formState.language}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        language: event.target.value as 'python' | 'perl' | 'rust',
                      }))
                    }
                    className={`w-full rounded-lg border px-3 py-2 text-sm ${
                      darkMode ? 'border-slate-800 bg-slate-900 text-slate-100' : 'border-gray-300 bg-white text-gray-900'
                    }`}
                  >
                    <option value="python">Python</option>
                    <option value="perl">Perl</option>
                    <option value="rust">Rust</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-200' : 'text-gray-700'}`}>
                  Script
                </label>
                <textarea
                  className={`min-h-[200px] w-full rounded-lg border px-3 py-2 font-mono text-sm ${
                    darkMode
                      ? 'border-slate-800 bg-slate-900 text-slate-100 focus:border-violet-600 focus:outline-none'
                      : 'border-gray-300 bg-white text-gray-900 focus:border-violet-500 focus:outline-none'
                  }`}
                  value={formState.source_code}
                  onChange={(event) => setFormState((prev) => ({ ...prev, source_code: event.target.value }))}
                  placeholder="# Votre script Python..."
                />
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  disabled={isSaving}
                  className={
                    isSaving
                      ? 'opacity-70 cursor-not-allowed'
                      : darkMode
                      ? 'border-violet-600/40 bg-violet-950/40 text-violet-200 hover:bg-violet-900/40'
                      : 'border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100'
                  }
                >
                  {isSaving ? 'Enregistrement...' : 'Enregistrer le script'}
                </Button>
                {success && <span className="text-xs text-emerald-500">{success}</span>}
                {error && <span className="text-xs text-rose-500">{error}</span>}
              </div>
            </form>

            <div className="pt-6 border-t border-slate-700">
              <h3 className={`text-sm font-semibold mb-3 ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                Importer depuis GitHub
              </h3>
              <form className="space-y-3" onSubmit={handleGitHubImport}>
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-200' : 'text-gray-700'}`}>
                      Repository URL *
                    </label>
                    <Input
                      value={githubForm.repo_url}
                      onChange={(e) => setGithubForm((prev) => ({ ...prev, repo_url: e.target.value }))}
                      placeholder="https://github.com/user/repo"
                    />
                  </div>
                  <div>
                    <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-200' : 'text-gray-700'}`}>
                      Branche
                    </label>
                    <Input
                      value={githubForm.branch}
                      onChange={(e) => setGithubForm((prev) => ({ ...prev, branch: e.target.value }))}
                      placeholder="main"
                    />
                  </div>
                  <div>
                    <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-200' : 'text-gray-700'}`}>
                      Chemin des scripts
                    </label>
                    <Input
                      value={githubForm.scripts_path}
                      onChange={(e) => setGithubForm((prev) => ({ ...prev, scripts_path: e.target.value }))}
                      placeholder="scripts"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={isImporting}
                  className={
                    isImporting
                      ? 'opacity-70 cursor-not-allowed'
                      : darkMode
                      ? 'border-sky-600/40 bg-sky-950/40 text-sky-200 hover:bg-sky-900/40'
                      : 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100'
                  }
                >
                  {isImporting ? 'Import en cours...' : 'Importer les scripts .py'}
                </Button>
              </form>
            </div>
            </>
          ) : (
            <div
              className={`rounded-xl border px-4 py-5 text-sm ${
                darkMode ? 'border-slate-800 bg-slate-900 text-slate-200' : 'border-gray-200 bg-gray-50 text-gray-800'
              }`}
            >
              Vous visualisez le catalogue uniquement. Les scripts sont installés/achetés par les administrateurs.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-gray-200 bg-slate-50'}>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h3 className={`text-base font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>Scripts enregistrés</h3>
            <Badge className={darkMode ? 'border-slate-700 bg-slate-900 text-slate-200' : 'border-gray-200 bg-gray-50 text-slate-700'}>
              {scripts.length} scripts
            </Badge>
          </div>

          {isLoading ? (
            <p className={darkMode ? 'text-slate-400' : 'text-gray-600'}>Chargement...</p>
          ) : scripts.length === 0 ? (
            <div
              className={`rounded-lg border px-4 py-6 text-center text-sm ${
                darkMode ? 'border-slate-800 text-slate-400' : 'border-gray-200 text-gray-600'
              }`}
            >
              Aucun script pour le moment. Commencez par en créer un ci-dessus.
            </div>
          ) : (
            <div className="space-y-4">
              {scripts.map((script) => (
                <div
                  key={script.id}
                  className={`rounded-xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-900/60' : 'border-gray-200 bg-gray-50'}`}
                >
                  {(() => {
                    const runnable = script.language === 'python';
                    return (
                      <>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className={`text-sm font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>{script.name}</h4>
                    <Badge className={darkMode ? 'border-violet-600/30 bg-violet-950/40 text-violet-200' : 'border-violet-200 bg-violet-50 text-violet-700'}>
                      {script.language}
                    </Badge>
                    {script.is_approved && (
                      <Badge className={darkMode ? 'border-emerald-600/30 bg-emerald-950/40 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}>
                        ✓ Marketplace
                      </Badge>
                    )}
                    <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>
                      {new Date(script.created_at_utc).toLocaleString()}
                    </span>
                    <div className="ml-auto flex gap-2">
                      {isAdmin && (
                        <Button
                          className={`h-7 border px-2 text-xs ${
                            script.is_approved
                              ? darkMode
                                ? 'border-rose-600/30 bg-rose-950/40 text-rose-200 hover:bg-rose-900/30'
                                : 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
                              : darkMode
                              ? 'border-emerald-600/30 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-900/30'
                              : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          }`}
                          onClick={() => handleApprove(script.id, !script.is_approved)}
                        >
                          {script.is_approved ? 'Retirer du marketplace' : 'Approuver pour marketplace'}
                        </Button>
                      )}
                      {!isAdmin && script.is_approved && (
                        <Button
                          className={`h-7 border px-2 text-xs ${
                            myScripts.some(s => s.id === script.id)
                              ? darkMode
                                ? 'border-slate-700 bg-slate-800 text-slate-400 cursor-not-allowed'
                                : 'border-gray-300 bg-gray-100 text-gray-500 cursor-not-allowed'
                              : darkMode
                              ? 'border-sky-600/30 bg-sky-950/40 text-sky-200 hover:bg-sky-900/30'
                              : 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100'
                          }`}
                          onClick={() => handleInstall(script.id)}
                          disabled={myScripts.some(s => s.id === script.id)}
                        >
                          {myScripts.some(s => s.id === script.id) ? '✓ Installé' : 'Installer'}
                        </Button>
                      )}
                      <Button
                        className={`h-7 border px-2 text-xs ${
                          darkMode ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700' : 'border-gray-300 bg-slate-50 text-slate-700 hover:bg-slate-200'
                        }`}
                        onClick={() => handleCopy(script.source_code)}
                      >
                        Copier
                      </Button>
                    </div>
                  </div>
                  {script.description && (
                    <p className={`mt-1 text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{script.description}</p>
                  )}
                  <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
                    <div className="flex-1">
                      <label className={`mb-1 block text-[10px] uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                        Evidence UID
                      </label>
                      <Input
                        value={runTargets[script.id] || ''}
                        onChange={(event) =>
                          setRunTargets((prev) => ({
                            ...prev,
                            [script.id]: event.target.value,
                          }))
                        }
                        placeholder="ex: demo_evidence_001"
                      />
                    </div>
                    <Button
                      className={`mt-2 w-full md:mt-6 md:w-auto ${
                        runningScriptId === script.id || !runnable
                          ? 'opacity-70 cursor-not-allowed'
                          : darkMode
                          ? 'border-emerald-600/30 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-900/30'
                          : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                      onClick={() => handleRunScript(script.id)}
                      disabled={runningScriptId === script.id || !runnable}
                    >
                      {runningScriptId === script.id ? 'Execution...' : runnable ? 'Exécuter' : 'Langage non supporté'}
                    </Button>
                  </div>
                  {!runnable && (
                    <p className={`text-[11px] ${darkMode ? 'text-slate-500' : 'text-gray-600'}`}>
                      L'exécution automatique n'est disponible que pour les scripts Python pour le moment.
                    </p>
                  )}
                      </>
                    );
                  })()}
                  <pre
                    className={`mt-3 overflow-auto rounded-lg border p-3 text-xs ${
                      darkMode
                        ? 'border-slate-800 bg-slate-950 text-slate-200'
                        : 'border-gray-200 bg-slate-50 text-gray-900'
                    }`}
                  >
                    {script.source_code}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
