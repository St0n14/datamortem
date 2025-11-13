import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Search, ChevronLeft, ChevronRight, RefreshCw, Filter, Plus, Trash2, X, Settings2, Check, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { searchAPI, evidenceAPI } from "../services/api";
import type { Evidence } from "../types";

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
  const [evidences, setEvidences] = useState<Evidence[]>([]);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const [loadingEvidences, setLoadingEvidences] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(["@timestamp", "source.parser", "message", "_score"]);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const textWeak = darkMode ? "text-slate-400" : "text-gray-500";
  const textStrong = darkMode ? "text-slate-100" : "text-gray-900";
  const cardBg = darkMode ? "border-slate-700 bg-slate-900" : "border-gray-200 bg-slate-50";

  const from = page * pageSize;
  const canPrev = page > 0;
  const canNext = from + pageSize < total;

  const filterPayload = useMemo(() => {
    const baseFilters = filters
      .filter((row) => row.field && (row.operator === "exists" || row.operator === "missing" || row.value.trim().length > 0))
      .map((row) => ({
        field: row.field,
        operator: row.operator,
        value: row.operator === "exists" || row.operator === "missing" ? null : row.value,
      }));

    // Ajouter le filtre evidence.uid si un evidence est sélectionné
    if (selectedEvidenceId) {
      baseFilters.push({
        field: "evidence.uid",
        operator: "equals",
        value: selectedEvidenceId,
      });
    }

    return baseFilters;
  }, [filters, selectedEvidenceId]);

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

  // Colonnes par défaut avec labels
  const defaultColumns = useMemo(() => {
    return [
      { field: "@timestamp", label: "Timestamp" },
      { field: "source.parser", label: "Parser" },
      { field: "message", label: "Message" },
      { field: "_score", label: "Score" },
    ];
  }, []);

  // Toutes les colonnes disponibles (défaut + champs trouvés)
  const availableColumns = useMemo(() => {
    const columnMap = new Map<string, string>();
    
    // Ajouter les colonnes par défaut
    defaultColumns.forEach((col) => {
      columnMap.set(col.field, col.label);
    });

    // Ajouter tous les champs trouvés
    fieldSamples.forEach((sample) => {
      if (!columnMap.has(sample.field)) {
        columnMap.set(sample.field, sample.field);
      }
    });

    return Array.from(columnMap.entries()).map(([field, label]) => ({ field, label }));
  }, [defaultColumns, fieldSamples]);

  // S'assurer que visibleColumns ne soit jamais vide et ne contienne que des colonnes disponibles
  useEffect(() => {
    if (visibleColumns.length === 0) {
      // Si toutes les colonnes ont été supprimées, restaurer les colonnes par défaut
      setVisibleColumns(defaultColumns.map((col) => col.field));
      return;
    }

    // Filtrer les colonnes visibles pour ne garder que celles qui sont disponibles
    // (les colonnes par défaut sont toujours disponibles)
    const availableFieldSet = new Set(availableColumns.map((col) => col.field));
    const defaultFieldSet = new Set(defaultColumns.map((col) => col.field));
    
    const validColumns = visibleColumns.filter(
      (field) => availableFieldSet.has(field) || defaultFieldSet.has(field)
    );

    // Si après filtrage il ne reste aucune colonne valide, restaurer les colonnes par défaut
    if (validColumns.length === 0) {
      setVisibleColumns(defaultColumns.map((col) => col.field));
    } else if (validColumns.length !== visibleColumns.length) {
      // Si certaines colonnes ont été filtrées, mettre à jour la liste
      setVisibleColumns(validColumns);
    }
  }, [visibleColumns, availableColumns, defaultColumns]);

  // Obtenir la valeur d'un champ dans un document (avec support pour les chemins imbriqués)
  const getFieldValue = (doc: Record<string, any>, field: string): any => {
    if (field === "_score") {
      return null; // Le score n'est pas dans le doc, on le gère séparément
    }
    
    // Gérer les chemins imbriqués comme "source.parser"
    const parts = field.split(".");
    let value: any = doc;
    for (const part of parts) {
      if (value === null || value === undefined) {
        return null;
      }
      value = value[part];
    }
    return value;
  };

  // Formater une valeur pour l'affichage dans le tableau
  const formatCellValue = (value: any): string => {
    if (value === null || value === undefined) {
      return "-";
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value);
  };
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

  // Charger les evidences quand le case change
  useEffect(() => {
    if (!currentCaseId || !token) {
      setEvidences([]);
      setSelectedEvidenceId(null);
      return;
    }
    const loadEvidences = async () => {
      setLoadingEvidences(true);
      try {
        const data = await evidenceAPI.list(currentCaseId);
        setEvidences(data);
        // Réinitialiser la sélection d'evidence quand le case change
        setSelectedEvidenceId(null);
      } catch (err) {
        console.error("Failed to load evidences:", err);
        setEvidences([]);
      } finally {
        setLoadingEvidences(false);
      }
    };
    loadEvidences();
  }, [currentCaseId, token]);

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
  }, [pageSize, filterPayload, timeRangeKey, currentCaseId, token, selectedEvidenceId]);

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
        const data = await searchAPI.query({
          query: submittedQuery,
          case_id: currentCaseId,
          size: pageSize,
          from_: page * pageSize,
          sort_by: "@timestamp",
          sort_order: "desc",
          field_filters: filterPayload,
          time_range: timeRangePayload,
        });
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
        const data = await searchAPI.aggregate({
          case_id: currentCaseId,
          field: aggField,
          size: aggSize,
          query: submittedQuery,
          field_filters: filterPayload.length > 0 ? filterPayload : undefined,
          time_range: timeRangePayload,
        });
        setAggBuckets(data.aggregations?.buckets || data.buckets || []);
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

  const toggleColumn = (field: string) => {
    setVisibleColumns((prev) => {
      if (prev.includes(field)) {
        // Au moins une colonne doit rester visible - ne pas supprimer si c'est la dernière
        if (prev.length === 1) {
          return prev;
        }
        const newColumns = prev.filter((f) => f !== field);
        // S'assurer qu'on ne supprime jamais toutes les colonnes
        return newColumns.length > 0 ? newColumns : prev;
      } else {
        return [...prev, field];
      }
    });
  };

  const handleDragStart = (field: string) => {
    setDraggedColumn(field);
  };

  const handleDragOver = (e: React.DragEvent, field: string) => {
    e.preventDefault();
    if (draggedColumn && draggedColumn !== field) {
      setDragOverColumn(field);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Ne pas réinitialiser si on entre dans un enfant
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return;
    }
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, targetField: string) => {
    e.preventDefault();
    if (!draggedColumn || draggedColumn === targetField) {
      setDraggedColumn(null);
      setDragOverColumn(null);
      return;
    }

    setVisibleColumns((prev) => {
      const newColumns = [...prev];
      const draggedIndex = newColumns.indexOf(draggedColumn);
      const targetIndex = newColumns.indexOf(targetField);

      if (draggedIndex === -1 || targetIndex === -1) {
        return prev;
      }

      // Réorganiser les colonnes
      newColumns.splice(draggedIndex, 1);
      newColumns.splice(targetIndex, 0, draggedColumn);

      return newColumns;
    });

    setDraggedColumn(null);
    setDragOverColumn(null);
  };

  const handleDragEnd = () => {
    setDraggedColumn(null);
    setDragOverColumn(null);
  };

  const getColumnLabel = (field: string): string => {
    const defaultCol = defaultColumns.find((col) => col.field === field);
    return defaultCol?.label || field;
  };

  const renderColumnSettings = () => {
    if (!showColumnSettings) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowColumnSettings(false)}>
        <div
          className={`max-w-2xl w-full max-h-[80vh] rounded-lg border shadow-2xl ${cardBg} flex flex-col`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`flex items-center justify-between border-b px-6 py-4 ${darkMode ? "border-slate-700" : "border-gray-200"}`}>
            <div>
              <h3 className={`text-lg font-semibold ${textStrong}`}>Configurer les colonnes</h3>
              <p className={`text-sm ${textWeak}`}>Sélectionnez les colonnes à afficher dans le tableau</p>
            </div>
            <button
              onClick={() => setShowColumnSettings(false)}
              className={`rounded-lg p-2 transition hover:bg-slate-800 ${textWeak}`}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-6">
            <div className="space-y-2">
              <div className={`text-xs font-semibold ${textWeak} mb-2 px-2`}>
                Colonnes visibles (faites glisser pour réorganiser)
              </div>
              {visibleColumns
                .map((field) => availableColumns.find((col) => col.field === field))
                .filter((col) => col !== undefined)
                .map((column) => {
                  const isVisible = true;
                  const isDragging = draggedColumn === column.field;
                  const isDragOver = dragOverColumn === column.field;
                  return (
                    <div
                      key={column!.field}
                      draggable={isVisible}
                      onDragStart={(e) => {
                        handleDragStart(column!.field);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        handleDragOver(e, column!.field);
                        e.dataTransfer.dropEffect = "move";
                      }}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, column!.field)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center justify-between rounded-lg border p-3 cursor-move transition ${
                        isDragging
                          ? "opacity-50"
                          : isDragOver
                            ? darkMode
                              ? "border-l-4 border-violet-500 bg-violet-950/30"
                              : "border-l-4 border-violet-400 bg-violet-100"
                            : darkMode
                              ? "border-slate-800 bg-slate-900/50 hover:bg-slate-800"
                              : "border-gray-200 bg-gray-50 hover:bg-gray-100"
                      }`}
                      onClick={(e) => {
                        // Ne pas toggle si on clique sur la zone de drag
                        if ((e.target as HTMLElement).closest('.drag-handle')) {
                          return;
                        }
                        toggleColumn(column!.field);
                      }}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className="drag-handle cursor-move">
                          <div className={`w-6 h-6 rounded flex items-center justify-center transition ${
                            darkMode ? "hover:bg-slate-700" : "hover:bg-gray-200"
                          }`}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={textWeak}>
                              <circle cx="2" cy="2" r="1" fill="currentColor" />
                              <circle cx="6" cy="2" r="1" fill="currentColor" />
                              <circle cx="10" cy="2" r="1" fill="currentColor" />
                              <circle cx="2" cy="6" r="1" fill="currentColor" />
                              <circle cx="6" cy="6" r="1" fill="currentColor" />
                              <circle cx="10" cy="6" r="1" fill="currentColor" />
                              <circle cx="2" cy="10" r="1" fill="currentColor" />
                              <circle cx="6" cy="10" r="1" fill="currentColor" />
                              <circle cx="10" cy="10" r="1" fill="currentColor" />
                            </svg>
                          </div>
                        </div>
                        <div
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition ${
                            isVisible
                              ? darkMode
                                ? "bg-violet-600 border-violet-600"
                                : "bg-violet-500 border-violet-500"
                              : darkMode
                                ? "border-slate-600"
                                : "border-gray-300"
                          }`}
                        >
                          {isVisible && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <div>
                          <div className={`text-sm font-medium ${textStrong}`}>{column!.label}</div>
                          <div className={`text-xs ${textWeak} font-mono`}>{column!.field}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              {visibleColumns.length === 0 && (
                <div className="text-center py-4">
                  <p className={`text-sm ${textWeak}`}>Aucune colonne visible</p>
                </div>
              )}
              <div className={`text-xs font-semibold ${textWeak} mb-2 mt-4 px-2`}>
                Colonnes disponibles
              </div>
              {availableColumns
                .filter((col) => !visibleColumns.includes(col.field))
                .map((column) => {
                  return (
                    <div
                      key={column.field}
                      className={`flex items-center justify-between rounded-lg border p-3 cursor-pointer transition ${
                        darkMode ? "border-slate-800 bg-slate-900/30 hover:bg-slate-800/50" : "border-gray-200 bg-gray-50/50 hover:bg-gray-100"
                      }`}
                      onClick={() => toggleColumn(column.field)}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition ${
                            darkMode ? "border-slate-600" : "border-gray-300"
                          }`}
                        >
                        </div>
                        <div>
                          <div className={`text-sm font-medium ${textStrong}`}>{column.label}</div>
                          <div className={`text-xs ${textWeak} font-mono`}>{column.field}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
            {availableColumns.length === 0 && (
              <div className="text-center py-8">
                <p className={`text-sm ${textWeak}`}>Aucun champ disponible. Effectuez une recherche pour voir les champs disponibles.</p>
              </div>
            )}
          </div>
          <div className={`flex items-center justify-end gap-3 border-t px-6 py-4 ${darkMode ? "border-slate-700" : "border-gray-200"}`}>
            <Button
              onClick={() => {
                // Réinitialiser aux colonnes par défaut
                setVisibleColumns(defaultColumns.map((col) => col.field));
              }}
              className={`transition active:scale-95 ${
                darkMode ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-gray-300 bg-slate-50 text-slate-800 hover:bg-slate-100"
              }`}
            >
              Réinitialiser
            </Button>
            <Button
              onClick={() => setShowColumnSettings(false)}
              className={`transition active:scale-95 ${
                darkMode ? "border-violet-600/30 bg-violet-950/40 text-violet-200 hover:bg-violet-900/50" : "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
              }`}
            >
              Fermer
            </Button>
          </div>
        </div>
      </div>
    );
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
                            darkMode ? "border-slate-700 bg-slate-800 text-slate-200" : "border-gray-300 bg-slate-50 text-slate-800"
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

  // Calculer si la sidebar doit être réduite (les deux sections sont collapsées)
  const sidebarFullyCollapsed = !fieldExplorerOpen && aggCollapsed;

  return (
    <div className="flex h-full gap-4 overflow-hidden">
      <div
        className={`flex-shrink-0 space-y-4 overflow-auto transition-all duration-300 ${
          sidebarFullyCollapsed ? 'w-16' : 'w-72'
        }`}
        style={{ scrollbarWidth: 'thin' }}
      >
        {!sidebarFullyCollapsed && (
          <Card className={cardBg}>
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-col gap-2">
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
                    className={`w-full text-xs ${darkMode ? "border-slate-700 bg-slate-900 text-slate-50" : ""}`}
                  />
                )}
              </div>
              {fieldExplorerOpen ? (
                filteredFieldSamples.length === 0 ? (
                  <p className={`text-sm ${textWeak}`}>No fields detected.</p>
                ) : (
                  <div className="max-h-[calc(100vh-220px)] overflow-auto divide-y divide-slate-800/40 text-sm" style={{ scrollbarWidth: 'thin' }}>
                    {filteredFieldSamples.map((sample) => (
                      <div key={sample.field} className="flex items-center gap-2 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold truncate">{sample.field}</div>
                          <div className={`text-xs truncate ${textWeak}`}>{sample.value}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!visibleColumns.includes(sample.field) && (
                            <Button
                              onClick={() => toggleColumn(sample.field)}
                              className={`transition active:scale-95 text-xs ${
                                darkMode ? "border-violet-600/30 bg-violet-950/40 text-violet-200 hover:bg-violet-900/50" : "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
                              }`}
                              title="Ajouter comme colonne"
                            >
                              + Colonne
                            </Button>
                          )}
                          <Button
                            onClick={() => handleQuickFilterAdd(sample.field, sample.value)}
                            className={`transition active:scale-95 ${
                              darkMode ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-gray-300 bg-slate-50 text-slate-800 hover:bg-slate-100"
                            }`}
                          >
                            Filter
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <p className={`text-xs italic ${textWeak}`}>Collapsed</p>
              )}
            </CardContent>
          </Card>
        )}

        {!sidebarFullyCollapsed && (
          <Card className={cardBg}>
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAggCollapsed((prev) => !prev)}
                    className={`text-sm font-semibold ${textStrong}`}
                  >
                    Aggregations
                  </button>
                  <Badge className="text-[10px]">{aggBuckets.length}</Badge>
                </div>
                {aggCollapsed ? (
                  <p className={`text-xs italic ${textWeak}`}>Collapsed</p>
                ) : (
                  <>
                    <div className="flex flex-col gap-2">
                      <select
                        value={aggField}
                        onChange={(e) => setAggField(e.target.value)}
                        className={`w-full h-8 rounded-lg border px-2 text-sm ${
                          darkMode ? "border-slate-700 bg-slate-900 text-slate-50" : "border-gray-300 bg-slate-50 text-gray-900"
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
                        className={`w-full h-8 rounded-lg border px-2 text-sm ${
                          darkMode ? "border-slate-700 bg-slate-900 text-slate-50" : "border-gray-300 bg-slate-50 text-gray-900"
                        }`}
                      >
                        {[5, 10, 20, 50].map((size) => (
                          <option key={size} value={size}>
                            Top {size}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="max-h-64 overflow-auto" style={{ scrollbarWidth: 'thin' }}>
                      {aggLoading ? (
                        <p className={`text-sm ${textWeak}`}>Loading aggregations…</p>
                      ) : aggBuckets.length === 0 ? (
                        <p className={`text-sm ${textWeak}`}>No buckets.</p>
                      ) : (
                        <div className="space-y-1">
                          {aggBuckets.map((bucket) => (
                            <button
                              key={bucket.key}
                              onClick={() => handleBucketClick(bucket)}
                              className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition active:scale-95 ${
                                darkMode ? "border-slate-800 hover:bg-slate-800 hover:border-violet-600/30" : "border-gray-200 hover:bg-slate-100 hover:border-violet-300"
                              }`}
                            >
                              <span className="truncate">{bucket.key || "<empty>"}</span>
                              <span className="text-xs font-semibold ml-2">{bucket.count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Boutons compacts quand la sidebar est réduite */}
        {sidebarFullyCollapsed && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setFieldExplorerOpen(true)}
              className={`w-full h-10 rounded-lg border flex items-center justify-center transition ${
                darkMode
                  ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                  : "border-gray-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
              }`}
              title="Expand Field Explorer"
            >
              <Filter className="h-4 w-4" />
            </button>
            <button
              onClick={() => setAggCollapsed(false)}
              className={`w-full h-10 rounded-lg border flex items-center justify-center transition ${
                darkMode
                  ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                  : "border-gray-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
              }`}
              title="Expand Aggregations"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-hidden min-h-0">
        <Card className={cardBg}>
          <CardContent className="p-4 space-y-3">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <label className={`text-xs font-semibold ${textStrong} whitespace-nowrap`}>Query</label>
              <div className="flex flex-1 items-center gap-2">
                <Input
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  placeholder="ex: process.name:svchost.exe AND event.type:file"
                  className={`h-8 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-slate-50" : ""}`}
                />
                <Button
                  onClick={triggerSearch}
                  className={`h-8 px-3 whitespace-nowrap transition active:scale-95 ${
                    darkMode
                      ? "border-violet-600/30 bg-violet-950/40 text-violet-200 hover:bg-violet-900/50"
                      : "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
                  }`}
                >
                  <Search className="h-4 w-4 mr-1" />
                  Search
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <label className={`text-xs ${textWeak} whitespace-nowrap`}>Evidence</label>
                <select
                  value={selectedEvidenceId || ""}
                  onChange={(e) => setSelectedEvidenceId(e.target.value || null)}
                  className={`h-8 rounded-lg border px-2 text-sm min-w-[200px] ${
                    darkMode ? "border-slate-700 bg-slate-900 text-slate-100" : "border-gray-300 bg-slate-50 text-gray-900"
                  }`}
                  disabled={loadingEvidences}
                >
                  <option value="">Tous les evidences</option>
                  {evidences.map((evidence) => (
                    <option key={evidence.evidence_uid} value={evidence.evidence_uid}>
                      {evidence.evidence_uid}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className={`text-xs ${textWeak} whitespace-nowrap`}>Page size</label>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
                  className={`h-8 rounded-lg border px-2 text-sm ${
                    darkMode ? "border-slate-700 bg-slate-900 text-slate-100" : "border-gray-300 bg-slate-50 text-gray-900"
                  }`}
                >
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className={`text-xs ${textWeak} whitespace-nowrap`}>Time range</label>
                <Input
                  value={timeRange.gte}
                  onChange={(e) => setTimeRange((prev) => ({ ...prev, gte: e.target.value }))}
                  placeholder="gte (ex: 2024-11-01T00:00:00Z)"
                  className={`h-8 w-48 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-slate-50" : ""}`}
                />
                <Input
                  value={timeRange.lte}
                  onChange={(e) => setTimeRange((prev) => ({ ...prev, lte: e.target.value }))}
                  placeholder="lte"
                  className={`h-8 w-32 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-slate-50" : ""}`}
                />
              </div>
              <Button
                onClick={() => setRefreshToken((t) => t + 1)}
                className={`h-8 w-8 p-0 transition active:scale-95 ${
                  darkMode ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-gray-300 bg-slate-50 text-slate-800 hover:bg-slate-100"
                }`}
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-violet-400" />
              <span className={`text-sm font-semibold ${textStrong}`}>Filters</span>
              <Button
                onClick={addFilterRow}
                className={`transition active:scale-95 ${
                  darkMode ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-gray-300 bg-slate-50 text-slate-800 hover:bg-slate-100"
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
                      darkMode ? "border-slate-700 bg-slate-900 text-slate-50" : "border-gray-300 bg-slate-50 text-gray-900"
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
                      darkMode ? "border-slate-700 bg-slate-900 text-slate-50" : "border-gray-300 bg-slate-50 text-gray-900"
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
              {selectedEvidenceId && (
                <Badge
                  className={`text-[10px] border ${
                    darkMode ? "bg-violet-900/30 text-violet-200 border-violet-700" : "bg-violet-50 text-violet-700 border-violet-300"
                  }`}
                >
                  Evidence: {selectedEvidenceId}
                </Badge>
              )}
              <Badge
                className={`text-[10px] border ${
                  darkMode ? "bg-slate-900 text-slate-200 border-slate-700" : "bg-gray-50 text-slate-700 border-gray-200"
                }`}
              >
                {pageInfo}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Button
                onClick={() => toggleColumn("message")}
                className={`transition active:scale-95 ${
                  visibleColumns.includes("message")
                    ? darkMode
                      ? "border-violet-600/30 bg-violet-950/40 text-violet-200 hover:bg-violet-900/50"
                      : "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
                    : darkMode
                      ? "border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                      : "border-gray-300 bg-slate-50 text-gray-400 hover:bg-slate-100 hover:text-gray-700"
                }`}
                title={visibleColumns.includes("message") ? "Masquer la colonne Message" : "Afficher la colonne Message"}
              >
                {visibleColumns.includes("message") ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
              <Button
                onClick={() => setShowColumnSettings(true)}
                className={`transition active:scale-95 ${
                  darkMode ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-gray-300 bg-slate-50 text-slate-800 hover:bg-slate-100"
                }`}
                title="Configurer les colonnes"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
              <Button
                disabled={!canPrev || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className={`${darkMode ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-gray-300 bg-slate-50 text-slate-800 hover:bg-slate-100"} disabled:opacity-40 disabled:cursor-not-allowed transition`}
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </Button>
              <Button
                disabled={!canNext || loading}
                onClick={() => setPage((p) => p + 1)}
                className={`${darkMode ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-gray-300 bg-slate-50 text-slate-800 hover:bg-slate-100"} disabled:opacity-40 disabled:cursor-not-allowed transition`}
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
            ) : visibleColumns.length === 0 ? (
              <div className="p-8 text-center text-sm">
                <p className={textWeak}>No columns selected. Please add columns in the column settings.</p>
              </div>
            ) : (
              <table className="min-w-full text-left text-sm">
                <thead className={`sticky top-0 ${darkMode ? "bg-slate-900 text-slate-400" : "bg-gray-50 text-gray-500"}`}>
                  <tr>
                    {visibleColumns.map((field) => {
                      const isDragging = draggedColumn === field;
                      const isDragOver = dragOverColumn === field;
                      return (
                        <th
                          key={field}
                          draggable
                          onDragStart={(e) => {
                            handleDragStart(field);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            handleDragOver(e, field);
                            e.dataTransfer.dropEffect = "move";
                          }}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, field)}
                          onDragEnd={handleDragEnd}
                          className={`px-4 py-2 cursor-move select-none transition relative ${
                            isDragging
                              ? "opacity-50"
                              : isDragOver
                                ? darkMode
                                  ? "border-l-4 border-violet-500 bg-violet-950/30"
                                  : "border-l-4 border-violet-400 bg-violet-100"
                                : darkMode
                                  ? "hover:bg-slate-800"
                                  : "hover:bg-gray-100"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <svg width="8" height="12" viewBox="0 0 8 12" fill="none" className={`${textWeak} opacity-50 flex-shrink-0`}>
                              <circle cx="2" cy="2" r="0.8" fill="currentColor" />
                              <circle cx="6" cy="2" r="0.8" fill="currentColor" />
                              <circle cx="2" cy="6" r="0.8" fill="currentColor" />
                              <circle cx="6" cy="6" r="0.8" fill="currentColor" />
                              <circle cx="2" cy="10" r="0.8" fill="currentColor" />
                              <circle cx="6" cy="10" r="0.8" fill="currentColor" />
                            </svg>
                            <span className="select-none">{getColumnLabel(field)}</span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className={darkMode ? "divide-y divide-slate-800 text-slate-100" : "divide-y divide-gray-100 text-gray-900"}>
                  {results.map((hit) => (
                    <tr
                      key={hit.id}
                      onClick={() => setSelectedEvent(hit)}
                      className={`cursor-pointer transition ${
                        darkMode ? "hover:bg-slate-800/50" : "hover:bg-slate-200"
                      }`}
                    >
                      {visibleColumns.map((field) => {
                        let cellValue: any;
                        if (field === "_score") {
                          cellValue = hit.score;
                        } else {
                          cellValue = getFieldValue(hit.doc, field);
                        }
                        return (
                          <td key={field} className="px-4 py-2 text-xs">
                            {formatCellValue(cellValue)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
      {renderColumnSettings()}
      {renderEventDetail()}
    </div>
  );
}
