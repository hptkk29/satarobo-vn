"use client";

// app/(admin)/admin/don-tu/_components/work-request-review.tsx — cụm quyết định của MỘT đơn.
//
// Duyệt = áp hệ quả trong CÙNG quyết định (T-05): đổi ca / nghỉ / chỉnh công ghi trong một
// transaction; huỷ buổi / dạy thay áp thất bại thì đơn trả về Chờ duyệt kèm lý do — không bao giờ
// có đơn "đã duyệt" mà lịch chưa đổi.
//
// VÌ SAO HAI Ô CHỮ RIÊNG. Bản cũ dùng CHUNG một ô cho "ghi chú duyệt" và "lý do từ chối": gõ lý do
// từ chối xong lỡ tay bấm Duyệt thì đúng câu đó thành ghi chú duyệt, đi thẳng vào `writeAudit`
// (`reason`) và vào thông báo gửi người nộp. Nay mỗi nhánh có state riêng và chỉ hiện đúng một ô
// tại một thời điểm, nên không có đường nào để chữ của nhánh này rơi sang nhánh kia.
//
// Điều dễ vỡ: chặn "từ chối thiếu lý do" ở đây CHỈ là lớp thứ hai cho êm tay — server vẫn chặn
// (`decideRequestAction` trả "Nhập lý do từ chối"). Đừng bỏ lớp server để đỡ một lần gọi.
//
// TÊN TRỢ NĂNG CỦA HAI Ô CHỮ: `FieldLabel` dựng `<span>` (nó thay chỗ 40 nhãn cũ trong repo), KHÔNG
// phải `<label htmlFor>` — nên nó vẽ được chữ nhưng KHÔNG đặt tên cho ô. Thiếu tên thì trình đọc màn
// hình đọc "vùng nhập văn bản, trống" ngay tại thao tác nặng nhất của màn, mà ô "Lý do từ chối" lại
// là ô bắt buộc. Vì vậy mỗi textarea tự mang `id` + `aria-label`; `id` phải kèm `requestId` vì Sheet
// có thể dựng lại cho đơn khác.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { decideRequestAction } from "@/lib/cham-cong/request-actions";
import { FieldLabel } from "@/components/admin/ui/help-hint";
import { BTN_DANGER, BTN_OUTLINE, BTN_PRIMARY, FIELD } from "@/components/admin/cham-cong/classes";
import { cn } from "@/lib/utils";

type Mode = "idle" | "approve" | "reject";

const TEXTAREA = cn(FIELD, "h-20 w-full resize-y py-2 leading-snug");

