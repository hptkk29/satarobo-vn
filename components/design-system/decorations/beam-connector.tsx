"use client";

import { useRef, type ReactNode } from "react";
import { AnimatedBeam } from "@/components/magic/animated-beam";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  className?: string;
}

interface Node {
  id: string;
  content: ReactNode;
  /** Tailwind position class, e.g. "left-0 top-1/4" */
  position: string;
}

interface BeamConnectorGroupProps {
  nodes: Node[];
  /** [fromId, toId] pairs */
  connections: Array<[string, string]>;
  className?: string;
}

// Container wrap a region với AnimatedBeam — caller manages refs via render-prop.
// For most cases use <BeamConnectorGroup> below.
export function BeamConnector({ children, className }: Props) {
  return <div className={cn("relative", className)}>{children}</div>;
}

// Helper: nhiều nodes + beam connections giữa các node ID.
export function BeamConnectorGroup({ nodes, connections, className }: BeamConnectorGroupProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Use callback ref pattern qua data-attr — render mỗi node, beam tham chiếu qua document.getElementById would be unstable.
  // Pragmatic approach: useRef map.
  const refsMap = useRef<Record<string, HTMLDivElement | null>>({});

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {nodes.map((node) => (
        <div
          key={node.id}
          ref={(el) => {
            refsMap.current[node.id] = el;
          }}
          className={cn("absolute", node.position)}
        >
          {node.content}
        </div>
      ))}
      {connections.map(([from, to], i) => {
        const fromRef = { current: refsMap.current[from] ?? null };
        const toRef = { current: refsMap.current[to] ?? null };
        return (
          <AnimatedBeam
            key={`${from}-${to}-${i}`}
            containerRef={containerRef}
            fromRef={fromRef}
            toRef={toRef}
            gradientStartColor="#F97316"
            gradientStopColor="#7C3AED"
            duration={4}
            delay={i * 0.5}
          />
        );
      })}
    </div>
  );
}
