# Biên bản chốt — 14 câu chặn của module Site Sale (đợt 2)

> **Ngày chốt:** 21/08/2026 · **Người chốt:** chủ dự án · **Người ghi:** phân tích nghiệp vụ
> **Nguồn câu hỏi:** `satarobo-sale/plan/19-CAU-HOI-CAN-CHOT.md` (phiếu 57 câu)
> **Tiếp nối:** `bien-ban-chot-4-cong-2108.md` (4 cổng chặn cứng, cùng ngày)

---

## 1. Quyết định

| Mã | Câu hỏi | **QUYẾT ĐỊNH 21/08** | Ghi chú thực thi |
|:--:|---|---|---|
| **Q5** | Cho chạy 5 truy vấn chẩn đoán chia lead trên prod? | ✅ **Gửi truy vấn, chủ dự án tự chạy** | `satarobo-sale/plan/24-TRUY-VAN-CHAN-DOAN-CHIA-LEAD.md` |
| **Q6** | Sprint 0 chọn phương án nào? | ✅ **Phương án B** — suy ra từ Q7 | Viết vòng luân phiên có con trỏ bền vững |
| **Q7** | "Công bằng" = đều số lượt hay đều khối lượng thật? | ✅ **ĐỀU SỐ LƯỢT.** Nguyên văn: *"đều theo khối lượng lead, tuyệt đối không được sai, làm đúng như tôi mô tả qua ngày không reset mà vẫn luân phiên, không phân biệt người nhiều việc người ít việc, cứ có lead đổ vào là chia đều cho tất cả các sale"* | ⚠️ **Đảo khuyến nghị của BA** (BA đề xuất cân theo tải thật). Hệ quả đã nói rõ và chủ dự án giữ nguyên: người đang ôm 40 lead **vẫn nhận lượt của mình**. Tiêu chí nghiệm thu quay về **T13**: 1.000 lead / N sale ⇒ chênh ≤ 1 |
| **Q8** | Giữ hay gỡ `Lead.isSharedWithTeam`? | ✅ **KHÔNG GIỮ** — lead độc quyền tuyệt đối | ⚠️ Đảo quyết định BGĐ câu 10 ký 10/07, **đang chạy prod**. Gỡ theo 2 pha: ngừng tôn trọng cờ ở tầng truy vấn + ẩn nút, **GIỮ cột và dữ liệu**, không drop |
| **Q9** | QL cơ sở còn thấy SĐT? Đọc chat mức nào? | ✅ **KHÔNG thấy SĐT · ĐỌC HẾT chat** | ⚠️ Đảo 2 quyết định (10/07 + 21/07). Phải **gỡ `leads:view-pii` khỏi RoleDef**, **CẤM dùng grant DENY** (v2 bỏ qua im lặng). Bắt buộc che SĐT trong **nội dung tin nhắn** (`redactContactLike`), không chỉ ở cột dữ liệu. ❓ **Còn treo: MARKETING có bị che luôn không** — câu hỏi chỉ nêu QL cơ sở |
| **Q10** | Quy ước bảng mới (`orgUnitId` + bộ tên model) | ✅ **Duyệt** | Bảng mới dùng `orgUnitId`, không thêm `centerId`; không dùng lại tên `Conversation`/`Message`/`Evaluation`/`Transcript` |
| **Q11** | Sale Hub là route group riêng hay tab trong site sẵn có? | ✅ **SITE RIÊNG `sale.satarobo.vn`**; biểu mẫu nhập khách hiện tại chuyển thành **`satarobo.vn/nhap-khach-hang`** | ⚠️ Khác chỗ đã code ở PR #126 (đang đặt tại `admin.satarobo.vn/admin/nhap-khach-hang`) ⇒ phải dời host. Khớp lại với QĐ-1 bản 16/07 |
| **Q12** | ZCRM tham chiếu hay fork? | ✅ **THAM CHIẾU, không fork** | Không phát sinh nghĩa vụ mở mã nguồn theo AGPL-3.0 §13. Được đọc để học cách làm, **không chép mã** |
| **Q13** | Khung pháp lý + trẻ ≥7 tuổi tự đồng ý? | ✅ **Duyệt** đường xử lý đã đề xuất | Hỏi luật sư xác nhận văn bản đang áp dụng; thiết kế sẵn bước xác nhận cho trẻ ≥7 tuổi, gỡ nếu luật sư nói không cần |
| **Q14** | Ai là PM/BA có tên? | ✅ **Kiệt** | |
| **Q15** | Đội dev còn mấy người? | ✅ **MỘT người — chính chủ dự án** | ⚠️ **Ràng buộc cứng nhất của toàn kế hoạch.** Mọi ước lượng trong bộ tài liệu đang dựa trên ảnh chụp "3 người" ngày 12/07 ⇒ **phải cắt lại phạm vi** |
| **Q16** | Hộp thư khách: mở rộng `MessengerConversation` hay nhồi vào `Conversation`? | ⏳ **Chờ chốt** — chủ dự án yêu cầu nêu rõ phương án | Xem mục 2 |
| **Q17** | Nơi đặt adapter Zalo/OMICall/LLM + chống cháy tiền | ⏳ **Chờ chốt** — như trên | Xem mục 2 |
| **Q18** | Tuyên bố ranh giới chat nội bộ ↔ inbox khách hàng ở đâu | ⏳ **Chờ chốt** — như trên | Xem mục 2 |
| **Q19+Q20** | Gộp Trial thế nào? | ✅ **Gộp tính năng theo site sale của TeachUI** (github.com/nhhatvy/TeachUI), *"làm y hệt tất cả các component có trong trang trial đó"* | Bản cục bộ `D:\Web SataRobo\TeachUI` đã xác minh cùng remote. Đang kiểm kê component |

