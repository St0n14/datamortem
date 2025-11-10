import { Button } from "./ui/Button";

interface EmptyCaseViewProps {
  darkMode: boolean;
  onGoToEvidences: () => void;
}

export function EmptyCaseView({ darkMode, onGoToEvidences }: EmptyCaseViewProps) {
  const textStrong = darkMode ? "text-slate-100" : "text-slate-900";
  const textWeak = darkMode ? "text-slate-500" : "text-slate-600";

  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center rounded-2xl border p-8 text-center ${
        darkMode ? "border-slate-800 bg-slate-900" : "border-gray-200 bg-white"
      }`}
    >
      <h2 className={`mb-2 text-lg font-semibold ${textStrong}`}>Aucun case disponible</h2>
      <p className={`mb-4 max-w-md text-sm ${textWeak}`}>
        Crée un case et associe des evidences depuis l'onglet <strong>Evidences</strong> pour lancer l'indexation et les pipelines.
      </p>
      <Button
        className={`px-4 py-2 text-sm ${
          darkMode ? "border-violet-600/40 bg-violet-900/40 text-violet-100" : "border-violet-200 bg-violet-50 text-violet-700"
        }`}
        onClick={onGoToEvidences}
      >
        Aller vers Evidences
      </Button>
    </div>
  );
}
