import "server-only";
/**
 * Site Sale — dữ liệu màn "Chuyển lead liên cơ sở" (báo cáo theo tháng).
 *
 * ── ĐÂY LÀ BẢN ĐÔI CỦA TỆP NÀO, VÀ VÌ SAO ───────────────────────────────────
 * Bản gốc: TOÀN BỘ phần tính toán nằm THẲNG trong
 * `app/(admin)/admin/leads/bao-cao-chuyen/page.tsx` — không có hàm dùng chung
 * nào ở `lib/` để gọi lại. Đã soi `lib/crm/transfer-validate.ts` (chỉ kiểm
 * cơ sở đích hợp lệ lúc CHUYỂN, không đọc báo cáo) và `lib/crm/handover.ts`
 * (thao tác chuyển từng lead) — không cái nào đọc `LeadTransfer` theo tháng.
 *
 * Chủ dự án chốt 04/09/2026: màn site Sale **tách bản riêng** để thiết kế lại
 * mà **không đụng một pixel nào** của khu quản trị. Rủi ro trôi lệch đã được nêu
 * và chủ dự án vẫn chọn đường này ⇒ tệp này là **nợ trôi lệch có ghi sổ**.
 *
 * ⚠️ Sửa điều kiện `where`, trần `take: 500`, cách gộp hướng chuyển, hay định
 *    nghĩa "đã chốt" ở trang admin mà quên tệp này ⇒ hai báo cáo cùng tên cho
 *    hai con số khác nhau, và không có gì báo.
 *
 * ── DÙNG LẠI ĐƯỢC, KHÔNG CHÉP ───────────────────────────────────────────────
 * `CONVERTED_STATUSES` (`lib/leads/status.ts`) · `maskLeadPiiFields`
 * (`lib/lead/pii.ts`) · `scopedDb` / `getModelVisibleCenterIds` /
 * `logScopeBypass` (`lib/db-scope.ts`). Ba thứ này là LUẬT, không phải giao
 * diện — nhân bản chúng là tự tạo hai luật.
 *
 * ── CÁCH LY CƠ SỞ (chép nguyên, kể cả nhánh bypass) ─────────────────────────
 * `LeadTransfer` KHÔNG ∈ `SCOPED_MODELS` (có `from/toCenterId`, không một
 * `centerId` trực tiếp) → `scopedDb` không auto-scope. Scope THỦ CÔNG theo tầm
 * nhìn cơ sở của model `Lead`.
 *
 * Lead chuyển ĐI nay thuộc cơ sở khác → `sdb.lead` sẽ ẩn, trong khi báo cáo cần
 * thấy kết quả "đã chốt" của lead mình chuyển đi ⇒ bypass HẸP cho đúng MỘT truy
 * vấn (select tối thiểu, khoá lấy từ transfer ĐÃ scope) + ghi audit bypass
 * (AC10). Bỏ `logScopeBypass` là mất dấu vết của lần đọc vượt phạm vi duy nhất
 * trong màn này.
 *
 * ── PII ─────────────────────────────────────────────────────────────────────
 * Che ở ĐÂY, trên máy chủ, ngay khi dựng bảng tra — không phải lúc vẽ. Cổng vào
 * màn này là `leads:view-all`, mà Quản lý cơ sở KHÔNG còn `leads:view-pii` từ
 * Q9. Che ở JSX thì SĐT thật vẫn đi trọn vẹn xuống trình duyệt trong payload
 * RSC. Bản admin của màn này cũng đã che đúng chỗ — giữ nguyên nếp đó.
 */
import type { Prisma } from "@prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { getModelVisibleCenterIds, logScopeBypass, scopedDb } from "@/lib/db-scope";
import { maskLeadPiiFields } from "@/lib/lead/pii";
import { CONVERTED_STATUSES } from "@/lib/leads/status";

/** Trần số bản ghi — giữ nguyên `take: 500` của bản admin. */
const TRAN_DONG = 500;

/** Số hướng chuyển được bày lên dải số liệu — giữ nguyên `slice(0, 2)`. */
const SO_HUONG_BAY = 2;

export type DongChuyenLead = {
  id: string;
  leadId: string;
  /** Đã che sẵn nếu người xem thiếu `leads:view-pii`. */
  tenPhuHuynh: string;
  /** Đã che sẵn nếu người xem thiếu `leads:view-pii`. Chuỗi rỗng = không có số. */
  sdt: string;
  tuCoSo: string;
  denCoSo: string;
  nguoiChuyen: string;
  lyDo: string;
  daChot: boolean;
  ngayTao: string;
};

export type BaoCaoChuyenLead = {
  /** `YYYY-MM` đã chuẩn hoá — tham số lạ trên URL rơi về tháng hiện tại. */
  thang: string;
  /** Người xem thấy toàn hệ thống hay chỉ lead vào/ra cơ sở của mình. */
  toanHeThong: boolean;
  dong: DongChuyenLead[];
  tong: number;
  soDaChot: number;
  /** Tối đa hai hướng chuyển đông nhất, dạng `[nhãn, số lượt]`. */
  huongDongNhat: Array<[string, number]>;
  /** `YYYY-MM` của tháng liền trước / liền sau — cho hai nút điều hướng. */
  thangTruoc: string;
  thangSau: string;
};

