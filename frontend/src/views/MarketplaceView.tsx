import { useEffect, useState } from 'react';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { scriptsAPI } from '../services/api';
import type { ScriptSummary } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface MarketplaceViewProps {
  darkMode: boolean;
}

export function MarketplaceView({ darkMode }: MarketplaceViewProps) {
  const [scripts, setScripts] = useState<ScriptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    const load = async () => {
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
    load();
  }, []);

  const handleAssign = async (scriptId: number) => {
    if (!isAdmin || !user) return;
    setAssigningId(scriptId);
    setError(null);
    setSuccess(null);
    try {
      await scriptsAPI.assign(scriptId, user.id);
      setSuccess('Script ajouté à votre profil.');
    } catch (err: any) {
      setError(err.message || "Impossible d'ajouter le script.");
    } finally {
      setAssigningId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className={darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-gray-200 bg-white'}>
        <CardContent className="space-y-2">
          <h2 className={`text-lg font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>Marketplace de plugins</h2>
          <p className={darkMode ? 'text-slate-400 text-sm' : 'text-gray-600 text-sm'}>
            Parcourez les scripts validés par les administrateurs. Les analystes peuvent consulter et demander une installation.
            Les administrateurs peuvent ajouter un script à leur profil via le bouton dédié.
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
                  {isAdmin && (
                    <Button
                      className={`ml-auto h-8 px-3 text-xs ${
                        assigningId === script.id
                          ? 'opacity-70 cursor-not-allowed'
                          : darkMode
                          ? 'border-emerald-600/30 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-900/30'
                          : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                      onClick={() => handleAssign(script.id)}
                      disabled={assigningId === script.id}
                    >
                      {assigningId === script.id ? 'Ajout...' : 'Ajouter à mon profil'}
                    </Button>
                  )}
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
