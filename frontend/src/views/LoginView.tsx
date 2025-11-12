import React, { useState, useEffect } from "react";
import { ArrowRight, CheckCircle2, Lock } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { authAPI, featureFlagsAPI } from "../services/api";
import { BrandMark } from "../components/BrandMark";

export const LoginView: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [showOtpField, setShowOtpField] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerStatus, setRegisterStatus] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerForm, setRegisterForm] = useState({
    email: "",
    username: "",
    password: "",
    full_name: "",
  });
  const [accountCreationEnabled, setAccountCreationEnabled] = useState(true);
  const [loadingFeatureFlag, setLoadingFeatureFlag] = useState(true);
  const { login } = useAuth();

  // Load account creation feature flag (using public endpoint)
  const refreshAccountCreationFlag = () => {
    featureFlagsAPI
      .getPublic("account_creation")
      .then((flag) => {
        setAccountCreationEnabled(flag.enabled);
      })
      .catch((err) => {
        console.error("Failed to load account creation feature flag:", err);
        // Default to enabled if we can't load it
        setAccountCreationEnabled(true);
      })
      .finally(() => {
        setLoadingFeatureFlag(false);
      });
  };

  useEffect(() => {
    refreshAccountCreationFlag();
    
    // Listen for feature flag updates
    const handleFeatureFlagUpdate = (event: CustomEvent) => {
      if (event.detail?.featureKey === "account_creation") {
        setAccountCreationEnabled(event.detail.enabled);
      } else {
        // Refresh if we don't know which flag was updated
        refreshAccountCreationFlag();
      }
    };
    
    window.addEventListener('feature-flag-updated', handleFeatureFlagUpdate as EventListener);
    return () => {
      window.removeEventListener('feature-flag-updated', handleFeatureFlagUpdate as EventListener);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    setResendStatus(null);

    try {
      await login(username, password, showOtpField ? otpCode : undefined);
      setOtpCode("");
    } catch (err: any) {
      const message = err.message || "Login failed. Please check your credentials.";
      setError(message);
      if (/otp/i.test(message)) {
        setShowOtpField(true);
      }
      if (/verify/i.test(message) || /email/.test(message)) {
        setShowResend(true);
        if (!resendEmail && username.includes("@")) {
          setResendEmail(username);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendStatus(null);
    try {
      await authAPI.resendVerification(resendEmail.trim());
      setResendStatus("Lien de vérification renvoyé. Consulte ta boîte mail.");
    } catch (err: any) {
      setResendStatus(err?.message || "Impossible de renvoyer l'email.");
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterStatus(null);
    setRegisterError(null);
    try {
      await authAPI.register({
        email: registerForm.email.trim(),
        username: registerForm.username.trim(),
        password: registerForm.password,
        full_name: registerForm.full_name?.trim() || undefined,
      });
      setRegisterStatus("Compte créé ! Vérifie ton email pour l'activer.");
      setRegisterForm({ email: "", username: "", password: "", full_name: "" });
      setRegisterOpen(false);
    } catch (err: any) {
      setRegisterError(err?.message || "Impossible de créer le compte.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 lg:flex lg:flex-row">
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between border-r border-slate-900 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 px-12 py-12">
        <BrandMark variant="light" subtitle="Cloud DFIR Platform" />
        <div className="space-y-6">
          <h2 className="text-3xl font-semibold text-white">Investiguez depuis n'importe quel cloud</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Requiem consolide vos artefacts, votre pipeline et votre moteur de recherche dans une seule console.
            Déployez-le sur GCP, invitez vos analystes et gardez la maîtrise des accès.
          </p>
          <ul className="space-y-3 text-sm text-slate-100/80">
            {[
              "Comptes multi-équipes et rôles prêts pour GCP",
              "Indexation OpenSearch accélérée pour vos cas",
              "Audit trail complet et authentification JWT",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-50/5 p-4 text-sm text-white/80">
          <p className="font-semibold">Roadmap cloud</p>
          <p className="text-white/70">
            Provisionnez l'infra sur un projet GCP (Cloud Run ou GKE) et laissez vos utilisateurs créer leur compte directement depuis cette page.
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-slate-900/60">
          <div className="mb-8 space-y-2 text-center">
            <BrandMark subtitle="Secure Sign-In" className="justify-center" />
            <p className="text-sm text-slate-400">Connectez-vous pour accéder à vos investigations.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ex: analyst@corp"
                required
                autoFocus
                className="w-full rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
              />
            </div>

            {showOtpField ? (
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Code OTP</label>
                <input
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="123 456"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowOtpField(true)}
                className="text-xs text-violet-300 underline-offset-2 hover:underline"
              >
                J'ai un code OTP
              </button>
            )}

            {error && (
              <div className="rounded-xl border border-rose-600/50 bg-rose-900/30 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-500/60 bg-violet-600/20 px-4 py-3 text-sm font-semibold text-violet-50 transition hover:bg-violet-600/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? (
                "Connexion en cours..."
              ) : (
                <>
                  Se connecter
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {showResend && (
            <form onSubmit={handleResendVerification} className="mt-4 space-y-2 rounded-2xl border border-amber-500/30 bg-amber-900/20 p-4">
              <p className="text-sm text-amber-200 font-semibold">Email non vérifié</p>
              <p className="text-xs text-amber-100">Rentre ton email pour recevoir un nouveau lien d'activation.</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="flex-1 rounded-lg border border-amber-500/50 bg-transparent px-3 py-2 text-sm text-white placeholder:text-amber-200/60 focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-lg border border-amber-400/60 px-4 text-sm font-semibold text-amber-50"
                >
                  Renvoyer
                </button>
              </div>
              {resendStatus && <p className="text-xs text-amber-100">{resendStatus}</p>}
            </form>
          )}

          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-400">
            <div className="mb-2 flex items-center gap-2 text-slate-200">
              <Lock className="h-4 w-4 text-violet-300" />
              Mode démo
            </div>
            <p>
              <strong>Username:</strong> admin
            </p>
            <p>
              <strong>Password:</strong> admin123
            </p>
          </div>

          {/* Affichage conditionnel selon le feature flag */}
          {!loadingFeatureFlag && !accountCreationEnabled && (
            <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-900/20 p-4 text-sm text-amber-200">
              <p className="font-semibold">Création de compte désactivée</p>
              <p className="mt-1 text-xs text-amber-100/80">
                La création de compte est actuellement désactivée. Veuillez contacter un administrateur.
              </p>
            </div>
          )}

          {!loadingFeatureFlag && accountCreationEnabled && (
            <>
              <button
                type="button"
                onClick={() => setRegisterOpen((prev) => !prev)}
                className="mt-6 w-full rounded-2xl border border-slate-800 px-4 py-3 text-sm text-slate-200 hover:bg-slate-900/40"
              >
                {registerOpen ? "Fermer l'inscription" : "Créer un compte"}
              </button>

              {registerStatus && (
                <p className="mt-2 text-sm text-emerald-300">{registerStatus}</p>
              )}
              {registerError && (
                <p className="mt-2 text-sm text-rose-300">{registerError}</p>
              )}

              {registerOpen && (
                <form onSubmit={handleRegisterSubmit} className="mt-4 space-y-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="grid gap-3">
                    <input
                      type="email"
                      value={registerForm.email}
                      onChange={(e) => setRegisterForm((prev) => ({ ...prev, email: e.target.value }))}
                      required
                      placeholder="Email"
                      className="w-full rounded-lg border border-slate-800 bg-transparent px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none"
                    />
                    <input
                      value={registerForm.username}
                      onChange={(e) => setRegisterForm((prev) => ({ ...prev, username: e.target.value }))}
                      required
                      placeholder="Username"
                      className="w-full rounded-lg border border-slate-800 bg-transparent px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none"
                    />
                    <input
                      value={registerForm.full_name}
                      onChange={(e) => setRegisterForm((prev) => ({ ...prev, full_name: e.target.value }))}
                      placeholder="Nom complet (optionnel)"
                      className="w-full rounded-lg border border-slate-800 bg-transparent px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none"
                    />
                    <input
                      type="password"
                      value={registerForm.password}
                      onChange={(e) => setRegisterForm((prev) => ({ ...prev, password: e.target.value }))}
                      required
                      minLength={12}
                      placeholder="Mot de passe (min. 12 caractères)"
                      className="w-full rounded-lg border border-slate-800 bg-transparent px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full rounded-xl border border-emerald-400/60 bg-emerald-900/30 px-4 py-2 text-sm font-semibold text-emerald-100"
                  >
                    Envoyer l'inscription
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
