/**
 * lib/trial/gv-kha-dung.ts — LỌC GIÁO VIÊN cho ô "Giáo viên" ở khối **Thêm buổi học**
 * của một lớp trải nghiệm (`/lop-trial/<id>`). Chốt của chủ dự án 17/09/2026.
 *
 * File **THUẦN**: không `@/lib/db`, không `next/*`, không `auth()`. Client component kéo
 * theo được, và test chạy không cần Postgres. Tầng chạm DB nằm ở `gv-kha-dung-db.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * HAI LUẬT KHÁC NHAU, ĐỪNG TRỘN — đây là chỗ dễ vá sai nhất của file này
 *
 *   · **PHỦ TRỌN** (chọn được ai) — ca làm của GV phải CHỨA TRỌN khung giờ buổi trial.
 *     Đè một phần KHÔNG tính. Chủ dự án nói thẳng: "GV thì chỉ có ca S C T hoặc SC CT ST
 *     hoặc SCT chứ làm gì có CG mà làm rule này, chọn phủ trọn đi."
 *   · **TRÙNG LỊCH** (note đỏ) — buổi dạy khác của GV chỉ cần ĐÈ LÊN một phần là đỏ.
 *     Dùng lại `trungKhungGio` của `lop-moi.ts`, KHÔNG dùng luật phủ trọn.
 *
 * Cùng hai khung giờ mà hai câu trả lời khác nhau là ĐÚNG THIẾT KẾ: "ca có phủ hết buổi
 * không" và "buổi này có đụng buổi kia không" là hai câu hỏi khác nhau.
 *
 * ⚠️ Nguồn TRÙNG LỊCH đúng **HAI** thứ: buổi của lớp TRIAL khác + buổi LỚP CHÍNH
 * (`ClassSession`). **KHÔNG** tính trùng với ca làm trong lưới chấm công — chủ dự án:
 * "ca hành chính của Kiệt và Toại thì cả 2 người đều trial bình thường, không cần note đỏ."
 * (Việc gom hai nguồn đó là của tầng DB; ở đây chỉ nhận `banTheoGv` đã gom sẵn.)
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * 🔑 PAID_BREAK TÍNH LÀ CÓ MẶT — lý do có `gopDoanCa`
 *
 * `plannedMinutes` (catalog.ts) cộng cả `WORK` lẫn `PAID_BREAK`, và chính danh mục ghi
 * "Nghỉ giữa giờ 16:30–17:30, TÍNH vào giờ làm". Người vẫn ở cơ sở trong khoảng đó.
 *
 * Nếu chỉ lấy đoạn `WORK` thì mã `CT` bị cắt làm hai mảnh (13:45–16:30 và 17:30–21:00) và
 * một buổi trial **17:00–18:30 rơi đúng vào khe**, bị kết luận SAI là "ca không phủ" —
 * giáo viên đang có mặt nhưng không chọn được. Vì vậy phải **GỘP các đoạn liền nhau**
 * (WORK + PAID_BREAK) trước khi so:
 *
 *   | mã   | đoạn thô                                   | sau khi gộp            |
 *   |------|--------------------------------------------|------------------------|
 *   | `CT` | 13:45–16:30 · [nghỉ] 16:30–17:30 · 17:30–21:00 | **13:45–21:00** (1 khối) |
 *   | `SCT`| 07:45–11:30 · 13:45–16:30 · [nghỉ] · 17:30–21:00 | 07:45–11:30 + **13:45–21:00** |
 *   | `ST` | 07:45–11:30 · 17:15–21:00                   | HAI khối RỜI (khe 11:30–17:15) |
 *
 * ⚠️ `ST` phải giữ nguyên hai khối: buổi 12:00–13:00 rơi vào khe thì đúng là KHÔNG phủ.
 * Gộp "từ đoạn đầu đến đoạn cuối" là sai — phải gộp theo TÍNH LIỀN KỀ.
 *
 * ⚠️ Danh mục ca có dự tính thêm `UNPAID_BREAK` (xem chú thích `soCapQuetKyVong` ở
 * `catalog.ts`). Ngày đó khoảng nghỉ-không-tính thành một đoạn THẬT và sẽ nối liền hai
 * bên lại nếu ở đây cứ lấy hết mọi đoạn. Nên `LOAI_TINH_CO_MAT` là một **danh sách trắng
 * tường minh**, không phải "lấy tất" — mã mới rơi ra ngoài thì bị BỎ, không âm thầm nối.
 */

