---
name: ba-analysis
description: Phân tích nghiệp vụ Sata Robo — biến nhu cầu thô thành yêu cầu chuẩn (gap analysis, spec lane, user story, AC nghiệm thu). Use when user asks phân tích yêu cầu, viết user story, gap analysis, đặc tả chức năng, tiêu chí nghiệm thu, hoặc rà một yêu cầu trước khi code.
---

# BA Analysis — chuẩn phân tích yêu cầu Sata Robo

Chuẩn đầy đủ: ⭐ [`00-tieu-chuan-phan-tich-yeu-cau.md`](../../../Document/0-yeucau/2-ba-phan-tich/00-tieu-chuan-phan-tich-yeu-cau.md). Skill này là bản thao tác.

⚠️ **Đừng tin trí nhớ về hiện trạng.** Sự thật dự án đổi theo tuần. Trước khi khẳng định bất cứ điều gì về scope / quyền / flag / cách ly dữ liệu → đọc [`references/hien-trang.md`](references/hien-trang.md) (ảnh chụp + cách tự kiểm lại từ code).

## Triggers

"phân tích yêu cầu" · "viết user story" · "gap analysis" · "đặc tả / spec" · "AC / tiêu chí nghiệm thu" · "yêu cầu này có làm được không" · "cái này trong scope chưa" · nhu cầu thô từ TGĐ/BGĐ/phiếu khảo sát cần biến thành việc code được.

## 7 quy tắc vàng

1. **Yêu cầu = NHU CẦU, không phải GIẢI PHÁP.** Mô tả *cái gì / vì sao*; cách làm để cho design.
2. **Không testable = không phải yêu cầu.** Mỗi yêu cầu phải có AC kiểm chứng được.
3. **CODE THẮNG DOC khi mô tả hiện trạng.** Mọi câu "hiện tại hệ thống đang…" phải dẫn `file:line`. Doc mô tả ý định; code mới là sự thật.
4. **MỚI HƠN THẮNG.** Thứ tự thẩm quyền: quyết định ký sau (phiếu BGĐ · biên bản chốt · SRS bản mới) → Doc 15 (baseline kiến trúc, đọc kèm phần ~~gạch~~ + `[ĐẢO ...]`) → doc cũ. **Trước khi bác một yêu cầu vì "ngoài scope", BẮT BUỘC kiểm có quyết định mới hơn đảo nó chưa** — bảng loại-trừ trong repo có nhiều dòng đã chết mà chưa xoá.
5. **KHÔNG TỰ QUYẾT.** Spec chỉ **trình phương án + câu hỏi**; tuyệt đối không tự suy luận quyền/tiền/chính sách. Điểm chưa chốt → một dòng trong bảng `| # | Câu hỏi | Mặc định đề xuất (chờ xác nhận) |`. Chỉ code sau khi có **🟢 ĐÃ KÝ + ngày + tên người ký**.
6. **TBD phải có owner + hạn.** Không để khoảng trống vô danh.
7. **Thêm việc = phải nói cắt gì.** Team còn 3 người và đang quá tải ~2x. Mọi đề xuất mới phải tự xếp vào 1 trong 3 cửa: *P0/P1 chen vào GĐ hiện hành (kèm việc bị đẩy ra)* · *P2 cuốn chiếu sau go-live* · *yêu cầu bổ sung qua change-control*.

## Trước khi viết một chữ — chạy 3 lệnh này

Ba câu hỏi làm hỏng nhiều spec nhất, và chỗ trả lời chúng:

- **"Tính năng này bật chưa?"** → `lib/flags.ts`. Có 10 feature flag; **default trong code ≠ giá trị trên prod**. AC chạm tính năng có flag mà không ghi *flag nào / trạng thái / môi trường* → dev build xong, nghiệm thu "không thấy gì".
- **"Dữ liệu đã được cách ly cơ sở chưa?"** → `lib/db-scope.ts` (`SCOPED_MODELS`). `scopedDb` **chỉ tự lọc READ top-level**. Mọi `create/update/delete` phải tự gọi `passesScope()`; mọi `create` trên model đã scoped phải **set `centerId`** (quên = record vô hình). Portal dùng `portalDb`, không dùng `scopedDb`.
- **"Ai được làm việc này?"** → RBAC đang chạy **2 tầng**: quyền action = matrix tĩnh (enum 9 role), cách ly dữ liệu = động (`UserOrgRole`). AC về quyền phải ghi rõ nghiệm thu ở tầng nào.

Chi tiết + số liệu + `file:line` → [`references/hien-trang.md`](references/hien-trang.md). Đừng chép số từ trí nhớ.

## Vòng đời

`Elicit → Analyze → Specify → Verify → Baseline → Change-control`

- **Elicit** — map as-is bằng code (quy tắc 3), tái dùng pipeline sẵn có (Lead/Order/Enrollment) trước khi đề xuất bảng mới.
- **Analyze** — tách vấn đề khỏi giải pháp; bắt exception + boundary; ưu tiên; soi mâu thuẫn với quyết định đã ký.
- **Specify** — theo template thật (dưới); gắn AC + NFR + truy vết.
- **Verify** — chạy checklist (dưới) + lấy chữ ký. *Khác với verify code* — cái đó là skill `goal-verification` / `/verify`.
- **Baseline → Change-control** — sau khi ký, mọi thay đổi = **yêu cầu bổ sung** (có dấu trên phiếu). Đụng phân quyền: chỉ TGĐ + tech-lead duyệt.

