import type { CaseIndexSummary } from "../types";

interface CaseIndexingSummaryProps {
  darkMode: boolean;
  currentCaseId: string;
  caseSummary: CaseIndexSummary | null;
  caseSummaryLoading: boolean;
  caseSummaryError: string | null;
}

export function CaseIndexingSummary({
  darkMode,
  currentCaseId,
  caseSummary,
  caseSummaryLoading,
  caseSummaryError,
}: CaseIndexingSummaryProps) {
  const textStrong = darkMode ? "text-slate-100" : "text-slate-900";
  const textWeak = darkMode ? "text-slate-500" : "text-slate-600";

  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        darkMode ? "border-slate-800 bg-slate-900/60" : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className={`text-sm font-semibold ${textStrong}`}>Statut d'indexation</p>
          <p className={`text-xs ${textWeak}`}>Case {currentCaseId}</p>
        </div>
        <div className="text-right text-xs">
          {caseSummaryLoading && <span className={textWeak}>Chargement…</span>}
          {caseSummaryError && <span className="text-rose-400">{caseSummaryError}</span>}
        </div>
      </div>
      {caseSummary ? (
        <div className="mt-3 grid gap-3 text-center sm:grid-cols-3">
          <div className="rounded-lg border px-3 py-2">
            <p className={`text-2xl font-semibold ${textStrong}`}>{caseSummary.total_task_runs}</p>
            <p className={`text-[11px] uppercase tracking-wide ${textWeak}`}>Task Runs</p>
          </div>
          <div className="rounded-lg border px-3 py-2">
            <p className="text-2xl font-semibold text-emerald-400">{caseSummary.indexed_count}</p>
            <p className={`text-[11px] uppercase tracking-wide ${textWeak}`}>Indexés</p>
          </div>
          <div className="rounded-lg border px-3 py-2">
            <p className="text-2xl font-semibold text-amber-400">{caseSummary.not_indexed_count}</p>
            <p className={`text-[11px] uppercase tracking-wide ${textWeak}`}>En attente</p>
          </div>
        </div>
      ) : (
        !caseSummaryLoading &&
        !caseSummaryError && <p className={`mt-2 text-sm ${textWeak}`}>Aucune donnée d'indexation disponible.</p>
      )}
    </div>
  );
}
