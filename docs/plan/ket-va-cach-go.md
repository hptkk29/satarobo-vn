# Bảng kẹt & cách gỡ — Sprint 3 → 18

**Lập ngày 24/08/2026**, sau khi 12 câu chặn khởi công + 5 câu khu vực A + 12 câu kỹ thuật đã chốt.
**Cập nhật 26/08/2026:** K-1 (3 phép đo prod) **đã chạy thật** — xem K-1; K-2 đo **chưa đủ**.
Khu vực G chốt thêm: `OQ-G5` + `OQ-G10` **đóng**, `OQ-G4` đóng nửa, `OQ-G6` nửa sau có **đề xuất** —
xem K-10 + K-11.
Khu vực F chốt thêm: gỡ **K-5** (nén video → client-side WebCodecs), **K-7** (mâu thuẫn F-10 → cách đọc B),
**K-9** (cả 4 câu chỉ nằm trong backlog) và chốt tên biến bucket ở **K-8**. 🔴 **K-6 (trần thời lượng
video) VẪN KẸT — và khó hơn trước.**

**Cập nhật 27/08/2026 — đợt trả lời CUỐI, 19 câu.** Gỡ: **K-6 phần thế bí** (tách riêng video thuyết trình;
còn **hai** tham số: trần thời lượng video *thường* `OQ-F4a` · thao tác "duyệt theo lô" `OQ-F4b`) ·
**K-9 ba câu cuối của backlog** (`OQ-F7` đợt 1 chỉ ảnh · `OQ-F8` người ký · `OQ-F9` **100%** PH đã ký) ·
**K-10** (duyệt 8 mã nguồn lead) · **K-11** (cả hai câu G còn lại) · **§4 khu vực C** (cả 4 câu) ·
**K-13** (3/4 câu D) · **K-17** (E-03 không lên site GV ⇒ **khu vực E hết kẹt**).
Sinh mới: **K-20** (đối chiếu consent giấy ↔ DB).

**Cập nhật 27/08/2026 — bản CHIỀU, đợt trả lời bổ sung.** Gỡ nốt: **K-2 / `OQ-F5`** (đo được trên prod:
`thieu_buoi = 0` · `tong = 7` · `thieu_ca_ngay_chup = 0`) · **`OQ-F8a`** (**một trong hai** người ký, Kiệt
đã ký) · **`OQ-F9a`** (văn bản **không có** điều khoản rút lại — câu đóng, **rủi ro chuyển sang pháp chế**) ·
**K-8** (bucket `satarobo-class-media` đã tạo, token đã gồm, CORS đã kiểm từng origin).
**Không gỡ được:** **K-12** (`OQ-D4` — hướng dẫn 6 bước đã gửi hai lần, chủ dự án chưa lấy được token).

Nguồn: `docs/plan/sprint-plan.md` (91 hạng mục) đối chiếu với `docs/plan/cau-hoi-can-quyet.md`.

> **Cách đọc:** mỗi mục ghi **kẹt vì gì · ai gỡ được · gỡ thế nào (từng bước) · gỡ xong mở được gì**.
> Mục nào không có ở đây nghĩa là **không kẹt** — cứ làm.

---

## 0. Trạng thái tổng

> 🔴 **Đọc dòng này trước mọi thứ khác.** Sau đợt bổ sung **chiều 27/08/2026**, bộ PRD còn lại **1 câu
> nguyên + 3 nửa câu** — **không phải "hết câu hỏi mở"**. (~~"ĐÚNG BA THỨ"~~ · ~~"2 câu + 5 nửa câu"~~ —
> ba bản đếm trong cùng một ngày: bản đầu gộp 5 nửa câu thành "một thứ", bản hai đúng lúc sáng, bản này
> tính thêm ba thứ đóng buổi chiều.)
>
> | | Còn lại | Chặn gì | Ai gỡ |
> |---|---|---|---|
> | **(a)** | **`OQ-D4`** — token Meta loại gì, hết hạn bao lâu. **Hướng dẫn 6 bước đã gửi hai lần; chủ dự án chưa lấy được** | 🔴 **Chặn cứng cả nhánh D** (K-12). Không có nó thì D.5 không bật job được, kể cả khi đã có danh sách ad account | Chủ dự án + quản trị Meta Business |
> | **(b)** | **Ba "nửa câu"** — vế đầu đã chốt 27/08, vế sau chưa: (i) **danh sách id ad account** (`OQ-D3`) · (ii) **trần THỜI LƯỢNG cho video thường** (`OQ-F4a`) · (iii) **"duyệt theo lô" là THAO TÁC gì** (`OQ-F4b`) | (i) chặn khâu **gọi Meta thật**, không chặn việc đổi cấu hình thành danh sách · (ii) chặn **nhánh video thường** · (iii) chặn **nhánh video THUYẾT TRÌNH** + quyết định `ClassMediaReviewDay` (SL-06) ghi gì cho buổi thuyết trình (**K-6**) | (i) Marketing · (ii)(iii) Chủ dự án |
>
> ✅ **Đóng buổi chiều 27/08:** `OQ-F5` (đo prod **0 / 7 / 0** ⇒ K-2 hết kẹt, F-04 bật được ngay) ·
> `OQ-F8a` (**một trong hai** người ký — Kiệt đã ký ⇒ bước duyệt Story 18 pha 2 là **một** chữ ký, bỏ mặc
> định tạm "cả hai") · `OQ-F9a` (**không có** điều khoản rút lại).
>
> 🔴 **`OQ-F9a` đóng câu hỏi, KHÔNG đóng rủi ro — và đây là dòng dễ đọc nhầm nhất file này.** Trả lời là
> *văn bản đã ký không có điều khoản rút lại*. Trong **mã**, đường rút vẫn có và vẫn chạy
> (`revokeMediaConsent` — `lib/lms/media-consent.ts:83`), tức hệ thống **cho PH nhiều hơn** giấy hứa. Hở
> nằm ở chiều ngược: nếu quy định về dữ liệu cá nhân của trẻ đòi consent **phải rút được** bất kể giấy
> viết gì, thì thiếu điều khoản là **lỗ hổng của văn bản** và không dòng mã nào vá được ⇒ **B3 + B4 của
> Go/No-Go vẫn ĐỎ**, việc thuộc **pháp chế**. Đừng chuyển hai ô đó sang xanh chỉ vì `OQ-F9a` hết dấu ⏳.
>
> 🔴 **Sau (ii) + (iii), chỉ nhánh ẢNH của F là không chờ câu nào.** ~~"chặn nhánh video thường, không chặn
> ảnh và không chặn video thuyết trình"~~ — **SỬA 27/08:** vế cuối chọi thẳng với **K-6** của chính file
> này, nơi ghi *"Nhánh video thuyết trình CHƯA hiện thực được"* vì thiếu `OQ-F4b`. Hai nhánh video
> đều bị chặn, mỗi nhánh bởi một nửa câu khác nhau — trong khi chủ dự án đã nói **"rất cần video sớm"**.
>
> Mọi câu khác trong 7 PRD **đã có câu trả lời**. Chỗ nào còn ghi "còn treo X" mà X không nằm trong bảng
> trên thì **đối chiếu ngày trước**: ghi trước 27/08 ⇒ chỗ đó **cũ**, sửa theo bảng này; ghi **cùng ngày
> 27/08** mà nêu một câu treo không có ở đây ⇒ **bảng này thiếu**, bổ sung vào đây chứ đừng xoá chỗ kia.

| Khu vực | Sprint | Chạy được ngay? |
|---|---|---|
| **A** — nền phạm vi & phân quyền | S1–S2 | ✅ Không kẹt, đang thực thi — nhưng phép đo 26/08 **chèn thêm một việc số 0**: 3 tài khoản có dấu vết hỏng trên prod (K-1) |
| **F** — kho media | S3–S8 | 🟢 **Đỡ hẳn sau chiều 27/08.** Đóng: **K-2** (`OQ-F5` đo được — 0/7/0, F-04 hết chặn) · **K-8** (bucket + token + CORS xong) · **K-9** (`OQ-F8a` một trong hai, Kiệt đã ký · `OQ-F9a` không có điều khoản rút lại). Còn: **HAI nửa câu của K-6** (`OQ-F4a` trần thời lượng video *thường* · `OQ-F4b` "duyệt theo lô" là **thao tác** gì — nửa sau chặn chính nhánh video thuyết trình) · **K-20** (đối chiếu consent giấy ↔ DB) · và **rủi ro pháp lý B3/B4 vẫn ĐỎ** dù `OQ-F9a` hết dấu treo. Nhánh **ảnh** chạy được; **cả hai nhánh video vẫn chờ chủ dự án** |
| **G** — module lead | S9–S10 | ✅ **HẾT KẸT 27/08** — `OQ-G4` vế "chạy ở đâu" chốt **(a) resolver**, `OQ-G6` duyệt **8 mã** (seed `LeadSource` hết chặn), `OQ-G9` **không có ca hẹn riêng**. K-10 + K-11 đóng |
| **C** — tab kinh doanh | S11–S12 | ✅ **HẾT KẸT 27/08** — cả 4 câu (`OQ-C2` · `C4` · `C8` · `C9`) đã chốt. ⚠️ `OQ-C9` **thêm việc**: sửa 5 màn cũ (đảo Non-Goal 1) — xem V-10 |
| **D** — chi phí marketing | S13–S15 | 🔴 **VẪN KẸT** — `OQ-D4` (token) **chưa trả lời**, chặn cứng cả nhánh (K-12). `OQ-D5/D7/D8/D9` đóng 27/08; `OQ-D3` chốt "nhiều tài khoản" nhưng **chưa có danh sách id** |
| **B** — tài chính | S15–S18 | ✅ **Hết kẹt 26/08** — 6 câu đã chốt + §B.6.8 đã đo. Còn việc *soạn lại thông báo* cho kế toán/marketing (số đảo chiều) |
| **E** — tương tác KH | S12–S15 | ✅ **HẾT KẸT 27/08** — `OQ-7` chốt **KHÔNG** lên site giáo viên ⇒ E-03 hết chặn, phạm vi test PII giữ nguyên (K-17 đóng) |

---

## 1. Kẹt xuyên suốt — không thuộc sprint nào, chặn nhiều nơi

### K-1. ~~Không ai trong phiên làm việc này chạy được truy vấn trên PROD~~ — ✅ **ĐÃ ĐO 26/08/2026**

**Kẹt vì (nguyên trạng, giữ để hiểu bối cảnh):** `.env` của máy local trỏ **DEV Supabase**, không phải
prod (đã ghi trong `MEMORY.md`). Prod chỉ tới được qua secret trong CI ⇒ ba phép đo bắt buộc
(`A-nen-tang §6.9`, `§C.6.9`, `§B.6.8`) không thể tự chạy trong phiên làm việc.

**ĐÃ GỠ 26/08/2026:** chủ dự án tự chạy cả ba trên Supabase **prod** (SQL Editor, toàn bộ chỉ đọc).
Kết quả nguyên văn đã ghi vào từng PRD — **đây là dữ liệu thật, không phải ước lượng**:

