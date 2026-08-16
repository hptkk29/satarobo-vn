/**
 * Lead Handler — Landing Page Quà Tặng RoboSim
 * Owner: Sata Robo (hptkk29)
 * Version: 2.6.0
 *
 * v2.5: tự tra MÃ NV (cột Q) + TÊN (cột V) từ tab 'Links' của sheet AffLinks
 *   theo MÃ LINK (cột O).
 * v2.6: SAU khi ghi sheet thì đẩy tiếp lead sang Sata Robo (bảng `Lead`) để
 *   admin + Sale xử lý thẳng trên hệ thống, kết quả ghi vào cột W 'SR status'.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * BẢN NÀY COPY ĐÈ TOÀN BỘ FILE CŨ. Không phải chèn tay chỗ nào.
 * So với v2.5 chỉ có 4 thay đổi, phần còn lại giữ NGUYÊN từng ký tự:
 *   1. HEADERS thêm 1 phần tử cuối: 'SR status' (cột W).
 *   2. Trong doPost: lấy `rowIndex` sau appendRow rồi gọi `pushToSataRobo_`.
 *   3. Thêm helper `pushToSataRobo_` (gửi sang Sata Robo, ghi cột W).
 *   4. Thêm `retrySataRoboFailed()` — chạy tay để gửi lại các dòng FAIL.
 *
 * SETUP 1 LẦN — Project Settings > Script Properties, thêm 2 dòng:
 *
 *   SATAROBO_WEBHOOK_URL     = https://test.satarobo.vn/api/public/webhook/quatang
 *   SATAROBO_WEBHOOK_SECRET  = <trùng TUYỆT ĐỐI với env WEBHOOK_QUATANG_SECRET trên Vercel>
 *
 *   Nghiệm thu trên test trước, chạy vài phiếu rồi mới đổi URL sang
 *   https://satarobo.vn/api/public/webhook/quatang (secret của env Production).
 *
 *   ⚠️ THIẾU 2 property này ⇒ script BỎ QUA im lặng, sheet vẫn ghi như cũ.
 *   Cố ý: chưa cấu hình xong thì không được làm gãy luồng đang chạy.
 *
 * SAU KHI DÁN:
 *   1. Chạy `setupHeaders()` 1 lần (ghi tiêu đề cột W — không xoá dữ liệu cũ).
 *   2. Deploy > Manage deployments > Edit > Version: New version > Deploy.
 *      (Không tạo version mới thì web-app vẫn chạy mã CŨ.)
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

const SHEET_NAME = 'Leads';

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Chưa cấu hình Script Property SHEET_ID (ID spreadsheet Leads)');
  return SpreadsheetApp.openById(id);
}

/** Secret hợp lệ: WEBHOOK_SECRET (+ WEBHOOK_SECRET_OLD trong giai đoạn xoay). */
function getValidSecrets_() {
  const props = PropertiesService.getScriptProperties();
  return [props.getProperty('WEBHOOK_SECRET'), props.getProperty('WEBHOOK_SECRET_OLD')]
    .filter(function (s) { return s && s.length > 0; });
}

// Thứ tự CỘT (khớp thứ tự field trên form). Sửa ở đây là cả header + append đổi theo.
const HEADERS = [
  'Thời gian',              // A
  'Họ tên con',             // B  (bắt buộc)
  'Họ tên phụ huynh',       // C
  'SĐT phụ huynh',          // D  (bắt buộc)
  'Email phụ huynh',        // E
  'Trường con đang học',    // F
  'Lớp con đang học',       // G
  'Cơ sở',                  // H
  'Tỉnh/Thành phố',         // I
  'Nguồn',                  // J
  'IP',                     // K
  'User Agent',             // L
  'Trạng thái',             // M
  'Ghi chú',                // N
  'Aff mã link cuối',       // O — mã link THÔ lần chạm cuối (truy ngược được kể cả khi resolve fail)
  'Aff mã link đầu',        // P
  'Aff mã NV',              // Q — mã NV người giới thiệu đã resolve (rỗng = không có)
  'Aff clickId',            // R — nối với tab Clicks của sheet AffLinks
  'Aff thời điểm click',    // S
  'Aff UTM',                // T
  'MISA status',            // U — OK / FAIL_xxx / SKIPPED_CONFIG
  'Tên NV giới thiệu',      // V — tra từ tab NhanVien theo cột Q (Aff mã NV)
  'SR status',              // W — OK / DUP / FAIL_* từ Sata Robo (v2.6)
];

