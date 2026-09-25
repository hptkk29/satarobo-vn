// lib/agents/gateway/pipeline.ts — CỔNG KIỂM SOÁT: 13 bước của spec §5.6, fail closed.
//
// Mọi lối vào (REST hôm nay, MCP ở Đợt 2) PHẢI đi qua đây. Không có đường tắt nào từ route
// gọi thẳng công cụ hay DB (spec §2).
//
// Thứ tự bước là một phần của hợp đồng bảo mật, không phải thứ tự tiện tay:
//   · công tắc (1) đứng trước MỌI thứ — tắt là 503 ngay, không cần xác thực;
//   · xác thực (3-4) đứng trước khi đọc tham số — kẻ không có token không dò được khuôn;
//   · quyền công cụ (6) đứng trước kiểm tham số (8) — agent không được cấp thì không biết
//     công cụ đó nhận tham số gì (404 như công cụ không tồn tại, ca B4);
//   · nhật ký (13) ghi TRƯỚC khi trả dữ liệu — ghi hỏng thì không trả (spec §12).
import type { AgentAccessMode, AgentEnvironment } from "@prisma/client";
import { resolveActorUncached } from "@/lib/auth/actor";
import { can } from "@/lib/auth/can";
import { scopedDb } from "@/lib/db-scope";
import { rateLimit } from "@/lib/rate-limit";
import { bamBiMat, docPepperCong, moiTruongHienTai, tachBearer, type MoiTruongCong } from "../khoa";
import { khoCong } from "../kho";
import { timCongCu, tatCaCongCu, tenCongCuCao } from "../tools/so";
import type { NguCanhCongCu } from "../tools/kieu";
import { congDangBat, docHanMuc, type HanMucCong } from "./cau-hinh";
import { ipDuocPhep, ipNguonTinCay } from "./ip";
import { quyetDinhGoi, type CheDo, type GrantVao } from "./kiem-grant";
import { LoiCong, veLoiCong, voLoi } from "./loi";
import { ghiNhatKy, nhatKyRong, sinhMaYeuCau, type NhatKyGoi } from "./nhat-ky";
import { dauNgayVN, gioVN } from "./thoi-gian";
import { tuKhoaClient } from "./tu-khoa";

type Env = Record<string, string | undefined>;

/** Trần thân yêu cầu (spec bước 2). */
export const TOI_DA_THAN_BYTE = 256 * 1024;

export const CHE_DO_DB: Record<CheDo, AgentAccessMode> = {
  doc: "READ",
  ghi_nhap: "WRITE_DRAFT",
  ghi_that: "WRITE_DIRECT",
};
const CHE_DO_TU_DB: Record<AgentAccessMode, CheDo> = {
  READ: "doc",
  WRITE_DRAFT: "ghi_nhap",
  WRITE_DIRECT: "ghi_that",
};

export function moiTruongDb(mt: MoiTruongCong): AgentEnvironment {
  return mt === "live" ? "LIVE" : "TEST";
}

// ─── Phản hồi ────────────────────────────────────────────────────────────────────────
export function traJson(body: unknown, status: number, them: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Spec bước 13: không CDN/trình duyệt nào được giữ bản sao dữ liệu agent đọc.
      "Cache-Control": "no-store",
      ...them,
    },
  });
}

export function traLoi(loi: LoiCong, maYeuCau: string, them: Record<string, unknown> = {}): Response {
  const h: Record<string, string> = {};
  if (loi.thuLaiSauGiay) h["Retry-After"] = String(loi.thuLaiSauGiay);
  if (loi.http === 401) h["WWW-Authenticate"] = 'Bearer realm="sata-robo-agent"';
  return traJson({ ...them, ...voLoi(loi, maYeuCau) }, loi.http, h);
}

// ─── Bước 2 — hình thức yêu cầu ─────────────────────────────────────────────────────
function trenVercel(env: Env): boolean {
  return env.VERCEL === "1" || !!env.VERCEL_ENV;
}

