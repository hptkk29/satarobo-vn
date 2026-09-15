/**
 * NHẬP LẠI MỘT LEAD ĐÃ CÓ — luật ghi đè. Hàm THUẦN, không chạm DB.
 *
 * ── VÌ SAO TÁCH RA MỘT TỆP RIÊNG ─────────────────────────────────────────────────────────
 * Đây là chỗ DUY NHẤT trong repo cố ý ghi đè dữ liệu người dùng đã nhập tay. Mọi đường khác
 * chỉ thêm. Một phép ghi đè viết lỏng tay không ném lỗi, không làm test đỏ, và không ai phát
 * hiện cho tới khi Sale mở lead ra và thấy ghi chú cuộc gọi của mình biến mất — lúc đó không
 * khôi phục được.
 *
 * Nên luật nằm ở một hàm thuần, có tên, có test, thay vì trải ra trong một route handler cần
 * auth + phân tích xlsx mới chạy tới (luật 12b).
 *
 * ── CHỐT CỦA CHỦ DỰ ÁN 15/09/2026 ────────────────────────────────────────────────────────
 * "khi nhập thì sẽ ghi đè các thông tin cũ, thông tin nào chưa có thì fill vào".
 *
 * Tức file THẮNG ở ô nào file có giá trị; ô nào file để trống thì giữ nguyên giá trị cũ.
 * Để trống KHÔNG phải là lệnh xoá — người nhập bỏ trống vì họ không biết, không phải vì họ
 * muốn xoá. Đây là khác biệt quan trọng nhất của cả tệp này.
 *
 * ── HAI CỘT ĐƯỢC BẢO VỆ (chủ dự án chọn đích danh) ───────────────────────────────────────
 * · `note`   — nhật ký gọi điện do Sale tự gõ. KHÔNG ghi đè, chỉ NỐI THÊM.
 * · `status` — trạng thái phễu. File nhập không có cột này, nhưng nếu đẩy một lead đang ở
 *              L3 về MOI thì báo cáo phễu và hoa hồng lệch theo. Không bao giờ đụng tới.
 *
 * `centerId` CỐ Ý KHÔNG được bảo vệ — chủ dự án đã cân nhắc và chọn cho file thắng. Hệ quả
 * phải biết: đổi cơ sở là lead rời khỏi tầm nhìn của sale cũ (`Lead` nằm trong
 * `SCOPED_MODELS`). Phép kiểm phạm vi ở route vẫn chặn ghi vào cơ sở mà người nhập không
 * thấy — đó là cổng an ninh, không phải tuỳ chọn.
 */

/** Giá trị file mang tới. `undefined`/`null`/chuỗi rỗng đều nghĩa là "file không nói gì". */
export interface OLeadTuFile {
  parentName?: string | null;
  email?: string | null;
  childName?: string | null;
  childAge?: number | null;
  centerId?: string | null;
  orgUnitId?: string | null;
  courseId?: string | null;
  source?: string | null;
  note?: string | null;
}

/** Ảnh chụp lead đang có trong hệ thống. */
export interface OLeadDangCo {
  parentName?: string | null;
  email?: string | null;
  childName?: string | null;
  childAge?: number | null;
  centerId?: string | null;
  orgUnitId?: string | null;
  courseId?: string | null;
  source?: string | null;
  note?: string | null;
}

export interface BanCapNhatLead {
  /** Chỉ chứa cột THỰC SỰ đổi — cột không đổi không có mặt, để `updatedAt` nói thật. */
  data: Record<string, unknown>;
  /** Nhãn tiếng Việt của những cột vừa đổi, dùng dựng dòng nhật ký. */
  daDoi: string[];
  /** Ghi chú trong file đã được nối thêm chưa. */
  daNoiGhiChu: boolean;
}

/** Nhãn người vận hành đọc được. Khoá phải trùng tên cột Prisma. */
const NHAN: Record<string, string> = {
  parentName: "tên phụ huynh",
  email: "email",
  childName: "tên con",
  childAge: "tuổi con",
  centerId: "cơ sở",
  courseId: "khoá quan tâm",
  source: "nguồn",
};

/**
 * Cột ĐƯỢC PHÉP ghi đè, theo đúng thứ tự hiện trong nhật ký.
 *
 * ⚠️ `orgUnitId` KHÔNG có trong danh sách này dù nó cũng đổi theo cơ sở: nó là bản ghi kép
 * của `centerId` (`lib/org/dual-write.ts` cắm ở `lib/db.ts` tự lo). Liệt kê nó ra đây là
 * nhật ký báo "đã đổi 2 cột" cho một thay đổi mà người vận hành chỉ thấy là một.
 */
const COT_GHI_DE = [
  "parentName",
  "email",
  "childName",
  "childAge",
  "centerId",
  "courseId",
  "source",
] as const;

