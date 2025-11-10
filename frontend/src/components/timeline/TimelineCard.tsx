import { useMemo, useState } from "react";
import { RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "../ui/Card";
import { Button } from "../ui/Button";
import { TimelineChart } from "../TimelineChart";

type TimelineBucket = {
  timestamp: string;
  count: number;
};

interface TimelineCardProps {
  darkMode: boolean;
  timelineBuckets: TimelineBucket[];
  timelineInterval: string;
  timelineLoading: boolean;
  timelineError: string | null;
  onIntervalChange: (interval: string) => void;
  onRefresh: () => void;
}

export function TimelineCard({
  darkMode,
  timelineBuckets,
  timelineInterval,
  timelineLoading,
  timelineError,
  onIntervalChange,
  onRefresh,
}: TimelineCardProps) {
  const [timelineDetailsExpanded, setTimelineDetailsExpanded] = useState(false);

  const timelineTotal = useMemo(
    () => timelineBuckets.reduce((acc, bucket) => acc + bucket.count, 0),
    [timelineBuckets]
  );

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

  return (
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
              onChange={(e) => onIntervalChange(e.target.value)}
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
              onClick={onRefresh}
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
  );
}
