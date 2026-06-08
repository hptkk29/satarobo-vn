# Phiếu tiếp nhận yêu cầu #02 — Quy trình Phối hợp Tuyển sinh SR.QD.217

> 🔄 **ĐỒNG BỘ DOC 15 (2026-06-06):** SLA phản hồi page chốt cuối = **≤5 phút** (Doc 15 §5.4 — bảng dưới ghi 15' là bản nháp trước); thực thi trên nền OrgUnit/RBAC động (HO_SALE thay Sale Admin role). Phiếu giữ nguyên làm hồ sơ tiếp nhận — spec cuối: Doc 15.

| | |
|---|---|
| **Nguồn** | `0-tai-lieu-goc/TomTat_QuyTrinh_TuyenSinh_SR217.docx` |
| **Văn bản gốc** | **SR.QD.217** — "Quy trình Phối hợp Tuyển sinh và Phân bổ Chi phí Quảng cáo", **ban hành 01/06/2026** |
| **Ngày tiếp nhận** | 2026-06-05 |
| **Tính chất** | ⚠️ **Quy định nội bộ ĐÃ BAN HÀNH, có deadline vận hành** (báo cáo T2 ≤17h, phân bổ CP trước ngày 05 hàng tháng) → ưu tiên cao hơn Phiếu #01 |
| **Trạng thái** | 🟢 Yêu cầu rõ ràng (có data fields + API gợi ý) — đủ điều kiện chuyển BA ngay |

---

## 1. Tóm tắt yêu cầu

### 1.1 Phễu LEADS 3 tầng
- **LEADS_1**: tin nhắn/tương tác vào page (từ QC ads). Lấy từ API Messenger và webhook
- **LEADS_2**: có SĐT + tóm tắt trao đổi → đủ điều kiện bàn giao Trung tâm.
- **LEADS_3**: đã đóng học phí = doanh số thực tế = **cơ sở tính hoa hồng**.

### 1.2 Quy trình 8 bước với SLA
| # | Bộ phận | SLA |
|---|---|---|
| 1 | QC Marketing chạy ads, nhập file QC | trước 21:00 hằng ngày |
| 2 | Sale Admin trực page, phản hồi | **≤ 15 phút**; bàn giao trong ngày |
| 3 | Bàn giao LEADS_2 cho TT qua admin site| trong ngày, không qua đêm (**alert nếu > 4h**) |
| 4 | QL TT phân công Sale | **≤ 30 phút** sau khi nhận |
| 5 | Sale liên hệ KH | **≤ 3h** (alert QL nếu trễ) |
| 6 | Đóng tiền → LEADS_3, nhập doanh số | trong ngày |
| 7 | QL TT báo cáo tuần/tháng | T2 ≤ 17h / ngày 01 ≤ 17h |
| 8 | Kế toán phân bổ CP QC | trước ngày 05 tháng sau |

### 1.3 Công thức tài chính
- `CPL = Tổng CP QC tháng ÷ Tổng LEADS_2 toàn hệ thống`
- `CP_TT = CPL × số LEADS_2 bàn giao cho TT`
- `CPA = Tổng CP QC tháng ÷ Tổng LEADS_3 toàn hệ thống`

### 1.4 Hoa hồng 4 tầng (auto trên LEADS_3, tổng tối đa 8%, trước thuế TNCN, trả cùng kỳ lương)
| Bộ phận | % | Cơ sở |
|---|---|---|
| QC Marketing | 1% | DS LEADS_3 nguồn MKT toàn TT |
| Sale Admin | 1% | DS LEADS_3 từ leads Admin bàn giao |
| Sale/TVV | 4% | DS LEADS_3 trực tiếp chốt |
| QL Trung tâm | 2% | Tổng DS LEADS_3 khai thác mới của TT |

### 1.5 7 module CRM yêu cầu
LEADS Management · Handover · Sales Pipeline · **Commission Engine** · Dashboard/Report (L1/L2/L3, CPL, CPA, CR realtime) · **Cost Allocation** · Notification Engine (SLA alerts).

### 1.6 Ghi chú kỹ thuật từ khách
Realtime timestamps · multi-center (center_id xuyên suốt, hạch toán riêng — **nhượng quyền N trung tâm**) · source tracking per LEADS_3 · commission chạy auto cuối tháng + audit log chống tranh chấp · export Excel tương thích 3 file hiện hành (QC/Admin/TT).

## 2. Đánh giá nhanh của PM so với hiện trạng

| Yêu cầu | Trạng thái | Đối chiếu |
|---|---|---|
| Phễu lead + pipeline trạng thái | 🟡 | `LeadStatus` 13 trạng thái đã chạy — cần **map L1/L2/L3** vào pipeline hiện có (không đập đi xây lại) |
| LEADS_1 (tin nhắn page, chưa có SĐT) | 🔴 | Hệ thống hiện chỉ nhận lead **có SĐT**; L1 là số liệu tổng hợp từ file QC → cần bảng nhập liệu QC hằng ngày (`leads_1_count, channel, cost, date`) |
| LEADS_2 + bàn giao TT | ✅/🟡 | Lead + `assignedToId` + `LeadTransfer` + handover đã có; cần thêm **xác nhận tiếp nhận + đếm giờ SLA** |
| Phân công Sale ≤30', liên hệ ≤3h | 🟡 | `LeadTask` + `LeadActivity` có; **chưa có engine SLA alert** |
| LEADS_3 = đóng học phí | ✅ | `LeadStatus.ENROLLED` + `convertedAt` + Order CONFIRMED — cần chuẩn hóa định nghĩa "đóng tiền" = Order nào |
| Source tracking | 🟡 | Lead có `source/utm*`; cần enum chuẩn `marketing_admin / sale_self / referral...` để tính đúng tầng hoa hồng |
| **Commission Engine 4 tầng** | 🔴 | **Hoàn toàn mới** — không có model/logic nào |
| **Cost Allocation (CPL/CPA)** | 🔴 | **Hoàn toàn mới** — cần bảng chi phí QC tháng + job phân bổ |
| Dashboard funnel realtime | 🟡 | Dashboard + FunnelChart có; thiếu L1, CPL/CPA, DS theo Sale |
| Báo cáo tuần/tháng + alert đến hạn | 🔴 | Chưa có lịch báo cáo + nhắc |
| Export Excel 3 file tương thích | 🔴 | Có xlsx infra; cần format theo file hiện hành (xin file mẫu) |
| Multi-center hạch toán riêng | ✅/🟡 | `centerId` xuyên suốt; "nhượng quyền/hạch toán riêng" cần xác nhận phạm vi (xem câu hỏi) |
| Hoa hồng audit log | ✅ pattern | Tái dùng pattern `*AuditLog` sẵn có |

**Kết luận PM:** ~50% tái dùng được hạ tầng CRM hiện có. **2 module mới hoàn toàn: Commission Engine + Cost Allocation.** 1 module mới vừa: SLA/Notification. Phần còn lại là mở rộng.

## 3. Ràng buộc & rủi ro

1. **Văn bản đã có hiệu lực** → giai đoạn chưa có hệ thống, vận hành đang chạy bằng 3 file Excel. Đề xuất: làm **import-first** (nhập file QC) trước, realtime sau.
2. **Tiền + hoa hồng = nhạy cảm** — bắt buộc audit log đầy đủ, công thức phải được Kế toán Hội sở duyệt bằng văn bản trước khi code (tránh tranh chấp như khách lưu ý).
3. **Định nghĩa mơ hồ cần chốt:** "doanh số khai thác mới" (loại trừ tái tục?), thời điểm ghi nhận LEADS_3 (đóng đủ? đóng đợt 1?), nguồn `referral` ai hưởng hoa hồng.
4. **LEADS_1 là dữ liệu ngoài hệ thống** (Messenger/Zalo page) — phụ thuộc file QC nhập tay; chất lượng số liệu CPL phụ thuộc kỷ luật nhập liệu.

## 4. Quyết định PM

- **Chuyển BA ngay** (yêu cầu đủ rõ): `2-ba-phan-tich/02-gap-analysis-tuyen-sinh-sr217.md`.
- Xếp **Release 1 (ưu tiên cao nhất)** trong roadmap — trước các hạng mục Phiếu #01.
- Gửi kèm câu hỏi nhóm B trong `03-cau-hoi-xac-nhan-khach-hang.md` cho Kế toán Hội sở + TGĐ duyệt công thức.
- Xin 3 file Excel hiện hành (QC / Admin / TT) làm spec export.
