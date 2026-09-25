// lib/agents/gateway/cap-token.ts — `POST /api/agent/v1/oauth/token` (client_credentials, spec §4.2)
// và `POST /api/agent/v1/oauth/revoke` (agent tự huỷ token).
//
// Phản hồi lỗi mang CẢ trường `error` chuẩn OAuth (thư viện OAuth của agent đọc nó) LẪN vỏ
// `loi` của cổng (xưởng skill đọc nó) — hai phía cùng hiểu mà không phải đoán.
import { rateLimit } from "@/lib/rate-limit";
import { safeEqual } from "@/lib/security/safe-equal";
import {
  bamBiMat,
  docPepperCong,
  moiTruongCuaMatKhau,
  moiTruongHienTai,
  sinhToken,
  tachBasicAuth,
  tachBearer,
} from "../khoa";
import { khoCong } from "../kho";
import { congDangBat, docHanMuc } from "./cau-hinh";
import { ipDuocPhep, ipNguonTinCay } from "./ip";
import { chonScopeChoToken, tachChuoiScope } from "./kiem-grant";
import { LoiCong, veLoiCong, type MaLoi } from "./loi";
import { ghiNhatKy, nhatKyRong, sinhMaYeuCau } from "./nhat-ky";
import { chanLuTheoIp, docGrant, docThan, moiTruongDb, traJson, traLoi } from "./pipeline";
import { tuKhoaClient } from "./tu-khoa";

type Env = Record<string, string | undefined>;

const TOI_DA_THAN_TOKEN = 16 * 1024;
const CUA_SO_DEM_SAI_MS = 5 * 60 * 1000;
/** Trần xin token mỗi phút của một client — token sống 15 phút, xin nhiều hơn là bất thường. */
const TRAN_XIN_TOKEN_MOI_PHUT = 30;
/** Trần lũ theo IP ở endpoint token — áp cho MỌI lượt, kể cả sai mật khẩu (rà 25/09, AG-XT-02). */
const TRAN_LU_IP_TOKEN = 30;
const TRAN_LU_IP_THU_HOI = 60;

const MA_CLIENT_RE = /^agc_[A-Za-z0-9_-]{10,64}$/;

function maOauth(ma: MaLoi, http: number): string {
  if (ma === "TOKEN_KHONG_HOP_LE" || ma === "CLIENT_BI_KHOA") return "invalid_client";
  if (ma === "IP_KHONG_DUOC_PHEP") return "unauthorized_client";
  if (ma === "VUOT_HAN_MUC" || ma === "CONG_DANG_TAT") return "temporarily_unavailable";
  if (http >= 500) return "server_error";
  return "invalid_request";
}

class LoiScope extends LoiCong {
  constructor() {
    super("YEU_CAU_SAI", { thongDiep: "Scope xin vượt quá quyền đã được cấp, hoặc sai khuôn." });
  }
}
class LoiGrantType extends LoiCong {
  constructor() {
    super("YEU_CAU_SAI", { thongDiep: "Chỉ hỗ trợ grant_type=client_credentials." });
  }
}

/**
 * Sai mật khẩu cho một mã client CÓ THẬT, TỪ MỘT IP ĐƯỢC PHÉP ⇒ đếm các lần sai trong 5 phút.
 * Chạm ngưỡng ⇒ tự khoá (spec §12, ca B12).
 *
 * Hai quyết định từ lượt rà bảo mật 25/09 (AG-XT-02, F2):
 *   · CHỈ đếm lần sai đến từ IP nằm trong danh sách được phép. `client_id` không bí mật
 *     (spec §4.1); đếm cả lần sai từ internet thì ai biết mã client cũng tự khoá được agent
 *     thật trong một giây. Lần sai từ IP lạ vẫn bị từ chối + ghi nhật ký có cờ bất thường —
 *     và dù có đoán trúng mật khẩu 256 bit thì IP lạ vẫn bị chặn (và client tự khoá).
 *   · Người gọi GHI nhật ký của lần sai này TRƯỚC khi đếm (đếm gồm cả dòng vừa ghi): nhiều
 *     lượt sai song song nhìn thấy nhau, không cùng đọc một con số cũ rồi cùng "chưa tới ngưỡng".
 */
