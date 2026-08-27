import "server-only";
import { db } from "@/lib/db";
import { phoneVariants } from "@/lib/phone";
import { orgUnitIdForCenter } from "@/lib/org/org-service";
import { docCdr, type CdrDaDoc } from "@/lib/calls/cdr";
import { tienTrangThai, bacCuaTrangThai } from "@/lib/calls/trang-thai";
import type { Prisma } from "@prisma/client";

// =============================================================================
// NẠP MỘT BẢN GHI CDR VÀO `CallLog`.
//
// Bốn ràng buộc của spec sống ở đây, và cả bốn đều là thứ hỏng CÂM nếu làm sai:
//  · OC-1 — cùng `providerCallId` gửi lại ⇒ KHÔNG tạo dòng thứ hai, KHÔNG cộng
//    KPI lần hai. Khoá là `@@unique([provider, providerCallId])` ở TẦNG DB, không
//    phải một câu `findFirst` (hai webhook về cùng lúc thì `findFirst` thua đua).
//  · OC-2 — sự kiện tới muộn mô tả trạng thái sớm hơn ⇒ bỏ qua phần trạng thái,
//    NHƯNG vẫn lưu vết (`rawPayload`, `providerEventSeq`, `duplicateCount`).
//  · OC-12 — không đối khớp được Lead ⇒ VẪN TẠO bản ghi, `leadId = NULL` + cờ
//    `needsReview` + lý do. Cấm loại bỏ dữ liệu cuộc gọi (QT-39).
//  · OC-11 — tra Lead bằng `phone: { in: phoneVariants(x) }`, KHÔNG so bằng: DB
//    còn tồn tại CẢ HAI định dạng (`0…` cũ và `84…` mới).
// =============================================================================

export type NapCdrKetQua =
  | { ok: true; callLogId: string; trung: boolean }
  | { ok: false; ma: string; thongDiep: string };

/** Lý do cần rà soát — hiện ở hàng đợi "Cuộc gọi mồ côi". */
const LY_DO = {
  KHONG_KHOP_LEAD: "LEAD_UNMATCHED",
  KHONG_BIET_CO_SO: "CENTER_UNMATCHED",
  CHUA_KHAI_MUC_DICH: "PURPOSE_NOT_DECLARED",
} as const;

/**
 * Tra máy nhánh → nhân viên → cơ sở TẠI THỜI ĐIỂM CUỘC GỌI (OC-9).
 *
 * ⚠️ Cố ý KHÔNG tra "ai đang giữ máy nhánh hôm nay": một người đổi máy nhánh là
 * chuyện thường, và CDR cũ phải vẫn quy về đúng người đã gọi lúc đó.
 */
async function traMayNhanh(extension: string | null, luc: Date) {
  if (!extension) return null;
  return db.callExtension.findFirst({
    where: {
      extension,
      effectiveFrom: { lte: luc },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: luc } }],
    },
    orderBy: { effectiveFrom: "desc" },
    select: { userId: true, centerId: true, orgUnitId: true },
  });
}

/** OC-10/OC-11 — đối khớp Lead theo số đã chuẩn hoá, tra bằng `in` chứ không so bằng. */
async function traLead(peerPhone: string | null) {
  if (!peerPhone) return null;
  return db.lead.findFirst({
    where: { phone: { in: phoneVariants(peerPhone) } },
    orderBy: { createdAt: "desc" },
    select: { id: true, centerId: true },
  });
}

export async function napCdr(payload: unknown): Promise<NapCdrKetQua> {
  const doc = docCdr(payload);
  if (!doc.ok) {
    return { ok: false, ma: doc.ma, thongDiep: "Không đọc được bản ghi cuộc gọi." };
  }
  return napCdrDaDoc(doc.cdr, payload);
}

