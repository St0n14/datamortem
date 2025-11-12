import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
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
    python_version: '3.11',
    requirements: '',
  });
  const [githubForm, setGithubForm] = useState({
    repo_url: '',
    branch: 'main',
    scripts_path: 'scripts',
  });
  const [isImporting, setIsImporting] = useState(false);
  const [isGithubSectionOpen, setIsGithubSectionOpen] = useState(false);
  const [isScriptsSectionOpen, setIsScriptsSectionOpen] = useState(true);
  const [editingScript, setEditingScript] = useState<Script | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editSourceCode, setEditSourceCode] = useState('');
  const [editRequirements, setEditRequirements] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const { user } = useAuth();
  const role = user?.role ?? 'viewer';
  const canManageScripts = role === 'superadmin';
  const canRunScripts = role === 'superadmin' || role === 'admin';

  useEffect(() => {
    if (canManageScripts || canRunScripts) {
      loadScripts();
    } else {
      setIsLoading(false);
    }
  }, [canManageScripts, canRunScripts]);

  const loadScripts = async () => {
    if (!canManageScripts && !canRunScripts) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = canManageScripts ? await scriptsAPI.list() : await scriptsAPI.myScripts();
      setScripts(data);
    } catch (err: any) {
      setError(err.message || 'Unable to load scripts');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManageScripts) {
      setError("Seuls les superadmins peuvent créer des scripts.");
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
        python_version: formState.python_version,
        requirements: formState.requirements,
      });
      setScripts((prev) => [created, ...prev]);
      setFormState({ name: '', description: '', source_code: '', language: formState.language, python_version: '3.11', requirements: '' });
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
    if (!canRunScripts) {
      setError("Seuls les admins ou superadmins peuvent exécuter des scripts.");
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
    if (!canManageScripts) {
      setError("Seuls les superadmins peuvent approuver des scripts.");
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await scriptsAPI.approve(scriptId, approved);
      setSuccess(approved ? 'Script approuvé pour le marketplace!' : 'Approbation retirée.');
      await loadScripts();
    } catch (err: any) {
      setError(err.message || "Impossible de modifier l'approbation.");
    }
  };

  const handleUninstallFromAll = async (scriptId: number, scriptName: string) => {
    if (!canManageScripts) {
      setError("Seuls les superadmins peuvent désinstaller des scripts.");
      return;
    }

    if (!confirm(`Êtes-vous sûr de vouloir désinstaller "${scriptName}" de tous les profils utilisateurs ?`)) {
      return;
    }

    setError(null);
    setSuccess(null);
    try {
      const result = await scriptsAPI.uninstallFromAll(scriptId);
      setSuccess(`Script désinstallé de ${result.uninstalled_from} profil(s) utilisateur(s).`);
      await loadScripts();
    } catch (err: any) {
      setError(err.message || "Impossible de désinstaller le script.");
    }
  };

  const handleGitHubImport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManageScripts) {
      setError("Seuls les superadmins peuvent importer depuis GitHub.");
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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    // Vérifier que le fichier est un .py
    if (!file.name.endsWith('.py')) {
      setError('Veuillez sélectionner un fichier Python (.py)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setFormState((prev) => ({ ...prev, source_code: content }));
      setSuccess('Fichier Python chargé avec succès.');
    };
    reader.onerror = () => {
      setError('Erreur lors de la lecture du fichier.');
    };
    reader.readAsText(file);

    // Réinitialiser l'input pour permettre de sélectionner le même fichier à nouveau
    event.target.value = '';
  };

  const handleOpenEditModal = (script: Script) => {
    setEditingScript(script);
    setEditSourceCode(script.source_code);
    setEditRequirements(script.requirements || '');
    setIsEditModalOpen(true);
    setError(null);
    setSuccess(null);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingScript(null);
    setEditSourceCode('');
    setEditRequirements('');
    setError(null);
    setSuccess(null);
  };

  const handleUpdateScript = async () => {
    if (!editingScript || !editSourceCode.trim()) {
      setError('Le code source ne peut pas être vide.');
      return;
    }

    setIsUpdating(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await scriptsAPI.update(editingScript.id, {
        source_code: editSourceCode,
        requirements: editRequirements.trim() || undefined,
      });
      setScripts((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      handleCloseEditModal();
      setSuccess('Script mis à jour avec succès.');
      // Effacer le message de succès après 3 secondes
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Impossible de mettre à jour le script.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className={darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-gray-200 bg-white'}>
        <CardContent className="space-y-4 p-6">
          <div>
            <h2 className={`text-lg font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>Gestion des Scripts</h2>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
              {canManageScripts
                ? 'Créer, gérer et approuver des scripts d\'analyse. Les scripts approuvés apparaissent dans le Marketplace pour tous les utilisateurs.'
                : canRunScripts
                ? "Vous pouvez exécuter les scripts approuvés installés via le Marketplace ou affectés par un superadmin."
                : "Vous n'avez pas les permissions nécessaires pour gérer ou exécuter des scripts. Rendez-vous dans Marketplace pour en consulter la liste."}
            </p>
          </div>

          {canManageScripts ? (
            <>
              <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-200' : 'text-gray-700'}`}>
                    Nom *
                  </label>
                  <Input
                    value={formState.name}
                    onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Ex: enrich_process_metadata"
                    required
                  />
                </div>
                <div>
                  <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-200' : 'text-gray-700'}`}>
                    Langage *
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
                <div>
                  <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-200' : 'text-gray-700'}`}>
                    Version Python
                  </label>
                  <select
                    value={formState.python_version}
                    onChange={(event) => setFormState((prev) => ({ ...prev, python_version: event.target.value }))}
                    disabled={formState.language !== 'python'}
                    className={`w-full rounded-lg border px-3 py-2 text-sm ${
                      darkMode ? 'border-slate-800 bg-slate-900 text-slate-100' : 'border-gray-300 bg-white text-gray-900'
                    } ${formState.language !== 'python' ? 'opacity-60' : ''}`}
                  >
                    {['3.12', '3.11', '3.10', '3.9'].map((version) => (
                      <option key={version} value={version}>
                        {version}
                      </option>
                    ))}
                  </select>
                  <p className={`mt-1 text-[11px] ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>
                    Utilisée uniquement pour les scripts Python (exécution via venv dédié).
                  </p>
                </div>
              </div>

              <div>
                <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-200' : 'text-gray-700'}`}>
                  Description
                </label>
                <textarea
                  className={`min-h-[80px] w-full rounded-lg border px-3 py-2 text-sm ${
                    darkMode
                      ? 'border-slate-800 bg-slate-900 text-slate-100 focus:border-violet-600 focus:outline-none'
                      : 'border-gray-300 bg-white text-gray-900 focus:border-violet-500 focus:outline-none'
                  }`}
                  value={formState.description}
                  onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Décrivez le rôle et la fonctionnalité de ce script..."
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={`block text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-200' : 'text-gray-700'}`}>
                    Code Source *
                  </label>
                  <label
                    className={`cursor-pointer text-xs px-3 py-1 rounded border ${
                      darkMode
                        ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                        : 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Uploader un fichier .py
                    <input
                      type="file"
                      accept=".py"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
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

              <div>
                <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-200' : 'text-gray-700'}`}>
                  Dépendances (requirements.txt)
                </label>
                <textarea
                  className={`min-h-[120px] w-full rounded-lg border px-3 py-2 font-mono text-sm ${
                    darkMode
                      ? 'border-slate-800 bg-slate-900 text-slate-100 focus:border-violet-600 focus:outline-none'
                      : 'border-gray-300 bg-white text-gray-900 focus:border-violet-500 focus:outline-none'
                  }`}
                  value={formState.requirements}
                  onChange={(event) => setFormState((prev) => ({ ...prev, requirements: event.target.value }))}
                  placeholder="requests==2.31.0&#10;rich>=13.0.0"
                />
                <p className={`mt-1 text-[11px] ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>
                  Un package par ligne (format requirements.txt). Laisser vide si aucune dépendance.
                </p>
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
              <div
                className={`flex items-center justify-between mb-3 cursor-pointer ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}
                onClick={() => setIsGithubSectionOpen(!isGithubSectionOpen)}
              >
                <h3 className="text-sm font-semibold">
                  Importer depuis GitHub
                </h3>
                {isGithubSectionOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>

              {isGithubSectionOpen && (
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
              )}
            </div>
            </>
          ) : (
            <div
              className={`rounded-xl border px-4 py-5 text-sm ${
                darkMode ? 'border-slate-800 bg-slate-900 text-slate-200' : 'border-gray-200 bg-gray-50 text-gray-800'
              }`}
            >
              {canRunScripts
                ? "Gestion réservée aux superadmins. Installez vos scripts via le Marketplace, puis utilisez les formulaires ci-dessous pour les exécuter."
                : "Vous visualisez le catalogue en lecture seule. Demandez à un superadmin pour faire exécuter un script si nécessaire."}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-gray-200 bg-slate-50'}>
        <CardContent className="space-y-4 p-6">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setIsScriptsSectionOpen(!isScriptsSectionOpen)}
          >
            <div className="flex items-center gap-2">
              <h3 className={`text-base font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>Scripts enregistrés</h3>
              {isScriptsSectionOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
            <Badge className={darkMode ? 'border-slate-700 bg-slate-900 text-slate-200' : 'border-gray-200 bg-gray-50 text-slate-700'}>
              {scripts.length} scripts
            </Badge>
          </div>

          {isScriptsSectionOpen && (isLoading ? (
            <p className={darkMode ? 'text-slate-400' : 'text-gray-600'}>Chargement...</p>
          ) : scripts.length === 0 ? (
            <div
              className={`rounded-lg border px-4 py-6 text-center text-sm ${
                darkMode ? 'border-slate-800 text-slate-400' : 'border-gray-200 text-gray-600'
              }`}
            >
              {canManageScripts
                ? 'Aucun script pour le moment. Commencez par en créer un ci-dessus.'
                : canRunScripts
                ? 'Aucun script installé pour votre profil. Installez-en via le Marketplace.'
                : 'Aucun script disponible pour votre profil.'}
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
                    const requirementCount =
                      script.requirements?.split(/\r?\n/).filter((line) => line.trim().length > 0).length ?? 0;
                    const canExecute = canRunScripts && runnable;
                    const runDisabled = runningScriptId === script.id || !canExecute;
                    const runLabel = runningScriptId === script.id
                      ? 'Execution...'
                      : !canRunScripts
                      ? 'Accès restreint'
                      : runnable
                      ? 'Exécuter'
                      : 'Langage non supporté';
                    const runTitle = !canRunScripts
                      ? "Exécution réservée aux admins/superadmins."
                      : !runnable
                      ? "Seuls les scripts Python sont supportés."
                      : undefined;
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
                    <Badge className={darkMode ? 'border-slate-700 bg-slate-900 text-slate-200' : 'border-gray-300 bg-white text-gray-700'}>
                      Python {script.python_version || '3.x'}
                    </Badge>
                    {requirementCount > 0 && (
                      <span className={`text-[11px] ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                        {requirementCount} dépendance{requirementCount > 1 ? 's' : ''}
                      </span>
                    )}
                    <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>
                      {new Date(script.created_at_utc).toLocaleString()}
                    </span>
                    <div className="ml-auto flex gap-2">
                      {canManageScripts && (
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
                      {canManageScripts && (
                        <Button
                          className={`h-7 border px-2 text-xs ${
                            darkMode
                              ? 'border-orange-600/30 bg-orange-950/40 text-orange-200 hover:bg-orange-900/30'
                              : 'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100'
                          }`}
                          onClick={() => handleUninstallFromAll(script.id, script.name)}
                        >
                          Désinstaller de tous les profils
                        </Button>
                      )}
                      {canManageScripts && (
                        <Button
                          className={`h-7 border px-2 text-xs ${
                            darkMode
                              ? 'border-blue-600/30 bg-blue-950/40 text-blue-200 hover:bg-blue-900/30'
                              : 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
                          }`}
                          onClick={() => handleOpenEditModal(script)}
                        >
                          Modifier
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
                    <div className={`mt-3 rounded-lg border px-3 py-2 ${darkMode ? 'border-slate-800 bg-slate-900/40' : 'border-gray-200 bg-gray-50'}`}>
                      <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                        Description
                      </p>
                      <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{script.description}</p>
                    </div>
                  )}
                  {script.requirements && requirementCount > 0 && (
                    <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${darkMode ? 'border-slate-800 bg-slate-900/30' : 'border-gray-200 bg-white'}`}>
                      <p className={`font-semibold uppercase tracking-wide mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                        Dépendances ({requirementCount})
                      </p>
                      <pre className="max-h-24 overflow-auto whitespace-pre-wrap">{script.requirements}</pre>
                    </div>
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
                        disabled={!canRunScripts}
                        title={!canRunScripts ? "Profil sans accès exécution." : undefined}
                      />
                    </div>
                    <Button
                      className={`mt-2 w-full md:mt-6 md:w-auto ${
                        runDisabled
                          ? 'opacity-70 cursor-not-allowed'
                          : darkMode
                          ? 'border-emerald-600/30 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-900/30'
                          : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                      onClick={() => handleRunScript(script.id)}
                      disabled={runDisabled}
                      title={runTitle}
                    >
                      {runLabel}
                    </Button>
                  </div>
                  {!canRunScripts ? (
                    <p className={`text-[11px] ${darkMode ? 'text-slate-500' : 'text-gray-600'}`}>
                      Exécution réservée aux admins et superadmins.
                    </p>
                  ) : (
                    !runnable && (
                      <p className={`text-[11px] ${darkMode ? 'text-slate-500' : 'text-gray-600'}`}>
                        L'exécution automatique n'est disponible que pour les scripts Python pour le moment.
                      </p>
                    )
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
          ))}
        </CardContent>
      </Card>

      {/* Modal d'édition du code source */}
      {isEditModalOpen && editingScript && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={handleCloseEditModal}
        >
          <div
            className={`w-full max-w-7xl max-h-[95vh] flex flex-col rounded-lg border shadow-2xl ${
              darkMode ? 'border-slate-800 bg-slate-950' : 'border-gray-200 bg-white'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between border-b px-6 py-4 ${
              darkMode ? 'border-slate-800' : 'border-gray-200'
            }`}>
              <div>
                <h3 className={`text-lg font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                  Modifier le script
                </h3>
                <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                  {editingScript.name}
                </p>
              </div>
              <button
                onClick={handleCloseEditModal}
                className={`rounded-lg p-2 transition ${
                  darkMode
                    ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 flex flex-col min-h-0 p-6 overflow-y-auto">
              <div className="mb-4">
                <label className={`mb-2 block text-sm font-semibold ${darkMode ? 'text-slate-200' : 'text-gray-700'}`}>
                  Code Source *
                </label>
                <textarea
                  className={`min-h-[600px] w-full rounded-lg border px-4 py-3 font-mono text-base resize-none ${
                    darkMode
                      ? 'border-slate-800 bg-slate-900 text-slate-100 focus:border-violet-600 focus:outline-none'
                      : 'border-gray-300 bg-white text-gray-900 focus:border-violet-500 focus:outline-none'
                  }`}
                  value={editSourceCode}
                  onChange={(e) => setEditSourceCode(e.target.value)}
                  placeholder="# Votre script Python..."
                />
              </div>
              <div>
                <label className={`mb-2 block text-sm font-semibold ${darkMode ? 'text-slate-200' : 'text-gray-700'}`}>
                  Dépendances (requirements.txt)
                </label>
                <textarea
                  className={`min-h-[150px] w-full rounded-lg border px-4 py-3 font-mono text-sm resize-none ${
                    darkMode
                      ? 'border-slate-800 bg-slate-900 text-slate-100 focus:border-violet-600 focus:outline-none'
                      : 'border-gray-300 bg-white text-gray-900 focus:border-violet-500 focus:outline-none'
                  }`}
                  value={editRequirements}
                  onChange={(e) => setEditRequirements(e.target.value)}
                  placeholder="requests==2.31.0&#10;rich>=13.0.0"
                />
                <p className={`mt-1 text-[11px] ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>
                  Un package par ligne (format requirements.txt). Laisser vide si aucune dépendance.
                </p>
              </div>
            </div>

            <div className={`flex items-center justify-between gap-3 px-6 py-4 border-t ${
              darkMode ? 'border-slate-800' : 'border-gray-200'
            }`}>
              <div className="flex-1">
                {error && <span className="text-xs text-rose-500">{error}</span>}
                {success && <span className="text-xs text-emerald-500">{success}</span>}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleCloseEditModal}
                  className={
                    darkMode
                      ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      : 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }
                >
                  Annuler
                </Button>
                <Button
                  onClick={handleUpdateScript}
                  disabled={isUpdating || !editSourceCode.trim()}
                  className={
                    isUpdating || !editSourceCode.trim()
                      ? 'opacity-70 cursor-not-allowed'
                      : darkMode
                      ? 'border-violet-600/40 bg-violet-950/40 text-violet-200 hover:bg-violet-900/40'
                      : 'border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100'
                  }
                >
                  {isUpdating ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
