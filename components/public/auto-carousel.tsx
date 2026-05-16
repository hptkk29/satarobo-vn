"use client";

import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AutoCarouselProps {
  children: React.ReactNode;
  /**
   * Tailwind classes for each slide width (responsive).
   * Example: "flex-[0_0_85%] sm:flex-[0_0_45%] lg:flex-[0_0_30%]"
   */
  slideClassName?: string;
  /** Autoplay interval (ms). Default 5000. Set to 0 to disable autoplay. */
  autoplayInterval?: number;
  /** Show prev/next arrows on >= md */
  showArrows?: boolean;
  /** Show dot indicators below the slides */
  showDots?: boolean;
  /** Active dot accent color (Tailwind class). Default orange. */
  dotActiveClassName?: string;
  /** Optional wrapper className */
  className?: string;
}

export function AutoCarousel({
  children,
  slideClassName = "flex-[0_0_88%] sm:flex-[0_0_45%]",
  autoplayInterval = 5000,
  showArrows = true,
  showDots = true,
  dotActiveClassName = "bg-orange-500",
  className,
}: AutoCarouselProps) {
  const plugins =
    autoplayInterval > 0
      ? [
          Autoplay({
            delay: autoplayInterval,
            stopOnInteraction: false,
            stopOnMouseEnter: true,
          }),
        ]
      : [];

  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, align: "start", containScroll: "trimSnaps" },
    plugins,
  );

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);

  const scrollTo = useCallback((idx: number) => emblaApi?.scrollTo(idx), [emblaApi]);
  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    setScrollSnaps(emblaApi.scrollSnapList());
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    onSelect();
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  const slides = Array.isArray(children)
    ? children.filter((c) => c !== null && c !== false && c !== undefined)
    : [children];

  return (
    <div className={cn("relative", className)}>
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex gap-4">
          {slides.map((child, i) => (
            <div key={i} className={cn("min-w-0", slideClassName)}>
              {child}
            </div>
          ))}
        </div>
      </div>

      {showDots && scrollSnaps.length > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {scrollSnaps.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => scrollTo(i)}
              className={cn(
                "h-2 rounded-full transition-all",
                i === selectedIndex
                  ? `w-8 ${dotActiveClassName}`
                  : "w-2 bg-gray-300 hover:bg-gray-400",
              )}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      )}

      {showArrows && scrollSnaps.length > 1 && (
        <>
          <button
            type="button"
            onClick={scrollPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 hidden md:flex items-center justify-center w-10 h-10 rounded-full bg-white/95 shadow-lg hover:bg-white -ml-3 z-10 transition-shadow hover:shadow-xl"
            aria-label="Previous slide"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={scrollNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 hidden md:flex items-center justify-center w-10 h-10 rounded-full bg-white/95 shadow-lg hover:bg-white -mr-3 z-10 transition-shadow hover:shadow-xl"
            aria-label="Next slide"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
    </div>
  );
}
