import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface TimelineBucket {
  timestamp: string;
  count: number;
}

interface TimelineChartProps {
  data: TimelineBucket[];
  darkMode: boolean;
}

const formatLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const gradientId = (darkMode: boolean) => (darkMode ? "timelineGradientDark" : "timelineGradient");

export const TimelineChart = ({ data, darkMode }: TimelineChartProps) => {
  const gradient = gradientId(darkMode);
  const formattedData = data.map((bucket) => ({
    ...bucket,
    label: formatLabel(bucket.timestamp),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={formattedData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={darkMode ? "#a78bfa" : "#7c3aed"} stopOpacity={0.8} />
            <stop offset="95%" stopColor={darkMode ? "#a78bfa" : "#7c3aed"} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#1e293b" : "#e2e8f0"} />
        <XAxis
          dataKey="label"
          tick={{ fill: darkMode ? "#cbd5f5" : "#475569", fontSize: 11 }}
          minTickGap={32}
        />
        <YAxis
          tick={{ fill: darkMode ? "#cbd5f5" : "#475569", fontSize: 11 }}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: darkMode ? "#0f172a" : "#fff",
            borderColor: darkMode ? "#334155" : "#e2e8f0",
            borderRadius: "0.75rem",
            fontSize: "0.85rem",
          }}
          itemStyle={{ color: darkMode ? "#e2e8f0" : "#334155" }}
          labelStyle={{ color: darkMode ? "#94a3b8" : "#475569" }}
          formatter={(value: number) => [`${value} events`, "Count"]}
          labelFormatter={(label) => `${label}`}
        />
        <ReferenceLine y={0} stroke="transparent" />
        <Area
          type="monotone"
          dataKey="count"
          stroke={darkMode ? "#c4b5fd" : "#7c3aed"}
          strokeWidth={2}
          fill={`url(#${gradient})`}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};
