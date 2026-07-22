"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavItemActive, navGroups, type NavGroup, type NavItem } from "./nav-config";

function NavLinkItem({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isNavItemActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn("t-nav-link", active && "t-nav-link-active")}
      >
        <Icon
          className={cn(
            "h-[18px] w-[18px] shrink-0",
            active ? "text-orange-600 dark:text-orange-300" : "text-muted-foreground",
          )}
          strokeWidth={2}
          aria-hidden
        />
        <span className="truncate">{item.label}</span>
      </Link>
    </li>
  );
}

function NavGroupBlock({
  group,
  onNavigate,
}: {
  group: NavGroup;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(!group.collapsed);

  if (group.standalone) {
    return (
      <ul className="space-y-0.5">
        {group.items.map((item) => (
          <NavLinkItem key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </ul>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="t-section-label flex w-full items-center justify-between"
      >
        <span>{group.label}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", open ? "rotate-0" : "-rotate-90")}
          aria-hidden
        />
      </button>

      {open && (
        <ul className="space-y-0.5">
          {group.items.map((item) => (
            <NavLinkItem key={item.href} item={item} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Điều hướng giáo viên" className="space-y-1 px-3 pb-6">
      {navGroups.map((group) => (
        <NavGroupBlock key={group.label} group={group} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}