/** Có phải "file không nói gì" không. `0` là giá trị THẬT, đừng để `!x` nuốt mất. */
function trong(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

/** So sánh để biết có thực sự đổi không — chuỗi so sau khi cắt khoảng trắng hai đầu. */
function khac(a: unknown, b: unknown): boolean {
  if (typeof a === "string" && typeof b === "string") return a.trim() !== b.trim();
  return a !== b;
}

/**
 * NỐI ghi chú mới xuống dưới ghi chú cũ.
 *
 * Bỏ qua khi nội dung mới ĐÃ nằm trong ghi chú cũ — nhập lại cùng một file hai lần là
 * chuyện thường (người vận hành sửa vài dòng rồi nhập lại cả file), và mỗi lần nối thêm một
 * bản sao thì sau ba lượt ô ghi chú không đọc được nữa.
 */
export function noiGhiChu(cu: string | null | undefined, moi: string | null | undefined): string | null {
  const m = (moi ?? "").trim();
  const c = (cu ?? "").trim();
  if (!m) return null; // file không nói gì → không đụng cột này
  if (!c) return m;
  if (c.includes(m)) return null; // đã có rồi → không nối
  return `${c}\n${m}`;
}

/**
 * Dựng bản cập nhật cho một lead TRÙNG SĐT vừa gặp lại trong file nhập.
 *
 * `moc` là thời điểm của lượt nhập: nó luôn được ghi vào `lastInboundAt` vì một lượt nhập
 * lại CHÍNH LÀ một lần khách quay lại — đó là ý nghĩa của cột đó, và là thứ đẩy lead lên đầu
 * danh sách `/leads` để Sale thấy mà gọi.
 */
export function dungBanCapNhatLeadTrung(params: {
  cu: OLeadDangCo;
  file: OLeadTuFile;
  moc: Date;
}): BanCapNhatLead {
  const { cu, file, moc } = params;
  const data: Record<string, unknown> = { lastInboundAt: moc };
  const daDoi: string[] = [];

  for (const cot of COT_GHI_DE) {
    const vFile = file[cot];
    if (trong(vFile)) continue; // ô trống KHÔNG phải lệnh xoá
    if (!khac(vFile, cu[cot])) continue; // giống hệt → không ghi, để `updatedAt` nói thật
    data[cot] = typeof vFile === "string" ? vFile.trim() : vFile;
    daDoi.push(NHAN[cot] ?? cot);
  }

  // Cơ sở đổi thì đơn vị tổ chức đi theo — ghi kèm, nhưng KHÔNG kể vào `daDoi`.
  if ("centerId" in data && !trong(file.orgUnitId)) data.orgUnitId = file.orgUnitId;

  const ghiChu = noiGhiChu(cu.note, file.note);
  if (ghiChu !== null) data.note = ghiChu;

  return { data, daDoi, daNoiGhiChu: ghiChu !== null };
}

/**
 * Câu nhật ký cho lượt cập nhật — người vận hành mở lead ra phải đọc được ĐÚNG cái gì đã đổi.
 *
 * Một dòng "Cập nhật từ import Excel" trống rỗng là thứ tệ nhất có thể ghi: nó chứng minh có
 * người đụng vào, mà không nói đụng cái gì, nên ai nghi mất dữ liệu cũng không tra được.
 */
export function moTaLuotCapNhat(ban: BanCapNhatLead, chiaLai: boolean): string {
  const phan: string[] = [];
  phan.push(
    ban.daDoi.length > 0
      ? `Nhập lại từ Excel — cập nhật ${ban.daDoi.join(", ")}`
      : "Nhập lại từ Excel — thông tin trong file trùng khớp, không có gì để cập nhật",
  );
  if (ban.daNoiGhiChu) phan.push("ghi chú trong file đã nối thêm (không ghi đè ghi chú cũ)");
  phan.push(
    chiaLai
      ? "lead được chia lại cho tư vấn viên mới"
      : "lead đã chốt nên GIỮ NGUYÊN người phụ trách",
  );
  return phan.join(" · ");
}

/**
 * Lead này còn được chia lại không.
 *
 * Chủ dự án chốt 15/09/2026: chỉ chia lại lead CHƯA chốt. Lead đã ghi danh xong thì hoa hồng
 * đã tính theo người đang giữ, và đổi chủ lúc đó là tranh chấp tiền chứ không phải dọn dữ liệu.
 *
 * ⚠️ `status` MỘT MÌNH LÀ THIẾU, và đây là cái bẫy đã có sẵn trong repo: tập trạng thái đóng
 * chỉ còn `DA_MAT`, nên lead convert xong vẫn mang `DA_DANG_KY` và trông như đang mở.
 * `convertedAt` mới là dấu "đã xong thật" — cùng lý lẽ với `LEAD_DANG_MO` ở
 * `lib/lead/assign.ts`, viết lại ở đây dưới dạng THUẦN vì đường nhập cầm sẵn bản ghi trong
 * tay chứ không đi qua một câu `where`.
 */
export function conMoDeChiaLai(params: {
  status: string;
  convertedAt: Date | null;
  trangThaiDong: readonly string[];
}): boolean {
  if (params.convertedAt !== null) return false;
  return !params.trangThaiDong.includes(params.status);
}
