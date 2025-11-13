import { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import { ToastContainer } from "./components/ui/ToastContainer";
import { useSuperAdminAlerts } from "./hooks/useSuperAdminAlerts";
import { LoginView } from "./views/LoginView";
import { PipelineView } from "./components/PipelineView";
import { EvidencesView } from "./views/EvidencesView";
import { ExplorerView } from "./views/ExplorerView";
import { ScriptsView } from "./views/ScriptsView";
import { MarketplaceView } from "./views/MarketplaceView";
import { RulesView } from "./views/RulesView";
import { SuperAdminView } from "./views/SuperAdminView";
import { ProfileView } from "./views/ProfileView";
import { Sidebar } from "./components/layout/Sidebar";
import { EventInspector } from "./components/layout/EventInspector";
// import { CaseIndexingSummary } from "./components/CaseIndexingSummary";
import { EmptyCaseView } from "./components/EmptyCaseView";
import { TimelineSearchBar } from "./components/timeline/TimelineSearchBar";
import { TimelineCard } from "./components/timeline/TimelineCard";
import { EventsTable } from "./components/timeline/EventsTable";
import { FeatureFlagsDrawer } from "./components/FeatureFlagsDrawer";
import { casesAPI, searchAPI, indexingAPI, featureFlagsAPI, type FeatureFlag } from "./services/api";
import type { CaseIndexSummary } from "./types";
import { EmailVerificationView } from "./views/EmailVerificationView";
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
  hedgedoc_url?: string | null;
};

type TimelineBucket = {
  timestamp: string;
  count: number;
};

