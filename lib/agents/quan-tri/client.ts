// lib/agents/quan-tri/client.ts — vòng đời "ứng dụng kết nối" (client) của agent (spec §4.5, §5.3).
//
//   tạo (PENDING, CHƯA có mật khẩu) → duyệt bởi người KHÁC (ACTIVE) → sinh mật khẩu (hiện 1 lần)
//   → xoay mật khẩu (cũ chồng tối đa 24 giờ) → khoá (SUSPENDED) ↔ mở khoá → thu hồi (REVOKED)
//
// Mỗi client có MỘT user dịch vụ riêng, mang một vai `AGENT_*` neo ở Hội sở. Quyền đọc dữ liệu
// nghiệp vụ của agent = quyền của vai đó ∩ grant — agent đi qua `can()` + `scopedDb` như người.
import { khoCong } from "../kho";
import { bamBiMat, docPepperCong, moiTruongHienTai, sinhMaClient, sinhMatKhauClient } from "../khoa";
import { chuanHoaIp } from "../gateway/ip";
import { moiTruongDb } from "../gateway/pipeline";
import {
  chanTuDuyet,
  ghiAudit,
  HAN_TOI_DA,
  kiemHan,
  LoiQuanTri,
  NGAY_MS,
  type NguoiThaoTac,
} from "./chung";

async function docClient(id: string) {
  const c = await khoCong.agentClient.findUnique({ where: { id } });
  if (!c) throw new LoiQuanTri("KHONG_TIM_THAY", "Không tìm thấy ứng dụng kết nối.");
  return c;
}

/**
 * Tạo client ở trạng thái CHỜ DUYỆT. Chưa sinh mật khẩu (spec §4.5: "duyệt xong mới sinh").
 *
 * User dịch vụ được tạo với isActive=false + DISABLED + không email/SĐT/mật khẩu:
 *   · `lib/auth.ts` chặn đăng nhập theo `isServiceAccount` — lớp chắc chắn;
 *   · isActive=false để nó không lọt vào danh sách chọn nhân sự/chia lead (cột `role` bắt buộc
 *     có giá trị, và mặc định là SALES_CSM).
 */
export async function taoClient(
  nguoi: NguoiThaoTac,
  input: { ten: string; ipDuocPhep: string[]; vaiDichVu: string; hetHan: Date; lyDo: string },
  now: Date,
): Promise<{ id: string }> {
  kiemHan(input.hetHan, now, HAN_TOI_DA.clientNgay, "ứng dụng kết nối");
  const ips: string[] = [];
  for (const raw of input.ipDuocPhep) {
    const ip = chuanHoaIp(raw);
    if (!ip) throw new LoiQuanTri("DU_LIEU_SAI", `IP không hợp lệ: ${raw.slice(0, 60)}`);
    if (!ips.includes(ip)) ips.push(ip);
  }
  if (ips.length === 0) throw new LoiQuanTri("DU_LIEU_SAI", "Cần ít nhất một IP được phép.");
  if (!input.vaiDichVu.startsWith("AGENT_")) {
    throw new LoiQuanTri("DU_LIEU_SAI", "Chỉ được gán vai dịch vụ (AGENT_…) cho agent.");
  }
  const [vai, hoiSo] = await Promise.all([
    khoCong.roleDef.findUnique({ where: { code: input.vaiDichVu }, select: { id: true, isActive: true } }),
    khoCong.orgUnit.findFirst({ where: { type: "HO", deletedAt: null, isActive: true }, select: { id: true } }),
  ]);
  if (!vai?.isActive) throw new LoiQuanTri("DU_LIEU_SAI", "Vai dịch vụ không tồn tại hoặc đã tắt.");
  if (!hoiSo) throw new LoiQuanTri("CHUA_CO_HOI_SO", "Chưa có đơn vị Hội sở (HO) trong cây tổ chức.");

  const id = sinhMaClient();
  const moiTruong = moiTruongDb(moiTruongHienTai());
  await khoCong.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        name: `Agent · ${input.ten}`,
        isServiceAccount: true,
        isActive: false,
        accountStatus: "DISABLED",
        roles: [],
      },
      select: { id: true },
    });
    await tx.userOrgRole.create({
      data: { userId: u.id, orgUnitId: hoiSo.id, roleId: vai.id, grantedById: nguoi.userId, effectiveFrom: now },
    });
    await tx.rbacAuditLog.create({
      data: {
        entity: "ASSIGNMENT",
        entityId: `${u.id}:${hoiSo.id}:${vai.id}`,
        action: "ASSIGN",
        changedByUserId: nguoi.userId,
        changedByName: nguoi.ten,
        newValues: { vai: input.vaiDichVu, orgUnit: "HO", agentClientId: id },
        reason: `Tạo user dịch vụ cho agent "${input.ten}": ${input.lyDo}`,
      },
    });
    await tx.agentClient.create({
      data: {
        id,
        name: input.ten,
        kind: "EXTERNAL",
        environment: moiTruong,
        serviceUserId: u.id,
        allowedIps: ips,
        status: "PENDING",
        reason: input.lyDo,
        expiresAt: input.hetHan,
        createdById: nguoi.userId,
      },
    });
    await ghiAudit(tx, nguoi, {
      entityType: "AgentClient",
      entityId: id,
      action: "CREATE",
      newValues: { ten: input.ten, ipDuocPhep: ips, vaiDichVu: input.vaiDichVu, moiTruong, hetHan: input.hetHan },
      lyDo: input.lyDo,
    });
  });
  return { id };
}

