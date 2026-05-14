"use client";

import type { ReactNode } from "react";
import { OrbitingCircles } from "@/components/magic/orbiting-circles";
import { cn } from "@/lib/utils";

interface OrbitItem {
  icon: ReactNode;
  /** Radius in pixels. Default 80 */
  radius?: number;
  /** Animation duration sec. Default 20 */
  duration?: number;
  /** Reverse direction */
  reverse?: boolean;
  /** Delay sec */
  delay?: number;
}

interface Props {
  /** Center element (logo/icon) */
  centerElement?: ReactNode;
  /** Items orbiting around */
  items: OrbitItem[];
  className?: string;
}

// Decorative orbiting icons around a center element.
// Use cho hero section "ecosystem" visualization.
export function OrbitIcons({ centerElement, items, className }: Props) {
  return (
    <div className={cn("relative flex h-[400px] w-full items-center justify-center", className)}>
      {centerElement && (
        <div className="z-10 rounded-full bg-white p-3 shadow-lg">{centerElement}</div>
      )}
      {items.map((item, i) => (
        <OrbitingCircles
          key={i}
          radius={item.radius ?? 80 + i * 40}
          duration={item.duration ?? 20}
          reverse={item.reverse}
          delay={item.delay ?? i * 2}
        >
          {item.icon}
        </OrbitingCircles>
      ))}
    </div>
  );
}
