"use client";

import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatVndCompact } from "@/lib/format/money";

// KHÔNG nhận function từ Server Component (RSC cấm) — dùng key chuỗi rồi map ở client.
const Y_FORMATTERS = {
  "vnd-compact": (v: number) => formatVndCompact(v),
} as const;
type YFormat = keyof typeof Y_FORMATTERS;

type ChartDatum = Record<string, string | number | null | undefined>;

interface LineSeries {
  key: string;
  name: string;
  color?: string;
}

interface LineChartProps {
  data: ChartDatum[];
  xKey: string;
  lines: LineSeries[];
  height?: number;
  showLegend?: boolean;
  /** Rút gọn nhãn trục Y (vd tiền: 10000000 → "10tr") để không bị cắt. */
  yFormat?: YFormat;
}

// Wrapper Recharts LineChart cho admin dashboard.
// Animation 300ms (admin tối giản — KHÔNG tăng).
export function LineChart({
  data,
  xKey,
  lines,
  height = 300,
  showLegend = true,
  yFormat,
}: LineChartProps) {
  const yTickFormatter = yFormat ? Y_FORMATTERS[yFormat] : undefined;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
        <YAxis
          tick={{ fontSize: 12 }}
          width={yTickFormatter ? 56 : undefined}
          tickFormatter={
            yTickFormatter ? (v) => yTickFormatter(Number(v)) : undefined
          }
        />
        <Tooltip
          contentStyle={{
            background: "white",
            border: "1px solid #E5E7EB",
            borderRadius: 8,
            fontSize: 13,
          }}
        />
        {showLegend && <Legend wrapperStyle={{ fontSize: 13 }} />}
        {lines.map((line) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            name={line.name}
            stroke={line.color || "#F97316"}
            strokeWidth={2}
            dot={{ r: 3 }}
            animationDuration={300}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}
