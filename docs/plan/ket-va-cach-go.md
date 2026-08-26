# Bảng kẹt & cách gỡ — Sprint 3 → 18

**Lập ngày 24/08/2026**, sau khi 12 câu chặn khởi công + 5 câu khu vực A + 12 câu kỹ thuật đã chốt.
**Cập nhật 26/08/2026:** K-1 (3 phép đo prod) **đã chạy thật** — xem K-1; K-2 đo **chưa đủ**.
Khu vực G chốt thêm: `OQ-G5` + `OQ-G10` **đóng**, `OQ-G4` đóng nửa, `OQ-G6` nửa sau có **đề xuất** —
xem K-10 + K-11.
Khu vực F chốt thêm: gỡ **K-5** (nén video → client-side WebCodecs), **K-7** (mâu thuẫn F-10 → cách đọc B),
**K-9** (cả 4 câu chỉ nằm trong backlog) và chốt tên biến bucket ở **K-8**. 🔴 **K-6 (trần thời lượng
video) VẪN KẸT — và khó hơn trước.**
Nguồn: `docs/plan/sprint-plan.md` (91 hạng mục) đối chiếu với `docs/plan/cau-hoi-can-quyet.md`.

> **Cách đọc:** mỗi mục ghi **kẹt vì gì · ai gỡ được · gỡ thế nào (từng bước) · gỡ xong mở được gì**.
> Mục nào không có ở đây nghĩa là **không kẹt** — cứ làm.

---

## 0. Trạng thái tổng

| Khu vực | Sprint | Chạy được ngay? |
|---|---|---|
| **A** — nền phạm vi & phân quyền | S1–S2 | ✅ Không kẹt, đang thực thi — nhưng phép đo 26/08 **chèn thêm một việc số 0**: 3 tài khoản có dấu vết hỏng trên prod (K-1) |
| **F** — kho media | S3–S8 | 🟠 **Đỡ hơn 26/08**: còn kẹt **1 câu** (K-6 — trần thời lượng video, chỉ chặn **nhánh video**) + **1 hạ tầng** (K-8 — bucket chưa tạo) + **K-2 đo chưa đủ**. Nhánh **ảnh** chạy được |
| **G** — module lead | S9–S10 | 🟠 **Cập nhật 26/08:** kẹt rút còn 3 câu, **không câu nào chặn migration**. Xem K-10 (seed `LeadSource`) + K-11 |
| **C** — tab kinh doanh | S11–S12 | 🟠 Kẹt 4 câu — ~~phép đo prod~~ **đã đo 26/08** |
| **D** — chi phí marketing | S13–S15 | 🔴 Kẹt 1 câu chặn cứng + creds |
| **B** — tài chính | S15–S18 | ✅ **Hết kẹt 26/08** — 6 câu đã chốt + §B.6.8 đã đo. Còn việc *soạn lại thông báo* cho kế toán/marketing (số đảo chiều) |
| **E** — tương tác KH | S12–S15 | 🟠 **3/4 câu chốt 26/08** ⇒ E-01/E-02/E-04 chạy được. Còn `OQ-7` — chỉ chặn **E-03** |

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
**Còn thiếu:** truy vấn đếm media ở **K-2** (chạy chưa đủ — xem dưới).

---

### K-2. Số media `classSessionId = null` trên prod (OQ-F5) — 🟠 **ĐO 26/08/2026 CHƯA ĐỦ, VẪN KẸT**

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

### K-6. Trần **thời lượng** video (PRD `OQ-F4`) — 🔴 **VẪN KẸT, và 26/08 khó hơn trước**

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

**Ba hướng xử — CHƯA CHỌN HƯỚNG NÀO:**

| Hướng | Nội dung | Cái mất |
|---|---|---|
| **(a)** | **Tách RIÊNG loại "video thuyết trình"**: không áp F-18 xem hết; duyệt **theo lô / theo xác suất**; đi **đường upload khác**, không nén client-side | Bước duyệt của loại này yếu hơn hẳn — phải nói rõ, và báo cáo F-30 **không được trộn** hai loại làm một |
| **(b)** | **Gộp thành MỘT video mỗi buổi** thay vì 12 | Mất khả năng gửi riêng video của từng em cho PH của em đó |
| **(c)** | **Giữ 12 video nhưng giới hạn 3–5 phút mỗi em** | Không còn là "video full" như yêu cầu |

