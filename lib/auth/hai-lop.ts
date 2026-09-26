// lib/auth/hai-lop.ts — xác thực 2 lớp (TOTP) của MỘT người: cài, kiểm mã, đặt lại.
//
// Dùng làm "bước nâng" (step-up) trước thao tác nhạy cảm của Cổng dữ liệu agent: tạo/duyệt
// client, cấp quyền, sinh khoá (spec §0 nguyên tắc 2, §4.5). KHÔNG đổi luồng đăng nhập chung
// của satarobo — bật 2FA cho mọi người là một dự án riêng, còn ở đây chỉ người giữ quyền cổng
// mới cần, và chỉ ngay lúc thao tác.
//
// Bí mật TOTP phải đọc lại được để tính mã ⇒ MÃ HOÁ (AES-256-GCM, khoá ở env
// `TOTP_ENCRYPTION_KEY`), không băm. Thiếu khoá ⇒ từ chối cài và từ chối kiểm (fail closed).
import { db } from "@/lib/db";
import { docKhoaMaHoa, giaiMa, maHoa } from "@/lib/security/ma-hoa";
import { kiemMaTotp, sinhBiMatTotp, uriOtpAuth } from "./totp";

export const BIEN_KHOA_TOTP = "TOTP_ENCRYPTION_KEY";
/** Sai liên tiếp bao nhiêu lần thì tạm khoá, và khoá bao lâu. */
export const SAI_TOI_DA = 5;
export const KHOA_TRONG_MS = 15 * 60 * 1000;
const NHA_PHAT_HANH = "Sata Robo";

export class LoiHaiLop extends Error {
  constructor(
    readonly ma: "CHUA_CAU_HINH_KHOA" | "DA_BAT" | "CHUA_CAI",
    message: string,
  ) {
    super(message);
    this.name = "LoiHaiLop";
  }
}

function khoa(): Buffer {
  const k = docKhoaMaHoa(BIEN_KHOA_TOTP);
  if (!k) throw new LoiHaiLop("CHUA_CAU_HINH_KHOA", "Máy chủ chưa cấu hình khoá mã hoá xác thực 2 lớp.");
  return k;
}

export type TrangThaiHaiLop = { daBat: boolean; dangCai: boolean; khoaDen: Date | null };

export async function trangThaiHaiLop(userId: string, now: Date): Promise<TrangThaiHaiLop> {
  const r = await db.userTotp.findUnique({
    where: { userId },
    select: { enabledAt: true, lockedUntil: true },
  });
  return {
    daBat: !!r?.enabledAt,
    dangCai: !!r && !r.enabledAt,
    khoaDen: r?.lockedUntil && r.lockedUntil.getTime() > now.getTime() ? r.lockedUntil : null,
  };
}

/**
 * Bắt đầu cài: sinh bí mật mới (thay bí mật đang cài dở, nếu có). Đã BẬT thì từ chối — muốn
 * đổi máy phải nhờ người duyệt đặt lại (có lý do + audit), không tự ghi đè được.
 */
export async function batDauCaiHaiLop(
  userId: string,
  taiKhoan: string,
): Promise<{ biMat: string; uri: string }> {
  const k = khoa();
  const cu = await db.userTotp.findUnique({ where: { userId }, select: { enabledAt: true } });
  if (cu?.enabledAt) throw new LoiHaiLop("DA_BAT", "Xác thực 2 lớp đã bật.");
  const biMat = sinhBiMatTotp();
  const secretEnc = maHoa(biMat, k);
  await db.userTotp.upsert({
    where: { userId },
    create: { userId, secretEnc },
    update: { secretEnc, enabledAt: null, lastUsedStep: null, failedCount: 0, lockedUntil: null },
  });
  return { biMat, uri: uriOtpAuth({ biMat, taiKhoan, nhaPhatHanh: NHA_PHAT_HANH }) };
}

export type KetQuaKiemMa = "OK" | "SAI" | "TAM_KHOA" | "CHUA_BAT";

