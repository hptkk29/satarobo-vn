"use server";
// Server Action của màn Cổng dữ liệu agent (tài liệu CEO 25/09/2026 §4.5, §5.3, §5.5).
//
// Khuôn mỗi action (luật cứng Nền Hệ thống #1 — kiểm quyền NGAY trong thân, không bọc):
//   1. auth()  2. assertPermission / assertAnyPermission  3. zod  4. mã 2FA (thao tác cấp
//   quyền)  5. gọi `lib/agents/quan-tri` — nơi ép luật nghiệp vụ (tự duyệt, hạn, trạng thái,
//   audit).
//
// Ai làm gì (spec §4.5):
//   manage (Kỹ thuật)  : tạo client/grant, sinh/xoay mật khẩu            — cần 2FA
//   approve (Giám đốc) : duyệt/từ chối, mở khoá, bật cổng, đặt lại 2FA    — cần 2FA
//   manage HOẶC approve: khoá, thu hồi, TẮT cổng                          — KHÔNG đòi 2FA:
//                        thao tác khẩn cấp phải làm được ngay cả khi người đó quên điện thoại
//                        (Phụ lục C: "thu hồi trước, điều tra sau").
import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { auth } from "@/lib/auth";
import { assertAnyPermission, assertPermission } from "@/lib/auth/check-permission";
import { batDauCaiHaiLop, kiemMaHaiLop, LoiHaiLop, thongDiepKiemMa, xoaHaiLop } from "@/lib/auth/hai-lop";
import { writeAudit } from "@/lib/audit/audit-log";
import { LoiQuanTri, type NguoiThaoTac } from "@/lib/agents/quan-tri/chung";
import {
  khoaClient,
  moKhoaClient,
  quyetDinhClient,
  sinhMatKhau,
  taoClient,
  thuHoiClient,
} from "@/lib/agents/quan-tri/client";
import { quyetDinhGrant, taoGrant, thuHoiGrant } from "@/lib/agents/quan-tri/grant";
import { datCongTac } from "@/lib/agents/quan-tri/cong-tac";
import {
  congTacSchema,
  datLaiHaiLopSchema,
  maXacThuc,
  quyetDinhSchema,
  sinhMatKhauSchema,
  taoClientSchema,
  taoGrantSchema,
  thaoTacClientSchema,
  thaoTacCoMaSchema,
} from "@/lib/validators/agent-gateway";

type KetQua<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const DUONG_DAN = "/admin/cong-du-lieu-agent";
const KHONG_QUYEN = "Bạn không có quyền thực hiện thao tác này.";

function nguoiTu(user: { id: string; name?: string | null; email?: string | null }): NguoiThaoTac {
  return { userId: user.id, ten: user.name ?? user.email ?? user.id };
}

function loiZod(issues: readonly { message: string }[]): KetQua<never> {
  return { ok: false, error: issues[0]?.message ?? "Dữ liệu không hợp lệ." };
}

/** Lỗi nghiệp vụ → câu cho người dùng; lỗi lạ → câu chung (không lộ chi tiết kỹ thuật). */
function dichLoi(e: unknown): KetQua<never> {
  if (e instanceof LoiQuanTri || e instanceof LoiHaiLop) return { ok: false, error: e.message };
  console.error("[agent-gateway] action lỗi", e instanceof Error ? e.name : "?");
  return { ok: false, error: "Có lỗi khi xử lý — thử lại, hoặc báo kỹ thuật." };
}

async function kiemMa(userId: string, ma: string): Promise<string | null> {
  const kq = await kiemMaHaiLop(userId, ma, new Date());
  return kq === "OK" ? null : thongDiepKiemMa(kq);
}

// ─── Client ────────────────────────────────────────────────────────────────────────
export async function taoClientAction(input: unknown): Promise<KetQua<{ id: string }>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập." };
  try {
    await assertPermission("agent_gateway:manage");
  } catch {
    return { ok: false, error: KHONG_QUYEN };
  }
  const p = taoClientSchema.safeParse(input);
  if (!p.success) return loiZod(p.error.issues);
  try {
    const loiMa = await kiemMa(session.user.id, p.data.maXacThuc);
    if (loiMa) return { ok: false, error: loiMa };
    const r = await taoClient(nguoiTu(session.user), p.data, new Date());
    revalidatePath(DUONG_DAN);
    return { ok: true, data: r };
  } catch (e) {
    return dichLoi(e);
  }
}

export async function quyetDinhClientAction(input: unknown): Promise<KetQua> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập." };
  try {
    await assertPermission("agent_gateway:approve");
  } catch {
    return { ok: false, error: KHONG_QUYEN };
  }
  const p = quyetDinhSchema.safeParse(input);
  if (!p.success) return loiZod(p.error.issues);
  try {
    const loiMa = await kiemMa(session.user.id, p.data.maXacThuc);
    if (loiMa) return { ok: false, error: loiMa };
    await quyetDinhClient(nguoiTu(session.user), p.data, new Date());
    revalidatePath(DUONG_DAN);
    return { ok: true, data: undefined };
  } catch (e) {
    return dichLoi(e);
  }
}

