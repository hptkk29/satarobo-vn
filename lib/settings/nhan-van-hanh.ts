// lib/settings/nhan-van-hanh.ts — lớp NGÔN NGỮ NGƯỜI VẬN HÀNH cho trang Cấu hình vận hành.
//
// ── VÌ SAO CÓ FILE NÀY ───────────────────────────────────────────────────────────────────
// `registry.ts` đặt tên theo cách người viết mã nghĩ: `group: "cron"`, nhãn mang "SLA-0",
// "rate-limit", "signed URL", "idempotency", "geofence", "cutover", "Template ID". Người dùng
// trang này là quản trị hệ thống của trung tâm — họ không biết cron là gì, và họ KHÔNG thể
// đoán. Một tham số mà người có quyền đổi không hiểu nghĩa thì hoặc là không ai đụng tới, hoặc
// là bị đổi sai; cả hai đều tệ hơn là không có tham số.
//
// Nên: registry giữ nguyên (nó là hợp đồng kỹ thuật, và `key` vẫn là thứ tra được trong nhật
// ký kiểm toán), còn file này khai CÁI TÊN VÀ CÂU GIẢI THÍCH mà con người đọc.
//
// ── HAI LUẬT CỦA FILE NÀY ────────────────────────────────────────────────────────────────
// 1. MỌI key trong `SETTINGS` phải có một dòng ở đây. Thiếu một dòng thì tham số đó rơi khỏi
//    giao diện — không lỗi, không cảnh báo, chỉ là người vận hành không bao giờ thấy nó nữa.
//    `nhan-van-hanh.test.ts` khoá lại cả hai chiều.
// 2. `giaiThich` trả lời "đổi cái này thì CHUYỆN GÌ XẢY RA", không phải "cái này là gì". Câu
//    "Ngưỡng sắp hết khoá" không giúp ai quyết định; câu "còn bao nhiêu buổi thì học viên hiện
//    lên danh sách cần gọi tái tục" thì có.
//
// THUẦN: không DB, không React. Test không cần dựng gì.

import { SETTING_KEYS, type SettingKey } from "./registry";

/**
 * Các tab của trang, theo đúng thứ tự hiện ra.
 *
 * ⚠️ `ten` phải NGẮN — một hoặc hai từ. Đo 13/09: bản đầu đặt nhãn đầy đủ ("Thông báo điện
 * thoại", "Đăng nhập & mã xác thực"…) thì 11 tab cần ~1553px, tức KHÔNG BAO GIỜ vừa một
 * hàng kể cả trên màn 1440 — thanh tab cuộn ngang và tab đầu bị cắt cụt giữa chữ. Câu đầy
 * đủ nằm ở `moTa`, hiện ngay dưới thanh tab khi tab đó đang mở, nên không mất thông tin gì.
 *
 * Chia theo CÔNG VIỆC của người vận hành, không theo module mã nguồn. Ví dụ mọi thứ liên quan
 * tới tin Zalo gửi phụ huynh nằm chung một tab, dù trong mã chúng thuộc ba nhóm khác nhau
 * (`chat`, `zalo`, `student`) — người đi chỉnh "tin nhắn cho phụ huynh" không việc gì phải
 * biết ranh giới module.
 */
export const TAB_CAU_HINH = [
  {
    id: "thong-bao-day",
    ten: "Thông báo đẩy",
    moTa: "Thông báo hiện trên màn hình khoá điện thoại của nhân viên.",
  },
  {
    id: "zalo",
    ten: "Tin Zalo",
    moTa: "Các loại tin nhắn Zalo hệ thống gửi cho phụ huynh. Mỗi tin gửi đi đều tốn phí.",
  },
  {
    id: "dang-nhap",
    ten: "Đăng nhập",
    moTa: "Mã xác thực gửi qua Zalo khi đăng nhập hoặc kích hoạt tài khoản.",
  },
  {
    id: "hoc-vien",
    ten: "Học viên",
    moTa: "Các mốc để hệ thống tự nhắc: sắp hết khoá, hay vắng, sinh nhật, bảo lưu.",
  },
  {
    id: "lop-gv",
    ten: "Lớp & giáo viên",
    moTa: "Sĩ số, tải dạy và những gì phụ huynh được xem.",
  },
  {
    id: "cham-cong",
    ten: "Chấm công",
    moTa: "Quy định chấm công, đi muộn, nghỉ phép và đăng ký ca.",
  },
  {
    id: "khach-hang",
    ten: "Khách hàng",
    moTa: "Chống trùng khách, hoa hồng, và các mốc thời gian bị coi là chậm xử lý.",
  },
  {
    id: "tien",
    ten: "Thanh toán",
    moTa: "Nhắc công nợ, mã QR chuyển khoản và cách đối khớp tiền về.",
  },
  {
    id: "nhac-tu-dong",
    ten: "Nhắc tự động",
    moTa: "Hệ thống tự nhắc trước bao lâu, và bảng việc cần xử lý hiện thế nào.",
  },
  {
    id: "cong-ty",
    ten: "Công ty",
    moTa: "Số điện thoại, email và các khối nội dung hiện trên website.",
  },
  {
    id: "nang-cao",
    ten: "Nâng cao",
    moTa: "Ít khi phải đụng tới. Hỏi bên kỹ thuật trước khi đổi.",
  },
  {
    id: "phuong-thuc-tt",
    ten: "Phương thức thanh toán",
    moTa:
      "Tiền mặt, chuyển khoản, cổng online — khai theo từng cơ sở hoặc dùng chung cho cả " +
      "hệ thống. Tài khoản ngân hàng dựng mã QR nằm ngay trong từng phương thức.",
  },
  {
    id: "hoa-hong",
    ten: "Hoa hồng",
    moTa:
      "Khoản chi cho nhân sự khi có học viên mới, tái tục, chuyển trung tâm hoặc bán thiết " +
      "bị. Thêm bớt được, không cần lập trình viên.",
  },
] as const;

