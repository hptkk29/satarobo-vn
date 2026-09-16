// Dấu NHỊP của lưới "bom hẹn giờ" — chạy MỌI lượt, kể cả lượt XANH.
//
// ══ Vì sao file này tồn tại ══
//
// `bao-bom-hen-gio.mjs` mở issue khi CÓ ca đỏ, và không làm gì khi không có:
//
//     "Không có ca đỏ ⇒ không làm gì, thoát 0."
//
// Nghĩa là một lượt XANH không để lại dấu vết nào ở đâu cả. Hệ quả: nếu GitHub tắt
// scheduled workflow sau 60 ngày repo im, hoặc file rơi khỏi nhánh mặc định, hoặc cron
// đơn giản không chạy — lưới này **im lặng y hệt lúc nó khoẻ**.
//
// Chủ dự án đặt thành điều kiện bắt buộc từ lượt duyệt thiết kế:
//
//     "Im lặng vì ổn và im lặng vì chết trông giống hệt nhau."
//
// Ba cảnh báo đã biết đều dẫn tới đúng chỗ đó. Không có vế này thì ta vừa dựng thêm
// **một thứ nói dối bằng cách im lặng**.
//
// ══ Nó làm gì ══
//
// Giữ ĐÚNG MỘT issue mốc (khoá trong tiêu đề), và mỗi lượt chạy GHI ĐÈ phần thân bằng
// dấu nhịp mới. KHÔNG comment — comment thì sau một năm issue dài vô hạn và người đọc
// phải cuộn xuống đáy mới biết trạng thái; thân issue luôn là thứ mới nhất.
//
// Issue này **không bao giờ đóng**: nó không phải một việc phải làm, nó là một cái đèn.
//
// CHẠY (trong workflow, sau khi mọi nhánh matrix xong):
//   node scripts/nhip-bom-hen-gio.mjs <ket-qua-cua-job-bom>
//     <ket-qua> = success | failure | cancelled | skipped   (github needs.<job>.result)
//
// `--thu` = in ra thứ SẼ ghi, không gọi `gh`.

import { execFileSync } from "node:child_process";

const NHAN = "bom-hen-gio";
const KHOA = "[nhip-bom-hen-gio]";
const TIEU_DE = `🫀 Nhịp lưới bom hẹn giờ ${KHOA}`;

/**
 * Trần IM LẶNG = 9 NGÀY, KHÔNG phải 48 giờ.
 *
 * Con số 48 giờ trong vé gốc (`VE-CI-DINH-KY-TREN-MAIN.md`) tính cho một lưới chạy HẰNG
 * NGÀY. Lưới này chạy HẰNG TUẦN (19:00Z thứ Bảy). Bê nguyên 48 giờ sang đây là mọi ngày
 * trong tuần đèn đều báo "đã chết" — và một cái đèn lúc nào cũng đỏ thì người ta thôi nhìn
 * nó, đúng cái bẫy luật 10.
 *
 * 7 ngày (một chu kỳ) + 2 ngày biên cho lượt chạy trễ / runner xếp hàng.
 */
const TRAN_IM_LANG_NGAY = 9;

const THU = process.argv.includes("--thu");
const ketQuaJob = process.argv[2] ?? "unknown";

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" }).trim();
}

/** Nhãn người đọc, kèm ý nghĩa — "failure" trần không nói được nó nghĩa là "có bom". */
const NHAN_KET_QUA = {
  success: "🟢 XANH — không bom nào ở +90 và +400 ngày",
  failure: "🔴 CÓ BOM — xem issue nhãn `bom-hen-gio` để biết ca nào",
  cancelled: "⚪ BỊ HUỶ — lượt này KHÔNG kết luận được gì",
  skipped: "⚪ BỊ BỎ QUA — lượt này KHÔNG kết luận được gì",
};

const bay = new Date(Number(process.env.NHIP_MOC_MS ?? Date.now()));
const sha = (process.env.GITHUB_SHA ?? "?").slice(0, 8);
const runUrl =
  process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null;

const than = `> **Issue này là một CÁI ĐÈN, không phải một việc phải làm.** Đừng đóng nó.

## Lần chạy gần nhất

| | |
|---|---|
| **Thời điểm** | \`${bay.toISOString()}\` |
| **Kết quả** | ${NHAN_KET_QUA[ketQuaJob] ?? `\`${ketQuaJob}\` — không rõ`} |
| **Commit** | \`${sha}\` |
| **Lượt chạy** | ${runUrl ?? "(không có)"} |

---

## 🔴 NẾU DÒNG "Thời điểm" Ở TRÊN QUÁ **${TRAN_IM_LANG_NGAY} NGÀY** KHÔNG ĐỔI

**⇒ LƯỚI ĐÃ CHẾT, KHÔNG PHẢI HỆ THỐNG ĐANG KHOẺ.**

Im lặng vì ổn và im lặng vì chết trông giống hệt nhau. Ba đường chết đã biết:

1. **GitHub tự TẮT scheduled workflow sau 60 ngày repo không hoạt động.** Repo này hoạt
   động hằng ngày nên chưa chạm, nhưng một kỳ nghỉ dài là lúc cái lưới tự biến mất mà
   không báo ai.
2. **\`schedule\` chỉ chạy file ở NHÁNH MẶC ĐỊNH.** Sửa \`bom-hen-gio.yml\` trên một nhánh
   feature là không có hiệu lực cho tới khi merge.
3. Cron không chạy vì lý do phía GitHub — hiếm, nhưng im lặng y hệt.

**Kiểm bằng tay:** Actions → *Bom hẹn giờ (test với đồng hồ tương lai)* → **Run workflow**.

---

## Lưới này canh gì

Chạy bộ Vitest với đồng hồ **đẩy tới +90 và +400 ngày**, để lộ ca test dựng ngày CỨNG rồi
so với "hôm nay" — loại ca hôm nay xanh, tới lúc tờ lịch vượt qua thì **đỏ mãi mãi**, mã
không đổi một dòng nào. Đã xảy ra 13/09/2026: cùng commit \`507ff13b\`, CI ngày 10/09 xanh,
chạy lại ngày 12/09 đỏ.

Nhịp: **19:00Z thứ Bảy = 02:00 sáng Chủ nhật giờ VN**, hằng tuần.

*Dòng trên do \`scripts/nhip-bom-hen-gio.mjs\` ghi đè mỗi lượt chạy.*`;

if (THU) {
  console.log(`[THỬ] tiêu đề: ${TIEU_DE}\n[THỬ] thân:\n${than}`);
  process.exit(0);
}

let dangMo = [];
try {
  dangMo = JSON.parse(
    gh(["issue", "list", "--label", NHAN, "--state", "open", "--limit", "100", "--json", "number,title"]),
  );
} catch (e) {
  // Nhãn chưa tồn tại là chuyện bình thường ở lượt đầu — không phải lỗi.
  console.error("Không đọc được danh sách issue:", e.message);
}

const moc = dangMo.find((i) => i.title.includes(KHOA));
if (moc) {
  gh(["issue", "edit", String(moc.number), "--body", than]);
  console.log(`↻ cập nhật dấu nhịp ở issue #${moc.number}`);
} else {
  const url = gh(["issue", "create", "--title", TIEU_DE, "--label", NHAN, "--body", than]);
  console.log(`+ mở issue mốc dấu nhịp\n  ${url}`);
}
