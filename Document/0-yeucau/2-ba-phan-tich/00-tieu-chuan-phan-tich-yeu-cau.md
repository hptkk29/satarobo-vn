# 00 — Tiêu chuẩn Phân tích & Đặc tả Yêu cầu (BA Standard)

> **Nguồn:** *BA_Checklist_Formatted.pdf* (Business Analyst Checklist · Joining a New Project, v1) — đã **thích nghi vào bối cảnh Sata Robo**.
> **Mục đích:** mọi yêu cầu của dự án (gap analysis, user story, functional spec, change request) phải đạt **cùng một chuẩn chất lượng** trước khi vào kế hoạch triển khai.
> **Thứ tự nguồn đúng:** khi xung đột → **Doc 15** ([`2-architecture-design/15-final-architecture-blueprint.md`](../../2-architecture-design/15-final-architecture-blueprint.md)) thắng cho việc xây MỚI; file này quy định *cách viết & kiểm yêu cầu*, không quy định kiến trúc.
> **Áp dụng cho:** mọi file trong `2-ba-phan-tich/`, đầu vào cho `3-ke-hoach-trien-khai/phases/` (A0→R5) và test T1–T12.

---

## 0. Phạm vi & nguyên tắc

- **Một yêu cầu = một nhu cầu của stakeholder, KHÔNG phải một giải pháp.** (Mô tả *cái gì/why*, không mô tả *làm thế nào*.)
- **Tái dùng trước, thêm mới sau** — bám pipeline hiện có (Lead/Order/Enrollment…), không refactor đập bỏ.
- **Verifiable hoặc không tồn tại** — yêu cầu không kiểm chứng được thì không phải yêu cầu.
- **TBD phải có chủ + hạn** — mọi điểm chưa chốt ghi `TBD(owner, hạn)`, không để treo vô danh.

---

## 1. Vòng đời yêu cầu (Requirement lifecycle)

```
Elicit → Analyze → Specify → Verify → Baseline → Change-control
(khai thác)(phân tích)(đặc tả)(thẩm định)(chốt mốc)(quản trị thay đổi)
```

| Bước | Việc BA phải làm (rút từ Work Activities + JAD checklist) |
|---|---|
| **Elicit** | Map quy trình **hiện tại** (as-is) trước; phỏng vấn end-user thật; khảo sát vấn đề/ý tưởng; benchmark; cân nhắc **Buy vs Build**. |
| **Analyze** | Tách vấn đề khỏi giải pháp; xác định exception & boundary; ưu tiên (MoSCoW); phát hiện mâu thuẫn. |
| **Specify** | Viết theo **Template §5**; gắn AC + NFR + truy vết; tài liệu tuân chuẩn (file trong `2-ba-phan-tich/`). |
| **Verify** | Chạy **Checklist review §10**; lấy *sign-off* (đồng thuận stakeholder) — Given/When/Then đọc được bởi cả nghiệp vụ lẫn dev. |
| **Baseline** | Chốt mốc (gắn vào phase A0–R5). Sau baseline, thay đổi đi qua **Change-control**. |
| **Change-control** | Mọi thay đổi sau baseline → ghi lý do + ảnh hưởng (scope/lịch/test) + cập nhật truy vết; không "đổi ngầm". |

---

## 2. Phân loại yêu cầu

| Loại | Trả lời câu hỏi | Ví dụ Sata Robo |
|---|---|---|
| **Business (BR)** | *Vì sao làm phần mềm này?* — mục tiêu, giá trị kinh doanh/khách hàng | "Giảm thời gian phản hồi lead để tăng tỉ lệ L1→L2" |
| **Functional (FR)** | *Hệ thống phải làm gì?* | "Webhook Messenger tạo `MessengerConversation` idempotent" |
| **Non-functional (NFR)** | *Làm tốt đến mức nào?* | Xem 5 nhóm dưới |
| **Inverse / Exception** | *Hệ thống KHÔNG được làm gì? Xử lý lỗi/biên ra sao?* | "Không lộ `studentId` trên URL portal" |