export type TabId = (typeof TAB_CAU_HINH)[number]["id"];

export interface NhanVanHanh {
  tab: TabId;
  /** Tên người vận hành đọc. Viết như một câu nói, không phải như tên biến. */
  ten: string;
  /** Đổi cái này thì chuyện gì xảy ra. Một hoặc hai câu. */
  giaiThich: string;
  /** Đơn vị in cạnh ô nhập: "phút", "ngày", "học viên"… Bỏ trống với bật/tắt và văn bản. */
  donVi?: string;
  /** true = đổi sai gây hậu quả rộng hoặc tốn tiền ⇒ giao diện gắn dấu nhắc. */
  canThan?: boolean;
}

const N: Readonly<Record<SettingKey, NhanVanHanh>> = {
  // ── Thông báo điện thoại ───────────────────────────────────────────────────────────────
  "push.webPushEnabled": {
    tab: "thong-bao-day",
    ten: "Bật thông báo trên điện thoại",
    giaiThich:
      "Tắt thì không ai nhận được gì ngoài chuông trong trang quản trị. Bật xong mỗi người " +
      "vẫn phải tự vào Cài đặt bấm “Bật thông báo” một lần trên máy của mình.",
    canThan: true,
  },
  "push.tienToDuocDay": {
    tab: "thong-bao-day",
    ten: "Loại thông báo được đẩy",
    giaiThich: "Chọn bằng bảng công tắc bên dưới.",
  },

  // ── Tin Zalo cho phụ huynh ─────────────────────────────────────────────────────────────
  "zalo.znsLive": {
    tab: "zalo",
    ten: "Gửi tin Zalo thật",
    giaiThich:
      "Tắt thì hệ thống vẫn ghi sổ “đã gửi” nhưng không gửi gì và không tốn tiền — dùng khi " +
      "chạy thử. Bật là tin đi tới điện thoại phụ huynh thật.",
    canThan: true,
  },
  "zalo.znsTemplateOtp": {
    tab: "zalo",
    ten: "Mẫu tin: mã xác thực",
    giaiThich:
      "Số hiệu mẫu tin đã được Zalo duyệt, nhập trong dấu nháy kép. Đặt số của mẫu chưa duyệt " +
      "là mọi tin loại này hỏng hết. Để trống thì không gửi.",
    canThan: true,
  },
  "zalo.znsTemplateAccount": {
    tab: "zalo",
    ten: "Mẫu tin: cấp tài khoản cho phụ huynh",
    giaiThich: "Cùng quy tắc với mẫu mã xác thực. Để trống thì không gửi.",
    canThan: true,
  },
  "zalo.znsAccountEnabled": {
    tab: "zalo",
    ten: "Gửi tin báo đã cấp tài khoản",
    giaiThich: "Tin báo cho phụ huynh biết tài khoản cổng phụ huynh đã sẵn sàng.",
  },
  "zalo.znsTemplateBirthday": {
    tab: "zalo",
    ten: "Mẫu tin: chúc mừng sinh nhật",
    giaiThich: "Cùng quy tắc với mẫu mã xác thực. Để trống thì không gửi.",
    canThan: true,
  },
  "student.birthdayZnsEnabled": {
    tab: "zalo",
    ten: "Gửi tin chúc mừng sinh nhật học viên",
    giaiThich:
      "Tắt chỉ ngưng tốn tiền tin nhắn — phần nhắc việc cho tư vấn, quản lý cơ sở và giáo " +
      "viên vẫn chạy như thường.",
  },
  "chat.znsNotifyEnabled": {
    tab: "zalo",
    ten: "Báo phụ huynh khi có tin nhắn mới trong nhóm lớp",
    giaiThich:
      "Chỉ nhắn khi phụ huynh đã lâu không mở tin. Các mốc thời gian nằm ngay bên dưới.",
  },
  "chat.znsTemplateNewMessage": {
    tab: "zalo",
    ten: "Mẫu tin: có tin nhắn mới",
    giaiThich: "Cùng quy tắc với mẫu mã xác thực. Để trống thì không gửi.",
    canThan: true,
  },
  "chat.znsUnreadMinutes": {
    tab: "zalo",
    ten: "Tin thường: chưa đọc bao lâu thì nhắn Zalo",
    giaiThich: "Hạ số này xuống là phụ huynh bị nhắn sớm hơn và nhiều hơn.",
    donVi: "phút",
  },
  "chat.znsAnnouncementUnreadMinutes": {
    tab: "zalo",
    ten: "Thông báo của lớp: chưa đọc bao lâu thì nhắn Zalo",
    giaiThich: "Tách riêng với tin thường để thông báo quan trọng được nhắc sớm hơn nếu cần.",
    donVi: "phút",
  },
  "chat.znsCooldownMinutes": {
    tab: "zalo",
    ten: "Mỗi phụ huynh chỉ nhận 1 tin cho mỗi nhóm lớp trong",
    giaiThich:
      "Cái chặn “bão tin nhắn”: lớp trao đổi sôi nổi cũng chỉ sinh một tin trong khoảng này. " +
      "Hạ xuống là số tin gửi đi và tiền tin nhắn tăng theo.",
    donVi: "phút",
    canThan: true,
  },
  "chat.znsMaxPerRun": {
    tab: "zalo",
    ten: "Số tin tối đa mỗi lượt gửi tự động",
    giaiThich:
      "Lưới chặn hoá đơn bất ngờ khi có sự cố. Phần vượt không mất, nó chờ lượt sau.",
    donVi: "tin",
    canThan: true,
  },

  // ── Đăng nhập & mã xác thực ────────────────────────────────────────────────────────────
  "otp.ttlMinutes": {
    tab: "dang-nhap",
    ten: "Mã xác thực dùng được trong",
    giaiThich: "Quá thời gian này người dùng phải xin mã mới.",
    donVi: "phút",
  },
  "otp.maxAttempts": {
    tab: "dang-nhap",
    ten: "Nhập sai tối đa",
    giaiThich: "Quá số lần này thì mã đó bị huỷ, phải xin mã khác.",
    donVi: "lần",
  },
  "otp.resendCooldownSec": {
    tab: "dang-nhap",
    ten: "Phải chờ bao lâu mới xin lại mã",
    giaiThich: "Đặt quá ngắn thì một người bấm nhiều lần là tốn nhiều tin.",
    donVi: "giây",
  },
  "otp.dailyLimit": {
    tab: "dang-nhap",
    ten: "Mỗi số điện thoại xin tối đa",
    giaiThich: "Chặn một số bị dùng để rút tiền tin nhắn của trung tâm.",
    donVi: "mã/ngày",
  },
  "otp.ipMaxPerHour": {
    tab: "dang-nhap",
    ten: "Mỗi máy khách xin tối đa",
    giaiThich:
      "Áp cho trang công khai, nơi người lạ cũng bấm được. Không liên quan tới nhân viên " +
      "đăng nhập trong nội bộ.",
    donVi: "mã/giờ",
  },
  "otp.globalDailyCap": {
    tab: "dang-nhap",
    ten: "Cả hệ thống gửi tối đa",
    giaiThich: "Chạm trần thì người xin mã nhận thông báo thử lại sau.",
    donVi: "mã/ngày",
  },
  "otp.globalKillSwitch": {
    tab: "dang-nhap",
    ten: "Vượt ngưỡng này thì tự ngắt gửi mã",
    giaiThich:
      "Lưới cuối cùng. Đây là con số để CHẶN sự cố, nên phải cao hơn mức trần ở trên.",
    donVi: "mã/ngày",
    canThan: true,
  },

  // ── Học viên ───────────────────────────────────────────────────────────────────────────
  "student.nearEndThreshold": {
    tab: "hoc-vien",
    ten: "Còn bao nhiêu buổi thì coi là sắp hết khoá",
    giaiThich: "Học viên tới mốc này sẽ hiện ở danh sách cần gọi tái tục.",
    donVi: "buổi",
  },
  "student.renewalWindowDays": {
    tab: "hoc-vien",
    ten: "Học xong rồi vẫn tính là còn cơ hội tái tục trong",
    giaiThich: "Quá thời gian này hệ thống ngưng nhắc tư vấn gọi lại.",
    donVi: "ngày",
  },
  "student.absenceUrgentThresholdDays": {
    tab: "hoc-vien",
    ten: "Phụ huynh báo vắng trước bao nhiêu ngày thì coi là gấp",
    giaiThich: "Báo sát ngày hơn mức này sẽ hiện màu cảnh báo để xếp lịch bù kịp.",
    donVi: "ngày",
  },
  "student.frequentAbsentThreshold": {
    tab: "hoc-vien",
    ten: "Vắng bao nhiêu buổi thì coi là hay vắng",
    giaiThich: "Học viên hay vắng sẽ hiện ở danh sách cảnh báo rủi ro để chăm sóc sớm.",
    donVi: "buổi",
  },
  "student.frequentAbsentWindow": {
    tab: "hoc-vien",
    ten: "Xét “hay vắng” trong bao nhiêu buổi gần nhất",
    giaiThich:
      "Đi cùng số ở trên. Ví dụ 3 buổi vắng trong 5 buổi gần nhất thì bị coi là hay vắng.",
    donVi: "buổi",
  },
  "student.birthdayAlertDaysBefore": {
    tab: "hoc-vien",
    ten: "Báo trước buổi tổ chức sinh nhật",
    giaiThich: "Để giáo viên và cơ sở kịp chuẩn bị quà, bánh.",
    donVi: "ngày",
  },
  "student.birthdayLookaheadDays": {
    tab: "hoc-vien",
    ten: "Quét trước danh sách sinh nhật sắp tới",
    giaiThich: "Khoảng thời gian hệ thống nhìn về phía trước để lên danh sách.",
    donVi: "ngày",
  },
  "student.birthdayLookbackDays": {
    tab: "hoc-vien",
    ten: "Buổi tổ chức được lùi sớm nhất trước ngày sinh nhật",
    giaiThich:
      "Sinh nhật ít khi rơi đúng buổi học, nên hệ thống chọn buổi gần nhất TRƯỚC ngày đó, " +
      "nhưng không sớm hơn số ngày này.",
    donVi: "ngày",
  },
  "risk.careTaskDueDays": {
    tab: "hoc-vien",
    ten: "Hạn xử lý một việc chăm sóc học viên",
    giaiThich: "Quá hạn thì việc đó chuyển sang màu quá hạn trên bảng việc.",
    donVi: "ngày",
  },
  "enrollment.suspendMaxMonths": {
    tab: "hoc-vien",
    ten: "Bảo lưu tối đa",
    giaiThich: "Xin bảo lưu dài hơn mức này sẽ bị từ chối khi nhập.",
    donVi: "tháng",
  },
  "makeup.crossCenterEnabled": {
    tab: "hoc-vien",
    ten: "Cho học bù ở cơ sở khác",
    giaiThich:
      "Tắt thì học viên chỉ được xếp bù trong chính cơ sở của mình. Bật giúp linh hoạt cho " +
      "phụ huynh nhưng giáo viên sẽ gặp học viên lạ trong lớp.",
  },

  // ── Lớp & giáo viên ────────────────────────────────────────────────────────────────────
  "class.minStudents.default": {
    tab: "lop-gv",
    ten: "Sĩ số tối thiểu khi mở lớp",
    giaiThich: "Giá trị gợi ý sẵn khi tạo lớp mới; từng lớp vẫn sửa riêng được.",
    donVi: "học viên",
  },
  "class.maxStudents.default": {
    tab: "lop-gv",
    ten: "Sĩ số tối đa khi mở lớp",
    giaiThich: "Giá trị gợi ý sẵn khi tạo lớp mới; từng lớp vẫn sửa riêng được.",
    donVi: "học viên",
  },
  "teacher.overloadHoursPerWeek": {
    tab: "lop-gv",
    ten: "Dạy quá bao nhiêu giờ một tuần thì báo quá tải",
    giaiThich: "Chỉ để cảnh báo khi phân công, không chặn.",
    donVi: "giờ/tuần",
  },
  "homework.showScoreToParent": {
    tab: "lop-gv",
    ten: "Cho phụ huynh xem điểm bài tập và bài kiểm tra",
    giaiThich:
      "Tắt thì phụ huynh vẫn thấy con đã nộp bài hay chưa, chỉ không thấy điểm số.",
  },
  "trial.locGvTheoCaLamViec": {
    tab: "lop-gv",
    ten: "Chỉ hiện giáo viên có ca làm trùm hết buổi học thử",
    giaiThich:
      "Bật thì khi xếp một buổi học thử, ô chọn giáo viên chỉ còn những người mà ca làm hôm " +
      "đó trùm hết khung giờ của buổi — ai vào muộn hơn hoặc về sớm hơn đều không hiện. Tắt " +
      "thì hiện mọi giáo viên như trước. Đổi xong có thể chờ tới 5 phút mới ăn ở mọi máy.",
    canThan: true,
  },
  "trial.gvMienLocTheoCa": {
    tab: "lop-gv",
    ten: "Giáo viên luôn hiện dù hôm đó không có ca",
    giaiThich:
      "Ngoại lệ cho mục ngay bên trên: những người này luôn chọn được, kể cả ngày họ không " +
      "đăng ký ca nào. Chọn bằng bảng tên ở cuối tab này. Đổi xong có thể chờ tới 5 phút mới " +
      "ăn ở mọi máy.",
  },
  "lms.mediaSignedUrlTtl": {
    tab: "lop-gv",
    ten: "Đường xem ảnh/video của lớp còn mở trong",
    giaiThich:
      "Hết hạn thì phụ huynh tải lại trang là xem tiếp được. Để dài là đường link bị chuyển " +
      "ra ngoài vẫn mở được lâu.",
    donVi: "giây",
  },

  // ── Chấm công & ca làm ─────────────────────────────────────────────────────────────────
  "shift.toleranceMinutes": {
    tab: "cham-cong",
    ten: "Chấm công lệch trong khoảng này vẫn tính đúng giờ",
    giaiThich:
      "Áp cho cả quét sớm lẫn quét muộn. Đây là dung sai kỹ thuật cho việc đồng hồ máy quét " +
      "và giờ ca lệch nhau chút ít, không phải mức cho phép đi muộn.",
    donVi: "phút",
  },
  "shift.lateGraceMinutes": {
    tab: "cham-cong",
    ten: "Muộn quá bao nhiêu phút thì gắn dấu đi muộn",
    giaiThich: "Chỉ là dấu hiệu để quản lý nhìn thấy, chưa trừ gì.",
    donVi: "phút",
  },
  "shift.latePenaltyGraceMinutes": {
    tab: "cham-cong",
    ten: "Muộn quá bao nhiêu phút thì tính là một lần trễ",
    giaiThich: "Đây mới là con số dùng để trừ điểm nội quy.",
    donVi: "phút",
    canThan: true,
  },
  "shift.penaltyLatePercent": {
    tab: "cham-cong",
    ten: "Mỗi lần trễ trừ",
    giaiThich: "Trừ vào phần điểm nội quy của tháng.",
    donVi: "% nội quy",
    canThan: true,
  },
  "shift.penaltyAbsentPercent": {
    tab: "cham-cong",
    ten: "Mỗi ngày nghỉ không phép trừ",
    giaiThich: "Chỉ tính cho ngày nghỉ mà quản lý đã xác nhận là không phép.",
    donVi: "% nội quy",
    canThan: true,
  },
  "shift.earlyArrivalMinutes": {
    tab: "cham-cong",
    ten: "Nhắc có mặt trước giờ vào ca",
    giaiThich: "Chỉ để nhắc trong tin nhắc lịch, không trừ gì.",
    donVi: "phút",
  },
  "shift.emergencyMonthlyLimit": {
    tab: "cham-cong",
    ten: "Số lần đăng ký ca khẩn mỗi tháng",
    giaiThich: "Hết lượt thì phải nhờ quản lý xếp tay.",
    donVi: "lần",
  },
  "shift.proposalWindow": {
    tab: "cham-cong",
    ten: "Khoảng ngày được đăng ký ca cho tháng sau",
    giaiThich:
      "Ví dụ từ ngày 25 đến ngày 28 hằng tháng. Ngoài khoảng này nhân viên không tự đăng ký " +
      "được nữa.",
  },
  "shift.geofenceRadiusMeters": {
    tab: "cham-cong",
    ten: "Phải đứng cách điểm quét tối đa",
    giaiThich: "Quét xa hơn khoảng này bị từ chối. Nới rộng là chấm công hộ nhau dễ hơn.",
    donVi: "mét",
    canThan: true,
  },
  "shift.managerEditWindowDays": {
    tab: "cham-cong",
    ten: "Quản lý được sửa bảng công trong vòng",
    giaiThich: "Quá hạn thì phải nhờ cấp cao hơn. Tính từ ngày công cần sửa.",
    donVi: "ngày",
  },
  "shift.weeklyOffDays": {
    tab: "cham-cong",
    ten: "Ngày nghỉ cố định hằng tuần",
    giaiThich:
      "Viết bằng số trong dấu ngoặc vuông: 0 là Chủ nhật, 1 là thứ Hai, … 6 là thứ Bảy. " +
      "Ví dụ [1] nghĩa là nghỉ thứ Hai.",
  },
  "shift.maxLogsPerDay": {
    tab: "cham-cong",
    ten: "Mỗi người quét tối đa",
    giaiThich: "Vượt thì vẫn ghi nhận nhưng được đánh dấu để quản lý kiểm lại.",
    donVi: "lượt/ngày",
  },
  "shift.pairingMaxGapMinutes": {
    tab: "cham-cong",
    ten: "Ghép lượt vào với lượt ra trong khoảng",
    giaiThich:
      "Hệ thống dùng con số này để đoán một lượt quét thuộc ca nào. Đặt quá rộng thì hai ca " +
      "sát nhau dễ bị ghép nhầm.",
    donVi: "phút quanh giờ ca",
  },
  "shift.duplicateTapMinutes": {
    tab: "cham-cong",
    ten: "Hai lượt quét cách nhau dưới mức này coi là bấm nhầm",
    giaiThich: "Lượt thứ hai không được tính, tránh một người quét hai lần thành vào rồi ra.",
    donVi: "phút",
  },
  "shift.briefNoteHourVN": {
    tab: "cham-cong",
    ten: "Giờ gửi tin nhắc lịch ngày mai",
    giaiThich: "Theo giờ Việt Nam, viết bằng số từ 0 đến 23. Ví dụ 19 là 7 giờ tối.",
    donVi: "giờ",
  },
  "shift.requestNoticeDays": {
    tab: "cham-cong",
    ten: "Báo nghỉ hoặc đổi ca trước ít nhất",
    giaiThich: "Nộp sát hơn vẫn nộp được nhưng đơn bị đánh dấu nộp muộn.",
    donVi: "ngày",
  },
  "shift.leaveAccrualPerMonth": {
    tab: "cham-cong",
    ten: "Mỗi tháng cộng thêm phép năm",
    giaiThich: "Áp cho nhân sự chính thức.",
    donVi: "ngày",
  },
  "shift.leaveDaysPerYear": {
    tab: "cham-cong",
    ten: "Phép năm tối đa",
    giaiThich: "Trần của cả năm, cộng dồn không vượt quá số này.",
    donVi: "ngày/năm",
  },

  // ── Khách hàng & tư vấn ────────────────────────────────────────────────────────────────
  "crm.dedupWindowDays": {
    tab: "khach-hang",
    ten: "Hai phiếu cùng số điện thoại trong bao lâu thì coi là một khách",
    giaiThich:
      "Ngăn một khách điền form nhiều lần biến thành nhiều đầu việc. Đặt quá ngắn thì tư vấn " +
      "nhận trùng; quá dài thì khách quay lại sau vài tháng bị gộp vào hồ sơ cũ.",
    donVi: "ngày",
  },
  "crm.commissionPolicies": {
    tab: "hoa-hong",
    ten: "Chính sách hoa hồng",
    giaiThich:
      "Toàn bộ khoản chi hoa hồng, khai theo bốn trục: ai nhận · khi nào · loại đơn nào · " +
      "tính thế nào. Bảng bên dưới là nơi sửa — dòng này không hiện thành ô nhập vì nó là " +
      "một danh sách, không phải một con số.",
    canThan: true,
  },
  "crm.commissionMaxTotalRate": {
    tab: "khach-hang",
    ten: "Trần tổng hoa hồng",
    giaiThich:
      "Viết dạng thập phân: 0.09 nghĩa là 9%. Đã gồm cả phần của giáo viên dạy buổi trải " +
      "nghiệm. Hạ trần KHÔNG xoá những dòng hoa hồng đã sinh trước đó.",
    // Không phải "%" — ô này nhận 0.09 chứ không nhận 9. Ghi đơn vị là "%" ở đây đúng là cách
    // mời người ta gõ 9 và nhân mười lần tiền hoa hồng lên.
    donVi: "phần đơn vị (0.09 = 9%)",
    canThan: true,
  },
  "crm.trialMaxSessions": {
    tab: "khach-hang",
    ten: "Mỗi khách được học thử tối đa",
    giaiThich: "Quá số buổi này thì ca trải nghiệm chuyển sang chờ quyết định.",
    donVi: "buổi",
  },
  "crm.sla.respondMinutes": {
    tab: "khach-hang",
    ten: "Chưa trả lời tin nhắn của khách quá",
    giaiThich: "Quá mốc này thì hiện cảnh báo chậm xử lý cho tư vấn và quản lý.",
    donVi: "phút",
  },
  "crm.sla.handoverMinutes": {
    tab: "khach-hang",
    ten: "Chưa bàn giao khách cho tư vấn quá",
    giaiThich: "Tính từ lúc khách được xác nhận là có nhu cầu thật.",
    donVi: "phút",
  },
  "crm.sla.assignMinutes": {
    tab: "khach-hang",
    ten: "Chưa phân công tư vấn viên quá",
    giaiThich: "Tính từ lúc phiếu khách hàng về hệ thống.",
    donVi: "phút",
  },
  "crm.sla.contactMinutes": {
    tab: "khach-hang",
    ten: "Phân công rồi mà chưa liên hệ khách quá",
    giaiThich: "Đây là mốc hay bị vi phạm nhất; hạ xuống là số cảnh báo tăng mạnh.",
    donVi: "phút",
  },
  "crm.sla.silentMinutes": {
    tab: "khach-hang",
    ten: "Khách im lặng chưa ai xử lý quá",
    giaiThich: "Dành cho khách đã liên hệ được nhưng sau đó không ai động vào nữa.",
    donVi: "phút",
  },
  "sla.leadIdleHours": {
    tab: "khach-hang",
    ten: "Khách mới hoặc vừa phân công mà không có hoạt động quá",
    giaiThich: "Quá mốc này thì hiện ở danh sách khách bị bỏ quên.",
    donVi: "giờ",
  },
  "intake.saleFormRateLimitMax": {
    tab: "khach-hang",
    ten: "Một máy nhập tối đa",
    giaiThich:
      "Áp cho màn Nhập khách hàng. Đặt quá thấp thì nhân viên nhập liệu nhanh sẽ bị chặn oan.",
    donVi: "phiếu/phút",
  },
  "intake.alertFailedPerHour": {
    tab: "khach-hang",
    ten: "Một nguồn khách lỗi bao nhiêu phiếu trong 1 giờ thì báo động",
    giaiThich: "Nguồn khách hỏng nghĩa là tiền quảng cáo đang chảy mà phiếu không về.",
    donVi: "phiếu",
  },
  "intake.alertSilentHours": {
    tab: "khach-hang",
    ten: "Nguồn khách vốn chạy đều mà im quá",
    giaiThich: "Im lặng bất thường thường là dấu hiệu kết nối với nguồn đã đứt.",
    donVi: "giờ",
  },
  "public.leadRateLimitMax": {
    tab: "khach-hang",
    ten: "Form đăng ký trên website nhận tối đa",
    giaiThich: "Tính theo từng máy khách, chặn người gửi phá.",
    donVi: "lượt",
  },
  "public.leadRateLimitWindowMs": {
    tab: "khach-hang",
    ten: "…trong khoảng thời gian",
    giaiThich: "Đi cùng con số ngay trên. Viết bằng phần nghìn giây: 60000 là 1 phút.",
    donVi: "phần nghìn giây",
  },

  // ── Tiền & thanh toán ──────────────────────────────────────────────────────────────────
  "orders.maxDiscountPercent": {
    tab: "tien",
    ten: "Giảm giá theo % tối đa cho một ưu đãi",
    giaiThich:
      "Áp cho TỪNG ưu đãi trên một dòng đơn, tính trên tạm tính của chính dòng đó. " +
      "Một dòng có thể chồng nhiều ưu đãi và các mức % CỘNG DỒN, nên hạ số này không " +
      "chặn được tổng mức bớt — nó chỉ chặn một ưu đãi đơn lẻ quá lớn. Sale gõ vượt " +
      "trần thì đơn không lưu được, kèm thông báo chỉ rõ dòng nào khoản nào.",
    donVi: "%",
  },
  "finance.debtReminderDaysBefore": {
    tab: "tien",
    ten: "Nhắc đóng đợt 2 trước hạn",
    giaiThich: "Hệ thống tự nhắc kế toán và tư vấn trước ngày đến hạn từng này ngày.",
    donVi: "ngày",
  },
  "payment.roundingToleranceVnd": {
    tab: "tien",
    ten: "Lệch tối đa bao nhiêu vẫn coi là khớp tiền",
    giaiThich:
      "Dùng khi đối chiếu tiền chuyển khoản về với số phải thu. Nới rộng là những khoản " +
      "thiếu nhỏ sẽ được tự đánh dấu đã thu đủ.",
    donVi: "đồng",
    canThan: true,
  },
  "payment.qrTtlMinutes": {
    tab: "tien",
    ten: "Mã QR chuyển khoản còn dùng được trong",
    giaiThich: "Hết hạn thì phụ huynh mở lại trang để lấy mã mới.",
    donVi: "phút",
  },

  // ── Nhắc tự động ───────────────────────────────────────────────────────────────────────
  "cron.renewalReminderMinDays": {
    tab: "nhac-tu-dong",
    ten: "Nhắc tái tục — bắt đầu từ",
    giaiThich: "Tính ngược từ ngày học viên hết khoá.",
    donVi: "ngày trước khi hết khoá",
  },
  "cron.renewalReminderMaxDays": {
    tab: "nhac-tu-dong",
    ten: "Nhắc tái tục — sớm nhất là",
    giaiThich: "Phải lớn hơn số ở trên, nếu không sẽ không nhắc được ai.",
    donVi: "ngày trước khi hết khoá",
  },
  "cron.renewalReminderIdempotencyDays": {
    tab: "nhac-tu-dong",
    ten: "Không nhắc lại cùng một người trong",
    giaiThich: "Tránh một phụ huynh nhận nhắc tái tục nhiều lần trong cùng đợt.",
    donVi: "ngày",
  },
  "cron.classReminderMinHours": {
    tab: "nhac-tu-dong",
    ten: "Nhắc buổi học — bắt đầu từ",
    giaiThich: "Tính ngược từ giờ vào học.",
    donVi: "giờ trước buổi",
  },
  "cron.classReminderMaxHours": {
    tab: "nhac-tu-dong",
    ten: "Nhắc buổi học — sớm nhất là",
    giaiThich:
      "Phải lớn hơn số ở trên, nếu không sẽ không còn khoảng nào để nhắc và phụ huynh không " +
      "nhận được tin nào cả.",
    donVi: "giờ trước buổi",
  },
  "dashboard.pendingItemLimit": {
    tab: "nhac-tu-dong",
    ten: "Mỗi nhóm việc cần xử lý hiện tối đa",
    giaiThich: "Chỉ đổi cách hiển thị trên trang chủ quản trị, không đổi số việc thật.",
    donVi: "dòng",
  },
  "dashboard.pendingStaleDays": {
    tab: "nhac-tu-dong",
    ten: "Việc tồn quá bao nhiêu ngày thì coi là quá hạn",
    giaiThich: "Việc quá hạn được đẩy lên đầu và đổi màu.",
    donVi: "ngày",
  },

  // ── Thông tin công ty ──────────────────────────────────────────────────────────────────
  "contact.hotlines": {
    tab: "cong-ty",
    ten: "Số điện thoại hiện trên website",
    giaiThich:
      "Khai theo từng cơ sở. Sai một chữ số là khách gọi vào số lạ — kiểm lại trước khi lưu.",
    canThan: true,
  },
  "contact.emails": {
    tab: "cong-ty",
    ten: "Email hiện trên website",
    giaiThich: "Một địa chỉ cho khách liên hệ, một địa chỉ cho ứng viên tuyển dụng.",
  },
  "content.internalAwards": {
    tab: "cong-ty",
    ten: "Danh sách giải thưởng hiện trên trang khoá học",
    giaiThich: "Đổi ở đây là trang công khai đổi theo ngay, không cần bên kỹ thuật.",
  },
  "content.gifts": {
    tab: "cong-ty",
    ten: "Bộ quà tặng hiện khi đăng ký",
    giaiThich: "Tổng giá trị quà in trên trang được tính từ danh sách này.",
  },
  "content.commitments": {
    tab: "cong-ty",
    ten: "Cam kết với phụ huynh hiện trên website",
    giaiThich: "Đây là nội dung mang tính cam kết — đổi nên có người duyệt.",
    canThan: true,
  },

  // ── Nâng cao ───────────────────────────────────────────────────────────────────────────
  "storage.presignTtlSec": {
    tab: "nang-cao",
    ten: "Thời gian cho phép tải tệp lên",
    giaiThich:
      "Tính từ lúc bấm chọn tệp. Mạng chậm mà đặt ngắn quá thì tải ảnh lớn hay bị hỏng giữa " +
      "chừng.",
    donVi: "giây",
  },
  "billing.flexV1Enabled": {
    tab: "tien",
    ten: "Thu học phí linh hoạt (công nợ theo từng con)",
    giaiThich:
      "Bật thì mỗi con trên một đơn có công nợ riêng, và cả nhà quét MỘT mã QR in sẵn số tiền. " +
      "Phụ huynh chuyển ĐÚNG số thì hệ thống tự chia cho từng con; chuyển thừa hoặc thiếu thì " +
      "tiền không được ghi nhận và kế toán hoàn lại. Có thể bật riêng cho từng cơ sở.",
    canThan: true,
  },
  "orgScope.cutoverEnabled": {
    tab: "nang-cao",
    ten: "Chuyển cách phân chia dữ liệu sang sơ đồ tổ chức mới",
    giaiThich:
      "Ảnh hưởng tới việc AI NHÌN THẤY DỮ LIỆU CỦA CƠ SỞ NÀO. Chỉ bật khi bên kỹ thuật xác " +
      "nhận đã đối soát xong, và bật ngoài giờ làm việc.",
    canThan: true,
  },
};

export const NHAN_VAN_HANH = N;

/** Nhãn của một key. Ném nếu thiếu — thiếu nghĩa là tham số đó biến mất khỏi giao diện. */
export function nhanCuaKey(key: SettingKey): NhanVanHanh {
  const n = N[key];
  if (!n) throw new Error(`Thiếu nhãn vận hành cho setting "${key}"`);
  return n;
}

/** Danh sách key thuộc một tab, giữ nguyên thứ tự khai trong `SETTINGS`. */
export function keyCuaTab(tab: TabId): SettingKey[] {
  return SETTING_KEYS.filter((k) => N[k]?.tab === tab);
}
