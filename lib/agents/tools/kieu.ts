// lib/agents/tools/kieu.ts — kiểu của SỔ CÔNG CỤ (spec §3). Mỗi công cụ khai ĐÚNG MỘT LẦN;
// cả ba lối vào (nội bộ, REST, MCP) đọc cùng một sổ.
import { z } from "zod";
import type { Actor } from "@/lib/auth/actor";
import type { scopedDb } from "@/lib/db-scope";
import type { CheDo } from "../gateway/kiem-grant";
import { LoiCong } from "../gateway/loi";
import { laTenSoHopLe, tenMcp } from "../ten-cong-cu";

export type MucNhayCam = "thap" | "tb" | "cao";

/** Những gì pipeline đưa cho công cụ. Công cụ KHÔNG tự lấy thêm gì khác. */
export type NguCanhCongCu = {
  /** Actor của USER DỊCH VỤ (không bao giờ là SYSTEM_ACTOR). */
  actor: Actor;
  /** `scopedDb(actor)` — đường DUY NHẤT công cụ được đọc dữ liệu nghiệp vụ. */
  sdb: ReturnType<typeof scopedDb>;
  /** Mã cơ sở hiệu lực của lượt gọi (đã giao với grant ở bước 9). Công cụ PHẢI lọc theo nó. */
  phamViCoSo: readonly string[];
  /** Có che dữ liệu cá nhân không (công cụ CAO; luôn true trừ khi grant cho xem gốc). */
  cheDuLieu: boolean;
  maYeuCau: string;
  now: Date;
  hanMuc: { maxRowsPerCall: number; maxRangeDays: number };
};

export type KetQuaCongCu<O> = { duLieu: O; tiepTheo: string | null };

/** Khai báo một công cụ — có kiểu đầy đủ. */
export interface CongCuAgent<I, O> {
  /** Tên sổ `<nhóm>.<động_từ>_<đối_tượng>`. */
  ten: string;
  /** Mô tả tiếng Việt cho Claude đọc. */
  moTa: string;
  cheDo: CheDo;
  nhayCam: MucNhayCam;
  /**
   * Mã quyền RBAC v2 mà user dịch vụ PHẢI có (bước 10: `can(actor, quyền)`, KHÔNG target —
   * nên quyền phải là GLOBAL ở vai dịch vụ). Thiếu một quyền ⇒ 403, kể cả khi grant còn.
   */
  quyenCan: readonly string[];
  /** Khuôn tham số — `.strict()`: tham số lạ bị từ chối (ca B7). */
  thamSo: z.ZodType<I>;
  /** Khuôn trường `du_lieu` — khớp `schema/<khuôn>.schema.json` của xưởng. Kiểm cả đầu RA. */
  ketQua: z.ZodType<O>;
  /** "array" = `du_lieu` là mảng (so_ban_ghi = độ dài), "object" = một đối tượng. */
  dangDuLieu: "array" | "object";
  /** Cơ sở mà tham số xin (null = không chỉ định ⇒ toàn bộ phạm vi grant). */
  coSoCuaThamSo?: (i: I) => readonly string[] | null;
  /** Công cụ CAO: tham số `che_du_lieu` (undefined = mặc định che). */
  cheDuLieuCuaThamSo?: (i: I) => boolean | undefined;
  /** Kiểm thêm sau zod (vd khoảng ngày ≤ hạn mức) — trả TÊN trường sai, không giá trị. */
  kiemThem?: (i: I, hanMuc: NguCanhCongCu["hanMuc"]) => string[];
  thucThi: (ctx: NguCanhCongCu, i: I) => Promise<KetQuaCongCu<O>>;
  /** Bắt buộc với nhayCam = "cao" — công cụ CAO thiếu hàm này KHÔNG đăng ký được (bước 11). */
  cheDuLieu?: (o: O, ctx: NguCanhCongCu) => O;
  phienBanKhuon: "1.0";
}

/** Lượt gọi đã qua kiểm tham số — giữ giá trị đã parse trong closure, không lộ kiểu ra ngoài. */
export type LuotDaChuanBi = {
  coSoYeuCau: readonly string[] | null;
  cheDuLieuYeuCau: boolean | undefined;
  chay: (ctx: NguCanhCongCu) => Promise<KetQuaCongCu<unknown>>;
  che: (duLieu: unknown, ctx: NguCanhCongCu) => unknown;
};

/** Công cụ trong sổ, đã xoá kiểu để xếp chung một danh sách. */
export type CongCuDaDangKy = {
  ten: string;
  tenMcp: string;
  moTa: string;
  cheDo: CheDo;
  nhayCam: MucNhayCam;
  quyenCan: readonly string[];
  dangDuLieu: "array" | "object";
  phienBanKhuon: "1.0";
  thamSoJsonSchema: () => unknown;
  /** Bước 8. Sai ⇒ ném `LoiCong("THAM_SO_SAI")` kèm TÊN trường, không kèm giá trị. */
  chuanBi: (thamSoTho: unknown, hanMuc: NguCanhCongCu["hanMuc"]) => LuotDaChuanBi;
  /** Bước 12 — dữ liệu có đúng khuôn không. */
  dungKhuon: (duLieu: unknown) => boolean;
};

function tenTruong(path: readonly PropertyKey[]): string {
  return path.length ? path.map(String).join(".") : "(gốc)";
}

export function dinhNghiaCongCu<I, O>(c: CongCuAgent<I, O>): CongCuDaDangKy {
  if (!laTenSoHopLe(c.ten)) throw new Error(`Tên công cụ sai khuôn: ${c.ten}`);
  if (c.nhayCam === "cao" && !c.cheDuLieu) {
    throw new Error(`Công cụ CAO "${c.ten}" thiếu hàm che dữ liệu — không được đăng ký (spec §5.6 bước 11).`);
  }
  return {
    ten: c.ten,
    tenMcp: tenMcp(c.ten),
    moTa: c.moTa,
    cheDo: c.cheDo,
    nhayCam: c.nhayCam,
    quyenCan: c.quyenCan,
    dangDuLieu: c.dangDuLieu,
    phienBanKhuon: c.phienBanKhuon,
    thamSoJsonSchema: () => z.toJSONSchema(c.thamSo),
    chuanBi(thamSoTho, hanMuc) {
      const p = c.thamSo.safeParse(thamSoTho);
      if (!p.success) {
        throw new LoiCong("THAM_SO_SAI", {
          truongSai: [...new Set(p.error.issues.map((i) => tenTruong(i.path)))],
        });
      }
      const input = p.data;
      const sai = c.kiemThem?.(input, hanMuc) ?? [];
      if (sai.length > 0) throw new LoiCong("THAM_SO_SAI", { truongSai: sai });
      return {
        coSoYeuCau: c.coSoCuaThamSo?.(input) ?? null,
        cheDuLieuYeuCau: c.cheDuLieuCuaThamSo?.(input),
        chay: (ctx) => c.thucThi(ctx, input),
        che: (duLieu, ctx) => (c.cheDuLieu ? c.cheDuLieu(duLieu as O, ctx) : duLieu),
      };
    },
    dungKhuon: (duLieu) => c.ketQua.safeParse(duLieu).success,
  };
}
