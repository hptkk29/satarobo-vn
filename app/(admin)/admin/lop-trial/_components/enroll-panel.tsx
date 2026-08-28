"use client";

// app/(admin)/admin/lop-trial/_components/enroll-panel.tsx — GĐ2.
//
// Khối "Thêm học viên" của trang chi tiết lớp trải nghiệm: tìm lead cùng cơ sở rồi
// xếp con vào lớp. Chép hành vi từ màn `trial-classes` cũ, đổi sang action `*LopTrial`.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, UserPlus } from "lucide-react";
import {
  enrollLeadChildLopTrialAction,
  searchLopTrialCandidatesAction,
} from "../_actions";
import type { Candidate } from "../_lib/types";


export function EnrollPanel({
  trialClassId,
  canManage,
  canOverride,
  full,
  maxSessions,
}: {
  trialClassId: string;
  canManage: boolean;
  canOverride: boolean;
  full: boolean;
  /**
   * Trần `crm.trialMaxSessions` do server nạp. Trước đây ô này ghi cứng "1 đến 60"
   * trong khi server chặn ở 4 — người dùng gõ 6, qua được validate client, rồi bị
   * server từ chối: hai thông điệp mâu thuẫn trong cùng một thao tác.
   */
  maxSessions: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searched, setSearched] = useState(false);
  // Nhập RIÊNG từng ứng viên: số buổi học thử là thoả thuận với từng phụ huynh,
  // không phải thuộc tính của lớp. Chuỗi rỗng = để server lấy mặc định của lớp.
  const [soBuoi, setSoBuoi] = useState<Record<string, string>>({});

  if (!canManage) return null;

  function runSearch() {
    startTransition(async () => {
      const res = await searchLopTrialCandidatesAction({
        trialClassId,
        // Bỏ trống vẫn tìm được: server trả 20 lead gần nhất — người dùng mở panel ra
        // là thấy danh sách ngay, không phải đoán từ khoá.
        query: query.trim(),
      });
      if (res.ok) {
        setCandidates(res.candidates);
        setSearched(true);
      } else {
        toast.error(res.error);
      }
    });
  }

  function enroll(leadChildId: string, allowOverride: boolean) {
    const raw = (soBuoi[leadChildId] ?? "").trim();
    let totalSessions: number | undefined;
    if (raw) {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > maxSessions) {
        // Câu chữ khớp NGUYÊN VĂN thông báo của server action để người dùng không
        // thấy hai giới hạn khác nhau tuỳ chỗ chặn.
        toast.error(`Số buổi học thử phải là số nguyên từ 1 đến ${maxSessions}`);
        return;
      }
      totalSessions = n;
    }
    // 28/08 — KHÔNG gửi buổi nữa: thêm học viên vào lớp là em học TOÀN BỘ buổi, kể cả
    // buổi tạo SAU. Đây chính là chỗ còn sót khi màn lead đã bỏ ô chọn buổi — hệ quả đã
    // thấy trên test: em bị ghim vào buổi 1, còn buổi 2 báo "chưa có học viên để điểm danh".

    startTransition(async () => {
      const res = await enrollLeadChildLopTrialAction({
        trialClassId,
        leadChildId,
        allowOverride,
        totalSessions,
      });
      if (res.ok) {
        toast.success("Đã xếp học viên vào lớp");
        // Gỡ khỏi kết quả tìm: em này đã có lớp ACTIVE nên lần tìm sau server cũng
        // không trả về nữa — để lại là mời người dùng bấm "Thêm" lần hai vào lỗi.
        setCandidates((prev) => prev.filter((c) => c.leadChildId !== leadChildId));
        router.refresh();
        return;
      }
      // Vượt sĩ số là lỗi CÓ THỂ ghi đè — nhưng chỉ hỏi khi người dùng thực sự có
      // quyền, vì server sẽ từ chối `allowOverride` của người không có quyền.
      if (res.overCapacity && canOverride) {
        if (window.confirm(`${res.error}. Bạn có quyền vượt sĩ số — vẫn thêm?`)) {
          enroll(leadChildId, true);
        }
        return;
      }
      toast.error(res.error);
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Thêm học viên</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary-soft"
        >
          <UserPlus className="h-3.5 w-3.5" />
          {open ? "Đóng" : "Tìm & thêm học viên"}
        </button>
      </div>

      {full && (
        <p className="mt-2 text-xs text-state-warning-ink">
          Lớp đã đủ sĩ số — thêm nữa cần quyền vượt sĩ số.
        </p>
      )}

      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[10rem] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runSearch();
                  }
                }}
                disabled={pending}
                placeholder="Tên con, tên phụ huynh hoặc SĐT…"
                className="w-full rounded-lg border border-border py-2 pl-8 pr-2 text-sm disabled:opacity-50"
              />
            </div>
            <button
              type="button"
              onClick={runSearch}
              disabled={pending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
            >
              Tìm
            </button>
          </div>

          {searched && candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Không tìm thấy học viên phù hợp (cùng cơ sở, chưa ở lớp khác).
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {candidates.map((c) => (
                <li key={c.leadChildId} className="flex flex-wrap items-center gap-2 py-2">
                  <div className="min-w-[8rem] flex-1">
                    <span className="text-sm font-medium text-foreground">{c.childName}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {c.parentName ?? "—"}
                      {c.phone ? ` · ${c.phone}` : ""} · {c.leadStatus}
                    </span>
                  </div>

                  <label
                    className="flex items-center gap-1 text-xs text-muted-foreground"
                    title={`Số buổi học thử: từ 1 đến ${maxSessions}`}
                  >
                    Số buổi (≤ {maxSessions})
                    <input
                      type="number"
                      min={1}
                      max={maxSessions}
                      value={soBuoi[c.leadChildId] ?? ""}
                      onChange={(e) =>
                        setSoBuoi((p) => ({ ...p, [c.leadChildId]: e.target.value }))
                      }
                      disabled={pending}
                      placeholder="mặc định"
                      className="w-20 rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => enroll(c.leadChildId, false)}
                    disabled={pending}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
                  >
                    Thêm
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
