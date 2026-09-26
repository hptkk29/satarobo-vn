"use server";

// Màn kế toán Hoá đơn điện tử — server action (docs/ke-toan-hoa-don/PLAN.md §4, §6).
//
// GĐ 3: TẢI TỆP LÊN HAI BƯỚC — (1) ký URL PUT vào bucket riêng, trình duyệt PUT thẳng R2; (2) xác
// minh tệp (cỡ thật, vân tay, sha256).
// GĐ 4: ghi BẢNG HOÁ ĐƠN — lưu nháp (④) · không xuất · sửa nháp · gỡ. KHÔNG chạm sổ tiền; xác nhận
// (⑤ — cấp RCP) là GĐ 5. Lưu nháp xác minh LẠI tệp (khoá đến từ trình duyệt, không tin lượt trước),
// và dựng lại lần thu bằng CHÍNH loader của màn — tập khoản + số ròng không đến từ client.
//
// ⚠️ Tệp 'use server' CHỈ export async function (export const/type làm hỏng Server Action lúc chạy
// mà `pnpm build` vẫn xanh — memory 'use server' export rule).

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor, type Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { rateLimit } from "@/lib/rate-limit";
import { laHoaDonBat } from "@/lib/finance/hoa-don/feature";
import { coQuyenKeToanTaiCoSo } from "@/lib/finance/hoa-don/quyen";
import {
  khoHoaDonDaCauHinh,
  khoaTepHoaDon,
  khoaThuocDon,
  kyUrlTaiLenHoaDon,
  xacMinhTepHoaDon,
  xoaTepHoaDon,
  MIME_TEP,
  TRAN_CO_TEP,
  type LoaiTep,
} from "@/lib/finance/hoa-don/kho-tep";
import { napHangChoHoaDon } from "@/lib/finance/hoa-don/hang-cho";
import type { DongHangCho } from "@/lib/finance/hoa-don/dong-hang-cho";
import { kiemOSoHoaDon, tenTepSach } from "@/lib/finance/hoa-don/o-so-hoa-don";
import { CAU_HINH_HOA_DON_MAC_DINH, phapNhanChoDon } from "@/lib/finance/hoa-don/phap-nhan";
import {
  capNhatHoaDonNhap,
  goHoaDonChuaChot,
  taoHoaDonChoLanThu,
  thongDiepLoiGhiHoaDon,
  type TepMoi,
} from "@/lib/finance/hoa-don/ghi-hoa-don";

/** URL PUT sống 5 phút — đủ để trình duyệt tải một tệp ≤ 10 MB lên. */
const TTL_PUT_GIAY = 300;

type KetQua<T> = { ok: true; data: T } | { ok: false; error: string };

const LOAI = z.enum(["pdf", "xml"]);

/**
 * Cổng chung của MỌI thao tác kế toán trên một đơn. Wrapper cục bộ MỘT cấp, cùng tệp — lint
 * `require-can-in-write-action` không tính wrapper import từ tệp khác.
 *
 *   cờ → đăng nhập → `payments:confirm` (trần) → đơn trong tầm nhìn (scopedDb) → là KẾ TOÁN của
 *   ĐÚNG cơ sở giữ đơn (tập cơ sở theo quyền — PLAN §9) → cơ sở có mã (khoá tệp cần mã).
 *
 * Mọi nhánh từ chối vì phạm vi đều nói "Không tìm thấy đơn hàng" — không phân biệt "không có" với
 * "không thuộc cơ sở bạn".
 */
async function congKeToanDon(orderId: string): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      userId: string;
      userName: string;
      actor: Actor;
      order: { id: string; centerId: string; orgUnitId: string | null; centerCode: string };
    }
> {
  if (!(await laHoaDonBat())) return { ok: false, error: "Màn hoá đơn điện tử chưa được bật" };
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("payments:confirm"))) {
    return { ok: false, error: "Không có quyền — cần quyền xác nhận khoản thu (payments:confirm)" };
  }
  const actor = await resolveActor(session.user.id);
  const order = await scopedDb(actor).order.findUnique({
    where: { id: orderId },
    select: { id: true, centerId: true, orgUnitId: true, center: { select: { code: true } } },
  });
  if (!order || !order.centerId || !coQuyenKeToanTaiCoSo(actor, order.centerId)) {
    return { ok: false, error: "Không tìm thấy đơn hàng" };
  }
  const centerCode = order.center?.code?.trim();
  if (!centerCode) return { ok: false, error: "Cơ sở của đơn chưa có mã — báo quản trị hệ thống" };
  return {
    ok: true,
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? session.user.id,
    actor,
    order: { id: order.id, centerId: order.centerId, orgUnitId: order.orgUnitId, centerCode },
  };
}

