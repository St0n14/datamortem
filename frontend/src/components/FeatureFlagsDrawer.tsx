import { useEffect, useState } from 'react';
import { X, Settings, ToggleLeft, ToggleRight, RefreshCcw } from 'lucide-react';
import { featureFlagsAPI, type FeatureFlag } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { Card, CardContent } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

interface FeatureFlagsDrawerProps {
  darkMode: boolean;
  isOpen: boolean;
  onClose: () => void;
}

const featureLabels: Record<string, string> = {
  account_creation: 'Création de compte',
  marketplace: 'Marketplace',
  pipeline: 'Pipeline',
};

export function FeatureFlagsDrawer({ darkMode, isOpen, onClose }: FeatureFlagsDrawerProps) {
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingFlags, setUpdatingFlags] = useState<Set<string>>(new Set());
  const { showSuccess, showError } = useToast();

  useEffect(() => {
    if (isOpen) {
      refreshFeatureFlags();
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const refreshFeatureFlags = async () => {
    setLoading(true);
    try {
      const flags = await featureFlagsAPI.list();
      setFeatureFlags(flags);
    } catch (err: any) {
      showError(err?.message || 'Impossible de charger les fonctionnalités', 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFeature = async (featureKey: string, currentEnabled: boolean) => {
    setUpdatingFlags((prev) => new Set(prev).add(featureKey));
    try {
      const updated = await featureFlagsAPI.update(featureKey, !currentEnabled);
      setFeatureFlags((prev) =>
        prev.map((flag) => (flag.feature_key === featureKey ? updated : flag))
      );
      showSuccess(
        `Fonctionnalité "${featureLabels[featureKey] || featureKey}" ${!currentEnabled ? 'activée' : 'désactivée'}`,
        'Mise à jour'
      );
      // Notify other components of the update
      window.dispatchEvent(new CustomEvent('feature-flag-updated', { detail: { featureKey, enabled: !currentEnabled } }));
    } catch (err: any) {
      showError(err?.message || 'Impossible de mettre à jour la fonctionnalité', 'Erreur');
    } finally {
      setUpdatingFlags((prev) => {
        const next = new Set(prev);
        next.delete(featureKey);
        return next;
      });
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 h-full w-full max-w-md z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        } ${darkMode ? 'bg-slate-950' : 'bg-white'}`}
      >
        <div className="flex h-full flex-col border-l border-slate-800">
          {/* Header */}
          <div className={`flex items-center justify-between border-b px-6 py-4 ${
            darkMode ? 'border-slate-800 bg-slate-900/50' : 'border-gray-200 bg-slate-50'
          }`}>
            <div className="flex items-center gap-3">
              <Settings className={`h-5 w-5 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`} />
              <h2 className={`text-lg font-semibold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                Gestion des fonctionnalités
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={refreshFeatureFlags}
                className={`${darkMode ? 'border-slate-800 bg-slate-900/40 text-slate-200' : 'border-gray-200 bg-white text-slate-700'} h-8 px-2 text-xs`}
              >
                <RefreshCcw className="h-3.5 w-3.5" />
              </Button>
              <button
                onClick={onClose}
                className={`rounded-lg p-2 transition ${
                  darkMode
                    ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <p className={`text-sm ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                Chargement…
              </p>
            ) : featureFlags.length === 0 ? (
              <p className={`text-sm ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                Aucune fonctionnalité configurée.
              </p>
            ) : (
              <div className="space-y-3">
                {featureFlags.map((flag) => {
                  const isUpdating = updatingFlags.has(flag.feature_key);
                  return (
                    <Card
                      key={flag.feature_key}
                      className={darkMode ? 'border-slate-800 bg-slate-900/40' : 'border-gray-200 bg-slate-50'}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                                {featureLabels[flag.feature_key] || flag.feature_key}
                              </span>
                              <Badge
                                className={`text-[10px] ${
                                  flag.enabled
                                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                    : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                                }`}
                              >
                                {flag.enabled ? 'Activé' : 'Désactivé'}
                              </Badge>
                            </div>
                            {flag.description && (
                              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                {flag.description}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => handleToggleFeature(flag.feature_key, flag.enabled)}
                            disabled={isUpdating}
                            className={`ml-4 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                              isUpdating
                                ? 'opacity-50 cursor-not-allowed'
                                : flag.enabled
                                ? darkMode
                                  ? 'border-emerald-600/30 bg-emerald-900/40 text-emerald-200 hover:bg-emerald-900/60'
                                  : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : darkMode
                                ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                                : 'border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {flag.enabled ? (
                              <ToggleRight className="h-4 w-4" />
                            ) : (
                              <ToggleLeft className="h-4 w-4" />
                            )}
                            {isUpdating ? 'Mise à jour…' : flag.enabled ? 'Désactiver' : 'Activer'}
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

