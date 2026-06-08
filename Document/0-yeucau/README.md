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

## Trạng thái hiện tại (2026-06-05)

| Bước | Tài liệu | Trạng thái |
|---|---|---|
| **0. Gốc** | `1 - Yeu cau tinh nang QL HV.pdf` | Đã tiếp nhận |
| | `TomTat_QuyTrinh_TuyenSinh_SR217.docx` (SR.QD.217, ban hành 01/06/2026) | Đã tiếp nhận |
| **1. PM** | [01-phieu-tiep-nhan-ql-hv-lms.md](1-pm-tiep-nhan/01-phieu-tiep-nhan-ql-hv-lms.md) — phân loại ✅/🟡/🔴/🔬 + MoSCoW đề xuất | 🟡 chờ khách duyệt |
| | [02-phieu-tiep-nhan-tuyen-sinh-sr217.md](1-pm-tiep-nhan/02-phieu-tiep-nhan-tuyen-sinh-sr217.md) — ưu tiên cao nhất | 🟢 đã chuyển BA |
| | [03-cau-hoi-xac-nhan-khach-hang.md](1-pm-tiep-nhan/03-cau-hoi-xac-nhan-khach-hang.md) — 22 câu hỏi 4 nhóm | 🔴 **CHỜ KHÁCH TRẢ LỜI** |
| **2. BA** | [01-gap-analysis-tuyen-sinh-sr217.md](2-ba-phan-tich/01-gap-analysis-tuyen-sinh-sr217.md) — mapping L1/L2/L3, model mới, SLA, commission | ✅ xong (chờ chốt nhóm B) |
| | [02-gap-analysis-ql-hv-lms.md](2-ba-phan-tich/02-gap-analysis-ql-hv-lms.md) — Must/Should/Could + track R&D | ✅ xong |
| | [03-user-stories.md](2-ba-phan-tich/03-user-stories.md) — 9 epic, AC chi tiết | ✅ xong |
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