/**
 * Kiểm mã. `cheDo = "xac-nhan-cai"` dùng cho lần nhập ĐẦU (bật 2FA); `"thao-tac"` cho mọi lần
 * sau. Hai chế độ dùng CHUNG bộ đếm sai + chống phát lại.
 *
 * Chống phát lại + chống đua: chỉ nhận mã khi ghi được `lastUsedStep` mới bằng `updateMany`
 * có điều kiện "bước cũ nhỏ hơn" — hai request mang cùng mã chạy song song thì đúng MỘT cái
 * ghi được, cái kia bị coi là SAI (khuôn chống đua FIX-H9 của repo).
 */
export async function kiemMaHaiLop(
  userId: string,
  ma: string,
  now: Date,
  cheDo: "xac-nhan-cai" | "thao-tac" = "thao-tac",
): Promise<KetQuaKiemMa> {
  const r = await db.userTotp.findUnique({ where: { userId } });
  if (!r) return "CHUA_BAT";
  if (cheDo === "thao-tac" && !r.enabledAt) return "CHUA_BAT";
  if (cheDo === "xac-nhan-cai" && r.enabledAt) return "CHUA_BAT";
  if (r.lockedUntil && r.lockedUntil.getTime() > now.getTime()) return "TAM_KHOA";

  let biMat: string;
  try {
    biMat = giaiMa(r.secretEnc, khoa());
  } catch (e) {
    if (e instanceof LoiHaiLop) throw e;
    // Bản mã hỏng/sai khoá: không cho qua, không lộ lý do cho người gõ mã.
    return "SAI";
  }
  const buoc = kiemMaTotp(biMat, ma, now.getTime(), { buocDaDungCuoi: r.lastUsedStep });
  if (buoc !== null) {
    const up = await db.userTotp.updateMany({
      where: {
        userId,
        OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: buoc } }],
      },
      data: {
        lastUsedStep: buoc,
        failedCount: 0,
        lockedUntil: null,
        ...(cheDo === "xac-nhan-cai" ? { enabledAt: now } : {}),
      },
    });
    if (up.count === 1) return "OK";
    // Mã ĐÚNG nhưng bước đó vừa bị dùng (phát lại, hoặc thua một lượt song song cùng mã):
    // từ chối, nhưng KHÔNG cộng vào bộ đếm sai — không phạt người bấm đúp, và không để lượt
    // thua ghi đè lượt thắng (rà bảo mật 25/09, F1).
    return "SAI";
  }
  // Sai thật: cộng dồn NGUYÊN TỬ trong DB. Bản cũ ghi `r.failedCount + 1` từ lần ĐỌC TRƯỚC —
  // hai lượt song song cùng đọc 3 thì cùng ghi 4, và một lượt SAI có thể ghi đè lượt OK vừa
  // đặt lại bộ đếm.
  const sau = await db.userTotp.update({
    where: { userId },
    data: { failedCount: { increment: 1 } },
    select: { failedCount: true },
  });
  if (sau.failedCount < SAI_TOI_DA) return "SAI";
  await db.userTotp.updateMany({
    where: { userId, failedCount: { gte: SAI_TOI_DA } },
    data: { failedCount: 0, lockedUntil: new Date(now.getTime() + KHOA_TRONG_MS) },
  });
  return "TAM_KHOA";
}

/** Xoá 2FA của một người (mất điện thoại). Kiểm quyền + lý do + audit ở tầng gọi. */
export async function xoaHaiLop(userId: string): Promise<boolean> {
  const r = await db.userTotp.deleteMany({ where: { userId } });
  return r.count > 0;
}

/** Câu thông báo cho người dùng theo kết quả kiểm mã. */
export function thongDiepKiemMa(kq: Exclude<KetQuaKiemMa, "OK">): string {
  switch (kq) {
    case "CHUA_BAT":
      return "Bạn chưa bật xác thực 2 lớp — vào thẻ “Cài đặt” của Cổng dữ liệu agent để bật trước.";
    case "TAM_KHOA":
      return "Nhập sai mã quá nhiều lần — xác thực 2 lớp tạm khoá 15 phút.";
    case "SAI":
      return "Mã xác thực không đúng hoặc đã dùng.";
  }
}
