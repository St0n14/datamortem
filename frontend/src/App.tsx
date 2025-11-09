import { useState, useEffect, useMemo } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { LoginView } from "./views/LoginView";
import { Header } from "./components/Header";
import { PipelineView } from "./components/PipelineView";
import { EvidencesView } from "./views/EvidencesView";
import { ExplorerView } from "./views/ExplorerView";
import { ScriptsView } from "./views/ScriptsView";
import { MarketplaceView } from "./views/MarketplaceView";
import { RulesView } from "./views/RulesView";
import { BrandMark } from "./components/BrandMark";
import { casesAPI, searchAPI, indexingAPI } from "./services/api";
import type { CaseIndexSummary } from "./types";
import {
  Search,
  Filter,
  Clock,
  ShieldCheck,
  Wrench,
  HardDrive,
  X,
  RefreshCw,
  FileCode2,
  Store,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { Card, CardContent } from "./components/ui/Card";
import { Button } from "./components/ui/Button";
import { Input } from "./components/ui/Input";
import { Badge } from "./components/ui/Badge";
import { TimelineChart } from "./components/TimelineChart";

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] =
    useState<"timeline" | "pipeline" | "rules" | "evidences" | "explorer" | "scripts" | "marketplace">("timeline");

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
  const [timelineDetailsExpanded, setTimelineDetailsExpanded] = useState(false);
  const [caseSummary, setCaseSummary] = useState<CaseIndexSummary | null>(null);
  const [caseSummaryLoading, setCaseSummaryLoading] = useState(false);
  const [caseSummaryError, setCaseSummaryError] = useState<string | null>(null);
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
      setTimelineError(null);
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

  useEffect(() => {
    if (!currentCaseId) {
      setCaseSummary(null);
      return;
    }
    setCaseSummaryLoading(true);
    setCaseSummaryError(null);
    indexingAPI
      .getCaseSummary(currentCaseId)
      .then((summary) => setCaseSummary(summary))
      .catch((err) => {
        // 404 is expected when the case hasn't been indexed yet - don't show error
        if (err.message && (err.message.includes('404') || err.message.includes('Not Found'))) {
          console.log("Case not indexed yet:", currentCaseId);
          setCaseSummary(null);
        } else {
          console.error("Failed to fetch indexing summary", err);
          setCaseSummaryError("Impossible de récupérer le statut d'indexation.");
          setCaseSummary(null);
        }
      })
      .finally(() => setCaseSummaryLoading(false));
  }, [currentCaseId]);

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
      setTimelineError(null);
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
    } catch (err: any) {
      // 404 is expected when the case hasn't been indexed yet - don't show error
      if (err.message && (err.message.includes('404') || err.message.includes('Not Found'))) {
        console.log("No timeline data for case:", currentCaseId);
        setTimelineBuckets([]);
      } else {
        console.error("failed to load timeline", err);
        setTimelineError("Impossible de charger la timeline (OpenSearch ?).");
        setTimelineBuckets([]);
      }
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
        default: "bg-gray-100 text-slate-700 border border-slate-300",
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

  const bgApp = darkMode ? "bg-slate-950 text-slate-50" : "bg-slate-50 text-slate-900";
  const textWeak = darkMode ? "text-slate-500" : "text-slate-600";
  const textStrong = darkMode ? "text-slate-100" : "text-slate-900";
  const iconButtonClass = darkMode
    ? "h-8 w-8 p-0 border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
    : "h-8 w-8 p-0 border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200";
  const navItems = [
    { key: "timeline" as const, label: "Timeline", icon: <Clock className="h-4 w-4" /> },
    { key: "explorer" as const, label: "Explorer", icon: <Search className="h-4 w-4" /> },
    { key: "evidences" as const, label: "Evidences", icon: <HardDrive className="h-4 w-4" /> },
    { key: "pipeline" as const, label: "Pipeline", icon: <Wrench className="h-4 w-4" /> },
    { key: "marketplace" as const, label: "Marketplace", icon: <Store className="h-4 w-4" /> },
    { key: "scripts" as const, label: "Scripts", icon: <FileCode2 className="h-4 w-4" /> },
    { key: "rules" as const, label: "Rules", icon: <ShieldCheck className="h-4 w-4" /> },
  ];

  return (
    <div className={`flex h-screen w-full font-sans ${bgApp}`}>
      <aside
        className={`relative flex flex-col gap-4 border-r px-3 py-4 transition-all duration-300 ${
          sidebarCollapsed ? "w-16" : "w-56"
        } ${darkMode ? "border-slate-900 bg-slate-950/90" : "border-gray-200 bg-slate-50"}`}
      >
        {/* Toggle button */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className={`absolute -right-3 top-6 z-10 rounded-full border p-1 transition-colors ${
            darkMode
              ? "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
              : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-200"
          }`}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>

        <div className={`space-y-3 ${sidebarCollapsed ? "hidden" : ""}`}>
          <BrandMark subtitle="Investigation Console" />
          <Badge
            className={`text-[10px] border ${
              darkMode ? "bg-emerald-500/10 text-emerald-200 border-emerald-500/30" : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`}
          >
            LIVE
          </Badge>
        </div>

        <div className={`space-y-2 ${sidebarCollapsed ? "hidden" : ""}`}>
          <p className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? "text-slate-400" : "text-gray-600"}`}>
            Current Case
          </p>
          <select
            value={cases.length ? currentCaseId : ""}
            onChange={(e) => handleCaseSelect(e.target.value)}
            disabled={!cases.length}
            className={`w-full rounded-lg border px-2 py-1.5 text-sm ${
              darkMode ? "border-slate-800 bg-slate-900 text-slate-100" : "border-gray-300 bg-slate-50 text-gray-900"
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
          <Button
            className={`h-8 w-full text-xs ${
              darkMode ? "border-slate-800 bg-slate-900 text-slate-200" : "border-gray-200 bg-gray-50 text-slate-800"
            }`}
            onClick={() => setActiveTab("evidences")}
          >
            Manage cases
          </Button>
          <p className={`text-[11px] ${darkMode ? "text-slate-500" : "text-gray-500"}`}>
            Evidence focus: <span className="font-semibold">{selectedEvidenceUid ?? "—"}</span>
          </p>
        </div>

        <div className="space-y-2">
          <p className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? "text-slate-400" : "text-gray-600"} ${sidebarCollapsed ? "hidden" : ""}`}>
            Navigation
          </p>
          <div className="flex flex-col gap-1">
            {navItems.map((item) => {
              const active = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveTab(item.key)}
                  className={`flex items-center ${sidebarCollapsed ? "justify-center" : "gap-2"} rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                    active
                      ? darkMode
                        ? "border-violet-500/40 bg-violet-900/30 text-violet-100"
                        : "border-violet-300 bg-violet-50 text-violet-800"
                      : darkMode
                      ? "border-slate-900 bg-slate-900/40 text-slate-300 hover:bg-slate-900/70"
                      : "border-gray-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  {item.icon}
                  {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className={`mt-auto space-y-1 rounded-xl border px-3 py-3 text-xs ${sidebarCollapsed ? "hidden" : ""}`}>
          <p className={textWeak}>Events loaded: {events.length}</p>
          <p className={textWeak}>Active tab: {activeTab}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header darkMode={darkMode} onToggleTheme={() => setDarkMode((prev) => !prev)} />
        <main className={`flex flex-1 min-w-0 flex-col gap-4 overflow-auto p-4 ${darkMode ? "bg-slate-950" : "bg-slate-100"}`}>
          {(!cases.length || !currentCaseId) && activeTab !== "evidences" ? (
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
                onClick={() => setActiveTab("evidences")}
              >
                Aller vers Evidences
              </Button>
            </div>
          ) : (
            <>
              <section className="flex flex-col flex-[2] min-w-0 min-h-0 gap-4">
                <div
                  className={`rounded-2xl border px-4 py-3 ${
                    darkMode ? "border-slate-800 bg-slate-900/60" : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className={`text-sm font-semibold ${textStrong}`}>Statut d’indexation</p>
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
                    !caseSummaryError && <p className={`mt-2 text-sm ${textWeak}`}>Aucune donnée d’indexation disponible.</p>
                  )}
                </div>

                {activeTab === "timeline" && (
            <>
              <div className="flex flex-col gap-3">
                {/* Label avec badge du case */}
                <div className={`text-xs font-semibold flex items-center gap-2 ${darkMode ? "text-slate-100" : "text-slate-900"}`}>
                  <span>OpenSearch Query</span>
                  <Badge
                    className={`rounded-md border text-[11px] ${
                      darkMode ? "bg-violet-950/40 text-violet-200 border-violet-600/30" : "bg-violet-50 text-violet-700 border-violet-300"
                    }`}
                  >
                    {currentCaseId}
                  </Badge>
                </div>

                {/* Barre de recherche avec tous les boutons alignés */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Champ de recherche */}
                  <div className="relative flex-1 min-w-[280px]">
                    <Search className={`absolute left-3 top-2.5 h-4 w-4 ${darkMode ? "text-slate-500" : "text-gray-400"}`} />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSearchSubmit()}
                      className="pl-9 pr-20 h-9"
                      placeholder="Enter query..."
                    />
                    <div
                      className={`absolute right-2 top-2 text-[10px] font-mono rounded-md px-1.5 py-0.5 border ${
                        darkMode ? "text-slate-400 bg-slate-900 border-slate-700" : "text-slate-600 bg-slate-50 border-slate-300"
                      }`}
                    >
                      ⏎ Run
                    </div>
                  </div>

                  {/* Bouton Search */}
                  <Button
                    onClick={handleSearchSubmit}
                    className={`h-9 px-4 rounded-lg border text-sm font-medium whitespace-nowrap ${
                      darkMode ? "border-violet-600/30 bg-violet-950/40 text-violet-200 hover:bg-violet-900/30" : "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
                    }`}
                  >
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </Button>

                  {/* Bouton Filters */}
                  <Button
                    className={`h-9 px-4 rounded-lg border text-sm font-medium whitespace-nowrap ${
                      darkMode ? "border-sky-600/30 bg-sky-900/20 text-sky-200 hover:bg-sky-900/30" : "border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100"
                    }`}
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    Filters
                  </Button>

                  {/* Bouton Export CSV */}
                  <Button
                    className={`h-9 px-4 rounded-lg border text-sm font-medium whitespace-nowrap ${
                      darkMode ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-200"
                    }`}
                  >
                    Export CSV
                  </Button>
                </div>
              </div>

              <Card className={`flex-1 min-w-0 ${darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50"}`}>
                <CardContent className="p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className={`text-sm font-semibold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>Timeline</p>
                      <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                        {timelineTotal ? `${timelineTotal.toLocaleString()} events agrégés` : "En attente de données"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={timelineInterval}
                        onChange={(e) => setTimelineInterval(e.target.value)}
                        className={`rounded-lg border px-2 py-1 text-sm ${
                          darkMode ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-300 bg-slate-50 text-slate-900"
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
                            : "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100 disabled:text-gray-400"
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
                  {timelineLoading ? (
                    <p className={`text-sm ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Chargement de la timeline…</p>
                  ) : timelineBuckets.length === 0 ? (
                    <p className={`text-sm ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Aucune donnée pour cette requête.</p>
                  ) : (
                    <div className="flex flex-col gap-4">
                      <TimelineChart data={timelineBuckets} darkMode={darkMode} />

                      {/* Toggle button for detailed list */}
                      <button
                        onClick={() => setTimelineDetailsExpanded(!timelineDetailsExpanded)}
                        className={`flex items-center justify-between w-full px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                          darkMode
                            ? "border-slate-700 bg-slate-800/50 text-slate-200 hover:bg-slate-800"
                            : "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          {timelineDetailsExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                          Detailed Timeline Data ({timelineBuckets.length} buckets)
                        </span>
                        <span className={`text-xs ${darkMode ? "text-slate-500" : "text-slate-600"}`}>
                          {timelineDetailsExpanded ? "Click to hide" : "Click to expand"}
                        </span>
                      </button>

                      {/* Collapsible detailed list */}
                      {timelineDetailsExpanded && (
                        <div className="max-h-64 overflow-auto space-y-1 text-xs font-mono">
                          {timelineBuckets.map((bucket) => (
                            <div
                              key={`timeline-row-${bucket.timestamp}`}
                              className={`flex items-center justify-between rounded border px-2 py-1 ${
                                darkMode ? "border-slate-800 bg-slate-900/60" : "border-slate-200 bg-slate-100"
                              }`}
                            >
                              <span className="truncate pr-2">{formatTimelineLabel(bucket.timestamp)}</span>
                              <span>{bucket.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Events table */}
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
                              onClick={() => setSelectedEventId(e.id)}
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
            <Card className={`flex-1 ${darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50"}`}>
              <CardContent className="p-0">
                <PipelineView selectedEvidenceUid={selectedEvidenceUid} darkMode={darkMode} />
              </CardContent>
            </Card>
          )}

          {activeTab === "marketplace" && (
            <MarketplaceView darkMode={darkMode} />
          )}

          {activeTab === "scripts" && (
            <ScriptsView darkMode={darkMode} />
          )}

          {activeTab === "rules" && (
            <RulesView darkMode={darkMode} />
          )}
        </section>

        {/* INSPECTOR RIGHT */}
        {selectedEvent ? (
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
                    onClick={() => setSelectedEventId(null)}
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
        ) : null}
              </>
            )}
        </main>
      </div>
    </div>
  );
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

  return <AuthenticatedApp />;
}
