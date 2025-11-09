import React, { useState } from "react";
import { ArrowRight, CheckCircle2, Lock } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { BrandMark } from "../components/BrandMark";

export const LoginView: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await login(username, password);
    } catch (err: any) {
      setError(err.message || "Login failed. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 lg:flex lg:flex-row">
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between border-r border-slate-900 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 px-12 py-12">
        <BrandMark variant="light" subtitle="Cloud DFIR Platform" />
        <div className="space-y-6">
          <h2 className="text-3xl font-semibold text-white">Investiguez depuis n'importe quel cloud</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            dataMortem consolide vos artefacts, votre pipeline et votre moteur de recherche dans une seule console.
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

          <button
            type="button"
            disabled
            className="mt-6 w-full rounded-2xl border border-slate-800 px-4 py-3 text-sm text-slate-500"
          >
            Créer un compte (bientôt disponible)
          </button>
        </div>
      </div>
    </div>
  );
};
