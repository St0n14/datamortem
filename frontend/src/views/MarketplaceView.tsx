import { useEffect, useState } from 'react';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { scriptsAPI } from '../services/api';
import type { ScriptSummary, Script } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface MarketplaceViewProps {
  darkMode: boolean;
}

export function MarketplaceView({ darkMode }: MarketplaceViewProps) {
  const [scripts, setScripts] = useState<ScriptSummary[]>([]);
  const [myScripts, setMyScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [installingId, setInstallingId] = useState<number | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    loadMarketplace();
    loadMyScripts();
  }, []);

  const loadMarketplace = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await scriptsAPI.marketplace();
      setScripts(data);
    } catch (err: any) {
      setError(err.message || 'Impossible de charger la marketplace.');
    } finally {
      setLoading(false);
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

  const handleInstall = async (scriptId: number) => {
    setInstallingId(scriptId);
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
    } finally {
      setInstallingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className={darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-gray-200 bg-white'}>
        <CardContent className="space-y-2">
          <h2 className={`text-lg font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>Marketplace de scripts</h2>
          <p className={darkMode ? 'text-slate-400 text-sm' : 'text-gray-600 text-sm'}>
            Parcourez les scripts validés par les administrateurs. Installez-les dans votre profil pour les utiliser dans la Pipeline.
          </p>
          {(error || success) && (
            <div className="pt-1 text-sm">
              {error && <span className="text-rose-500">{error}</span>}
              {success && <span className="text-emerald-500">{success}</span>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-gray-200 bg-white'}>
        <CardContent className="space-y-4">
          {loading ? (
            <p className={darkMode ? 'text-slate-400' : 'text-gray-600'}>Chargement...</p>
          ) : scripts.length === 0 ? (
            <div className={`rounded-lg border px-4 py-5 text-center ${darkMode ? 'border-slate-800 text-slate-400' : 'border-gray-200 text-gray-600'}`}>
              Aucun script disponible pour le moment.
            </div>
          ) : (
            scripts.map((script) => (
              <div
                key={script.id}
                className={`rounded-xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-900/60' : 'border-gray-200 bg-gray-50'}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className={`text-sm font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>{script.name}</h3>
                  <Badge className={darkMode ? 'border-violet-600/30 bg-violet-950/40 text-violet-200' : 'border-violet-200 bg-violet-50 text-violet-700'}>
                    {script.language}
                  </Badge>
                  {script.published_at && (
                    <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>
                      Publié le {new Date(script.published_at).toLocaleDateString()}
                    </span>
                  )}
                  <Button
                    className={`ml-auto h-8 px-3 text-xs ${
                      myScripts.some(s => s.id === script.id)
                        ? darkMode
                          ? 'border-slate-700 bg-slate-800 text-slate-400 cursor-not-allowed'
                          : 'border-gray-300 bg-gray-100 text-gray-500 cursor-not-allowed'
                        : installingId === script.id
                        ? 'opacity-70 cursor-not-allowed'
                        : darkMode
                        ? 'border-sky-600/30 bg-sky-950/40 text-sky-200 hover:bg-sky-900/30'
                        : 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100'
                    }`}
                    onClick={() => handleInstall(script.id)}
                    disabled={installingId === script.id || myScripts.some(s => s.id === script.id)}
                  >
                    {myScripts.some(s => s.id === script.id) ? '✓ Installé' : installingId === script.id ? 'Installation...' : 'Installer'}
                  </Button>
                </div>
                {script.description && (
                  <p className={`mt-1 text-sm ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>{script.description}</p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
