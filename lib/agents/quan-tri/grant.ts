// lib/agents/quan-tri/grant.ts — quyền cấp (grant): công cụ × chế độ × cơ sở × hạn (spec §5.2).
//
// Mở rộng quyền (thêm công cụ, thêm cơ sở, bật xem dữ liệu gốc) = một grant MỚI đi lại đủ quy
// trình duyệt — không có đường SỬA grant đang hoạt động (spec §5.3).
import { khoCong } from "../kho";
import { MA_HOI_SO } from "../gateway/kiem-grant";
import { tatCaMaCoSo } from "../gateway/pipeline";
import { timCongCu } from "../tools/so";
import { chanTuDuyet, ghiAudit, HAN_TOI_DA, kiemHan, LoiQuanTri, type NguoiThaoTac } from "./chung";

export async function taoGrant(
  nguoi: NguoiThaoTac,
  input: {
    clientId: string;
    congCu: string;
    coSo: string[];
    xemDuLieuGoc: boolean;
    hanMucNgay?: number | null;
    hetHan: Date;
    lyDo: string;
  },
  now: Date,
): Promise<{ id: string }> {
  const c = await khoCong.agentClient.findUnique({ where: { id: input.clientId }, select: { id: true, status: true } });
  if (!c) throw new LoiQuanTri("KHONG_TIM_THAY", "Không tìm thấy ứng dụng kết nối.");
  if (c.status === "REVOKED" || c.status === "REJECTED") {
    throw new LoiQuanTri("SAI_TRANG_THAI", "Ứng dụng đã bị thu hồi/từ chối — không cấp thêm quyền.");
  }
  const cc = timCongCu(input.congCu);
  if (!cc) throw new LoiQuanTri("DU_LIEU_SAI", "Công cụ không có trong sổ.");
  if (cc.cheDo !== "doc") throw new LoiQuanTri("DU_LIEU_SAI", "Đợt này chỉ cấp được công cụ đọc.");

  const coSo = [...new Set(input.coSo.map((s) => s.trim()).filter(Boolean))];
  const hopLe = new Set(await tatCaMaCoSo());
  const la = coSo.filter((m) => !hopLe.has(m));
  if (coSo.length === 0 || la.length > 0) {
    throw new LoiQuanTri("DU_LIEU_SAI", la.length ? `Mã cơ sở không tồn tại: ${la.join(", ")}` : "Chọn ít nhất một cơ sở.");
  }
  if (input.xemDuLieuGoc) {
    // Spec §5.2 + §6: chỉ công cụ CAO mới có "dữ liệu gốc" để xem, và tối đa 30 ngày.
    if (cc.nhayCam !== "cao") throw new LoiQuanTri("DU_LIEU_SAI", "Chỉ công cụ nhạy cảm CAO mới có quyền xem dữ liệu gốc.");
    kiemHan(input.hetHan, now, HAN_TOI_DA.xemGocNgay, "quyền xem dữ liệu gốc");
  } else {
    kiemHan(input.hetHan, now, HAN_TOI_DA.grantDocNgay, "quyền đọc");
  }

  const g = await khoCong.$transaction(async (tx) => {
    const g = await tx.agentGrant.create({
      data: {
        clientId: c.id,
        tool: cc.ten,
        mode: "READ",
        centerCodes: coSo,
        viewRawData: input.xemDuLieuGoc,
        dailyRowLimit: input.hanMucNgay ?? null,
        reason: input.lyDo,
        status: "PENDING",
        expiresAt: input.hetHan,
        createdById: nguoi.userId,
      },
      select: { id: true },
    });
    await ghiAudit(tx, nguoi, {
      entityType: "AgentGrant",
      entityId: g.id,
      action: "CREATE",
      newValues: {
        clientId: c.id,
        congCu: cc.ten,
        coSo,
        // "HO" = nhìn toàn hệ thống — ghi rõ để người đọc nhật ký không phải biết quy ước.
        toanHeThong: coSo.includes(MA_HOI_SO),
        xemDuLieuGoc: input.xemDuLieuGoc,
        hetHan: input.hetHan,
      },
      lyDo: input.lyDo,
    });
    return g;
  });
  return { id: g.id };
}

export async function quyetDinhGrant(
  nguoi: NguoiThaoTac,
  input: { id: string; dongY: boolean; ghiChu?: string },
  now: Date,
): Promise<void> {
  const g = await khoCong.agentGrant.findUnique({
    where: { id: input.id },
    select: { id: true, status: true, createdById: true, expiresAt: true, client: { select: { status: true } } },
  });
  if (!g) throw new LoiQuanTri("KHONG_TIM_THAY", "Không tìm thấy quyền cấp.");
  chanTuDuyet(nguoi, g.createdById);
  if (g.status !== "PENDING") throw new LoiQuanTri("SAI_TRANG_THAI", "Quyền này không còn ở trạng thái chờ duyệt.");
  if (input.dongY) {
    if (g.expiresAt.getTime() <= now.getTime()) throw new LoiQuanTri("HAN_KHONG_HOP_LE", "Quyền đã quá hạn trước khi được duyệt.");
    if (g.client.status === "REVOKED" || g.client.status === "REJECTED") {
      throw new LoiQuanTri("SAI_TRANG_THAI", "Ứng dụng của quyền này đã bị thu hồi/từ chối.");
    }
  }
  await khoCong.$transaction(async (tx) => {
    const up = await tx.agentGrant.updateMany({
      where: { id: g.id, status: "PENDING" },
      data: {
        status: input.dongY ? "ACTIVE" : "REJECTED",
        decidedById: nguoi.userId,
        decidedAt: now,
        decisionNote: input.ghiChu ?? null,
      },
    });
    if (up.count !== 1) throw new LoiQuanTri("SAI_TRANG_THAI", "Quyền vừa được người khác xử lý.");
    await ghiAudit(tx, nguoi, {
      entityType: "AgentGrant",
      entityId: g.id,
      action: input.dongY ? "APPROVE" : "REJECT",
      lyDo: input.ghiChu,
    });
  });
}

/** Thu hồi một quyền — có hiệu lực ở lượt gọi KẾ TIẾP, kể cả với token đang sống (X4). */
export async function thuHoiGrant(nguoi: NguoiThaoTac, input: { id: string; lyDo: string }, now: Date): Promise<void> {
  await khoCong.$transaction(async (tx) => {
    const up = await tx.agentGrant.updateMany({
      where: { id: input.id, status: { in: ["PENDING", "ACTIVE", "SUSPENDED"] } },
      data: { status: "REVOKED", revokedAt: now, revokedById: nguoi.userId },
    });
    if (up.count !== 1) throw new LoiQuanTri("SAI_TRANG_THAI", "Quyền đã bị thu hồi hoặc từ chối trước đó.");
    await ghiAudit(tx, nguoi, { entityType: "AgentGrant", entityId: input.id, action: "REVOKE", lyDo: input.lyDo });
  });
}
