import { useState, useEffect, useMemo } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { LoginView } from "./views/LoginView";
import { Header } from "./components/Header";
import { PipelineView } from "./components/PipelineView";
import { EvidencesView } from "./views/EvidencesView";
import { ExplorerView } from "./views/ExplorerView";
import { casesAPI, searchAPI } from "./services/api";
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
  HardDrive,
  X,
  RefreshCw,
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

type CaseSummary = {
  case_id: string;
  status?: string;
  note?: string | null;
  created_at_utc?: string;
};

type TimelineBucket = {
  timestamp: string;
  count: number;
};

// Main authenticated app component
function AuthenticatedApp() {
  const [darkMode, setDarkMode] = useState(true);
  const [activeTab, setActiveTab] =
    useState<"timeline" | "pipeline" | "rules" | "evidences" | "explorer">("timeline");

  // Load current case from localStorage or use default
  const [currentCaseId, setCurrentCaseId] = useState<string>(() => {
    return localStorage.getItem('currentCaseId') || '';
  });
  const [selectedEvidenceUid] = useState<string | null>("evidence_pc_001");
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [casesRefreshToken, setCasesRefreshToken] = useState(0);

  const [events, setEvents] = useState<EventRow[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;
  const [query, setQuery] = useState("*");
  const [timelineBuckets, setTimelineBuckets] = useState<TimelineBucket[]>([]);
  const [timelineInterval, setTimelineInterval] = useState("1h");
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const maxTimelineCount = useMemo(
    () => (timelineBuckets.length ? Math.max(...timelineBuckets.map((b) => b.count)) : 0),
    [timelineBuckets]
  );
  const timelineTotal = useMemo(
    () => timelineBuckets.reduce((acc, bucket) => acc + bucket.count, 0),
    [timelineBuckets]
  );

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
    if (!currentCaseId) {
      setEvents([]);
      setTimelineBuckets([]);
      return;
    }
    loadEventsFromOpenSearch();
    loadTimelineFromOpenSearch();
  }, [currentCaseId]);

  useEffect(() => {
    if (!currentCaseId) {
      return;
    }
    loadTimelineFromOpenSearch();
  }, [timelineInterval]);

  useEffect(() => {
    loadCases();
  }, [casesRefreshToken]);

  const loadEventsFromOpenSearch = async () => {
    if (!currentCaseId) {
      setEvents([]);
      setSelectedEventId(null);
      return;
    }
    try {
      const data = await searchAPI.query({
        query: query,
        case_id: currentCaseId,
        size: 100,
        sort_by: '@timestamp',
        sort_order: 'desc',
      });

      // Convert OpenSearch hits to EventRow format
      const eventRows: EventRow[] = data.hits.map((hit: any, index: number) => ({
        id: index + 1,
        ts: hit['@timestamp'] || '-',
        source: hit.source?.parser || hit.event?.type || 'unknown',
        message: hit.message || hit.file?.path || hit.process?.command_line || hit.event?.action || 'No message',
        host: hit.host?.hostname || '-',
        user: hit.user?.name || '-',
        tags: hit.event?.type ? [hit.event.type] : [],
        score: Math.round((hit._score || 0) * 10) / 10,
      }));

      setEvents(eventRows);
      setSelectedEventId(null);
    } catch (err) {
      console.error("failed to load events from OpenSearch", err);
      setEvents([]);
      setSelectedEventId(null);
    }
  };

  const loadTimelineFromOpenSearch = async () => {
    if (!currentCaseId) {
      setTimelineBuckets([]);
      return;
    }
    setTimelineLoading(true);
    setTimelineError(null);
    try {
      const data = await searchAPI.timeline({
        case_id: currentCaseId,
        interval: timelineInterval,
        query,
      });
      setTimelineBuckets(data.buckets || data.timeline || []);
    } catch (err) {
      console.error("failed to load timeline", err);
      setTimelineError("Impossible de charger la timeline (OpenSearch ?).");
      setTimelineBuckets([]);
    } finally {
      setTimelineLoading(false);
    }
  };

  const loadCases = async () => {
    try {
      const data = await casesAPI.list();
      setCases(data);
      if (data.length > 0) {
        setCurrentCaseId((prev) => {
          if (prev && data.some((c: CaseSummary) => c.case_id === prev)) {
            return prev;
          }
          return data[0].case_id;
        });
      }
    } catch (err) {
      console.error("Failed to load cases", err);
    }
  };

  const refreshCases = () => {
    setCasesRefreshToken((token) => token + 1);
  };

  const handleSearchSubmit = () => {
    loadEventsFromOpenSearch();
    loadTimelineFromOpenSearch();
  };

  const handleCaseSelect = (caseId: string) => {
    setSelectedEventId(null);
    setCurrentCaseId(caseId);
    // Persist to localStorage
    if (caseId) {
      localStorage.setItem('currentCaseId', caseId);
    } else {
      localStorage.removeItem('currentCaseId');
      setEvents([]);
    }
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

  const formatTimelineLabel = (timestamp: string) => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return timestamp;
    }
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const bgApp = darkMode ? "bg-slate-950 text-slate-50" : "bg-gray-50 text-gray-900";
  const textWeak = darkMode ? "text-slate-500" : "text-gray-500";
  const textStrong = darkMode ? "text-slate-100" : "text-gray-900";
  const iconButtonClass = darkMode
    ? "h-8 w-8 p-0 border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
    : "h-8 w-8 p-0 border border-gray-300 bg-white text-gray-800 hover:bg-gray-100";

  return (
    <div className={`flex h-screen w-full font-sans ${bgApp}`}>

      {/* MAIN */}
      <main className={`flex flex-1 min-w-0 min-h-0 p-4 gap-4 overflow-auto ${darkMode ? "bg-slate-950" : "bg-gray-50"}`}>
        {/* COLONNE CENTRALE */}
        <section className="flex flex-col flex-[2] min-w-0 min-h-0 gap-4">
          <header
            className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
              darkMode
                ? "border-slate-800 bg-slate-950/80 text-slate-100"
                : "border-gray-200 bg-white text-gray-900"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`flex items-center justify-center h-10 w-10 rounded-xl border ${
                  darkMode ? "bg-slate-900 border-slate-800 text-violet-200" : "bg-violet-50 border-violet-200 text-violet-700"
                }`}
              >
                <Skull className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold tracking-tight">dataMortem</span>
                  <Badge
                    className={`text-[10px] border ${
                      darkMode ? "bg-emerald-500/10 text-emerald-200 border-emerald-500/30" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}
                  >
                    LIVE
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className={`text-[10px] uppercase tracking-wide ${darkMode ? "text-slate-500" : "text-gray-500"}`}>Case</span>
                  <select
                    value={cases.length ? currentCaseId : ""}
                    onChange={(e) => handleCaseSelect(e.target.value)}
                    disabled={!cases.length}
                    className={`rounded-lg border px-2 py-1 text-xs ${
                      darkMode ? "border-slate-800 bg-slate-900 text-slate-100" : "border-gray-300 bg-white text-gray-900"
                    }`}
                  >
                    {cases.length === 0 ? (
                      <option value="">No cases</option>
                    ) : (
                      cases.map((c) => (
                        <option key={c.case_id} value={c.case_id}>
                          {c.case_id} {c.status ? `• ${c.status}` : ""}
                        </option>
                      ))
                    )}
                  </select>
                  <span className={`text-[11px] ${darkMode ? "text-slate-500" : "text-gray-500"}`}>
                    Evidence {selectedEvidenceUid ?? "—"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <div
                className={`flex items-center gap-1 rounded-lg border px-2 py-1 ${
                  darkMode ? "border-slate-800 bg-slate-900" : "border-gray-200 bg-gray-50"
                }`}
              >
                <span className={`text-[10px] uppercase tracking-wide ${darkMode ? "text-slate-500" : "text-gray-500"}`}>Events</span>
                <span className="text-xs font-semibold">{events.length}</span>
              </div>
              <div
                className={`flex items-center gap-1 rounded-lg border px-2 py-1 ${
                  darkMode ? "border-slate-800 bg-slate-900" : "border-gray-200 bg-gray-50"
                }`}
              >
                <span className={`text-[10px] uppercase tracking-wide ${darkMode ? "text-slate-500" : "text-gray-500"}`}>Focus</span>
                <span className="text-xs font-semibold capitalize">{activeTab}</span>
              </div>
              <Button
                className={`h-7 px-3 text-[11px] ${
                  darkMode ? "border-slate-700 bg-slate-900 text-slate-200" : "border-gray-300 bg-white text-gray-800"
                }`}
                onClick={() => setActiveTab("evidences")}
              >
                Manage cases
              </Button>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                className={iconButtonClass}
                onClick={() => setDarkMode(!darkMode)}
                aria-label="Basculer le thème global"
              >
                {darkMode ? <Sun className="h-4 w-4 text-yellow-400" /> : <Moon className="h-4 w-4 text-indigo-600" />}
              </Button>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 text-[11px] font-medium">
              {[
                { key: "timeline" as const, label: "Timeline", icon: <Clock className="h-3.5 w-3.5" /> },
                { key: "explorer" as const, label: "Explorer", icon: <Search className="h-3.5 w-3.5" /> },
                { key: "evidences" as const, label: "Evidences", icon: <HardDrive className="h-3.5 w-3.5" /> },
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
                        ? "border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
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
              <div
                className={`ml-auto flex items-center gap-2 rounded-lg border px-3 py-1 ${
                  darkMode ? "border-slate-800 bg-slate-900 text-slate-300" : "border-gray-200 bg-gray-50 text-gray-700"
                }`}
              >
                <Activity className="h-3.5 w-3.5 text-rose-500" />
                <span className="text-[10px] uppercase tracking-wide">Highlights ready</span>
              </div>
            </div>
          </header>

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

              <Card className={`flex-1 min-w-0 ${darkMode ? "border-slate-700 bg-slate-900" : "border-gray-200 bg-white"}`}>
                <CardContent className="p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className={`text-sm font-semibold ${darkMode ? "text-slate-100" : "text-gray-900"}`}>Timeline</p>
                      <p className={`text-xs ${darkMode ? "text-slate-400" : "text-gray-500"}`}>
                        {timelineTotal ? `${timelineTotal.toLocaleString()} events agrégés` : "En attente de données"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={timelineInterval}
                        onChange={(e) => setTimelineInterval(e.target.value)}
                        className={`rounded-lg border px-2 py-1 text-sm ${
                          darkMode ? "border-slate-700 bg-slate-900 text-slate-100" : "border-gray-300 bg-white text-gray-900"
                        }`}
                      >
                        {["1m", "5m", "15m", "1h", "6h", "1d"].map((interval) => (
                          <option key={interval} value={interval}>
                            {interval}
                          </option>
                        ))}
                      </select>
                      <Button
                        onClick={loadTimelineFromOpenSearch}
                        disabled={timelineLoading}
                        className={`h-9 whitespace-nowrap px-3 text-xs font-semibold ${
                          darkMode
                            ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 disabled:border-slate-800 disabled:text-slate-500"
                            : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50 disabled:text-gray-400"
                        }`}
                      >
                        <RefreshCw className="mr-1.5 h-4 w-4" />
                        Refresh
                      </Button>
                    </div>
                  </div>
                  {timelineError && (
                    <div
                      className={`rounded-lg border px-3 py-2 text-xs ${
                        darkMode ? "border-rose-700 text-rose-200" : "border-rose-200 text-rose-600"
                      }`}
                    >
                      {timelineError}
                    </div>
                  )}
                  <div className="flex flex-col gap-4">
                    {timelineLoading ? (
                      <p className={`text-sm ${darkMode ? "text-slate-400" : "text-gray-500"}`}>Chargement de la timeline…</p>
                    ) : timelineBuckets.length === 0 ? (
                      <p className={`text-sm ${darkMode ? "text-slate-400" : "text-gray-500"}`}>Aucune donnée pour cette requête.</p>
                    ) : (
                      <>
                        <div className="overflow-x-auto pb-2">
                          <div className="flex items-end gap-2 min-h-[200px]">
                            {timelineBuckets.map((bucket) => {
                              const heightPercent = maxTimelineCount
                                ? Math.max((bucket.count / maxTimelineCount) * 100, 6)
                                : 0;
                              return (
                                <div key={`timeline-bar-${bucket.timestamp}`} className="flex flex-col items-center gap-1 min-w-[38px]">
                                  <div
                                    className={`w-4 sm:w-5 rounded-t ${darkMode ? "bg-violet-500/80" : "bg-violet-600/80"}`}
                                    style={{ height: `${heightPercent}%` }}
                                    title={`${bucket.timestamp} — ${bucket.count}`}
                                  />
                                  <span className={`text-[10px] text-center leading-tight ${darkMode ? "text-slate-500" : "text-gray-500"}`}>
                                    {formatTimelineLabel(bucket.timestamp)}
                                  </span>
                                  <span className={`text-[11px] font-semibold ${darkMode ? "text-slate-100" : "text-gray-900"}`}>
                                    {bucket.count}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div className="max-h-32 overflow-auto space-y-1 text-xs font-mono">
                          {timelineBuckets.map((bucket) => (
                            <div
                              key={`timeline-row-${bucket.timestamp}`}
                              className={`flex items-center justify-between rounded border px-2 py-1 ${
                                darkMode ? "border-slate-800 bg-slate-900/60" : "border-gray-200 bg-gray-50"
                              }`}
                            >
                              <span className="truncate pr-2">{bucket.timestamp}</span>
                              <span>{bucket.count}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

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

          {activeTab === "evidences" && (
            <EvidencesView
              darkMode={darkMode}
              currentCaseId={currentCaseId}
              onCaseChange={handleCaseSelect}
              onCasesUpdated={refreshCases}
            />
          )}

          {activeTab === "explorer" && (
            <ExplorerView
              darkMode={darkMode}
              currentCaseId={currentCaseId}
            />
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
        {selectedEvent ? (
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
                    onClick={() => setSelectedEventId(null)}
                    aria-label="Fermer le panneau détail"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
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
        ) : null}
      </main>
    </div>
  );
}

function WrenchIcon({ size = 16 }: { size?: number }) {
  return <Wrench className="h-4 w-4" style={{ height: size, width: size }} />;
}

// Wrapper component that handles authentication
export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#0a0e1a',
        color: '#fff',
        fontSize: '14px'
      }}>
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView />;
  }

  return (
    <>
      <Header />
      <AuthenticatedApp />
    </>
  );
}