/** `YYYY-MM` của một mốc thời gian. */
function maThang(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Đọc tham số `month` trên URL. Giá trị lạ → tháng hiện tại (fail-safe: gõ sai
 * URL không bao giờ mở rộng phạm vi dữ liệu).
 */
export function docThang(thamSo: string | undefined): string {
  if (thamSo && /^\d{4}-\d{2}$/.test(thamSo)) return thamSo;
  return maThang(new Date());
}

export async function layBaoCaoChuyenLead({
  actor,
  thamSoThang,
  hienPii,
}: {
  actor: Actor;
  thamSoThang: string | undefined;
  /** Người xem có `leads:view-pii` không — quyết định che tên/SĐT ngay tại đây. */
  hienPii: boolean;
}): Promise<BaoCaoChuyenLead> {
  const sdb = scopedDb(actor);
  const coSoThayDuoc = getModelVisibleCenterIds("Lead", actor);
  const toanHeThong = coSoThayDuoc === "ALL";

  const thang = docThang(thamSoThang);
  const nam = Number(thang.slice(0, 4));
  const chiSoThang = Number(thang.slice(5, 7)) - 1;
  const dauThang = new Date(nam, chiSoThang, 1);
  const cuoiThang = new Date(nam, chiSoThang + 1, 1);

  // Chỉ chuyển LIÊN CƠ SỞ (from != to, đều có giá trị).
  const where: Prisma.LeadTransferWhereInput = {
    createdAt: { gte: dauThang, lt: cuoiThang },
    fromCenterId: { not: null },
    toCenterId: { not: null },
    ...(coSoThayDuoc === "ALL"
      ? {}
      : {
          OR: [
            { fromCenterId: { in: coSoThayDuoc } },
            { toCenterId: { in: coSoThayDuoc } },
          ],
        }),
  };

  const thoRaw = await sdb.leadTransfer.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: TRAN_DONG,
  });
  // Loại bản ghi from == to (phòng khi DB field-compare không khả dụng).
  const tho = thoRaw.filter((t) => t.fromCenterId !== t.toCenterId);

  const maCoSo = [
    ...new Set(
      tho.flatMap((t) =>
        [t.fromCenterId, t.toCenterId].filter((x): x is string => !!x),
      ),
    ),
  ];
  const maLead = [...new Set(tho.map((t) => t.leadId))];

  const docLeadDb = toanHeThong ? sdb : scopedDb(actor, { bypass: true });
  if (!toanHeThong && maLead.length) {
    await logScopeBypass(
      actor,
      "sale/chuyen-lead-lien-cs: đọc tên/trạng thái lead đã chuyển đi khỏi cơ sở (báo cáo liên cơ sở)",
    );
  }

  const [coSo, lead] = await Promise.all([
    maCoSo.length
      ? sdb.center.findMany({
          where: { id: { in: maCoSo } },
          select: { id: true, name: true, code: true },
        })
      : Promise.resolve([]),
    maLead.length
      ? docLeadDb.lead.findMany({
          where: { id: { in: maLead } },
          select: { id: true, parentName: true, phone: true, status: true },
        })
      : Promise.resolve([]),
  ]);

  const bangCoSo = new Map(coSo.map((c) => [c.id, c]));
  const bangLead = new Map(
    lead.map((l) => [l.id, maskLeadPiiFields(l, hienPii)] as const),
  );

  const nhanCoSo = (id: string | null) =>
    bangCoSo.get(id ?? "")?.code ?? bangCoSo.get(id ?? "")?.name ?? "—";

  const dong: DongChuyenLead[] = tho.map((t) => {
    const l = bangLead.get(t.leadId);
    return {
      id: t.id,
      leadId: t.leadId,
      tenPhuHuynh: l?.parentName ?? "(đã xoá)",
      sdt: l?.phone ?? "",
      tuCoSo: nhanCoSo(t.fromCenterId),
      denCoSo: nhanCoSo(t.toCenterId),
      nguoiChuyen: t.transferredByName,
      lyDo: t.reason ?? t.note,
      daChot: l ? CONVERTED_STATUSES.has(l.status) : false,
      ngayTao: t.createdAt.toISOString(),
    };
  });

  // Thống kê theo HƯỚNG chuyển — không hardcode CS1/CS2 (CS3/CS4 tự gộp).
  const demHuong = new Map<string, number>();
  for (const r of dong) {
    if (r.tuCoSo === "—" || r.denCoSo === "—" || r.tuCoSo === r.denCoSo) continue;
    const khoa = `${r.tuCoSo} → ${r.denCoSo}`;
    demHuong.set(khoa, (demHuong.get(khoa) ?? 0) + 1);
  }
  const huongDongNhat = [...demHuong.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, SO_HUONG_BAY);

  return {
    thang,
    toanHeThong,
    dong,
    tong: dong.length,
    soDaChot: dong.filter((r) => r.daChot).length,
    huongDongNhat,
    thangTruoc: maThang(new Date(nam, chiSoThang - 1, 1)),
    thangSau: maThang(new Date(nam, chiSoThang + 1, 1)),
  };
}
