import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Search, ChevronLeft, ChevronRight, RefreshCw, Filter, Plus, Trash2 } from "lucide-react";

interface ExplorerViewProps {
  darkMode: boolean;
  currentCaseId: string;
}

interface SearchResult {
  id: string;
  doc: Record<string, any>;
  timestamp?: string;
  parser?: string;
  message?: string;
  score?: number;
}

type FilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "prefix"
  | "wildcard"
  | "exists"
  | "missing";

interface FilterRow {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
}

interface AggregationBucket {
  key: string;
  count: number;
}

interface TimelineBucket {
  timestamp: string;
  count: number;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const FILTER_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: "equals", label: "=" },
  { value: "not_equals", label: "≠" },
  { value: "contains", label: "contains" },
  { value: "prefix", label: "prefix" },
  { value: "wildcard", label: "wildcard" },
  { value: "exists", label: "exists" },
  { value: "missing", label: "missing" },
];
const COMMON_FIELDS = [
  { value: "source.parser", label: "Parser" },
  { value: "event.type", label: "Event Type" },
  { value: "event.action", label: "Event Action" },
  { value: "host.hostname", label: "Host" },
  { value: "user.name", label: "User" },
  { value: "process.name", label: "Process Name" },
  { value: "file.path", label: "File Path" },
];
const DEFAULT_FILTER: FilterRow = {
  id: "filter-0",
  field: "",
  operator: "equals",
  value: "",
};