/** Trả mật khẩu bản rõ ĐÚNG MỘT LẦN. Giao diện không được lưu nó vào đâu cả. */
export async function sinhMatKhauAction(input: unknown): Promise<KetQua<{ matKhau: string; hetHan: string }>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập." };
  try {
    await assertPermission("agent_gateway:manage");
  } catch {
    return { ok: false, error: KHONG_QUYEN };
  }
  const p = sinhMatKhauSchema.safeParse(input);
  if (!p.success) return loiZod(p.error.issues);
  try {
    const loiMa = await kiemMa(session.user.id, p.data.maXacThuc);
    if (loiMa) return { ok: false, error: loiMa };
    const r = await sinhMatKhau(nguoiTu(session.user), p.data, new Date());
    revalidatePath(DUONG_DAN);
    return { ok: true, data: { matKhau: r.matKhau, hetHan: r.hetHan.toISOString() } };
  } catch (e) {
    return dichLoi(e);
  }
}

export async function khoaClientAction(input: unknown): Promise<KetQua> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập." };
  try {
    await assertAnyPermission(["agent_gateway:manage", "agent_gateway:approve"]);
  } catch {
    return { ok: false, error: KHONG_QUYEN };
  }
  const p = thaoTacClientSchema.safeParse(input);
  if (!p.success) return loiZod(p.error.issues);
  try {
    await khoaClient(nguoiTu(session.user), p.data, new Date());
    revalidatePath(DUONG_DAN);
    return { ok: true, data: undefined };
  } catch (e) {
    return dichLoi(e);
  }
}

export async function moKhoaClientAction(input: unknown): Promise<KetQua> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập." };
  try {
    await assertPermission("agent_gateway:approve");
  } catch {
    return { ok: false, error: KHONG_QUYEN };
  }
  const p = thaoTacCoMaSchema.safeParse(input);
  if (!p.success) return loiZod(p.error.issues);
  try {
    const loiMa = await kiemMa(session.user.id, p.data.maXacThuc);
    if (loiMa) return { ok: false, error: loiMa };
    await moKhoaClient(nguoiTu(session.user), p.data, new Date());
    revalidatePath(DUONG_DAN);
    return { ok: true, data: undefined };
  } catch (e) {
    return dichLoi(e);
  }
}

export async function thuHoiClientAction(input: unknown): Promise<KetQua> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập." };
  try {
    await assertAnyPermission(["agent_gateway:manage", "agent_gateway:approve"]);
  } catch {
    return { ok: false, error: KHONG_QUYEN };
  }
  const p = thaoTacClientSchema.safeParse(input);
  if (!p.success) return loiZod(p.error.issues);
  try {
    await thuHoiClient(nguoiTu(session.user), p.data, new Date());
    revalidatePath(DUONG_DAN);
    return { ok: true, data: undefined };
  } catch (e) {
    return dichLoi(e);
  }
}

// ─── Grant ─────────────────────────────────────────────────────────────────────────
export async function taoGrantAction(input: unknown): Promise<KetQua<{ id: string }>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập." };
  try {
    await assertPermission("agent_gateway:manage");
  } catch {
    return { ok: false, error: KHONG_QUYEN };
  }
  const p = taoGrantSchema.safeParse(input);
  if (!p.success) return loiZod(p.error.issues);
  try {
    const loiMa = await kiemMa(session.user.id, p.data.maXacThuc);
    if (loiMa) return { ok: false, error: loiMa };
    const r = await taoGrant(nguoiTu(session.user), p.data, new Date());
    revalidatePath(DUONG_DAN);
    return { ok: true, data: r };
  } catch (e) {
    return dichLoi(e);
  }
}

export async function quyetDinhGrantAction(input: unknown): Promise<KetQua> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập." };
  try {
    await assertPermission("agent_gateway:approve");
  } catch {
    return { ok: false, error: KHONG_QUYEN };
  }
  const p = quyetDinhSchema.safeParse(input);
  if (!p.success) return loiZod(p.error.issues);
  try {
    const loiMa = await kiemMa(session.user.id, p.data.maXacThuc);
    if (loiMa) return { ok: false, error: loiMa };
    await quyetDinhGrant(nguoiTu(session.user), p.data, new Date());
    revalidatePath(DUONG_DAN);
    return { ok: true, data: undefined };
  } catch (e) {
    return dichLoi(e);
  }
}