**Chưa chọn ⇒ chưa bật nhánh video.** Nhánh **ảnh** của F **không bị chặn** bởi câu này.

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

### K-8. Bucket riêng cho media lớp — kẹt **hạ tầng**, không phải quyết định (đã chốt B8)

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

### K-9. ~~Bốn câu **chỉ nằm trong `docs/backlog/F-media-stories.md`**~~ — ✅ **ĐÃ GỠ CẢ BỐN 26/08/2026**

| Câu | Chốt | Việc kéo theo — **phải làm, không phải gợi ý** |
|---|---|---|
| `OQ-F4` (backlog) | Ảnh **không thuộc học bạ nào**: giữ **3 THÁNG** rồi áp vòng đời xoá | Story 18 có **hai** mốc `retentionDueAt`: **12 tháng** (ảnh gắn học bạ) và **3 tháng** (ảnh không gắn). Đóng luôn rủi ro "kho phình vô hạn" |
| `OQ-F2` (backlog) | **Ân hạn 30 NGÀY**; **admin và QLCS** được khôi phục | Story 4: `purgeAfterAt = now + 30 ngày`; Thùng rác mở cho đúng hai nhóm này, PH/GV không có đường nào xem lại |
| `OQ-F5` (backlog) | Ảnh **bị từ chối** **VÀO ÂN HẠN**, không xoá ngay | ⚠️ **Ngược câu chữ F-15** ("từ chối là xoá khỏi R2") ⇒ **sửa spec F-15**. 🔴 **Đánh đổi đã biết:** ảnh bị từ chối thường là ảnh **có vấn đề** (lộ mặt trẻ chưa có consent) — giữ thêm 30 ngày trên storage là **rủi ro có thật**; đổi lại là có **đường khiếu nại** khi bấm nhầm "X lớn" |
| `OQ-F6` (backlog) | **GIỮ NGUYÊN** — người có quyền duyệt tự upload vào thẳng `APPROVED` | 🔴 SLA F-30 từ đây có **đường tắt hợp lệ** (tự up ảnh thay GV) ⇒ báo cáo **BẮT BUỘC tách nhãn "tự duyệt" khỏi "đã duyệt"** và đếm hai nhóm riêng (Story 17). Không tách thì con số SLA **tự khen**, và càng bị đo thì đường tắt càng được dùng |

⚠️ **Mã `OQ-Fx` trùng giữa hai tài liệu F** — bảng ánh xạ nằm ở đầu phần Open Questions của file backlog.
Khi trả lời, vẫn phải ghi rõ "OQ-F4 **của backlog**" hay "**của PRD**": hai câu `OQ-F4` này khác hẳn nhau —
backlog = ảnh không thuộc học bạ (**đã đóng**), PRD = trần thời lượng video (**vẫn treo**, K-6).

---

## 3. Khu vực G (Sprint 9 → 10)

### K-10. Danh mục **nguồn lead** — ~~chưa có giá trị nào~~ → **đã đo, có đề xuất, chờ duyệt** (`OQ-G6` nửa sau) — 🟠 vẫn chặn seed `LeadSource`

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

### K-11. ~~Bốn~~ **Một** câu còn chặn tính năng lẻ của G (không chặn migration) — cập nhật 26/08/2026