const kySchema = z.object({ orderId: z.string().min(1).max(64), loai: LOAI });

/** Bước 1 — ký URL PUT. Trả khoá tệp (giữ lại cho bước 2) + mime trình duyệt PHẢI gửi. */
export async function kyTaiLenHoaDonAction(
  input: unknown,
): Promise<KetQua<{ khoa: string; url: string; contentType: string; tranCo: number; hetHanGiay: number }>> {
  const p = kySchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Yêu cầu không hợp lệ" };

  const cong = await congKeToanDon(p.data.orderId);
  if (!cong.ok) return cong;

  const gioiHan = await rateLimit({ key: `hoa-don-tep:${cong.userId}`, max: 60, windowMs: 60 * 60 * 1000 });
  if (!gioiHan.success) return { ok: false, error: "Tải lên quá nhiều lần — thử lại sau ít phút" };

  if (!khoHoaDonDaCauHinh()) return { ok: false, error: "Kho lưu hoá đơn chưa cấu hình — báo người vận hành" };

  const khoa = khoaTepHoaDon({
    centerCode: cong.order.centerCode,
    orderId: cong.order.id,
    loai: p.data.loai,
    nam: new Date().getUTCFullYear(),
    uuid: randomUUID(),
  });
  const contentType = MIME_TEP[p.data.loai];
  const url = await kyUrlTaiLenHoaDon(khoa, contentType, TTL_PUT_GIAY);
  return {
    ok: true,
    data: { khoa, url, contentType, tranCo: TRAN_CO_TEP[p.data.loai], hetHanGiay: TTL_PUT_GIAY },
  };
}

const xacMinhSchema = z.object({ orderId: z.string().min(1).max(64), loai: LOAI, khoa: z.string().min(1).max(300) });

/** Bước 2 — xác minh tệp trình duyệt vừa PUT. Tệp sai loại / quá cỡ bị DỌN khỏi kho. */
export async function xacMinhTepHoaDonAction(
  input: unknown,
): Promise<KetQua<{ khoa: string; co: number; sha256: string }>> {
  const p = xacMinhSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Yêu cầu không hợp lệ" };

  const cong = await congKeToanDon(p.data.orderId);
  if (!cong.ok) return cong;

  // Khoá đến từ trình duyệt: phải nằm dưới ĐÚNG đơn + cơ sở, và đuôi khớp loại khai.
  if (!khoaThuocDon(p.data.khoa, cong.order.centerCode, cong.order.id) || !p.data.khoa.endsWith(`.${p.data.loai}`)) {
    return { ok: false, error: "Tệp không thuộc đơn này" };
  }
  if (!khoHoaDonDaCauHinh()) return { ok: false, error: "Kho lưu hoá đơn chưa cấu hình — báo người vận hành" };

  const kq = await xacMinhTepHoaDon({ khoa: p.data.khoa, loai: p.data.loai });
  if (!kq.ok) return { ok: false, error: kq.thongDiep };
  return { ok: true, data: { khoa: p.data.khoa, co: kq.co, sha256: kq.sha256 } };
}

// ─── GĐ 4 — ghi bảng hoá đơn ──────────────────────────────────────────────────────────────────

