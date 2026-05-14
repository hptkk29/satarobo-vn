import type { ReactNode } from "react";
import { tokens } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";

interface SectionBaseProps {
  children: ReactNode;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  className?: string;
  containerClassName?: string;
  variant?: "default" | "narrow";
}

// Plain white section wrapper với optional centered header.
export function SectionBase({
  children,
  eyebrow,
  title,
  subtitle,
  className,
  containerClassName,
  variant = "default",
}: SectionBaseProps) {
  return (
    <section className={cn("bg-white", tokens.spacing.section, className)}>
      <div
        className={cn(
          variant === "narrow" ? tokens.spacing.containerNarrow : tokens.spacing.container,
          containerClassName,
        )}
      >
        {(eyebrow || title || subtitle) && (
          <div className="text-center mb-12 md:mb-16">
            {eyebrow && <p className={cn(tokens.typography.eyebrow, "mb-3")}>{eyebrow}</p>}
            {title && (
              <h2 className={cn(tokens.typography.display.h2, "mb-4")}>{title}</h2>
            )}
            {subtitle && (
              <p
                className={cn(
                  tokens.typography.body.lg,
                  "text-neutral-600 max-w-2xl mx-auto",
                )}
              >
                {subtitle}
              </p>
            )}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
