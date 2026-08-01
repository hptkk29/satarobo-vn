# Mẫu artefact BA — trích từ spec thật đang dùng

> Bốn khung dưới đây **rút từ artefact có thật** trong `docs/ke-hoach-go-live-2607/` và `Document/0-yeucau/2-ba-phan-tich/`.
> Copy khung, **đừng tự chế format mới**.

---

## Mẫu 1 — Spec lane (artefact BA chính hiện nay)

Nguồn: `docs/ke-hoach-go-live-2607/spec-11-share-lead-va-pii-lead.md`

```markdown
# Spec #<lane> — <n> ticket: <tên ngắn> (trình BGĐ/Kiệt duyệt)

> Ngày <dd/mm/yyyy> · lane #<NN> (P<0|1|2>, <bắt buộc / KHÔNG bắt buộc go-live>) · nguồn: phiếu BGĐ **câu <n>** + **OI-<n>** Doc 15
> **DoD lane #<NN>:** spec này được **duyệt bằng văn bản TRƯỚC khi code**.
> Doc này chỉ **trình phương án + câu hỏi**; KHÔNG tự quyết quyền.

---

## Ticket 1 — <tên ticket>

### Nguồn (câu <n> BGĐ, mục <bộ phận>)
> "…trích NGUYÊN VĂN lời khách/BGĐ…"

### Vì sao cách hiển nhiên KHÔNG chạy
<root-cause, dẫn cơ chế hiện tại + file:line; nói rõ vì sao "seed thêm quyền là xong" là sai>

### Thiết kế đề xuất
1. **Migration additive:** `<Model>.<field>` … **Không drop cột nào** — 2-phase an toàn.
2. **<UI/hành vi>** — ghi `writeAudit` mỗi lần đổi (module `<x>`, action `<y>`).
3. **Logic đọc** mở rộng ở tầng query (KHÔNG ở `scopedDb`/`scopeType`): …

### ❓ Câu hỏi phải chốt TRƯỚC khi code
| # | Câu hỏi | Mặc định đề xuất (chờ xác nhận) |
|---|---|---|
| Q1 | <ai được làm / phạm vi> | <đề xuất> |
| Q2 | <xem hay sửa> | <đề xuất> |

**Est sau khi có spec ký:** ~<n>d (migration + UI + query + e2e cách ly cơ sở).

---

## DoD chung
- [ ] Spec **duyệt bằng văn bản** TRƯỚC khi code — chốt Q1–Q<n>.
- [ ] Mỗi ticket **1 PR riêng + e2e riêng**.
- [ ] e2e cách ly cơ sở (CS1 làm → CS2 KHÔNG thấy).

## Trạng thái
🟢 **ĐÃ KÝ <dd/mm>** (<người ký>: "<nguyên văn>") → code cùng ngày.
<!-- 🟡 chờ ký · 🔴 CHẶN -->

### Ghi chú thực thi (<dd/mm>)  ← viết ngược sau khi code
- **Q1–Q5:** <đã code gì, tên hàm/file> + <điều CỐ Ý không làm và vì sao>
```

**Quy tắc riêng:** Q đánh số **liên tục qua các ticket trong cùng spec** (không reset về Q1 ở ticket 2).

---

## Mẫu 2 — Bảng chọn phương án (bắt buộc khi có ≥ 2 cách làm)

Nguồn: `spec-11` §Ticket 2. **Đừng trình 1 phương án rồi bảo người ta duyệt.**

```markdown
### 2 phương án (<người quyết> chọn 1)
| | (A) <tên> | (B) <tên> |
|---|---|---|
| Cách làm | <mô tả> | <mô tả> |
| Ưu | **Nhất quán** pattern `<x>` đã có; introspect được | Nhanh (~1d) |
| Nhược | Phải rà **~<n> điểm render** | Lệch pattern; khó introspect; dễ sót |
| Est | ~2d | ~1d |
| **Đề xuất** | ✅ **(A)** — nhất quán với `<pattern>` vừa ship | |
```

---

## Mẫu 3 — Spec việc BỊ CHẶN