async function demSaiVaKhoa(clientId: string, ipDuocPhepCua: readonly string[], nguong: number, now: Date): Promise<void> {
  const daSai = await khoCong.agentToolCall.count({
    where: {
      clientId,
      tool: "oauth.token",
      resultCode: "TOKEN_KHONG_HOP_LE",
      ip: { in: [...ipDuocPhepCua] },
      createdAt: { gte: new Date(now.getTime() - CUA_SO_DEM_SAI_MS) },
    },
  });
  if (daSai >= nguong) await tuKhoaClient(clientId, "SAI_MAT_KHAU", now);
}

export async function xuLyCapToken(req: Request, env: Env = process.env): Promise<Response> {
  const batDau = Date.now();
  const now = new Date();
  const maYeuCau = sinhMaYeuCau();
  const nk = nhatKyRong("oauth.token");
  let daGhiNhatKy = false;
  const cho = await chanLuTheoIp("agent-gw-token-ip", ipNguonTinCay(req.headers, env), TRAN_LU_IP_TOKEN);
  if (cho !== null) {
    return traLoi(new LoiCong("VUOT_HAN_MUC", { thuLaiSauGiay: cho }), maYeuCau, { error: "temporarily_unavailable" });
  }
  try {
    if (!(await congDangBat())) throw new LoiCong("CONG_DANG_TAT");
    const form = new URLSearchParams(
      await docThan(req, "application/x-www-form-urlencoded", TOI_DA_THAN_TOKEN, env),
    );
    const pepper = docPepperCong(env);
    if (!pepper) throw new LoiCong("NGUON_LOI");
    if (form.get("grant_type") !== "client_credentials") throw new LoiGrantType();

    const cred = tachBasicAuth(req.headers.get("authorization"));
    if (!cred) throw new LoiCong("TOKEN_KHONG_HOP_LE");
    // Chỉ ghi mã client vào nhật ký khi nó ĐÚNG KHUÔN — không để kẻ dò nhồi chuỗi rác vào sổ.
    if (MA_CLIENT_RE.test(cred.clientId)) nk.clientId = cred.clientId;
    const ip = ipNguonTinCay(req.headers, env);
    nk.ip = ip;

    // Ca B3: khoá test dùng trên production (và ngược lại) ⇒ 401. Không đếm là "dò mật khẩu".
    const mt = moiTruongHienTai(env);
    if (moiTruongCuaMatKhau(cred.matKhau) !== mt) throw new LoiCong("TOKEN_KHONG_HOP_LE");

    const hanMuc = await docHanMuc();
    const secret = await khoCong.agentClientSecret.findUnique({
      where: { secretHash: bamBiMat(cred.matKhau, pepper) },
      select: {
        id: true,
        clientId: true,
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
            serviceUser: { select: { deletedAt: true, isServiceAccount: true } },
          },
        },
      },
    });
    const dung =
      !!secret &&
      safeEqual(secret.clientId, cred.clientId) &&
      !secret.revokedAt &&
      secret.expiresAt.getTime() > now.getTime();
    if (!secret || !dung) {
      // 401 chung chung — không nói sai mã hay sai mật khẩu (spec §4.2).
      if (nk.clientId) {
        nk.flagged = true;
        const cl = await khoCong.agentClient.findUnique({ where: { id: nk.clientId }, select: { allowedIps: true } });
        if (cl && ipDuocPhep(ip, cl.allowedIps)) {
          await ghiNhatKy(maYeuCau, nk, { ma: "TOKEN_KHONG_HOP_LE", http: 401 }, batDau);
          daGhiNhatKy = true;
          await demSaiVaKhoa(nk.clientId, cl.allowedIps, hanMuc.lockAfterAuthFailures, now);
        }
      }
      throw new LoiCong("TOKEN_KHONG_HOP_LE");
    }

    const c = secret.client;
    if (c.environment !== moiTruongDb(mt) || c.kind !== "EXTERNAL") throw new LoiCong("TOKEN_KHONG_HOP_LE");
    if (c.status === "SUSPENDED") throw new LoiCong("CLIENT_BI_KHOA");
    if (c.status !== "ACTIVE" || c.expiresAt.getTime() <= now.getTime()) throw new LoiCong("TOKEN_KHONG_HOP_LE");
    const u = c.serviceUser;
    // Không xét isActive — xem chú thích cùng chỗ ở `pipeline.ts`.
    if (!u.isServiceAccount || u.deletedAt) throw new LoiCong("TOKEN_KHONG_HOP_LE");
    if (!ipDuocPhep(ip, c.allowedIps)) {
      // Mật khẩu ĐÚNG từ máy lạ ⇒ mật khẩu đã lộ: khoá trước, điều tra sau (Phụ lục C).
      nk.flagged = true;
      await tuKhoaClient(c.id, "IP_LA", now);
      throw new LoiCong("IP_KHONG_DUOC_PHEP");
    }

    const rl = await rateLimit({ key: `agent-gw-token:${c.id}`, max: TRAN_XIN_TOKEN_MOI_PHUT, windowMs: 60_000 });
    if (!rl.success) {
      throw new LoiCong("VUOT_HAN_MUC", { thuLaiSauGiay: Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000)) });
    }

    const scopeXin = tachChuoiScope(form.get("scope"));
    if (scopeXin === null) throw new LoiScope();
    const chon = chonScopeChoToken(scopeXin, await docGrant(c.id), now);
    if (!chon.ok) throw new LoiScope();

    const token = sinhToken();
    const ttl = hanMuc.tokenTtlSec;
    await khoCong.agentAccessToken.create({
      data: {
        tokenHash: bamBiMat(token, pepper),
        clientId: c.id,
        scopes: chon.scopes,
        environment: moiTruongDb(mt),
        expiresAt: new Date(now.getTime() + ttl * 1000),
        ip,
      },
    });
    await ghiNhatKy(maYeuCau, nk, { ma: "OK", http: 200 }, batDau);
    await Promise.all([
      khoCong.agentClientSecret.update({ where: { id: secret.id }, data: { lastUsedAt: now } }),
      khoCong.agentClient.update({ where: { id: c.id }, data: { lastUsedAt: now } }),
    ]).catch(() => undefined);
    return traJson(
      { access_token: token, token_type: "Bearer", expires_in: ttl, scope: chon.scopes.join(" ") },
      200,
      { Pragma: "no-cache" },
    );
  } catch (e) {
    const loi = veLoiCong(e);
    const error =
      e instanceof LoiScope ? "invalid_scope" : e instanceof LoiGrantType ? "unsupported_grant_type" : maOauth(loi.ma, loi.http);
    if (!daGhiNhatKy) await ghiNhatKy(maYeuCau, nk, { ma: loi.ma, http: loi.http }, batDau).catch(() => undefined);
    return traLoi(loi, maYeuCau, { error });
  }
}