/** Ngày hôm nay theo lịch VN (UTC+7, không giờ mùa hè) — mốc chặn ngày phát hành ở tương lai. */
function homNayVn(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

/** Dựng lại DÒNG của lần thu bằng loader của màn — nguồn duy nhất của tập khoản + số ròng. */
async function dongCuaLanThu(actor: Actor, orderId: string, lanThuKey: string): Promise<DongHangCho | null> {
  const { dong } = await napHangChoHoaDon(actor, { canViewPii: true, orderId });
  return dong.find((d) => d.key === lanThuKey && d.orderId === orderId) ?? null;
}

/** Xác minh LẠI một tệp trình duyệt khai đã PUT — thuộc đúng đơn, đúng đuôi, đúng byte. */
async function tepDaXacMinh(
  order: { id: string; centerCode: string },
  loai: LoaiTep,
  tep: { khoa: string; ten: string },
): Promise<{ ok: true; tep: TepMoi } | { ok: false; error: string }> {
  if (!khoaThuocDon(tep.khoa, order.centerCode, order.id) || !tep.khoa.endsWith(`.${loai}`)) {
    return { ok: false, error: "Tệp không thuộc đơn này" };
  }
  const kq = await xacMinhTepHoaDon({ khoa: tep.khoa, loai });
  if (!kq.ok) return { ok: false, error: kq.thongDiep };
  return { ok: true, tep: { khoa: tep.khoa, ten: tenTepSach(tep.ten, loai), co: kq.co, sha256: kq.sha256 } };
}

/** Dọn tệp bị thay / gỡ SAU khi commit — lỗi dọn không làm hỏng thao tác đã ghi (tệp mồ côi vô hại). */
async function donTep(khoa: readonly string[]): Promise<void> {
  await Promise.allSettled(khoa.map((k) => xoaTepHoaDon(k)));
}

function lamMoi(orderId: string): void {
  revalidatePath("/payments/hoa-don");
  revalidatePath(`/orders/${orderId}`);
}

/** Lỗi nghiệp vụ đã biết của tầng ghi ⇒ câu cho người dùng; lỗi lạ ném tiếp. */
async function chayGhi<T>(f: () => Promise<T>): Promise<KetQua<T>> {
  try {
    return { ok: true, data: await f() };
  } catch (e) {
    const tb = thongDiepLoiGhiHoaDon(e);
    if (tb) return { ok: false, error: tb };
    throw e;
  }
}

const TEP_KHAI = z.object({ khoa: z.string().min(1).max(300), ten: z.string().max(300) });
const luuSchema = z.object({
  orderId: z.string().min(1).max(64),
  lanThuKey: z.string().min(1).max(512),
  /** Có ⇒ SỬA bản nháp đang có; không ⇒ TẠO bản nháp (bắt buộc có PDF). */
  hoaDonId: z.string().min(1).max(64).optional(),
  pdf: TEP_KHAI.optional(),
  /** `null` = gỡ XML đang có (chỉ khi sửa). */
  xml: TEP_KHAI.nullable().optional(),
  kyHieu: z.string().max(20).optional(),
  soHoaDon: z.string().max(20).optional(),
  ngayPhatHanh: z.string().max(10).optional(),
  guiEmailKhach: z.boolean(),
});

/** ④ — lưu hoá đơn NHÁP cho một lần thu (tạo mới, hoặc sửa bản nháp đang có). */
export async function luuHoaDonNhapAction(input: unknown): Promise<KetQua<{ hoaDonId: string }>> {
  const p = luuSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Yêu cầu không hợp lệ" };
  const v = p.data;

  const cong = await congKeToanDon(v.orderId);
  if (!cong.ok) return cong;
  if (!khoHoaDonDaCauHinh()) return { ok: false, error: "Kho lưu hoá đơn chưa cấu hình — báo người vận hành" };

  const o = kiemOSoHoaDon(v, homNayVn());
  if (!o.ok) return o;

  const row = await dongCuaLanThu(cong.actor, v.orderId, v.lanThuKey);
  if (!row) return { ok: false, error: "Lần thu vừa thay đổi — tải lại màn" };

  if (v.hoaDonId) {
    if (row.ngan !== "nhap" || row.hoaDonNhap?.id !== v.hoaDonId) {
      return { ok: false, error: "Hoá đơn vừa bị người khác sửa hoặc gỡ — tải lại màn" };
    }
  } else {
    if (row.hoaDonNhap || (row.ngan !== "cho" && row.ngan !== "lech")) {
      return { ok: false, error: "Lần thu này đã có hoá đơn — tải lại màn" };
    }
    if (!row.hanhDong.taiLen.bat) return { ok: false, error: row.hanhDong.taiLen.lyDo ?? "Chưa tải lên được" };
    if (!v.pdf) return { ok: false, error: "Chọn tệp PDF hoá đơn" };
  }

  const pdf = v.pdf ? await tepDaXacMinh(cong.order, "pdf", v.pdf) : null;
  if (pdf && !pdf.ok) return pdf;
  const xml = v.xml ? await tepDaXacMinh(cong.order, "xml", v.xml) : null;
  if (xml && !xml.ok) return xml;

  const nguoiGhi = { id: cong.userId, name: cong.userName };
  if (v.hoaDonId) {
    const hoaDonId = v.hoaDonId;
    const kq = await chayGhi(() =>
      capNhatHoaDonNhap({
        nguoiGhi,
        orderId: v.orderId,
        hoaDonId,
        so: o.data,
        guiEmailKhach: v.guiEmailKhach,
        pdf: pdf?.tep,
        xml: v.xml === null ? null : xml?.tep,
      }),
    );
    if (!kq.ok) return kq;
    await donTep(kq.data.tepCanXoa);
    lamMoi(v.orderId);
    return { ok: true, data: { hoaDonId } };
  }

  if (!pdf) return { ok: false, error: "Chọn tệp PDF hoá đơn" };
  const phapNhan = phapNhanChoDon(cong.order.centerCode, CAU_HINH_HOA_DON_MAC_DINH);
  if (!phapNhan) return { ok: false, error: "Chưa khai pháp nhân phát hành trong Cấu hình hoá đơn" };
  const kq = await chayGhi(() =>
    taoHoaDonChoLanThu({
      nguoiGhi,
      orderId: v.orderId,
      centerId: cong.order.centerId,
      lanThuKey: row.key,
      khoan: row.khoan,
      loai: {
        trangThai: "NHAP",
        phapNhan,
        so: o.data,
        guiEmailKhach: v.guiEmailKhach,
        pdf: pdf.tep,
        xml: xml?.tep ?? null,
      },
    }),
  );
  if (!kq.ok) return kq;
  lamMoi(v.orderId);
  return { ok: true, data: { hoaDonId: kq.data.id } };
}

const LY_DO_KHONG_XUAT = ["Đã xuất ngoài hệ thống", "Khách không lấy hoá đơn"];
const khongXuatSchema = z.object({
  orderId: z.string().min(1).max(64),
  lanThuKey: z.string().min(1).max(512),
  lyDo: z.string().trim().min(1).max(300),
  /** Chọn "Khác…" ⇒ ghi chú bắt buộc (≥ 5 ký tự). */
  ghiChu: z.string().trim().max(300).optional(),
});

/** Đánh dấu KHÔNG XUẤT hoá đơn cho một lần thu (kèm lý do) — khoản rời hàng chờ, không có tệp. */
export async function khongXuatHoaDonAction(input: unknown): Promise<KetQua<{ hoaDonId: string }>> {
  const p = khongXuatSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Yêu cầu không hợp lệ" };
  const v = p.data;
  const lyDo = LY_DO_KHONG_XUAT.includes(v.lyDo)
    ? v.lyDo
    : v.ghiChu && v.ghiChu.length >= 5
      ? `Khác: ${v.ghiChu}`
      : null;
  if (!lyDo) return { ok: false, error: "Ghi rõ lý do không xuất (ít nhất 5 ký tự)" };

  const cong = await congKeToanDon(v.orderId);
  if (!cong.ok) return cong;
  const row = await dongCuaLanThu(cong.actor, v.orderId, v.lanThuKey);
  if (!row || row.hoaDonNhap || !["cho", "lech", "don-huy"].includes(row.ngan)) {
    return { ok: false, error: "Lần thu vừa thay đổi — tải lại màn" };
  }
  if (!row.hanhDong.khongXuat) return { ok: false, error: "Không đánh dấu được lần thu này" };

  const kq = await chayGhi(() =>
    taoHoaDonChoLanThu({
      nguoiGhi: { id: cong.userId, name: cong.userName },
      orderId: v.orderId,
      centerId: cong.order.centerId,
      lanThuKey: row.key,
      khoan: row.khoan,
      loai: { trangThai: "KHONG_XUAT", lyDo },
    }),
  );
  if (!kq.ok) return kq;
  lamMoi(v.orderId);
  return { ok: true, data: { hoaDonId: kq.data.id } };
}

const goSchema = z.object({ orderId: z.string().min(1).max(64), hoaDonId: z.string().min(1).max(64) });

/** Gỡ bản NHÁP (tải nhầm) hoặc gỡ dấu KHÔNG XUẤT — lần thu về lại hàng chờ. */
export async function goHoaDonAction(input: unknown): Promise<KetQua<{ hoaDonId: string }>> {
  const p = goSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Yêu cầu không hợp lệ" };
  const cong = await congKeToanDon(p.data.orderId);
  if (!cong.ok) return cong;
  const kq = await chayGhi(() =>
    goHoaDonChuaChot({ nguoiGhi: { id: cong.userId, name: cong.userName }, orderId: p.data.orderId, hoaDonId: p.data.hoaDonId }),
  );
  if (!kq.ok) return kq;
  await donTep(kq.data.tepCanXoa);
  lamMoi(p.data.orderId);
  return { ok: true, data: { hoaDonId: p.data.hoaDonId } };
}