import { type ShiftSegment, type SegmentKind, toMinutes } from "@/lib/cham-cong/catalog";
import { laNgayNghi, type LoaiMaCa } from "@/lib/cham-cong/nhan-ca";
import { trungKhungGio } from "@/lib/trial/lop-moi";

// ─────────────────────────────────────────────────────────────────────────────────────
// KIỂU DÙNG CHUNG (hợp đồng — tầng DB và UI bám đúng chữ này)
// ─────────────────────────────────────────────────────────────────────────────────────

/** Ca của MỘT người trong MỘT ngày, rút từ lưới chấm công. */
export type CaNgay = {
  /** Mã ca ("T", "CT", "X"…) — chỉ để hiện cho người xem. */
  ma: string;
  /** Thứ phân biệt ngày nghỉ. ⚠️ KHÔNG dùng `isLeave`: `X` mang `isLeave: false`. */
  kind: LoaiMaCa;
  /** Cơ sở của ô ca. `null` = không gắn cơ sở (HO / chưa rõ). */
  centerId: string | null;
  segments: ShiftSegment[];
};

/** Kết quả so ca × khung giờ buổi trial. BẢY trạng thái, KHÔNG gộp thành boolean. */
export type KetQuaPhuCa =
  /** Có khối ca chứa TRỌN khung giờ buổi. */
  | "PHU_TRON"
  /** Có ca có giờ, nhưng không khối nào chứa trọn. */
  | "KHONG_PHU"
  /** Ngày nghỉ (`X` `OFF` / `P` `LEAVE`). */
  | "NGHI"
  /** Có ca nhưng mã không mang giờ (`LD` `D1` `D2`) — không kết luận được. */
  | "KHONG_GIO"
  /** Lưới ĐÃ sinh nhưng người này không có ô ca ngày đó — hôm nay họ NGHỈ/không xếp. */
  | "KHONG_CO_CA"
  /**
   * Lưới tháng ĐÃ sinh nhưng người này **không có ô nào trong CẢ THÁNG** — nghĩa là họ
   * chưa từng được đưa vào lưới, không phải "hôm nay không đi làm".
   *
   * ⚠️ TÁCH RIÊNG khỏi `KHONG_CO_CA` là cả điểm của trạng thái này (chốt 17/09/2026).
   * "Có lưới, hôm nay người này nghỉ" là một CÂU TRẢ LỜI; "người này chưa từng được xếp
   * ca" là DỮ LIỆU THIẾU. Fail-closed trên dữ liệu thiếu thì giáo viên MỚI vào công ty
   * vô hình vĩnh viễn trong ô chọn, và không ai có cách nào biết vì sao — người xếp lịch
   * chỉ thấy tên đồng nghiệp mình vừa tuyển không có ở đó. Nên trạng thái này được GIỮ,
   * kèm nhãn nói thẳng là hệ thống chưa biết gì về người đó.
   *
   * ⚠️ GIỚI HẠN PHẢI BIẾT: phép đếm ô-trong-tháng đi qua `scopedDb`, nên với người dùng
   * cấp cơ sở, một giáo viên cả tháng chỉ làm ở cơ sở KHÁC cũng ra `CHUA_VAO_LUOI`.
   * Nhãn vì thế nói "chưa THẤY ô ca nào", không nói "chưa được xếp ca" — câu sau là lời
   * hứa về dữ liệu người đọc không có quyền nhìn (luật 12).
   */
  | "CHUA_VAO_LUOI"
  /** Lưới ca tháng chưa sinh — chưa có gì để lọc. */
  | "CHUA_CO_LUOI";

/** Ba tầng người dùng (V1-d). Đào tạo FULL · QL cơ sở theo cơ sở · Sale lọc theo ca. */
export type CheDoChonGv = "TAT_CA" | "THEO_CO_SO" | "LOC_THEO_CA";

