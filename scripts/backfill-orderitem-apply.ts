// scripts/backfill-orderitem-apply.ts — GẮN THẬT `Payment.orderItemId`. TỆP NÀY GHI VÀO DB.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ ĐÂY LÀ TỆP CÓ ĐƯỜNG GHI. Bản xem trước ở tệp KHÁC
// (`scripts/backfill-orderitem-dry.ts`), chạy bằng workflow KHÁC, với secret KHÁC.
//
// Tách hai tệp chứ không dùng một cờ `--apply`: cờ thì lật được, kể cả lật nhầm, và một
// workflow chỉ-đọc gọi tệp có sẵn đường ghi là một lớp khoá chỉ còn trên giấy.
//
// ─────────────────────────────────────────────────────────────────────────────
// BỐN CỔNG TRƯỚC KHI COMMIT — bỏ cổng nào cũng mở lại một đường sai
//
//  1. `--confirm=BACKFILL-146` gõ tay. Không có ⇒ **không ghi gì**, chỉ in kế hoạch.
//  2. `--expect=<N>` gõ tay, lấy từ bảng xem trước chủ dự án ĐÃ DUYỆT. Không có ⇒ không ghi.
//     Đây là thứ buộc lượt ghi khớp với đúng cái BẢNG ĐƯỢC DUYỆT, chứ không phải với "bất cứ
//     gì DB đang có lúc này".
//  3. Script tự khai `user=… · ghi được: CÓ/KHÔNG`. GitHub không cho đọc lại secret, nên đây
//     là cách DUY NHẤT thấy được nó đang nối vào đâu.
//  4. **SỐ DÒNG BỊ ẢNH HƯỞNG ≠ SỐ ĐÃ DUYỆT ⇒ NÉM ⇒ ROLLBACK.** Cổng này nằm TRONG
//     transaction, sau câu UPDATE và trước commit. `return` KHÔNG rollback — chỉ `throw` mới
//     rollback (CLAUDE.md mục 7).
//
// ⚠️ ĐÃ BỎ "NGƯỠNG LỆCH". Bản trước cho lệch tới 25 khoản, lý do *"sale vẫn đang làm việc giữa
// lúc duyệt và lúc chạy"*. Chủ dự án chốt 18/09: **khớp tuyệt đối, lệch thì ROLLBACK** — và
// điều đó đúng hơn lập luận cũ của tôi: transaction rollback được, nên một lượt bị chặn không
// tốn gì ngoài một lần chạy lại, còn một lượt ghi lệch bảng-đã-duyệt thì không ai biết nó lệch
// cái gì. Lập luận "cổng quá chặt sẽ bị người ta tắt" chỉ đúng với cổng KHÔNG rollback được.
import { currentDbHost } from "./_load-env";
import { db } from "../lib/db";
import { kiemQuyen, inQuyen } from "./_kiem-quyen";
import {
  quetKhoanCanGan,
  ganOrderItemMotCau,
  ghiAuditBackfill,
} from "../lib/finance/backfill-orderitem";

const MA_XAC_NHAN = "BACKFILL-146";

const vnd = (n: number) => n.toLocaleString("vi-VN");
const log = (s: string) => {
  console.log(s);
};

const ACTOR = {
  id: "system:backfill-orderitem",
  name: "Backfill orderItemId (workflow)",
};

/** Lỗi canh sẵn để rollback — xem cổng 4. */
const LOI_LECH = "__SO_DONG_LECH__";

/** `null` = không truyền; `NaN` = truyền nhưng không phải số nguyên ≥ 0. */
function docSoDuyet(): number | null {
  const a = process.argv.find((x) => x.startsWith("--expect="));
  if (!a) return null;
  const n = Number(a.slice("--expect=".length));
  return Number.isInteger(n) && n >= 0 ? n : Number.NaN;
}

