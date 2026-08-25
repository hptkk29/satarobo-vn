# Bảng kẹt & cách gỡ — Sprint 3 → 18

**Lập ngày 24/08/2026**, sau khi 12 câu chặn khởi công + 5 câu khu vực A + 12 câu kỹ thuật đã chốt.
Nguồn: `docs/plan/sprint-plan.md` (91 hạng mục) đối chiếu với `docs/plan/cau-hoi-can-quyet.md`.

> **Cách đọc:** mỗi mục ghi **kẹt vì gì · ai gỡ được · gỡ thế nào (từng bước) · gỡ xong mở được gì**.
> Mục nào không có ở đây nghĩa là **không kẹt** — cứ làm.

---

## 0. Trạng thái tổng

| Khu vực | Sprint | Chạy được ngay? |
|---|---|---|
| **A** — nền phạm vi & phân quyền | S1–S2 | ✅ **Không kẹt.** Đang thực thi |
| **F** — kho media | S3–S8 | 🔴 Kẹt 4 câu + 1 hạ tầng |
| **G** — module lead | S9–S10 | 🟠 Kẹt 1 câu chặn seed, phần còn lại chạy được |
| **C** — tab kinh doanh | S11–S12 | 🔴 Kẹt 1 phép đo prod + 4 câu |
| **D** — chi phí marketing | S13–S15 | 🔴 Kẹt 1 câu chặn cứng + creds |
| **B** — tài chính | S15–S18 | 🔴 Kẹt 1 phép đo prod + 5 câu |
| **E** — tương tác KH | S12–S15 | 🔴 Kẹt 4 câu, chưa trả lời câu nào |

---

## 1. Kẹt xuyên suốt — không thuộc sprint nào, chặn nhiều nơi

### K-1. Không ai trong phiên làm việc này chạy được truy vấn trên PROD

**Kẹt vì:** `.env` của máy local trỏ **DEV Supabase**, không phải prod (đã ghi trong `MEMORY.md`).
Prod chỉ tới được qua secret trong CI. ⇒ Ba phép đo bắt buộc của kế hoạch (`§C.6.9`, `§B.6.8`,
`A-nen-tang §6.9`) **không thể tự chạy**.

**Ai gỡ:** người có quyền vào Supabase prod (SQL Editor) — chủ dự án hoặc Dev.

**Gỡ thế nào:**
1. Mở Supabase project **prod** → SQL Editor.
2. Chạy lần lượt, **tất cả đều chỉ đọc**, không sửa gì:
   - `docs/prd/A-nen-tang.md` §6.9 — bốn truy vấn `[A-01-Đ1] … [A-01-Đ4]` (cấu hình đa cơ sở + xem
     anh Phúc có bị rớt khỏi nhóm chat lớp cơ sở thứ hai không).
   - `docs/prd/CDB-dashboard.md` §C.6.9 — đo lệch định nghĩa "đã chốt".
   - `docs/prd/CDB-dashboard.md` §B.6.8 — đo lệch định nghĩa doanh thu + rà điều chỉnh chồng.
3. Dán kết quả (kể cả "0 dòng") vào một file trong `docs/plan/` để lần sau không phải chạy lại.

**Gỡ xong mở được:** V-1/V-3 của A (backfill `UserOrgRole`) · C.0 → toàn bộ tab C · B.0 → toàn bộ tab B
· OQ-B2 (điều chỉnh chồng) · OQ-F5 (nếu chạy kèm truy vấn đếm media ở K-2).

---

### K-2. Chưa đo số media `classSessionId = null` trên prod (OQ-F5)

**Kẹt vì:** F-04 sẽ thêm điều kiện `classSessionId: { not: null }` vào đường đọc của phụ huynh. Media cũ
thiếu cột này sẽ **biến mất khỏi portal ngay lập tức** — mà không ai biết con số đó là bao nhiêu.

**Gỡ thế nào:** chạy trên prod (chỉ đọc):

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

### K-5. Nén video H.264/720p chạy ở đâu (PRD `OQ-F3` = backlog `OQ-F1`) — 🔴 chặn Story 5, 9, 11, 14