---

## 2. Ba câu còn chờ — tóm tắt phương án (chi tiết đã trình chủ dự án)

**Q16 — hộp thư khách hàng.** Repo có **hai** hệ hội thoại: chat nội bộ (`Conversation`/`Message`, chạy prod từ 10/08, có RLS + realtime + đồng bộ thành viên ở 54 lời gọi) và hội thoại khách từ Facebook (`MessengerConversation`, một chiều). Đề xuất **mở rộng `MessengerConversation`** — nó đã có khoá chống trùng theo tin, hướng tin, gắn lead, và đã nằm trong danh sách cách ly cơ sở. Nhồi khách vào `Conversation` vướng 3 rào ở tầng khoá và đụng bảng đang phục vụ giáo viên/phụ huynh thật. Hợp nhất **ở tầng giao diện**, không ở tầng dữ liệu.

**Q17 — nơi đặt adapter.** Doc 15 đòi đi qua `modules/integration`, nhưng thư mục đó **chưa tồn tại**. Đề xuất đặt ở `lib/integrations/<nhà-cung-cấp>/` theo đúng khuôn đang chạy (`lib/zalo/`, `lib/storage/`), ghi rõ đây là **lệch có chủ đích** so với Doc 15, xem lại khi `modules/` ra đời. **Cấm viết bộ quản lý token Zalo thứ hai** — dùng lại `lib/zalo/token.ts`. Chống cháy tiền: giành chỗ trước khi gọi (khuôn `ChatZnsNotification`), trần chi phí theo kỳ, `maxAttempts: 1`, cờ mặc định TẮT.

**Q18 — ranh giới chat.** `docs/chat-realtime/permissions.md` là nguồn sự thật quyền chat và ghi Sale ❌ ở **mọi** ô chat nội bộ. Đề xuất thêm một mục vào chính file đó, tuyên bố: chat nội bộ (nhân sự ↔ phụ huynh, quanh lớp học) và hộp thư khách hàng (sale ↔ khách tiềm năng) là **hai hệ khác nhau**, Sale **không** có cửa vào chat nội bộ, hộp thư khách có bộ quyền riêng. Viết **trước** dòng code đầu tiên của hộp thư.

---

## 3. Việc phát sinh

| # | Việc | Từ câu | Trạng thái |
|:--:|---|:--:|---|
| 1 | Gửi 5 truy vấn chẩn đoán | Q5 | ✅ xong |
| 2 | Viết engine luân phiên **đều số lượt**, con trỏ bền vững, không reset | Q6+Q7 | ⬜ |
| 3 | Bộ test T1–T13 cho engine, **T13 là cổng nghiệm thu** | Q7 | ⬜ |
| 4 | Gỡ `isSharedWithTeam` theo 2 pha (giữ cột, giữ dữ liệu) | Q8 | ⬜ |
| 5 | Gỡ `leads:view-pii` khỏi QL cơ sở + che SĐT trong nội dung tin nhắn | Q9 | ⬜ |
| 6 | ❓ Hỏi lại: MARKETING có bị che SĐT không | Q9 | ⬜ chủ dự án |
| 7 | Dời trang nhập khách từ `admin.` sang `satarobo.vn/nhap-khach-hang` | Q11 | ⬜ |
| 8 | Dựng site riêng `sale.satarobo.vn` (route group + cờ + định tuyến) | Q11 | ⬜ |
| 9 | Nhân bản trang trial theo TeachUI | Q19+Q20 | ⬜ đang kiểm kê |
| 10 | **Cắt lại toàn bộ phạm vi theo năng lực 1 người** | Q15 | ⬜ **ưu tiên cao nhất** |
| 11 | Hỏi luật sư khung pháp lý | Q13 | ⬜ |

---

## 4. Điều biên bản này ghi lại để sau không tranh cãi

**Chủ dự án đã đảo hai khuyến nghị của phân tích, có chủ đích, sau khi nghe rõ đánh đổi:**

1. **Q7** — BA đề xuất chia theo **khối lượng việc thật**; chủ dự án chọn **đều số lượt**, nói rõ *"không phân biệt người nhiều việc người ít việc"*. Hệ quả được chấp nhận: người đang ôm nhiều lead vẫn nhận lượt.
2. **Q8/Q9** — cả hai đảo quyết định đã ký trước đó của chính chủ dự án (10/07, 21/07) và **gỡ tính năng đang chạy trên prod**. Đây là quyền của người ký; phân tích chỉ ghi lại để khi có người hỏi *"sao mất tính năng này"* thì có câu trả lời bằng văn bản.

**Ngày chốt:** 21/08/2026 · **Người chốt:** ☐ ______________________
