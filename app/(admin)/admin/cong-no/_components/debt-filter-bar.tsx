"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const GROUP_OPTIONS = [
  { value: "enrollment", label: "Theo đăng ký học" },
  { value: "student", label: "Theo học viên" },
  { value: "center", label: "Theo cơ sở" },
];

export function DebtFilterBar({
  groupBy,
  search,
}: {
  groupBy: string;
  search: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [searchVal, setSearchVal] = useState(search);

  function push(updates: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "" || v === "ALL") params.delete(k);
      else params.set(k, v);
    }
    // scroll: false — đổi nhóm/tìm kiếm là GIỮ NGUYÊN TRANG, không cuộn về đầu.
    router.push(`/cong-no?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Nhóm theo</Label>
        <Select value={groupBy} onValueChange={(v) => push({ groupBy: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GROUP_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label className="text-xs">Tìm kiếm</Label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            push({ search: searchVal.trim() || null });
          }}
          className="flex gap-2"
        >
          <Input
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            placeholder="Tên HV / đơn / phụ huynh..."
          />
          <Button type="submit" variant="outline">
            Lọc
          </Button>
        </form>
      </div>
    </div>
  );
}