**Kẹt vì:** repo **không có** ffmpeg/sharp/transcode ở bất kỳ đâu, và Vercel function không phải chỗ
chạy ffmpeg cho file 500MB. Đây là câu **tiêu tiền**, không phải câu kỹ thuật thuần.

**Ai gỡ:** chủ dự án (ngân sách) + Dev BE (khả thi).

**Gỡ thế nào — ba đường, chọn một:**

| Đường | Chi phí | Việc phải làm | Rủi ro |
|---|---|---|---|
| **(a) Dịch vụ ngoài** (Cloudflare Stream / Mux) | Trả theo phút lưu + phút xem | Thêm một nhà cung cấp vào `modules/integration`; đổi `fileUrl` sang URL ký; sửa `isOwnStorageUrl` | Thêm một chỗ giữ ảnh/video trẻ em — phải rà lại điều khoản riêng tư của họ |
| **(b) Worker riêng** (VPS + ffmpeg + hàng đợi) | Tiền máy + người trực | Dựng worker, hàng đợi DB-backed, cơ chế thử lại | Ta tự vận hành thêm một hệ thống |
| **(c) HOÃN F-02** — chỉ nhận video **đã đúng chuẩn** | 0 | Chặn ở tầng validate lúc upload: từ chối file quá chuẩn với thông điệp hướng dẫn; `transcodeStatus` luôn `SKIPPED` | GV phải tự nén — sẽ có người bỏ cuộc, ảnh hưởng tỷ lệ dùng |

**Khuyến nghị:** **(c) cho đợt 1**, kèm quyết định "ra mắt F chỉ với ảnh" (backlog `OQ-F7`) — đúng thứ
tự cắt mà `§6.19` của sprint-plan đã xếp. Rẻ nhất, và không khoá đường nâng cấp sau.

**Gỡ xong mở được:** Story 5, 9, 11, 14 và toàn bộ nhánh video của F.

---

### K-6. Trần dung lượng + **thời lượng** video (PRD `OQ-F4`) — 🔴 chặn bật upload video

**Kẹt vì:** `UPLOAD_CONFIG.video` đang **500MB**, **không có trần thời lượng**. Trong khi F-18 bắt QLCS
**xem hết** mọi video trước khi duyệt ⇒ 10 video × 10 phút = **100 phút mỗi ngày mỗi lớp**. Không có
trần thì trang duyệt là việc bất khả thi, và cơ chế duyệt sẽ bị bỏ qua trên thực tế.

**Ai gỡ:** chủ dự án — đây là quyết định vận hành, không phải kỹ thuật.

**Gỡ thế nào:** trả lời đúng hai con số:
1. **Thời lượng tối đa một video** — gợi ý **60–90 giây**. Đây là ảnh sinh hoạt lớp, không phải phim.
2. **Số video tối đa một buổi một lớp** — gợi ý **3**.
Rồi Dev đặt cả hai vào `lib/storage/upload-config.ts` + chặn ở cả client (báo sớm) lẫn server (thật).

---

### K-7. Mâu thuẫn trong chính spec F-10 (`OQ-F2`) — 🟠 chặn F.2

**Kẹt vì:** đọc chặt câu chữ F-10 ("chỉ hiện ngày **có media chưa duyệt**") thì **F-14 không bao giờ
render được** (ghi chú "hôm nay không có ảnh" — vì folder trống thì không hiện), và F-31 mất 2 trạng
thái `Chưa duyệt` / `Không có ảnh`. Đây là mâu thuẫn **trong tài liệu**, không suy ra được từ mã.

**Gỡ:** chọn **cách đọc B** — lịch hiện **mọi ngày có buổi học**, mỗi ngày mang một trong 4 trạng thái
(`Chưa duyệt` / `Đã duyệt` / `Phê duyệt trễ` / `Không có ảnh`). Đây là cách đọc duy nhất làm F-14 và
F-30…F-32 chạy được. Nếu chủ dự án đồng ý, sửa câu chữ F-10 trong spec cho khớp — **đừng để hai câu
mâu thuẫn cùng tồn tại**.

---