export function WorkRequestReview({
  requestId,
  effectHint,
  effectCode,
  effectBlocked,
  subject,
  onDone,
}: {
  requestId: string;
  /** Câu "Duyệt đơn này sẽ: …" — 5 nhánh của `lib/cham-cong/request-effect.ts`. */
  effectHint: string | null;
  /** Mã sẽ ghi lên lưới nếu duyệt (CG, P…). Không phải đơn nào cũng ghi một mã. */
  effectCode?: string | null;
  /** Lý do `decide()` sẽ ném lỗi (đơn khuyết trường bắt buộc). Xem `EffectSummary.blocked`. */
  effectBlocked?: string | null;
  /** "Nguyễn A ngày 09/09" — ai, ngày nào, in trong khối xác nhận. */
  subject?: string | null;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<Mode>("idle");
  const [approveNote, setApproveNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectInvalid, setRejectInvalid] = useState(false);

  function decide(decision: "APPROVED" | "REJECTED") {
    const note = (decision === "APPROVED" ? approveNote : rejectReason).trim() || null;
    if (decision === "REJECTED" && !note) {
      setRejectInvalid(true);
      toast.error("Nhập lý do từ chối");
      return;
    }
    start(async () => {
      const res = await decideRequestAction({ id: requestId, decision, note });
      if (res.ok) {
        toast.success(
          decision === "APPROVED"
            ? res.note
              ? `Đã duyệt — ${res.note}`
              : "Đã duyệt đơn"
            : "Đã từ chối đơn",
        );
        setMode("idle");
        setApproveNote("");
        setRejectReason("");
        setRejectInvalid(false);
        router.refresh();
        onDone?.();
      } else {
        // Vẫn refresh khi lỗi: `applyError` mới vừa được ghi lên đơn, phải hiện ra ngay.
        toast.error(res.error);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      {/* Đơn KHUYẾT thì nói thẳng, đừng in cả hai câu. Bản trước hiện "duyệt sẽ báo lỗi" ở cột
          Thay đổi rồi ngay dưới vẫn hứa "Duyệt đơn này sẽ: ghi mốc giờ chỉnh tay…" — người duyệt
          đọc được lời hứa, bấm, rồi ăn hộp lỗi đỏ. */}
      {effectBlocked ? (
        <p className="text-sm text-state-danger-ink">
          Duyệt đơn này sẽ BÁO LỖI: {effectBlocked}. Từ chối và nhờ người nộp bổ sung rồi nộp lại.
        </p>
      ) : (
        effectHint && <p className="text-sm text-state-warning-ink">Duyệt đơn này sẽ: {effectHint}.</p>
      )}

      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          {/* Nút Duyệt KHÔNG bị khoá kể cả khi biết sẽ hỏng: server mới là nơi quyết, và dữ liệu
              có thể đã được sửa ở tab khác kể từ lúc trang này dựng. Chỉ hạ nó xuống viền để
              "Từ chối" thành đường dễ đi hơn. */}
          <button
            type="button"
            onClick={() => setMode("approve")}
            disabled={pending}
            className={effectBlocked ? BTN_OUTLINE : BTN_PRIMARY}
          >
            Duyệt
          </button>
          <button
            type="button"
            onClick={() => {
              setRejectInvalid(false);
              setMode("reject");
            }}
            disabled={pending}
            className={BTN_OUTLINE}
          >
            Từ chối
          </button>
        </div>
      )}

      {mode === "approve" && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-sm font-semibold text-foreground">
            Ghi {effectCode ?? "thay đổi"} cho {subject ?? "đơn này"}
          </p>
          <div>
            <FieldLabel label="Ghi chú duyệt (tuỳ chọn)" />
            <textarea
              id={`approve-note-${requestId}`}
              aria-label="Ghi chú duyệt (tuỳ chọn)"
              value={approveNote}
              onChange={(e) => setApproveNote(e.target.value)}
              maxLength={1000}
              placeholder="Người nộp đọc được ghi chú này."
              className={TEXTAREA}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => decide("APPROVED")} disabled={pending} className={BTN_PRIMARY}>
              {pending ? "Đang xử lý…" : "Xác nhận duyệt"}
            </button>
            <button type="button" onClick={() => setMode("idle")} disabled={pending} className={BTN_OUTLINE}>
              Huỷ
            </button>
          </div>
        </div>
      )}

      {mode === "reject" && (
        <div className="space-y-3 rounded-lg border border-state-danger-soft bg-card p-3">
          <div>
            <FieldLabel label="Lý do từ chối" required />
            <textarea
              id={`reject-reason-${requestId}`}
              aria-label="Lý do từ chối (bắt buộc)"
              aria-required
              value={rejectReason}
              onChange={(e) => {
                setRejectReason(e.target.value);
                if (rejectInvalid) setRejectInvalid(false);
              }}
              maxLength={1000}
              aria-invalid={rejectInvalid}
              aria-describedby={rejectInvalid ? `reject-err-${requestId}` : undefined}
              placeholder="Vì sao không duyệt — người nộp đọc nguyên văn câu này."
              className={TEXTAREA}
            />
            {rejectInvalid && (
              <p id={`reject-err-${requestId}`} className="mt-1 text-xs text-state-danger-ink">
                Nhập lý do từ chối.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => decide("REJECTED")} disabled={pending} className={BTN_DANGER}>
              {pending ? "Đang xử lý…" : "Xác nhận từ chối"}
            </button>
            <button type="button" onClick={() => setMode("idle")} disabled={pending} className={BTN_OUTLINE}>
              Huỷ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
