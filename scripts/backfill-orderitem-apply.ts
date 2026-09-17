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
// BA CỔNG TRƯỚC KHI GHI — bỏ cổng nào cũng mở lại một đường sai
//
//  1. `--confirm=BACKFILL-146` gõ tay. Không có ⇒ **không ghi gì**, chỉ in kế hoạch.
//  2. Script tự khai `user=… · ghi được: CÓ/KHÔNG`. GitHub không cho đọc lại secret, nên đây
//     là cách DUY NHẤT thấy được nó đang nối vào đâu.
//  3. Đếm lại ngay trước khi ghi và **so với mốc đã duyệt**. Lệch quá ngưỡng ⇒ DỪNG: bảng mà
//     chủ dự án duyệt không còn mô tả dữ liệu hiện tại, nên sự duyệt ấy không còn giá trị.
//
// ⚠️ Cổng 3 dùng NGƯỠNG chứ không đòi khớp tuyệt đối, và đó là chủ ý: giữa lúc duyệt bảng và
// lúc chạy, sale vẫn đang làm việc — tiền mới về, đơn mới tạo. Đòi khớp tuyệt đối là một cổng
// không bao giờ qua được, và một cổng không bao giờ qua được sẽ bị người ta tắt.
import { currentDbHost } from "./_load-env";
import { db } from "../lib/db";
import { kiemQuyen, inQuyen } from "./_kiem-quyen";
import { quetKhoanCanGan, ganOrderItemChoDon, type KhoanCanGan } from "../lib/finance/backfill-orderitem";

const MA_XAC_NHAN = "BACKFILL-146";

/** Mốc chủ dự án duyệt 17/09. */
const MOC_KHOAN = 146;
/** Lệch quá bấy nhiêu khoản thì DỪNG — xem chú thích cổng 3. */
const NGUONG_LECH = 25;

const vnd = (n: number) => n.toLocaleString("vi-VN");
const log = (s: string) => {
  console.log(s);
};

const ACTOR = {
  id: "system:backfill-orderitem",
  name: "Backfill orderItemId (workflow)",
};

async function main() {
  const apply = process.argv.includes(`--confirm=${MA_XAC_NHAN}`);

  const quyen = await kiemQuyen(db);
  log(`Đích: ${currentDbHost()}`);
  inQuyen(quyen, apply);
  if (apply && quyen.ghiDuoc === false) {
    log("::error::Đã gõ chuỗi xác nhận nhưng kết nối CHỈ ĐỌC — workflow đang dùng sai secret.");
    process.exit(1);
  }
  log("");

  const q = await quetKhoanCanGan(db);
  log(`SẼ GẮN: ${q.khoan.length} khoản / ${q.soDon} đơn / ${vnd(q.tongTien)}đ`);
  log(
    `KHÔNG gắn: đơn ≥2 con ${q.donNhieuCon.soKhoan} khoản (${vnd(q.donNhieuCon.tongTien)}đ) · ` +
      `đơn không có dòng hàng ${q.donKhongCoDong.soKhoan} · ` +
      `ngoài lọc đơn nhận tiền ${q.ngoaiLocDonNhanTien.soKhoan}`,
  );

  const lech = Math.abs(q.khoan.length - MOC_KHOAN);
  if (lech > NGUONG_LECH) {
    log(
      `::error::Lệch mốc đã duyệt quá xa: nay ${q.khoan.length} khoản, mốc ${MOC_KHOAN} ` +
        `(lệch ${lech} > ngưỡng ${NGUONG_LECH}). Chạy lại bản XEM TRƯỚC, đối chiếu nguyên nhân, ` +
        `rồi xin duyệt bảng mới. KHÔNG ghi gì.`,
    );
    process.exit(1);
  }
  if (lech > 0) log(`(lệch ${lech} khoản so với mốc ${MOC_KHOAN} — trong ngưỡng ${NGUONG_LECH})`);

  if (!apply) {
    log("");
    log(`XEM TRƯỚC — không ghi gì. Muốn ghi thật: truyền --confirm=${MA_XAC_NHAN}`);
    return;
  }

  // Gom theo ĐƠN: một transaction mỗi đơn, một dòng AuditLog mỗi đơn.
  const theoDon = new Map<string, { code: string; khoan: KhoanCanGan[] }>();
  for (const k of q.khoan) {
    const cum = theoDon.get(k.orderId) ?? { code: k.orderCode, khoan: [] };
    cum.khoan.push(k);
    theoDon.set(k.orderId, cum);
  }

  log("");
  log(`Bắt đầu ghi — ${theoDon.size} đơn.`);
  let tongGan = 0;
  let tongBoQua = 0;
  let donLoi = 0;

  for (const [orderId, cum] of theoDon) {
    try {
      const r = await db.$transaction((tx) =>
        ganOrderItemChoDon(tx, { orderId, orderCode: cum.code, khoan: cum.khoan, actor: ACTOR }),
      );
      tongGan += r.daGan;
      tongBoQua += r.boQua;
      if (r.boQua > 0) {
        // Bỏ qua là LÀNH: `updateMany` có `orderItemId: null` trong `where`, nên 0 dòng đổi
        // nghĩa là ai đó vừa gắn tay khoản ấy. Ta không đè lên lựa chọn của con người.
        log(`  ${cum.code}: gắn ${r.daGan}, bỏ qua ${r.boQua} (đã được gắn trước đó)`);
      }
    } catch (e) {
      // MỘT đơn lỗi không được giết cả lượt: lệnh này idempotent nên phần đã ghi vẫn đúng và
      // chạy lại chỉ nhặt phần còn lại. Dừng cả lượt vì một đơn là biến một sự cố nhỏ thành
      // một lượt chạy dở dang mà không ai biết đã tới đâu.
      donLoi += 1;
      log(`::warning::${cum.code}: LỖI — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  log("");
  log(`XONG: gắn ${tongGan} khoản · bỏ qua ${tongBoQua} · đơn lỗi ${donLoi}`);

  // Nghiệm thu ngay trong cùng lượt: quét lại, nhóm "sẽ gắn" phải về 0.
  const sau = await quetKhoanCanGan(db);
  log(`Quét lại: còn ${sau.khoan.length} khoản thuộc đơn MỘT con chưa gắn (phải là 0).`);
  log(
    `Còn lại đúng như thiết kế: đơn ≥2 con ${sau.donNhieuCon.soKhoan} khoản ` +
      `(${vnd(sau.donNhieuCon.tongTien)}đ) — phần này SALE tự chia.`,
  );
  if (sau.khoan.length !== 0) {
    log("::error::Vẫn còn khoản của đơn MỘT con chưa gắn — xem log từng đơn ở trên.");
    process.exit(1);
  }
  if (donLoi > 0) {
    log("::error::Có đơn lỗi — xem ::warning:: ở trên. Chạy lại lượt nữa (idempotent).");
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
