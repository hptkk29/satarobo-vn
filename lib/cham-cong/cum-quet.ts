/**
 * lib/cham-cong/cum-quet.ts — chia đoạn WORK thành các CỤM QUÉT kỳ vọng.
 *
 * THUẦN: không `@/lib/db`, không `next/*`, không đọc đồng hồ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO TỒN TẠI
 *
 * Engine đang gộp cụm bằng `mergeIntervals` — tức theo **TÍNH LIỀN KỀ** của đoạn WORK.
 * Nó ra ĐÚNG kết quả hôm nay, nhưng **VÌ LÝ DO KHÁC**: khoảng nghỉ-không-tính hiện không
 * thuộc đoạn nào, nên hai bên tự nhiên rời nhau và thành hai cụm.
 *
 * Ngày thêm `UNPAID_BREAK` (đợt sau), khoảng ấy thành một đoạn THẬT. `mergeIntervals` nối
 * liền hai bên lại, `ST` tụt từ 2 cụm xuống 1 — và **KHÔNG ca test nào đỏ**, vì chẳng ca
 * nào từng khẳng định "ST phải có hai cụm". Đó là lý do `BANG-MA-CA-CHOT.md` xếp
 * `UNPAID_BREAK` và `soCapQuetKyVong` vào CÙNG một đợt.
 *
 * Hàm này gỡ phép suy ấy ra khỏi hình dạng dữ liệu: số cụm do **danh mục KHAI**, không do
 * các đoạn tình cờ rời nhau.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIẾT KẾ — chủ dự án duyệt nguyên văn (BANG-MA-CA-CHOT.md)
 *
 * | | |
 * |---|---|
 * | `0` | không kiểm quét, không cờ |
 * | `1` | gom **mọi** đoạn WORK thành **một cụm**: vào = `start` đoạn ĐẦU, ra = `end` đoạn CUỐI |
 * | `2` | **hai cụm**, cắt ở **khoảng hở LỚN NHẤT** giữa các đoạn WORK |
 */

/** Phút tính từ 00:00 giờ VN. */
export type Doan = { start: number; end: number };

/** Một cụm quét kỳ vọng: người ta phải có một cặp vào–ra phủ được khoảng này. */
export type CumQuet = {
  /** Mốc VÀO kỳ vọng — `start` của đoạn WORK đầu trong cụm. */
  start: number;
  /** Mốc RA kỳ vọng — `end` của đoạn WORK cuối trong cụm. */
  end: number;
};

/**
 * @param doanWork các đoạn WORK của ca (KHÔNG gồm nghỉ). Thứ tự bất kỳ.
 * @param soCap    `ShiftTemplate.soCapQuetKyVong` — 0 / 1 / 2.
 */
export function cumQuetKyVong(
  doanWork: readonly Doan[],
  soCap: 0 | 1 | 2,
): CumQuet[] {
  if (soCap === 0) return [];

  const ds = [...doanWork]
    .filter((d) => d.end > d.start)
    .sort((a, b) => a.start - b.start);
  if (ds.length === 0) return [];

  const motCum = (tu: Doan[]): CumQuet => ({
    start: tu[0]!.start,
    end: Math.max(...tu.map((d) => d.end)),
  });

  if (soCap === 1) return [motCum(ds)];

  // soCap === 2 — cắt ở KHOẢNG HỞ LỚN NHẤT giữa hai đoạn liên tiếp.
  //
  // Một đoạn duy nhất thì KHÔNG có khoảng hở nào để cắt. Trả về MỘT cụm chứ không bịa ra
  // cụm thứ hai: bịa là dựng một mốc quét không có trong ca, và người ta bị đòi một lượt
  // quét cho khoảng thời gian không tồn tại. Danh mục khai 2 cho một ca liền mạch là danh
  // mục SAI — và `catalog.test.ts` đối chiếu bảng chốt là chỗ bắt chuyện đó, không phải đây.
  if (ds.length < 2) return [motCum(ds)];

  let iCat = 1;
  let hoLonNhat = -1;
  for (let i = 1; i < ds.length; i++) {
    const ho = ds[i]!.start - ds[i - 1]!.end;
    // `>` chứ không `>=`: hai khoảng hở BẰNG NHAU thì lấy cái ĐẦU TIÊN. Chọn cái cuối cũng
    // "đúng" như nhau, nhưng phải chọn MỘT cách và giữ nguyên — kẻo cùng một ca ra hai kết
    // quả khác nhau tuỳ thứ tự mảng đầu vào.
    if (ho > hoLonNhat) {
      hoLonNhat = ho;
      iCat = i;
    }
  }
  return [motCum(ds.slice(0, iCat)), motCum(ds.slice(iCat))];
}

/**
 * Nhãn của cụm thứ `i` (0-based) khi có `tong` cụm — dùng cho cờ thiếu lượt.
 *
 * Bảng chốt: cờ `THIEU_BUOI_SANG`/`THIEU_BUOI_CHIEU` chuyển thành *thiếu cụm thứ n*, và
 * **chỉ có nghĩa khi `soCapQuetKyVong ≥ 2`**.
 *
 * ⚠️ GIỮ NGUYÊN TÊN CỜ CŨ. Chúng đã nằm trong `StaffAttendanceDay.flags` của dữ liệu prod,
 * trong `CO_CANH_BAO`, trong `flag-labels.ts`, và trong bộ lọc của màn admin. Đổi tên là
 * một lượt đổi dữ liệu + sáu chỗ đọc, cho một lợi ích bằng không ở đợt này — ghi vé nếu
 * muốn, đừng làm kèm.
 */
export function coThieuCum(i: number): "THIEU_BUOI_SANG" | "THIEU_BUOI_CHIEU" {
  return i === 0 ? "THIEU_BUOI_SANG" : "THIEU_BUOI_CHIEU";
}
