import { useEffect, useMemo, useState } from "react";
import { Lock, Shield, UserCog, Moon, Sun, LogOut } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { useAuth } from "../contexts/AuthContext";
import { authAPI } from "../services/api";
import { SecuritySettingsCard } from "../components/SecuritySettingsCard";
import { Card, CardContent } from "../components/ui/Card";

interface ProfileViewProps {
  darkMode: boolean;
  onToggleTheme: () => void;
}

type ProfileFormState = {
  username: string;
  email: string;
  full_name: string;
};

type PasswordFormState = {
  current: string;
  next: string;
  confirm: string;
};

export function ProfileView({ darkMode, onToggleTheme }: ProfileViewProps) {
  const { user, refreshUser, logout } = useAuth();
  const [profileForm, setProfileForm] = useState<ProfileFormState>({ username: "", email: "", full_name: "" });
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>({ current: "", next: "", confirm: "" });
  const [profileStatus, setProfileStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [passwordStatus, setPasswordStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }
    setProfileForm({
      username: user.username ?? "",
      email: user.email ?? "",
      full_name: user.full_name ?? "",
    });
  }, [user?.username, user?.email, user?.full_name]);

  const inputClass = useMemo(
    () =>
      `w-full rounded-lg border px-3 py-2 text-sm ${
        darkMode ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-900"
      }`,
    [darkMode]
  );

  if (!user) {
    return (
      <div className={`flex h-full items-center justify-center ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
        <p>Chargement du profil...</p>
      </div>
    );
  }

  const handleProfileSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setProfileStatus(null);
    setProfileLoading(true);
    try {
      await authAPI.updateProfile({
        username: profileForm.username.trim() || undefined,
        email: profileForm.email.trim() || undefined,
        full_name: profileForm.full_name.trim(),
      });
      await refreshUser();
      setProfileStatus({ type: "success", message: "Profil mis à jour avec succès." });
    } catch (err: any) {
      setProfileStatus({ type: "error", message: err?.message || "Impossible de mettre à jour le profil." });
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordStatus(null);

    if (!passwordForm.next || passwordForm.next.length < 8) {
      setPasswordStatus({ type: "error", message: "Le nouveau mot de passe doit contenir 8 caractères minimum." });
      return;
    }
    if (passwordForm.next !== passwordForm.confirm) {
      setPasswordStatus({ type: "error", message: "Les mots de passe ne correspondent pas." });
      return;
    }

    setPasswordLoading(true);
    try {
      await authAPI.changePassword({
        current_password: passwordForm.current,
        new_password: passwordForm.next,
      });
      setPasswordStatus({ type: "success", message: "Mot de passe mis à jour avec succès." });
      setPasswordForm({ current: "", next: "", confirm: "" });
    } catch (err: any) {
      setPasswordStatus({ type: "error", message: err?.message || "Impossible de changer le mot de passe." });
    } finally {
      setPasswordLoading(false);
    }
  };

  const initials =
    (user?.full_name || user?.username || "")
      .split(" ")
      .map((chunk) => chunk?.[0] || "")
      .join("")
      .slice(0, 2)
      .toUpperCase();

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      {/* Header intégré avec dark mode et logout */}
      <div className={`flex items-center justify-between border-b pb-4 ${darkMode ? "border-slate-800" : "border-slate-200"}`}>
        <div>
          <h1 className={`text-2xl font-bold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>Mon Profil</h1>
          <p className={`text-sm mt-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
            Gérez vos informations personnelles et vos paramètres
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={onToggleTheme}
            className={`h-9 w-9 rounded-full ${
              darkMode
                ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                : "border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200"
            }`}
            aria-label="Toggle dark mode"
          >
            {darkMode ? <Sun className="h-4 w-4 text-yellow-400" /> : <Moon className="h-4 w-4 text-indigo-600" />}
          </Button>
          <Button
            onClick={logout}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
              darkMode
                ? "border-rose-600/40 bg-rose-900/30 text-rose-100 hover:bg-rose-900/50"
                : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
            }`}
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </Button>
        </div>
      </div>

      {/* Informations utilisateur */}
      <Card className={darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}>
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-full border text-lg font-semibold shrink-0 ${
                darkMode ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-300 bg-slate-50 text-slate-800"
              }`}
            >
              {initials || "DM"}
            </div>
            <div>
              <h2 className={`text-lg font-semibold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>
                {user.full_name || user.username}
              </h2>
              <p className={`text-sm ${darkMode ? "text-slate-400" : "text-slate-600"}`}>{user.email}</p>
              <p className={`text-xs uppercase tracking-wide ${darkMode ? "text-slate-500" : "text-slate-500"}`}>
                {user.role}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profil & identité */}
      <Card className={darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <UserCog className={`h-5 w-5 ${darkMode ? "text-violet-300" : "text-violet-600"}`} />
            <h2 className={`text-lg font-semibold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>
              Profil & identité
            </h2>
          </div>
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div>
              <label className={`block text-xs uppercase tracking-wide mb-2 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                Nom complet
              </label>
              <input
                className={inputClass}
                value={profileForm.full_name}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, full_name: e.target.value }))}
                placeholder="Nom affiché"
              />
            </div>
            <div>
              <label className={`block text-xs uppercase tracking-wide mb-2 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                Pseudo / Username
              </label>
              <input
                className={inputClass}
                value={profileForm.username}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, username: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className={`block text-xs uppercase tracking-wide mb-2 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                Email
              </label>
              <input
                type="email"
                className={inputClass}
                value={profileForm.email}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))}
                required
              />
              <p className={`mt-1 text-xs ${darkMode ? "text-slate-500" : "text-slate-500"}`}>
                {user.email_verified ? (
                  <span className={darkMode ? "text-emerald-400" : "text-emerald-600"}>✓ Email vérifié</span>
                ) : (
                  <span className={darkMode ? "text-amber-400" : "text-amber-600"}>
                    ⚠ Email non vérifié — vérifiez votre boîte mail
                  </span>
                )}
              </p>
            </div>
            {profileStatus && (
              <p
                className={`text-sm ${
                  profileStatus.type === "success"
                    ? darkMode
                      ? "text-emerald-400"
                      : "text-emerald-600"
                    : darkMode
                    ? "text-rose-400"
                    : "text-rose-600"
                }`}
              >
                {profileStatus.message}
              </p>
            )}
            <Button
              type="submit"
              disabled={profileLoading}
              className={`w-full rounded-xl border px-4 py-2 text-sm font-semibold ${
                darkMode ? "border-violet-700 bg-violet-900/40 text-violet-100" : "border-violet-200 bg-violet-50 text-violet-700"
              } ${profileLoading ? "opacity-60" : ""}`}
            >
              {profileLoading ? "Enregistrement..." : "Enregistrer les modifications"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Sécurité du mot de passe */}
      <Card className={darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Lock className={`h-5 w-5 ${darkMode ? "text-emerald-300" : "text-emerald-600"}`} />
            <h2 className={`text-lg font-semibold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>
              Sécurité du mot de passe
            </h2>
          </div>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className={`block text-xs uppercase tracking-wide mb-2 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                Mot de passe actuel
              </label>
              <Input
                type="password"
                value={passwordForm.current}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, current: e.target.value }))}
                className={inputClass}
                placeholder="••••••••"
                required
              />
            </div>
            <div>
              <label className={`block text-xs uppercase tracking-wide mb-2 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                Nouveau mot de passe
              </label>
              <Input
                type="password"
                value={passwordForm.next}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, next: e.target.value }))}
                className={inputClass}
                placeholder="••••••••"
                required
              />
            </div>
            <div>
              <label className={`block text-xs uppercase tracking-wide mb-2 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                Confirmation
              </label>
              <Input
                type="password"
                value={passwordForm.confirm}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirm: e.target.value }))}
                className={inputClass}
                placeholder="••••••••"
                required
              />
            </div>
            {passwordStatus && (
              <p
                className={`text-sm ${
                  passwordStatus.type === "success"
                    ? darkMode
                      ? "text-emerald-400"
                      : "text-emerald-600"
                    : darkMode
                    ? "text-rose-400"
                    : "text-rose-600"
                }`}
              >
                {passwordStatus.message}
              </p>
            )}
            <Button
              type="submit"
              disabled={passwordLoading}
              className={`w-full rounded-xl border px-4 py-2 text-sm font-semibold ${
                darkMode ? "border-emerald-600 bg-emerald-900/30 text-emerald-100" : "border-emerald-200 bg-emerald-50 text-emerald-700"
              } ${passwordLoading ? "opacity-60" : ""}`}
            >
              {passwordLoading ? "Mise à jour..." : "Mettre à jour le mot de passe"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Sécurité & confidentialité */}
      <Card className={darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Shield className={`h-5 w-5 ${darkMode ? "text-violet-300" : "text-violet-600"}`} />
            <h2 className={`text-lg font-semibold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>
              Sécurité & confidentialité
            </h2>
          </div>
          <SecuritySettingsCard darkMode={darkMode} />
        </CardContent>
      </Card>
    </div>
  );
}