/** HTTPS + đúng loại nội dung + không quá trần. Trả thân dạng chuỗi. */
export async function docThan(req: Request, loaiNoiDung: string, toiDaByte: number, env: Env): Promise<string> {
  // Trên Vercel, proxy nền tảng đặt `x-forwarded-proto`. Ngoài Vercel (máy dev) không kiểm.
  if (trenVercel(env)) {
    const proto = req.headers.get("x-forwarded-proto");
    if (proto && proto.split(",")[0]!.trim() !== "https") throw new LoiCong("YEU_CAU_SAI");
  }
  const ct = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (ct !== loaiNoiDung) throw new LoiCong("YEU_CAU_SAI", { http: 415, thongDiep: `Cần Content-Type: ${loaiNoiDung}.` });
  const khai = Number(req.headers.get("content-length"));
  if (Number.isFinite(khai) && khai > toiDaByte) throw new LoiCong("YEU_CAU_SAI", { http: 413, thongDiep: "Thân yêu cầu quá lớn." });
  const than = await req.text();
  // Đo lại trên thân THẬT: chunked không gửi content-length, và khai báo có thể nói dối.
  if (Buffer.byteLength(than, "utf8") > toiDaByte) throw new LoiCong("YEU_CAU_SAI", { http: 413, thongDiep: "Thân yêu cầu quá lớn." });
  return than;
}

const KHOA_THAN_HOP_LE = new Set(["tham_so", "agent_run_id"]);

/** Thân JSON `{ tham_so?, agent_run_id? }`. Khoá lạ ở tầng ngoài ⇒ 400 (không lặng lẽ bỏ qua). */
export function phanTichThanJson(than: string): { thamSo: unknown; agentRunId: string | null } {
  let v: unknown;
  try {
    v = than.trim() === "" ? {} : JSON.parse(than);
  } catch {
    throw new LoiCong("YEU_CAU_SAI", { thongDiep: "Thân yêu cầu không phải JSON hợp lệ." });
  }
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    throw new LoiCong("YEU_CAU_SAI", { thongDiep: "Thân yêu cầu phải là một đối tượng JSON." });
  }
  const o = v as Record<string, unknown>;
  const la = Object.keys(o).filter((k) => !KHOA_THAN_HOP_LE.has(k));
  if (la.length > 0) throw new LoiCong("YEU_CAU_SAI", { thongDiep: "Thân yêu cầu có khoá không hợp lệ.", truongSai: la });
  const run = o.agent_run_id;
  if (run !== undefined && (typeof run !== "string" || !/^[A-Za-z0-9_.:-]{1,100}$/.test(run))) {
    throw new LoiCong("YEU_CAU_SAI", { truongSai: ["agent_run_id"] });
  }
  return { thamSo: o.tham_so ?? {}, agentRunId: (run as string | undefined) ?? null };
}

// ─── Bước 3-4 — token, client, IP ───────────────────────────────────────────────────
export type ClientDaXacThuc = {
  id: string;
  serviceUserId: string;
  scopes: string[];
};

async function xacThucToken(req: Request, nk: NhatKyGoi, now: Date, pepper: string, env: Env): Promise<ClientDaXacThuc> {
  const raw = tachBearer(req.headers.get("authorization"));
  if (!raw) throw new LoiCong("TOKEN_KHONG_HOP_LE");
  const mt = moiTruongDb(moiTruongHienTai(env));
  const row = await khoCong.agentAccessToken.findUnique({
    where: { tokenHash: bamBiMat(raw, pepper) },
    select: {
      clientId: true,
      scopes: true,
      environment: true,
      expiresAt: true,
      revokedAt: true,
      client: {
        select: {
          id: true,
          kind: true,
          status: true,
          environment: true,
          expiresAt: true,
          allowedIps: true,
          serviceUserId: true,
          serviceUser: { select: { deletedAt: true, isServiceAccount: true } },
        },
      },
    },
  });
  // Thu hồi có hiệu lực NGAY (ca B2): tra mỗi lượt, không đệm.
  if (!row || row.revokedAt || row.expiresAt.getTime() <= now.getTime() || row.environment !== mt) {
    throw new LoiCong("TOKEN_KHONG_HOP_LE");
  }
  const c = row.client;
  nk.clientId = c.id;
  if (c.environment !== mt || c.kind !== "EXTERNAL") throw new LoiCong("TOKEN_KHONG_HOP_LE");
  if (c.status === "SUSPENDED") throw new LoiCong("CLIENT_BI_KHOA");
  if (c.status !== "ACTIVE" || c.expiresAt.getTime() <= now.getTime()) throw new LoiCong("TOKEN_KHONG_HOP_LE");
  const u = c.serviceUser;
  // KHÔNG xét `isActive`: user dịch vụ CỐ Ý để isActive=false (+ DISABLED) cho khỏi lọt vào
  // danh sách nhân sự/chia lead (`lib/agents/quan-tri`). Sống/chết của agent là trạng thái client.
  if (!u.isServiceAccount || u.deletedAt) throw new LoiCong("TOKEN_KHONG_HOP_LE");

  const ip = ipNguonTinCay(req.headers, env);
  nk.ip = ip;
  if (!ipDuocPhep(ip, c.allowedIps)) {
    // Token ĐÚNG mà IP lạ ⇒ token đã rời khỏi máy được phép: khoá trước, điều tra sau.
    nk.flagged = true;
    await tuKhoaClient(c.id, "IP_LA", now);
    throw new LoiCong("IP_KHONG_DUOC_PHEP");
  }
  return { id: c.id, serviceUserId: c.serviceUserId, scopes: row.scopes };
}

