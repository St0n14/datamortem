import { useEffect, useState } from "react";
import { Plus, Tag, X } from "lucide-react";
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
  onAddTag: (eventId: number, tag: string) => void;
}

export function EventInspector({
  darkMode,
  selectedEvent,
  onClose,
  onAddTag,
}: EventInspectorProps) {
  const [newTag, setNewTag] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNewTag("");
    setError(null);
  }, [selectedEvent?.id]);

  if (!selectedEvent) return null;

  const iconButtonClass = darkMode
    ? "h-8 w-8 p-0 border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
    : "h-8 w-8 p-0 border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200";

  const handleAddTagClick = () => {
    const value = newTag.trim();
    if (!value) {
      setError("Tag requis");
      return;
    }
    if (selectedEvent.tags?.includes(value)) {
      setError("Tag déjà présent");
      return;
    }
    onAddTag(selectedEvent.id, value);
    setNewTag("");
    setError(null);
  };

  return (
    <aside
      className={`hidden lg:flex flex-col w-[22rem] shrink-0 rounded-xl border text-[12px] leading-relaxed shadow-xl ${
        darkMode ? "border-slate-700 bg-slate-950 text-slate-200" : "border-slate-200 bg-white text-slate-800"
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
              onClick={handleAddTagClick}
              disabled={!newTag.trim()}
              className={`h-7 rounded-lg text-[11px] ${
                darkMode
                  ? "border-emerald-600/30 bg-emerald-900/30 text-emerald-100 hover:bg-emerald-800/40"
                  : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              } ${!newTag.trim() ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Tag
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

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTagClick();
                }
              }}
              placeholder="Ajouter un tag (ex: lateral_movement)"
              className={`flex-1 rounded-lg border px-3 py-2 text-[11px] ${
                darkMode ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-300 bg-white text-slate-900"
              }`}
            />
            <div
              className={`rounded-full border p-2 ${
                darkMode ? "border-slate-700 bg-slate-900 text-slate-300" : "border-slate-300 bg-slate-100 text-slate-600"
              }`}
            >
              <Tag className="h-3.5 w-3.5" />
            </div>
          </div>
          {error && <p className="text-[11px] text-rose-400">{error}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          {(selectedEvent.tags ?? []).map((tag) => (
            <span
              key={tag}
              className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                darkMode ? "border-violet-600/30 bg-violet-900/40 text-violet-100" : "border-violet-200 bg-violet-50 text-violet-700"
              }`}
            >
              {tag}
            </span>
          ))}
          {!selectedEvent.tags?.length && (
            <span className={`text-[11px] ${darkMode ? "text-slate-500" : "text-slate-500"}`}>
              Aucun tag pour cet event.
            </span>
          )}
        </div>

        <div
          className={`rounded-lg border p-3 font-mono text-[11px] max-h-32 overflow-auto ${
            darkMode ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-300 bg-slate-50 text-slate-800"
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
              darkMode ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-300 bg-slate-50 text-slate-800"
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
