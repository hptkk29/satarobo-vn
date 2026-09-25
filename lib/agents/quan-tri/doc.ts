// lib/agents/quan-tri/doc.ts — dữ liệu cho màn "Hệ thống › Cổng dữ liệu agent" (spec §5.5).
//
// Bảng của cổng không thuộc cơ sở nào nên đọc qua `khoCong`, không qua `scopedDb`. Cổng trang
// (`agent_gateway:view`) do page.tsx gác. Không trả bản băm khoá/token nào ra giao diện.
import type { AgentStatus } from "@prisma/client";
import { trangThaiHaiLop, type TrangThaiHaiLop } from "@/lib/auth/hai-lop";
import { khoCong } from "../kho";
import { moiTruongHienTai } from "../khoa";
import { congDangBat } from "../gateway/cau-hinh";
import { moiTruongDb, tatCaMaCoSo } from "../gateway/co-so";
import { tatCaCongCu } from "../tools/so";

export type HangGrant = {
  id: string;
  congCu: string;
  coSo: string[];
  xemDuLieuGoc: boolean;
  hanMucNgay: number | null;
  trangThai: AgentStatus;
  /** true nếu ACTIVE nhưng đã quá hạn — "hết hạn" là thuộc tính tính lúc đọc (luật cứng #8). */
  daHetHan: boolean;
  hetHan: Date;
  lyDo: string;
  nguoiTao: string;
  laNguoiTao: boolean;
  nguoiDuyet: string | null;
  taoLuc: Date;
};

export type HangClient = {
  id: string;
  ten: string;
  moiTruong: "TEST" | "LIVE";
  /**
   * Client thuộc ĐÚNG môi trường đang chạy? Sai môi trường thì `sinhMatKhau` từ chối — giao
   * diện dùng cờ này để KHÔNG vẽ nút sinh khoá (luật 12: nút chắc chắn bị từ chối là hứa suông).
   */
  dungMoiTruong: boolean;
  trangThai: AgentStatus;
  daHetHan: boolean;
  ipDuocPhep: string[];
  lyDo: string;
  hetHan: Date;
  taoLuc: Date;
  nguoiTao: string;
  laNguoiTao: boolean;
  nguoiDuyet: string | null;
  lanGoiCuoi: Date | null;
  lyDoKhoa: string | null;
  vaiDichVu: string[];
  matKhau: { soConSong: number; hetHanGanNhat: Date | null };
  grants: HangGrant[];
};

export type TongQuanCong = {
  congDangBat: boolean;
  haiLop: TrangThaiHaiLop;
  clients: HangClient[];
  congCu: { ten: string; moTa: string; nhayCam: string }[];
  maCoSo: string[];
  vaiDichVu: { code: string; name: string }[];
};

