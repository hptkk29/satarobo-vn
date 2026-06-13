# 0-yeucau — Tiếp nhận & phân tích yêu cầu khách hàng

> Quy trình: **Khách hàng → PM tiếp nhận → BA phân tích → Kế hoạch triển khai → Dev thực thi.**
> Mỗi bước 1 folder; tài liệu bước sau luôn trace ngược về bước trước.

```
0-yeucau/
├── 0-tai-lieu-goc/            # File gốc từ khách — KHÔNG sửa, chỉ thêm
├── 1-pm-tiep-nhan/            # PM: phiếu tiếp nhận, phân loại, câu hỏi xác nhận
├── 2-ba-phan-tich/            # BA: gap analysis vs hiện trạng, user stories + AC
├── 3-ke-hoach-trien-khai/     # PM+Lead: roadmap release, task breakdown giao việc
└── 4-inputnew/                # Input bổ sung từ Owner (missing review, blueprint v1 tham chiếu)
                               #   + 00-danh-gia-review-va-cai-thien-moi-vs-cu.md (đánh giá + bảng mới-vs-cũ)
```

## Trạng thái hiện tại (2026-06-12)

| Bước | Tài liệu | Trạng thái |
|---|---|---|
| **0. Gốc** | `1 - Yeu cau tinh nang QL HV.pdf` | Đã tiếp nhận |
| | `TomTat_QuyTrinh_TuyenSinh_SR217.docx` (SR.QD.217, ban hành 01/06/2026) | Đã tiếp nhận |
| | `SataRobo_LMS_Requirements_v3.1_CHOT-CUOI.md` (SRS LMS v3.1 hợp nhất, TGĐ phê duyệt 12/06/2026) | Đã tiếp nhận |
| **1. PM** | [01-phieu-tiep-nhan-ql-hv-lms.md](1-pm-tiep-nhan/01-phieu-tiep-nhan-ql-hv-lms.md) — phân loại ✅/🟡/🔴/🔬 + MoSCoW đề xuất | 🟡 chờ khách duyệt (phần LMS được thay bởi Phiếu #04) |
| | [02-phieu-tiep-nhan-tuyen-sinh-sr217.md](1-pm-tiep-nhan/02-phieu-tiep-nhan-tuyen-sinh-sr217.md) — ưu tiên cao nhất | 🟢 đã chuyển BA |
| | [03-cau-hoi-xac-nhan-khach-hang.md](1-pm-tiep-nhan/03-cau-hoi-xac-nhan-khach-hang.md) — 31 câu hỏi 5 nhóm (A–E) | 🔴 **CHỜ KHÁCH TRẢ LỜI** (mới thêm Nhóm E — LMS v3.1) |
| | [04-phieu-tiep-nhan-lms-v3.1.md](1-pm-tiep-nhan/04-phieu-tiep-nhan-lms-v3.1.md) — SRS LMS v3.1: 66 mục phân loại (17 ✅ / 31 🟡 / 17 🔴 / 1 🔬) + 8 xung đột XĐ-1…8 + tiền đề C1–C3 | 🟢 **ĐÃ DUYỆT 12/06** (TGĐ trả lời E1–E9 + chốt XĐ-5) — đã chuyển BA |
| **2. BA** | [00-tieu-chuan-phan-tich-yeu-cau.md](2-ba-phan-tich/00-tieu-chuan-phan-tich-yeu-cau.md) — **chuẩn chất lượng yêu cầu (BA standard)**, áp dụng mọi file BA + skill `ba-analysis` | ✅ chuẩn nền |
| | [01-gap-analysis-tuyen-sinh-sr217.md](2-ba-phan-tich/01-gap-analysis-tuyen-sinh-sr217.md) — mapping L1/L2/L3, model mới, SLA, commission | ✅ xong (chờ chốt nhóm B) |
| | [02-gap-analysis-ql-hv-lms.md](2-ba-phan-tich/02-gap-analysis-ql-hv-lms.md) — Must/Should/Could + track R&D | ✅ xong |
| | [03-user-stories.md](2-ba-phan-tich/03-user-stories.md) — 9 epic, AC chi tiết | ✅ xong |
| | [04-ba-r6-flexibility-hardening.md](2-ba-phan-tich/04-ba-r6-flexibility-hardening.md) — phase R6 Flexibility & Hardening | ✅ BASELINE 11/06 — ⚠️ phần học bù chéo cơ sở + IR-2 cập nhật theo QĐ-O2/O3 (xem BA #05 mục 0) |
| | [05-gap-analysis-lms-v3.1.md](2-ba-phan-tich/05-gap-analysis-lms-v3.1.md) — gap LMS v3.1 theo module + **bảng xung đột XĐ-1…8 (TẤT CẢ đã chốt — XĐ-8 = phương án 2)** + delta data model + R7a/R7b | 🟢 **ĐÃ DUYỆT 12/06** |
| | [06-user-stories-lms-v3.1.md](2-ba-phan-tich/06-user-stories-lms-v3.1.md) — 40 US / 17 epic, AC Given/When/Then, traceability 2 chiều SRS↔US | 🟢 **ĐÃ DUYỆT 12/06** |
| **3. Kế hoạch** | [01-roadmap-release.md](3-ke-hoach-trien-khai/01-roadmap-release.md) — bổ sung mục "Roadmap sau core": R6 Hardening → R7 LMS v3.1 | ✅ cập nhật 12/06 |
| | [phases/R7-lms-v3.1.md](3-ke-hoach-trien-khai/phases/R7-lms-v3.1.md) — phase R7: bảng 18 task + test bắt buộc `[R7-xx-Cn]` + Exit Criteria + 10 kịch bản DEMO | 🟢 **KẾ HOẠCH DUYỆT 12/06** — pipeline 3 điểm dừng hoàn tất |
| | [phases/R7/](3-ke-hoach-trien-khai/phases/R7/README.md) — 18 ticket đầy đủ 11 mục (R7-00 tiền đề bảo mật → R7-17 đóng phase) | 🟢 sẵn sàng nhận việc từ R7-00 (chờ: gate C1–C3 + TBD-3 prod migrate) |
| **3. Kế hoạch** | [01-roadmap-release.md](3-ke-hoach-trien-khai/01-roadmap-release.md) — R1 (SR217) → R2 → R3 → R4 + backlog + R&D | ✅ draft |
| | [02-task-breakdown.md](3-ke-hoach-trien-khai/02-task-breakdown.md) — task DB/BE/FE/QA cho R1, R2 | ✅ draft |

## Kết luận điều hành (PM summary — cập nhật sau khi khách chỉnh phiếu 2026-06-05)

1. **SR217 đi trước** — văn bản đã ban hành, có deadline vận hành hằng tháng. ~50% tái dùng CRM hiện có; **module mới: Commission Engine + Cost Allocation + Messenger webhook (LEADS_1 realtime)**.
2. Khách đã rút gọn scope QL HV & LMS: **loại bỏ** AI camera, phân tích sức khỏe, chatbot, NFT/Blockchain, giấy tờ tùy thân; R&D còn lại chỉ marketplace + multi-tenant. ~35% yêu cầu còn lại đã có sẵn → tổ chức demo nghiệm thu hiện trạng trước khi build.
3. **Việc chặn tiến độ hiện tại:** (a) khách trả lời bảng câu hỏi (`1-pm-tiep-nhan/03`), tối thiểu nhóm B (công thức hoa hồng) + 3 file Excel mẫu; (b) **FB page token + App Review** cho Messenger webhook — cần xin ngay từ tuần đầu R1.

## Quy ước khi có yêu cầu mới

1. Bỏ file gốc vào `0-tai-lieu-goc/` (không đổi tên file khách gửi).
2. PM lập phiếu tiếp nhận số tiếp theo trong `1-pm-tiep-nhan/` (template: theo phiếu 01/02 — bảng phân loại ✅🟡🔴🔬 + MoSCoW + rủi ro).
3. Câu hỏi mở → gộp vào `03-cau-hoi-xac-nhan-khach-hang.md` (thêm nhóm mới).
4. BA chỉ phân tích mục đã được duyệt ưu tiên; kế hoạch chỉ xếp lịch mục đã có spec BA.
