---
name: ba-analysis
description: Phân tích nghiệp vụ Sata Robo — khai thác, viết, rà yêu cầu / user story / gap analysis / acceptance criteria / functional spec theo chuẩn dự án. Dùng khi user yêu cầu "phân tích yêu cầu", "viết user story", "gap analysis", "đặc tả chức năng", "AC/tiêu chí nghiệm thu", hoặc khi cần biến một nhu cầu thô thành yêu cầu chuẩn trước khi vào phase.
---

# BA Analysis — chuẩn phân tích yêu cầu Sata Robo

Vận hành chuẩn đầy đủ tại ⭐ [`Document/0-yeucau/2-ba-phan-tich/00-tieu-chuan-phan-tich-yeu-cau.md`](../../../Document/0-yeucau/2-ba-phan-tich/00-tieu-chuan-phan-tich-yeu-cau.md). Skill này là bản thao tác nhanh — khi cần chi tiết/checklist đầy đủ, mở file chuẩn.

## Khi nào dùng

Người dùng muốn: phân tích nghiệp vụ, viết/đánh giá **user story**, **gap analysis**, **functional spec**, **acceptance criteria**, hoặc chuyển một yêu cầu thô → yêu cầu chuẩn vào được phase A0–R5.

## Quy tắc vàng (nhớ trước khi viết câu nào)

1. **Yêu cầu = NHU CẦU, không phải GIẢI PHÁP.** Mô tả *cái gì / vì sao*, để cách hiện thực cho design.
2. **Không testable = không phải yêu cầu.** Mỗi yêu cầu phải có AC kiểm chứng được.
3. **Hiểu as-is trước.** Map quy trình hiện tại + tái dùng pipeline (Lead/Order/Enrollment) trước khi đề xuất mới.
4. **Doc 15 thắng.** Khi xung đột với tài liệu cũ → theo [Doc 15 blueprint](../../../Document/2-architecture-design/15-final-architecture-blueprint.md).
5. **TBD phải có owner + hạn.** Không để khoảng trống vô danh.

## Vòng đời (làm theo thứ tự)

`Elicit → Analyze → Specify → Verify → Baseline`
- **Elicit:** map as-is, hỏi end-user thật, khảo sát vấn đề, cân nhắc Buy-vs-Build.
- **Analyze:** tách vấn đề khỏi giải pháp; xác định exception + boundary; ưu tiên MoSCoW; soi mâu thuẫn.
- **Specify:** viết theo Template dưới; gắn AC + NFR + truy vết.
- **Verify:** chạy Checklist review (dưới); lấy đồng thuận stakeholder.
- **Baseline:** gắn vào phase; sau đó thay đổi đi qua change-control (ghi lý do + ảnh hưởng).

## Template chuẩn (copy khi viết)

```markdown
**US-<epic>-<n>** · Là **<vai trò>**, tôi muốn **<việc>** để **<giá trị>**.
- Ưu tiên: Must | Should | Could | Won't
- Loại: BR | FR | NFR(<nhóm>) | Inverse
- AC1 (Given/When/Then): <điều kiện> → <hành động> → <kết quả kiểm chứng được>
- AC2: …
- Truy vết: Doc 15 §<x>/OI-<n> · Phase <A0–R5> · Test <T1–T12/C-id>
- TBD: <điểm chưa chốt + owner + hạn>   (nếu có)
```

ID: `US-<epic>-<n>` (story) · `FR/NFR/BR-<mã>-<n>` (spec). AC viết Given/When/Then rút gọn, map được sang Vitest/Playwright (T1–T12).

## Checklist review (chạy TRƯỚC khi chốt)

**Mỗi yêu cầu:** atomic · unambiguous · testable (có AC) · in-scope · ngôn ngữ nghiệp vụ · need-not-solution · traceable · necessary · TBD có owner+hạn.

**Cả bộ:** complete · ID duy nhất · prioritised · consistent + cross-ref · phủ exception + boundary · feasible trong ràng buộc · sufficient · inverse nêu rõ · simplest set · có cả FR+NFR.

**NFR (5 nhóm):** reliability · performance (có ngưỡng: LCP<2.5s, Lighthouse ≥85/≥90) · security/PII · usability (mobile 375px, VI) · ops/scale.

## Guardrails Sata Robo — mọi yêu cầu phải soi qua (vi phạm = loại)

- ❌ **Scope ĐÃ LOẠI** (Doc 15 §0): AI camera/sinh trắc/định vị HS · Web3/NFT · marketplace · student login riêng · teacher domain riêng · video LMS · AI learning-path. "Dự báo/khuyến nghị" → **rule-based**.
- 🔒 **scopedDb**: tôn trọng cách ly cơ sở (CS1 ≠ CS2); KHÔNG hardcode center — qua OrgUnit tree.
- 🔑 **RBAC động**: quyền theo `UserOrgRole`; ALLOW thắng; KHÔNG có `HO_MANAGER`; sửa role cần SUPER_ADMIN+audit+reason.
- 🧒 **Privacy học viên**: không lưu giấy tờ tùy thân; media theo `StudentConsent`; KHÔNG lộ `studentId` trên URL portal; mask PII theo quyền.
- ⚛️ **Atomic vs Event**: tiền/invoice/enrollment/kho → transaction; thông báo/stats/sync ngoài → DomainEvent idempotent; external call chỉ qua `modules/integration`.
- 📜 **API contract**: success `{ok,data,meta}` · error `{ok:false,error:{code(EN),message(VI),field?,requestId}}` · idempotency cho webhook + confirm payment.

## Rủi ro yêu cầu hay gặp → phòng ngay

scope creep (→ inverse req + change-control) · yêu cầu mơ hồ (→ AC đo được) · gold-plating (→ simplest set) · mâu thuẫn ngầm (→ cross-ref) · bỏ sót exception/biên (→ bắt buộc cân nhắc) · lẫn vấn đề với giải pháp (→ need-not-solution).

## Nơi đặt sản phẩm BA

- Gap analysis / user story / spec → `Document/0-yeucau/2-ba-phan-tich/` (đánh số nối tiếp file hiện có).
- Luôn trỏ truy vết về Doc 15 § + phase trong `3-ke-hoach-trien-khai/phases/`.
- Sau khi soạn yêu cầu nặng (≥1 epic), gợi ý chuyển sang skill `prepare-prompt` để biến thành phase prompt thực thi.
