"use client";

import Link from "next/link";
import type { ReactNode, ButtonHTMLAttributes } from "react";
import { ShimmerButton } from "@/components/magic/shimmer-button";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

interface CommonProps {
  children: ReactNode;
  size?: Size;
  className?: string;
}

type ButtonProps = CommonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

type LinkProps = CommonProps & {
  href: string;
  target?: "_blank" | "_self";
};

type Props = ButtonProps | LinkProps;

const SIZE_CLASS: Record<Size, string> = {
  sm: "!px-4 !py-2 text-sm",
  md: "!px-6 !py-3 text-base",
  lg: "!px-8 !py-4 text-lg",
};

// Primary CTA — Cam shimmer button. Use cho important actions.
export function CTAPrimary(props: Props) {
  const { children, size = "md", className } = props;

  const button = (
    <ShimmerButton
      className={cn(
        "font-semibold shadow-[0_4px_14px_rgba(249,115,22,0.4)]",
        "hover:scale-[1.02] transition-transform duration-200",
        SIZE_CLASS[size],
        className,
      )}
      shimmerColor="rgba(255,255,255,0.7)"
      background="#F97316"
      // If onClick exists, pass it through
      onClick={"onClick" in props && !("href" in props) ? props.onClick : undefined}
    >
      {children}
    </ShimmerButton>
  );

  if ("href" in props && props.href) {
    return (
      <Link href={props.href} target={props.target} className="inline-block">
        {button}
      </Link>
    );
  }
  return button;
}