| Phép đo | Ghi ở | Kết luận một dòng |
|---|---|---|
| `[A-01-Đ1] … [A-01-Đ4]` | `docs/prd/A-nen-tang.md` **§6.9.2** | 🔴 SL-01 **đã nổ thật** — 2 dòng `UserOrgRole` bị thu hồi 20/08, + 1 QLCS rớt khỏi 5 nhóm chat |
| Lệch định nghĩa "đã chốt" | `docs/prd/CDB-dashboard.md` **§C.6.9** | ✅ Nhẹ — chốt `ENROLLED` chỉ làm 76 → 75 (**lệch 1 lead**) |
| Đồng hồ `lastActivityAt` | `docs/prd/CDB-dashboard.md` **§C.6.9** | 🔴 `NULL` cho **toàn bộ 129 lead** — cột chưa bao giờ chạy |
| Lệch định nghĩa doanh thu | `docs/prd/CDB-dashboard.md` **§B.6.8** | 🔴 Nguồn `Order` hiện **0 đ** trong khi tiền thật kỳ 2026-08 là **3.686.000 đ** |

**Bốn việc MỚI sinh ra từ kết quả đo** (không việc nào có trong kế hoạch trước 26/08):

1. 🔴 **Khôi phục quyền cho người đang hỏng trên prod** — Phan Thanh Toại (CS1) và Lê Thị Phương Liên
   (CS2) mất dòng `UserOrgRole` từ **20/08/2026** (hỏng **nếu** họ còn giữ vai QLCS — vận hành phải
   xác nhận); Đinh Thảo My (CS2) **chắc chắn hỏng**: còn quyền nhưng **rớt khỏi 5 nhóm chat lớp**.
   Hai kiểu hỏng khác nhau, chữa bằng hai việc khác nhau. Việc này **đi trước cả SL-01** — SL-01 là
   bịt lỗ cho tương lai, đây là chữa người đang đau. Chi tiết: `A-nen-tang.md` §6.9.2.
2. 🔴 **C5 buộc dùng biến thể A của §C.6.5** (đọc thẳng `LeadActivity` bằng `LATERAL`). Biến thể B đọc
   `Lead.lastActivityAt` sẽ cho kết quả **vô nghĩa cho 100 % lead**. Backfill cột đó tách thành **việc
   riêng**, không phải điều kiện tiên quyết của C5.
3. 🟠 **Chốt luật `OQ-B2` (điều chỉnh chồng) NGAY dù prod chưa có ca nào** — đúng lúc để **chặn** ở
   `adjustPayment` trước khi dữ liệu xuất hiện. Sau này có ca rồi thì phải vừa chặn vừa gỡ dữ liệu cũ.
4. 🟠 **Sửa lại thông điệp truyền thông của B3.** PRD đang ghi "số doanh thu và ROAS sẽ **tụt**" — đo
   kỳ 2026-08 cho thấy **ngược lại** với màn dùng nguồn `Order` (0 → 3.686.000). Xem `§B.6.8`.

**Đã mở khoá:** C.0 → toàn bộ tab C · B.0 → toàn bộ tab B · OQ-B2 · V-1/V-3 của A.
**Đã mở khoá nốt 27/08:** truy vấn đếm media ở **K-2** — chạy xong, kết quả sạch (0 / 7 / 0).

---

### K-2. ~~Số media `classSessionId = null` trên prod (OQ-F5)~~ — ✅ **ĐÃ ĐO XONG 27/08/2026, SẠCH**

> **Kết quả đo trên prod (chủ dự án chạy trong Supabase SQL Editor):**
> `thieu_buoi = 0` · `tong = 7` · `thieu_ca_ngay_chup = 0`.
>
> ⇒ **Mọi media trên prod đều đã gắn buổi.** F-04 bật được **ngay**: không phải backfill, không phải
> miễn trừ theo mốc ngày, không có ảnh nào biến mất khỏi portal. `OQ-F5` **ĐÓNG**.
>
> 📌 **Con số `tong = 7` đáng chú ý hơn chính câu hỏi.** Toàn bộ kho media trên prod hiện có **7 đối
> tượng**. Nghĩa là mối lo "di sản ảnh cũ nằm trong bucket công khai" (K-8, `OQ-F6`) là **7 object**,
> không phải hàng nghìn — việc dọn R2 mồ côi nhẹ hơn hẳn mọi ước lượng trước đó, và tách bucket
> **bây giờ** là thời điểm rẻ nhất có thể: càng để lâu di sản càng lớn.

**Kẹt vì:** F-04 sẽ thêm điều kiện `classSessionId: { not: null }` vào đường đọc của phụ huynh. Media cũ
thiếu cột này sẽ **biến mất khỏi portal ngay lập tức** — mà không ai biết con số đó là bao nhiêu.

**Đo 26/08/2026 — mới có ĐÚNG MỘT con số:**

| Chỉ số | Kết quả |
|---|---|
| `khop_duoc_theo_ngay` (truy vấn thứ hai) | **0** |
| `thieu_buoi` · `tong` · `thieu_ca_ngay_chup` · `cu_nhat` · `moi_nhat` (truy vấn thứ nhất) | ❌ **CHƯA CÓ KẾT QUẢ** |

🔴 **Không được suy diễn từ số 0 này.** `khop_duoc_theo_ngay = 0` khớp với **cả hai** khả năng trái ngược:

- **(i)** `thieu_buoi = 0` — không có media mồ côi nào, nên chẳng có gì để khớp ⇒ **hết kẹt**; hoặc
- **(ii)** `thieu_buoi` lớn nhưng **không cái nào có `takenAt`** (truy vấn thứ hai yêu cầu
  `takenAt IS NOT NULL`) ⇒ **kẹt nặng nhất có thể**: không một tấm nào backfill được bằng ngày chụp.

Hai khả năng đó dẫn tới hai kế hoạch F-04 hoàn toàn khác nhau. ⇒ **Phải chạy nốt truy vấn thứ nhất
mới đọc được kết quả.** Trước khi có nó, coi K-2 là **vẫn kẹt**.

**Chạy nốt trên prod (chỉ đọc) — đúng khối SQL dưới, không sửa:**

> ⚠️ `ClassSessionMedia` **không có cột `deletedAt`** (đã kiểm schema — xoá media là **xoá cứng**, đó
> cũng chính là gốc của vấn đề object mồ côi ở `OQ-F6`). Đừng thêm điều kiện `deletedAt IS NULL` vào
> hai truy vấn dưới — nó sẽ lỗi cột không tồn tại.

```sql
SELECT count(*) FILTER (WHERE "classSessionId" IS NULL)         AS thieu_buoi,
       count(*)                                                  AS tong,
       count(*) FILTER (WHERE "classSessionId" IS NULL
                          AND "takenAt" IS NULL)                 AS thieu_ca_ngay_chup,
       min("createdAt") FILTER (WHERE "classSessionId" IS NULL)  AS cu_nhat,
       max("createdAt") FILTER (WHERE "classSessionId" IS NULL)  AS moi_nhat
FROM "ClassSessionMedia";

-- Bao nhiêu cái trong số đó khớp được một buổi học theo ngày chụp?
SELECT count(*) AS khop_duoc_theo_ngay
FROM "ClassSessionMedia" m
WHERE m."classSessionId" IS NULL AND m."takenAt" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "ClassSession" s
              WHERE s."classId" = m."classId" AND s.date::date = m."takenAt"::date);
```

**Đọc kết quả:** `thieu_buoi = 0` ⇒ hết kẹt, làm F-04 bình thường. `khop_duoc_theo_ngay` gần bằng
`thieu_buoi` ⇒ backfill theo `takenAt`. `thieu_ca_ngay_chup` lớn ⇒ **những cái đó không backfill được
bằng cách nào cả** (không có mốc thời gian để khớp buổi) ⇒ buộc phải miễn trừ theo mốc ngày, và **nói
rõ với phụ huynh** rằng ảnh cũ vẫn xem được.

⚠️ **Với số đo 26/08 (`khop_duoc_theo_ngay = 0`), nhánh giữa đã bị loại.** Chỉ còn hai kết cục: hoặc
`thieu_buoi = 0` (không việc gì phải làm), hoặc **backfill theo `takenAt` là bất khả thi** và F-04
buộc phải đi đường miễn trừ theo mốc ngày. **Không có đường ở giữa** — đó là lý do con số
`thieu_buoi` đáng chạy nốt ngay, nó quyết định cả hình dạng của F-04.

---

### K-3. ~~14 lỗi typecheck có sẵn trong `tests/**`~~ — ❌ **CHẨN ĐOÁN SAI, ĐÃ SỬA 25/08/2026**

**Nhận định ban đầu (SAI):** "nhánh này có 14 lỗi `TS7006` implicit any trong `tests/**`, cần một ticket dọn".

**Sự thật:** đó **không phải lỗi mã**. Chúng là hệ quả của **Prisma Client chưa được sinh** trong worktree.
Khi `node_modules/.prisma/client` thiếu/cũ, `db.user` suy ra `any` ⇒ `db.user.findMany()` trả `any` ⇒
callback `users.map((u) => u.id)` thành implicit any ⇒ TS7006. Cả 14 lỗi đều nằm đúng ở các dòng `.map()`
/ `.filter()` trên kết quả truy vấn Prisma.

**Bằng chứng:** sau khi chạy `pnpm prisma generate` (không sửa một dòng nào trong 5 file bị báo lỗi),
`pnpm typecheck` trả về **0 lỗi**.

**Việc phải làm (thay cho "ticket dọn"):** khi mở worktree mới hoặc sau khi đổi `schema.prisma`,
chạy `pnpm prisma generate` **trước** khi tin kết quả `pnpm typecheck`. Đây cũng là lý do CLAUDE.md
dặn phải restart dev server sau migration — cùng một gốc: Prisma Client trong bộ nhớ/đĩa bị cũ.

⚠️ **Bài học rộng hơn:** một cổng chất lượng đỏ **không tự nó** chứng minh có nợ kỹ thuật. Trước khi mở
ticket dọn, kiểm xem cổng đó có đang chạy trên môi trường dựng đủ hay không.

---

### K-4. Migration chỉ được người vận hành chạy tay (luật cứng #4)

**Không phải kẹt cần gỡ — là quy trình.** Nhưng phải lên lịch, vì nó chặn theo thời gian thật:
mỗi sprint có migration (SL-01 ở S1; SL-02…SL-07 ở F; SL-08…SL-13 ở G; `AdsSyncRun`/`AdsSpendSnapshot`
ở D; index `Payment` + `CostEntry` ở B) đều cần **một khung giờ có người trực**.

⚠️ Nhớ: **DB của môi trường `test` CHÍNH LÀ DB dev** (CLAUDE.md). Migration nào `DROP`/`RENAME` sẽ xoá
thẳng dữ liệu đang làm việc ở local. Đợt này toàn bộ migration là **additive** nên rủi ro thấp — giữ
nguyên như vậy.

---

## 2. Khu vực F (Sprint 3 → 8)