// ─── Bước 0 — chặn LŨ theo IP, trước mọi thứ ─────────────────────────────────────────
/**
 * Trần theo IP nguồn, áp cho MỌI lượt gọi (kể cả chưa xác thực) — rà bảo mật 25/09 (F2):
 * không có lớp này thì kẻ không có khoá nào vẫn bắn được vô hạn request, mỗi lượt đọc DB
 * (công tắc, token) và ghi một dòng nhật ký. Chạy TRƯỚC công tắc để lũ không chạm DB.
 *
 * Lượt bị chặn ở đây KHÔNG ghi `AgentToolCall`: ghi nhật ký cho từng request rác là biến
 * chính nhật ký thành công cụ khuếch đại tấn công. Trần đủ rộng để không chạm agent thật
 * (hạn mức của một client là `agentGateway.rateLimitPerMin`, mặc định 60/phút).
 *
 * Trả số giây phải chờ, hoặc `null` nếu được qua.
 */
export async function chanLuTheoIp(tienTo: string, ip: string | null, toiDaMoiPhut: number): Promise<number | null> {
  const rl = await rateLimit({ key: `${tienTo}:${ip ?? "khong-ro"}`, max: toiDaMoiPhut, windowMs: 60_000 });
  return rl.success ? null : Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
}

/** Trần lũ theo IP cho lối gọi công cụ / danh sách công cụ. */
export const TRAN_LU_IP_CONG_CU = 300;

// ─── Bước 5 — hạn mức ───────────────────────────────────────────────────────────────
async function kiemTanSuat(khoa: string, toiDa: number): Promise<void> {
  const rl = await rateLimit({ key: khoa, max: toiDa, windowMs: 60_000 });
  if (!rl.success) {
    throw new LoiCong("VUOT_HAN_MUC", { thuLaiSauGiay: Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000)) });
  }
}

/** Tổng bản ghi CAO client đã đọc từ 00:00 (giờ VN) hôm nay. */
async function soBanGhiCaoHomNay(clientId: string, now: Date): Promise<number> {
  const ten = tenCongCuCao();
  if (ten.length === 0) return 0;
  const r = await khoCong.agentToolCall.aggregate({
    where: { clientId, tool: { in: ten }, resultCode: "OK", createdAt: { gte: dauNgayVN(now) } },
    _sum: { rowCount: true },
  });
  return r._sum.rowCount ?? 0;
}

// ─── Grant + danh mục cơ sở ─────────────────────────────────────────────────────────
export async function docGrant(clientId: string): Promise<GrantVao[]> {
  const rows = await khoCong.agentGrant.findMany({
    where: { clientId },
    select: {
      tool: true,
      mode: true,
      centerCodes: true,
      viewRawData: true,
      dailyRowLimit: true,
      status: true,
      expiresAt: true,
    },
  });
  return rows.map((g) => ({
    congCu: g.tool,
    cheDo: CHE_DO_TU_DB[g.mode],
    coSo: g.centerCodes,
    xemDuLieuGoc: g.viewRawData,
    hanMucNgay: g.dailyRowLimit,
    trangThai: g.status,
    hetHan: g.expiresAt,
  }));
}

/** Mã mọi đơn vị HO + CENTER còn hoạt động — để nở "HO" thành toàn hệ thống. */
export async function tatCaMaCoSo(): Promise<string[]> {
  const rows = await khoCong.orgUnit.findMany({
    where: { deletedAt: null, isActive: true, type: { in: ["HO", "CENTER"] } },
    select: { code: true },
  });
  return rows.map((r) => r.code);
}

/** Bước 12 phụ — trường nội bộ `_…` không bao giờ được lọt ra (máy kiểm của xưởng soi đúng thứ này). */
export function coTruongNoiBo(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(coTruongNoiBo);
  if (v && typeof v === "object") {
    return Object.entries(v as Record<string, unknown>).some(([k, x]) => k.startsWith("_") || coTruongNoiBo(x));
  }
  return false;
}

