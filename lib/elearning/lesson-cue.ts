import { z } from "zod";
import { contentQuestionSchema } from "@/lib/assignments/question-content-db";
import type { ContentQuestion } from "@/lib/assignments/question-content";

/**
 * EL-12b — CÂU HỎI CHÈN GIỮA VIDEO (cơ chế 6 trong tám cơ chế chống học đối phó).
 *
 * Tệp thuần: không DB, không mạng, không giờ hệ thống.
 *
 * ⚠️ TÁI DÙNG khuôn câu hỏi đã có (`contentQuestionSchema`), KHÔNG khai khuôn thứ
 * hai. Repo đã có một định nghĩa "đáp án đúng" dùng chung cho bài tập, và một
 * khuôn riêng cho cue sẽ không hiển thị được bằng `question-view.tsx`, không nhập
 * được từ Word/Excel, không lọt bộ lọc ngân hàng câu hỏi. Hai định nghĩa cho cùng
 * một khái niệm là thứ sớm muộn trôi khỏi nhau.
 *
 * ⚠️ CHỈ NHẬN BA LOẠI CÂU: `single` · `multiple` · `boolean`.
 *
 * Đây KHÔNG phải chọn cho gọn. `isAutoGraded()` của repo trả `true` cho 6/8 loại,
 * nhưng repo **không có một đoạn mã nào chấm** `fill`, `matching`, `ordering`. Mà
 * cue mặc định CHẶN video. Một câu không ai chấm được đặt trong một cổng chặn
 * nghĩa là **video khoá cứng vĩnh viễn**, và người học không có đường nào đi tiếp
 * ngoài bỏ bài. Chặn ở tầng máy, không nhắc suông trong tài liệu.
 */

/** Loại câu hỏi dùng được trong cue — đúng ba loại chấm được thật. */
export const LOAI_CUE = ["single", "multiple", "boolean"] as const;
export type LoaiCue = (typeof LOAI_CUE)[number];

export type CauHoiCue = Extract<ContentQuestion, { type: LoaiCue }>;

/** Trần số cue trên một bài. */
export const CUE_TOI_DA = 5;

export function laCauChamDuoc(q: ContentQuestion): q is CauHoiCue {
  return (LOAI_CUE as readonly string[]).includes(q.type);
}

/**
 * Khuôn của `TrnLessonCue.inlineJson`.
 *
 * Cột này khai `Json?` ở schema và `z.unknown()` ở validator — tức KHÔNG có hình
 * dạng. Trước khi bất kỳ đầu nào đọc nó, hình dạng phải tồn tại; nếu không thì
 * "câu hỏi hỏng" và "câu hỏi hợp lệ" trông giống hệt nhau cho tới lúc chạy.
 */
export const cueInlineSchema = contentQuestionSchema.refine(
  (q) => (LOAI_CUE as readonly string[]).includes(q.type),
  {
    message: `Câu hỏi chèn giữa video chỉ nhận loại: ${LOAI_CUE.join(", ")} — các loại khác hệ thống không chấm tự động được, và video sẽ khoá cứng`,
  },
);

// ── Chấm ────────────────────────────────────────────────────────────────────

/**
 * Chấm một câu cue.
 *
 * ⚠️ Chấm ở SERVER. Client gửi lên lựa chọn, KHÔNG gửi lên "đúng/sai" — nhận kết
 * luận từ client là để người ta gửi thẳng `{dung:true}` và bỏ qua toàn bộ cơ chế.
 *
 * `dapAn` là chuỗi vì nó đi qua thân yêu cầu HTTP:
 *  · `single`   → chỉ số, vd `"2"`
 *  · `multiple` → danh sách chỉ số ngăn bằng dấu phẩy, vd `"0,3"`
 *  · `boolean`  → `"true"` / `"false"`
 */
