import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { chiaChoLead, baoLoLeadMoi, thuHoiChuongLeadCu } from "@/lib/lead/assign-lead";
import { TERMINAL_LEAD_STATUSES } from "@/lib/lead/assign";
import { logLeadAudit } from "@/lib/audit/log";
import { orgUnitIdForCenter } from "@/lib/org/org-service";
import {
  mocCatNguoi,
  soNgayIm,
  type LeadDeDoNguoi,
} from "@/lib/lead/lead-nguoi";
import type { VisibleCenterIds } from "@/lib/lead-handover/service";

/**
 * TÌM VÀ PHÂN BỔ LẠI LEAD NGUỘI.
 *
 * Yêu cầu 15/09/2026: "lọc các KH (chưa đăng ký, ghi danh) mà sale không tương tác trong vòng
 * 90 ngày ... quản lý có thể lọc và phân bổ cho các sale khác".
 *
 * Khác `lib/lead-handover/service.ts` ở MỘT điểm quyết định: màn bàn giao bắt chọn TỪNG sale
 * nguồn, còn ở đây quét TOÀN BỘ sale cùng lúc — đó là thứ chủ dự án chọn, và cũng là thứ duy
 * nhất cho phép quản lý nhìn ra bức tranh "ai đang ôm lead mà không chăm".
 *
 * ⚠️ Phép đo "không tương tác" và mọi giới hạn của nó nằm ở `lib/lead/lead-nguoi.ts`. Đọc
 * khối chú thích ở đó trước khi sửa bất cứ gì tại đây.
 */

/** Một dòng trong danh sách lead nguội. */
export interface DongLeadNguoi {
  id: string;
  parentName: string;
  phone: string;
  status: string;
  centerId: string | null;
  /** Người đang giữ; `null` = chưa chia cho ai. */
  chuId: string | null;
  chuTen: string | null;
  soNgayIm: number;
}

/**
 * Điều kiện "lead CHƯA CHỐT" — sao chép nguyên ý của `onlyActive` ở màn bàn giao.
 *
 * ⚠️ Hai vế, không phải một. Sau GĐ5 tập đóng chỉ còn `DA_MAT`, nên lọc theo `status` MỘT
 * MÌNH sẽ lôi cả lead đã convert xong từ đời nào vào danh sách. `convertedAt` do chính lượt
 * convert ghi ⇒ có mốc = hồ sơ đã khép.
 */
const CHUA_CHOT = {
  deletedAt: null,
  status: { notIn: [...TERMINAL_LEAD_STATUSES] as never },
  convertedAt: null,
} satisfies Prisma.LeadWhereInput;

/**
 * Câu `where` cho lead nguội.
 *
 * Mỗi cột mốc phải ĐỀU ở trước mốc cắt — `OR` là sai: chỉ cần một cột cũ là lead lọt vào, kể
 * cả khi Sale vừa gọi khách hôm qua.
 */
export function dungWhereNguoi(params: {
  now: Date;
  nguongNgay: number;
  visibleCenterIds: VisibleCenterIds;
  centerId?: string | null;
}): Prisma.LeadWhereInput {
  const cat = mocCatNguoi(params.now, params.nguongNgay);
  const truocCat = { lt: cat };
  const and: Prisma.LeadWhereInput[] = [
    // `null` nghĩa là "chưa từng xảy ra" ⇒ vẫn tính là nguội. Bỏ vế `null` đi là loại đúng
    // những lead chưa ai đụng tới lần nào — nhóm đáng lọc nhất.
    { OR: [{ lastActivityAt: null }, { lastActivityAt: truocCat }] },
    { OR: [{ firstContactAt: null }, { firstContactAt: truocCat }] },
    { OR: [{ assignedAt: null }, { assignedAt: truocCat }] },
    { createdAt: truocCat },
  ];
  if (params.visibleCenterIds !== "ALL") {
    // Mảng rỗng → không match lead nào (fail-safe), đúng nếp của màn bàn giao.
    and.push({ centerId: { in: params.visibleCenterIds } });
  }
  if (params.centerId) and.push({ centerId: params.centerId });
  return { ...CHUA_CHOT, AND: and };
}

