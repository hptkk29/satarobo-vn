/**
 * ⚠️ ĐÃ CÓ BẢN FULL: `apps-script-quatang-v2.6-full.js` là **toàn bộ file** đã ráp
 * sẵn 4 khối dưới đây vào đúng chỗ trong mã v2.5 của anh — copy đè một lần là xong.
 * File này giữ lại để đối chiếu "đã thêm đúng những gì", đừng dán cả hai.
 *
 * ĐOẠN THÊM VÀO `doPost` CỦA APPS SCRIPT QUATANG — P3 (16/08/2026)
 * Mục đích: sau khi ghi sheet, đẩy tiếp lead sang Sata Robo để admin/Sale xử lý.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SETUP 1 LẦN — Project Settings > Script Properties, thêm 2 dòng:
 *
 *   SATAROBO_WEBHOOK_URL     = https://satarobo.vn/api/public/webhook/quatang
 *   SATAROBO_WEBHOOK_SECRET  = <trùng TUYỆT ĐỐI với env WEBHOOK_QUATANG_SECRET trên Vercel>
 *
 *   Nghiệm thu trước thì để URL là https://test.satarobo.vn/api/public/webhook/quatang
 *   (secret của môi trường `test`), chạy vài phiếu rồi mới đổi sang prod.
 *
 *   THIẾU 2 property này ⇒ script BỎ QUA im lặng, sheet vẫn ghi như cũ.
 *   Cố ý: chưa cấu hình xong thì không được làm gãy luồng đang chạy.
 *
 * SAU KHI DÁN:
 *   1. Thêm 'SR status' vào cuối mảng HEADERS (xem mục [1] bên dưới).
 *   2. Chạy setupHeaders() 1 lần (ghi tiêu đề cột W).
 *   3. Deploy > Manage deployments > Edit > Version: New version > Deploy.
 *
 * BA ĐIỀU CỐ Ý, ĐỪNG "TỐI ƯU" ĐI:
 *   a. Gọi SAU appendRow. Sata Robo chết thì sheet vẫn giữ lead — không mất gì.
 *   b. XOÁ `secret` khỏi payload trước khi gửi. Sata Robo lưu nguyên payload vào
 *      bảng WebhookDelivery và hiện nó trên màn quản trị; gửi kèm secret là tự
 *      tay rải WEBHOOK_SECRET của chính script này sang DB + màn hình người khác.
 *   c. Bọc try/catch + muteHttpExceptions. Lỗi mạng phía Sata Robo TUYỆT ĐỐI
 *      không được làm hỏng việc ghi sheet.
 * ────────────────────────────────────────────────────────────────────────────
 */

// ══════════════════════════════════════════════════════════════════════════
// [1] SỬA MẢNG HEADERS — thêm ĐÚNG 1 dòng vào cuối, sau 'Tên NV giới thiệu':
// ══════════════════════════════════════════════════════════════════════════
//
//   'Tên NV giới thiệu',      // V — tra từ tab NhanVien theo cột Q (Aff mã NV)
//   'SR status',              // W — OK / DUP / lý do lỗi từ Sata Robo
// ];


// ══════════════════════════════════════════════════════════════════════════
// [2] TRONG `doPost`: đổi lời gọi appendRow để LẤY SỐ DÒNG, rồi gọi hàm đẩy.
//     Thay khối `sheet.appendRow([ ... ]);` hiện tại bằng:
// ══════════════════════════════════════════════════════════════════════════
//
//   sheet.appendRow([
//     ... giữ nguyên 22 phần tử A→V như cũ ...
//   ]);
//   const rowIndex = sheet.getLastRow();
//
//   // Đẩy sang Sata Robo (không làm hỏng luồng ghi sheet nếu lỗi).
//   pushToSataRobo_(sheet, rowIndex, data, sdtClean, maNV, tenNV, timestamp);


// ══════════════════════════════════════════════════════════════════════════
// [3] DÁN NGUYÊN HÀM NÀY vào mục HELPERS (cạnh findAffLink_).
// ══════════════════════════════════════════════════════════════════════════

/**
 * Đẩy 1 lead sang Sata Robo, rồi ghi kết quả vào cột W ('SR status') để đối
 * soát bằng mắt ngay trên sheet. KHÔNG BAO GIỜ ném — mọi lỗi chỉ ghi cột W + log.
 */
