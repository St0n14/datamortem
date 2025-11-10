import { useEffect, useState } from "react";
import { Shield, Smartphone } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { authAPI } from "../services/api";
import QRCode from "qrcode";

interface SecuritySettingsCardProps {
  darkMode: boolean;
}

export function SecuritySettingsCard({ darkMode }: SecuritySettingsCardProps) {
  const { user, refreshUser } = useAuth();
  const [pendingSecret, setPendingSecret] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [activateCode, setActivateCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  if (!user) {
    return null;
  }

  const baseCard = darkMode ? "border-slate-800 bg-slate-950/60 text-slate-100" : "border-gray-200 bg-white text-slate-900";
  const infoCard = darkMode ? "border-slate-800/40 bg-slate-900/30" : "border-gray-200 bg-slate-50";
  const panelCard = darkMode ? "border-slate-800/40 bg-slate-900/40" : "border-gray-200 bg-white";
  const weakText = darkMode ? "text-slate-400" : "text-slate-600";
  const successText = darkMode ? "text-emerald-300" : "text-emerald-600";
  const dangerText = darkMode ? "text-rose-300" : "text-rose-600";
  const inputClass = darkMode
    ? "rounded-lg border border-slate-800 bg-transparent px-3 py-2 text-sm text-white focus:outline-none"
    : "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none";
  const codeClass = darkMode
    ? "rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 break-all"
    : "rounded border border-gray-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 break-all";

  useEffect(() => {
    if (pendingSecret?.otpauth_url) {
      QRCode.toDataURL(pendingSecret.otpauth_url, {
        width: 180,
        margin: 1,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      })
        .then(setQrDataUrl)
        .catch((err) => {
          console.warn("QR generation failed", err);
          setQrDataUrl(null);
        });
    } else {
      setQrDataUrl(null);
    }
  }, [pendingSecret?.otpauth_url]);

  const handleGenerateSecret = async () => {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const payload = await authAPI.otpSetup();
      setPendingSecret(payload);
      setStatus("Scanne le lien otpauth:// dans ton application OTP puis valide avec un code.");
    } catch (err: any) {
      setError(err?.message || "Impossible de générer le secret OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authAPI.otpActivate(activateCode.trim());
      setStatus("OTP activé !");
      setPendingSecret(null);
      setActivateCode("");
      await refreshUser();
    } catch (err: any) {
      setError(err?.message || "Code OTP invalide.");
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authAPI.otpDisable(disableCode.trim());
      setStatus("OTP désactivé.");
      setDisableCode("");
      await refreshUser();
    } catch (err: any) {
      setError(err?.message || "Impossible de désactiver le OTP.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={`rounded-2xl border p-4 ${baseCard}`}>
      <div className="flex items-center gap-2">
        <Shield className={`h-4 w-4 ${darkMode ? "text-violet-300" : "text-violet-600"}`} />
        <h3 className="text-sm font-semibold">Sécurité du compte</h3>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className={`rounded-xl border p-3 text-sm ${infoCard}`}>
          <p className={`text-xs uppercase ${weakText}`}>Email</p>
          <p className="text-base font-semibold">{user.email}</p>
          <p className={`text-xs ${user.email_verified ? successText : dangerText}`}>
            {user.email_verified ? "Vérifié" : "Non vérifié"}
          </p>
        </div>
        <div className={`rounded-xl border p-3 text-sm ${infoCard}`}>
          <p className={`text-xs uppercase ${weakText}`}>OTP</p>
          <p className="text-base font-semibold flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            {user.otp_enabled ? "Activé" : "Désactivé"}
          </p>
          <p className={`text-xs ${weakText}`}>Authenticator, 1Password, Cloudflare…</p>
        </div>
      </div>
      {status && <p className={`mt-3 text-sm ${successText}`}>{status}</p>}
      {error && <p className={`mt-2 text-sm ${dangerText}`}>{error}</p>}

      {!user.otp_enabled ? (
        <div className="mt-4 space-y-3">
          {!pendingSecret ? (
            <button
              onClick={handleGenerateSecret}
              disabled={loading}
              className="w-full rounded-xl border border-violet-500/50 bg-violet-600/10 px-4 py-2 text-sm font-semibold text-violet-100 hover:bg-violet-600/20 disabled:opacity-50"
            >
              {loading ? "Création du secret…" : "Activer la double authentification"}
            </button>
          ) : (
            <div className={`space-y-2 rounded-xl border p-3 text-sm ${panelCard}`}>
              <p className={`text-xs ${weakText}`}>
                Ajoute ce secret dans ton application OTP :
              </p>
              {qrDataUrl && (
                <div className="flex justify-center">
                  <img
                    src={qrDataUrl}
                    alt="QR code OTP"
                    className={`h-40 w-40 rounded-lg border ${darkMode ? "border-slate-700 bg-white p-2" : "border-gray-300 bg-white p-2"}`}
                  />
                </div>
              )}
              <div className={codeClass}>{pendingSecret.secret}</div>
              <div className={codeClass}>{pendingSecret.otpauth_url}</div>
              <form onSubmit={handleActivate} className="flex flex-col gap-2">
                <input
                  value={activateCode}
                  onChange={(e) => setActivateCode(e.target.value)}
                  placeholder="Code OTP"
                  required
                  className={inputClass}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg border border-emerald-500/50 bg-emerald-700/20 px-4 py-2 text-sm font-semibold text-emerald-100 disabled:opacity-50"
                >
                  Confirmer l'activation
                </button>
              </form>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleDisable} className={`mt-4 space-y-2 rounded-xl border p-3 text-sm ${panelCard}`}>
          <p className={`text-xs ${weakText}`}>Entre un code OTP valide pour désactiver la 2FA.</p>
          <input
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value)}
            placeholder="Code OTP"
            required
            className={inputClass}
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg border border-rose-500/60 bg-rose-900/30 px-4 py-2 text-sm font-semibold text-rose-100 disabled:opacity-50"
          >
            {loading ? "Traitement…" : "Désactiver OTP"}
          </button>
        </form>
      )}
    </section>
  );
}