// ─── Lối vào 1: gọi một công cụ ─────────────────────────────────────────────────────
export async function xuLyGoiCongCu(req: Request, tenCongCu: string, env: Env = process.env): Promise<Response> {
  const batDau = Date.now();
  const now = new Date();
  const maYeuCau = sinhMaYeuCau();
  const nk = nhatKyRong(tenCongCu.slice(0, 100));
  const cho = await chanLuTheoIp("agent-gw-ip", ipNguonTinCay(req.headers, env), TRAN_LU_IP_CONG_CU);
  if (cho !== null) return traLoi(new LoiCong("VUOT_HAN_MUC", { thuLaiSauGiay: cho }), maYeuCau);
  try {
    // Bước 1
    if (!(await congDangBat())) throw new LoiCong("CONG_DANG_TAT");
    // Bước 2
    const than = phanTichThanJson(await docThan(req, "application/json", TOI_DA_THAN_BYTE, env));
    nk.agentRunId = than.agentRunId;
    const pepper = docPepperCong(env);
    if (!pepper) throw new LoiCong("NGUON_LOI");
    // Bước 3-4
    const client = await xacThucToken(req, nk, now, pepper, env);
    // Bước 5
    const hanMuc: HanMucCong = await docHanMuc();
    await kiemTanSuat(`agent-gw:${client.id}`, hanMuc.rateLimitPerMin);

    // Bước 6
    const congCu = timCongCu(tenCongCu);
    if (!congCu) throw new LoiCong("CONG_CU_KHONG_TON_TAI");
    nk.mode = CHE_DO_DB[congCu.cheDo];
    const [grants, maCoSo] = await Promise.all([docGrant(client.id), tatCaMaCoSo()]);
    const coBan = { scopesToken: client.scopes, grants, congCu: congCu.ten, cheDo: congCu.cheDo, tatCaMaCoSo: maCoSo, now };
    const q6 = quyetDinhGoi({ ...coBan, coSoYeuCau: null });
    if (!q6.ok) throw new LoiCong(q6.ma);

    // Bước 7 — chữ ký: chỉ công cụ GHI; sổ Đợt 0 từ chối đăng ký công cụ ghi (`tools/so.ts`).

    // Bước 8
    const gioiHanTs = { maxRowsPerCall: hanMuc.maxRowsPerCall, maxRangeDays: hanMuc.maxRangeDays };
    const luot = congCu.chuanBi(than.thamSo, gioiHanTs);
    nk.paramsHash = bamBiMat(JSON.stringify(than.thamSo), pepper);

    // Bước 9
    const q9 = quyetDinhGoi({ ...coBan, coSoYeuCau: luot.coSoYeuCau });
    if (!q9.ok) throw new LoiCong(q9.ma);
    nk.centerCodes = q9.phamViCoSo;

    const laCao = congCu.nhayCam === "cao";
    const cheDuLieu = laCao ? luot.cheDuLieuYeuCau !== false : false;
    // Ca B8: xin xem gốc mà grant không cho ⇒ 403, không âm thầm trả bản đã che.
    if (laCao && !cheDuLieu && !q9.xemDuLieuGoc) throw new LoiCong("KHONG_DU_QUYEN");
    nk.masked = cheDuLieu;
    nk.viewedRaw = laCao && !cheDuLieu;
    if (laCao) {
      const tran = q9.hanMucNgay ?? hanMuc.maxRowsPerDayCao;
      if ((await soBanGhiCaoHomNay(client.id, now)) >= tran) {
        await tuKhoaClient(client.id, "VUOT_HAN_MUC_CAO", now);
        throw new LoiCong("VUOT_HAN_MUC");
      }
    }

    // Bước 10 — danh tính user dịch vụ, `can()` kiểm lần nữa (ca B9: gỡ vai là 403 ngay).
    const actor = await resolveActorUncached(client.serviceUserId);
    for (const q of congCu.quyenCan) {
      if (!can(actor, q)) throw new LoiCong("KHONG_DU_QUYEN");
    }
    const ctx: NguCanhCongCu = {
      actor,
      sdb: scopedDb(actor),
      phamViCoSo: q9.phamViCoSo,
      cheDuLieu,
      maYeuCau,
      now,
      hanMuc: gioiHanTs,
    };
    let kq: Awaited<ReturnType<typeof luot.chay>>;
    try {
      kq = await luot.chay(ctx);
    } catch (e) {
      if (e instanceof LoiCong) throw e;
      console.error("[agent-gateway] công cụ lỗi", { congCu: congCu.ten, maYeuCau, loi: e instanceof Error ? e.name : "?" });
      throw new LoiCong("NGUON_LOI");
    }

    // Bước 11
    const duLieu = cheDuLieu ? luot.che(kq.duLieu, ctx) : kq.duLieu;

    // Bước 12 — lệch khuôn thì KHÔNG trả gì (ca B17).
    const soBanGhi = congCu.dangDuLieu === "array" && Array.isArray(duLieu) ? duLieu.length : 1;
    if (
      !congCu.dungKhuon(duLieu) ||
      coTruongNoiBo(duLieu) ||
      (congCu.dangDuLieu === "array" && soBanGhi > hanMuc.maxRowsPerCall)
    ) {
      console.error("[agent-gateway] LECH_KHUON", { congCu: congCu.ten, maYeuCau });
      throw new LoiCong("LECH_KHUON");
    }
    nk.rowCount = soBanGhi;

    const body = {
      du_lieu: duLieu,
      meta: {
        cong_cu: congCu.ten,
        phien_ban_khuon: congCu.phienBanKhuon,
        sinh_luc: gioVN(now),
        so_ban_ghi: soBanGhi,
        tiep_theo: kq.tiepTheo,
        da_che_du_lieu: cheDuLieu,
        pham_vi_co_so: q9.phamViCoSo,
        ma_yeu_cau: maYeuCau,
      },
    };
    // Bước 13 — nhật ký TRƯỚC khi trả. Ghi hỏng ⇒ ném ⇒ nhánh catch trả NGUON_LOI, không dữ liệu.
    await ghiNhatKy(maYeuCau, nk, { ma: "OK", http: 200 }, batDau);
    await khoCong.agentClient.update({ where: { id: client.id }, data: { lastUsedAt: now } }).catch(() => undefined);
    return traJson(body, 200);
  } catch (e) {
    const loi = veLoiCong(e);
    await ghiNhatKy(maYeuCau, nk, { ma: loi.ma, http: loi.http }, batDau).catch(() => undefined);
    return traLoi(loi, maYeuCau);
  }
}

