/**
 * EL-06 — CHỐT HOÀN THÀNH Ở CẤP KHOÁ.
 *
 * EL-04 đo tới cấp BÀI (`TrnLessonProgress`), nhưng không có gì cuộn kết quả đó
 * lên cấp KHOÁ. Hệ quả: `TrnEnrollment.status` không bao giờ rời `IN_PROGRESS`,
 * nên mọi thứ đứng trên nó đều rỗng — thông báo hoàn thành không bao giờ gửi,
 * báo cáo tuân thủ luôn 0%, và lịch nhắc không bao giờ được huỷ.
 *
 * ⚠️ `COMPLETED` vs `COMPLETED_LATE` xét theo `dueAtOriginal`, KHÔNG theo `dueAt`.
 * `dueAt` gia hạn được; đo đúng-hạn trên nó thì ai được gia hạn cũng thành đúng
 * hạn, và tỉ lệ đúng hạn thành thứ đo được 100% mãi mãi.
 */

export type KetQuaCuon = {
  status: "IN_PROGRESS" | "COMPLETED" | "COMPLETED_LATE";
  progressPercent: number;
  isLate: boolean;
  /** `true` = lần này mới hoàn thành ⇒ người gọi phát sự kiện. */
  vuaHoanThanh: boolean;
};

export function cuonTienDoKhoa(input: {
  /** Số bài BẮT BUỘC của khoá. 0 = khoá chưa có bài nào. */
  soBaiBatBuoc: number;
  /** Số bài bắt buộc người này đã xong. */
  soBaiDaXong: number;
  statusHienTai: string;
  /** Hạn GỐC, bất biến — mốc đo đúng hạn. */
  dueAtOriginal: Date | null;
  now: Date;
}): KetQuaCuon {
  // Khoá chưa có bài bắt buộc nào thì KHÔNG tự động hoàn thành. Chia cho 0 ra
  // NaN, còn coi là 100% thì mọi người "hoàn thành" một khoá rỗng — và bảng
  // tuân thủ báo 100% cho một khoá chưa ai soạn xong.
  if (input.soBaiBatBuoc <= 0) {
    return {
      status: "IN_PROGRESS",
      progressPercent: 0,
      isLate: false,
      vuaHoanThanh: false,
    };
  }

  const pct = Math.min(
    100,
    Math.round((input.soBaiDaXong / input.soBaiBatBuoc) * 100),
  );

  const daXongHet = input.soBaiDaXong >= input.soBaiBatBuoc;
  const daLaXong =
    input.statusHienTai === "COMPLETED" || input.statusHienTai === "COMPLETED_LATE";

  if (!daXongHet) {
    return {
      status: daLaXong
        ? (input.statusHienTai as "COMPLETED" | "COMPLETED_LATE")
        : "IN_PROGRESS",
      progressPercent: pct,
      isLate: false,
      vuaHoanThanh: false,
    };
  }

  // ⚠️ Đã ghi `COMPLETED_LATE` thì GIỮ NGUYÊN, không bao giờ nâng lên
  // `COMPLETED`. Trên lý thuyết không xảy ra được — `dueAtOriginal` bất biến nên
  // "đã trễ" là một sự thật chỉ đúng thêm theo thời gian. Nhưng nếu cột đó có
  // ngày bị sửa (lỗi, hay ai đó sửa tay trong DB) thì nâng cấp âm thầm là XOÁ
  // một lần nộp trễ đã ghi nhận, và không có gì báo.
  const daTungTre = input.statusHienTai === "COMPLETED_LATE";
  const tre =
    daTungTre ||
    Boolean(input.dueAtOriginal && input.now.getTime() > input.dueAtOriginal.getTime());

  return {
    status: tre ? "COMPLETED_LATE" : "COMPLETED",
    progressPercent: 100,
    isLate: tre,
    // Đã xong từ trước thì KHÔNG phát sự kiện lần nữa: mỗi lần mở lại bài cuối
    // sẽ là một lời chúc mừng mới trong hộp thư người học.
    vuaHoanThanh: !daLaXong,
  };
}