export async function docTongQuan(userId: string, now: Date): Promise<TongQuanCong> {
  const [batCong, haiLop, clients, maCoSo, vai] = await Promise.all([
    congDangBat(),
    trangThaiHaiLop(userId, now),
    khoCong.agentClient.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: {
        grants: { orderBy: { createdAt: "desc" } },
        secrets: { where: { revokedAt: null, expiresAt: { gt: now } }, select: { expiresAt: true } },
      },
    }),
    tatCaMaCoSo(),
    khoCong.roleDef.findMany({
      where: { code: { startsWith: "AGENT_" }, isActive: true },
      select: { code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const serviceIds = clients.map((c) => c.serviceUserId);
  const [vaiCuaDichVu, nguoi] = await Promise.all([
    serviceIds.length === 0
      ? []
      : khoCong.userOrgRole.findMany({
          where: { userId: { in: serviceIds }, status: "ACTIVE" },
          select: { userId: true, role: { select: { code: true } } },
        }),
    (async () => {
      const ids = new Set<string>();
      for (const c of clients) {
        ids.add(c.createdById);
        if (c.decidedById) ids.add(c.decidedById);
        for (const g of c.grants) {
          ids.add(g.createdById);
          if (g.decidedById) ids.add(g.decidedById);
        }
      }
      if (ids.size === 0) return [];
      return khoCong.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, email: true } });
    })(),
  ]);
  const ten = new Map(nguoi.map((u) => [u.id, u.name ?? u.email ?? u.id]));
  const moiTruongNay = moiTruongDb(moiTruongHienTai());
  const tenCua = (id: string | null) => (id ? ten.get(id) ?? "(không rõ)" : null);

  return {
    congDangBat: batCong,
    haiLop,
    maCoSo,
    vaiDichVu: vai,
    congCu: tatCaCongCu().map((c) => ({ ten: c.ten, moTa: c.moTa, nhayCam: c.nhayCam })),
    clients: clients.map((c) => ({
      id: c.id,
      ten: c.name,
      moiTruong: c.environment,
      dungMoiTruong: c.environment === moiTruongNay,
      trangThai: c.status,
      daHetHan: c.expiresAt.getTime() <= now.getTime(),
      ipDuocPhep: c.allowedIps,
      lyDo: c.reason,
      hetHan: c.expiresAt,
      taoLuc: c.createdAt,
      nguoiTao: tenCua(c.createdById) ?? "",
      laNguoiTao: c.createdById === userId,
      nguoiDuyet: tenCua(c.decidedById),
      lanGoiCuoi: c.lastUsedAt,
      lyDoKhoa: c.suspendReason,
      vaiDichVu: vaiCuaDichVu.filter((v) => v.userId === c.serviceUserId).map((v) => v.role.code),
      matKhau: {
        soConSong: c.secrets.length,
        hetHanGanNhat: c.secrets.length ? new Date(Math.max(...c.secrets.map((s) => s.expiresAt.getTime()))) : null,
      },
      grants: c.grants.map((g) => ({
        id: g.id,
        congCu: g.tool,
        coSo: g.centerCodes,
        xemDuLieuGoc: g.viewRawData,
        hanMucNgay: g.dailyRowLimit,
        trangThai: g.status,
        daHetHan: g.expiresAt.getTime() <= now.getTime(),
        hetHan: g.expiresAt,
        lyDo: g.reason,
        nguoiTao: tenCua(g.createdById) ?? "",
        laNguoiTao: g.createdById === userId,
        nguoiDuyet: tenCua(g.decidedById),
        taoLuc: g.createdAt,
      })),
    })),
  };
}

export type HangNhatKy = {
  id: string;
  luc: Date;
  clientId: string | null;
  congCu: string;
  ketQua: string;
  http: number;
  soBanGhi: number;
  daChe: boolean;
  xemGoc: boolean;
  coSo: string[];
  ip: string | null;
  batThuong: boolean;
  thoiGianMs: number;
};

/** Nhật ký gọi — lọc theo client/kết quả, 100 dòng mới nhất. KHÔNG có dữ liệu trả về (spec §5.5). */
export async function docNhatKy(loc: { clientId?: string; chiLoi?: boolean; chiBatThuong?: boolean }): Promise<HangNhatKy[]> {
  const rows = await khoCong.agentToolCall.findMany({
    where: {
      ...(loc.clientId ? { clientId: loc.clientId } : {}),
      ...(loc.chiLoi ? { resultCode: { not: "OK" } } : {}),
      ...(loc.chiBatThuong ? { flagged: true } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((r) => ({
    id: r.id,
    luc: r.createdAt,
    clientId: r.clientId,
    congCu: r.tool,
    ketQua: r.resultCode,
    http: r.httpStatus,
    soBanGhi: r.rowCount,
    daChe: r.masked,
    xemGoc: r.viewedRaw,
    coSo: r.centerCodes,
    ip: r.ip,
    batThuong: r.flagged,
    thoiGianMs: r.durationMs,
  }));
}

/** Người đang giữ quyền cổng — để người duyệt đặt lại 2FA khi ai đó mất điện thoại. */
export async function docNguoiCoHaiLop(): Promise<{ userId: string; ten: string; daBat: boolean }[]> {
  const rows = await khoCong.userTotp.findMany({
    select: { userId: true, enabledAt: true, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ userId: r.userId, ten: r.user.name ?? r.user.email ?? r.userId, daBat: !!r.enabledAt }));
}
