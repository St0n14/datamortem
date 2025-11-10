import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { BrandMark } from "../components/BrandMark";
import { authAPI } from "../services/api";

export function EmailVerificationView() {
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("Validation en cours…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) {
      setStatus("error");
      setMessage("Token manquant. Vérifie l'URL du lien de vérification.");
      return;
    }
    authAPI
      .verifyEmail(token)
      .then(() => {
        setStatus("success");
        setMessage("Email vérifié ! Tu peux maintenant te connecter.");
      })
      .catch((err: any) => {
        setStatus("error");
        setMessage(err?.message || "Impossible de valider ton email.");
      });
  }, []);

  const icon =
    status === "success" ? (
      <CheckCircle2 className="h-10 w-10 text-emerald-400" />
    ) : status === "error" ? (
      <XCircle className="h-10 w-10 text-rose-400" />
    ) : (
      <Loader2 className="h-10 w-10 animate-spin text-violet-300" />
    );

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-6">
      <div className="mb-8">
        <BrandMark variant="light" subtitle="Verification" className="justify-center" />
      </div>
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 p-8 text-center space-y-4">
        {icon}
        <h1 className="text-2xl font-semibold">Email Verification</h1>
        <p className="text-sm text-slate-300">{message}</p>
        <a
          href="/"
          className="inline-flex items-center justify-center rounded-2xl border border-violet-500/60 bg-violet-600/20 px-4 py-2 text-sm font-semibold text-violet-50 hover:bg-violet-600/40"
        >
          Revenir à la connexion
        </a>
      </div>
    </div>
  );
}
