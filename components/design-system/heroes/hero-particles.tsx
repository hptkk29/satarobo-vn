"use client";

import type { ReactNode } from "react";
import { Particles } from "@/components/magic/particles";
import { AnimatedGradientText } from "@/components/magic/animated-gradient-text";
import { FadeIn } from "@/components/motion/fade-in";
import { CircuitPattern } from "@/components/design-system/decorations/circuit-pattern";
import { tokens } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";

interface TrustIndicator {
  icon?: ReactNode;
  text: string;
}

interface HeroParticlesProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  trustIndicators?: TrustIndicator[];
  className?: string;
}

// Hero LIGHT background + particles cam + animated gradient eyebrow.
// Premium & Trusted: white dominant, cam-tím là gia vị.
export function HeroParticles({
  eyebrow,
  title,
  subtitle,
  children,
  trustIndicators,
  className,
}: HeroParticlesProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden",
        tokens.bg.heroLight,
        tokens.spacing.section,
        className,
      )}
    >
      {/* Particles cam (visible trên light bg) — quantity nhỏ để subtle */}
      <Particles
        className="absolute inset-0"
        quantity={30}
        ease={80}
        color="#F97316"
        size={0.4}
        refresh
      />

      {/* Circuit decoration ở 2 góc — opacity 30% */}
      <CircuitPattern className="absolute top-0 right-0 w-1/3 h-1/2 text-orange-200 opacity-30" />
      <CircuitPattern className="absolute bottom-0 left-0 w-1/3 h-1/2 text-purple-200 opacity-30 rotate-180" />

      <div className={cn(tokens.spacing.containerNarrow, "relative z-10 text-center")}>
        <FadeIn>
          {eyebrow && (
            <div className="mb-6 inline-block">
              <AnimatedGradientText colorFrom="#F97316" colorTo="#7C3AED" speed={1.2}>
                <span className={tokens.typography.eyebrow}>{eyebrow}</span>
              </AnimatedGradientText>
            </div>
          )}

          <h1
            className={cn(
              tokens.typography.display.h1,
              "mb-6 max-w-4xl mx-auto leading-tight",
            )}
          >
            {title}
          </h1>

          {subtitle && (
            <p
              className={cn(
                tokens.typography.body.lg,
                "text-neutral-600 max-w-2xl mx-auto mb-8",
              )}
            >
              {subtitle}
            </p>
          )}

          {children && (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
              {children}
            </div>
          )}

          {trustIndicators && trustIndicators.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-8">
              {trustIndicators.map((indicator, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-neutral-600 text-sm"
                >
                  {indicator.icon ?? (
                    <svg
                      className="w-4 h-4 text-orange-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                  <span>{indicator.text}</span>
                </div>
              ))}
            </div>
          )}
        </FadeIn>
      </div>
    </section>
  );
}