export function chamCue(q: CauHoiCue, dapAn: string | null | undefined): boolean {
  if (dapAn == null) return false;
  const s = dapAn.trim();
  if (s === "") return false;

  switch (q.type) {
    case "single": {
      const i = Number(s);
      return Number.isInteger(i) && i === q.correctIndex;
    }
    case "boolean":
      // ⚠️ Kiểm đáp án có HỢP LỆ trước, rồi mới so. Viết thẳng
      // `(s === "true") === q.correct` thì một chuỗi rác cho ra `false`, và với
      // câu có đáp án đúng là "Sai" thì `false === false` ⇒ RÁC ĐƯỢC CHẤM ĐÚNG.
      // Nửa số câu đúng/sai trở thành câu ai gửi gì cũng qua.
      if (s !== "true" && s !== "false") return false;
      return (s === "true") === q.correct;
    case "multiple": {
      const chon = s
        .split(",")
        .map((x) => Number(x.trim()))
        .filter((x) => Number.isInteger(x));
      // So như TẬP HỢP: thứ tự bấm không phải là một phần của đáp án, và thiếu
      // vế "đủ số lượng" thì chọn đại một ý đúng cũng được tính là đúng.
      const dung = new Set(q.correctIndices);
      if (chon.length !== dung.size) return false;
      return chon.every((x) => dung.has(x));
    }
  }
}

/**
 * Phần câu hỏi được phép GỬI XUỐNG cho người học.
 *
 * ⚠️ Bơm cả cục `inlineJson` xuống là gửi kèm đáp án đúng trong thân phản hồi.
 * Không ai thấy trên màn hình, nhưng nó nằm trong tab Network và trong mọi bộ nhớ
 * đệm — và cơ chế chống học đối phó bị vô hiệu bằng một cú F12.
 */
export function locCauHoiChoNguoiHoc(q: CauHoiCue): {
  cauHoi: string;
  luaChon: { ma: string; nhan: string }[];
} {
  if (q.type === "boolean") {
    return {
      cauHoi: q.question,
      luaChon: [
        { ma: "true", nhan: "Đúng" },
        { ma: "false", nhan: "Sai" },
      ],
    };
  }
  return {
    cauHoi: q.question,
    luaChon: q.options.map((o, i) => ({ ma: String(i), nhan: o })),
  };
}

// ── Sổ trả lời cue ──────────────────────────────────────────────────────────

/**
 * Khuôn của `TrnLessonProgress.cueLogJson`.
 *
 * ⚠️ TÁCH ĐÔI THEO MỤC ĐÍCH, không xếp cả cục vào một tầng lưu trữ.
 *
 * Đặc tả nói ngược nhau về việc sổ này thuộc tầng 1 (giữ dài) hay tầng 2 (dọn 90
 * ngày) — nó nằm trong khối "cột giám sát GĐ2" nhưng lại được liệt kê ở cột "giữ".
 * Thay vì đoán, khuôn này dựng sẵn ĐƯỜNG CẮT:
 *
 *  · `xong[]` = BẰNG CHỨNG. Nó điều kiện hoá việc một bài BẮT BUỘC có hạn chót
 *    cứng được coi là hoàn thành; xoá nó là xoá lý do một người được ghi "đã xong".
 *  · `hanhVi[]` = CHI TIẾT HÀNH VI (hỏi lúc nào, trả lời lúc nào, sai mấy lần).
 *    Đây mới là thứ bản thông báo hứa dọn sau 90 ngày.
 *
 * Chốt theo hướng nào thì cron cũng chỉ cần xoá đúng một khoá. Không có đường cắt
 * này thì chốt sai phải viết script vá dữ liệu người thật.
 */