| Câu | Chặn cái gì | Gỡ thế nào |
|---|---|---|
| `OQ-G4` **vế còn lại** | ⚠️ **Nửa đầu đã chốt 26/08: `Lead.status` CÓ tự chuyển `LOST`** (ngược đề xuất PRD). Còn chặn C-02: suy diễn đó **chạy ở đâu** | Chọn **(a) resolver lúc đọc** — khuyến nghị: không ghi DB, không cron, không bao giờ lệch; đổi lại mọi chỗ đọc `Lead.status` phải qua helper. Hoặc **(b) job ghi** — đọc thẳng cột, nhưng sinh dữ liệu và phải **chỉ đích danh người** đối soát. Không chỉ được người ⇒ không chọn (b) |
| `OQ-G9` | Có cần 2 cột *ngày học thử* + *kết quả* trên `LeadChild` không | 🔁 **Câu đã viết lại 26/08 vì bản cũ khó hiểu.** Hỏi Sale bằng tiếng Việt thường: *"Có ca nào GV/Sale hẹn riêng một buổi học thử cho một em — không tạo lớp, không có trong lịch hệ thống — rồi ghi kết quả vào đâu đó không?"* Không ⇒ bỏ qua. Có ⇒ thêm 2 cột (vì `LeadTrialHistory` gắn cứng `trialClassId`, không có lớp thì không ghi được) |
| ~~`OQ-G5`~~ | ~~Trần số con của một lead~~ | ✅ **Đóng 26/08/2026:** đo prod ⇒ nhiều nhất **2 con** ⇒ **không đặt trần**; bảng con render thẳng, thiết kế cho 2–3 dòng. ⚠️ `2` là số **đo được hôm nay**, không phải giới hạn — đừng hardcode |
| ~~`OQ-G10`~~ | ~~Nguồn sự thật cho lịch sử chuyển sale~~ | ✅ **Đóng 26/08/2026: `LeadAssignmentHistory`.** Kèm việc phải làm: vá `lib/lead/assign.ts` + `lib/lead/auto-assign.ts` ghi vào bảng đó **trong cùng transaction** với lần đổi `assignedToId` (hôm nay hai đường này không ghi bảng nào); `LeadTransfer` + `LeadActivity/HANDOVER` thành đọc-only |

---

## 4. Khu vực C (Sprint 11 → 12)

**Kẹt chính là K-1** (chưa đo `§C.6.9` trên prod). Định nghĩa đã chốt, nhưng chưa ai biết **số sẽ nhảy
bao nhiêu** khi đổi — mà không biết thì không báo trước cho người dùng được.

Bốn câu còn lại:

| Câu | Kẹt vì | Gỡ thế nào |
|---|---|---|
| `OQ-C2` | Lead `DUPLICATE` có bị loại khỏi mẫu số không — hai màn đang cho hai số (`crm/page.tsx:96` đang loại, PRD chọn không loại) | Quyết định nghiệp vụ một dòng. Gợi ý: **không loại** ở mẫu số tổng, nhưng hiện số `DUPLICATE` riêng cạnh đó để không ai nghi ngờ |
| `OQ-C4` | "Lần tiếp cận gần nhất" tính loại hoạt động nào | Chốt `CALL/MESSAGE/NOTE/EMAIL` **và** `actorId IS NOT NULL`. ⚠️ Nếu tính cả `STATUS_CHANGE` thì Sale **reset được đồng hồ mà không gọi khách** |
| `OQ-C8` | Tỷ lệ thành công theo **lứa** hay **kỳ chốt** | Lứa = hai vế cùng tập người, không bao giờ vượt 100%. Kỳ chốt dễ hiểu với BGĐ nhưng **có thể vượt 100%** và sẽ phải giải thích mỗi tháng |
| `OQ-C9` | 5 màn cũ có sửa về công thức chuẩn không | Để nguyên ⇒ hệ thống có **6 con số "tỷ lệ chốt"** cùng lúc. Sửa ⇒ số của người dùng nhảy, phải thông báo trước. Đây là đánh đổi truyền thông, không phải kỹ thuật |

---

## 5. Khu vực D (Sprint 13 → 15)

### K-12. `OQ-D4` — token Meta loại gì, hết hạn bao lâu — 🔴 chặn cứng cả nhánh D

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

### K-13. Ba câu D còn lại