Nguồn: `docs/ke-hoach-go-live-2607/spec-13-chuyen-vai-tro-blocker.md`. Dùng khi kết luận là **"chưa code được"** — vẫn phải viết ra, để lần sau không điều tra lại từ đầu.

```markdown
# #<NN> — "<tên>": phân tích chặn + đường đi khi mở khoá

> Ngày <dd/mm> · lane #<NN> (P<n>, câu <n> BGĐ) · **KHÔNG code bây giờ** — <k> tiền đề chưa đạt (mục 3).

## 1. Vì sao chưa code được (phát hiện từ audit code)
| Writer | Ghi gì | KHÔNG ghi gì | Hệ quả |
|---|---|---|---|
| `<hàm>()` (`<file>:<line>`) | `<bảng>` | **không** bump `tokenVersion` | Session không biết → "<triệu chứng người dùng thấy>" |

## 2. Hệ quả: code lúc này = dead code
## 3. Tiền đề mở khoá (đủ <k> mới code)
- [ ] <tiền đề 1>
- [ ] <tiền đề 2>
## 4. Đường đi khi mở khoá   ← đánh số sẵn, trỏ file:line sẵn
## 5. Fix <root cause> — 2 phương án để chọn
## 6. DoD (chỉ code khi mục 3 xong)
## 7. Hai mảnh dễ nhầm (bảng File | Concept | Trạng thái)

## Trạng thái
🔴 **CHẶN** bởi <k> tiền đề (mục 3).
✅ **Mảnh an toàn ĐÃ LÀM:** helper `<file>` (pure, Vitest <n>/<n>, commit `<sha>`, **hiện chưa import ở đâu**).
```

⭐ **Bài học:** bị chặn thì **vẫn tách ra "mảnh code an toàn đầu tiên"** — thường là một pure function + unit test — để không đứng yên chờ.

---

## Mẫu 4 — Khối gap trong gap-analysis (3 mục / epic, bắt buộc đủ)

Nguồn: `Document/0-yeucau/2-ba-phan-tich/08-gap-analysis-fixlms-testday-round2.md`

```markdown
### <x>.1 Hiện trạng (as-is)
| Thành phần | Trang / file | Ghi chú |
|---|---|---|
| Chi tiết lead | `app/(admin)/admin/leads/[id]/page.tsx` | có ghi chú, con, học thử — **KHÔNG có khối thanh toán** |
| Guard thanh toán | `convert-lead-v2.ts:23-30` `evaluatePaymentGuard()` | cho convert nếu ≥1 `Payment.saleStatus=RECORDED` **hoặc** `finalPrice=0` |

### <x>.2 Gap & việc
| # | Item | Hiện trạng | Đích | Việc (BE/FE/DB) | Phức tạp |
|---|---|---|---|---|---|
| LE-2 | 2 | Trang convert hiện **note kỹ thuật** ("REGISTERED/R7-04…") | Trạng thái dễ hiểu: *Đã nộp X / Tổng phải thu Y / Còn thiếu Z* | FE: viết lại copy · BE: bổ sung `finalPrice` + `remaining` | TB |

### <x>.3 User story
**US2-LEAD-1** · Là **Sale/CSM**, tôi muốn **thấy ngay "đã nộp / tổng phải thu / còn thiếu"**
để **biết lead đã đủ điều kiện ghi danh chưa**.
- Ưu tiên: **Must** · Loại: FR · Truy vết: item 2 · Test: suite crm
- AC1: Given lead có ≥1 Order, When mở chi tiết lead, Then thấy khối "Thanh toán" — tiền định dạng VND.
- AC2: … **không** hiện mã kỹ thuật `PAYMENT_REQUIRED` / `R7-04`.
```

**Mã gap** = `<2 chữ epic>-<n>` (LE-1, TR-3, CL-2, LM-4, RB-1). **Cột Phức tạp** = Thấp | TB | Cao | Rất cao.

### Khung gap-analysis đầy đủ — 5 tầng, giữ đúng thứ tự

