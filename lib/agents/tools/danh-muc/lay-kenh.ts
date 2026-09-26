// lib/agents/tools/danh-muc/lay-kenh.ts — công cụ 4 `danh_muc.lay_kenh` (spec §9).
// Khuôn: `schema/kenh.schema.json` — ma, ten.
//
// Chủ dự án chốt 26/09/2026: kênh = kênh LIÊN LẠC (`enum InboxChannel`), đúng nghĩa spec "mã
// của kênh là giá trị dùng trong trường `kenh` của lead và hội thoại". KHÔNG phải danh mục
// "nguồn lead" (`NGUON_LEAD`, id "1".."13") — đó là danh mục khác (BA Q-D5).
//
// Nguồn nhãn là `NHAN_KENH` (`lib/integrations/zalocrm/kenh.ts`) — `Record<InboxChannel,…>`
// đầy đủ, nên thêm kênh mới vào enum mà quên nhãn là build đỏ; công cụ tự có kênh mới.
// `ma` = giá trị enum viết thường (`ZALO_CA_NHAN` → `zalo_ca_nhan`) — suy ngược được, không
// cần bảng ánh xạ thứ hai. `LIVECHAT` (website) vẫn liệt kê dù chưa có đường vào: nó là giá
// trị hợp lệ mà hội thoại có thể mang.
//
// Không đọc DB: danh mục là hằng trong mã. Vẫn gác `inbox_channels:view` — mọi công cụ đi qua
// `can()` (luật cứng #1), không có công cụ "khỏi cần quyền".
import { z } from "zod";
import type { InboxChannel } from "@prisma/client";
import { NHAN_KENH } from "@/lib/integrations/zalocrm/kenh";
import { dinhNghiaCongCu } from "../kieu";
import { catTrang, kiemConTro, thamSoTrang } from "../trang";

const kenh = z.object({ ma: z.string(), ten: z.string() });

/** `ZALO_CA_NHAN` → `zalo_ca_nhan`. Dùng chung cho mọi công cụ trả trường `kenh`. */
export function maKenh(k: InboxChannel): string {
  return k.toLowerCase();
}

export const layKenh = dinhNghiaCongCu({
  ten: "danh_muc.lay_kenh",
  moTa:
    "Danh mục kênh liên lạc với khách (Zalo OA, Zalo cá nhân qua Zalo CRM, Messenger, website, " +
    "nhập tay): mã và tên. Mã là giá trị trường kenh của lead và hội thoại.",
  cheDo: "doc",
  nhayCam: "thap",
  quyenCan: ["inbox_channels:view"],
  thamSo: z.object({ ...thamSoTrang }).strict(),
  ketQua: z.array(kenh),
  dangDuLieu: "array",
  phienBanKhuon: "1.0",
  kiemThem: (i) => kiemConTro(i),
  async thucThi(ctx, i) {
    const ds = (Object.keys(NHAN_KENH) as InboxChannel[]).map((k) => ({ ma: maKenh(k), ten: NHAN_KENH[k] }));
    return catTrang(ds, i, ctx.hanMuc);
  },
});
