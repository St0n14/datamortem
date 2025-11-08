import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Search, ChevronLeft, ChevronRight, RefreshCw, Filter, Plus, Trash2, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

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

type FieldSample = {
  field: string;
  value: string;
};

const isScalarValue = (value: unknown): value is string | number | boolean =>
  ["string", "number", "boolean"].includes(typeof value);

const collectFieldSamplesFromDoc = (
  doc: Record<string, any>,
  collector: Map<string, string>,
  prefix = ""
) => {
  Object.entries(doc).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      return;
    }

    if (isScalarValue(value)) {
      if (!collector.has(path)) {
        collector.set(path, String(value));
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (isScalarValue(entry) && !collector.has(path)) {
          collector.set(path, String(entry));
          break;
        }
        if (entry && typeof entry === "object") {
          collectFieldSamplesFromDoc(entry as Record<string, any>, collector, path);
        }
      }
      return;
    }

    if (typeof value === "object") {
      collectFieldSamplesFromDoc(value as Record<string, any>, collector, path);
    }
  });
};

export function ExplorerView({ darkMode, currentCaseId }: ExplorerViewProps) {
  const { token } = useAuth();
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
  const [aggCollapsed, setAggCollapsed] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [fieldSamples, setFieldSamples] = useState<FieldSample[]>([]);
  const [fieldSearch, setFieldSearch] = useState("");
  const [fieldExplorerOpen, setFieldExplorerOpen] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<SearchResult | null>(null);

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
  const aggregationFieldOptions = useMemo(() => {
    const merged = new Map<string, string>();
    COMMON_FIELDS.forEach((field) => merged.set(field.value, field.label));
    fieldSamples.forEach((sample) => {
      if (!merged.has(sample.field)) {
        merged.set(sample.field, sample.field);
      }
    });
    return Array.from(merged.entries()).map(([value, label]) => ({ value, label }));
  }, [fieldSamples]);
  const filteredFieldSamples = useMemo(() => {
    if (!fieldSearch.trim()) {
      return fieldSamples.slice(0, 50);
    }
    const needle = fieldSearch.toLowerCase();
    return fieldSamples.filter((sample) => sample.field.toLowerCase().includes(needle)).slice(0, 50);
  }, [fieldSamples, fieldSearch]);
  const authHeaders = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  useEffect(() => {
    if (aggregationFieldOptions.length === 0) {
      return;
    }
    const exists = aggregationFieldOptions.some((option) => option.value === aggField);
    if (!exists) {
      setAggField(aggregationFieldOptions[0].value);
    }
  }, [aggregationFieldOptions, aggField]);

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

  const handleQuickFilterAdd = (field: string, value: string) => {
    setFilters((prev) => [
      ...prev,
      {
        id: `filter-${Date.now()}`,
        field,
        operator: "equals",
        value,
      },
    ]);
  };

  useEffect(() => {
    if (!currentCaseId || !token) {
      setResults([]);
      setTotal(0);
      setAggBuckets([]);
      setFieldSamples([]);
      setSelectedEvent(null);
      return;
    }
    setPage(0);
    setSelectedEvent(null);
    setAggBuckets([]);
    setFieldSamples([]);
    setRefreshToken((t) => t + 1);
  }, [currentCaseId, token]);

  useEffect(() => {
    if (!currentCaseId || !token) {
      return;
    }
    setPage(0);
    setRefreshToken((t) => t + 1);
  }, [pageSize, filterPayload, timeRangeKey, currentCaseId, token]);

  useEffect(() => {
    if (!currentCaseId || !token) {
      setResults([]);
      setTotal(0);
      setFieldSamples([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const runSearch = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/search/query", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
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

        const sampleCollector = new Map<string, string>();
        mapped.forEach((hit) => collectFieldSamplesFromDoc(hit.doc, sampleCollector));
        setFieldSamples(
          Array.from(sampleCollector.entries()).map(([field, value]) => ({
            field,
            value,
          }))
        );

        setResults(mapped);
        setTotal(data.total || 0);
      } catch (err: any) {
        if (err.name === "AbortError") return;
        console.error("explorer search failed", err);
        setError("Search failed. Check case index or query.");
        setResults([]);
        setTotal(0);
        setFieldSamples([]);
      } finally {
        setLoading(false);
      }
    };

    runSearch();

    return () => controller.abort();
  }, [currentCaseId, submittedQuery, page, pageSize, refreshToken, filterPayload, timeRangeKey, authHeaders, token]);

  useEffect(() => {
    if (!currentCaseId || !token) {
      setAggBuckets([]);
      setAggLoading(false);
      return;
    }

    const controller = new AbortController();
    const runAgg = async () => {
      setAggLoading(true);
      try {
        const res = await fetch("/api/search/aggregate", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
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
  }, [currentCaseId, submittedQuery, aggField, aggSize, filterPayload, timeRangeKey, authHeaders, token]);

  const pageInfo = useMemo(() => {
    if (!total) return "0 results";
    const start = from + 1;
    const end = Math.min(from + pageSize, total);
    return `${start}-${end} / ${total}`;
  }, [from, pageSize, total]);

  const handleBucketClick = (bucket: AggregationBucket) => {
    handleQuickFilterAdd(aggField, bucket.key);
  };

  const renderEventDetail = () => {
    if (!selectedEvent) return null;

    const formatValue = (value: any): string => {
      if (value === null || value === undefined) return "null";
      if (typeof value === "object") return JSON.stringify(value, null, 2);
      return String(value);
    };

    const flattenObject = (obj: Record<string, any>, prefix = ""): Array<{ key: string; value: any }> => {
      const result: Array<{ key: string; value: any }> = [];
      Object.entries(obj).forEach(([key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === "object" && !Array.isArray(value)) {
          result.push(...flattenObject(value, path));
        } else {
          result.push({ key: path, value });
        }
      });
      return result;
    };

    const fields = flattenObject(selectedEvent.doc);

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedEvent(null)}>
        <div
          className={`max-w-4xl w-full max-h-[80vh] rounded-lg border shadow-2xl ${cardBg} flex flex-col`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`flex items-center justify-between border-b px-6 py-4 ${darkMode ? "border-slate-700" : "border-gray-200"}`}>
            <div>
              <h3 className={`text-lg font-semibold ${textStrong}`}>Event Details</h3>
              <p className={`text-sm ${textWeak}`}>{selectedEvent.timestamp || "No timestamp"}</p>
            </div>
            <button
              onClick={() => setSelectedEvent(null)}
              className={`rounded-lg p-2 transition hover:bg-slate-800 ${textWeak}`}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-6">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className={`text-xs font-semibold ${textWeak}`}>Parser</span>
                  <p className={`text-sm ${textStrong}`}>{selectedEvent.parser || "-"}</p>
                </div>
                <div>
                  <span className={`text-xs font-semibold ${textWeak}`}>Score</span>
                  <p className={`text-sm ${textStrong}`}>{selectedEvent.score ?? "-"}</p>
                </div>
              </div>
              <div>
                <span className={`text-xs font-semibold ${textWeak}`}>Message</span>
                <p className={`text-sm ${textStrong} break-words`}>{selectedEvent.message}</p>
              </div>
              <div>
                <h4 className={`text-sm font-semibold mb-2 ${textStrong}`}>All Fields</h4>
                <div className="space-y-2">
                  {fields.map(({ key, value }) => (
                    <div
                      key={key}
                      className={`rounded-lg border p-3 ${darkMode ? "border-slate-800 bg-slate-900/50" : "border-gray-200 bg-gray-50"}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <span className={`text-xs font-mono font-semibold ${textWeak}`}>{key}</span>
                          <pre className={`text-xs font-mono mt-1 whitespace-pre-wrap break-all ${textStrong}`}>
                            {formatValue(value)}
                          </pre>
                        </div>
                        <Button
                          onClick={() => {
                            handleQuickFilterAdd(key, String(value));
                            setSelectedEvent(null);
                          }}
                          className={`flex-shrink-0 ${
                            darkMode ? "border-slate-700 bg-slate-800 text-slate-200" : "border-gray-300 bg-white text-gray-800"
                          }`}
                        >
                          Filter
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full gap-4 overflow-hidden">
      <div className="w-72 flex-shrink-0 space-y-4 overflow-auto">
        <Card className={cardBg}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFieldExplorerOpen((open) => !open)}
                  className={`text-sm font-semibold ${textStrong}`}
                >
                  Field explorer
                </button>
                <Badge className="text-[10px]">{fieldSamples.length}</Badge>
              </div>
              {fieldExplorerOpen && (
                <Input
                  value={fieldSearch}
                  onChange={(e) => setFieldSearch(e.target.value)}
                  placeholder="Search fields"
                  className={`text-xs ${darkMode ? "border-slate-700 bg-slate-900 text-slate-50" : ""}`}
                />
              )}
            </div>
            {fieldExplorerOpen ? (
              filteredFieldSamples.length === 0 ? (
                <p className={`text-sm ${textWeak}`}>No fields detected.</p>
              ) : (
                <div className="max-h-[calc(100vh-220px)] overflow-auto divide-y divide-slate-800/40 text-sm">
                  {filteredFieldSamples.map((sample) => (
                    <div key={sample.field} className="flex items-center gap-2 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate">{sample.field}</div>
                        <div className={`text-xs truncate ${textWeak}`}>{sample.value}</div>
                      </div>
                      <Button
                        onClick={() => handleQuickFilterAdd(sample.field, sample.value)}
                        className={`transition active:scale-95 ${
                          darkMode ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
                        }`}
                      >
                        Filter
                      </Button>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <p className={`text-xs italic ${textWeak}`}>Collapsed</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-hidden min-h-0">
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
                  className={`transition active:scale-95 ${
                    darkMode
                      ? "border-violet-600/30 bg-violet-950/40 text-violet-200 hover:bg-violet-900/50"
                      : "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
                  }`}
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
                  className={`transition active:scale-95 ${
                    darkMode ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
                  }`}
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
                className={`transition active:scale-95 ${
                  darkMode ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
                }`}
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
                    className={`transition active:scale-95 ${
                      darkMode ? "border-rose-600/30 bg-rose-900/20 text-rose-200 hover:bg-rose-900/40" : "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    }`}
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

      <Card className={`flex-1 ${cardBg} overflow-hidden`}>
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
                className={`${darkMode ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"} disabled:opacity-40 disabled:cursor-not-allowed transition`}
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </Button>
              <Button
                disabled={!canNext || loading}
                onClick={() => setPage((p) => p + 1)}
                className={`${darkMode ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"} disabled:opacity-40 disabled:cursor-not-allowed transition`}
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
                <thead className={`sticky top-0 ${darkMode ? "bg-slate-900 text-slate-400" : "bg-gray-50 text-gray-500"}`}>
                  <tr>
                    <th className="px-4 py-2 w-40">Timestamp</th>
                    <th className="px-4 py-2 w-32">Parser</th>
                    <th className="px-4 py-2">Message</th>
                    <th className="px-4 py-2 w-24">Score</th>
                  </tr>
                </thead>
                <tbody className={darkMode ? "divide-y divide-slate-800 text-slate-100" : "divide-y divide-gray-100 text-gray-900"}>
                  {results.map((hit) => (
                    <tr
                      key={hit.id}
                      onClick={() => setSelectedEvent(hit)}
                      className={`cursor-pointer transition ${
                        darkMode ? "hover:bg-slate-800/50" : "hover:bg-gray-100"
                      }`}
                    >
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

      <div className="flex-1 min-h-0 w-full">
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
                {aggregationFieldOptions.map((field) => (
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
              <Button
                onClick={() => setAggCollapsed((prev) => !prev)}
                className={`text-xs px-2 py-1 ${
                  darkMode ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
                }`}
              >
                {aggCollapsed ? "Expand" : "Reduce"}
              </Button>
            </div>
            {aggCollapsed ? (
              <p className={`text-xs italic ${textWeak}`}>Aggregation panel reduced. Click Expand to view buckets.</p>
            ) : (
              <div className="max-h-64 overflow-auto">
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
                        className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-left transition active:scale-95 ${
                          darkMode ? "border-slate-800 hover:bg-slate-800 hover:border-violet-600/30" : "border-gray-200 hover:bg-gray-50 hover:border-violet-300"
                        }`}
                      >
                        <span className="text-sm truncate">{bucket.key || "<empty>"}</span>
                        <span className="text-xs font-semibold">{bucket.count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
      {renderEventDetail()}
    </div>
  );
}