// ============ MAIN HANDLER ============

function doGet(e) {
  return jsonResponse({
    ok: true,
    service: 'Lead Handler - QuaTang',
    version: '2.6.0',
    timestamp: new Date().toISOString(),
  });
}

function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: 'EMPTY_BODY' }, 400);
    }

    let data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (err) {
      return jsonResponse({ ok: false, error: 'INVALID_JSON' }, 400);
    }

    // Verify secret (Script Properties — hỗ trợ 2 secret trong giai đoạn xoay)
    const validSecrets = getValidSecrets_();
    if (validSecrets.length === 0) {
      // Phân biệt với UNAUTHORIZED để chẩn đoán nhanh khi quên set Script Properties
      return jsonResponse({ ok: false, error: 'NOT_CONFIGURED', message: 'Chưa set Script Property WEBHOOK_SECRET' }, 500);
    }
    if (validSecrets.indexOf(data.secret) === -1) {
      return jsonResponse({ ok: false, error: 'UNAUTHORIZED' }, 401);
    }

    // Validate required fields — khớp form: chỉ Họ tên con + SĐT là bắt buộc
    const required = ['ho_ten_con', 'sdt'];
    const missing = required.filter(f => !data[f] || String(data[f]).trim() === '');
    if (missing.length > 0) {
      return jsonResponse({
        ok: false,
        error: 'MISSING_FIELDS',
        fields: missing,
      }, 400);
    }

    // Validate phone
    const sdtClean = String(data.sdt).replace(/[\s\-\.]/g, '');
    if (!/^(\+84|0)\d{8,10}$/.test(sdtClean)) {
      return jsonResponse({
        ok: false,
        error: 'INVALID_PHONE',
        message: 'Số điện thoại không hợp lệ',
      }, 400);
    }

    // Validate email if provided
    if (data.email && data.email.trim() !== '') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        return jsonResponse({
          ok: false,
          error: 'INVALID_EMAIL',
          message: 'Email không hợp lệ',
        }, 400);
      }
    }

    // Bảo đảm có sheet + header đúng cột (tự tạo/ghi nếu thiếu)
    const sheet = ensureSheet_();

    // Tra mã NV + tên theo MÃ LINK (cột O) từ Links tab của AffLinks — nguồn
    // đáng tin, không dính timeout. Mã NV lấy từ đây trước, chỉ fallback về
    // giá trị resolve của server (data.aff_ma_nv) khi Links không có.
    const affInfo = findAffLink_(data.aff_ma_link_cuoi);
    const maNV = (affInfo && affInfo.maNV) || String(data.aff_ma_nv || '').trim();
    const tenNV = affInfo ? affInfo.tenNV : '';

    const timestamp = new Date();

    sheet.appendRow([
      timestamp,                                  // A: Thời gian
      safeCell_(data.ho_ten_con),                 // B: Họ tên con
      safeCell_(data.ho_ten),                     // C: Họ tên phụ huynh
      safeCell_(sdtClean),                        // D: SĐT phụ huynh
      safeCell_(data.email),                      // E: Email phụ huynh
      safeCell_(data.truong),                     // F: Trường con đang học
      safeCell_(data.lop),                        // G: Lớp con đang học
      safeCell_(data.co_so),                      // H: Cơ sở
      safeCell_(data.tinh),                       // I: Tỉnh/Thành phố
      safeCell_(data.source || 'quatang.edu.vn'), // J: Nguồn
      safeCell_(data.ip),                         // K: IP
      safeCell_(data.user_agent),                 // L: User Agent
      'Mới',                                      // M: Trạng thái
      '',                                         // N: Ghi chú
      safeCell_(data.aff_ma_link_cuoi),           // O: Aff mã link cuối
      safeCell_(data.aff_ma_link_dau),            // P: Aff mã link đầu
      safeCell_(maNV),                            // Q: Aff mã NV (tra từ Links tab)
      safeCell_(data.aff_click_id),               // R: Aff clickId
      safeCell_(data.aff_thoi_diem_click),        // S: Aff thời điểm click
      safeCell_(data.aff_utm),                    // T: Aff UTM
      safeCell_(data.misa_status),                // U: MISA status
      safeCell_(tenNV),                           // V: Tên NV giới thiệu (tra từ Links tab)
    ]);

    // ── v2.6: đẩy tiếp sang Sata Robo ───────────────────────────────────────
    // Đặt Ở ĐÂY (sau appendRow, trước mọi thứ khác) là có chủ đích: hàng đã nằm
    // an toàn trong sheet rồi, nên dù Sata Robo chết cũng không mất lead nào.
    const rowIndex = sheet.getLastRow();
    pushToSataRobo_(sheet, rowIndex, data, sdtClean, maNV, tenNV, timestamp);

    // MISA thất bại → email cảnh báo (không im lặng — FR-E04), throttle 15 phút
    // để MISA sập hàng loạt không đốt hết quota MailApp (100 mail/ngày).
    // Lỗi gửi mail không được làm hỏng việc lưu lead.
    try {
      const misaStatus = String(data.misa_status || '');
      if (misaStatus && misaStatus !== 'OK') {
        const alertTo = PropertiesService.getScriptProperties().getProperty('ALERT_EMAIL');
        const cache = CacheService.getScriptCache();
        const throttled = cache.get('misa_alert_sent');
        if (alertTo && !throttled) {
          cache.put('misa_alert_sent', '1', 900); // 15 phút
          MailApp.sendEmail({
            to: alertTo,
            subject: '[MISA-FAIL] Lead quatang.edu.vn chỉ vào Sheet — cần nhập lại MISA',
            body:
              'Một lead vừa KHÔNG vào được MISA CRM (misa_status=' + misaStatus + ').\n\n' +
              'Họ tên con: ' + (data.ho_ten_con || '') + '\n' +
              'SĐT: ' + sdtClean + '\n' +
              'Thời điểm: ' + new Date().toISOString() + '\n\n' +
              'Lead đã được lưu an toàn trong Google Sheet (cột U = ' + misaStatus + ').\n' +
              'Runbook: lọc cột U khác OK, nhập tay vào MISA rồi ghi chú cột N.\n' +
              '(Email này throttle 15 phút — kiểm tra Sheet để thấy TOÀN BỘ row lỗi.)',
          });
        }
      }
    } catch (mailErr) {
      Logger.log('ALERT_EMAIL error (bỏ qua): ' + mailErr.toString());
    }

    // Execution log của Apps Script bị giữ lâu và ai có quyền sửa script đều đọc
    // được → KHÔNG ghi PII vào đây. Che SĐT như phía Next.js (4 số đầu + ***),
    // bỏ hẳn họ tên; chỗ này chỉ cần đủ để soi sự cố, dữ liệu đầy đủ đã ở Sheet.
    Logger.log('Lead saved: sdt=' + sdtClean.slice(0, 4) + '***' +
      ' | cs=' + (data.co_so || '-') + ' | tinh=' + (data.tinh || '-') +
      ' | misa=' + (data.misa_status || '-'));

    return jsonResponse({
      ok: true,
      message: 'Đăng ký thành công',
      timestamp: timestamp.toISOString(),
    });

  } catch (err) {
    Logger.log('ERROR: ' + err.toString() + '\n' + err.stack);
    return jsonResponse({
      ok: false,
      error: 'INTERNAL_ERROR',
      message: err.toString(),
    }, 500);
  }
}