/** Duyệt / từ chối client đang chờ. Người duyệt PHẢI khác người tạo (ca B10). */
export async function quyetDinhClient(
  nguoi: NguoiThaoTac,
  input: { id: string; dongY: boolean; ghiChu?: string },
  now: Date,
): Promise<void> {
  const c = await docClient(input.id);
  chanTuDuyet(nguoi, c.createdById);
  if (c.status !== "PENDING") throw new LoiQuanTri("SAI_TRANG_THAI", "Ứng dụng này không còn ở trạng thái chờ duyệt.");
  if (input.dongY && c.expiresAt.getTime() <= now.getTime()) {
    throw new LoiQuanTri("HAN_KHONG_HOP_LE", "Ứng dụng đã quá hạn trước khi được duyệt — tạo lại.");
  }
  await khoCong.$transaction(async (tx) => {
    // Điều kiện trạng thái trong WHERE: hai người bấm cùng lúc thì đúng một người thắng.
    const up = await tx.agentClient.updateMany({
      where: { id: c.id, status: "PENDING" },
      data: {
        status: input.dongY ? "ACTIVE" : "REJECTED",
        decidedById: nguoi.userId,
        decidedAt: now,
        decisionNote: input.ghiChu ?? null,
      },
    });
    if (up.count !== 1) throw new LoiQuanTri("SAI_TRANG_THAI", "Ứng dụng vừa được người khác xử lý.");
    if (!input.dongY) {
      await tx.userOrgRole.updateMany({ where: { userId: c.serviceUserId }, data: { status: "SUSPENDED" } });
    }
    await ghiAudit(tx, nguoi, {
      entityType: "AgentClient",
      entityId: c.id,
      action: input.dongY ? "APPROVE" : "REJECT",
      newValues: { status: input.dongY ? "ACTIVE" : "REJECTED" },
      lyDo: input.ghiChu,
    });
  });
}

/**
 * Sinh mật khẩu client — hoặc XOAY nếu đã có. Trả bản rõ ĐÚNG MỘT LẦN; DB chỉ giữ bản băm.
 * Mật khẩu cũ còn sống được hạ hạn về tối đa 24 giờ (spec §4.5: chồng lấn để agent kịp đổi).
 */
export async function sinhMatKhau(
  nguoi: NguoiThaoTac,
  input: { id: string },
  now: Date,
): Promise<{ matKhau: string; hetHan: Date }> {
  const pepper = docPepperCong();
  if (!pepper) throw new LoiQuanTri("DU_LIEU_SAI", "Máy chủ chưa cấu hình AGENT_GATEWAY_PEPPER — không sinh được khoá.");
  const c = await docClient(input.id);
  if (c.status !== "ACTIVE") throw new LoiQuanTri("SAI_TRANG_THAI", "Chỉ sinh mật khẩu cho ứng dụng đã được duyệt và đang hoạt động.");
  if (c.expiresAt.getTime() <= now.getTime()) throw new LoiQuanTri("HAN_KHONG_HOP_LE", "Ứng dụng đã hết hạn.");
  if (moiTruongDb(moiTruongHienTai()) !== c.environment) {
    throw new LoiQuanTri("SAI_TRANG_THAI", "Ứng dụng thuộc môi trường khác — không sinh khoá ở đây.");
  }
  const matKhau = sinhMatKhauClient(c.environment === "LIVE" ? "live" : "test");
  const hetHan = new Date(Math.min(now.getTime() + HAN_TOI_DA.matKhauNgay * NGAY_MS, c.expiresAt.getTime()));
  const chongLan = new Date(now.getTime() + HAN_TOI_DA.chongLanXoayGio * 60 * 60 * 1000);
  await khoCong.$transaction(async (tx) => {
    const cu = await tx.agentClientSecret.updateMany({
      where: { clientId: c.id, revokedAt: null, expiresAt: { gt: chongLan } },
      data: { expiresAt: chongLan },
    });
    await tx.agentClientSecret.create({
      data: { clientId: c.id, secretHash: bamBiMat(matKhau, pepper), expiresAt: hetHan, createdById: nguoi.userId },
    });
    await ghiAudit(tx, nguoi, {
      entityType: "AgentClient",
      entityId: c.id,
      action: cu.count > 0 ? "ROTATE_SECRET" : "ISSUE_SECRET",
      newValues: { hetHan, soMatKhauCuHaHan: cu.count },
    });
  });
  return { matKhau, hetHan };
}

