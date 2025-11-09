import { useEffect, useState } from 'react';
import { Card, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { rulesAPI } from '../services/api';
import type { Rule } from '../types';

const RULE_TYPES: Rule['rule_type'][] = ['yara', 'custom', 'network', 'hayabusa', 'sigma'];
const SEVERITIES: Rule['severity'][] = ['low', 'medium', 'high', 'critical'];

interface RulesViewProps {
  darkMode: boolean;
}

export function RulesView({ darkMode }: RulesViewProps) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    name: '',
    rule_type: 'yara' as Rule['rule_type'],
    severity: 'medium' as Rule['severity'],
    scope: '',
    applies_to: '',
    tags: '',
    logic: '',
  });

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await rulesAPI.list();
      setRules(data);
    } catch (err: any) {
      setError(err.message || 'Impossible de charger les règles');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formState.name || !formState.logic || !formState.scope || !formState.applies_to) {
      setError('Merci de renseigner tous les champs obligatoires.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await rulesAPI.create({
        name: formState.name,
        rule_type: formState.rule_type,
        severity: formState.severity,
        scope: formState.scope,
        applies_to: formState.applies_to,
        tags: formState.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        logic: formState.logic,
      });
      setRules((prev) => [created, ...prev]);
      setFormState({
        name: '',
        rule_type: formState.rule_type,
        severity: formState.severity,
        scope: '',
        applies_to: '',
        tags: '',
        logic: '',
      });
      setSuccess('Règle sauvegardée.');
    } catch (err: any) {
      setError(err.message || 'Impossible de sauvegarder la règle');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className={darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-gray-200 bg-slate-50'}>
        <CardContent className="space-y-4 p-6">
          <div>
            <h2 className={`text-lg font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>Nouvelle règle</h2>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
              Choisissez un moteur (Yara, Sigma, etc.) et définissez sa portée.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                  Nom
                </label>
                <Input
                  value={formState.name}
                  onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Suspicious lateral movement"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                    Type
                  </label>
                  <select
                    value={formState.rule_type}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, rule_type: event.target.value as Rule['rule_type'] }))
                    }
                    className={`w-full rounded-lg border px-3 py-2 text-sm ${
                      darkMode ? 'border-slate-800 bg-slate-900 text-slate-100' : 'border-gray-300 bg-slate-50 text-gray-900'
                    }`}
                  >
                    {RULE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                    Sévérité
                  </label>
                  <select
                    value={formState.severity}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, severity: event.target.value as Rule['severity'] }))
                    }
                    className={`w-full rounded-lg border px-3 py-2 text-sm ${
                      darkMode ? 'border-slate-800 bg-slate-900 text-slate-100' : 'border-gray-300 bg-slate-50 text-gray-900'
                    }`}
                  >
                    {SEVERITIES.map((sev) => (
                      <option key={sev} value={sev}>
                        {sev.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                  Portée (scope)
                </label>
                <Input
                  value={formState.scope}
                  onChange={(event) => setFormState((prev) => ({ ...prev, scope: event.target.value }))}
                  placeholder="ex: WKST-FA-22 / cluster-b"
                />
              </div>
              <div>
                <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                  S'applique à
                </label>
                <Input
                  value={formState.applies_to}
                  onChange={(event) => setFormState((prev) => ({ ...prev, applies_to: event.target.value }))}
                  placeholder="ex: case:INC-2025-001 ou index:parsers-*"
                />
              </div>
            </div>

            <div>
              <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                Tags (séparés par des virgules)
              </label>
              <Input
                value={formState.tags}
                onChange={(event) => setFormState((prev) => ({ ...prev, tags: event.target.value }))}
                placeholder="lateral_movement, defense_evasion"
              />
            </div>

            <div>
              <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                Logic / Pattern
              </label>
              <textarea
                className={`min-h-[160px] w-full rounded-lg border px-3 py-2 font-mono text-sm ${
                  darkMode
                    ? 'border-slate-800 bg-slate-900 text-slate-100 focus:border-violet-600 focus:outline-none'
                    : 'border-gray-300 bg-slate-50 text-gray-900 focus:border-violet-500 focus:outline-none'
                }`}
                value={formState.logic}
                onChange={(event) => setFormState((prev) => ({ ...prev, logic: event.target.value }))}
                placeholder="rule content (Yara, Sigma YAML, etc.)"
              />
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                disabled={saving}
                className={
                  saving
                    ? 'opacity-70 cursor-not-allowed'
                    : darkMode
                    ? 'border-violet-600/40 bg-violet-950/40 text-violet-200 hover:bg-violet-900/40'
                    : 'border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100'
                }
              >
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
              {success && <span className="text-xs text-emerald-500">{success}</span>}
              {error && <span className="text-xs text-rose-500">{error}</span>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className={darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-gray-200 bg-slate-50'}>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h3 className={`text-base font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>Règles existantes</h3>
            <Badge className={darkMode ? 'border-slate-700 bg-slate-900 text-slate-200' : 'border-gray-200 bg-gray-50 text-slate-700'}>
              {rules.length} règles
            </Badge>
          </div>

          {loading ? (
            <p className={darkMode ? 'text-slate-400' : 'text-gray-600'}>Chargement...</p>
          ) : rules.length === 0 ? (
            <div
              className={`rounded-lg border px-4 py-6 text-center text-sm ${
                darkMode ? 'border-slate-800 text-slate-400' : 'border-gray-200 text-gray-600'
              }`}
            >
              Aucune règle enregistrée pour l’instant.
            </div>
          ) : (
            <div className="space-y-4">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`rounded-xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-900/60' : 'border-gray-200 bg-gray-50'}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className={`text-sm font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>{rule.name}</h4>
                    <Badge className={darkMode ? 'border-violet-600/30 bg-violet-950/40 text-violet-200' : 'border-violet-200 bg-violet-50 text-violet-700'}>
                      {rule.rule_type.toUpperCase()}
                    </Badge>
                    <Badge className={darkMode ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-amber-300 bg-amber-50 text-amber-700'}>
                      {rule.severity.toUpperCase()}
                    </Badge>
                    <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>
                      {new Date(rule.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className={`mt-2 text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Portée&nbsp;: <strong>{rule.scope}</strong> • Applique sur&nbsp;: <strong>{rule.applies_to}</strong>
                  </p>
                  {rule.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {rule.tags.map((tag) => (
                        <Badge key={tag} className={darkMode ? 'border-slate-700 bg-slate-900 text-slate-200' : 'border-gray-200 bg-slate-50 text-slate-700'}>
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <pre
                    className={`mt-3 overflow-auto rounded-lg border p-3 text-xs ${
                      darkMode
                        ? 'border-slate-800 bg-slate-950 text-slate-200'
                        : 'border-gray-200 bg-slate-50 text-gray-900'
                    }`}
                  >
                    {rule.logic}
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
