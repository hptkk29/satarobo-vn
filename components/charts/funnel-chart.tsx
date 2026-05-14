"use client";

import {
  FunnelChart as RechartsFunnelChart,
  Funnel,
  LabelList,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface FunnelStep {
  name: string;
  value: number;
  fill?: string;
}

interface FunnelChartProps {
  data: FunnelStep[];
  height?: number;
}

// Funnel cho conversion analysis (vd: NEW → CONTACTED → DEMO → ENROLLED).
export function FunnelChart({ data, height = 400 }: FunnelChartProps) {
  const colors = ["#F97316", "#FB923C", "#FDBA74", "#FED7AA", "#7C3AED"];
  const enrichedData = data.map((d, i) => ({
    ...d,
    fill: d.fill || colors[i % colors.length],
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsFunnelChart>
        <Tooltip
          contentStyle={{
            background: "white",
            border: "1px solid #E5E7EB",
            borderRadius: 8,
            fontSize: 13,
          }}
        />
        <Funnel
          dataKey="value"
          data={enrichedData}
          isAnimationActive
          animationDuration={300}
        >
          <LabelList position="right" fill="#000" stroke="none" dataKey="name" />
        </Funnel>
      </RechartsFunnelChart>
    </ResponsiveContainer>
  );
}
