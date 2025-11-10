import { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { LoginView } from "./views/LoginView";
import { Header } from "./components/Header";
import { PipelineView } from "./components/PipelineView";
import { EvidencesView } from "./views/EvidencesView";
import { ExplorerView } from "./views/ExplorerView";
import { ScriptsView } from "./views/ScriptsView";
import { MarketplaceView } from "./views/MarketplaceView";
import { RulesView } from "./views/RulesView";
import { Sidebar } from "./components/layout/Sidebar";
import { EventInspector } from "./components/layout/EventInspector";
import { CaseIndexingSummary } from "./components/CaseIndexingSummary";
import { EmptyCaseView } from "./components/EmptyCaseView";
import { TimelineSearchBar } from "./components/timeline/TimelineSearchBar";
import { TimelineCard } from "./components/timeline/TimelineCard";
import { EventsTable } from "./components/timeline/EventsTable";
import { casesAPI, searchAPI, indexingAPI } from "./services/api";
import type { CaseIndexSummary } from "./types";

import { Card, CardContent } from "./components/ui/Card";

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
  const { user } = useAuth();
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
  const [caseSummary, setCaseSummary] = useState<CaseIndexSummary | null>(null);
  const [caseSummaryLoading, setCaseSummaryLoading] = useState(false);
  const [caseSummaryError, setCaseSummaryError] = useState<string | null>(null);

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

  const bgApp = darkMode ? "bg-slate-950 text-slate-50" : "bg-slate-50 text-slate-900";

  return (
    <div className={`flex h-screen w-full font-sans ${bgApp}`}>
      <Sidebar
        darkMode={darkMode}
        sidebarCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        cases={cases}
        currentCaseId={currentCaseId}
        onCaseSelect={handleCaseSelect}
        selectedEvidenceUid={selectedEvidenceUid}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        userRole={user?.role}
        eventsCount={events.length}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header darkMode={darkMode} onToggleTheme={() => setDarkMode((prev) => !prev)} />
        <main className={`flex flex-1 min-w-0 flex-col gap-4 overflow-auto p-4 ${darkMode ? "bg-slate-950" : "bg-slate-100"}`}>
          {(!cases.length || !currentCaseId) && activeTab !== "evidences" ? (
            <EmptyCaseView
              darkMode={darkMode}
              onGoToEvidences={() => setActiveTab("evidences")}
            />
          ) : (
            <>
              <section className="flex flex-col flex-[2] min-w-0 min-h-0 gap-4">
                <CaseIndexingSummary
                  darkMode={darkMode}
                  currentCaseId={currentCaseId}
                  caseSummary={caseSummary}
                  caseSummaryLoading={caseSummaryLoading}
                  caseSummaryError={caseSummaryError}
                />

                {activeTab === "timeline" && (
            <>
              <TimelineSearchBar
                darkMode={darkMode}
                currentCaseId={currentCaseId}
                query={query}
                onQueryChange={setQuery}
                onSearch={handleSearchSubmit}
              />

              <TimelineCard
                darkMode={darkMode}
                timelineBuckets={timelineBuckets}
                timelineInterval={timelineInterval}
                timelineLoading={timelineLoading}
                timelineError={timelineError}
                onIntervalChange={setTimelineInterval}
                onRefresh={loadTimelineFromOpenSearch}
              />

              {/* Events table */}
              <EventsTable
                darkMode={darkMode}
                events={events}
                selectedEventId={selectedEventId}
                onEventSelect={setSelectedEventId}
              />
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
        <EventInspector
          darkMode={darkMode}
          selectedEvent={selectedEvent}
          onClose={() => setSelectedEventId(null)}
        />
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
