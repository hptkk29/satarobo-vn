// lib/finance/hoan-tien-do-lech.ts — BƯỚC 1 "ĐO TRƯỚC" của đợt vá hoàn tiền (27/08/2026).
//
// Phần THUẦN của script rà soát `scripts/hoan-tien-do-lech-cong-no.ts`. Script chỉ lo
// đọc DB và in bảng; mọi phép so lệch nằm ở đây để test được không cần Postgres — và để
// nó KHÔNG BAO GIỜ trôi khỏi công thức thật: `daThuCachDung` gọi thẳng `tinhThucThu` và
// `congNoCachDung` gọi thẳng `computeEnrollmentDebt`, không chép lại một dòng nào.
//
// VÌ SAO CẦN ĐO TRƯỚC: đợt vá đổi con số phụ huynh ĐANG NHÌN THẤY. Tiền lệ B-02
// (`lib/finance/thuc-thu.ts`, §B.6.8) đã dạy một bài đắt — ở đó người ta báo trước là
// "doanh thu sẽ TỤT", đo xong mới thấy có màn NHẢY LÊN, và phải viết lại thông báo.
// ⇒ Chạy script này trên PROD, đọc số thật, RỒI mới soạn câu chữ. Đừng hứa chiều nào
// trước khi đo.
import {
  tinhThucThu,
  butToanThucThu,
  type ThucThuButToan,
} from "@/lib/finance/thuc-thu";
import { computeEnrollmentDebt } from "@/lib/finance/debt";

/** Nhãn cảnh báo — gom cố định để ĐẾM được; đừng nội suy chuỗi tự do. */
export const CANH_BAO = {
  PH_THAY_SO_TUT: "Phụ huynh sẽ thấy số ĐÃ THU giảm",
  PH_THAY_SO_TANG: "Phụ huynh sẽ thấy số ĐÃ THU tăng",
  CONG_NO_TANG: "Công nợ tăng sau khi vá",
  CONG_NO_GIAM: "Công nợ giảm sau khi vá",
  CO_DIEU_CHINH: "Có bút toán điều chỉnh (bản gốc đang bị đếm)",
  HOAN_NHIEU_LAN: "Đã hoàn từ 2 lần trở lên",
  HOAN_QUA_SO_DA_THU: "🔴 Tổng đã hoàn VƯỢT tổng đã thu — tiền ra nhiều hơn tiền vào",
  DUYET_HOAN_CHUA_GHI_SO: "🔴 Đã duyệt hoàn nhưng kế toán chưa ghi bút toán âm",
  DE_XUAT_VUOT_SO_DA_THU: "🔴 Tổng đề xuất đã duyệt VƯỢT tổng đã thu",
} as const;

/** 1 ghi danh cần đo — dữ kiện đã nạp sẵn, không chạm DB. */
export type GhiDanhCanDo = {
  enrollmentId: string;
  studentName: string | null;
  courseName: string | null;
  className: string | null;
  centerName: string | null;
  /** `Enrollment.status` — quyết định ghi danh có thuộc nhóm ĐÃ RỜI LỚP không. */
  enrollmentStatus: string | null;
  finalPrice: number;
  /** MỌI bút toán còn sống của ghi danh (kể cả PENDING/REJECTED — hàm tự lọc). */
  butToan: ThucThuButToan[];
  /** Σ `approvedAmount` của RefundRequest APPROVED/PAID. */
  hoanDaDuyet: number;
  /** Số RefundRequest của ghi danh (mọi trạng thái). */
  soDeXuatHoan: number;
};

export type DongDoLech = {
  enrollmentId: string;
  studentName: string | null;
  courseName: string | null;
  className: string | null;
  centerName: string | null;
  enrollmentStatus: string | null;
  finalPrice: number;
  /** Cách tính HIỆN TẠI — đúng thứ phụ huynh đang nhìn thấy (chỉ Σ CONFIRMED). */
  daThuCachCu: number;
  /** Cách tính ĐÚNG — `tinhThucThu`. */
  daThuCachDung: number;
  /** ÂM = số phụ huynh thấy sẽ giảm. */
  chenhLechDaThu: number;
  congNoCachCu: number;
  congNoCachDung: number;
  chenhLechCongNo: number;
  soLanHoan: number;
  /** Σ |amount| của bút toán REFUNDED (số DƯƠNG). */
  tongDaHoan: number;
  hoanDaDuyet: number;
  /** Đã duyệt nhưng chưa ghi bút toán âm — mẫu số của đề xuất kế tiếp sẽ phồng đúng bằng đây. */
  hoanChuaGhiSo: number;
  soDeXuatHoan: number;
  canhBao: string[];
};

/** Σ đã thu theo cách CŨ: chỉ khoản CONFIRMED — không trừ hoàn, không theo bản điều chỉnh. */
function daThuCachCu(butToan: ThucThuButToan[]): number {
  return butToan
    .filter((p) => p.accountantStatus === "CONFIRMED")
    .reduce((s, p) => s + p.amount, 0);
}

