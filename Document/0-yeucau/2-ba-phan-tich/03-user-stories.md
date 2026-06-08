# User Stories — các epic ưu tiên (Must + Should)

> 🔄 **ĐỒNG BỘ DOC 15 (2026-06-06):** số liệu/tên đã thay — SLA-0 phản hồi 15' → **5'** · FINALIZED → **CONFIRMED** (kỳ phân bổ, REOPEN bởi SUPER_ADMIN/HO_ACCOUNTANT) · "Sale Admin/QC Marketing" = role **HO_SALE/HO_MARKETING** · roadmap epic theo Doc 15 §9 (A0 trước R1; Zalo/SataCoin quà lùi backlog). AC vẫn dùng được làm cơ sở test — khi xung đột, Doc 15 thắng.

> Format: `US-<epic>-<n>` · Là <vai trò>, tôi muốn <việc> để <giá trị> · AC = Acceptance Criteria (Given/When/Then rút gọn).
> Epic SR = SR217 · Epic M/S = theo gap analysis QL HV & LMS.

---

## EPIC SR-A — Nhập liệu QC & phễu LEADS

**US-SRA-0** · Là **hệ thống**, tôi muốn nhận hội thoại vào page realtime qua Messenger webhook để đếm LEADS_1 tự động và đo thời gian phản hồi.
- AC1: Tin nhắn mới vào page → tạo `PageInboundEvent` (idempotent theo source+externalId); page trả lời lần đầu → ghi `respondedAt`.
- AC2: Chưa phản hồi > 15' (trong giờ trực) → alert Sale Admin (SLA-0).
- AC3: Admin xin được SĐT → nối event với Lead (L2) để đo tỉ lệ L1→L2.

**US-SRA-1** · Là **QC Marketing**, tôi muốn nhập chi phí QC (+ số L1 kênh chưa có webhook) theo ngày/kênh trước 21:00 để hệ thống tính CPL chính xác.
- AC1: Form nhập theo ngày × kênh; unique (date, channel) — nhập trùng → cập nhật có cảnh báo.
- AC2: Import được file Excel theo format file QC hiện hành; lỗi từng dòng hiển thị rõ.
- AC3: Sau khi kỳ tháng FINALIZED → số liệu khóa, sửa cần SUPER_ADMIN + audit log.
- AC4: Dashboard hiển thị đối soát L1 webhook vs L1 file QC theo kênh.

**US-SRA-2** · Là **Sale Admin**, tôi muốn tạo lead đủ điều kiện L2 (SĐT + tóm tắt) và bàn giao cho trung tâm trong ngày để không mất lead.
- AC1: Lead bắt buộc phone + summary mới đánh dấu `qualifiedAt`.
- AC2: Chọn TT → ghi `handedAt`; QL TT bấm "Tiếp nhận" → `receivedConfirmedAt`.
- AC3: Lead của tôi đã bàn giao hiển thị trạng thái + thời gian chờ xác nhận.

**US-SRA-3** · Là **QL Trung tâm**, tôi muốn nhận alert khi lead chưa được xử lý đúng SLA để can thiệp kịp.
- AC1: L2 chưa bàn giao > 4h → alert (chuông + email) cho Admin + QL TT.
- AC2: Đã nhận chưa phân công > 30' → alert QL TT.
- AC3: Sale chưa liên hệ > 3h sau phân công → alert QL TT.
- AC4: Mỗi vi phạm chỉ alert 1 lần (dedupeKey), kèm link mở lead.

## EPIC SR-B — Commission Engine

**US-SRB-1** · Là **hệ thống**, tôi tự tính hoa hồng 4 tầng ngày 01 hằng tháng trên mọi LEADS_3 tháng trước để kế toán không phải tính tay.
- AC1: Tạo `CommissionPeriod DRAFT` với items đủ 4 tầng theo `CommissionRateConfig` (mặc định 1/1/4/2%).
- AC2: Mỗi item kèm `detail` liệt kê orderId + số tiền cấu thành.
- AC3: Tính lại được khi còn DRAFT; mọi recalc ghi audit.
- AC4: Tổng rate config > 8% → từ chối lưu config.

**US-SRB-2** · Là **Kế toán/TGĐ**, tôi muốn duyệt bảng hoa hồng và xuất Excel bảng lương để trả cùng kỳ lương.
- AC1: DRAFT → APPROVED khóa số liệu (chỉ SUPER_ADMIN mở lại, có audit + lý do).
- AC2: Export Excel: từng nhân sự — tầng — doanh số cơ sở — % — tiền.
- AC3: Order REFUNDED sau khi kỳ đã APPROVED → kỳ sau tự sinh dòng âm (clawback) [chờ chốt B4].

**US-SRB-3** · Là **Sale/TVV**, tôi muốn xem hoa hồng tạm tính của mình trong tháng để biết thu nhập dự kiến.
- AC1: `/admin/commission/cua-toi`: DS L3 đã chốt + tạm tính 4%; cập nhật theo ngày.
- AC2: Chỉ thấy của mình (`commission:view-own`); ACCOUNTANT thấy tất cả.

## EPIC SR-C — Cost Allocation & Dashboard