export const cueLogSchema = z
  .object({
    v: z.literal(1),
    /** Câu ĐANG treo. Chỉ một — video chỉ dừng được ở một chỗ. */
    treo: z
      .union([
        z.null(),
        z.object({
          cueId: z.string().min(1),
          hoiLuc: z.string().min(1),
          soLanSai: z.number().int().min(0),
        }),
      ])
      .optional(),
    /** TẦNG 1 — bằng chứng, giữ dài. */
    xong: z.array(z.object({ cueId: z.string().min(1), dung: z.boolean() })),
    /** TẦNG 2 — chi tiết hành vi, dọn theo hạn 90 ngày. */
    hanhVi: z
      .array(
        z.object({
          cueId: z.string().min(1),
          askedAt: z.string(),
          answeredAt: z.string(),
          soLanSai: z.number().int().min(0),
        }),
      )
      .optional(),
  })
  .strict();

export type SoCue = z.infer<typeof cueLogSchema>;

export const SO_CUE_RONG: SoCue = { v: 1, treo: null, xong: [], hanhVi: [] };

/**
 * Đọc sổ từ cột JSON.
 *
 * Sổ hỏng ⇒ trả sổ RỖNG, không ném. Một bản ghi JSON sai khuôn không được phép
 * chặn người học xem tiếp — hậu quả tệ hơn nhiều so với việc hỏi lại một câu.
 */
export function docSoCue(raw: unknown): SoCue {
  const r = cueLogSchema.safeParse(raw);
  if (!r.success) return { ...SO_CUE_RONG, xong: [], hanhVi: [] };
  return r.data;
}

export function daXongCue(so: SoCue, cueId: string): boolean {
  return so.xong.some((x) => x.cueId === cueId);
}

// ── Chọn cue để hỏi ─────────────────────────────────────────────────────────

export type CueRut = {
  id: string;
  atSec: number;
  blocking: boolean;
};

/**
 * Cue nào cần bung trong nhịp này.
 *
 * ⚠️ Bắt theo KHOẢNG VỪA XEM `(tuSec, denSec]`, tuyệt đối không theo vị trí con
 * trỏ. Con trỏ luôn chạy trước mốc đã ghi — đây đúng con bug từng suýt chặn đứng
 * cả sản phẩm ở `chanTuaToi`, và ở đây nó sẽ biểu hiện thành "cue bung sai chỗ,
 * hoặc không bao giờ bung".
 *
 * ⚠️ Mở ngoặc ở `tuSec`: khoảng của nhịp trước đã kết ở đúng giây đó, nên đóng cả
 * hai đầu là hỏi lại cue nằm ngay ranh giới ở mỗi nhịp.
 *
 * Nhiều cue trong một khoảng ⇒ lấy cue SỚM NHẤT. Lấy cái muộn nhất là nhảy qua
 * đầu người học một câu hỏi họ chưa từng thấy.
 */
export function chonCueDeHoi(input: {
  cues: CueRut[];
  tuSec: number;
  denSec: number;
  so: SoCue;
}): CueRut | null {
  const { tuSec, denSec } = input;
  if (!(denSec > tuSec)) return null;

  const ung = input.cues
    .filter((c) => c.atSec > tuSec && c.atSec <= denSec)
    .filter((c) => !daXongCue(input.so, c.id))
    .sort((a, b) => a.atSec - b.atSec);

  return ung[0] ?? null;
}

/** Id thách thức loại CUE — tiền tố RIÊNG, không đụng `attn-`. */
export function idCue(cueId: string): string {
  return `cue-${cueId}`;
}

/**
 * Lấy `cueId` từ id thách thức, và từ chối nếu tiền tố không phải của cue.
 *
 * ⚠️ Vì sao phải kiểm tiền tố chứ không chỉ cắt chuỗi: hai loại thách thức
 * (`attn-` và `cue-`) đi chung một đường trả lời. Không kiểm thì câu trả lời của
 * loại này được ghi nhận cho loại kia, và không cách nào phát hiện — vì cả hai đều
 * "hợp lệ" theo nghĩa cú pháp.
 */
export function cueIdTu(id: string | null | undefined): string | null {
  if (!id || !id.startsWith("cue-")) return null;
  const s = id.slice(4);
  return s.length > 0 ? s : null;
}