### K-5. ~~Nén video H.264/720p chạy ở đâu~~ — ✅ **ĐÃ GỠ 26/08/2026: nén CLIENT-SIDE bằng WebCodecs**

**Đã chốt** (PRD `OQ-F3` = backlog `OQ-F1`): **không** dịch vụ ngoài, **không** worker riêng. Trình duyệt
của GV nén trước khi upload. Ba đường cũ (dịch vụ ngoài / worker riêng / hoãn F-02) đều bị loại; đường
được chọn là đường thứ tư — **nén ở máy người dùng**, chi phí hạ tầng bằng 0.

🔴 **PHẠM VI THU HẸP 27/08/2026 — mục này chỉ còn áp cho VIDEO THƯỜNG.** `OQ-F4` của PRD chốt **hướng (a)**
(K-6): **video thuyết trình** (buổi 12/24/36/48) **KHÔNG** đi đường nén client-side này, mà đi **đường
upload khác — hiện CHƯA CÓ TÊN**. ⇒ Câu "chi phí hạ tầng bằng 0" từ nay chỉ đúng cho **một nửa** khối
video; nửa còn lại mở lại đúng phần chi phí mà mục này tưởng đã đóng. **Phải chọn và nói tên đường đó
trước Bước 1**, cùng lúc với việc chọn công cụ đọc metadata cho tầng validate mức (2).

**4 kết cục, nhưng cột `transcodeStatus` chỉ lưu 3:** `DONE_CLIENT` (GV nén xong ở máy) · `PASSTHROUGH`
(file gốc đã đúng chuẩn sẵn) · `SKIPPED_UNSUPPORTED` (máy không chạy được WebCodecs, file đủ nhỏ nên
**vẫn nhận**). Kết cục thứ tư `REJECTED` (không nén được **và** quá chuẩn ⇒ chặn, không cho upload) là
⚙️ **mã lỗi của tầng validate, KHÔNG phải giá trị cột** — chặn upload thì không có record để ghi vào;
giữ vết bằng `writeAudit`.

🔴 **Luật cứng đi kèm — server KHÔNG BAO GIỜ tin `transcodeStatus` client gửi lên.** Không làm vậy thì
GV nào sửa request là đẩy được file 500MB vào R2.

⚠️ **"Chi phí hạ tầng bằng 0" chỉ đúng cho phần NÉN, không đúng cho phần KIỂM.** Tầng validate phải tách
hai mức: **(1)** dung lượng byte thật (`HeadObject`) + MIME/magic bytes — **không cần gì thêm**, áp ngay;
**(2)** codec / độ phân giải / thời lượng — repo **không có** `ffmpeg`/`ffprobe`/`mediainfo` (`sharp` chỉ
ở `package.json:162` trong `pnpm.onlyBuiltDependencies`, không dùng được) ⇒ **đòi một phụ thuộc MỚI chưa
ai chọn**, và đó là chi phí hạ tầng **≠ 0**. Phải chọn và nói tên **trước Bước 1**. Chi tiết:
`docs/prd/F-media.md` §0b.1.

**Ngưỡng:** 1280×720 · ~2 Mbps (~15 MB/phút) · dung lượng trần **suy ra** từ hai số đó + biên 20%.
⏳ **Thời lượng tối đa vẫn treo — xem K-6.**

**Việc còn lại (là VIỆC, không phải kẹt):**

| Bước | Nội dung | Điều kiện qua |
|---|---|---|
| **Bước 0 — ĐO** | Trang thử độc lập; **5–7 GV thật** ở CS1/CS2, **máy của họ**, **video điện thoại của họ**. Ghi 4 số: chạy được WebCodecs không · mất bao lâu · file ra bao nhiêu MB · có sập tab không | 🔴 Dưới **~70%** chạy được ⇒ **quay lại phương án server**, quay lại **TRƯỚC** khi lỡ code sâu |
| **Bước 1** | Interface `MediaTranscoder` + 2 hiện thực (`ClientWebCodecs`, `NoopSkip`) + tầng validate ở server | Đổi hiện thực không phải sửa call-site |
| **Bước 2** | Bật nhánh video ở **đợt 2** bằng cờ cấu hình | Đợt 1 vẫn chỉ ảnh |

⚠️ **Cảnh báo kiến trúc:** `modules/` **CHƯA TỒN TẠI** trong repo (CLAUDE.md nói thẳng: đừng import
`modules/integration`). Đặt `MediaTranscoder` ở đó = tạo mới thư mục `modules/`, tức là chạm ranh giới
modular monolith của Doc 15 — phải nói ra, đừng lặng lẽ tạo trong một story media. Đường rẻ hơn cho đợt
này: `lib/media/transcoder.ts`, dời sau.

⚠️ **Hai bẫy phải xử ngay trong story:** (a) **tab đóng giữa chừng** → cảnh báo `beforeunload`, mở lại thì
cho **chọn lại file làm lại từ đầu**, **KHÔNG** lưu trạng thái nén dở; (b) **máy GV yếu** → thanh tiến
trình hiện **phần trăm thật** (WebCodecs cho biết số frame đã xử lý), **không** spinner vô định — người
nhìn spinner 12 phút sẽ tắt tab và rơi thẳng vào bẫy (a).

**Mở được:** Story 5 (hết [SPIKE]) và hình dạng của Story 9/12/14. 🐯 **Nhưng nó lật P1 của pre-mortem
thành Tiger thật**: luồng upload video đổi bản chất (nén trước khi presign) — chính điều kiện mà bảng
Paper Tigers đã ghi sẵn.

---

### K-6. Trần **thời lượng** video (PRD `OQ-F4`) — 🟠 **27/08/2026: GỠ THẾ BÍ (hướng a), CÒN 2 THAM SỐ**

> ✅ **ĐÃ CHỐT 27/08/2026 — hướng (a): TÁCH RIÊNG loại "video thuyết trình".** Buổi 12/24/36/48 đi
> **đường riêng**: không áp F-18 "xem hết mới duyệt", duyệt **theo lô**, không đi nhánh nén client-side.
> Hai hướng (b) gộp một video và (c) cắt còn 3–5 phút **bị loại**.
>
> **Ba việc kéo theo, bắt buộc:**
> 1. **`ClassSessionMedia` phải phân biệt được hai loại video** (thường vs thuyết trình) — cột phân loại
>    khoá **cùng lúc với SL-02**. Thêm sau khi đã có dữ liệu = phân loại lại bằng tay (việc **V-9**).
> 2. 🔴 **Báo cáo SLA F-30 KHÔNG được trộn hai loại.** Loại thuyết trình có bước duyệt **yếu hơn hẳn**;
>    trộn vào là con số duyệt **tự khen**, và càng bị đo thì đường yếu càng được dùng — đúng cùng một bẫy
>    đã ghi ở `OQ-F6` (tự duyệt) trong K-9.
> 3. Viết **thành văn** rằng loại này duyệt nhẹ hơn. Đừng để nó lẫn vào lời hứa "QLCS xem hết mọi video".
>
> ⏳ **CÒN NỬA CÂU (1) — trần thời lượng cho video THƯỜNG** (sinh hoạt lớp hằng ngày). Gợi ý cũ 24/08
> (**60–90 giây/video, tối đa 3 video/buổi**) vẫn hợp với loại thường nhưng **chưa được duyệt** ⇒
> **chưa bật nhánh video thường**. Mã theo dõi: **`OQ-F4a`** của PRD.
>
> ⏳ 🔴 **CÒN NỬA CÂU (2) — "DUYỆT THEO LÔ" NGHĨA LÀ GÌ VỀ THAO TÁC.** Mã theo dõi: **`OQ-F4b`** của PRD.
> Đã chốt *nguyên tắc* (không xem hết, duyệt theo lô hoặc theo xác suất) nhưng **chưa đặc tả thao tác**:
> một nút duyệt cả 12 video? bốc ngẫu nhiên n video bắt xem? tỷ lệ n bao nhiêu, ai đặt? Nó cũng quyết
> định `ClassMediaReviewDay` (SL-06) ghi gì cho buổi thuyết trình. ⇒ **Nhánh video thuyết trình CHƯA
> hiện thực được** — chỉ nhánh **ảnh** là không chờ câu nào. Không được để Dev tự chọn thay: cái tự chọn
> đó **chính là mức kiểm soát còn lại** sau khi đã bỏ F-18.
>
> ⚠️ **Cột phân loại là `kind` của SL-04** (`docs/prd/F-media.md` §0c.1 hệ quả 1) — phải khai **BA** giá
> trị (ảnh · video thường · video thuyết trình) **ngay khi cột chưa tồn tại**
> (`prisma/schema.prisma:4556-4581` chưa có `kind`). Để cột hạ cánh với 2 giá trị rồi mới thêm =
> `ALTER TYPE ADD VALUE` trên bảng **đã có dữ liệu prod**.
>
> *Phần dưới giữ nguyên làm bối cảnh — nó là lý do vì sao hướng (a) được chọn.*

**Dung lượng đã hết kẹt** — suy ra được từ K-5: 1280×720 · ~2 Mbps · biên 20%. **Thời lượng thì chưa**,
và yêu cầu mới của chủ dự án làm câu này khó hơn chứ không dễ hơn.

**Nguyên văn yêu cầu (26/08/2026):** các buổi **12 / 24 / 36 / 48** là buổi **thuyết trình**; phải up
**video full từng học viên thuyết trình**, mỗi video **10–15 phút**, **12 video mỗi buổi** (sĩ số tối đa).

**Ba con số suy ra — chúng chống lại nhau:**

| Hệ quả | Con số | Chống với gì |
|---|---|---|
| **Thời lượng duyệt** | 12 × 15 = **180 phút = 3 TIẾNG** video mỗi buổi thuyết trình mỗi lớp | **F-18** bắt QLCS **xem HẾT** trước khi duyệt (tua không tính) và **F-20** đặt hạn duyệt **10h sáng hôm sau** |
| **Dung lượng** | 12 × 15 × ~15 MB/phút ≈ **2,7 GB mỗi buổi**, chưa tính các lớp khác | Trần một file hiện 500MB; chi phí R2; rủi ro "kho phình" |
| **Nén client-side** | Một video **15 phút** nén WebCodecs trên **laptop văn phòng đời cũ** = **hàng chục phút**, **rất dễ sập tab** | Đúng **bẫy (b)** của K-5, ở quy mô 12 lượt liên tiếp mỗi buổi |

⚠️ Gợi ý cũ của bản 24/08 (**60–90 giây/video, tối đa 3 video/buổi**) **không còn dùng được** cho buổi
thuyết trình — nó vẫn đúng cho ảnh/video sinh hoạt lớp thường ngày, nhưng chênh với yêu cầu mới **10 lần**.

**Ai gỡ:** chủ dự án — quyết định vận hành, không phải kỹ thuật.

**Ba hướng xử — ✅ CHỐT (a) ngày 27/08/2026:**

