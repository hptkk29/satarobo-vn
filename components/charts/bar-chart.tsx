"use client";

import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type ChartDatum = Record<string, string | number | null | undefined>;

interface BarSeries {
  key: string;
  name: string;
  color?: string;
}

interface BarChartProps {
  data: ChartDatum[];
  xKey: string;
  bars: BarSeries[];
  height?: number;
  layout?: "horizontal" | "vertical";
}

export function BarChart({
  data,
  xKey,
  bars,
  height = 300,
  layout = "horizontal",
}: BarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart
        data={data}
        layout={layout}
        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip
          contentStyle={{
            background: "white",
            border: "1px solid #E5E7EB",
            borderRadius: 8,
            fontSize: 13,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 13 }} />
        {bars.map((bar) => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            name={bar.name}
            fill={bar.color || "#F97316"}
            radius={[4, 4, 0, 0]}
            animationDuration={300}
          />
        ))}
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}