## Template

Bốn khung thật đang dùng (spec lane · bảng chọn phương án · spec việc bị chặn · khối gap 3 mục) → [`references/mau-spec.md`](references/mau-spec.md). Copy khung ở đó, đừng tự chế.

User story vẫn giữ dạng cũ, nhưng **truy vết đã đổi**:

```markdown
**US-<epic>-<n>** · Là **<vai trò>**, tôi muốn **<việc>** để **<giá trị>**.
- Ưu tiên: P0 | P1 | P2   (gap-analysis nhiều epic thì dùng Must/Should + Phức tạp: Thấp|TB|Cao|Rất cao)
- Loại: BR | FR | NFR(<nhóm>) | Inverse
- AC1 (Given/When/Then): <điều kiện> → <hành động> → <kết quả đo được>
- Truy vết: <nguồn: phiếu BGĐ câu N / TBD-n / OI-n> · <GĐ + ticket/lane> · <suite test + case ID>
- Flag: <TÊN_FLAG = ON/OFF ở env nào>   (bỏ nếu không chạm flag)
- TBD: <điểm chưa chốt + owner + hạn>   (nếu có)
```

Sáu trường mà spec nào cũng phải có, thiếu là trả lại: **Nguồn** (trích nguyên văn) · **Hiện trạng có `file:line`** · **Tác động DB** (additive trước, 2-phase, không drop cột) · **Flag + tiền đề flip** · **Rollback** · **Người duyệt + trạng thái 🟢/🟡/🔴 + ngày ký**.

## Checklist review (chạy TRƯỚC khi trình ký)

**Mỗi yêu cầu:** atomic · unambiguous · testable · need-not-solution · in-scope (đã kiểm quy tắc 4) · truy vết đủ · TBD có owner+hạn · as-is có dẫn code.

**Cả bộ:** ID duy nhất · prioritised · nhất quán + cross-ref · phủ exception + boundary · khả thi trong ràng buộc người/ngày · có cả FR lẫn NFR · nêu rõ *inverse* (cái cố ý KHÔNG làm).

**NFR 5 nhóm:** reliability · performance (LCP < 2.5s, Lighthouse ≥ 85 public / ≥ 90 admin) · security & PII (mask theo quyền; không lộ `studentId` trên URL portal; media theo `StudentConsent`) · usability (mobile 375px, tiếng Việt) · ops/scale (rollback bấm giờ được).

**AC gắn vào test:** chỉ rõ *tầng* (logic thuần → Vitest co-located · chạm DB/quyền/IDOR → Playwright e2e) + *suite + lệnh chạy* + *case ID* `[<ticket>-C<n>]`, và **ghi rõ suite đó có job CI hay không**. Danh sách suite → `references/hien-trang.md`.

## ❌ Sai / ✅ Đúng

```markdown
❌ "Thêm cột `isShared` vào bảng Lead và một nút toggle ở trang chi tiết."
   → giải pháp trá hình; không nói vì sao; không nghiệm thu được; tự quyết quyền.

✅ **US-LEAD-4** · Là **Sale**, tôi muốn **cho đồng nghiệp cùng cơ sở xem lead của tôi**
   để **bàn giao khi tôi nghỉ mà không phải nhờ admin**.
   - Nguồn: phiếu BGĐ câu 10 (trích: "…") · Hiện trạng: lead chỉ owner thấy — `lib/db-scope.ts:24`
   - AC1: Given lead CS1 được bật chia sẻ, When Sale khác **cùng CS1** mở danh sách, Then thấy lead + badge "Được chia sẻ".
   - AC2: Given lead đó, When Sale **CS2** mở, Then KHÔNG thấy (e2e cách ly `[#11-ISO-01]`, suite crm).
   - ❓ Q1: ai được bật — chỉ owner hay cả QL cơ sở? (mặc định đề xuất: owner **hoặc** CENTER_MANAGER)
   - ❓ Q2: người được chia sẻ được SỬA hay chỉ XEM? (mặc định đề xuất: chỉ XEM)
```

## Nơi đặt sản phẩm & bàn giao

- **Artefact phục vụ go-live** → `docs/ke-hoach-go-live-2607/`, tên theo loại: `spec-<lane#>-<slug>.md` · `de-xuat-<slug>.md` · `cau-hoi-lam-ro-<người>.md` · `bien-ban-chot-<mã>.md` · `smoke-` / `runbook-` / `backlog-`.
- **Gap-analysis dài nhiều epic** (đầu vào `/prepare-prompt`) → `Document/0-yeucau/2-ba-phan-tich/NN-<slug>.md`, đánh số tiếp (hiện tới `08`).
- **Đổi kiến trúc** → addendum vào Doc 15, không viết doc song song.
- Artefact BA mới phải `git add` — nửa thư mục go-live hiện đang untracked.
- Trùng vai với skill khác thì **trỏ, đừng lặp**: giữ diff tối thiểu → `scope-discipline` · chống gold-plating → `no-overengineering` · verify code → `goal-verification`.

→ Yêu cầu đã ký + baseline → chạy `/prepare-prompt` để sinh phase prompt thực thi.