### K-8. Bucket riêng cho media lớp — kẹt **hạ tầng**, không phải quyết định (đã chốt B8)

**Kẹt vì:** quyết định đã có (tách ngay trong đợt F) nhưng **bucket chưa tồn tại**. Cần người có quyền
Cloudflare R2 và Vercel env.

**Gỡ thế nào — theo đúng thứ tự:**
1. Tạo bucket R2 mới, đặt **private** (không public access).
2. Thêm biến môi trường cho **cả 3** môi trường (Production / test / Development): tên bucket, endpoint,
   access key, secret. Đặt tên biến theo đúng khuôn biến R2 đang có trong `.env.example`.
3. Dev nới `isOwnStorageUrl` (`actions.ts:150-156`) để nhận **hai** bucket — hôm nay nó so với **một**
   `getR2PublicUrl()`.
4. Media **cũ** ở lại bucket công khai. Đó là di sản, dọn theo `OQ-F6` (đã chốt: story riêng).
5. Chỉ sau bước 3 mới được đổi `buildMediaObjectKey` — vì object key là thứ **không sửa rẻ** sau khi có
   dữ liệu.

---

### K-9. Bốn câu **chỉ nằm trong `docs/backlog/F-media-stories.md`** — dễ bị bỏ quên

| Câu | Nội dung | Vì sao đáng gỡ sớm |
|---|---|---|
| `OQ-F4` (backlog) | **Ảnh không thuộc học bạ nào** giữ bao lâu | 🔴 Đây là **đa số ảnh trong kho**, và hiện **không có chính sách lưu trữ nào**. Kho phình vô hạn |
| `OQ-F2` (backlog) | Thời gian **ân hạn** trước khi xoá thật (đề xuất 30 ngày) + ai được khôi phục | Quyết định giữa "mất vĩnh viễn" và "gọi lại được" |
| `OQ-F5` (backlog) | Ảnh **bị từ chối** xoá khỏi R2 ngay hay vào ân hạn | Ảnh bị từ chối thường là ảnh **có vấn đề** (lộ mặt trẻ chưa có consent) — giữ 30 ngày là rủi ro; xoá ngay là mất đường khiếu nại |
| `OQ-F6` (backlog) | Người có quyền duyệt **tự upload** thì vào thẳng `APPROVED` — giữ hay bỏ | Đang chạy trên prod. Giữ nguyên thì SLA F-30 có **đường tắt hợp lệ**: tự up ảnh thay GV |

⚠️ **Mã `OQ-Fx` trùng giữa hai tài liệu F** — bảng ánh xạ đã thêm ở đầu phần Open Questions của file
backlog. Khi trả lời, ghi rõ "OQ-F4 **của backlog**" hay "**của PRD**".

---

## 3. Khu vực G (Sprint 9 → 10)

### K-10. Danh mục **nguồn lead** chưa có giá trị nào (`OQ-G6` nửa sau) — 🟠 chặn seed `LeadSource`

**Kẹt vì:** `Lead.source` hiện là **String tự do**. Không có danh mục thì không có đích để map, và
`LeadSource` seed rỗng ⇒ người dùng mở dropdown ra thấy trống.

**Ai gỡ:** vận hành + marketing.

**Gỡ thế nào:** liệt kê 5–10 giá trị bắt đầu, mỗi giá trị một mã không dấu. Cách nhanh nhất để không
ngồi nghĩ từ đầu — **đọc dữ liệu đang có**:

```sql
SELECT source, count(*) AS so_lead
FROM "Lead"
WHERE "deletedAt" IS NULL AND source IS NOT NULL AND btrim(source) <> ''
GROUP BY source ORDER BY so_lead DESC LIMIT 40;
```

Gộp các biến thể viết khác nhau của cùng một nguồn thành một mã, rồi chốt danh sách. Phần đuôi ít dùng
map về `KHAC`.

**Lưu ý:** phần migration của G **không** bị chặn bởi câu này — bảng `LeadSource` tạo được ngay, chỉ có
**seed giá trị** là phải chờ. Đừng để câu này chặn cả G.

### K-11. Bốn câu chặn tính năng lẻ của G (không chặn migration)