// Main authenticated app component
function AuthenticatedApp() {
  const { user } = useAuth();
  const [darkMode, setDarkMode] = useState(true);
  
  // Surveiller la santé des services pour les superadmins
  useSuperAdminAlerts();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] =
    useState<"timeline" | "pipeline" | "rules" | "evidences" | "explorer" | "scripts" | "marketplace" | "admin" | "profile">("timeline");

  // Load current case from localStorage or use default
  const [currentCaseId, setCurrentCaseId] = useState<string>(() => {
    return localStorage.getItem('currentCaseId') || '';
  });
  const [selectedEvidenceUid, setSelectedEvidenceUid] = useState<string | null>(null);
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
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({
    account_creation: true,
    marketplace: true,
    pipeline: true,
  });
  const [featureFlagsDrawerOpen, setFeatureFlagsDrawerOpen] = useState(false);
  const userRole = user?.role;
  const isSuperAdmin = userRole === "superadmin";

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
    if (isSuperAdmin && activeTab === "explorer") {
      setActiveTab("admin");
    }
  }, [isSuperAdmin, activeTab]);

  useEffect(() => {
    if (!currentCaseId) {
      return;
    }
    loadTimelineFromOpenSearch();
  }, [timelineInterval]);

  useEffect(() => {
    loadCases();
  }, [casesRefreshToken]);

  // Load feature flags on mount and refresh periodically
  const refreshFeatureFlags = () => {
    featureFlagsAPI
      .list()
      .then((flags) => {
        const flagsMap: Record<string, boolean> = {};
        flags.forEach((flag) => {
          flagsMap[flag.feature_key] = flag.enabled;
        });
        setFeatureFlags(flagsMap);
      })
      .catch((err) => {
        console.error('Failed to load feature flags:', err);
        // Keep defaults on error
      });
  };

  useEffect(() => {
    refreshFeatureFlags();
    // Refresh every 30 seconds to pick up changes
    const interval = setInterval(refreshFeatureFlags, 30000);
    return () => clearInterval(interval);
  }, []);

  // Listen for feature flag updates from SuperAdminView
  useEffect(() => {
    const handleFeatureFlagUpdate = () => {
      refreshFeatureFlags();
    };
    window.addEventListener('feature-flag-updated', handleFeatureFlagUpdate);
    return () => {
      window.removeEventListener('feature-flag-updated', handleFeatureFlagUpdate);
    };
  }, []);

  // Keyboard shortcut: Ctrl/Cmd + Shift + F to open feature flags drawer (superadmin only)
  useEffect(() => {
    if (!isSuperAdmin) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setFeatureFlagsDrawerOpen((prev) => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSuperAdmin]);

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
    } catch (err: any) {
      // 404 is expected when the case hasn't been indexed yet - don't log as error
      if (err.message && (err.message.includes('404') || err.message.includes('Not Found') || err.message.includes('Index for case'))) {
        // Index doesn't exist yet - this is normal for new cases
        setEvents([]);
        setSelectedEventId(null);
      } else {
        console.error("failed to load events from OpenSearch", err);
        setEvents([]);
        setSelectedEventId(null);
      }
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
      if (err.message && (err.message.includes('404') || err.message.includes('Not Found') || err.message.includes('Index for case'))) {
        console.log("No timeline data for case:", currentCaseId);
        setTimelineBuckets([]);
        setTimelineError(null);
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

  const handleAddEventTag = (eventId: number, tag: string) => {
    setEvents((prev) =>
      prev.map((event) =>
        event.id === eventId
          ? {
              ...event,
              tags: Array.isArray(event.tags) ? [...event.tags, tag] : [tag],
            }
          : event
      )
    );
  };

  const bgApp = darkMode ? "bg-slate-950 text-slate-50" : "bg-slate-50 text-slate-900";

  return (
    <div className={`flex h-screen w-full font-sans ${darkMode ? "dark" : ""} ${bgApp}`}>
      <ToastContainer darkMode={darkMode} position="top-right" />
      <FeatureFlagsDrawer
        darkMode={darkMode}
        isOpen={featureFlagsDrawerOpen}
        onClose={() => setFeatureFlagsDrawerOpen(false)}
      />
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
        featureFlags={featureFlags}
        onOpenFeatureFlags={() => setFeatureFlagsDrawerOpen(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className={`flex flex-1 min-w-0 flex-col gap-4 overflow-auto p-4 ${darkMode ? "bg-slate-950" : "bg-slate-100"}`}>
          {(!cases.length || !currentCaseId) && activeTab !== "evidences" && activeTab !== "profile" ? (
            <EmptyCaseView darkMode={darkMode} onGoToEvidences={() => setActiveTab("evidences")} />
          ) : (
            <div className="flex flex-1 gap-4">
              <section className="flex flex-col flex-[2] min-h-0 min-w-0 gap-4">
                {/* Statut d'indexation temporairement désactivé */}
                {/* {activeTab !== "profile" && (
                  <CaseIndexingSummary
                    darkMode={darkMode}
                    currentCaseId={currentCaseId}
                    caseSummary={caseSummary}
                    caseSummaryLoading={caseSummaryLoading}
                    caseSummaryError={caseSummaryError}
                  />
                )} */}

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

                {activeTab === "explorer" && <ExplorerView darkMode={darkMode} currentCaseId={currentCaseId} />}

                {activeTab === "pipeline" && (
                  <Card className={`flex-1 ${darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50"}`}>
                    <CardContent className="p-0">
                      <PipelineView 
                        selectedEvidenceUid={selectedEvidenceUid} 
                        setSelectedEvidenceUid={setSelectedEvidenceUid}
                        darkMode={darkMode} 
                        isActive={activeTab === "pipeline"} 
                      />
                    </CardContent>
                  </Card>
                )}

                {activeTab === "marketplace" && <MarketplaceView darkMode={darkMode} />}
                {activeTab === "scripts" && <ScriptsView darkMode={darkMode} />}
                {activeTab === "rules" && <RulesView darkMode={darkMode} />}
                {activeTab === "admin" && isSuperAdmin && <SuperAdminView darkMode={darkMode} />}
                {activeTab === "profile" && <ProfileView darkMode={darkMode} onToggleTheme={() => setDarkMode((prev) => !prev)} />}
              </section>

              {activeTab !== "profile" && (
                <EventInspector
                  darkMode={darkMode}
                  selectedEvent={selectedEvent}
                  onClose={() => setSelectedEventId(null)}
                  onAddTag={handleAddEventTag}
                />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// Wrapper component that handles authentication / special routes
export default function App() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  if (pathname === "/verify-email") {
    return <EmailVerificationView />;
  }

  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
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
