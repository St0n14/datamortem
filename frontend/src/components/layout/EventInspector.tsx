import { X } from "lucide-react";
import { Button } from "../ui/Button";

type EventRow = {
  id: number;
  ts: string;
  source: string;
  message: string;
  host: string;
  user: string;
  tags: string[];
  score: number;
};

interface EventInspectorProps {
  darkMode: boolean;
  selectedEvent: EventRow | null;
  onClose: () => void;
}

export function EventInspector({
  darkMode,
  selectedEvent,
  onClose,
}: EventInspectorProps) {
  if (!selectedEvent) return null;

  const iconButtonClass = darkMode
    ? "h-8 w-8 p-0 border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
    : "h-8 w-8 p-0 border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200";

  return (
    <aside
      className={`hidden lg:flex flex-col w-[22rem] shrink-0 rounded-xl border text-[12px] leading-relaxed ${
        darkMode ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-slate-50 text-slate-800"
      }`}
    >
      <div className="p-4 flex flex-col gap-4 min-h-0">
        <div className="flex items-start justify-between">
          <div>
            <div className={`text-[10px] font-medium uppercase tracking-wide ${darkMode ? "text-slate-500" : "text-slate-600"}`}>Event Details</div>
            <div className={`text-xs font-semibold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>Row #{selectedEvent?.id ?? "-"}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              className={`h-7 rounded-lg text-[11px] ${
                darkMode ? "border-violet-600/30 bg-violet-950/40 text-violet-200 hover:bg-violet-900/30" : "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
              }`}
            >
              Add Tag
            </Button>
            <Button
              className={iconButtonClass}
              onClick={onClose}
              aria-label="Fermer le panneau détail"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div
          className={`rounded-lg border p-3 font-mono text-[11px] max-h-32 overflow-auto ${
            darkMode ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-300 bg-slate-100 text-slate-800"
          }`}
        >
          {selectedEvent ? (
            <>
              <div className="flex"><span className={`${darkMode ? "text-slate-500" : "text-slate-600"} w-24`}>@timestamp</span><span>{selectedEvent.ts}</span></div>
              <div className="flex"><span className={`${darkMode ? "text-slate-500" : "text-slate-600"} w-24`}>host</span><span>{selectedEvent.host}</span></div>
              <div className="flex"><span className={`${darkMode ? "text-slate-500" : "text-slate-600"} w-24`}>user</span><span>{selectedEvent.user}</span></div>
              <div className="flex"><span className={`${darkMode ? "text-slate-500" : "text-slate-600"} w-24`}>source</span><span>{selectedEvent.source}</span></div>
              <div className="flex"><span className={`${darkMode ? "text-slate-500" : "text-slate-600"} w-24`}>score</span><span>{selectedEvent.score}</span></div>
            </>
          ) : (
            <div className={`${darkMode ? "text-slate-500" : "text-slate-600"} italic`}>Select an event…</div>
          )}
        </div>

        <div className="flex flex-col gap-2 min-h-0 flex-1 overflow-hidden">
          <div className={`text-[10px] font-medium uppercase tracking-wide ${darkMode ? "text-slate-500" : "text-slate-600"}`}>Raw / _source</div>
          <div
            className={`rounded-lg border p-3 font-mono text-[10px] flex-1 overflow-auto leading-relaxed whitespace-pre-wrap ${
              darkMode ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-300 bg-slate-100 text-slate-800"
            }`}
          >
            {selectedEvent ? (
              JSON.stringify(
                {
                  "@timestamp": selectedEvent.ts,
                  message: selectedEvent.message,
                  host: selectedEvent.host,
                  user: selectedEvent.user,
                  tags: selectedEvent.tags,
                  score: selectedEvent.score,
                },
                null,
                2
              )
            ) : (
              <span className={`${darkMode ? "text-slate-500" : "text-slate-600"} italic`}>No event selected.</span>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