| Câu | Chặn cái gì | Gỡ thế nào |
|---|---|---|
| `OQ-G4` | Khi **mọi** con đã `LOST`, `Lead.status` có tự chuyển `LOST` không | PRD đề xuất **không** tự động. Nếu muốn tự động thì phải chốt **nơi chạy** (resolver lúc đọc — an toàn; hay job ghi — sinh dữ liệu) và **ai chịu trách nhiệm số liệu** |
| `OQ-G5` | Trần số con của một lead (ảnh hưởng UI bảng con) | Trả lời bằng dữ liệu: `SELECT max(c) FROM (SELECT count(*) c FROM "LeadChild" GROUP BY "leadId") t;` rồi cộng biên |
| `OQ-G9` | Học thử **không** qua `TrialClassV2` (xếp tay, buổi lẻ) có cần chỗ lưu riêng | Hỏi Sale: có ca xếp tay không? Không ⇒ bỏ qua. Có ⇒ thêm 2 cột denormalize trên `LeadChild` |
| `OQ-G10` | Nguồn sự thật cho **lịch sử chuyển sale** (3 bảng, 3 đường ghi, không bảng nào phủ hết) | Chốt `LeadAssignmentHistory` là bảng duy nhất, rồi vá `assign.ts`/`auto-assign.ts` cùng ghi vào đó. Chốt sai = tranh chấp hoa hồng vẫn không giải được |

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

## 6. Khu vực B (Sprint 15 → 18)

**Kẹt chính là K-1** (chưa đo `§B.6.8`). Quyết định B3 đã chốt là **sửa logic** (không phải đổi nhãn)
⇒ số doanh thu của kế toán và ROAS **tụt ngay ngày lên prod**. Không đo trước thì không thông báo
trước được, và ngày đó sẽ có người tưởng hệ thống hỏng.

| Câu | Kẹt vì | Gỡ thế nào |
|---|---|---|
| `OQ-B2` | Một khoản bị điều chỉnh **nhiều lần** thì tính bản nào — `adjustPayment` **không chặn** điều chỉnh chồng | Chạy truy vấn rà ở `§B.6.8` xem prod đã có ca này chưa. Có ⇒ chốt "bản `ADJUSTED` mới nhất thắng" + thêm `ORDER BY createdAt DESC LIMIT 1`. Chưa có ⇒ vẫn chốt luật rồi **chặn** điều chỉnh chồng ngay từ đầu |
| `OQ-B3` | "Dòng tiền" với BGĐ nghĩa là **thu ghi nhận** hay **tiền vật lý về ngân hàng** | Chọn ngân hàng ⇒ bỏ sót toàn bộ thu tiền mặt **và** cần một bảng giao dịch chi chưa tồn tại. Khuyến nghị: **thu ghi nhận** + bảng đối soát 3 lớp để thấy khoảng cách |
| `OQ-B4` | Danh mục **đầu phí** gồm nhóm nào | Chốt danh sách: `ADS · RENT · SALARY · UTILITY · MARKETING_OFFLINE · OTHER`. Không có danh sách thì B-05 không có template và B2 không nghiệm thu được |
| `OQ-B6` | Chi phí cấp công ty (`centerId = null`) có phân bổ về cơ sở không | v1 khuyến nghị **không** phân bổ, hiện dòng riêng. Phân bổ ⇒ lợi nhuận từng cơ sở đổi **và** phải chốt tiêu chí chia (doanh thu? sĩ số?) |
| `OQ-B7` | Chi phí cần **duyệt** mới vào báo cáo, hay nhập là tính | Khuyến nghị **phải duyệt**. Bỏ duyệt thì nhanh hơn nhưng **ai cũng đổi được lợi nhuận** |
| `OQ-B8` | Có đóng sổ theo tháng không | Không đóng ⇒ báo cáo tháng trước có thể đổi bất kỳ lúc nào. Additive, làm sau được — nhưng phải quyết **trước** khi kế toán quen với việc sửa lùi |

---

## 7. Khu vực E (Sprint 12 → 15) — chưa trả lời câu nào

### K-14. `OQ-1` — định nghĩa "PH đã tương tác" — 🔴 chặn E-02, E-03, E-04