/** Khoá ngay (spec §4.5: một người làm được, không cần duyệt). Thu hồi mọi token đang sống. */
export async function khoaClient(nguoi: NguoiThaoTac, input: { id: string; lyDo: string }, now: Date): Promise<void> {
  const c = await docClient(input.id);
  await khoCong.$transaction(async (tx) => {
    const up = await tx.agentClient.updateMany({
      where: { id: c.id, status: "ACTIVE" },
      data: { status: "SUSPENDED", suspendedAt: now, suspendReason: input.lyDo },
    });
    if (up.count !== 1) throw new LoiQuanTri("SAI_TRANG_THAI", "Chỉ khoá được ứng dụng đang hoạt động.");
    await tx.agentAccessToken.updateMany({ where: { clientId: c.id, revokedAt: null }, data: { revokedAt: now } });
    await ghiAudit(tx, nguoi, { entityType: "AgentClient", entityId: c.id, action: "SUSPEND", lyDo: input.lyDo });
  });
}

/** Mở khoá — việc của người DUYỆT (spec §5.3), có lý do. */
export async function moKhoaClient(nguoi: NguoiThaoTac, input: { id: string; lyDo: string }, now: Date): Promise<void> {
  const c = await docClient(input.id);
  if (c.expiresAt.getTime() <= now.getTime()) throw new LoiQuanTri("HAN_KHONG_HOP_LE", "Ứng dụng đã hết hạn — không mở lại được.");
  await khoCong.$transaction(async (tx) => {
    const up = await tx.agentClient.updateMany({
      where: { id: c.id, status: "SUSPENDED" },
      data: { status: "ACTIVE", suspendedAt: null, suspendReason: null },
    });
    if (up.count !== 1) throw new LoiQuanTri("SAI_TRANG_THAI", "Chỉ mở khoá được ứng dụng đang bị khoá.");
    await ghiAudit(tx, nguoi, { entityType: "AgentClient", entityId: c.id, action: "UNSUSPEND", lyDo: input.lyDo });
  });
}

/**
 * Thu hồi vĩnh viễn — có hiệu lực NGAY: mọi token, mật khẩu, grant, và vai của user dịch vụ.
 * Không xoá dòng nào: dấu vết ai đã cấp gì cho agent nào phải còn.
 */
export async function thuHoiClient(nguoi: NguoiThaoTac, input: { id: string; lyDo: string }, now: Date): Promise<void> {
  const c = await docClient(input.id);
  await khoCong.$transaction(async (tx) => {
    const up = await tx.agentClient.updateMany({
      where: { id: c.id, status: { in: ["PENDING", "ACTIVE", "SUSPENDED"] } },
      data: { status: "REVOKED", revokedAt: now, revokedById: nguoi.userId },
    });
    if (up.count !== 1) throw new LoiQuanTri("SAI_TRANG_THAI", "Ứng dụng đã bị thu hồi hoặc từ chối trước đó.");
    await tx.agentAccessToken.updateMany({ where: { clientId: c.id, revokedAt: null }, data: { revokedAt: now } });
    await tx.agentClientSecret.updateMany({ where: { clientId: c.id, revokedAt: null }, data: { revokedAt: now } });
    await tx.agentGrant.updateMany({
      where: { clientId: c.id, status: { in: ["PENDING", "ACTIVE", "SUSPENDED"] } },
      data: { status: "REVOKED", revokedAt: now, revokedById: nguoi.userId },
    });
    await tx.userOrgRole.updateMany({ where: { userId: c.serviceUserId }, data: { status: "SUSPENDED" } });
    await ghiAudit(tx, nguoi, { entityType: "AgentClient", entityId: c.id, action: "REVOKE", lyDo: input.lyDo });
  });
}
