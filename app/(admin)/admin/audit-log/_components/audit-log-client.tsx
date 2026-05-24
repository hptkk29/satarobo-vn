"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AuditLogFilters } from "./audit-log-filters";
import { AuditLogTable } from "./audit-log-table";
import { ExportButton } from "./export-button";
import { CleanupButton } from "./cleanup-button";
import {
  queryUserAuditLogs,
  queryGrantAuditLogs,
  queryLeadAuditLogs,
  queryClassAuditLogs,
  queryStudentAuditLogs,
  type AuditFilters,
  type AuditTab,
  type AnyAuditRow,
} from "../_actions";

type Actor = { id: string; name: string | null; email: string };

type QueryFn = (
  filters: AuditFilters,
  cursor: string | null,
) => Promise<{ items: AnyAuditRow[]; nextCursor: string | null }>;

const TAB_CONFIG: Array<{ key: AuditTab; label: string; query: QueryFn }> = [
  { key: "user", label: "User", query: queryUserAuditLogs as QueryFn },
  { key: "grant", label: "Phân quyền", query: queryGrantAuditLogs as QueryFn },
  { key: "lead", label: "Lead", query: queryLeadAuditLogs as QueryFn },
  { key: "class", label: "Lớp học", query: queryClassAuditLogs as QueryFn },
  { key: "student", label: "Học viên", query: queryStudentAuditLogs as QueryFn },
];

export function AuditLogClient({ actors }: { actors: Actor[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as AuditTab) ?? "user";
  const [activeTab, setActiveTab] = useState<AuditTab>(initialTab);

  const [filters, setFilters] = useState<AuditFilters>({});
  const [items, setItems] = useState<AnyAuditRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isPending, startTransition] = useTransition();

  const loadPage = useCallback(
    (resetCursor: boolean, cursorOverride?: string | null) => {
      const tabConfig = TAB_CONFIG.find((t) => t.key === activeTab);
      if (!tabConfig) return;
      const useCursor = resetCursor ? null : (cursorOverride ?? cursor);
      startTransition(async () => {
        try {
          const result = await tabConfig.query(filters, useCursor);
          if (resetCursor) {
            setItems(result.items);
          } else {
            setItems((prev) => [...prev, ...result.items]);
          }
          setCursor(result.nextCursor);
          setHasMore(!!result.nextCursor);
        } catch {
          toast.error("Lỗi tải audit log");
        }
      });
    },
    [activeTab, filters, cursor],
  );

  useEffect(() => {
    setCursor(null);
    setItems([]);
    setHasMore(false);
    loadPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, filters]);

  function handleTabChange(value: string) {
    const newTab = value as AuditTab;
    setActiveTab(newTab);
    const params = new URLSearchParams(searchParams);
    params.set("tab", newTab);
    router.replace(`/audit-log?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            {TAB_CONFIG.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex gap-2">
            <ExportButton tab={activeTab} filters={filters} />
            <CleanupButton />
          </div>
        </div>

        <AuditLogFilters
          filters={filters}
          actors={actors}
          tab={activeTab}
          onApply={setFilters}
        />

        {TAB_CONFIG.map((t) => (
          <TabsContent key={t.key} value={t.key} className="mt-0">
            <AuditLogTable
              tab={t.key}
              items={items}
              isPending={isPending}
              hasMore={hasMore}
              onLoadMore={() => loadPage(false)}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