export type MucCanhBao = "DO" | "CANH" | "KHONG";

/** Một dòng trong danh sách chọn giáo viên. */
export type DongGv = {
  id: string;
  name: string;
  phu: KetQuaPhuCa;
  muc: MucCanhBao;
  /** Chú thích hiện cạnh tên. Rỗng khi không có gì đáng nói. */
  nhan: string;
};

/**
 * Một buổi dạy ĐÃ CÓ của giáo viên — nguồn của note đỏ "trùng lịch".
 *
 * `nguon` chỉ có hai giá trị, cố ý: buổi lớp trial khác và buổi lớp chính. Ca làm trong
 * lưới chấm công **không** được đưa vào đây (chốt V2-b).
 */
export type BuoiBanCuaGv = {
  /** "YYYY-MM-DD" theo ngày VN. */
  ymd: string;
  startTime: string;
  endTime: string;
  /** Nhãn đọc được để in trong note đỏ, vd "Lớp CS1-sata4-Lớp trial 2". */
  nhan: string;
  nguon: "TRIAL" | "LOP_CHINH";
};

/** Một giáo viên trong danh sách chọn. */
export type GiaoVienChon = { id: string; name: string };

export type ThamSoLocGv = {
  giaoVien: readonly GiaoVienChon[];
  /** Ca của từng GV trong ĐÚNG ngày của buổi. Thiếu khoá = không có ca. */
  caTheoGv: Readonly<Record<string, CaNgay | null>>;
  /** Buổi đã có của từng GV (trial + lớp chính). Thiếu khoá = không buổi nào. */
  banTheoGv: Readonly<Record<string, readonly BuoiBanCuaGv[]>>;
  khung: { ymd: string; startTime: string; endTime: string };
  /**
   * Ai có **ít nhất một ô ca ACTIVE trong THÁNG** chứa `khung.ymd` (đo qua `scopedDb`).
   *
   * Thiếu id trong tập này ⇒ `CHUA_VAO_LUOI` thay vì `KHONG_CO_CA`. Xem chú thích của
   * `CHUA_VAO_LUOI` để biết vì sao hai thứ đó không được gộp.
   *
   * ⚠️ Luật 7 — **BẮT BUỘC**, không mặc định. Truyền nhầm tập rỗng là biến MỌI giáo viên
   * thành "chưa vào lưới" và bộ lọc ngừng lọc; truyền nhầm tập đủ là giáo viên mới biến
   * mất trở lại. Cả hai đều hỏng CÂM, nên `tsc` phải bắt người gọi viết ra.
   */
  coTrongLuoi: ReadonlySet<string>;
  /** `trial.gvMienLocTheoCa` — GV được MIỄN điều kiện có-ca (Kiệt & Toại). */
  mienLuat: ReadonlySet<string>;
  /** GV đang được chọn sẵn trên buổi — không bao giờ được lọc mất khỏi ô. */
  luonGiu: ReadonlySet<string>;
  /**
   * Cơ sở người dùng được nhìn. `null` = MỌI cơ sở.
   *
   * ⚠️ Luật 7 — tham số này **BẮT BUỘC**, không có mặc định. Mặc định của SCOPE không
   * bao giờ được là "ALL"; người gọi phải tự viết ra `null` khi tầng đó thật sự cho phép.
   */
  coSoChoPhep: ReadonlySet<string> | null;
  cheDo: CheDoChonGv;
  /** Lưới ca tháng đã sinh chưa. `false` ⇒ fail-open (xem `locGiaoVienChoBuoi`). */
  luoiDaSinh: boolean;
  /** `trial.locGvTheoCaLamViec`. `false` ⇒ không lọc ai, chỉ chú thích. */
  batLoc: boolean;
  /**
   * ĐƯỜNG THOÁT cho MỘT lượt chọn: người dùng bật công tắc "Hiện tất cả giáo viên".
   *
   * `true` ⇒ bỏ MỌI luật lọc (ca lẫn cơ sở) cho đúng lượt này, nhưng **vẫn tính đủ**
   * `phu`/`muc`/`nhan` — note đỏ trùng lịch không bao giờ tắt.
   *
   * Vì sao phải có: bộ lọc dựa vào LƯỚI CA, và lưới có thể lạc hậu vì hàng chục lý do
   * (đơn vừa duyệt xong, người vừa được tuyển, GV đổi ca miệng với nhau, lưới tháng sau
   * chưa bấm sinh…). Người xếp lịch **biết điều hệ thống không biết** — đó đúng là câu
   * đã ghi trong `add-session-form.tsx` từ 28/08 và là lý do cửa GHI cố ý không chặn.
   * Không có công tắc thì cách duy nhất để vượt một bộ lọc sai là đi nhập tay chỗ khác.
   *
   * ⚠️ **KHÔNG phải một khoá quyền, và KHÔNG nới quyền.** Nó chỉ tắt một bộ lọc HIỂN
   * THỊ mà chính hàm này đã fail-open ở ba đường khác (chưa có lưới · lọc còn 0 người ·
   * chưa chọn đủ ngày+giờ), tức danh sách đầy đủ vốn đã đến tay đúng người dùng đó. Cửa
   * GHI (`gvXepDuoc`) không đọc cờ này và kiểm y như cũ.
   *
   * ⚠️ Luật 7 — **BẮT BUỘC**, không mặc định: đây là tham số MỞ RỘNG PHẠM VI NHÌN.
   */
  hienTatCa: boolean;
};