export async function napCdrDaDoc(cdr: CdrDaDoc, payloadThoO: unknown): Promise<NapCdrKetQua> {
  const payloadTho = (payloadThoO ?? {}) as Prisma.InputJsonValue;

  const mayNhanh = await traMayNhanh(cdr.extension, cdr.startedAt);
  // QT-40 — cuộc gọi nội bộ VẪN LƯU nhưng không đối khớp khách.
  const lead = cdr.direction === "INTERNAL" ? null : await traLead(cdr.peerPhone);

  // Cơ sở suy theo thứ tự: máy nhánh (chắc chắn nhất) → cơ sở của Lead. Không suy
  // được thì để NULL — xem ghi chú dài trên `model CallLog` về vì sao cột này
  // nullable dù spec OC-8 nói "bắt buộc".
  const centerId = mayNhanh?.centerId ?? lead?.centerId ?? null;
  const orgUnitId =
    mayNhanh?.orgUnitId ?? (centerId ? await orgUnitIdForCenter(centerId).catch(() => null) : null);

  const lyDoRaSoat: string[] = [];
  if (cdr.direction !== "INTERNAL" && !lead) lyDoRaSoat.push(LY_DO.KHONG_KHOP_LEAD);
  if (!centerId) lyDoRaSoat.push(LY_DO.KHONG_BIET_CO_SO);
  // Kế hoạch B1 (Sale gọi bằng softphone của nhà cung cấp) làm mọi cuộc gọi ra về
  // đây KHÔNG kèm mục đích. Không im lặng bỏ qua — đây là nghĩa vụ pháp lý QT-33.
  if (cdr.direction === "OUTBOUND") lyDoRaSoat.push(LY_DO.CHUA_KHAI_MUC_DICH);
  lyDoRaSoat.push(...cdr.canhBao);

  const bacMoi = cdr.techStatus ? bacCuaTrangThai(cdr.techStatus) : 0;

  // ── OC-1: giành chỗ bằng UNIQUE ở tầng DB ───────────────────────────────
  const daCo = await db.callLog.findUnique({
    where: { provider_providerCallId: { provider: "OMICALL", providerCallId: cdr.providerCallId } },
    select: { id: true, techStatus: true, statusRank: true, providerEventSeq: true },
  });

  if (!daCo) {
    try {
      const tao = await db.callLog.create({
        data: {
          provider: "OMICALL",
          providerCallId: cdr.providerCallId,
          userId: mayNhanh?.userId ?? null,
          extension: cdr.extension,
          centerId,
          orgUnitId,
          leadId: lead?.id ?? null,
          direction: cdr.direction,
          fromNumber: cdr.fromNumber,
          toNumber: cdr.toNumber,
          peerPhone: cdr.peerPhone,
          didNumber: cdr.didNumber,
          startedAt: cdr.startedAt,
          answeredAt: cdr.answeredAt,
          endedAt: cdr.endedAt,
          talkSeconds: cdr.talkSeconds,
          billSeconds: cdr.billSeconds,
          techStatus: cdr.techStatus ?? "INITIATED",
          statusRank: bacMoi,
          // ⚠️ `hasRecording` CHỈ bật khi tệp đã nằm trong kho RIÊNG. CDR nói "có
          // link" không đủ: link đó là của nhà cung cấp và không bao giờ được lưu
          // hay phát ra (OC-3). Việc tải về là bước riêng, làm sau khi có TQ-4.
          hasRecording: false,
          needsReview: lyDoRaSoat.length > 0,
          reviewReason: lyDoRaSoat.join(",") || null,
          providerEventSeq: 1,
          rawPayload: payloadTho,
          costAmount: cdr.costAmount ?? null,
        },
        select: { id: true },
      });
      return { ok: true, callLogId: tao.id, trung: false };
    } catch (err) {
      // Đua giữa hai webhook cùng mã: UNIQUE bắt được, và thua đua nghĩa là TRÙNG.
      if (laLoiTrungKhoa(err)) {
        const lai = await db.callLog.findUnique({
          where: {
            provider_providerCallId: { provider: "OMICALL", providerCallId: cdr.providerCallId },
          },
          select: { id: true },
        });
        if (lai) {
          await db.callLog.update({
            where: { id: lai.id },
            data: { duplicateCount: { increment: 1 }, rawPayload: payloadTho },
          });
          return { ok: true, callLogId: lai.id, trung: true };
        }
      }
      throw err;
    }
  }

  // ── OC-2: đã có bản ghi ⇒ chỉ TIẾN, không lùi ────────────────────────────
  const tien = tienTrangThai(daCo.techStatus, cdr.techStatus);

  await db.callLog.update({
    where: { id: daCo.id },
    data: {
      // Lưu vết LUÔN LUÔN, kể cả khi phần trạng thái bị bỏ qua.
      rawPayload: payloadTho,
      providerEventSeq: daCo.providerEventSeq + 1,
      duplicateCount: { increment: 1 },
      ...(tien.nhan && tien.trangThai
        ? {
            techStatus: tien.trangThai,
            statusRank: tien.bac,
            // Các mốc thời gian / thời lượng chỉ ghi khi sự kiện thực sự tiến —
            // sự kiện cũ mang `talkSeconds` nhỏ hơn không được đè lên số đúng.
            answeredAt: cdr.answeredAt ?? undefined,
            endedAt: cdr.endedAt ?? undefined,
            talkSeconds: cdr.talkSeconds ?? undefined,
            billSeconds: cdr.billSeconds ?? undefined,
            costAmount: cdr.costAmount ?? undefined,
          }
        : {}),
    },
  });

  // OC-1 — đã có bản ghi nghĩa là TRÙNG ở mức webhook: nơi gọi ghi `DUPLICATE` và
  // KHÔNG cộng chỉ tiêu lần hai.
  return { ok: true, callLogId: daCo.id, trung: true };
}

function laLoiTrungKhoa(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "P2002"
  );
}
