import { useEffect, useMemo, useState } from 'react';
import { Users, UserCheck, Activity, RefreshCcw, UserPlus, UserMinus } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { adminAPI } from '../services/api';
import type { UserAccount, UserRole, AdminStats } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface SuperAdminViewProps {
  darkMode: boolean;
}

const roleLabels: Record<UserRole, string> = {
  superadmin: 'Superadmins',
  admin: 'Admins',
  analyst: 'Analysts',
  viewer: 'Viewers',
};

const roleOrder: UserRole[] = ['superadmin', 'admin', 'analyst', 'viewer'];

const statusColors: Record<string, string> = {
  healthy: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  degraded: 'bg-amber-500/10 text-amber-200 border-amber-500/30',
  unhealthy: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
};

export function SuperAdminView({ darkMode }: SuperAdminViewProps) {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);
  const [platformStats, setPlatformStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    full_name: '',
    role: 'analyst' as UserRole,
    password: '',
  });
  const { user } = useAuth();

  const validateNewUser = () => {
    if (newUser.username.trim().length < 3) {
      return 'Le nom d’utilisateur doit contenir au moins 3 caractères.';
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(newUser.email.trim())) {
      return 'Adresse email invalide.';
    }
    if (newUser.password.length < 8) {
      return 'Le mot de passe doit contenir au moins 8 caractères.';
    }
    return null;
  };

  useEffect(() => {
    refreshUsers();
    refreshStats();
  }, []);

  const refreshUsers = async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const data = await adminAPI.listUsers();
      setUsers(data);
    } catch (err: any) {
      setUsersError(err?.message || 'Unable to load users');
    } finally {
      setUsersLoading(false);
    }
  };

  const refreshStats = async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const statsResponse = await adminAPI.getStats();
      setPlatformStats(statsResponse);
    } catch (err: any) {
      setStatsError(err?.message || 'Impossible de récupérer les statistiques globales');
    } finally {
      setStatsLoading(false);
    }
  };

  const handleDeleteUser = async (userId: number, username: string) => {
    if (user?.id === userId) {
      setUsersError('Impossible de supprimer votre propre compte.');
      return;
    }

    if (!confirm(`Supprimer l'utilisateur ${username} ?`)) {
      return;
    }

    try {
      await adminAPI.deleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err: any) {
      setUsersError(err?.message || 'Suppression impossible');
    }
  };

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setUsersError(null);
    setUserSuccess(null);

    const validationError = validateNewUser();
    if (validationError) {
      setUsersError(validationError);
      return;
    }

    setCreatingUser(true);
    try {
      const created = await adminAPI.createUser({
        username: newUser.username.trim(),
        email: newUser.email.trim(),
        password: newUser.password,
        full_name: newUser.full_name?.trim() || undefined,
        role: newUser.role,
      });
      setUsers((prev) => [created, ...prev]);
      setUserSuccess(`Utilisateur ${created.username} créé.`);
      setNewUser({ username: '', email: '', full_name: '', role: newUser.role, password: '' });
    } catch (err: any) {
      setUsersError(err?.message || 'Création impossible');
    } finally {
      setCreatingUser(false);
    }
  };

  const roleStats = useMemo(() => {
    const base: Record<UserRole, number> = {
      superadmin: 0,
      admin: 0,
      analyst: 0,
      viewer: 0,
    };
    users.forEach((u) => {
      base[u.role] += 1;
    });
    return base;
  }, [users]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className={`text-2xl font-semibold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
          Superadmin Console
        </h2>
        <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Gérez les comptes utilisateurs, surveillez la santé du cluster et gardez une vue globale.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className={darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-gray-200 bg-white'}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className={`h-4 w-4 ${darkMode ? 'text-slate-300' : 'text-slate-500'}`} />
                <span className="text-sm font-semibold">Répartition des rôles</span>
              </div>
              <Badge className="text-[10px]">{users.length} utilisateurs</Badge>
            </div>
            {usersLoading ? (
              <p className={`text-sm ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>Chargement…</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {roleOrder.map((role) => (
                  <div
                    key={role}
                    className={`rounded-lg border p-3 ${darkMode ? 'border-slate-800 bg-slate-900/50' : 'border-gray-200 bg-slate-50'}`}
                  >
                    <p className={`text-xs uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      {roleLabels[role]}
                    </p>
                    <p className={`text-2xl font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      {roleStats[role]}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-gray-200 bg-white'}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className={`h-4 w-4 ${darkMode ? 'text-slate-300' : 'text-slate-500'}`} />
                <span className="text-sm font-semibold">Statistiques globales</span>
              </div>
              <Button
                onClick={refreshStats}
                className={`${darkMode ? 'border-slate-800 bg-slate-900/40 text-slate-200' : 'border-gray-200 bg-white text-slate-700'} h-7 px-2 text-xs`}
              >
                <RefreshCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
            {statsError && <p className="text-sm text-rose-400">{statsError}</p>}
            {statsLoading ? (
              <p className={`text-sm ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>Chargement…</p>
            ) : platformStats ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className={`rounded-lg border p-3 ${darkMode ? 'border-slate-800 bg-slate-900/40' : 'border-gray-200 bg-slate-50'}`}>
                    <p className={`text-xs uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Utilisateurs actifs</p>
                    <p className={`text-2xl font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{platformStats.users.active_last_15m}</p>
                    <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>{platformStats.users.total} au total</p>
                  </div>
                  <div className={`rounded-lg border p-3 ${darkMode ? 'border-slate-800 bg-slate-900/40' : 'border-gray-200 bg-slate-50'}`}>
                    <p className={`text-xs uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Cases & Evidences</p>
                    <p className={`text-2xl font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{platformStats.cases.total}</p>
                    <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>{platformStats.cases.evidences} evidences</p>
                  </div>
                  <div className={`rounded-lg border p-3 ${darkMode ? 'border-slate-800 bg-slate-900/40' : 'border-gray-200 bg-slate-50'}`}>
                    <p className={`text-xs uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Task Runs</p>
                    <p className={`text-2xl font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{platformStats.task_runs.total}</p>
                    <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>{platformStats.task_runs.running} en cours · {platformStats.task_runs.queued} en file d'attente</p>
                  </div>
                  <div className={`rounded-lg border p-3 ${darkMode ? 'border-slate-800 bg-slate-900/40' : 'border-gray-200 bg-slate-50'}`}>
                    <p className={`text-xs uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Mise à jour</p>
                    <p className={`text-xs ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{new Date(platformStats.generated_at).toLocaleString()}</p>
                  </div>
                </div>
                <div className="grid gap-2">
                  {Object.entries(platformStats.services).map(([service, info]) => (
                    <div
                      key={service}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                        darkMode ? 'border-slate-800 bg-slate-900/40' : 'border-gray-200 bg-slate-50'
                      }`}
                    >
                      <span className="font-medium capitalize">{service}</span>
                      <Badge className={`text-[10px] border ${statusColors[info.status] || statusColors.unhealthy}`}>
                        {info.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className={darkMode ? 'border-slate-800 bg-slate-950/30' : 'border-gray-200 bg-white'}>
        <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className={`h-4 w-4 ${darkMode ? 'text-slate-300' : 'text-slate-500'}`} />
                <span className="text-sm font-semibold">Gestion des utilisateurs</span>
              </div>
              <div className="flex gap-2">
              <Button
                onClick={refreshUsers}
                className={`${darkMode ? 'border-slate-800 bg-slate-900/40 text-slate-200' : 'border-gray-200 bg-white text-slate-700'} h-8 px-3 text-xs`}
              >
                <RefreshCcw className="h-3.5 w-3.5" /> Refresh
              </Button>
            </div>
          </div>
          {usersError && <p className="text-sm text-rose-400">{usersError}</p>}
          {userSuccess && <p className="text-sm text-emerald-400">{userSuccess}</p>}

          <form onSubmit={handleCreateUser} className="grid gap-3 md:grid-cols-4 bg-slate-900/10 rounded-lg p-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase tracking-wide text-slate-400">Username *</label>
              <input
                value={newUser.username}
                onChange={(e) => setNewUser((prev) => ({ ...prev, username: e.target.value }))}
                className={`rounded border px-2 py-1 text-sm ${darkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-gray-300 bg-white text-slate-900'}`}
                placeholder="jdoe"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase tracking-wide text-slate-400">Email *</label>
              <input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))}
                className={`rounded border px-2 py-1 text-sm ${darkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-gray-300 bg-white text-slate-900'}`}
                placeholder="user@example.com"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase tracking-wide text-slate-400">Rôle *</label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser((prev) => ({ ...prev, role: e.target.value as UserRole }))}
                className={`rounded border px-2 py-1 text-sm ${darkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-gray-300 bg-white text-slate-900'}`}
              >
                {roleOrder.map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[role]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase tracking-wide text-slate-400">Mot de passe *</label>
              <input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser((prev) => ({ ...prev, password: e.target.value }))}
                className={`rounded border px-2 py-1 text-sm ${darkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-gray-300 bg-white text-slate-900'}`}
                placeholder="••••••••"
              />
            </div>
            <div className="md:col-span-3 flex flex-col gap-1">
              <label className="text-xs uppercase tracking-wide text-slate-400">Nom complet</label>
              <input
                value={newUser.full_name}
                onChange={(e) => setNewUser((prev) => ({ ...prev, full_name: e.target.value }))}
                className={`rounded border px-2 py-1 text-sm ${darkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-gray-300 bg-white text-slate-900'}`}
                placeholder="Jane Doe"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="submit"
                disabled={creatingUser}
                className={`${darkMode ? 'border-emerald-600/30 bg-emerald-900/40 text-emerald-100' : 'border-emerald-300 bg-emerald-50 text-emerald-700'} h-9 px-3 text-sm ${creatingUser ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {creatingUser ? 'Création…' : (
                  <>
                    <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                    Créer
                  </>
                )}
              </Button>
            </div>
          </form>
          <div
            className={`overflow-auto rounded-lg border ${darkMode ? 'border-slate-800/30' : 'border-gray-200'}`}
          >
            <table className="w-full text-sm">
              <thead className={darkMode ? 'bg-slate-900 text-slate-400' : 'bg-slate-100 text-slate-600'}>
                <tr>
                  <th className="px-3 py-2 text-left">Utilisateur</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Rôle</th>
                  <th className="px-3 py-2 text-left">Statut</th>
                  <th className="px-3 py-2 text-left">Créé</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className={darkMode ? 'divide-y divide-slate-800' : 'divide-y divide-gray-200'}>
                {usersLoading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-sm">
                      Chargement des utilisateurs…
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-sm">
                      Aucun utilisateur trouvé.
                    </td>
                  </tr>
                ) : (
                  users.map((account) => (
                    <tr key={account.id}>
                      <td className="px-3 py-2 font-medium">{account.username}</td>
                      <td className="px-3 py-2">{account.email}</td>
                      <td className="px-3 py-2">
                        <Badge className="text-[10px] uppercase">{account.role}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <span className={`text-xs ${account.is_active ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {account.is_active ? 'Actif' : 'Désactivé'}
                          </span>
                          <div className="flex gap-1 text-[10px]">
                            <Badge className={account.email_verified ? 'bg-emerald-500/10 text-emerald-200' : 'bg-amber-500/10 text-amber-200'}>
                              Email {account.email_verified ? 'OK' : 'pending'}
                            </Badge>
                            <Badge className={account.otp_enabled ? 'bg-emerald-500/10 text-emerald-200' : 'bg-slate-500/10 text-slate-300'}>
                              OTP {account.otp_enabled ? 'ON' : 'OFF'}
                            </Badge>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-400">
                        {new Date(account.created_at_utc).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          onClick={() => handleDeleteUser(account.id, account.username)}
                          disabled={account.id === user?.id}
                          className={`h-7 px-2 text-xs ${
                            darkMode
                              ? 'border-rose-600/30 bg-rose-950/40 text-rose-200'
                              : 'border-rose-200 bg-rose-50 text-rose-700'
                          } ${account.id === user?.id ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          <UserMinus className="mr-1 h-3.5 w-3.5" /> Supprimer
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