// ============ HELPERS ============

/**
 * Chống formula injection: giá trị bắt đầu bằng = + - @ hoặc tab/CR sẽ được
 * Sheets hiểu là công thức khi mở file — prefix dấu nháy đơn để ép thành text.
 */
function safeCell_(v) {
  const s = String(v == null ? '' : v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function jsonResponse(obj, statusCode) {
  const payload = Object.assign({}, obj, { httpStatus: statusCode || 200 });
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * v2.6 — Đẩy 1 lead sang Sata Robo, rồi ghi kết quả vào cột W ('SR status') để
 * đối soát bằng mắt ngay trên sheet. KHÔNG BAO GIỜ ném — mọi lỗi chỉ ghi cột W.
 *
 * Ý nghĩa cột W:
 *   (trống)                     chưa bật (thiếu Script Property) — không phải lỗi
 *   OK                          Sata Robo đã tạo lead
 *   DUP                         trùng SĐT trong 90 ngày → đã gộp vào hồ sơ cũ
 *   FAIL_401_SAI_SECRET         secret ở đây khác env WEBHOOK_QUATANG_SECRET
 *   FAIL_503_THIEU_SECRET_SERVER  Vercel chưa đặt env WEBHOOK_QUATANG_SECRET
 *   FAIL_<lý do>                phiếu bị từ chối (vd SĐT sai) hoặc lỗi mạng
 * Có FAIL thì chạy `retrySataRoboFailed()` sau khi sửa xong nguyên nhân.
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

/**
 * Đọc toàn bộ Links tab của AffLinks → map { maLink: { maNV, tenNV } }.
 * Nhận diện cột theo TÊN TIÊU ĐỀ nên không vỡ khi thêm/đổi thứ tự cột.
 * Đọc trực tiếp mỗi lần (volume thấp) → thay đổi Links có hiệu lực ngay.
 */
function getAffLinksMap_() {
  const map = {};
  const id = PropertiesService.getScriptProperties().getProperty('AFFLINKS_SHEET_ID');
  if (!id) { Logger.log('Chưa set AFFLINKS_SHEET_ID — bỏ qua tra mã NV/tên.'); return map; }

  try {
    const sheet = SpreadsheetApp.openById(id).getSheetByName('Links');
    if (!sheet || sheet.getLastRow() < 2) return map;

    const values = sheet.getDataRange().getValues();
    const header = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
    const iCode = header.indexOf('mã link');
    const iMaNV = header.indexOf('mã nv');
    let iTen = header.indexOf('người sử dụng');
    if (iTen === -1) iTen = header.indexOf('người dùng');
    if (iTen === -1) iTen = header.indexOf('tên');

    if (iCode === -1) { Logger.log("Links tab thiếu cột 'Mã link'."); return map; }

    for (let r = 1; r < values.length; r++) {
      const code = String(values[r][iCode]).trim();
      if (!code) continue;
      map[code] = {
        maNV: iMaNV > -1 ? String(values[r][iMaNV]).trim() : '',
        tenNV: iTen > -1 ? String(values[r][iTen]).trim() : '',
      };
    }
  } catch (err) {
    Logger.log('getAffLinksMap_ error (bỏ qua): ' + err);
  }
  return map;
}

/** Tra 1 link theo mã. null nếu không có mã / không tìm thấy. */
function findAffLink_(linkCode) {
  const key = String(linkCode == null ? '' : linkCode).trim();
  if (!key) return null;
  const info = getAffLinksMap_()[key];
  return info || null;
}

/** Lấy sheet; nếu chưa có thì tạo. Nếu dòng 1 trống thì ghi header. */
function ensureSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    writeHeaders_(sheet);
  } else if (sheet.getLastRow() === 0) {
    writeHeaders_(sheet);
  }
  return sheet;
}

function writeHeaders_(sheet) {
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.getRange(1, 1, 1, HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#F26419')
    .setFontColor('#FFFFFF');
  sheet.setFrozenRows(1);
}

// ============ CHẠY 1 LẦN SAU KHI PASTE ============
// Ghi/ghi đè dòng tiêu đề cột cho khớp form mới. KHÔNG xoá dữ liệu cũ bên dưới.
function setupHeaders() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  writeHeaders_(sheet);
  // Giãn cột cho dễ đọc
  sheet.autoResizeColumns(1, HEADERS.length);
  Logger.log('✅ Đã ghi ' + HEADERS.length + ' cột tiêu đề khớp form.');
}

// ============ CHẠY 1 LẦN — ĐIỀN MÃ NV + TÊN CHO LEAD CŨ ============
// Đọc MÃ LINK ở cột O, tra Links tab AffLinks, ghi mã NV (cột Q) + tên (cột V)
// cho toàn bộ dòng đã có. Chạy lại bất cứ lúc nào để làm mới sau khi sửa Links.
function backfillAff() {
  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAME);
  const last = sheet.getLastRow();
  if (last < 2) { Logger.log('Không có dòng dữ liệu.'); return; }

  const n = last - 1;
  const map = getAffLinksMap_();
  const linkCodes = sheet.getRange(2, 15, n, 1).getValues();    // cột O = 15 (mã link cuối)
  const existingMaNV = sheet.getRange(2, 17, n, 1).getValues(); // cột Q = 17 (giữ nếu link không có trong map)

  const maNVs = [];
  const tens = [];
  let filled = 0;

  for (let i = 0; i < n; i++) {
    const code = String(linkCodes[i][0]).trim();
    const info = code ? map[code] : null;
    if (info) {
      maNVs.push([info.maNV]);
      tens.push([info.tenNV]);
      filled++;
    } else {
      maNVs.push([existingMaNV[i][0]]); // không khớp → giữ nguyên mã NV cũ (nếu có)
      tens.push(['']);
    }
  }

  sheet.getRange(2, 17, n, 1).setValues(maNVs); // Q
  sheet.getRange(2, 22, n, 1).setValues(tens);  // V
  Logger.log('✅ Backfill: ' + filled + '/' + n + ' dòng khớp link trong AffLinks.');
}