1. **Header blockquote:** `Input:` (nguồn thô + code hiện trạng + **ngày snapshot**) · `Output:` · `Nguyên tắc:` · `Trạng thái:`.
   Câu *Nguyên tắc* bắt buộc có: **"Doc 15 thắng doc cũ; code thắng doc khi mô tả hiện trạng"** + *"Sửa BE thì sửa kèm FE + DB cùng PR"*.
2. **§0 — bảng ánh xạ** `<N nhóm phát hiện> → <M epic>` (Epic | Nhóm | Bản chất | Thứ tự), kèm ⚠️ phụ thuộc giữa epic, và 🔬 danh sách *"triệu chứng: code đã đúng nhưng người dùng vẫn thấy lỗi"* → **repro runtime TRƯỚC khi code, không sửa mù**.
3. **Mỗi epic:** `x.1 Hiện trạng` · `x.2 Gap & việc` · `x.3 User story`.
4. **§Quyết định đã chốt** (`Mã QĐ | Nội dung | Quyết định | Ảnh hưởng`) + **§TBD** (`TBD | Câu hỏi | Quyết định | Ảnh hưởng`, đánh dấu ĐÃ CHỐT + ngày + người).
5. **§Đầu ra tiếp theo** → *"Chuyển `/prepare-prompt` sinh ticket theo N epic. Thứ tự wave: W1… W5…"*.

---

## Mẫu 5 — Kịch bản nghiệm thu chạy tay

Nguồn: `docs/ke-hoach-go-live-2607/smoke-8-vai-tro.md`. Dùng khi AC **không thể** phủ bằng test tĩnh.

Khung: **§0** *"Vì sao smoke, khi đã có test tĩnh?"* (nói rõ test tĩnh KHÔNG thấy gì) → **§0.1** *"⚠️ Đọc kết quả cho đúng"* (điều gì đang thực sự được kiểm, điều gì **không**) → **§1** Vạch xuất phát (checkbox) → **§2** bảng *Tài khoản × vai trò × cơ sở* (người thật) → **§3** kịch bản `S1..Sn` theo vai — mỗi dòng có **Ghi:** / **Chặn:** / **Cách ly:** → **§4** bảng phép cách ly `C1..Cn` (Phép thử | Kỳ vọng) → **§5** *"Lỗ mà smoke không lấp được — phải quyết trước flip"* → **§6** Kết luận với **tiêu chí PASS đo được** → **§7** *"Kết quả chạy thật"* (viết ngược sau khi chạy).

Tiêu chí PASS phải **đo được**, ví dụ: `SELECT COUNT(*) FROM "RbacShadowDiff" = 0` + *diễn tập rollback bấm giờ < 10 phút*.

---

## Mẫu 6 — Hỏi stakeholder & chốt

- **Hỏi:** `cau-hoi-lam-ro-<người>.md` — mỗi câu một checkbox `[ ]`, kèm `**Bối cảnh:**` và dòng `→ Ghi chú: ____` để người ta viết tay. Đánh dấu ⓣ (cần TGĐ) / ⓚ (cần Kế toán).
- **Chốt:** `bien-ban-chot-<mã>.md` — bảng `# | Câu hỏi | Phương án đề xuất | QUYẾT ĐỊNH` + **Ngày chốt** + **Người chốt**.

---

## Luận điểm phải ĐẾM ĐƯỢC, không phải ý kiến

Nguồn: `de-xuat-scope-v2-center-manager-teacher.md`. Cách viết một luận điểm đủ mạnh để người ta ký:

> **R1** — Action nào đang bị gọi trần thì `scopeType` PHẢI là `GLOBAL`. `can.ts:19` … `leads:view-all` có **9** call-site gọi trần.

Tức là: **chỉ được ra file:line · đếm được ra số · chạy được ra kết quả** (`pnpm exec tsx scripts/rbac-parity.ts`). Câu "em nghĩ nên…" không phải luận điểm.

---

## Khi phát hiện mình viết sai

**Đính chính công khai trong chính file đó** — ~~gạch bỏ~~ đoạn sai + ghi *"bản đầu của mục này SAI vì …"*. Đừng sửa lén: người khác đã đọc bản cũ và có thể đang code theo nó.