// ─── Lối vào 2: danh sách công cụ token này được dùng ─────────────────────────────────
export async function xuLyDanhSachCongCu(req: Request, env: Env = process.env): Promise<Response> {
  const batDau = Date.now();
  const now = new Date();
  const maYeuCau = sinhMaYeuCau();
  const nk = nhatKyRong("tools.list");
  const cho = await chanLuTheoIp("agent-gw-ip", ipNguonTinCay(req.headers, env), TRAN_LU_IP_CONG_CU);
  if (cho !== null) return traLoi(new LoiCong("VUOT_HAN_MUC", { thuLaiSauGiay: cho }), maYeuCau);
  try {
    if (!(await congDangBat())) throw new LoiCong("CONG_DANG_TAT");
    phanTichThanJson(await docThan(req, "application/json", TOI_DA_THAN_BYTE, env));
    const pepper = docPepperCong(env);
    if (!pepper) throw new LoiCong("NGUON_LOI");
    const client = await xacThucToken(req, nk, now, pepper, env);
    const hanMuc = await docHanMuc();
    await kiemTanSuat(`agent-gw:${client.id}`, hanMuc.rateLimitPerMin);

    const [grants, maCoSo] = await Promise.all([docGrant(client.id), tatCaMaCoSo()]);
    // Chỉ công cụ phiên này ĐƯỢC CẤP — không liệt kê công cụ khác (spec §7.1, §8).
    const duLieu = tatCaCongCu().flatMap((c) => {
      const q = quyetDinhGoi({
        scopesToken: client.scopes,
        grants,
        congCu: c.ten,
        cheDo: c.cheDo,
        coSoYeuCau: null,
        tatCaMaCoSo: maCoSo,
        now,
      });
      if (!q.ok) return [];
      return [
        {
          ten: c.ten,
          ten_mcp: c.tenMcp,
          mo_ta: c.moTa,
          che_do: c.cheDo,
          nhay_cam: c.nhayCam,
          phien_ban_khuon: c.phienBanKhuon,
          pham_vi_co_so: q.phamViCoSo,
          tham_so: c.thamSoJsonSchema(),
        },
      ];
    });
    nk.rowCount = duLieu.length;
    await ghiNhatKy(maYeuCau, nk, { ma: "OK", http: 200 }, batDau);
    return traJson(
      { du_lieu: duLieu, meta: { cong_cu: "tools.list", sinh_luc: gioVN(now), so_ban_ghi: duLieu.length, ma_yeu_cau: maYeuCau } },
      200,
    );
  } catch (e) {
    const loi = veLoiCong(e);
    await ghiNhatKy(maYeuCau, nk, { ma: loi.ma, http: loi.http }, batDau).catch(() => undefined);
    return traLoi(loi, maYeuCau);
  }
}