export function ExplorerView({ darkMode, currentCaseId }: ExplorerViewProps) {
  const [queryInput, setQueryInput] = useState("*");
  const [submittedQuery, setSubmittedQuery] = useState("*");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterRow[]>([]);
  const [timeRange, setTimeRange] = useState({ gte: "", lte: "" });
  const [aggField, setAggField] = useState("event.type");
  const [aggSize, setAggSize] = useState(10);
  const [aggBuckets, setAggBuckets] = useState<AggregationBucket[]>([]);
  const [aggLoading, setAggLoading] = useState(false);
  const [timelineInterval, setTimelineInterval] = useState("1h");
  const [timelineBuckets, setTimelineBuckets] = useState<TimelineBucket[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const textWeak = darkMode ? "text-slate-400" : "text-gray-500";
  const textStrong = darkMode ? "text-slate-100" : "text-gray-900";
  const cardBg = darkMode ? "border-slate-700 bg-slate-900" : "border-gray-200 bg-white";

  const from = page * pageSize;
  const canPrev = page > 0;
  const canNext = from + pageSize < total;

  const filterPayload = useMemo(() => {
    return filters
      .filter((row) => row.field && (row.operator === "exists" || row.operator === "missing" || row.value.trim().length > 0))
      .map((row) => ({
        field: row.field,
        operator: row.operator,
        value: row.operator === "exists" || row.operator === "missing" ? null : row.value,
      }));
  }, [filters]);

  const timeRangePayload = useMemo(() => {
    const payload: Record<string, string> = {};
    if (timeRange.gte.trim()) {
      payload.gte = timeRange.gte.trim();
    }
    if (timeRange.lte.trim()) {
      payload.lte = timeRange.lte.trim();
    }
    return Object.keys(payload).length ? payload : undefined;
  }, [timeRange]);
  const timeRangeKey = useMemo(() => JSON.stringify(timeRangePayload ?? {}), [timeRangePayload]);
  const maxTimelineCount = useMemo(
    () => (timelineBuckets.length ? Math.max(...timelineBuckets.map((b) => b.count)) || 1 : 1),
    [timelineBuckets]
  );

  const triggerSearch = () => {
    if (!currentCaseId) {
      setResults([]);
      setTotal(0);
      setError("Select a case first");
      return;
    }
    setSubmittedQuery(queryInput.trim() || "*");
    setPage(0);
    setRefreshToken((t) => t + 1);
  };

  const addFilterRow = () => {
    setFilters((prev) => [
      ...prev,
      {
        ...DEFAULT_FILTER,
        id: `filter-${Date.now()}`,
      },
    ]);
  };

  const updateFilterRow = (id: string, patch: Partial<FilterRow>) => {
    setFilters((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeFilterRow = (id: string) => {
    setFilters((prev) => prev.filter((row) => row.id !== id));
  };

  useEffect(() => {
    setPage(0);
    setRefreshToken((t) => t + 1);
  }, [currentCaseId, pageSize, filterPayload, timeRangeKey]);

  useEffect(() => {
    if (!currentCaseId) {
      setResults([]);
      setTotal(0);
      return;
    }

    const controller = new AbortController();
    const runSearch = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/search/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            query: submittedQuery,
            case_id: currentCaseId,
            size: pageSize,
            from: page * pageSize,
            sort_by: "@timestamp",
            sort_order: "desc",
            field_filters: filterPayload,
            time_range: timeRangePayload,
          }),
        });

        if (!res.ok) {
          throw new Error(await res.text());
        }

        const data = await res.json();
        const mapped: SearchResult[] = (data.hits || []).map((doc: any, index: number) => ({
          id: `${from + index}-${doc["@timestamp"] || ""}`,
          doc,
          timestamp: doc["@timestamp"],
          parser: doc.source?.parser || doc["source.parser"],
          message:
            doc.message ||
            doc["file.path"] ||
            doc.file?.path ||
            doc.process?.command_line ||
            doc.event?.action ||
            JSON.stringify(doc).slice(0, 160),
          score: doc._score,
        }));

        setResults(mapped);
        setTotal(data.total || 0);
      } catch (err: any) {
        if (err.name === "AbortError") return;
        console.error("explorer search failed", err);
        setError("Search failed. Check case index or query.");
        setResults([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    };

    runSearch();

    return () => controller.abort();
  }, [currentCaseId, submittedQuery, page, pageSize, refreshToken, filterPayload, timeRangeKey]);

  useEffect(() => {
    if (!currentCaseId) {
      setAggBuckets([]);
      return;
    }

    const controller = new AbortController();
    const runAgg = async () => {
      setAggLoading(true);
      try {
        const res = await fetch("/api/search/aggregate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            case_id: currentCaseId,
            field: aggField,
            size: aggSize,
            query: submittedQuery,
            field_filters: filterPayload,
            time_range: timeRangePayload,
          }),
        });
        if (!res.ok) {
          throw new Error(await res.text());
        }
        const data = await res.json();
        setAggBuckets(data.buckets || []);
      } catch (err) {
        if ((err as any).name === "AbortError") return;
        console.error("aggregation failed", err);
        setAggBuckets([]);
      } finally {
        setAggLoading(false);
      }
    };

    runAgg();
    return () => controller.abort();
  }, [currentCaseId, submittedQuery, aggField, aggSize, filterPayload, timeRangeKey]);

  useEffect(() => {
    if (!currentCaseId) {
      setTimelineBuckets([]);
      return;
    }

    const controller = new AbortController();
    const runTimeline = async () => {
      setTimelineLoading(true);
      try {
        const res = await fetch("/api/search/timeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            case_id: currentCaseId,
            interval: timelineInterval,
            query: submittedQuery,
            field_filters: filterPayload,
            time_range: timeRangePayload,
          }),
        });
        if (!res.ok) {
          throw new Error(await res.text());
        }
        const data = await res.json();
        setTimelineBuckets(data.buckets || []);
      } catch (err) {
        if ((err as any).name === "AbortError") return;
        console.error("timeline failed", err);
        setTimelineBuckets([]);
      } finally {
        setTimelineLoading(false);
      }
    };

    runTimeline();
    return () => controller.abort();
  }, [currentCaseId, submittedQuery, timelineInterval, filterPayload, timeRangeKey]);

  const pageInfo = useMemo(() => {
    if (!total) return "0 results";
    const start = from + 1;
    const end = Math.min(from + pageSize, total);
    return `${start}-${end} / ${total}`;
  }, [from, pageSize, total]);

  const handleBucketClick = (bucket: AggregationBucket) => {
    setFilters((prev) => [
      ...prev,
      {
        id: `filter-${Date.now()}`,
        field: aggField,
        operator: "equals",
        value: bucket.key,
      },
    ]);
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <Card className={cardBg}>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-2">
            <label className={`text-sm font-semibold ${textStrong}`}>Search query</label>
            <div className="flex flex-col gap-2 md:flex-row">
              <div className="flex flex-1 items-center gap-2">
                <Input
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  placeholder="ex: process.name:svchost.exe AND event.type:file"
                  className={darkMode ? "border-slate-700 bg-slate-900 text-slate-50" : ""}
                />
                <Button
                  onClick={triggerSearch}
                  className={
                    darkMode
                      ? "border-violet-600/30 bg-violet-950/40 text-violet-200"
                      : "border-violet-300 bg-violet-50 text-violet-700"
                  }
                >
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className={`text-xs ${textWeak}`}>Page size</label>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
                  className={`rounded-lg border px-2 py-1 text-sm ${
                    darkMode ? "border-slate-700 bg-slate-900 text-slate-100" : "border-gray-300 bg-white text-gray-900"
                  }`}
                >
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <label className={`text-xs ${textWeak}`}>Time range</label>
                <Input
                  value={timeRange.gte}
                  onChange={(e) => setTimeRange((prev) => ({ ...prev, gte: e.target.value }))}
                  placeholder="gte (ex: 2024-11-01T00:00:00Z)"
                  className={`w-48 ${darkMode ? "border-slate-700 bg-slate-900 text-slate-50" : ""}`}
                />
                <Input
                  value={timeRange.lte}
                  onChange={(e) => setTimeRange((prev) => ({ ...prev, lte: e.target.value }))}
                  placeholder="lte"
                  className={`w-48 ${darkMode ? "border-slate-700 bg-slate-900 text-slate-50" : ""}`}
                />
                <Button
                  onClick={() => setRefreshToken((t) => t + 1)}
                  className={
                    darkMode ? "border-slate-700 bg-slate-900 text-slate-200" : "border-gray-300 bg-white text-gray-800"
                  }
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-violet-400" />
              <span className={`text-sm font-semibold ${textStrong}`}>Filters</span>
              <Button
                onClick={addFilterRow}
                className={
                  darkMode ? "border-slate-700 bg-slate-900 text-slate-200" : "border-gray-300 bg-white text-gray-800"
                }
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {filters.length === 0 && (
              <p className={`text-xs italic ${textWeak}`}>No filters defined. Use the + button to add one.</p>
            )}
            <div className="space-y-2">
              {filters.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
                  <select
                    value={row.field}
                    onChange={(e) => updateFilterRow(row.id, { field: e.target.value })}
                    className={`rounded-lg border px-2 py-1 text-sm ${
                      darkMode ? "border-slate-700 bg-slate-900 text-slate-50" : "border-gray-300 bg-white text-gray-900"
                    }`}
                  >
                    <option value="">Choose field</option>
                    {COMMON_FIELDS.map((field) => (
                      <option key={field.value} value={field.value}>
                        {field.label} ({field.value})
                      </option>
                    ))}
                  </select>
                  <select
                    value={row.operator}
                    onChange={(e) => updateFilterRow(row.id, { operator: e.target.value as FilterOperator })}
                    className={`rounded-lg border px-2 py-1 text-sm ${
                      darkMode ? "border-slate-700 bg-slate-900 text-slate-50" : "border-gray-300 bg-white text-gray-900"
                    }`}
                  >
                    {FILTER_OPERATORS.map((op) => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </select>
                  {row.operator !== "exists" && row.operator !== "missing" && (
                    <Input
                      value={row.value}
                      onChange={(e) => updateFilterRow(row.id, { value: e.target.value })}
                      placeholder="value"
                      className={darkMode ? "border-slate-700 bg-slate-900 text-slate-50" : ""}
                    />
                  )}
                  <Button
                    onClick={() => removeFilterRow(row.id)}
                    className={
                      darkMode ? "border-rose-600/30 bg-rose-900/20 text-rose-200" : "border-rose-300 bg-rose-50 text-rose-700"
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                darkMode ? "border-rose-600/30 bg-rose-900/20 text-rose-200" : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={`flex-1 ${cardBg}`}>
        <CardContent className="p-0 flex flex-col h-full">
          <div className={`flex items-center justify-between border-b px-4 py-3 ${darkMode ? "border-slate-800" : "border-gray-200"}`}>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold ${textStrong}`}>Results</span>
              <Badge
                className={`text-[10px] border ${
                  darkMode ? "bg-slate-900 text-slate-200 border-slate-700" : "bg-gray-50 text-gray-700 border-gray-200"
                }`}
              >
                {pageInfo}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Button
                disabled={!canPrev || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className={`${darkMode ? "border-slate-700 bg-slate-900 text-slate-200" : "border-gray-300 bg-white text-gray-800"} disabled:opacity-40`}
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </Button>
              <Button
                disabled={!canNext || loading}
                onClick={() => setPage((p) => p + 1)}
                className={`${darkMode ? "border-slate-700 bg-slate-900 text-slate-200" : "border-gray-300 bg-white text-gray-800"} disabled:opacity-40`}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="p-8 text-center text-sm">
                <p className={textWeak}>Searching...</p>
              </div>
            ) : results.length === 0 ? (
              <div className="p-8 text-center text-sm">
                <p className={textWeak}>No events found. Try another query or case.</p>
              </div>
            ) : (
              <table className="min-w-full text-left text-sm">
                <thead className={darkMode ? "bg-slate-900 text-slate-400" : "bg-gray-50 text-gray-500"}>
                  <tr>
                    <th className="px-4 py-2 w-40">Timestamp</th>
                    <th className="px-4 py-2 w-32">Parser</th>
                    <th className="px-4 py-2">Message</th>
                    <th className="px-4 py-2 w-24">Score</th>
                  </tr>
                </thead>
                <tbody className={darkMode ? "divide-y divide-slate-800 text-slate-100" : "divide-y divide-gray-100 text-gray-900"}>
                  {results.map((hit) => (
                    <tr key={hit.id}>
                      <td className="px-4 py-2 text-xs text-slate-400">{hit.timestamp || "-"}</td>
                      <td className="px-4 py-2 text-xs">{hit.parser || hit.doc["source.parser"] || "-"}</td>
                      <td className="px-4 py-2 text-xs">{hit.message}</td>
                      <td className="px-4 py-2 text-xs">{hit.score ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className={cardBg}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className={`text-sm font-semibold ${textStrong}`}>Aggregations</span>
              <select
                value={aggField}
                onChange={(e) => setAggField(e.target.value)}
                className={`rounded-lg border px-2 py-1 text-sm ${
                  darkMode ? "border-slate-700 bg-slate-900 text-slate-50" : "border-gray-300 bg-white text-gray-900"
                }`}
              >
                {COMMON_FIELDS.map((field) => (
                  <option key={field.value} value={field.value}>
                    {field.label}
                  </option>
                ))}
              </select>
              <select
                value={aggSize}
                onChange={(e) => setAggSize(parseInt(e.target.value, 10))}
                className={`rounded-lg border px-2 py-1 text-sm ${
                  darkMode ? "border-slate-700 bg-slate-900 text-slate-50" : "border-gray-300 bg-white text-gray-900"
                }`}
              >
                {[5, 10, 20, 50].map((size) => (
                  <option key={size} value={size}>
                    Top {size}
                  </option>
                ))}
              </select>
            </div>
            {aggLoading ? (
              <p className={`text-sm ${textWeak}`}>Loading aggregations…</p>
            ) : aggBuckets.length === 0 ? (
              <p className={`text-sm ${textWeak}`}>No buckets.</p>
            ) : (
              <div className="space-y-2">
                {aggBuckets.map((bucket) => (
                  <button
                    key={bucket.key}
                    onClick={() => handleBucketClick(bucket)}
                    className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-left transition ${
                      darkMode ? "border-slate-800 hover:bg-slate-800" : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <span className="text-sm truncate">{bucket.key || "<empty>"}</span>
                    <span className="text-xs font-semibold">{bucket.count}</span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={cardBg}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className={`text-sm font-semibold ${textStrong}`}>Timeline</span>
              <select
                value={timelineInterval}
                onChange={(e) => setTimelineInterval(e.target.value)}
                className={`rounded-lg border px-2 py-1 text-sm ${
                  darkMode ? "border-slate-700 bg-slate-900 text-slate-50" : "border-gray-300 bg-white text-gray-900"
                }`}
              >
                {["1m", "5m", "15m", "1h", "6h", "1d"].map((interval) => (
                  <option key={interval} value={interval}>
                    {interval}
                  </option>
                ))}
              </select>
            </div>
            {timelineLoading ? (
              <p className={`text-sm ${textWeak}`}>Loading timeline…</p>
            ) : timelineBuckets.length === 0 ? (
              <p className={`text-sm ${textWeak}`}>No timeline data.</p>
            ) : (
              <div className="space-y-1 max-h-64 overflow-auto text-xs font-mono">
                {timelineBuckets.map((bucket) => (
                  <div key={bucket.timestamp} className="flex items-center gap-2">
                    <span className="w-40 truncate">{bucket.timestamp}</span>
                    <div className="flex-1 h-2 rounded bg-violet-500/30">
                      <div
                        className="h-2 rounded bg-violet-500"
                        style={{ width: `${(bucket.count / maxTimelineCount) * 100}%` }}
                      />
                    </div>
                    <span>{bucket.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