| Hướng | Nội dung | Cái mất |
|---|---|---|
| ✅ **(a)** — **ĐÃ CHỌN 27/08** | **Tách RIÊNG loại "video thuyết trình"**: không áp F-18 xem hết; duyệt **theo lô / theo xác suất**; đi **đường upload khác**, không nén client-side | Bước duyệt của loại này yếu hơn hẳn — phải nói rõ, và báo cáo F-30 **không được trộn** hai loại làm một |
| ~~**(b)**~~ | ~~Gộp thành MỘT video mỗi buổi thay vì 12~~ | ❌ **Loại** — mất khả năng gửi riêng video của từng em cho PH của em đó |
| ~~**(c)**~~ | ~~Giữ 12 video nhưng giới hạn 3–5 phút mỗi em~~ | ❌ **Loại** — không còn là "video full" như yêu cầu |

**Trạng thái sau 27/08:** nhánh **ảnh** đi được (chưa bao giờ bị chặn) · nhánh **video thuyết trình** có
**đường đi** (hướng a) nhưng **chưa hiện thực được** vì thiếu đặc tả thao tác duyệt (`OQ-F4b`) · nhánh
**video thường** vẫn chờ trần thời lượng (`OQ-F4a`).

---

### K-7. ~~Mâu thuẫn trong chính spec F-10 (`OQ-F2`)~~ — ✅ **ĐÃ GỠ 26/08/2026: chốt CÁCH ĐỌC B**