// ============ v2.6 — GỬI LẠI CÁC DÒNG LỖI (chạy tay) ============
// Chỉ dùng cho lead PHÁT SINH SAU khi bật (QĐ-2: không backfill lịch sử).
// Đọc lại từng dòng có cột W bắt đầu bằng 'FAIL' và bắn lại.
//
// ⚠️ Cột D là ô SỐ nên số 0 đầu đã bị nuốt khi đọc ngược từ sheet — Sata Robo
// tự khôi phục được (canonicalPhone nhận cả dạng 9 chữ số), nhưng số dưới 9 chữ
// số thì chịu. Đây là lý do đường CHÍNH đẩy từ payload gốc chứ không đọc sheet.
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
    const ts = r[0] instanceof Date ? r[0] : new Date(r[0]);
    pushToSataRobo_(sheet, i + 2, data, String(r[3]), String(r[16] || ''), String(r[21] || ''), ts);
    retried++;
    Utilities.sleep(300); // đừng bắn dồn
  }

  Logger.log('Đã gửi lại ' + retried + ' dòng FAIL.');
}

// ============ TEST ============
function testAppendRow() {
  const sheet = ensureSheet_();
  sheet.appendRow([
    new Date(),
    'Nguyễn Minh Khoa (xoá được)',       // Họ tên con
    'Nguyễn Văn A',                       // Họ tên phụ huynh
    '0900000000',                         // SĐT
    'bame@example.com',                   // Email
    'Trường Tiểu học Hoàng Văn Thụ',      // Trường
    'Lớp 4',                              // Lớp
    'Cơ sở 1 - 211 Nguyễn Hữu Thọ, Đà Nẵng', // Cơ sở
    'Đà Nẵng',                            // Tỉnh/Thành phố
    'test-from-editor',                   // Nguồn
    '127.0.0.1',                          // IP
    'AppsScript Editor',                  // User Agent
    'Mới',                                // Trạng thái
    'Test data',                          // Ghi chú
  ]);
  Logger.log('✅ Test row appended (14 cột).');
}