function pushToSataRobo_(sheet, rowIndex, data, sdtClean, maNV, tenNV, timestamp) {
  const SR_STATUS_COL = 23; // cột W

  function writeStatus(value) {
    try {
      sheet.getRange(rowIndex, SR_STATUS_COL).setValue(value);
    } catch (e) {
      Logger.log('SR status write error (bỏ qua): ' + e);
    }
  }

  try {
    const props = PropertiesService.getScriptProperties();
    const url = props.getProperty('SATAROBO_WEBHOOK_URL');
    const secret = props.getProperty('SATAROBO_WEBHOOK_SECRET');
    if (!url || !secret) {
      Logger.log('Chưa set SATAROBO_WEBHOOK_URL/SECRET — bỏ qua đẩy Sata Robo.');
      return; // để trống cột W: chưa bật, không phải lỗi
    }

    // Bản sao payload, BỎ secret của chính script này (xem điều (b) ở đầu file).
    const body = {};
    for (const k in data) {
      if (Object.prototype.hasOwnProperty.call(data, k) && k !== 'secret') {
        body[k] = data[k];
      }
    }

    // Ghi đè bằng giá trị đã xử lý phía script — đáng tin hơn cái site gửi lên.
    body.sdt = sdtClean;                       // đã bỏ khoảng trắng/gạch/chấm
    body.aff_ma_nv = maNV || '';               // tra từ Links tab, không phải resolve server
    body.aff_ten_nv = tenNV || '';
    // Khoá chống trùng: gửi lại đúng phiếu này sẽ KHÔNG đẻ lead thứ hai.
    body.event_id = String(timestamp.getTime()) + '-' + sdtClean;

    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-webhook-secret': secret },
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
      followRedirects: false,
    });

    const code = res.getResponseCode();
    const text = res.getContentText();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (e) { /* không phải JSON */ }

    if (code === 200 && parsed && parsed.ok) {
      writeStatus(parsed.duplicate ? 'DUP' : 'OK');
    } else if (code === 401) {
      // Lệch secret giữa Script Properties và env Vercel — dạng hỏng hay gặp nhất.
      writeStatus('FAIL_401_SAI_SECRET');
    } else if (code === 503) {
      writeStatus('FAIL_503_THIEU_SECRET_SERVER');
    } else {
      const reason = (parsed && parsed.error) ? String(parsed.error) : ('HTTP_' + code);
      writeStatus('FAIL_' + reason.slice(0, 60));
    }
  } catch (err) {
    // Mạng chậm/timeout: sheet ĐÃ ghi xong nên lead không mất. Đánh dấu để gửi lại.
    writeStatus('FAIL_' + String(err).slice(0, 60));
    Logger.log('pushToSataRobo_ error (bỏ qua): ' + err);
  }
}


// ══════════════════════════════════════════════════════════════════════════
// [4] (tuỳ chọn) GỬI LẠI CÁC DÒNG LỖI — chạy tay khi cột W có FAIL_*
// ══════════════════════════════════════════════════════════════════════════
//
// Chỉ dùng cho lead PHÁT SINH SAU khi bật (QĐ-2: không backfill lịch sử).
// Đọc lại từng dòng có cột W bắt đầu bằng 'FAIL' và bắn lại. `event_id` giữ
// nguyên theo mốc thời gian ở cột A nên gửi lại không đẻ lead trùng.

function retrySataRoboFailed() {
  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAME);
  const last = sheet.getLastRow();
  if (last < 2) { Logger.log('Không có dòng dữ liệu.'); return; }

  const n = last - 1;
  const rows = sheet.getRange(2, 1, n, 23).getValues();
  let retried = 0;

  for (let i = 0; i < n; i++) {
    const status = String(rows[i][22] || ''); // cột W
    if (status.indexOf('FAIL') !== 0) continue;

    const r = rows[i];
    const data = {
      ho_ten_con: r[1], ho_ten: r[2], sdt: String(r[3]), email: r[4],
      truong: r[5], lop: r[6], co_so: r[7], tinh: r[8], source: r[9],
      ip: r[10], user_agent: r[11],
      aff_ma_link_cuoi: r[14], aff_ma_link_dau: r[15],
      aff_click_id: r[17], aff_thoi_diem_click: r[18], aff_utm: r[19],
      misa_status: r[20],
    };
    // ⚠️ Cột D là ô SỐ nên số 0 đầu đã bị nuốt — Sata Robo tự khôi phục được
    // (canonicalPhone nhận cả dạng 9 chữ số), nhưng số <9 chữ số thì chịu.
    const ts = r[0] instanceof Date ? r[0] : new Date(r[0]);
    pushToSataRobo_(sheet, i + 2, data, String(r[3]), String(r[16] || ''), String(r[21] || ''), ts);
    retried++;
    Utilities.sleep(300); // đừng bắn dồn
  }
  Logger.log('Đã gửi lại ' + retried + ' dòng FAIL.');
}