async function main() {
  const coMa = process.argv.includes(`--confirm=${MA_XAC_NHAN}`);
  const soDuyet = docSoDuyet();

  const quyen = await kiemQuyen(db);
  log(`Đích: ${currentDbHost()}`);
  inQuyen(quyen, coMa);
  log("");

  // ── XEM TRƯỚC (luôn chạy, kể cả ở lượt ghi) ───────────────────────────────
  // In kế hoạch vào log ngay trước khi ghi, nên log của lượt ghi tự mang theo bằng chứng
  // "đã gắn đúng cái gì".
  const q = await quetKhoanCanGan(db);
  log(`SẼ GẮN: ${q.khoan.length} khoản / ${q.soDon} đơn / ${vnd(q.tongTien)}đ`);
  log(
    `Bị loại — trạng thái đơn: ${q.biLoaiTrangThai.soKhoan} khoản ` +
      `(${vnd(q.biLoaiTrangThai.tongTien)}đ)` +
      (q.biLoaiTrangThai.danhSach.length > 0
        ? `: ${q.biLoaiTrangThai.danhSach.map((x) => `${x.orderCode}/${x.trangThaiDon}`).join(", ")}`
        : ""),
  );
  log(`Bị loại — đơn xoá mềm: ${q.biLoaiXoaMem.soKhoan} khoản (${vnd(q.biLoaiXoaMem.tongTien)}đ)`);
  log(
    `Ngoài tập đối chiếu — đơn ≥2 con: ${q.donNhieuCon.soKhoan} khoản ` +
      `(${vnd(q.donNhieuCon.tongTien)}đ) · đơn 0 dòng: ${q.donKhongCoDong.soKhoan} · ` +
      `bút toán khác: ${q.butToanKhac.soKhoan}`,
  );
  log("");

  if (Number.isNaN(soDuyet)) {
    log("::error::`--expect` không phải số nguyên ≥ 0. KHÔNG ghi gì.");
    process.exit(1);
  }
  if (coMa && soDuyet === null) {
    log("::error::Có `--confirm` nhưng THIẾU `--expect=<số khoản của bảng đã duyệt>`. KHÔNG ghi gì.");
    process.exit(1);
  }
  if (!coMa) {
    log("XEM TRƯỚC — không ghi gì.");
    log(`Muốn ghi thật: --confirm=${MA_XAC_NHAN} --expect=<số khoản của bảng đã duyệt>`);
    return;
  }
  if (quyen.ghiDuoc === false) {
    log("::error::Đã gõ chuỗi xác nhận nhưng kết nối CHỈ ĐỌC — workflow đang dùng sai secret.");
    process.exit(1);
  }

  // ── GHI ───────────────────────────────────────────────────────────────────
  log(`Bắt đầu ghi. Số đã duyệt: ${soDuyet}.`);
  let kq: { daGan: number; soDon: number } | undefined;
  try {
    kq = await db.$transaction(
      async (tx) => {
        // MỘT câu UPDATE, tự kiểm lại NĂM điều kiện trong cùng câu. Nó KHÔNG nhận id nào từ
        // bước quét ở trên — bước ấy chỉ để IN RA và để lấy con số so sánh.
        const dong = await ganOrderItemMotCau(tx);

        // CỔNG 4 — nằm TRONG transaction, sau UPDATE, TRƯỚC commit.
        if (dong.length !== soDuyet) {
          log(
            `::error::Số dòng bị ảnh hưởng (${dong.length}) ≠ số đã duyệt (${soDuyet}). ` +
              `ROLLBACK — không ghi gì. Chạy lại bản XEM TRƯỚC và xin duyệt bảng mới.`,
          );
          throw new Error(LOI_LECH);
        }

        const don = await ghiAuditBackfill(tx, { dong, actor: ACTOR });
        return { daGan: dong.length, soDon: don };
      },
      // Transaction tương tác mặc định cắt ở 5 giây. Đây là một câu UPDATE trên ~150 dòng cộng
      // ~120 dòng AuditLog qua WAN sang Supabase — trần mặc định quá ngắn, và bị cắt giữa
      // đường thì ta mất chính cái transaction đang bảo vệ mình.
      { timeout: 120_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (e instanceof Error && e.message === LOI_LECH) process.exit(1);
    throw e;
  }

  log(`XONG: gắn ${kq.daGan} khoản trên ${kq.soDon} đơn (AuditLog 1 dòng/đơn).`);

  // Nghiệm thu ngay trong cùng lượt: quét lại, nhóm "sẽ gắn" phải về 0.
  const sau = await quetKhoanCanGan(db);
  log(`Quét lại: còn ${sau.khoan.length} khoản thuộc đơn MỘT con chưa gắn (phải là 0).`);
  log(
    `Còn lại đúng như thiết kế: đơn ≥2 con ${sau.donNhieuCon.soKhoan} khoản ` +
      `(${vnd(sau.donNhieuCon.tongTien)}đ) — phần này SALE tự chia.`,
  );
  if (sau.khoan.length !== 0) {
    log("::error::Vẫn còn khoản của đơn MỘT con chưa gắn — xem log ở trên.");
    process.exit(1);
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
