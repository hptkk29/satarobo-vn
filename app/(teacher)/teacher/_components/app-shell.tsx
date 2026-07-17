"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { Sidebar, SidebarContent } from "./sidebar";
import { TeacherThemeRoot } from "./teacher-theme";
import { Topbar } from "./topbar";

/**
 * Khung site giáo viên — port từ TeachUI `components/layout/app-shell.tsx`.
 * Sidebar cố định 16rem trên desktop, chuyển thành drawer trượt trên mobile.
 */
export function AppShell({
  userName,
  adminReturnUrl,
  children,
}: {
  userName: string;
  /** F3 (Q41) — URL admin cho GV kiêm nhiệm; undefined = không hiện lối về admin. */
  adminReturnUrl?: string;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <TeacherThemeRoot>
      <Sidebar />

      {/* Drawer mobile */}
      <div
        className={cn(
          "fixed inset-0 z-40 lg:hidden",
          drawerOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!drawerOpen}
      >
        <div
          className={cn(
            "absolute inset-0 bg-slate-900/40 transition-opacity",
            drawerOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setDrawerOpen(false)}
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-64 border-r border-border shadow-xl transition-transform",
            drawerOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="absolute top-4 right-3 z-10 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Đóng menu"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          <SidebarContent onNavigate={() => setDrawerOpen(false)} />
        </div>
      </div>

      {/* Cột nội dung */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-64 print:pl-0">
        <Topbar
          userName={userName}
          adminReturnUrl={adminReturnUrl}
          onMenuClick={() => setDrawerOpen(true)}
        />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 print:max-w-none print:p-0">
          {children}
        </main>
      </div>

      <Toaster richColors position="top-right" closeButton />
    </TeacherThemeRoot>
  );
}
