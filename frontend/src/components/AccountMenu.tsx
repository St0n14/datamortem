import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Lock, Shield, UserCog } from "lucide-react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { useAuth } from "../contexts/AuthContext";
import { authAPI } from "../services/api";
import { SecuritySettingsCard } from "./SecuritySettingsCard";

interface AccountMenuProps {
  darkMode: boolean;
  onClose: () => void;
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

export function AccountMenu({ darkMode, onClose }: AccountMenuProps) {
  const { user, refreshUser } = useAuth();
  const [profileForm, setProfileForm] = useState<ProfileFormState>({ username: "", email: "", full_name: "" });
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>({ current: "", next: "", confirm: "" });
  const [profileStatus, setProfileStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [passwordStatus, setPasswordStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);

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
    return null;
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
      setProfileStatus({ type: "success", message: "Profil mis à jour." });
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
      setPasswordStatus({ type: "success", message: "Mot de passe mis à jour." });
      setPasswordForm({ current: "", next: "", confirm: "" });
    } catch (err: any) {
      setPasswordStatus({ type: "error", message: err?.message || "Impossible de changer le mot de passe." });
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div
      className={`absolute right-0 top-full z-30 mt-3 w-[360px] rounded-2xl border shadow-2xl ${
        darkMode ? "border-slate-800 bg-slate-950 text-slate-50" : "border-slate-200 bg-white text-slate-900"
      }`}
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-sm font-semibold">{user.full_name || user.username}</p>
          <p className="text-xs opacity-70">{user.email}</p>
        </div>
        <Button
          type="button"
          onClick={onClose}
          className={`h-8 w-8 rounded-full ${darkMode ? "border-slate-800 bg-slate-900 text-slate-100" : "border-slate-200 bg-slate-50 text-slate-700"}`}
          aria-label="Fermer le panneau compte"
        >
          ✕
        </Button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto px-4 py-3 space-y-4">
        <section>
          <div className="flex items-center gap-2 text-sm font-semibold mb-2">
            <UserCog className="h-4 w-4" />
            Profil & identité
          </div>
          <form onSubmit={handleProfileSubmit} className="space-y-2">
            <div>
              <label className="text-xs uppercase tracking-wide opacity-70">Nom complet</label>
              <input
                className={inputClass}
                value={profileForm.full_name}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, full_name: e.target.value }))}
                placeholder="Nom affiché"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide opacity-70">Pseudo / Username</label>
              <input
                className={inputClass}
                value={profileForm.username}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, username: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide opacity-70">Email</label>
              <input
                type="email"
                className={inputClass}
                value={profileForm.email}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))}
                required
              />
              <p className="mt-1 text-[11px] opacity-70">
                {user.email_verified ? "Email vérifié" : "Email non vérifié — vérifie ta boîte mail"}
              </p>
            </div>
            {profileStatus && (
              <p
                className={`text-xs ${
                  profileStatus.type === "success"
                    ? "text-emerald-400"
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
              {profileLoading ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </form>
        </section>

        <section>
          <div className="flex items-center gap-2 text-sm font-semibold mb-2">
            <Lock className="h-4 w-4" />
            Sécurité du mot de passe
          </div>
          <form onSubmit={handlePasswordSubmit} className="space-y-2">
            <div>
              <label className="text-xs uppercase tracking-wide opacity-70">Mot de passe actuel</label>
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
              <label className="text-xs uppercase tracking-wide opacity-70">Nouveau mot de passe</label>
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
              <label className="text-xs uppercase tracking-wide opacity-70">Confirmation</label>
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
                className={`text-xs ${
                  passwordStatus.type === "success"
                    ? "text-emerald-400"
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
              {passwordLoading ? "Mise à jour..." : "Mettre à jour"}
            </Button>
          </form>
        </section>

        <section>
          <button
            type="button"
            onClick={() => setSecurityOpen((prev) => !prev)}
            className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm font-semibold ${
              darkMode ? "border-slate-800 bg-slate-900/60" : "border-slate-200 bg-slate-50"
            }`}
          >
            <span className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Sécurité & confidentialité
            </span>
            {securityOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {securityOpen && (
            <div className="mt-3 space-y-3">
              <SecuritySettingsCard darkMode={darkMode} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
