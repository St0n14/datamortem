import { useState, useEffect } from "react";
import { PipelineView } from "./components/PipelineView";
import {
  Skull,
  Sun,
  Moon,
  Search,
  Filter,
  Clock,
  Activity,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import { Card, CardContent } from "./components/ui/Card";
import { Button } from "./components/ui/Button";
import { Input } from "./components/ui/Input";
import { Badge } from "./components/ui/Badge";

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

export default function App() {
  const [darkMode, setDarkMode] = useState(true);
  const [activeTab, setActiveTab] =
    useState<"timeline" | "pipeline" | "rules">("timeline");

  const [currentCaseId] = useState<string>("integration_test_2025");
  const [selectedEvidenceUid] = useState<string | null>("evidence_integration_test_2025");

  const [events, setEvents] = useState<EventRow[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;
  const [query, setQuery] = useState("*");

  // Initialize dark mode class on mount
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [darkMode]);

  useEffect(() => {
    if (currentCaseId) {
      loadEventsFromOpenSearch();
    }
  }, [currentCaseId]);

  const loadEventsFromOpenSearch = async () => {
    try {
      const res = await fetch('/api/search/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query,
          case_id: currentCaseId,
          size: 100,
          sort_by: '@timestamp',
          sort_order: 'desc',
        }),
      });

      if (!res.ok) {
        console.error('Search failed');
        return;
      }

      const data = await res.json();

      // Convert OpenSearch hits to EventRow format
      const eventRows: EventRow[] = data.hits.map((hit: any, index: number) => ({
        id: index + 1,
        ts: hit['@timestamp'] || hit._source?.['@timestamp'] || '-',
        source: hit['source.parser'] || hit._source?.['source']?.['parser'] || hit['event.type'] || hit._source?.['event']?.['type'] || 'unknown',
        message: hit['message'] || hit._source?.['message'] || hit['file.path'] || hit._source?.['file']?.['path'] || hit['process.command_line'] || hit._source?.['process']?.['command_line'] || 'No message',
        host: hit['host.hostname'] || hit._source?.['host']?.['hostname'] || '-',
        user: hit['user.name'] || hit._source?.['user']?.['name'] || '-',
        tags: [], // We can add tags later based on event.type or other fields
        score: Math.round((hit._score || 0) * 10) / 10,
      }));

      setEvents(eventRows);
      if (eventRows.length > 0 && !selectedEventId) {
        setSelectedEventId(eventRows[0].id);
      }
    } catch (err) {
      console.error("failed to load events from OpenSearch", err);
    }
  };

  const handleSearchSubmit = () => {
    loadEventsFromOpenSearch();
  };

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
        default: "bg-gray-100 text-gray-700 border border-gray-300",
      };
      return map[tag] || map.default;
    }
  }

  const bgApp = darkMode ? "bg-slate-950 text-slate-50" : "bg-gray-50 text-gray-900";
  const sidebarStyle = darkMode
    ? "border-slate-800 bg-slate-900 text-slate-100"
    : "border-gray-200 bg-white text-gray-900";
  const textWeak = darkMode ? "text-slate-500" : "text-gray-500";
  const textStrong = darkMode ? "text-slate-100" : "text-gray-900";

  return (
    <div className={`flex h-screen w-full font-sans ${bgApp}`}>
      {/* SIDEBAR */}
      <aside className={`hidden md:flex flex-col w-64 shrink-0 border-r p-5 gap-6 ${sidebarStyle}`}>
        {/* Brand + mode toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center justify-center h-10 w-10 rounded-xl border ${
                darkMode
                  ? "bg-slate-800 border-slate-700 text-violet-300"
                  : "bg-gray-100 border-gray-300 text-violet-700"
              }`}
            >
              <Skull className="h-5 w-5" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className={`text-lg font-semibold tracking-tight ${textStrong}`}>dataMortem</span>
              <span className={`text-[11px] ${textWeak}`}>DFIR Intelligence Core</span>
            </div>
          </div>

          <Button
            className={
              darkMode
                ? "h-9 w-9 p-0 border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                : "h-9 w-9 p-0 border-gray-300 bg-white text-gray-800 hover:bg-gray-100"
            }
            onClick={() => setDarkMode(!darkMode)}
          >
            {darkMode ? <Sun className="h-4 w-4 text-yellow-400" /> : <Moon className="h-4 w-4 text-indigo-600" />}
          </Button>
        </div>

        {/* Case summary */}
        <Card className={`${darkMode ? "bg-slate-900 border-slate-700 text-slate-300" : "bg-white border-gray-200 text-gray-700"} text-[11px]`}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className={`text-xs font-semibold ${textStrong}`}>Active Case</span>
              <Badge
                className={`rounded-md text-[10px] border ${
                  darkMode ? "bg-violet-950/40 text-violet-200 border-violet-600/30" : "bg-violet-50 text-violet-700 border-violet-300"
                }`}
              >
                LIVE
              </Badge>
            </div>
            <div className={`${darkMode ? "text-slate-400" : "text-gray-500"} text-[10px]`}>{currentCaseId}</div>
            <div className={`${darkMode ? "text-slate-600" : "text-gray-400"} text-[10px]`}>Full integration test - Pipeline to Explorer workflow</div>
          </CardContent>
        </Card>

        {/* Nav */}
        <div className="space-y-2 text-sm">
          <div className={`uppercase text-[10px] tracking-wide flex items-center gap-2 ${textWeak}`}>Navigation</div>
          {[
            { key: "timeline" as const, label: "Timeline", icon: <Clock className="h-4 w-4" /> },
            { key: "pipeline" as const, label: "Pipeline", icon: <WrenchIcon /> },
            { key: "rules" as const, label: "Rules", icon: <ShieldCheck className="h-4 w-4" /> },
          ].map((item) => {
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12px] font-medium transition-colors ${
                  active
                    ? darkMode
                      ? "border-violet-600/30 bg-violet-950/40 text-violet-200"
                      : "border-violet-300 bg-violet-50 text-violet-700"
                    : darkMode
                    ? "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                    : "border-gray-300 bg-white text-gray-800 hover:bg-gray-100"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="mt-auto space-y-4">
          <div className={`text-[10px] font-medium uppercase tracking-wide flex items-center gap-2 ${textWeak}`}>
            <Activity className={`h-3 w-3 ${darkMode ? "text-rose-400" : "text-rose-500"}`} />
            <span className={darkMode ? "text-slate-400" : "text-gray-600"}>Highlights</span>
          </div>

          <Card className={`${darkMode ? "bg-slate-900 border-slate-700" : "bg-white border-gray-200"}`}>
            <CardContent className={`p-3 text-[11px] leading-relaxed ${darkMode ? "text-slate-300" : "text-gray-700"}`}>
              <div className="flex items-start justify-between">
                <div className={`font-medium text-xs flex items-center gap-2 ${textStrong}`}>
                  <span>Forensic Events</span>
                  <Badge
                    className={`rounded-md text-[10px] border ${
                      darkMode ? "bg-emerald-600/10 text-emerald-300 border-emerald-500/30" : "bg-emerald-100 text-emerald-700 border-emerald-300"
                    }`}
                  >
                    {events.length}
                  </Badge>
                </div>
              </div>
              <div className={`${darkMode ? "text-slate-400" : "text-gray-600"} mt-1`}>
                Indexed events from OpenSearch ready for analysis and investigation.
              </div>
              <Button
                className={`mt-2 h-6 px-2 text-[11px] rounded-lg ${
                  darkMode ? "border-violet-600/30 bg-violet-950/40 text-violet-200 hover:bg-violet-900/30" : "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
                }`}
                onClick={() => setActiveTab('timeline')}
              >
                View Timeline
              </Button>
            </CardContent>
          </Card>

          <div className={`text-[10px] border-t pt-3 ${darkMode ? "text-slate-600 border-slate-800" : "text-gray-500 border-gray-200"}`}>
            <p className={darkMode ? "text-slate-500" : "text-gray-600"}>© 2025 dataMortem Labs</p>
            <p className={darkMode ? "text-slate-600" : "text-gray-500"}>Forensic Intelligence Platform</p>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main className={`flex flex-1 min-w-0 p-4 gap-4 overflow-hidden ${darkMode ? "bg-slate-950" : "bg-gray-50"}`}>
        {/* COLONNE CENTRALE */}
        <section className="flex flex-col flex-[2] min-w-0 gap-4">
          {/* Tabs */}
          <div className="flex items-center gap-2 text-[11px] font-medium">
            {[
              { key: "timeline" as const, label: "Timeline", icon: <Clock className="h-3.5 w-3.5" /> },
              { key: "pipeline" as const, label: "Pipeline", icon: <WrenchIcon size={14} /> },
              { key: "rules" as const, label: "Rules", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
            ].map((item) => {
              const active = activeTab === item.key;
              return (
                <Button
                  key={item.key}
                  className={`px-3 py-1.5 h-auto text-xs ${
                    active
                      ? darkMode
                        ? "border-violet-600/30 bg-violet-950/40 text-violet-200"
                        : "border-violet-300 bg-violet-50 text-violet-700"
                      : darkMode
                      ? "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                      : "border-gray-300 bg-white text-gray-800 hover:bg-gray-100"
                  }`}
                  onClick={() => setActiveTab(item.key)}
                >
                  <span className="flex items-center gap-2">
                    {item.icon}
                    {item.label}
                  </span>
                </Button>
              );
            })}
          </div>

          {/* Barre de requête */}
          {activeTab === "timeline" && (
            <>
              <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
                <div className="flex flex-col gap-1 min-w-0 w-full">
                  <div className={`text-xs font-semibold flex items-center gap-2 ${darkMode ? "text-slate-100" : "text-gray-900"}`}>
                    <span>OpenSearch Query</span>
                    <Badge
                      className={`rounded-md border text-[11px] ${
                        darkMode ? "bg-violet-950/40 text-violet-200 border-violet-600/30" : "bg-violet-50 text-violet-700 border-violet-300"
                      }`}
                    >
                      {currentCaseId}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 w-full">
                    <div className="relative flex-1">
                      <Search className={`absolute left-2 top-2.5 h-4 w-4 ${darkMode ? "text-slate-500" : "text-gray-400"}`} />
                      <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSearchSubmit()}
                        className="pl-8 pr-28"
                      />
                      <div
                        className={`absolute right-2 top-1.5 text-[10px] font-mono rounded-md px-1.5 py-0.5 border ${
                          darkMode ? "text-slate-400 bg-slate-900 border-slate-700" : "text-gray-500 bg-white border-gray-300"
                        }`}
                      >
                        ⏎ Run
                      </div>
                    </div>
                    <Button
                      onClick={handleSearchSubmit}
                      className={`h-9 rounded-xl border text-sm font-medium ${
                        darkMode ? "border-violet-600/30 bg-violet-950/40 text-violet-200 hover:bg-violet-900/30" : "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
                      }`}
                    >
                      <Search className="h-4 w-4 mr-2" />
                      Search
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                  <Button
                    className={`h-9 rounded-xl border text-sm font-medium ${
                      darkMode ? "border-sky-600/30 bg-sky-900/20 text-sky-200 hover:bg-sky-900/30" : "border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100"
                    }`}
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    Filters
                  </Button>
                  <Button
                    className={`h-9 rounded-xl border px-3 text-[12px] font-medium ${
                      darkMode ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-gray-300 bg-white text-gray-800 hover:bg-gray-100"
                    }`}
                  >
                    Export CSV
                  </Button>
                </div>
              </div>

              {/* Events table */}
              <Card className={`flex-1 min-w-0 flex flex-col ${darkMode ? "border-slate-700 bg-slate-900" : "border-gray-200 bg-white"}`}>
                <CardContent className="p-0 flex flex-col min-h-0">
                  <div className={`flex items-center justify-between border-b px-4 py-2 text-[11px] ${
                    darkMode ? "border-slate-700 text-slate-400" : "border-gray-200 text-gray-500"
                  }`}>
                    <div className="flex items-center gap-4">
                      <span className={`font-semibold text-xs ${darkMode ? "text-slate-100" : "text-gray-900"}`}>Events</span>
                      <span className={darkMode ? "text-slate-500" : "text-gray-500"}>Showing {events.length}</span>
                    </div>
                    <div className={`flex items-center gap-2 text-[10px] ${darkMode ? "text-slate-500" : "text-gray-500"}`}>
                      <span>Sort:</span>
                      <button
                        className={`rounded-md border px-1.5 py-0.5 ${
                          darkMode ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-gray-300 bg-white text-gray-800 hover:bg-gray-100"
                        }`}
                      >
                        -@timestamp
                      </button>
                    </div>
                  </div>

                  <div className={`overflow-auto text-[12px] leading-relaxed font-mono ${darkMode ? "text-slate-200" : "text-gray-800"}`}>
                    <table className="min-w-full text-left">
                      <thead
                        className={`sticky top-0 text-[10px] uppercase tracking-wide border-b ${
                          darkMode ? "bg-slate-900 text-slate-500 border-slate-700" : "bg-white text-gray-500 border-gray-200"
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
                              onClick={() => setSelectedEventId(e.id)}
                            >
                              <td className={`px-4 py-2 align-top text-[10px] ${darkMode ? "text-slate-500" : "text-gray-400"}`}>{e.id}</td>
                              <td className={`px-4 py-2 align-top text-[11px] ${darkMode ? "text-slate-300" : "text-gray-700"}`}>{e.ts}</td>
                              <td className={`px-4 py-2 align-top text-[11px] font-semibold ${darkMode ? "text-slate-100" : "text-gray-900"}`}>{e.source}</td>
                              <td className={`px-4 py-2 align-top text-[11px] max-w-[28rem] truncate ${darkMode ? "text-slate-200" : "text-gray-800"}`}>{e.message}</td>
                              <td className={`px-4 py-2 align-top text-[11px] ${darkMode ? "text-slate-300" : "text-gray-700"}`}>{e.host}</td>
                              <td className={`px-4 py-2 align-top text-[11px] ${darkMode ? "text-slate-300" : "text-gray-700"}`}>{e.user}</td>
                              <td className={`px-4 py-2 align-top text-[11px] ${darkMode ? "text-slate-300" : "text-gray-700"}`}>
                                <div className="flex flex-wrap gap-1">
                                  {e.tags.map((t) => (
                                    <Badge key={t} className={`rounded-sm text-[10px] font-normal px-1.5 py-0.5 ${tagClass(t)}`}>
                                      {t}
                                    </Badge>
                                  ))}
                                </div>
                              </td>
                              <td className={`px-4 py-2 align-top text-[11px] ${darkMode ? "text-slate-300" : "text-gray-700"}`}>{e.score}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {activeTab === "pipeline" && (
            <Card className={`flex-1 ${darkMode ? "border-slate-700 bg-slate-900" : "border-gray-200 bg-white"}`}>
              <CardContent className="p-0">
                <PipelineView selectedEvidenceUid={selectedEvidenceUid} darkMode={darkMode} />
              </CardContent>
            </Card>
          )}

          {activeTab === "rules" && (
            <Card className={`${darkMode ? "border-slate-700 bg-slate-900" : "border-gray-200 bg-white"}`}>
              <CardContent className="p-4 text-sm">
                À venir : éditeur de règles (patterns & détection).
              </CardContent>
            </Card>
          )}
        </section>

        {/* INSPECTOR RIGHT */}
        <aside
          className={`hidden lg:flex flex-col w-[22rem] shrink-0 rounded-xl border text-[12px] leading-relaxed ${
            darkMode ? "border-slate-700 bg-slate-900 text-slate-200" : "border-gray-200 bg-white text-gray-800"
          }`}
        >
          <div className="p-4 flex flex-col gap-4 min-h-0">
            <div className="flex items-start justify-between">
              <div>
                <div className={`text-[10px] font-medium uppercase tracking-wide ${darkMode ? "text-slate-500" : "text-gray-500"}`}>Event Details</div>
                <div className={`text-xs font-semibold ${darkMode ? "text-slate-100" : "text-gray-900"}`}>Row #{selectedEvent?.id ?? "-"}</div>
              </div>
              <Button
                className={`h-7 rounded-lg text-[11px] ${
                  darkMode ? "border-violet-600/30 bg-violet-950/40 text-violet-200 hover:bg-violet-900/30" : "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
                }`}
              >
                Add Tag
              </Button>
            </div>

            <div
              className={`rounded-lg border p-3 font-mono text-[11px] max-h-32 overflow-auto ${
                darkMode ? "border-slate-700 bg-slate-900 text-slate-200" : "border-gray-300 bg-gray-50 text-gray-800"
              }`}
            >
              {selectedEvent ? (
                <>
                  <div className="flex"><span className={`${darkMode ? "text-slate-500" : "text-gray-500"} w-24`}>@timestamp</span><span>{selectedEvent.ts}</span></div>
                  <div className="flex"><span className={`${darkMode ? "text-slate-500" : "text-gray-500"} w-24`}>host</span><span>{selectedEvent.host}</span></div>
                  <div className="flex"><span className={`${darkMode ? "text-slate-500" : "text-gray-500"} w-24`}>user</span><span>{selectedEvent.user}</span></div>
                  <div className="flex"><span className={`${darkMode ? "text-slate-500" : "text-gray-500"} w-24`}>source</span><span>{selectedEvent.source}</span></div>
                  <div className="flex"><span className={`${darkMode ? "text-slate-500" : "text-gray-500"} w-24`}>score</span><span>{selectedEvent.score}</span></div>
                </>
              ) : (
                <div className={`${darkMode ? "text-slate-500" : "text-gray-500"} italic`}>Select an event…</div>
              )}
            </div>

            <div className="flex flex-col gap-2 min-h-0 flex-1 overflow-hidden">
              <div className={`text-[10px] font-medium uppercase tracking-wide ${darkMode ? "text-slate-500" : "text-gray-500"}`}>Raw / _source</div>
              <div
                className={`rounded-lg border p-3 font-mono text-[10px] flex-1 overflow-auto leading-relaxed whitespace-pre-wrap ${
                  darkMode ? "border-slate-700 bg-slate-900 text-slate-200" : "border-gray-300 bg-gray-50 text-gray-800"
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
                  <span className={`${darkMode ? "text-slate-500" : "text-gray-500"} italic`}>No event selected.</span>
                )}
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

function WrenchIcon({ size = 16 }: { size?: number }) {
  return <Wrench className="h-4 w-4" style={{ height: size, width: size }} />;
}