/** Đếm + lấy danh sách lead nguội, sắp theo "im lâu nhất trước". */
export async function timLeadNguoi(params: {
  now: Date;
  nguongNgay: number;
  visibleCenterIds: VisibleCenterIds;
  centerId?: string | null;
  /** Trần số dòng trả về — màn hình phân trang ở client. */
  gioiHan?: number;
}): Promise<{ tong: number; dong: DongLeadNguoi[] }> {
  const where = dungWhereNguoi(params);
  const [tong, ds] = await Promise.all([
    db.lead.count({ where }),
    db.lead.findMany({
      where,
      select: {
        id: true,
        parentName: true,
        phone: true,
        status: true,
        centerId: true,
        assignedToId: true,
        assignedTo: { select: { name: true } },
        lastActivityAt: true,
        firstContactAt: true,
        assignedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
      take: params.gioiHan ?? 500,
    }),
  ]);

  const dong = ds
    .map((l) => ({
      id: l.id,
      parentName: l.parentName,
      phone: l.phone,
      status: l.status as string,
      centerId: l.centerId,
      chuId: l.assignedToId,
      chuTen: l.assignedTo?.name ?? null,
      soNgayIm: soNgayIm(l satisfies LeadDeDoNguoi, params.now),
    }))
    // Im lâu nhất lên trước: đó là thứ quản lý cần xử lý đầu tiên.
    .sort((a, b) => b.soNgayIm - a.soNgayIm);

  return { tong, dong };
}

export type CachPhanBo =
  | { kieu: "vong" }
  | { kieu: "nguoi"; nhanId: string };

export interface KetQuaPhanBo {
  ok: boolean;
  /** Số lead thực sự đổi chủ. */
  daChia: number;
  /** Lead bị bỏ qua kèm lý do — KHÔNG được im lặng nuốt. */
  boQua: { leadId: string; lyDo: string }[];
}

/**
 * PHÂN BỔ LẠI một lô lead nguội.
 *
 * Hai cách, chủ dự án chốt có cả hai:
 *   · `vong`  — đi qua `chiaChoLead` nên ăn theo ma trận + sổ chia lead sẵn có. Công bằng, có
 *               vết, và không cần quản lý tự cân tải.
 *   · `nguoi` — giao đích danh. Quản lý tự quyết ai nhận.
 *
 * ⚠️ KIỂM LẠI ĐIỀU KIỆN NGUỘI Ở ĐÂY, không tin danh sách client gửi lên. Giữa lúc màn hình
 * dựng danh sách và lúc quản lý bấm nút, Sale có thể vừa gọi khách xong — phân bổ đúng lead
 * ấy là giật việc khỏi tay người đang làm. Đây cũng là luật chung: id từ client là dữ liệu,
 * không phải sự thật.
 */
export async function phanBoLaiLeadNguoi(params: {
  leadIds: readonly string[];
  cach: CachPhanBo;
  now: Date;
  nguongNgay: number;
  visibleCenterIds: VisibleCenterIds;
  actorId: string | null;
  actorName: string;
  lyDo: string;
}): Promise<KetQuaPhanBo> {
  const boQua: { leadId: string; lyDo: string }[] = [];
  if (params.leadIds.length === 0) return { ok: true, daChia: 0, boQua };

  // Lọc lại theo ĐÚNG câu `where` đã dựng danh sách, cộng thêm ràng buộc id.
  const hopLe = await db.lead.findMany({
    where: {
      ...dungWhereNguoi({
        now: params.now,
        nguongNgay: params.nguongNgay,
        visibleCenterIds: params.visibleCenterIds,
      }),
      id: { in: [...params.leadIds] },
    },
    select: { id: true, centerId: true, assignedToId: true },
  });
  const conNguoi = new Set(hopLe.map((l) => l.id));
  for (const id of params.leadIds) {
    if (!conNguoi.has(id)) {
      boQua.push({
        leadId: id,
        lyDo: "Lead không còn ở trạng thái nguội (vừa có người chăm, đã chốt, hoặc ngoài tầm nhìn cơ sở)",
      });
    }
  }

  const daChia: { leadId: string; ownerId: string }[] = [];
  const mocLuot = params.now.getTime();

  for (const lead of hopLe) {
    if (!lead.centerId) {
      boQua.push({ leadId: lead.id, lyDo: "Lead chưa thuộc cơ sở nào — không có pool để chia" });
      continue;
    }
    const chuCu = lead.assignedToId;

    if (params.cach.kieu === "nguoi") {
      // Giao đích danh: ghi thẳng, rồi tự lo hai nửa chuông.
      if (chuCu === params.cach.nhanId) {
        boQua.push({ leadId: lead.id, lyDo: "Người nhận trùng người đang giữ" });
        continue;
      }
      const orgUnitId = await orgUnitIdForCenter(lead.centerId);
      await db.$transaction(async (tx) => {
        await tx.lead.update({
          where: { id: lead.id },
          data: {
            assignedToId: params.cach.kieu === "nguoi" ? params.cach.nhanId : null,
            assignedAt: params.now,
            assignedById: params.actorId,
            assignmentSource: "MANAGER",
          },
        });
        await tx.leadAssignmentHistory.create({
          data: {
            leadId: lead.id,
            fromUserId: chuCu,
            toUserId: params.cach.kieu === "nguoi" ? params.cach.nhanId : "",
            assignedById: params.actorId,
            reason: params.lyDo,
          },
        });
        await tx.leadActivity.create({
          data: {
            leadId: lead.id,
            actorId: params.actorId,
            actorName: params.actorName,
            type: "NOTE",
            content: `Phân bổ lại lead nguội (${params.nguongNgay}+ ngày không ai chăm) — ${params.lyDo}`,
            metadata: { system: true, nguoi: true, orgUnitId },
          },
        });
        await logLeadAudit({
          leadId: lead.id,
          action: "ASSIGN",
          actorId: params.actorId,
          actorName: params.actorName,
          oldValues: { assignedToId: chuCu },
          newValues: { assignedToId: params.cach.kieu === "nguoi" ? params.cach.nhanId : null },
          changedFields: ["assignedToId"],
          reason: params.lyDo,
          tx,
        });
      });
      await thuHoiChuongLeadCu({
        chuCuId: chuCu,
        chuMoiId: params.cach.nhanId,
        leadId: lead.id,
      });
      daChia.push({ leadId: lead.id, ownerId: params.cach.nhanId });
      continue;
    }

    // Chia vòng: đi qua đúng cỗ máy chia sẵn có nên sổ chia lead không bị lệch.
    const kq = await chiaChoLead(lead.id, {
      targetCenterId: lead.centerId,
      createdById: params.actorId,
      entryPoint: "IMPORT",
      explicitOwnerId: null,
      imLangChuong: true,
    }).catch((err) => {
      console.error("[lead-nguoi] chia vòng:", err);
      return null;
    });
    if (!kq?.assignedToId) {
      boQua.push({ leadId: lead.id, lyDo: "Pool của cơ sở không có tư vấn viên nào đang bật" });
      continue;
    }
    daChia.push({ leadId: lead.id, ownerId: kq.assignedToId });
  }

  // MỘT tin gộp cho mỗi người nhận — không bắn N chuông (xem `lib/push/allowlist.ts`).
  await baoLoLeadMoi({
    daChia,
    nguon: { kieu: "sale_nghi", tuNguoi: "danh sách lead lâu ngày chưa chăm" },
    mocLuot,
    boQuaNguoi: params.actorId,
  });

  return { ok: true, daChia: daChia.length, boQua };
}