| Câu | Gỡ thế nào |
|---|---|
| `OQ-D3` | Đếm số ad account: mở Meta Ads Manager, xem có mấy tài khoản đang tiêu tiền. >1 ⇒ job phải lặp, `META_AD_ACCOUNT_ID` đổi thành danh sách |
| `OQ-D5` | Vai `MARKETING` cấp cơ sở có sửa được mapping D-07 không. Khuyến nghị **giữ nguyên (chỉ HO)**: gán campaign cho CS1 là **lấy tiền khỏi** CS2 |
| `OQ-D8` | Chi phí marketing ngoài Meta (tờ rơi, sự kiện, KOL) đi đường nào. Khuyến nghị: qua **bảng chi phí của B**, KHÔNG nhét vào bảng ads — nếu không B3 **trừ hai lần** |
| `OQ-D9` | `/admin/marketing/funnel` cũ: sửa hay bỏ. Non-Goal chọn treo banner. Để lâu thì có hai trang nói hai số |

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

## 7. Khu vực E (Sprint 12 → 15) — 3/4 câu đã chốt 26/08/2026

Chủ dự án trả lời *"khu vực E làm theo đề xuất"* ⇒ ba câu chặn cứng đóng **đúng khuyến nghị của PRD**.
Nguồn: `docs/plan/cau-hoi-can-quyet.md` §"Quyết định của chủ dự án — chốt 26/08/2026 (khu vực B + khu
vực E)"; chi tiết ở `docs/prd/E-tuong-tac.md` §0 và §7. **E-01/E-02/E-04 nay chạy được.**

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

### K-17. `OQ-7` — E-03 có lên site giáo viên không — 🟠 **VẪN TREO**

⏳ **Chưa trả lời tính đến 26/08/2026.** Câu chốt chung *"khu vực E làm theo đề xuất"* **không phủ được
câu này**: PRD `E-tuong-tac.md` **không đưa khuyến nghị** cho OQ-7 ⇒ **không suy ra được**, đừng coi là
đã chốt.

**Gỡ:** một câu. Nếu **CÓ** thì cột SĐT phải **rỗng** với `TEACHER` (`canViewParentContact` loại
`TEACHER` **có chủ đích**), và phạm vi test PII **rộng thêm một site** (thêm bề mặt `app/(teacher)/**`
+ ca "GV mở E-03 không thấy SĐT"). Nếu **KHÔNG** thì E-03 chỉ sống trên admin, phạm vi test giữ nguyên.
**Chỉ chặn E-03** — E-01/E-02/E-04 không chờ câu này.

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
1b. **K-2** — chạy nốt truy vấn `thieu_buoi`. Rẻ, chỉ đọc, và đang quyết định hình dạng của F-04.
2. **K-12** (token Meta) — vì nó là loại hỏng **im lặng**, và càng để lâu càng khó truy.
3. ~~**K-14 → K-16** (ba câu E)~~ — ✅ **chốt 26/08/2026**. Còn lại **K-17** (`OQ-7`): rẻ, một câu, và
   chỉ chặn **E-03** — nhưng nó quyết **phạm vi test PII**, nên hỏi sớm hơn là sửa test sau.
4. ~~**K-6** (trần video) + **K-5** chọn đường (c)~~ → **K-5 đã gỡ 26/08** (client-side WebCodecs). Việc
   tiếp theo của F **không phải code mà là ĐO**: chạy **Bước 0** với 5–7 GV thật; dưới ~70% chạy được thì
   quay lại phương án server **trước** khi lỡ code sâu. **K-6 vẫn treo** nhưng chỉ chặn **nhánh video** —
   nhánh "chỉ ảnh" đi được ngay.
5. **K-10** (danh mục nguồn lead) — rẻ hơn trước: **đã đo 129 lead + có đề xuất 8 mã (26/08)**, việc còn
   lại chỉ là vận hành/marketing **duyệt** hai chỗ suy đoán. Vẫn đang chặn seed của G.
5b. **K-11 câu `OQ-G4` vế "chạy ở đâu"** — chốt (a) resolver hay (b) job ghi **kèm tên người chịu trách
   nhiệm số liệu**. Chặn C-02, và càng để lâu càng dễ có người lỡ viết cron đồng bộ hai enum.
6. ~~**K-3**~~ — đã gỡ: không phải nợ kỹ thuật, chỉ là Prisma Client chưa sinh. `pnpm typecheck` = **0 lỗi**.
