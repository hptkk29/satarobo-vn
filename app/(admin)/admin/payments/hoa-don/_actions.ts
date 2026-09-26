"use server";

// Màn kế toán Hoá đơn điện tử — server action (docs/ke-toan-hoa-don/PLAN.md §4, §6).
//
// GĐ 3: TẢI TỆP LÊN HAI BƯỚC — (1) ký URL PUT vào bucket riêng, trình duyệt PUT thẳng R2; (2) xác
// minh tệp (cỡ thật, vân tay, sha256). Chưa ghi DB gì: tạo hoá đơn NHÁP là việc của GĐ 5, và action
// đó sẽ xác minh LẠI (khoá đến từ trình duyệt, không tin kết quả của lượt trước).
//
// ⚠️ Tệp 'use server' CHỈ export async function (export const/type làm hỏng Server Action lúc chạy
// mà `pnpm build` vẫn xanh — memory 'use server' export rule).

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
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
  MIME_TEP,
  TRAN_CO_TEP,
} from "@/lib/finance/hoa-don/kho-tep";

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
  | { ok: true; userId: string; order: { id: string; centerId: string; orgUnitId: string | null; centerCode: string } }
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
