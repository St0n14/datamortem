import { Card, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";

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

interface EventsTableProps {
  darkMode: boolean;
  events: EventRow[];
  selectedEventId: number | null;
  onEventSelect: (eventId: number) => void;
}

export function EventsTable({
  darkMode,
  events,
  selectedEventId,
  onEventSelect,
}: EventsTableProps) {
  function tagClass(tag: string) {
    if (darkMode) {
      const map: Record<string, string> = {
        execution: "bg-amber-500/10 text-amber-300 border border-amber-500/30",
        initial_access: "bg-rose-600/10 text-rose-300 border border-rose-500/30",
        lateral_movement: "bg-violet-600/10 text-violet-300 border border-violet-500/30",
        psexec: "bg-sky-600/10 text-sky-300 border border-sky-500/30",
        credential_use: "bg-emerald-600/10 text-emerald-300 border border-emerald-500/30",
        default: "bg-slate-700/30 text-slate-300 border border-slate-600/40",
      };
      return map[tag] || map.default;
    } else {
      const map: Record<string, string> = {
        execution: "bg-amber-100 text-amber-700 border border-amber-300",
        initial_access: "bg-rose-100 text-rose-700 border border-rose-300",
        lateral_movement: "bg-violet-100 text-violet-700 border border-violet-300",
        psexec: "bg-sky-100 text-sky-700 border border-sky-300",
        credential_use: "bg-emerald-100 text-emerald-700 border border-emerald-300",
        default: "bg-gray-100 text-slate-700 border border-slate-300",
      };
      return map[tag] || map.default;
    }
  }

  return (
    <Card className={`flex-1 min-w-0 flex flex-col ${darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50"}`}>
      <CardContent className="p-0 flex flex-col min-h-0">
        <div className={`flex items-center justify-between border-b px-4 py-2 text-[11px] ${
          darkMode ? "border-slate-700 text-slate-400" : "border-slate-200 text-slate-600"
        }`}>
          <div className="flex items-center gap-4">
            <span className={`font-semibold text-xs ${darkMode ? "text-slate-100" : "text-slate-900"}`}>Events</span>
            <span className={darkMode ? "text-slate-500" : "text-slate-600"}>Showing {events.length}</span>
          </div>
          <div className={`flex items-center gap-2 text-[10px] ${darkMode ? "text-slate-500" : "text-slate-600"}`}>
            <span>Sort:</span>
            <button
              className={`rounded-md border px-1.5 py-0.5 ${
                darkMode ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-200"
              }`}
            >
              -@timestamp
            </button>
          </div>
        </div>

        <div className={`overflow-auto text-[12px] leading-relaxed font-mono ${darkMode ? "text-slate-200" : "text-slate-800"}`}>
          <table className="min-w-full text-left">
            <thead
              className={`sticky top-0 text-[10px] uppercase tracking-wide border-b ${
                darkMode ? "bg-slate-900 text-slate-500 border-slate-700" : "bg-slate-50 text-slate-600 border-slate-200"
              }`}
            >
              <tr>
                <th className="px-4 py-2 w-4"></th>
                <th className="px-4 py-2 whitespace-nowrap">Timestamp (UTC)</th>
                <th className="px-4 py-2 whitespace-nowrap">Source</th>
                <th className="px-4 py-2">Message</th>
                <th className="px-4 py-2 whitespace-nowrap">Host</th>
                <th className="px-4 py-2 whitespace-nowrap">User</th>
                <th className="px-4 py-2 whitespace-nowrap">Tags</th>
                <th className="px-4 py-2 whitespace-nowrap">Score</th>
              </tr>
            </thead>
            <tbody className={darkMode ? "divide-y divide-slate-800" : "divide-y divide-gray-100"}>
              {events.map((e) => {
                const selected = selectedEventId === e.id;
                const rowBaseDark = selected ? "bg-violet-950/60 ring-1 ring-violet-700/40" : "";
                const rowBaseLight = selected ? "bg-violet-50 ring-1 ring-violet-300" : "";
                return (
                  <tr
                    key={e.id}
                    className={`cursor-pointer ${darkMode ? `hover:bg-violet-950/40 ${rowBaseDark}` : `hover:bg-violet-50 ${rowBaseLight}`}`}
                    onClick={() => onEventSelect(e.id)}
                  >
                    <td className={`px-4 py-2 align-top text-[10px] ${darkMode ? "text-slate-500" : "text-gray-400"}`}>{e.id}</td>
                    <td className={`px-4 py-2 align-top text-[11px] ${darkMode ? "text-slate-300" : "text-slate-700"}`}>{e.ts}</td>
                    <td className={`px-4 py-2 align-top text-[11px] font-semibold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>{e.source}</td>
                    <td className={`px-4 py-2 align-top text-[11px] max-w-[28rem] truncate ${darkMode ? "text-slate-200" : "text-slate-800"}`}>{e.message}</td>
                    <td className={`px-4 py-2 align-top text-[11px] ${darkMode ? "text-slate-300" : "text-slate-700"}`}>{e.host}</td>
                    <td className={`px-4 py-2 align-top text-[11px] ${darkMode ? "text-slate-300" : "text-slate-700"}`}>{e.user}</td>
                    <td className={`px-4 py-2 align-top text-[11px] ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      <div className="flex flex-wrap gap-1">
                        {e.tags.map((t) => (
                          <Badge key={t} className={`rounded-sm text-[10px] font-normal px-1.5 py-0.5 ${tagClass(t)}`}>
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className={`px-4 py-2 align-top text-[11px] ${darkMode ? "text-slate-300" : "text-slate-700"}`}>{e.score}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