**Kẹt vì:** đây là **tử số** của chỉ số chính. Không có định nghĩa thì không viết được một dòng nào.

**Gỡ thế nào — ba phương án, kèm hệ quả đã đo:**

| PA | Định nghĩa | Hệ quả kỹ thuật |
|---|---|---|
| **(A)** — khuyến nghị | PH đã **gửi ≥ 1 tin** trong khoảng ngày | Chỉ (A) đo đúng **khoảng thời gian**. Cần thêm index `Message(senderId, createdAt)` (đã chốt là có) |
| (B) | PH có `lastReadAt ≥ dateFrom` | `lastReadAt` là **vô hướng, bị ghi đè** ⇒ "đã tương tác trong tháng 7" **không tính được** |
| (C) | (A) hoặc đọc thông báo trong khoảng | Rộng hơn nhưng vẫn dính nhược điểm của (B) ở vế sau |

**Câu con phải trả lời kèm:** có tính **kênh 1-1** vào không? Nếu có thì **không được** lọc phạm vi qua
`Conversation.centerId`.

### K-15. `OQ-2` — mẫu số lọc `Enrollment.status` nào

**Kẹt vì:** enum có **9** giá trị. Chọn khác nhau thì tỉ lệ đổi mà không ai đối chiếu được.
**Gỡ:** trả lời riêng hai câu — **(a)** `PAUSED` (tạm dừng, vẫn thuộc lớp) có tính là "đang có con học"?
**(b)** `COMPLETED` (học xong khoá, chưa nghỉ hẳn) có tính?
**Khuyến nghị:** dùng đúng `ENROLLMENT_ACTIVE_STATUS_LIST` đã có (`ACTIVE, CONFIRMED, STUDYING, PAUSED`)
— giữ `PAUSED`, loại `COMPLETED` — để E-02 khớp với **sĩ số mà điểm danh đang dùng**.

### K-16. `OQ-3` — QLCS bấm vào kênh 1-1 thì xảy ra gì

**Kẹt vì:** spec viết dropdown "1-1 / nhóm lớp" như thể cả hai mở được. Đo trên mã thì QLCS **không**
là participant của DM, **không** mở được DM mới, và `assertActiveParticipant` chặn cứng.
**Gỡ — ba lựa chọn:** **(a)** dropdown chỉ liệt kê kênh người xem là participant, mục 1-1 hiện mờ kèm
lý do · **(b)** chỉ SUPER_ADMIN mở được, qua màn tra cứu **chỉ-đọc** có `reason` + audit · **(c)** mở
`DmKind` mới cho QLCS — **nới quyền thật**, ngoài phạm vi E.
**Khuyến nghị: (a) cho P0, (b) cho P2.** Không chốt ⇒ hoặc code ra **nút chết**, hoặc ai đó "vá" bằng
cách nới `assertActiveParticipant` — và đó là nới quyền đọc tin nhắn riêng.

### K-17. `OQ-7` — E-03 có lên site giáo viên không

**Gỡ:** một câu. Nếu **có** thì cột SĐT phải **rỗng** với `TEACHER` (`canViewParentContact` loại
`TEACHER` **có chủ đích**), và phạm vi test PII rộng thêm một site.

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

## 8. Thứ tự gỡ đề nghị — nếu chỉ làm được vài việc

1. **K-1** (3 phép đo prod) — mở khoá nhiều nhất, chỉ đọc, không rủi ro. Làm trước hết.
2. **K-12** (token Meta) — vì nó là loại hỏng **im lặng**, và càng để lâu càng khó truy.
3. **K-14 → K-16** (ba câu E) — vì E là tab thứ tư của dashboard, dễ bị nhớ ra quá muộn.
4. **K-6** (trần video) + **K-5** chọn đường (c) — mở được nhánh F "chỉ ảnh" ngay.
5. **K-10** (danh mục nguồn lead) — rẻ, và đang chặn seed của G.
6. ~~**K-3**~~ — đã gỡ: không phải nợ kỹ thuật, chỉ là Prisma Client chưa sinh. `pnpm typecheck` = **0 lỗi**.