**Đã chốt:** lịch hiện **MỌI ngày có buổi học**, mỗi ngày mang **1 trong 4** trạng thái
(`Chưa duyệt` / `Đã duyệt` / `Phê duyệt trễ` / `Không có ảnh`). Cách đọc chặt theo câu chữ F-10 cũ ("chỉ
hiện ngày **có media chưa duyệt**") làm **F-14 không bao giờ render được** và F-31 mất 2 trạng thái — đã
loại.

**Việc còn lại:** **sửa câu chữ F-10 trong spec cho khớp**. Đừng để hai câu mâu thuẫn cùng tồn tại — đó
chính là thứ đã sinh ra kẹt này. PRD `docs/prd/F-media.md` §0b.3 + §6.2.2 và backlog Story 11 đã sửa.

**Mở được:** toàn bộ F.2 (trang duyệt QLCS) và bảng SLA F.4.

---

### K-8. ~~Bucket riêng cho media lớp~~ — ✅ **HẠ TẦNG XONG 26-27/08/2026**

> **Đã làm và đã kiểm:** bucket `satarobo-class-media` tồn tại · token R2 đã gồm nó (đo bằng
> `scripts/probe-r2-access.ts`) · **CORS đã đặt và kiểm từng origin** bằng preflight không cần token:
> `admin` / `giaovien` / `hocvien` / `test` / `localhost:3000` đều **CHO**; `satarobo.vn` **CHẶN**
> (không sao — site công khai không hiển thị media lớp); origin bịa **CHẶN** (xác nhận không phải
> luật `*` mở toang).
>
> ⚠️ **Biến `R2_CLASS_MEDIA_BUCKET_NAME` không xác minh lại được bằng `vercel env pull`** ở
> production/test vì chúng là biến **Sensitive** — pull trả chuỗi rỗng cho *mọi* biến loại đó, kể cả
> `R2_ACCOUNT_ID` vốn chắc chắn có giá trị. Xác minh bằng **hành vi thật sau khi deploy**, đừng tin
> `env pull`. Chi tiết + cách kiểm: `docs/runbook-bucket-media-lop.md`.
>
> Phần còn lại của K-8 là **việc của dev** (`getClassMediaBucket()`, nới `isOwnStorageUrl`), không
> còn là kẹt hạ tầng.

Nội dung gốc giữ lại làm lý lẽ:

**Kẹt vì:** quyết định đã có (tách ngay trong đợt F) nhưng **bucket chưa tồn tại**. Cần người có quyền
Cloudflare R2 và Vercel env.

**Gỡ thế nào — theo đúng thứ tự:**
1. Tạo bucket R2 mới, đặt **private** (không public access).
2. Thêm biến môi trường cho **cả 3** môi trường (Production / test / Development). ✅ **Chốt 26/08/2026:**
   tên biến **`R2_CLASS_MEDIA_BUCKET_NAME`**, tên bucket đề xuất **`satarobo-class-media`** — theo **đúng**
   khuôn `R2_CHAT_BUCKET_NAME` đã chạy thật (`lib/storage/chat-storage.ts:48-65`): đọc **thẳng**
   `process.env` (không qua `getR2Bucket()`), **fail CLOSED** khi trống, và **TỪ CHỐI** nếu trùng
   `R2_BUCKET_NAME` (bucket đang gắn `cdn.satarobo.vn`). ⚠️ Ghi biến vào `.env.example` là **việc của
   story F** — phiên viết tài liệu 26/08 **không** sửa `.env.example`.
3. Dev nới `isOwnStorageUrl` (`actions.ts:150-156`) để nhận **hai** bucket — hôm nay nó so với **một**
   `getR2PublicUrl()`.
4. Media **cũ** ở lại bucket công khai. Đó là di sản, dọn theo `OQ-F6` (đã chốt: story riêng).
5. Chỉ sau bước 3 mới được đổi `buildMediaObjectKey` — vì object key là thứ **không sửa rẻ** sau khi có
   dữ liệu.

---

### K-9. ~~Bốn câu **chỉ nằm trong `docs/backlog/F-media-stories.md`**~~ — ✅ **GỠ HẾT: bốn câu 26/08 + ba câu cuối 27/08/2026 (đủ cả nửa sau)**

**Bổ sung 27/08/2026 — ba câu cuối của backlog; hai nửa câu sinh buổi sáng đã đóng nốt buổi chiều:**

| Câu | Chốt 27/08/2026 | Việc kéo theo — **phải làm, không phải gợi ý** |
|---|---|---|
| `OQ-F7` (backlog) | **Đợt 1 ra mắt CHỈ ẢNH**, video ở đợt 2 — kèm nguyên văn *"nhưng cũng rất cần video sớm"* | 🔴 Hai lực kéo ngược nhau, xử bằng **lịch** chứ không bằng lời hứa: **đợt 2 phải SÁT đợt 1**, không để trôi thành "quý sau". Và **làm nhanh video là HAI phần việc khác nhau, đừng gộp một dòng backlog**: **(i)** video **thường** = nén client-side WebCodecs + validate 2 mức — chặn bởi Bước 0 của K-5 và `OQ-F4a`; **(ii)** video **thuyết trình** = **không** nén client-side, **đường upload khác chưa có tên** — chặn bởi `OQ-F4b`. **Xong (i) KHÔNG nghĩa là buổi 12/24/36/48 dùng được** |
| `OQ-F8` (backlog) | Người ký lệnh xoá theo retention: **Kiệt HOẶC Phúc** — `OQ-F8a` chốt chiều 27/08 là **MỘT TRONG HAI**; **Kiệt đã ký** | Bước duyệt của Story 18 pha 2 (bước **F.5**) là **MỘT chữ ký**, không phải hai ⇒ **bỏ** mặc định tạm "CẢ HAI" đặt buổi sáng. Một người vắng thì người kia ký được — đó chính là điều "một trong hai" mua được. 🔴 **Nhưng đừng đọc chữ ký hôm nay thành giấy phép vĩnh viễn:** mỗi lần chạy pha 2 vẫn phải gắn với **báo cáo dry-run của chính lần đó** (luật cứng #4). Bản ghi trách nhiệm lưu **ai** ký cho **lần chạy nào** — không có ô "đã được duyệt sẵn". Không có chữ ký cho lần đó thì pha 1 vẫn chỉ là báo cáo không ai đọc, đúng nỗi lo gốc của câu hỏi |
| `OQ-F9` (backlog) | **100%** phụ huynh đã ký văn bản đồng ý sử dụng hình ảnh · `OQ-F9a` chốt chiều 27/08: văn bản **KHÔNG có điều khoản rút lại** | Ẩn số **quy mô** đóng. **Việc kiểm kéo theo (theo dõi ở K-20):** đối chiếu con số **trên giấy** với số dòng `StudentConsent` `CLASS_MEDIA` `GRANTED` **trong DB** — DB mới là thứ chặn/mở việc gắn thẻ (`lib/lms/media-consent.ts:132`); hai con số **không tự khớp nhau**. 🔴 **`OQ-F9a` đóng câu hỏi nhưng KHÔNG đóng rủi ro.** Trong **mã**, đường rút đã có và đã chạy — `revokeMediaConsent` (`lib/lms/media-consent.ts:83`), C6.4 ẩn ngay media của em đó khỏi portal (`:144-151`) ⇒ **hệ thống cho PH nhiều hơn giấy hứa**, và **giữ nguyên đường đó** là lựa chọn đúng, đừng gỡ để "khớp văn bản". Hai chỗ hở còn nguyên: **(1)** ẩn khỏi portal ≠ **thu hồi** ảnh PH khác đã tải về — không đường mã nào lấy lại được; **(2)** nếu quy định dữ liệu cá nhân của trẻ đòi consent **phải rút được** bất kể giấy viết gì, thiếu điều khoản là **lỗ hổng của văn bản**. Cả hai thuộc **pháp chế**, không thuộc Dev ⇒ **B3 + B4 của Go/No-Go vẫn ĐỎ** |

**Bốn câu chốt 26/08/2026:**

| Câu | Chốt | Việc kéo theo — **phải làm, không phải gợi ý** |
|---|---|---|
| `OQ-F4` (backlog) | Ảnh **không thuộc học bạ nào**: giữ **3 THÁNG** rồi áp vòng đời xoá | Story 18 có **hai** mốc `retentionDueAt`: **12 tháng** (ảnh gắn học bạ) và **3 tháng** (ảnh không gắn). Đóng luôn rủi ro "kho phình vô hạn" |
| `OQ-F2` (backlog) | **Ân hạn 30 NGÀY**; **admin và QLCS** được khôi phục | Story 4: `purgeAfterAt = now + 30 ngày`; Thùng rác mở cho đúng hai nhóm này, PH/GV không có đường nào xem lại |
| `OQ-F5` (backlog) | Ảnh **bị từ chối** **VÀO ÂN HẠN**, không xoá ngay | ⚠️ **Ngược câu chữ F-15** ("từ chối là xoá khỏi R2") ⇒ **sửa spec F-15**. 🔴 **Đánh đổi đã biết:** ảnh bị từ chối thường là ảnh **có vấn đề** (lộ mặt trẻ chưa có consent) — giữ thêm 30 ngày trên storage là **rủi ro có thật**; đổi lại là có **đường khiếu nại** khi bấm nhầm "X lớn" |
| `OQ-F6` (backlog) | **GIỮ NGUYÊN** — người có quyền duyệt tự upload vào thẳng `APPROVED` | 🔴 SLA F-30 từ đây có **đường tắt hợp lệ** (tự up ảnh thay GV) ⇒ báo cáo **BẮT BUỘC tách nhãn "tự duyệt" khỏi "đã duyệt"** và đếm hai nhóm riêng (Story 17). Không tách thì con số SLA **tự khen**, và càng bị đo thì đường tắt càng được dùng |

⚠️ **Mã `OQ-Fx` trùng giữa hai tài liệu F** — bảng ánh xạ nằm ở đầu phần Open Questions của file backlog.
Khi trả lời, vẫn phải ghi rõ "OQ-F4 **của backlog**" hay "**của PRD**": hai câu `OQ-F4` này khác hẳn nhau —
backlog = ảnh không thuộc học bạ (**đã đóng**), PRD = trần thời lượng video (**27/08 gỡ thế bí bằng hướng (a),
còn hai tham số `OQ-F4a` + `OQ-F4b`**, K-6).

---

### K-20. Consent: **"100% đã ký" là trên GIẤY — DB có thể không có dòng nào** — 🟠 **KẸT MỚI, sinh 27/08/2026**

**Nguồn:** `OQ-F9` (backlog) chốt 27/08/2026 — **100% phụ huynh đã ký** văn bản đồng ý dùng hình ảnh.
Đó là câu trả lời tốt, nhưng nó **không** nói gì về dữ liệu trong hệ thống.

**Kẹt vì — đo được trong mã, không phải suy đoán:**

1. Dòng `StudentConsent` chỉ sinh khi người convert lead **tick ô** `consentMedia`
   (`lib/crm/convert-lead-v2.ts:308`, upsert ở `:314-319`). Học viên vào hệ thống bằng **đường khác**
   (import Excel, tạo tay) **không có dòng nào**.
2. Đường đọc lại **fail-closed**: `getNonConsentStudents` (`lib/lms/media-consent.ts:109-129`) coi mọi học
   viên **không có dòng GRANTED** là *chưa có consent*, và `hasMediaConsent` (`:96-103`) cũng vậy.
3. ⇒ **Giấy đủ 100% mà DB thiếu thì kết quả là: chặn tag đúng những em ĐÃ ký.** Ngày mở kho ảnh, màn GV
   đầy cảnh báo "chưa có consent" cho những em thật ra đã có văn bản — và không lỗi nào giải thích vì sao.

**Ai gỡ:** Lead + vận hành (đếm và cấp bù), Dev (viết truy vấn đếm).

**Gỡ thế nào:**
1. Đếm học viên đang học **không có** `StudentConsent` GRANTED type `CLASS_MEDIA` — cùng cách đọc mà
   `getNonConsentStudents` dùng, để con số khớp đúng thứ GV sẽ thấy.
2. Cấp bù dòng consent cho nhóm đó **trước khi bật F** — đường cấp **đã có sẵn**, không phải viết mới:
   `grantMediaConsent` (`lib/lms/media-consent.ts:78`) hoặc `setMediaConsent` (`:88`), cả hai nhận
   `ConsentAuditOpts` nên giữ được vết ai xác nhận.
3. ⚠️ **Không lật consent đã `REVOKED`** — mã convert **cố ý** không lật (`convert-lead-v2.ts:305-314`),
   script cấp bù phải giữ đúng nguyên tắc đó.

⚠️ **Cùng lúc, `OQ-F9` còn NỬA CÂU chưa trả lời: điều khoản RÚT LẠI.** DB đã đỡ được việc rút
(`StudentConsent.revokedAt` + `ConsentStatus` — `prisma/schema.prisma:1000-1011`), nhưng **văn bản** có
điều khoản rút hay không là câu của Pháp chế ⇒ **PL-2 và PL-3 vẫn treo**.

**Gỡ xong mở được:** Story 1 của F đi mà không kéo theo một đợt "vì sao ảnh con tôi không lên" ngay tuần đầu.

---

## 3. Khu vực G (Sprint 9 → 10)

### K-10. ~~Danh mục **nguồn lead** (`OQ-G6` nửa sau)~~ — ✅ **ĐÃ GỠ 27/08/2026: DUYỆT ĐÚNG 8 MÃ**

> ✅ **Chốt 27/08/2026:** vận hành duyệt **nguyên đề xuất 8 mã**, **kể cả cả hai chỗ suy đoán từ tên** —
> `Form` + `lien-he` gộp vào `WEBSITE`, và `Nguồn từ Marketing Hội Sở từ Quảng Cáo` gộp vào `ADS`.
> ⇒ **seed `LeadSource` hết chặn; NC-3 đóng.**
>
> 🔴 **Hệ quả đã biết và chấp nhận:** gộp `ADS` xong thì **không tách ngược được** — hệ thống mất khả năng
> phân biệt *quảng cáo Hội sở chạy* với *quảng cáo cơ sở chạy*. Cần phân biệt về sau ⇒ phải **thêm mã mới**
> (`ADS_HO`/`ADS_CS`) và **phân loại lại bằng tay** từ đầu, không có đường tự động.
>
> **Ba lưu ý khi seed vẫn giữ nguyên:** (a) đây là ảnh chụp 26/08, ngày chạy migration **đếm lại**, giá trị
> lạ mới rơi vào `KHAC`; (b) `Nhập tay` là **mặc định của mã** (`actions.ts:645`, `:673`), không phải người
> dùng chọn; (c) bộ lọc hiện dùng `contains` (`page.tsx:119`), sau khi có `sourceId` phải đổi sang khớp `code`.
>
> *Phần dưới giữ lại làm nguồn số — đó là dữ liệu 129 lead thật đã đo trên prod.*

**Kẹt vì:** `Lead.source` hiện là **String tự do**. Không có danh mục thì không có đích để map, và
`LeadSource` seed rỗng ⇒ người dùng mở dropdown ra thấy trống.

**Ai gỡ:** vận hành + marketing.

✅ **26/08/2026 — bước "đo dữ liệu" ĐÃ XONG.** Truy vấn dưới đã chạy trên prod, kết quả **129 lead**:

```sql
SELECT source, count(*) AS so_lead
FROM "Lead"
WHERE "deletedAt" IS NULL AND source IS NOT NULL AND btrim(source) <> ''
GROUP BY source ORDER BY so_lead DESC LIMIT 40;
```

`Ads` 38 · `sale-form` 32 · `quatang` 13 · `Khác` 13 · `Giới thiệu` 12 ·
`Nguồn từ Marketing Hội Sở từ Quảng Cáo` 6 · `Form` 5 · `Website` 3 · `Organic` 3 · `lien-he` 2 ·
`Nhập tay` 1 · `Import Excel ĐK` 1.

💡 **Đề xuất 8 mã** (bảng đầy đủ: `docs/plan/cau-hoi-can-quyet.md` câu 15 · `docs/prd/G-lead.md` §6.6.a):
`ADS` **44** · `SALE_FORM` **32** · `QUATANG` **13** · `KHAC` **13** · `GIOI_THIEU` **12** ·
`WEBSITE` **10** · `ORGANIC` **3** · `NHAP_TAY` **2**.

**Việc còn lại của người gỡ — chỉ còn duyệt, không phải nghĩ từ đầu:**
1. Xác nhận hoặc bác **hai chỗ suy đoán từ tên**: gộp `Form`+`lien-he` vào `WEBSITE`; gộp
   `Nguồn từ Marketing Hội Sở từ Quảng Cáo` vào `ADS`. 🔴 Marketing cần phân biệt *quảng cáo Hội sở chạy*
   với *quảng cáo cơ sở chạy* thì **phải tách thành 2 mã trước khi map** — gộp rồi không tách ngược được.
2. Chốt `label` hiển thị cho từng mã.
3. Ngày chạy migration **đếm lại** (lead mới vẫn chảy vào với `source` tự do); giá trị lạ mới rơi vào `KHAC`.

**Lưu ý (không đổi):** phần migration của G **không** bị chặn bởi câu này — bảng `LeadSource` tạo được
ngay, chỉ có **seed giá trị** là phải chờ. Đừng để câu này chặn cả G.

### K-11. ~~Bốn~~ ~~Một~~ **Không còn** câu nào chặn G — ✅ **ĐÓNG HẲN 27/08/2026**

| Câu | Chặn cái gì | Trạng thái |
|---|---|---|
| ~~`OQ-G4` **vế còn lại**~~ | ~~Suy diễn `Lead.status = LOST` chạy ở đâu — chặn C-02~~ | ✅ **Đóng 27/08/2026: (a) RESOLVER LÚC ĐỌC.** Không ghi DB, không cron, không trigger ⇒ **trách nhiệm số liệu thuộc Dev** (một hàm, sai một chỗ, sửa một chỗ). Việc kèm: rà **toàn bộ** chỗ đọc `Lead.status` trần bắt đi qua **một** helper; test khoá **cả chiều gỡ** một con khỏi `LOST` (lead phải tự hết `LOST` ngay lần đọc kế); 🔴 **cấm** mọi cron/trigger đồng bộ hai enum — viết là vi phạm luật cứng Nền Hệ thống #8. ⇒ **C-02 hết chặn** |

🔴 **Chỗ khó nhất của phương án (a) — 5 điểm gộp/lọc NGAY TRONG SQL mà resolver không với tới.** Helper chỉ
phủ được đường đọc qua app; những chỗ dưới đây `groupBy`/lọc thẳng trên cột nên sẽ thấy **giá trị cũ**, và
**không ném exception nào** — hai màn nói hai số trong im lặng. Danh sách `file:dòng` (nguồn:
`docs/prd/G-lead.md` §6.5.a + §0c.1):

| # | Chỗ đọc thẳng cột |
|---|---|
| 1 | `app/(admin)/admin/crm/page.tsx:51-55` — `sdb.lead.groupBy({ by: ["status"] })` (và `:66-68` lọc thẳng `status: "ENROLLED"`) |
| 2 | `app/(admin)/admin/dashboard/_components/manager-dashboard.tsx:90` — `groupBy({ by: ["status"] })` |
| 3 | `app/(admin)/admin/dashboard/_components/sales-dashboard.tsx:24` — `groupBy({ by: ["status"] })` (và `:26` lọc thẳng `status: "ENROLLED"`) |
| 4 | `app/(admin)/admin/marketing/page.tsx:66-70` — `sdb.lead.groupBy({ by: ['status'] })` |
| 5 | `lib/lead/auto-assign.ts:125` — `db.lead.groupBy({ by: ["assignedToId", "status"] })` |

⇒ Việc này thuộc **C-02**, không sinh bước mới cho G. Đây là **cái giá đã biết trước** của (a) — chọn (a)
là chấp nhận trả nó một lần, thay vì trả mãi mãi cho việc đối soát của (b).
| ~~`OQ-G9`~~ | ~~Có cần 2 cột *ngày học thử* + *kết quả* trên `LeadChild` không~~ | ✅ **Đóng 27/08/2026: KHÔNG có ca hẹn riêng** — mọi buổi học thử đều đi qua lớp học thử trong hệ thống ⇒ **không thêm cột nào**; `LeadTrialHistory` (gắn cứng `trialClassId`) vẫn đủ. ⚠️ **Ràng buộc phải giữ:** quyết định chỉ đúng khi **lệ đó còn được giữ** — ngày nào Sale hẹn riêng một buổi ngoài lịch thì buổi đó **không có chỗ nào ghi** và báo cáo học thử **thủng im lặng**. Đổi cách làm việc thì mở lại câu này trước |
| ~~`OQ-G5`~~ | ~~Trần số con của một lead~~ | ✅ **Đóng 26/08/2026:** đo prod ⇒ nhiều nhất **2 con** ⇒ **không đặt trần**; bảng con render thẳng, thiết kế cho 2–3 dòng. ⚠️ `2` là số **đo được hôm nay**, không phải giới hạn — đừng hardcode |
| ~~`OQ-G10`~~ | ~~Nguồn sự thật cho lịch sử chuyển sale~~ | ✅ **Đóng 26/08/2026: `LeadAssignmentHistory`.** Kèm việc phải làm: vá `lib/lead/assign.ts` + `lib/lead/auto-assign.ts` ghi vào bảng đó **trong cùng transaction** với lần đổi `assignedToId` (hôm nay hai đường này không ghi bảng nào); `LeadTransfer` + `LeadActivity/HANDOVER` thành đọc-only |

---

## 4. Khu vực C (Sprint 11 → 12) — ✅ **HẾT KẸT 27/08/2026**

**K-1 đã gỡ** (`§C.6.9` chạy trên prod 26/08 — lệch 1 lead: 76 → 75) **và cả bốn câu C đã chốt 27/08.**
Ba câu theo đúng đề xuất; **một câu đi ngược**: `OQ-C9`.

| Câu | Chốt gì (27/08) | Việc kéo theo — thứ dễ quên nhất |
|---|---|---|
| ~~`OQ-C2`~~ | **KHÔNG loại** `DUPLICATE` khỏi mẫu số — **hiện số `DUPLICATE` riêng** ngay cạnh | Quyết định có **hai vế**. C3 phải trả thêm `duplicateCount` và tab C **phải hiện nó**; làm mỗi vế "không loại" là hỏng đúng nửa. `crm/page.tsx:91` đang **loại** (`if (g.status !== "DUPLICATE") nonDuplicate += c`) ⇒ nằm trong 5 màn của `OQ-C9` |
| ~~`OQ-C4`~~ | `CALL · MESSAGE · NOTE · EMAIL` **và** `actorId IS NOT NULL` | Loại `STATUS_CHANGE`/`HANDOVER` là **luật**, không phải mặc định kỹ thuật: tính vào thì Sale **reset được đồng hồ mà không gọi khách**. ⚠️ `lastActivityAt` **NULL 100%** trên prod ⇒ C5 buộc dùng **biến thể A** (`LATERAL` đọc thẳng `LeadActivity`); backfill cột là **việc riêng** |
| ~~`OQ-C8`~~ | Tỷ lệ thành công tính theo **LỨA** | Hai vế cùng tập người ⇒ không vượt 100%. Đổi lại **bẫy B1 của §C.6.3 thành phần bắt buộc của UI**: lứa gần nhất **luôn thấp** vì chưa chín ⇒ phải có nhãn *"tính theo lứa vào hệ thống"* **và** số của lứa đã đủ N ngày. Thiếu là tháng nào cũng phải đi giải thích |
| ~~`OQ-C9`~~ | 🔴 **SỬA** 5 màn cũ về công thức chuẩn — **ngược thân bài** | **ĐẢO Non-Goal 1 của C** ⇒ sửa luôn Non-Goal đó trong PRD, đừng để hai câu chọi nhau. Ba việc **đúng thứ tự, không đảo**: (1) đo mức lệch trước — phần tỷ lệ của 5 màn **chưa đo**, (2) **thông báo trước** cho người đang dùng số, (3) **ghi ngày đổi** để sau còn đối chiếu. 🔴 Đây là **việc THÊM vào phạm vi C**, chưa nằm trong ước lượng sprint (**V-10**) |

### K-21. `OQ-C9` — hết kẹt *quyết định*, còn kẹt **phép đo mà quyết định đòi phải có trước**

**Kẹt vì:** quyết định 27/08 đòi *"chạy §C.6.9 đo mức lệch **trước**"*. Lần chạy 26/08 chỉ đo được **một
trong ba lẽ** làm số nhảy ⇒ đem con số đó đi báo là **báo thiếu, và thiếu theo hướng trấn an**.

| Lẽ | Nội dung | Đo chưa |
|---|---|---|
| **L1** — định nghĩa "đã chốt" | `{ENROLLED, REGISTERED}` → chỉ `ENROLLED` | ✅ đo prod 26/08: 76 → 75 (**1 lead ≈ 1,3 %**) |
| **L2** — đơn vị đếm | lead (phụ huynh) → **học sinh** (`LeadChild`) | 🔴 **chưa đo được** — `LeadChild` chưa tồn tại, phải **sau G.2**. Prod đo được nhiều nhất **2 con/lead** ⇒ mẫu số phồng, tỷ lệ **tụt** |
| **L3** — mẫu số `DUPLICATE` | màn CRM thôi loại `DUPLICATE` (`OQ-C2`) | 🔴 chưa đo — đúng một câu `count(*)` |

**Ai gỡ:** Dev chạy đo (**sau G.2**) → chủ dự án duyệt câu chữ thông báo.

**Gỡ thế nào:**
1. Sau **G.2** (đã có `LeadChild`, `createdAt` chép từ `Lead.createdAt`): chạy lại §C.6.9 **mở rộng**, đo
   cả **L2** và **L3**, **cho từng màn trong năm màn** — năm màn có năm mẫu số khác nhau nên đổi khác nhau.
2. Ra bảng *"màn nào đổi từ số nào sang số nào"*, **không** gộp thành một con số chung.
3. **Thông báo TRƯỚC ngày deploy** cho QLCS · Sale · Marketing · BGĐ. ⚠️ **Không hứa chiều đổi** — đúng
   bài học của khu vực B ở §B.6.8: dự báo *"số sẽ tụt"* hoá ra **sai chiều**.
4. Sửa mã theo **một cửa** `lib/reports/lead-kpi.ts`. Vá tại chỗ từng file = năm bản sao mới của cùng một lỗi.
5. **Ghi ngày đổi** hai chỗ: `documentation/` (luật cứng #10) **và** tooltip *"công thức áp dụng từ
   dd/mm/yyyy"* ngay trên màn hình — thiếu chỗ thứ hai thì vài tháng sau không ai giải thích được bậc
   thang trên biểu đồ.

**Gỡ xong mở được:** bước **C.12** (mới, `CDB-dashboard.md` §C.8) — báo cáo tỷ lệ chốt lead còn **một** công thức.

📌 **Ba chỗ KHÔNG sửa, đừng "dọn cho sạch"** (`CDB-dashboard.md` §C.6.13 mục 2): `crL2L3` của trang funnel
(**chết cùng trang** — `OQ-D9`, xem K-13) · `computeCloseRate` (`lib/lead/assign-strategy.ts:15` — là
**thuật toán chia lead**, sửa nó là đổi cách chia lead cho Sale) · tỷ lệ học thử
(`lib/reports/trial.ts:196` — metric khác hẳn). ⇒ ngay sau C.12 hệ thống còn **2** con số chứ chưa phải 1;
về hẳn 1 vào ngày trang funnel bị bỏ.

⚠️ **Thứ tự cứng:** C.12 chạy **sau C.7** (tab C đã lên) **và sau G.2**. Sửa trước G.2 là không làm được —
chưa có `LeadChild` thì chưa có công thức chuẩn để chuyển sang.

---

## 5. Khu vực D (Sprint 13 → 15)

> **Sau 27/08 còn kẹt đúng HAI thứ, và chúng KHÁC LOẠI nhau — đừng gộp làm một.**
>
> | Kẹt | Loại | Chặn tới đâu |
> |---|---|---|
> | **K-12** — `OQ-D4` (loại token Meta + hạn) | **Quyết định chưa có** — chủ dự án đang chờ hướng dẫn lấy token | 🔴 Chặn **D.5** (bật job) ⇒ chặn cả nhánh D |
> | `OQ-D3` **nửa sau** — danh sách ad account id (xem **K-13**) | **Dữ liệu chưa có** — không ai phải quyết, chỉ là chưa chép ra | 🟠 Chặn **khâu gọi Meta thật**. **Không** chặn D.2/D.3/D.4, không chặn phần code vòng lặp |
>
> Có danh sách id mà thiếu token thì vẫn không bật được job. Có token mà thiếu danh sách thì gọi được
> **một** tài khoản trong khi tiền nằm ở nhiều tài khoản — D1/D2/D3 **thiếu mà không báo lỗi**, đúng loại
> hỏng tệ nhất của khu vực D.

### K-12. `OQ-D4` — token Meta loại gì, hết hạn bao lâu — 🔴 **VẪN CHẶN CỨNG cả nhánh D (27/08/2026)**

> ⏳ **Đợt trả lời cuối 27/08/2026 KHÔNG đóng được câu này** — chủ dự án **đang chờ hướng dẫn cách lấy
> token**. Đây là **câu duy nhất trong bộ PRD chưa có câu trả lời**. `OQ-D3` (nhiều ad account) đã chốt
> nhưng **không thay thế được**: có danh sách id mà không có token vẫn không gọi được Meta.
>
> **Manh mối đo được, để trả lời cho nhanh:** mã hôm nay đọc `META_PAGE_ACCESS_TOKEN`
> (`lib/crm/ads-insights.ts:84`; `:85` là dòng đọc `META_AD_ACCOUNT_ID`) — **tên biến gợi ý Page token**, tức loại gắn với **một người** và hạn ngắn.
> Nếu đúng vậy thì chỉ cần một câu trả lời: *"đang dùng Page token"* → đi thẳng bước 2 dưới đây.

**Kẹt vì:** hôm nay **không có cơ chế refresh nào** cho Meta (`vercel.json` chỉ có `zalo-token-refresh`).
Token hết hạn ⇒ **job chết im**, không ai biết cho tới khi ai đó hỏi "sao số quảng cáo không nhảy".

**Ai gỡ:** người quản trị Meta Business (Trưởng Marketing) + Dev.

**Gỡ thế nào:**
1. Vào Meta Business Settings → xem token đang dùng thuộc loại nào: **Page token** / **System User
   token** / **long-lived User token**.
2. Khuyến nghị mạnh: chuyển sang **System User token** — nó **không gắn với một người**, nên nhân sự
   nghỉ việc không làm chết job, và hạn dài hơn hẳn.
3. Ghi lại **ngày hết hạn** vào runbook + đặt nhắc trước hạn 14 ngày.
4. Nếu vẫn dùng token có hạn ngắn: Dev thêm cron `meta-token-refresh` theo khuôn `zalo-token-refresh`.
   ⚠️ Nhớ bài học Zalo trong CLAUDE.md: **token xoay vòng thì không được nhân bản sang môi trường thứ
   hai** — hai môi trường sẽ giết token của nhau.

**Gỡ xong mở được:** D.4 → D.5 → toàn bộ tab D.

### K-13. ~~Ba~~ **Bốn** câu D còn lại — ✅ **ĐÓNG 27/08/2026**, riêng `OQ-D3` còn **nửa câu**

| Câu | Chốt gì (27/08) | Việc kéo theo — thứ dễ quên nhất |
|---|---|---|
| ⚠️ `OQ-D3` | **NHIỀU** ad account (không phải một) | `syncMetaAds` đang đọc **một** `META_AD_ACCOUNT_ID` (`lib/crm/ads-insights.ts:85`, khai ở `.env.example:81`) ⇒ đổi thành **danh sách**; **lưu `accountId` trên từng dòng** số liệu; `AdsSyncRun` ghi kết quả **theo từng account** — một tài khoản chết mà job vẫn báo "xong" đúng là loại hỏng im lặng mà D-08 sinh ra để bắt. ⏳ **CÒN NỬA CÂU: chưa có danh sách id.** Code được ngay phần cấu hình + vòng lặp; **không** code được khâu gọi Meta thật. Người gỡ: Marketing, mở Ads Manager chép các `act_…` đang tiêu tiền |
| ~~`OQ-D5`~~ | **KHÔNG** — chỉ Hội sở sửa được mapping D-07 | `canEditAds` (`lib/crm/ads-insights.ts:44-49`) **giữ nguyên**, không nới vai nào. Lý do ghi lại để sau còn truy: **gán campaign cho CS1 là lấy tiền khỏi CS2**. 📌 Nợ **không** được đóng bởi câu này: `canEditAds` so `roleCode` bằng tay ⇒ vi phạm luật cứng Nền Hệ thống #1 |
| ~~`OQ-D7`~~ | **CÓ** chốt sổ chi phí quảng cáo theo tháng | Trùng `OQ-B8` (chốt 26/08) ⇒ **một cơ chế duy nhất, không đẻ cơ chế thứ hai**. Cần `AdsSpendLocked` (§D.6.1); **job D-01 phải hỏi kỳ khoá TRƯỚC khi ghi** — sót đúng đường này thì sổ khoá vô nghĩa; sửa mapping sau khi chốt **không được đổi số quá khứ** |
| ~~`OQ-D8`~~ | Chi phí ngoài Meta đi qua **bảng chi phí của B** | Nhóm `MARKETING_OFFLINE` của `OQ-B4` là chỗ đón tờ rơi/sự kiện/KOL. **KHÔNG** nhét vào bảng ads — nhét là **B3 trừ hai lần**. Ràng buộc song sinh: đầu phí `ADS` **không nhập tay** phần đã lấy từ job D-01, và câu đó phải in **trên template + màn nhập** |
| ~~`OQ-D9`~~ | `/admin/marketing/funnel`: **không sửa, treo banner, BỎ HẲN** sau khi tab D chạy ổn | Non-Goal 5 giữ nguyên **và có thêm đích kết thúc**. D-00-2 đổi tư cách: từ "cảnh báo tạm" thành **bước 1 khai tử trang** ⇒ (1) banner nói rõ trang **sắp bỏ** + chỉ sang tab D, (2) **đặt mốc rà lại** để bấm nút bỏ — không đặt mốc thì "hai trang nói hai số" sống mãi. Bỏ trang = xoá route **và** rà mọi link trỏ tới nó |

---

## 6. Khu vực B (Sprint 15 → 18) — ✅ **HẾT KẸT 26/08/2026**

**K-1 đã gỡ** (§B.6.8 chạy trên prod 26/08) **và cả sáu câu B đã chốt cùng ngày** — chủ dự án trả lời
*"làm theo đề xuất"*, tức đúng phương án PRD khuyến nghị. Nguồn: `docs/plan/cau-hoi-can-quyet.md`
§"Quyết định của chủ dự án — chốt 26/08/2026 (khu vực B + khu vực E)"; chi tiết + hệ quả ở
`docs/prd/CDB-dashboard.md` §QĐ-2 và §B.7.

| Câu | Chốt gì (26/08) | Việc kéo theo — thứ dễ quên nhất |
|---|---|---|
| `OQ-B2` | Bản `ADJUSTED` **mới nhất** thắng | Không chỉ sửa đường đọc: **chặn điều chỉnh chồng ngay ở `adjustPayment`**. Prod đo được **0 dòng** ⇒ chặn bây giờ là một việc, để sau là hai (vừa chặn vừa gỡ dữ liệu cũ). Và 0 dòng nghĩa là **test phải tự dựng fixture** |
| `OQ-B3` | "Dòng tiền" = **thu ghi nhận** (B1 − B2) | **Bảng đối soát 3 lớp tiền** là phần bắt buộc của quyết định. Lớp "ngân hàng" phụ thuộc webhook SePay/payOS ⇒ **chỉ smoke được trên prod** |
| `OQ-B4` | 6 nhóm `ADS · RENT · SALARY · UTILITY · MARKETING_OFFLINE · OTHER` | Seed vào **bảng** `CostCategory`, không enum. ⚠️ `ADS` chồng nguồn với D1 ⇒ ghi rõ trên template "không nhập tay quảng cáo đã lấy từ job D-01", kẻo **trừ hai lần** |
| `OQ-B6` | Chi phí cấp công ty **không phân bổ** ở v1 | Tổng các cơ sở **≠** toàn hệ thống — cố ý, nhưng phải **hiện dòng riêng** kèm dòng tổng, không thì người đọc tưởng cộng sai. Khai `nullMeaning: "NULL_TOAN_HE_THONG"` |
| `OQ-B7` | **Phải duyệt** (`APPROVED`) mới vào báo cáo | Tách `costs:manage` / `costs:approve` là **chưa đủ**: người giữ cả hai vai vẫn tự duyệt ⇒ chặn `approvedById === createdById`. Phiếu `PENDING` làm lợi nhuận **cao giả** ⇒ hiện số phiếu chờ duyệt cạnh B2 |
| `OQ-B8` | **CÓ** đóng sổ theo tháng | Additive, làm sau được — nhưng **mọi** đường ghi `CostEntry` **và job D-01** đều phải tôn trọng kỳ khoá; sót một đường là sổ khoá vô nghĩa. **Kéo theo `OQ-D7`** |

🟠 **Việc còn lại của B không phải là quyết định, mà là truyền thông.** §B.6.8 đo kỳ `2026-08` cho thấy
nguồn `Order` **mù hẳn** (`def_b_order` = **0 đ** trong khi tiền thật `def_a_payment` = **3.686.000 đ**)
⇒ câu "số doanh thu và ROAS sẽ **tụt**" trong bản trước là **sai chiều** với hai màn dùng nguồn `Order`.
Phải soạn lại thông báo cho kế toán + marketing theo hướng **"số đổi mạnh, chiều đổi khác nhau tuỳ màn"**.

---

## 7. Khu vực E (Sprint 12 → 15) — ✅ **HẾT KẸT: 4/4 câu đã chốt (26/08 + 27/08/2026)**

Chủ dự án trả lời *"khu vực E làm theo đề xuất"* ⇒ ba câu chặn cứng đóng **đúng khuyến nghị của PRD**.
Nguồn: `docs/plan/cau-hoi-can-quyet.md` §"Quyết định của chủ dự án — chốt 26/08/2026 (khu vực B + khu
vực E)"; chi tiết ở `docs/prd/E-tuong-tac.md` §0 và §7. **E-01/E-02/E-04 nay chạy được.**

✅ **27/08/2026 — `OQ-7` chốt KHÔNG** (E-03 không lên site giáo viên) ⇒ **E-03 cũng chạy được. Khu vực E
hết câu hỏi mở, mục 7 này không còn việc gỡ nào.**

### K-14. ~~`OQ-1` — định nghĩa "PH đã tương tác"~~ — ✅ **ĐÃ CHỐT 26/08/2026: phương án (A)**

**Chốt:** "PH đã tương tác" = PH đã **gửi ≥ 1 tin** trong khoảng ngày. Câu con: **CÓ** tính kênh 1-1.
Lý do giữ nguyên: chỉ (A) đo đúng **khoảng thời gian** — `lastReadAt`/`lastLoginAt` là **vô hướng, bị
ghi đè**.

**Bốn thứ kéo theo, đừng bỏ sót:**
1. 🔴 **KHÔNG lọc phạm vi qua `Conversation.centerId`** — DM luôn `centerId = null` (`lib/chat/dm.ts:623`)
   nên lọc kiểu đó **rơi sạch** kênh 1-1, đúng kênh PH tương tác thật. Trục cách ly là **cơ sở của
   enrollment**.
2. **`OQ-8` (index `Message(senderId, createdAt)`) thành bắt buộc**, không còn là "nếu chọn (A)".
3. Tử số là phép **đếm** — không đi qua `assertActiveParticipant`, đổi lại **không được** trả ra một chữ
   nội dung tin nào.
4. **Khử trùng theo `parentUserId`**: một PH nhắn 50 tin vẫn là **1**, khớp cách đếm của mẫu số.

### K-15. ~~`OQ-2` — mẫu số lọc `Enrollment.status` nào~~ — ✅ **ĐÃ CHỐT 26/08/2026**

**Chốt:** dùng đúng hằng `ENROLLMENT_ACTIVE_STATUS_LIST` (`lib/enrollment-status.ts:17`) =
`ACTIVE · CONFIRMED · STUDYING · PAUSED` ⇒ **`PAUSED` CÓ tính**, **`COMPLETED` KHÔNG tính**.
**Kéo theo:** dùng **hằng có sẵn**, không chép danh sách trạng thái sang file mới (bản sao thứ hai là
nguồn của lệch); mẫu số khớp **sĩ số mà điểm danh đang dùng** nên hai màn đối chiếu được; PH có con vừa
học xong khoá mà chưa ghi danh khoá mới **rơi khỏi mẫu số** ⇒ tỉ lệ nhích lên ở kỳ nhiều lớp kết thúc —
đúng định nghĩa, nhưng phải nói trước với người đọc số.

### K-16. ~~`OQ-3` — QLCS bấm vào kênh 1-1 thì xảy ra gì~~ — ✅ **ĐÃ CHỐT 26/08/2026: (a) P0 · (b) P2 · (c) LOẠI**

**Chốt:** **(a)** dropdown E-04 chỉ liệt kê hội thoại người xem **là participant còn hiệu lực** (QLCS ⇒
chỉ nhóm lớp), mục 1-1 **hiện mờ kèm lý do** chứ không ẩn · **(b)** ở P2, **chỉ `SUPER_ADMIN`** mở được
1-1 qua `adminLookupConversationAction` — `reason` bắt buộc + audit ghi **trước** khi đọc, và là **màn
tra cứu chỉ-đọc** · **(c)** thêm `DmKind`/mở `DM_STAFF` cho QLCS: **LOẠI**.
🔴 **Luật cứng:** **tuyệt đối không nới `assertActiveParticipant`** — không cờ, không tham số bỏ qua.
`CENTER_MANAGER` **cố ý không** có `chat:admin` (`prisma/seed-roles.ts:545`) ⇒ (b) không mở cho QLCS kể
cả ở P2.

### K-17. ~~`OQ-7` — E-03 có lên site giáo viên không~~ — ✅ **GỠ 27/08/2026: KHÔNG**

✅ **Chốt 27/08/2026: KHÔNG — E-03 KHÔNG xuất hiện trên site giáo viên**, chỉ sống trên admin.

**Hệ quả — ghi rõ để sau này không ai mở lại:**
- **Phạm vi test PII KHÔNG rộng thêm một site**: không thêm bề mặt `app/(teacher)/**`, không thêm ca
  "GV mở E-03 không thấy SĐT". Bộ test PII của E **giữ nguyên**.
- **`canViewParentContact` giữ nguyên** — không thêm, không bớt vai. `TEACHER` vẫn ngoài danh sách 4 vai
  `SUPER_ADMIN · CENTER_MANAGER · ACCOUNTANT · SALES_CSM` (`lib/auth/permissions.ts:957-962`, hàm `:965`),
  đúng chủ đích chống lộ SĐT toàn lớp (`:955-956`).
- ⚠️ Câu này **chỉ nói về E-03**, không phải luật chung. Muốn đưa một bảng có SĐT PH lên
  `app/(teacher)/**` sau này là **quyết định mới**, phải hỏi lại — không mượn được câu chốt này.

---

## 7b. K-18 — ~13 cổng GHI còn so `record.centerId === user.centerId` (nợ mở từ 26/08/2026)

**Không phải kẹt — là việc đã biết, chưa làm.** Đợt Sprint 1–2 dọn **5** cổng trên đường điểm
danh / chốt buổi / nhận xét / chấm năng lực. Cùng khuôn lỗi còn ở (đã grep thật):

`lib/eval/session-eval-actions.ts:51, :161` · `app/(admin)/admin/classes/_actions.ts:965` ·
`app/(admin)/admin/teachers/_actions.ts:36, :153, :243` ·
`app/(admin)/admin/cham-cong/checklist-co-so/_actions.ts:45` ·
`app/(admin)/admin/cham-cong/chinh-cong/_actions.ts:153, :232` ·
`app/(admin)/admin/leads/actions.ts:836` · `app/(teacher)/teacher/don-tu/_actions.ts:145` ·
`app/(teacher)/teacher/hoan-thanh/_actions.ts:131`.
Gate UI cùng bệnh: `cham-cong/checklist-co-so/page.tsx:51` · `teachers/[id]/page.tsx:65`.

**Triệu chứng chung:** QLCS giữ 2 cơ sở **xem** được cơ sở thứ hai nhưng **không thao tác** được
ở đó — và vì mỗi cổng hỏng riêng lẻ, người dùng gặp tường ở những chỗ ngẫu nhiên chứ không phải
một chỗ dễ đoán.

**Gỡ thế nào:** thay điều kiện bằng `roleManagesCenter(actor, "<VAI>", record.centerId)`
(`lib/auth/managed-centers.ts`) — khuôn đã dựng và đã có 39 test ở đợt này.
⚠️ **Đừng dùng `visibleCenterIds`**: vế đó nở theo vai kiêm nhiệm, người kiêm kế toán ở cơ sở
khác sẽ ghi được vào cơ sở họ chỉ có quyền xem. Đây là cái bẫy đã sập một lần trong chính đợt
này và chỉ vòng rà đối kháng mới bắt được.

⚠️ Còn một chỗ **hở ngược lại**: `classCenterVisible` (`assignments/_actions.ts:41-47`,
`exams/_actions.ts:87-93`) chỉ dùng `passesScope` một mình ⇒ một dòng `UserPermissionGrant`
ALLOW khớp tiền tố model sẽ bật "ALL" cho mọi cơ sở. Nên gom cả nhóm về **một** helper.

---

## 7c. K-19 — Vai "ma" của tài khoản đã xoá · ĐÃ DỌN TRÊN PROD 26/08/2026

**Phát hiện:** 10 dòng `UserOrgRole` `status = ACTIVE` thuộc về tài khoản **đã xoá mềm**, kéo dài từ
08/07/2026. Gồm cả một tài khoản đã xoá giữ `SUPER_ADMIN` tại HO.

**Không phải lỗ hổng đăng nhập** — `lib/auth.ts:157` chặn cả `deletedAt` lẫn `!isActive`, nên các
tài khoản đó không đăng nhập được và vai của họ không bao giờ thành quyền thật.

**Nhưng là rác dữ liệu có hậu quả:** mọi chỗ đếm/liệt kê nhân sự theo `UserOrgRole` mà **không join
`User.deletedAt`** đều tính nhầm người đã nghỉ — danh sách chọn GV, báo cáo hiệu suất GV, "ai là HR
của cơ sở", và các truy vấn chẩn đoán. ⚠️ Chính nó đã làm truy vấn `[A-01-Đ4]` (§6.9 của
`A-nen-tang.md`) trả về Đinh Thảo My và khiến người đọc kết luận sai rằng SL-01 đã nổ.

**Phân bố theo đợt nghỉ việc** — cho thấy đây là lỗi chạy đều, không phải ca lẻ:
08/07 (1) · 09/07 (1) · 22/07 (1) · 06/08 (5) · 20/08 (2).

**Đã chạy trên prod 26/08/2026** (người vận hành chạy tay, có bước dry-run trước):

```sql
UPDATE "UserOrgRole" uor
SET status = 'EXPIRED', "effectiveTo" = now()
FROM "User" u
WHERE u.id = uor."userId" AND u."deletedAt" IS NOT NULL AND uor.status = 'ACTIVE';
```

Hết hạn hoá chứ **không xoá cứng** — giữ vết để sau còn truy được ai từng giữ vai gì.
**Kết quả kiểm sau khi chạy: 0 dòng.** ✅

**Vá gốc:** `deleteUserAction` (`app/(admin)/admin/users/_actions.ts`) chỉ đặt `deletedAt` +
`isActive: false`, **không đụng `UserOrgRole`** ⇒ cứ xoá thêm một người là thêm vài dòng ma. Đang vá
kèm rào **chặn xoá khi còn lead/ghi danh đang gán** — vì màn `/admin/ban-giao-lead` lọc
`deletedAt: null` (`page.tsx:51`) nên **xoá trước là tự khoá mất đường bàn giao**.

⚠️ **Luật vận hành rút ra:** *vô hiệu hoá → bàn giao → rồi mới xoá.* Đảo thứ tự là mất đường lùi.

---

## 8. Thứ tự gỡ đề nghị — nếu chỉ làm được vài việc

1. ~~**K-1** (3 phép đo prod)~~ — ✅ **đã đo 26/08/2026.** Thay bằng **việc số 0 nó sinh ra**: khôi phục
   quyền cho Phan Thanh Toại · Lê Thị Phương Liên · Đinh Thảo My (xem K-1). Đây là **người đang đau
   trên prod**, không phải việc kế hoạch — nó đứng trước cả SL-01.
1b. **K-2** — chạy nốt truy vấn `thieu_buoi` **qua Supabase SQL Editor** (phiên làm việc không đọc được
   `DATABASE_URL` prod — biến Sensitive). Rẻ, chỉ đọc, và đang quyết định **hình dạng của F-04**.
2. **K-12** (token Meta) — 🔴 **việc gấp nhất còn lại sau 27/08**: nó là **câu duy nhất trong bộ PRD chưa có
   câu trả lời**, chặn cứng cả nhánh D, và là loại hỏng **im lặng** nên càng để lâu càng khó truy. Chủ dự án
   đang chờ hướng dẫn lấy token ⇒ việc trước mắt là **đưa hướng dẫn đó**, không phải chờ tiếp.
2b. **K-20** (đối chiếu consent giấy ↔ DB) — **mới sinh 27/08**, rẻ và chỉ đọc, nhưng phải làm **trước khi
   bật F**: không làm thì ngày mở kho ảnh GV thấy hàng loạt em "chưa có consent" dù đã ký đủ trên giấy.
3. ~~**K-14 → K-16** (ba câu E)~~ — ✅ **chốt 26/08/2026**. ~~Còn lại **K-17** (`OQ-7`)~~ — ✅ **chốt
   27/08/2026: KHÔNG** ⇒ **cả mục 7 hết việc gỡ**; phạm vi test PII giữ nguyên, không rộng thêm site nào.
4. ~~**K-6** (trần video) + **K-5** chọn đường (c)~~ → **K-5 đã gỡ 26/08** (client-side WebCodecs). Việc
   tiếp theo của F **không phải code mà là ĐO**: chạy **Bước 0** với 5–7 GV thật; dưới ~70% chạy được thì
   quay lại phương án server **trước** khi lỡ code sâu. ~~**K-6 vẫn treo**~~ → ✅ **gỡ một nửa 27/08: chốt
   hướng (a) — tách riêng loại "video thuyết trình"**; ~~còn treo đúng **trần thời lượng cho video
   THƯỜNG**~~ → **còn treo HAI tham số** (xem K-6): `OQ-F4a` trần thời lượng video **thường** ·
   `OQ-F4b` **"duyệt theo lô" là thao tác gì** ⇒ **cả hai nhánh video đều chưa hiện thực được**.
   ⇒ Thứ tự ra mắt đã rõ: **đợt 1 chỉ ẢNH** (`OQ-F7` chốt 27/08) — nhưng chủ dự án nói **cần video sớm**.
   ⚠️ ~~nên **cờ bật nhánh video phải sẵn từ đầu** (Bước 2 của K-5)~~ — **SỬA 27/08:** K-5 **Bước 2**
   nguyên văn (`:232`) là *"Bật nhánh video ở **ĐỢT 2** bằng cờ cấu hình · Đợt 1 vẫn chỉ ảnh"*, tức cờ là
   **cách bật ở đợt 2**, không phải thứ phải có từ đợt 1. Thứ **phải sẵn từ đầu** là **Bước 1** —
   interface `MediaTranscoder` + tầng validate ở server — để "đổi hiện thực không phải sửa call-site";
   đó mới là nghĩa của *"đừng dựng kiến trúc chỉ-ảnh rồi vá sau"*. Bản thân nhánh video vẫn đứng **sau
   Bước 0** (đo với 5–7 GV thật) và sau `OQ-F4a`/`OQ-F4b` — xem `docs/backlog/F-media-stories.md` §0c điều 1.
5. ~~**K-10** (danh mục nguồn lead)~~ — ✅ **gỡ 27/08/2026: duyệt 8 mã**, seed `LeadSource` hết chặn.
   Thay bằng **việc** nó để lại: xử hai chỗ gộp suy-đoán-từ-tên **trước khi seed** — nhất là `ADS`,
   vì gộp rồi **không tách ngược được**.
5b. ~~**K-11 câu `OQ-G4` vế "chạy ở đâu"**~~ — ✅ **chốt 27/08/2026: (a) resolver lúc đọc, trách nhiệm
   số liệu thuộc Dev.** Việc thay thế: viết **một** helper chung + xử **5 chỗ `groupBy(status)` gộp ngay
   trong SQL** (danh sách ở K-11). 🔴 **Cấm cron/trigger đồng bộ hai enum** — viết là (b) đi cửa sau.
6. ~~**K-3**~~ — đã gỡ: không phải nợ kỹ thuật, chỉ là Prisma Client chưa sinh. `pnpm typecheck` = **0 lỗi**.