export async function thuHoiGrantAction(input: unknown): Promise<KetQua> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập." };
  try {
    await assertAnyPermission(["agent_gateway:manage", "agent_gateway:approve"]);
  } catch {
    return { ok: false, error: KHONG_QUYEN };
  }
  const p = thaoTacClientSchema.safeParse(input);
  if (!p.success) return loiZod(p.error.issues);
  try {
    await thuHoiGrant(nguoiTu(session.user), p.data, new Date());
    revalidatePath(DUONG_DAN);
    return { ok: true, data: undefined };
  } catch (e) {
    return dichLoi(e);
  }
}

// ─── Công tắc toàn cổng ────────────────────────────────────────────────────────────
export async function datCongTacAction(input: unknown): Promise<KetQua> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập." };
  const p = congTacSchema.safeParse(input);
  if (!p.success) return loiZod(p.error.issues);
  try {
    // BẬT = mở lại đường vào dữ liệu ⇒ chỉ người duyệt, có 2FA. TẮT = phanh khẩn cấp ⇒ ai
    // giữ quyền cổng cũng bấm được, không đòi mã.
    if (p.data.bat) await assertPermission("agent_gateway:approve");
    else await assertAnyPermission(["agent_gateway:manage", "agent_gateway:approve"]);
  } catch {
    return { ok: false, error: KHONG_QUYEN };
  }
  try {
    if (p.data.bat) {
      if (!p.data.maXacThuc) return { ok: false, error: "Bật cổng cần mã xác thực 2 lớp." };
      const loiMa = await kiemMa(session.user.id, p.data.maXacThuc);
      if (loiMa) return { ok: false, error: loiMa };
    }
    await datCongTac(nguoiTu(session.user), p.data);
    revalidatePath(DUONG_DAN);
    return { ok: true, data: undefined };
  } catch (e) {
    return dichLoi(e);
  }
}

// ─── Xác thực 2 lớp của chính mình ─────────────────────────────────────────────────
/** Sinh bí mật mới + mã QR. Chỉ người giữ quyền cổng mới cần (và mới được) cài ở đây. */
export async function batDauCaiHaiLopAction(): Promise<KetQua<{ biMat: string; qr: string }>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập." };
  try {
    await assertPermission("agent_gateway:view");
  } catch {
    return { ok: false, error: KHONG_QUYEN };
  }
  try {
    const taiKhoan = session.user.email ?? session.user.name ?? session.user.id;
    const r = await batDauCaiHaiLop(session.user.id, taiKhoan);
    const qr = await QRCode.toDataURL(r.uri, { margin: 1, width: 220 });
    return { ok: true, data: { biMat: r.biMat, qr } };
  } catch (e) {
    return dichLoi(e);
  }
}

export async function xacNhanCaiHaiLopAction(input: unknown): Promise<KetQua> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập." };
  try {
    await assertPermission("agent_gateway:view");
  } catch {
    return { ok: false, error: KHONG_QUYEN };
  }
  const p = maXacThuc.safeParse((input as { ma?: unknown } | null)?.ma);
  if (!p.success) return loiZod(p.error.issues);
  try {
    const kq = await kiemMaHaiLop(session.user.id, p.data, new Date(), "xac-nhan-cai");
    if (kq !== "OK") return { ok: false, error: kq === "CHUA_BAT" ? "Chưa bắt đầu cài — bấm “Bắt đầu cài” trước." : thongDiepKiemMa(kq) };
    await writeAudit({
      actor: { id: session.user.id, name: nguoiTu(session.user).ten },
      module: "agent-gateway",
      entityType: "UserTotp",
      entityId: session.user.id,
      action: "ENABLE_2FA",
    });
    revalidatePath(DUONG_DAN);
    return { ok: true, data: undefined };
  } catch (e) {
    return dichLoi(e);
  }
}

/** Đặt lại 2FA của NGƯỜI KHÁC (mất điện thoại) — người duyệt, có lý do, không tự đặt lại mình. */
export async function datLaiHaiLopAction(input: unknown): Promise<KetQua> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập." };
  try {
    await assertPermission("agent_gateway:approve");
  } catch {
    return { ok: false, error: KHONG_QUYEN };
  }
  const p = datLaiHaiLopSchema.safeParse(input);
  if (!p.success) return loiZod(p.error.issues);
  if (p.data.userId === session.user.id) {
    return { ok: false, error: "Không tự đặt lại xác thực 2 lớp của chính mình — nhờ người duyệt khác." };
  }
  try {
    const loiMa = await kiemMa(session.user.id, p.data.maXacThuc);
    if (loiMa) return { ok: false, error: loiMa };
    await xoaHaiLop(p.data.userId);
    await writeAudit({
      actor: { id: session.user.id, name: nguoiTu(session.user).ten },
      module: "agent-gateway",
      entityType: "UserTotp",
      entityId: p.data.userId,
      action: "RESET_2FA",
      reason: p.data.lyDo,
    });
    revalidatePath(DUONG_DAN);
    return { ok: true, data: undefined };
  } catch (e) {
    return dichLoi(e);
  }
}
