"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

// Aceternity-style hover-reveal card grid. Each cell renders a card and a
// shared layout-id'd background that slides between cells on hover. Ready
// for F-UI-2.5's USP grid; not wired into any page yet.

export interface HoverEffectItem {
  title: string;
  description: string;
  link?: string;
  icon?: React.ReactNode;
}

export function HoverEffect({
  items,
  className,
}: {
  items: HoverEffectItem[];
  className?: string;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 py-6 md:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {items.map((item, idx) => {
        const content = (
          <>
            <AnimatePresence>
              {hoveredIndex === idx && (
                <motion.span
                  className="bg-gradient-sata-tech absolute inset-0 block h-full w-full rounded-2xl opacity-30"
                  layoutId="hoverBackground"
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: 0.4,
                    transition: { duration: 0.15 },
                  }}
                  exit={{
                    opacity: 0,
                    transition: { duration: 0.15, delay: 0.2 },
                  }}
                />
              )}
            </AnimatePresence>
            <div className="relative z-20 h-full w-full overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow group-hover:border-orange-300 group-hover:shadow-xl">
              <div className="relative z-50">
                {item.icon && (
                  <div className="mb-3 text-3xl">{item.icon}</div>
                )}
                <h4 className="text-lg font-bold tracking-wide text-zinc-900">
                  {item.title}
                </h4>
                <p className="mt-3 text-sm leading-relaxed tracking-wide text-zinc-600">
                  {item.description}
                </p>
              </div>
            </div>
          </>
        );

        const sharedProps = {
          onMouseEnter: () => setHoveredIndex(idx),
          onMouseLeave: () => setHoveredIndex(null),
          className: "group relative block h-full w-full p-2",
        };

        // Render as <Link> if the item has a target; else a plain <div>
        // so hover effect still works on non-clickable cards.
        if (item.link) {
          return (
            <Link key={`${item.title}-${idx}`} href={item.link} {...sharedProps}>
              {content}
            </Link>
          );
        }
        return (
          <div key={`${item.title}-${idx}`} {...sharedProps}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