/**
 * Agent tự huỷ token đang cầm. Theo RFC 7009: token lạ/đã chết vẫn trả 200 để không thành
 * công cụ dò token. Chạy CẢ khi cổng đang tắt — thu hồi không bao giờ được bị chặn.
 *
 * ⚠️ Thiếu pepper thì TỪ CHỐI (500), không trả 200 (rà bảo mật 25/09, AG-XT-01): không băm
 * được thì không tra được token nào, và trả "ok" lúc đó là nói với agent rằng token đã chết
 * trong khi nó vẫn sống. RFC 7009 cho 200 với token KHÔNG HỢP LỆ, không phải với máy chủ hỏng.
 * (Đường khẩn cấp của người vận hành là Khoá/Thu hồi trên màn quản trị — không cần pepper.)
 */
export async function xuLyThuHoiToken(req: Request, env: Env = process.env): Promise<Response> {
  const batDau = Date.now();
  const maYeuCau = sinhMaYeuCau();
  const nk = nhatKyRong("oauth.revoke");
  const cho = await chanLuTheoIp("agent-gw-revoke-ip", ipNguonTinCay(req.headers, env), TRAN_LU_IP_THU_HOI);
  if (cho !== null) return traLoi(new LoiCong("VUOT_HAN_MUC", { thuLaiSauGiay: cho }), maYeuCau);
  try {
    const pepper = docPepperCong(env);
    if (!pepper) throw new LoiCong("NGUON_LOI");
    const raw = tachBearer(req.headers.get("authorization"));
    nk.ip = ipNguonTinCay(req.headers, env);
    if (raw) {
      const hash = bamBiMat(raw, pepper);
      const row = await khoCong.agentAccessToken.findUnique({ where: { tokenHash: hash }, select: { clientId: true } });
      if (row) {
        nk.clientId = row.clientId;
        await khoCong.agentAccessToken.updateMany({
          where: { tokenHash: hash, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    }
    await ghiNhatKy(maYeuCau, nk, { ma: "OK", http: 200 }, batDau).catch(() => undefined);
    return traJson({ ok: true, ma_yeu_cau: maYeuCau }, 200);
  } catch (e) {
    const loi = veLoiCong(e);
    await ghiNhatKy(maYeuCau, nk, { ma: loi.ma, http: loi.http }, batDau).catch(() => undefined);
    return traLoi(loi, maYeuCau);
  }
}