export type KetQuaLocGv = {
  ds: DongGv[];
  /** Vì sao danh sách không phải "đã lọc gọn". `null` = lọc chạy bình thường. */
  lyDoRong: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────────────
// GỘP ĐOẠN CA
// ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Loại đoạn được coi là CÓ MẶT. Danh sách trắng tường minh — xem chú thích đầu file về
 * `UNPAID_BREAK`.
 */
const LOAI_TINH_CO_MAT: readonly SegmentKind[] = ["WORK", "PAID_BREAK"];

/**
 * "HH:mm" → phút, KHÔNG ném.
 *
 * `toMinutes` của danh mục cố ý ném (dữ liệu danh mục do người vận hành nhập, sai thì
 * phải biết ngay). Ở đây thì ngược lại: một ô ca hỏng chỉ được phép làm "không kết luận
 * được về người đó", không được làm chết cả ô chọn giáo viên.
 */
function phutHoacNull(hhmm: string | null | undefined): number | null {
  if (typeof hhmm !== "string") return null;
  try {
    return toMinutes(hhmm);
  } catch {
    return null;
  }
}

/**
 * Các đoạn của một mã ca → những KHỐI LIỀN MẠCH (phút từ 00:00), đã sắp xếp.
 *
 * Gộp khi đoạn sau bắt đầu **<=** đoạn trước kết thúc: 16:30 nối 16:30 là liền, không hở.
 * Đoạn giờ hỏng (sai định dạng / kết thúc không sau bắt đầu) bị BỎ, không ném.
 */
export function gopDoanCa(segments: readonly ShiftSegment[]): { start: number; end: number }[] {
  const doan: { start: number; end: number }[] = [];
  for (const s of segments) {
    if (!LOAI_TINH_CO_MAT.includes(s.kind)) continue;
    const a = phutHoacNull(s.start);
    const b = phutHoacNull(s.end);
    if (a === null || b === null || b <= a) continue;
    doan.push({ start: a, end: b });
  }
  doan.sort((x, y) => x.start - y.start || x.end - y.end);

  const gop: { start: number; end: number }[] = [];
  for (const d of doan) {
    const cuoi = gop[gop.length - 1];
    if (cuoi && d.start <= cuoi.end) {
      if (d.end > cuoi.end) cuoi.end = d.end;
    } else {
      gop.push({ start: d.start, end: d.end });
    }
  }
  return gop;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// THÁNG CHỨA MỘT NGÀY
// ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Nửa khoảng `[tu, den)` của THÁNG chứa `workDate` — định nghĩa của "trong lưới tháng".
 *
 * Đặt ở file THUẦN (không ở vỏ DB) vì nó chính là ĐỊNH NGHĨA của trạng thái
 * `CHUA_VAO_LUOI`, và định nghĩa thì phải kiểm được mà không cần Postgres.
 *
 * ⚠️ Toàn bộ phép tính bằng `getUTC*` + `Date.UTC`, KHÔNG `getMonth()`/`new Date(y,m,d)`:
 * `workDate` là nửa đêm UTC của ngày VN (quy ước cột `@db.Date`). Máy dev ở +07 đọc
 * `2026-09-01T00:00:00Z` thành "01/09 lúc 07:00" — vẫn tháng 9, nên lỗi này KHÔNG lộ ra
 * ở đây; nó lộ ra ở một máy múi giờ ÂM, nơi cùng mốc đó là 31/08 và cả tháng lệch đi một
 * ô. Đây đúng là loại bug "chạy máy tôi thì được" mà `lib/time/vn.ts` sinh ra để chặn.
 *
 * Tháng 12 không phải ca riêng: `Date.UTC(2026, 12, 1)` tự cuộn sang 01/01/2027.
 */
export function khoangThangChua(workDate: Date): { tu: Date; den: Date } {
  const nam = workDate.getUTCFullYear();
  const thang = workDate.getUTCMonth();
  return { tu: new Date(Date.UTC(nam, thang, 1)), den: new Date(Date.UTC(nam, thang + 1, 1)) };
}

// ─────────────────────────────────────────────────────────────────────────────────────
// PHỦ TRỌN
// ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Ca của một người có PHỦ TRỌN khung giờ buổi trial không.
 *
 * Thứ tự rẽ nhánh là một phần của hợp đồng — "chưa có lưới" đứng TRƯỚC "không có ca" vì
 * hai chuyện khác hẳn nhau: chưa sinh lưới thì không ai có ca, và kết luận "cả trung tâm
 * không ai rảnh" từ đó là sai hoàn toàn (xem fail-open ở `locGiaoVienChoBuoi`).
 *
 * Cùng lý do đó, ô ca trống lại tách làm HAI: `KHONG_CO_CA` (có tên trong lưới tháng,
 * hôm nay trống) và `CHUA_VAO_LUOI` (cả tháng không một ô). Xem chú thích của
 * `CHUA_VAO_LUOI`.
 *
 * ⚠️ Ngày nghỉ nhận qua **`kind`**, KHÔNG qua `isLeave`: mã `X` (Nghỉ) mang
 * `isLeave: false` vì nó không phải nghỉ PHÉP. Lọc bằng `isLeave` thì `X` lọt qua và
 * thành ca làm — đúng bug prod 10/09/2026, đã có `nhan-ca.ts` chép lại bảng đối chiếu.
 *
 * @param coTrongLuoi người này có ≥1 ô ca ACTIVE trong THÁNG chứa buổi. BẮT BUỘC (luật 7).
 */
export function caPhuTronKhungGio(input: {
  ca: CaNgay | null;
  khung: { startTime: string; endTime: string };
  luoiDaSinh: boolean;
  coTrongLuoi: boolean;
}): KetQuaPhuCa {
  if (!input.luoiDaSinh) return "CHUA_CO_LUOI";
  if (!input.ca) return input.coTrongLuoi ? "KHONG_CO_CA" : "CHUA_VAO_LUOI";
  if (laNgayNghi(input.ca.kind)) return "NGHI";

  const khoi = gopDoanCa(input.ca.segments);
  if (khoi.length === 0) return "KHONG_GIO";

  const batDau = phutHoacNull(input.khung.startTime);
  const ketThuc = phutHoacNull(input.khung.endTime);
  // Khung giờ buổi hỏng: không khẳng định được là phủ ⇒ KHONG_PHU (fail-closed cho một
  // câu hỏi CHỌN ĐƯỢC AI), nhưng vẫn không ném — form phải sống.
  if (batDau === null || ketThuc === null || ketThuc <= batDau) return "KHONG_PHU";

  const phu = khoi.some((k) => k.start <= batDau && ketThuc <= k.end);
  return phu ? "PHU_TRON" : "KHONG_PHU";
}

// ─────────────────────────────────────────────────────────────────────────────────────
// LỌC DANH SÁCH
// ─────────────────────────────────────────────────────────────────────────────────────

/** Chú thích mặc định theo trạng thái phủ ca. Rỗng khi mọi thứ bình thường. */
const NHAN_THEO_PHU: Record<KetQuaPhuCa, string> = {
  PHU_TRON: "",
  KHONG_PHU: "ca không phủ trọn giờ buổi",
  NGHI: "ngày nghỉ",
  // `LD`/`LDGV`/`D1`/`D2`. Nói "không nhận thêm việc" chứ không nói "không rõ giờ": mã
  // `LDGV` có nghĩa rất rõ — đến dạy đúng lớp đã phân công, không lấy công ca.
  KHONG_GIO: "ca không nhận thêm buổi",
  KHONG_CO_CA: "chưa xếp ca ngày này",
  // "chưa THẤY", không phải "chưa ĐƯỢC XẾP": phép đếm đi qua `scopedDb` nên với người
  // cấp cơ sở, giáo viên cả tháng làm ở cơ sở khác cũng rơi vào đây. Viết "chưa được xếp
  // ca" là hứa một điều người đọc không có dữ liệu để kiểm (luật 12).
  CHUA_VAO_LUOI: "chưa thấy ô ca nào trong lưới tháng này",
  CHUA_CO_LUOI: "chưa sinh lưới ca tháng này",
};

/** Buổi đầu tiên (theo thứ tự người gọi đưa vào) ĐÈ lên khung giờ, cùng ngày. */
function timTrungLich(
  ban: readonly BuoiBanCuaGv[],
  khung: { ymd: string; startTime: string; endTime: string },
): BuoiBanCuaGv | null {
  for (const b of ban) {
    if (b.ymd !== khung.ymd) continue;
    // ĐÈ một phần là đủ đỏ — khác hẳn luật PHỦ TRỌN ở trên. Xem chú thích đầu file.
    if (trungKhungGio({ startTime: b.startTime, endTime: b.endTime }, khung)) return b;
  }
  return null;
}

/** Quyết định giữ/loại theo chế độ. Đã tách riêng để đọc được từng nhánh. */
function duocGiu(input: {
  cheDo: CheDoChonGv;
  batLoc: boolean;
  phu: KetQuaPhuCa;
  ca: CaNgay | null;
  coSoChoPhep: ReadonlySet<string> | null;
}): boolean {
  // Cờ tắt hoặc tầng Đào tạo: hiện đủ, chú thích vẫn tính để người xếp lịch tự cân.
  if (!input.batLoc || input.cheDo === "TAT_CA") return true;

  if (input.cheDo === "THEO_CO_SO") {
    // Tầng này lọc theo CƠ SỞ, **không** áp luật ca. Nên thiếu ca (hoặc ô ca không gắn
    // cơ sở) KHÔNG được là lý do loại — loại vì thiếu ca chính là áp luật ca.
    if (input.coSoChoPhep === null) return true;
    const cs = input.ca?.centerId ?? null;
    if (cs === null) return true;
    return input.coSoChoPhep.has(cs);
  }

  // LOC_THEO_CA
  if (input.phu === "PHU_TRON") return true;
  // Chưa sinh lưới ⇒ FAIL-OPEN. Lọc theo một lưới chưa tồn tại thì trả về danh sách rỗng
  // cho MỌI buổi — người dùng chỉ thấy "không có giáo viên nào" và không có cách nào biết
  // vì sao. Cổng im lặng khi hạ tầng chưa sẵn còn tệ hơn không có cổng.
  if (input.phu === "CHUA_CO_LUOI") return true;
  // ⚠️ Người CHƯA CÓ MẶT trong lưới tháng ⇒ GIỮ, cùng lý do fail-open ở dòng trên nhưng ở
  // quy mô MỘT NGƯỜI: đây là DỮ LIỆU THIẾU về họ, không phải câu trả lời về họ. Giáo viên
  // mới tuyển chưa được xếp ca lần nào mà bị ẩn thì họ vô hình cho tới khi có người tình
  // cờ phát hiện — và triệu chứng (một cái tên không có trong `<select>`) không ném lỗi,
  // không làm đỏ test nào, console vẫn sạch (luật 12). Nhãn `CHUA_VAO_LUOI` đi kèm nói
  // thẳng ra là hệ thống chưa biết gì, để người xếp lịch tự cân chứ không bị giấu.
  if (input.phu === "CHUA_VAO_LUOI") return true;
  // ⚠️ Mã KHÔNG MANG GIỜ (`LD`, `LDGV`, `D1`, `D2`) ⇒ **LOẠI**, không phải "giữ kèm cảnh báo".
  //
  // Bản đầu giữ lại với lý do "không kết luận được thì đừng loại người đang đi làm". Chủ dự
  // án bác ngày 17/09, và lý do là NGHIỆP VỤ chứ không phải sở thích:
  //
  //   `LDGV` là ca đặt cho giáo viên ĐẾN DẠY một lớp đã phân công — để họ chấm công được và
  //   lấy CÔNG BUỔI DẠY, nhưng **không lấy công của ca đó**. Nó đánh dấu "hôm nay tôi có mặt
  //   đúng cho lớp của tôi", KHÔNG phải "hôm nay tôi rảnh để nhận thêm việc". Xếp trial cho
  //   người mang mã này là xếp vào khoảng thời gian họ không hề nhận công.
  //   Ca thật 17/09: Lê Khôi `LDGV` thứ Bảy — dạy full buổi sáng, chiều nghỉ, nên dù có hiện
  //   ra thì cũng không xếp thêm được buổi nào.
  //
  // `LD` (Linh động, "không nhất thiết đến Trung tâm") càng không: dạy trial đòi CÓ MẶT.
  // `D1`/`D2` là ô con trỏ NƠI LÀM, lúc sinh lưới đã gộp vào ô đích — còn sót lại một mình
  // thì nó là dữ liệu dở dang, không phải lời hứa ai đó sẽ tới.
  //
  // Trạng thái `KHONG_GIO` vẫn GIỮ RIÊNG (không gộp vào `KHONG_PHU`): nó còn dùng cho nhãn
  // và cho tầng `TAT_CA`/`THEO_CO_SO`, nơi người xem thấy đủ danh sách và cần biết vì sao
  // người này đáng ngờ. Chỉ riêng tầng lọc-theo-ca mới loại.
  return false;
}

/**
 * Danh sách giáo viên cho ô "Giáo viên" của một buổi trial, kèm mức cảnh báo từng dòng.
 *
 * LUẬT (chốt 17/09/2026):
 *   · `batLoc === false` hoặc `cheDo === "TAT_CA"` ⇒ KHÔNG lọc ai, vẫn tính `muc`/`nhan`.
 *   · `THEO_CO_SO` ⇒ lọc theo `coSoChoPhep`, KHÔNG áp luật ca.
 *   · `LOC_THEO_CA` ⇒ giữ `PHU_TRON`; `CHUA_CO_LUOI` và `CHUA_VAO_LUOI` giữ kèm chú thích
 *     (fail-open trên DỮ LIỆU THIẾU); `KHONG_CO_CA` / `NGHI` / `KHONG_PHU` / `KHONG_GIO` loại.
 *     (`KHONG_GIO` = mã không mang giờ: `LD` `LDGV` `D1` `D2` — xem `duocGiu`.)
 *   · `mienLuat` (Kiệt & Toại — khai bằng cấu hình, KHÔNG hardcode tên) và `luonGiu`
 *     (GV đang chọn sẵn) LUÔN giữ, bỏ qua mọi luật lọc — nhưng **vẫn tính trùng lịch**.
 *   · `hienTatCa` (công tắc của người dùng cho MỘT lượt chọn) ⇒ không lọc ai, và NÓI RA
 *     bằng `lyDoRong` — một bộ lọc đang tắt mà màn hình im lặng thì lần sau người dùng
 *     không biết mình đang nhìn danh sách nào.
 *
 * ⚠️ Không bao giờ trả mảng rỗng CÂM. Lọc xong còn 0 người thì trả **ĐỦ** danh sách kèm
 * `lyDoRong`: một ô chọn trống không nói gì buộc người dùng đoán, và họ sẽ đoán là "hệ
 * thống hỏng" rồi đi nhập tay chỗ khác.
 */
export function locGiaoVienChoBuoi(input: ThamSoLocGv): KetQuaLocGv {
  const tatCa: DongGv[] = [];
  const giuLai: DongGv[] = [];
  let coFailOpen = false;

  for (const gv of input.giaoVien) {
    const ca = input.caTheoGv[gv.id] ?? null;
    const phu = caPhuTronKhungGio({
      ca,
      khung: input.khung,
      luoiDaSinh: input.luoiDaSinh,
      coTrongLuoi: input.coTrongLuoi.has(gv.id),
    });
    const trung = timTrungLich(input.banTheoGv[gv.id] ?? [], input.khung);

    // `CHUA_VAO_LUOI` mang mức CẢNH, ngang `KHONG_GIO`: người này đang hiện ra vì hệ
    // thống KHÔNG BIẾT, không phải vì hệ thống đã kiểm và thấy rảnh. Cho nó mức
    // "KHONG" là dựng một lời hứa suông ngay cạnh tên họ.
    const muc: MucCanhBao = trung
      ? "DO"
      : phu === "KHONG_GIO" || phu === "CHUA_VAO_LUOI"
        ? "CANH"
        : "KHONG";
    const nhan = trung
      ? `TRÙNG LỊCH: ${trung.nhan} ${trung.startTime}–${trung.endTime}`
      : NHAN_THEO_PHU[phu];

    const dong: DongGv = { id: gv.id, name: gv.name, phu, muc, nhan };
    tatCa.push(dong);

    if (phu === "CHUA_CO_LUOI" && input.batLoc && input.cheDo === "LOC_THEO_CA") {
      coFailOpen = true;
    }

    // ⚠️ `hienTatCa` CỐ Ý không có mặt ở đây, dù đọc thì thấy nó "thuộc về" chỗ này.
    // Nhánh sớm ở cuối hàm đã trả `tatCa` (nguyên danh sách) nên thêm vào đây là DÒNG
    // CHẾT: đo bằng cách cấy lỗi — gỡ `input.hienTatCa ||` khỏi dòng này cho ra **0 ĐỎ /
    // 240 xanh**, tức không ca nào chạm tới nó. Hai cơ chế cho một luật là hai chỗ để
    // chúng trôi lệch, và cái không ai kiểm được sẽ là cái trôi.
    const mien = input.mienLuat.has(gv.id) || input.luonGiu.has(gv.id);
    if (mien || duocGiu({ cheDo: input.cheDo, batLoc: input.batLoc, phu, ca, coSoChoPhep: input.coSoChoPhep })) {
      giuLai.push(dong);
    }
  }

  if (tatCa.length === 0) {
    return { ds: [], lyDoRong: "Chưa có giáo viên nào trong danh sách để chọn." };
  }
  // Công tắc của NGƯỜI DÙNG đứng trước mọi lý do của hệ thống: họ vừa bấm nó, nên câu
  // giải thích phải nói đúng thứ họ vừa làm chứ không phải một lý do kỹ thuật khác.
  if (input.hienTatCa) {
    return {
      ds: tatCa,
      lyDoRong:
        "Đang HIỆN TẤT CẢ giáo viên — luật ca tạm bỏ cho lượt chọn này. Cảnh báo trùng lịch vẫn tính.",
    };
  }
  if (coFailOpen) {
    return {
      ds: tatCa,
      lyDoRong: "Chưa sinh lưới ca tháng này nên chưa lọc được theo ca — đang hiện tất cả giáo viên.",
    };
  }
  if (giuLai.length === 0) {
    const ly =
      input.cheDo === "THEO_CO_SO"
        ? "Không giáo viên nào thuộc cơ sở bạn phụ trách — đang hiện tất cả để bạn tự chọn."
        : `Không giáo viên nào có ca phủ trọn ${input.khung.startTime}–${input.khung.endTime} ngày ${input.khung.ymd} — đang hiện tất cả để bạn tự chọn.`;
    return { ds: tatCa, lyDoRong: ly };
  }
  return { ds: giuLai, lyDoRong: null };
}