**US-SRC-1** · Là **Kế toán Hội sở**, tôi muốn hệ thống tự tính CPL/CPA/CP_TT và chốt trước ngày 05 để phân bổ chi phí đúng văn bản.
- AC1: Ngày 01 tự tạo kỳ DRAFT: CPL = ΣCP QC ÷ ΣL2; CPA = ΣCP QC ÷ ΣL3; CP_TT = CPL × L2 của TT.
- AC2: Nhập đè tổng chi phí quyết toán được khi DRAFT.
- AC3: FINALIZED → khóa + gửi bảng phân bổ cho các TT; ngày 05 chưa chốt → alert.

**US-SRC-2** · Là **TGĐ/QL TT**, tôi muốn dashboard funnel realtime L1→L2→L3 với CPL/CPA, conversion, DS theo Sale, lọc theo TT/kỳ — kèm dashboard thu lead Messenger (hội thoại/ngày, thời gian phản hồi TB, tỉ lệ L1→L2).
- AC1: Số liệu khớp công thức SR.QD.217; L1 từ PageInboundEvent (webhook) + AdsDailyStat (kênh nhập tay), L2/L3 từ timestamp lead.
- AC2: QL TT chỉ thấy TT mình; TGĐ thấy tất cả + so sánh TT.
- AC3: Export Excel theo 3 format hiện hành [chờ file mẫu B7].

**US-SRC-3** · Là **QL Trung tâm**, tôi muốn nộp báo cáo tuần/tháng trên hệ thống đúng hạn để khỏi làm file rời.
- AC1: Nút "Nộp báo cáo" snapshot số liệu kỳ + ghi chú; hạn T2 17h / ngày 01 17h.
- AC2: Trễ hạn → alert tôi + TGĐ; TGĐ xem danh sách trạng thái nộp các TT.

## EPIC M1 — Cảnh báo trùng lịch & sức chứa

**US-M1-1** · Là **Giáo vụ/QL TT**, khi tạo/sửa lớp hoặc dời buổi, tôi muốn được cảnh báo nếu trùng phòng/GV để tránh xếp lịch lỗi.
- AC1: Trùng phòng (cùng room, khung giờ giao nhau, ngày giao nhau) → dialog liệt kê lớp/buổi xung đột, chọn "vẫn lưu" (ghi log) hoặc hủy.
- AC2: Trùng GV → cảnh báo tương tự.
- AC3: Ghi danh khi lớp đã đủ `maxStudents` → **chặn**, gợi ý lớp cùng khóa còn chỗ.

## EPIC M2 — TKB Portal

**US-M2-1** · Là **phụ huynh**, tôi muốn xem thời khóa biểu của con (tuần/tháng) để chủ động đưa đón.
- AC1: Hiện đúng buổi theo enrollment đang học của con đang chọn; buổi dời/nghỉ lễ/học bù có nhãn riêng.
- AC2: Mobile 375px dùng tốt; mặc định tuần hiện tại.

## EPIC M3 — Consent dữ liệu

**US-M3-1** · Là **phụ huynh**, tôi muốn cấp/thu hồi quyền dùng ảnh con để kiểm soát quyền riêng tư.
- AC1: Portal hiển thị trạng thái consent + nút cấp/thu hồi (ghi thời điểm, người thao tác).
- AC2: Thu hồi → ảnh có tag con tôi ngừng hiển thị trên portal ngay (ảnh đã đăng ẩn tag).
- AC3: Admin thấy danh sách HS thiếu consent khi tag ảnh (không tag được HS đã từ chối).

## EPIC S2 — SataCoin Portal & đổi quà

**US-S2-1** · Là **học viên/phụ huynh**, tôi muốn xem số dư SataCoin và đổi quà để có động lực học.
- AC1: Số dư = SUM ledger, lịch sử giao dịch phân trang.
- AC2: Đổi quà: chọn quà còn stock + đủ coin → tạo redemption PENDING, trừ coin giữ chỗ.
- AC3: Manager xác nhận trao → DONE; hủy → hoàn coin (REVERSAL); không bao giờ âm số dư.

**US-S2-2** · Là **QL Trung tâm**, tôi muốn quản lý danh mục quà (tên, giá coin, tồn) và duyệt yêu cầu đổi.
- AC1: CRUD RewardItem theo quyền; stock trừ khi DONE.
- AC2: Danh sách redemption PENDING theo TT mình.

## EPIC S1 — Zalo OA live

**US-S1-1** · Là **phụ huynh**, tôi muốn nhận thông báo vắng học/nhắc phí qua Zalo để không bỏ sót.
- AC1: `ZALO_LIVE=true` + template ZNS được duyệt → gửi thật; lỗi/quota → fallback email, log `ZaloMessageLog`.
- AC2: Admin xem log gửi (SENT/FAILED/SKIPPED) + retry tay.

## EPIC S3 — PH cập nhật hồ sơ con

**US-S3-1** · Là **phụ huynh**, tôi muốn tự sửa thông tin cơ bản của con (địa chỉ, trường, dị ứng, liên hệ khẩn) để hồ sơ luôn đúng.
- AC1: Sửa field whitelist → lưu ngay + StudentAuditLog actor parent.
- AC2: Field nhạy cảm (họ tên, ngày sinh) → tạo ParentRequest cho staff duyệt, không sửa thẳng.