**NFR luôn phải cân nhắc đủ 5 nhóm** (rút từ Requirements Checklist §8):
1. **Reliability** — độ tin cậy, uptime, serviceability, robustness.
2. **Performance** — response time/latency, throughput, data volume, peak load. *(Sata Robo có budget: LCP < 2.5s public, Lighthouse ≥85/≥90.)*
3. **Security & Safety** — phân quyền, bảo vệ PII, audit, idempotency webhook/payment.
4. **Usability** — dễ dùng, mobile 375px, i18n/l10n (VI), look & feel (brand cam #F97316 / tím #7C3AED).
5. **Scalability/Ops** — thêm CS mới = thêm data (OrgUnit), không sửa code; backup RPO/RTO.

---

## 3. Tiêu chuẩn MỘT yêu cầu đơn (atomic) — phải đạt HẾT

> Rút từ *Requirements Checklist §8.2 — Individual Requirement*. Mỗi yêu cầu đơn **bắt buộc** thoả:

- [ ] **Precise & unambiguous** — chính xác, một nghĩa (không "nhanh", "thân thiện" mơ hồ).
- [ ] **Atomic** — ở dạng đơn giản/nguyên tử nhất; một yêu cầu = một ý.
- [ ] **Testable/verifiable** — có cách kiểm chứng (AC Given/When/Then).
- [ ] **Correct** — đúng nhu cầu thực.
- [ ] **In-scope** — thiếu nó hệ thống chưa hoàn chỉnh; thừa thì loại.
- [ ] **Modifiable** — viết để dễ sửa (không trùng lặp, có ID).
- [ ] **Customer language** — dùng ngôn ngữ + thuật ngữ của nghiệp vụ (lead/phụ huynh/học viên/cơ sở…).
- [ ] **Need, not solution** — phát biểu nhu cầu, không áp đặt cách hiện thực.
- [ ] **Traceable** — truy vết được (xem §7).
- [ ] **Necessary** — thực sự cần.
- [ ] **TBD có chủ + hạn** — mọi khoảng trống ghi `TBD(owner, hạn)`.

---

## 4. Tiêu chuẩn TẬP yêu cầu (set-level) — phải đạt HẾT

> Rút từ *Requirements Checklist §8.1 — General*. Cả bộ yêu cầu của một epic/phase phải:

- [ ] **Complete** — đầy đủ; **Uniquely identifiable** — mỗi yêu cầu có ID riêng.
- [ ] **Prioritised** — ưu tiên rõ (MoSCoW: Must/Should/Could/Won't).
- [ ] **Consistent** — không mâu thuẫn nội bộ; **cross-reference đúng**.
- [ ] **Exception + boundary** — phủ điều kiện ngoại lệ & biên.
- [ ] **Feasible & within constraints** — khả thi trong ràng buộc đã biết (tech stack FROZEN, Doc 15).
- [ ] **Sufficient** — đủ để một đội dev tốt làm ra đúng sản phẩm mong muốn.
- [ ] **Inverse stated** — nêu rõ điều hệ thống KHÔNG làm (gồm scope ĐÃ LOẠI §8).
- [ ] **Simplest set** — bộ đơn giản nhất đáp ứng nhu cầu (chống gold-plating).
- [ ] **FR + NFR** — đã cân nhắc cả chức năng lẫn phi chức năng.

---

## 5. Template chuẩn — Yêu cầu / User Story

**ID convention** (giữ tương thích file hiện có): `US-<epic>-<n>` cho user story · `FR/NFR/BR-<mã>-<n>` cho spec.

```markdown
**US-<epic>-<n>** · Là **<vai trò>**, tôi muốn **<việc>** để **<giá trị>**.
- Ưu tiên: Must | Should | Could | Won't        (MoSCoW)
- Loại: BR | FR | NFR(<nhóm>) | Inverse
- AC1 (Given/When/Then rút gọn): <điều kiện> → <hành động> → <kết quả kiểm chứng được>
- AC2: …
- NFR liên quan: <reliability/perf/security/usability… nếu có>
- Truy vết: Doc 15 §<x> / OI-<n> · Phase <A0–R5> · Test <T1–T12 / C-id> · (PR/commit khi xong)
- TBD: <điểm chưa chốt + owner + hạn>  (nếu có)
```

**Acceptance Criteria (AC)** là phần *bắt buộc* — không có AC kiểm chứng được thì yêu cầu **chưa Ready**. AC phải map được sang test (Vitest/Playwright) theo nhóm T1–T12.

---

## 6. Definition of Ready (DoR) & Definition of Done (DoD)

**DoR — yêu cầu đủ điều kiện vào phase khi:**
- Đạt §3 (atomic) + nằm trong bộ đạt §4 (set).
- Có ≥1 AC kiểm chứng được; có ưu tiên MoSCoW; có truy vết Doc 15 §/Phase.
- Không vi phạm guardrails §8; mọi TBD có owner + hạn.

**DoD — yêu cầu coi như xong khi:**
- Code + test (đúng nhóm T1–T12) xanh; AC pass thực tế.
- Truy vết cập nhật (gắn PR/commit); tài liệu liên quan đồng bộ.
- Side-effect không-atomic đi qua DomainEvent; tiền/enrollment trong transaction (Doc 15).

---

## 7. Truy vết (Traceability) — bắt buộc 2 chiều

```
Business need ─▶ Requirement/US ─▶ Doc 15 §/OI ─▶ Phase (A0–R5) ─▶ Test (T1–T12) ─▶ Code/PR
       ◀──────────────── (đổi 1 mắt xích phải soi lại cả chuỗi) ────────────────▶
```

- Mỗi yêu cầu chỉ rõ: thuộc **Doc 15 §nào / Open Item nào**, rơi vào **phase nào**, được phủ bởi **test nào**.
- Đổi yêu cầu → kiểm tra ngược: AC còn đúng? test còn phủ? phase nào ảnh hưởng?

---

## 8. Guardrails Sata Robo — mọi yêu cầu PHẢI soi qua

> Vi phạm bất kỳ điểm nào → yêu cầu **không hợp lệ**, sửa hoặc loại.

- **Scope ĐÃ LOẠI (Doc 15 §0)** — KHÔNG đưa lại: AI camera/sinh trắc/định vị học sinh · Web3/NFT/blockchain · marketplace · student login riêng · teacher domain riêng · online video LMS · AI learning-path/prediction. Nhu cầu "dự báo/khuyến nghị" → làm **rule-based**.
- **Cách ly cơ sở (scopedDb)** — yêu cầu đọc/ghi nghiệp vụ phải tôn trọng scope center (CS1 không thấy CS2). KHÔNG hardcode danh sách center — đi qua OrgUnit tree.
- **RBAC động** — quyền theo `UserOrgRole`; ALLOW thắng nếu ≥1 role cho phép; KHÔNG có role `HO_MANAGER`; sửa role cần SUPER_ADMIN + audit + reason.
- **Quyền riêng tư học viên** — KHÔNG lưu giấy tờ tùy thân; media tôn trọng `StudentConsent`; KHÔNG lộ `studentId` trên URL portal; mask PII theo quyền.
- **Atomic vs Event** — tiền/invoice/enrollment/kho → transaction; thông báo/stats/đồng bộ ngoài → DomainEvent (handler idempotent). External call (Resend/Zalo/MISA/Meta) chỉ qua `modules/integration`.
- **API contract** — success `{ok,data,meta}` · error `{ok:false,error:{code(EN),message(VI),field?,requestId}}` · idempotency cho webhook + confirm payment.

---

## 9. Rủi ro yêu cầu hay gặp (phòng từ khâu BA)

> Rút gọn từ *Risk Checklist §9* — phần Requirements/Customer/Scope, sát dự án này:

| Rủi ro | Dấu hiệu | Cách phòng |
|---|---|---|
| **Scope creep** | "thêm vào cho đủ", yêu cầu nở sau baseline | Inverse requirement rõ; change-control bắt buộc; MoSCoW |
| **Yêu cầu mơ hồ** | tính từ định tính ("nhanh/dễ") không số | Ép AC đo được; NFR có ngưỡng |
| **Gold-plating** | chức năng không ai yêu cầu | "Simplest set" §4; bám charter/Doc 15 |
| **Mâu thuẫn ngầm** | 2 yêu cầu chỏi nhau | Cross-ref §4; review consistency |
| **Bỏ sót exception/biên** | chỉ mô tả happy path | Bắt buộc cân nhắc exception + boundary |
| **Lẫn vấn đề với giải pháp** | yêu cầu = chỉ định cách làm | "Need, not solution" §3 |
| **Khách chậm phản hồi/đổi ý** | review cycle kéo dài | Chốt TBD có hạn; sign-off từng mốc |

---

## 10. Checklist review yêu cầu (chạy TRƯỚC khi baseline)

> Bản 1 trang để soát nhanh một epic/phase. Tất cả phải ✅ mới được chốt.

**Tập yêu cầu (set):** ☐ complete ☐ ID duy nhất ☐ prioritised ☐ consistent + cross-ref ☐ phủ exception ☐ phủ boundary ☐ feasible trong ràng buộc ☐ sufficient ☐ inverse nêu rõ ☐ simplest ☐ có cả FR+NFR

**Từng yêu cầu (each):** ☐ atomic ☐ unambiguous ☐ testable (có AC) ☐ in-scope ☐ customer language ☐ need-not-solution ☐ traceable ☐ necessary ☐ TBD có owner+hạn

**NFR:** ☐ reliability ☐ performance (ngưỡng) ☐ security/PII ☐ usability/mobile/i18n ☐ ops/scale

**Guardrails (§8):** ☐ không chạm scope ĐÃ LOẠI ☐ scopedDb/center ☐ RBAC động ☐ privacy học viên ☐ atomic-vs-event ☐ API contract

**Truy vết:** ☐ gắn Doc 15 §/OI ☐ gắn Phase ☐ gắn Test T1–T12

---

## Phụ lục — Liên kết

- ⭐ Kiến trúc đích: [`2-architecture-design/15-final-architecture-blueprint.md`](../../2-architecture-design/15-final-architecture-blueprint.md)
- Kế hoạch phase + test: [`3-ke-hoach-trien-khai/phases/`](../../0-yeucau/3-ke-hoach-trien-khai/phases/README.md)
- Ví dụ áp dụng chuẩn này: [`03-user-stories.md`](03-user-stories.md), [`01-gap-analysis-tuyen-sinh-sr217.md`](01-gap-analysis-tuyen-sinh-sr217.md)
- Skill vận hành chuẩn này khi làm BA: `.claude/skills/ba-analysis/SKILL.md`