/** THUẦN — so lệch 1 ghi danh giữa cách tính hiện tại và cách tính đúng. */
export function doLechGhiDanh(g: GhiDanhCanDo): DongDoLech {
  const cu = daThuCachCu(g.butToan);
  const dung = tinhThucThu(g.butToan);

  // Công nợ CŨ: đúng công thức đang chạy trên prod — finalPrice − Σ CONFIRMED, không
  // có miễn trừ nào cho ghi danh đã rời lớp (vì bút toán âm vốn đã bị bỏ qua).
  const congNoCu = g.finalPrice - cu;
  const congNoDung = computeEnrollmentDebt(g.finalPrice, g.butToan, g.enrollmentStatus);

  const hoan = g.butToan.filter((p) => p.accountantStatus === "REFUNDED");
  const soLanHoan = hoan.length;
  const tongDaHoan = Math.abs(hoan.reduce((s, p) => s + p.amount, 0));
  const hoanChuaGhiSo = Math.max(0, g.hoanDaDuyet - tongDaHoan);

  // Tổng đã thu GỘP (chưa trừ hoàn) — mốc để biết tiền ra có vượt tiền vào không.
  const thuGop = tinhThucThu(g.butToan.filter((p) => p.accountantStatus !== "REFUNDED"));

  const canhBao: string[] = [];
  if (dung < cu) canhBao.push(CANH_BAO.PH_THAY_SO_TUT);
  if (dung > cu) canhBao.push(CANH_BAO.PH_THAY_SO_TANG);
  if (congNoDung > congNoCu) canhBao.push(CANH_BAO.CONG_NO_TANG);
  if (congNoDung < congNoCu) canhBao.push(CANH_BAO.CONG_NO_GIAM);
  if (butToanThucThu(g.butToan).some((p) => p.accountantStatus === "ADJUSTED")) {
    canhBao.push(CANH_BAO.CO_DIEU_CHINH);
  }
  if (soLanHoan >= 2) canhBao.push(CANH_BAO.HOAN_NHIEU_LAN);
  if (tongDaHoan > thuGop) canhBao.push(CANH_BAO.HOAN_QUA_SO_DA_THU);
  if (hoanChuaGhiSo > 0) canhBao.push(CANH_BAO.DUYET_HOAN_CHUA_GHI_SO);
  if (g.hoanDaDuyet > thuGop) canhBao.push(CANH_BAO.DE_XUAT_VUOT_SO_DA_THU);

  return {
    enrollmentId: g.enrollmentId,
    studentName: g.studentName,
    courseName: g.courseName,
    className: g.className,
    centerName: g.centerName,
    enrollmentStatus: g.enrollmentStatus,
    finalPrice: g.finalPrice,
    daThuCachCu: cu,
    daThuCachDung: dung,
    chenhLechDaThu: dung - cu,
    congNoCachCu: congNoCu,
    congNoCachDung: congNoDung,
    chenhLechCongNo: congNoDung - congNoCu,
    soLanHoan,
    tongDaHoan,
    hoanDaDuyet: g.hoanDaDuyet,
    hoanChuaGhiSo,
    soDeXuatHoan: g.soDeXuatHoan,
    canhBao,
  };
}

export type TomTatDoLech = {
  soGhiDanh: number;
  /** Số ghi danh có ÍT NHẤT một con số đổi. */
  soGhiDanhLech: number;
  tongDaThuCachCu: number;
  tongDaThuCachDung: number;
  tongChenhLech: number;
  tongCongNoCachCu: number;
  tongCongNoCachDung: number;
  tongDaHoan: number;
  demCanhBao: Record<string, number>;
};

/** THUẦN — cộng dồn các dòng đã đo. */
export function tomTatDoLech(rows: DongDoLech[]): TomTatDoLech {
  const t: TomTatDoLech = {
    soGhiDanh: rows.length,
    soGhiDanhLech: 0,
    tongDaThuCachCu: 0,
    tongDaThuCachDung: 0,
    tongChenhLech: 0,
    tongCongNoCachCu: 0,
    tongCongNoCachDung: 0,
    tongDaHoan: 0,
    demCanhBao: {},
  };
  for (const r of rows) {
    t.tongDaThuCachCu += r.daThuCachCu;
    t.tongDaThuCachDung += r.daThuCachDung;
    t.tongChenhLech += r.chenhLechDaThu;
    t.tongCongNoCachCu += r.congNoCachCu;
    t.tongCongNoCachDung += r.congNoCachDung;
    t.tongDaHoan += r.tongDaHoan;
    if (r.chenhLechDaThu !== 0 || r.chenhLechCongNo !== 0) t.soGhiDanhLech += 1;
    for (const c of r.canhBao) t.demCanhBao[c] = (t.demCanhBao[c] ?? 0) + 1;
  }
  return t;
}
