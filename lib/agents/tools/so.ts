// lib/agents/tools/so.ts — SỔ CÔNG CỤ: nguồn duy nhất cho cả ba lối vào (spec §3).
//
// Thêm công cụ = thêm MỘT dòng vào `DANH_SACH` + quyền đọc tương ứng cho vai dịch vụ
// (`prisma/seed-roles.ts`, vai `AGENT_*`). Không có đường nào gọi công cụ ngoài sổ này.
//
// ⚠️ Đợt 0 chỉ nhận công cụ ĐỌC. Công cụ ghi cần chữ ký + nonce + Idempotency-Key (spec §4.4)
// và hộp duyệt nháp — chưa có ⇒ sổ từ chối đăng ký, không để một công cụ ghi lọt qua cổng
// thiếu lớp bảo vệ.
import type { CongCuDaDangKy } from "./kieu";
import { layCoSo } from "./danh-muc/lay-co-so";
import { layKhoaHoc } from "./danh-muc/lay-khoa-hoc";
import { layNhanSu } from "./danh-muc/lay-nhan-su";
import { layKenh } from "./danh-muc/lay-kenh";
import { layChucDanh } from "./danh-muc/lay-chuc-danh";
import { layDangKy } from "./kinh-doanh/lay-dang-ky";
import { layChiTieu } from "./kinh-doanh/lay-chi-tieu";
import { layKhuyenMaiHieuLuc } from "./van-ban/lay-khuyen-mai-hieu-luc";

// Thứ tự = thứ tự bảng §9 của spec (danh sách công cụ trả cho agent theo đúng thứ tự này).
// Đợt 1 (26/09/2026): công cụ 2, 3, 4, 5, 9, 10, 14. Còn lại: 6–8 (Đợt 3, dữ liệu CAO),
// 11–13 (marketing — chưa có nguồn).
const DANH_SACH: readonly CongCuDaDangKy[] = [
  layCoSo,
  layKhoaHoc,
  layNhanSu,
  layKenh,
  layChucDanh,
  layDangKy,
  layChiTieu,
  layKhuyenMaiHieuLuc,
];

export function kiemSo(ds: readonly CongCuDaDangKy[]): ReadonlyMap<string, CongCuDaDangKy> {
  const m = new Map<string, CongCuDaDangKy>();
  const mcp = new Set<string>();
  for (const c of ds) {
    if (m.has(c.ten)) throw new Error(`Trùng tên công cụ: ${c.ten}`);
    if (mcp.has(c.tenMcp)) throw new Error(`Trùng tên MCP: ${c.tenMcp}`);
    if (c.cheDo !== "doc") throw new Error(`Công cụ ghi "${c.ten}" chưa được phép ở Đợt 0.`);
    if (c.quyenCan.length === 0) throw new Error(`Công cụ "${c.ten}" không khai quyền RBAC nào.`);
    m.set(c.ten, c);
    mcp.add(c.tenMcp);
  }
  return m;
}

const SO = kiemSo(DANH_SACH);

export function timCongCu(ten: string): CongCuDaDangKy | null {
  return SO.get(ten) ?? null;
}

export function tatCaCongCu(): readonly CongCuDaDangKy[] {
  return DANH_SACH;
}

/** Tên các công cụ nhạy cảm CAO — để đếm hạn mức bản ghi/ngày (spec §7.4). */
export function tenCongCuCao(): string[] {
  return DANH_SACH.filter((c) => c.nhayCam === "cao").map((c) => c.ten);
}

