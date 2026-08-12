# Runbook P1 — chạy trên DB đang có dữ liệu

> Nền Hệ thống P1 (US-05 OrgUnit path · US-06 LegalEntity · US-07 ghi kép orgUnitId).
> Người thực hiện: **Dev** (README bàn giao §5 — "Chạy migration/backfill trên PROD, agent
> chỉ soạn script + dry-run"). Agent KHÔNG chạy bước nào trong file này.

## 0. Điều cần biết trước

- **Không có môi trường tiền-prod độc lập.** DB của environment `test` **chính là DB dev**
  dùng chung với máy local (CLAUDE.md). Nên mọi bước dưới đây chạy trên `test` là chạm
  thẳng dữ liệu cả đội đang dùng. Muốn dry-run thật thì phải dựng Supabase project riêng
  rồi đổi 2 secret `TEST_DATABASE_URL` / `TEST_DIRECT_URL` — workflow không phải sửa.
- **Mọi migration của P1 là ADDITIVE tuyệt đối**: chỉ `ADD COLUMN` / `CREATE INDEX` /
  `CREATE TABLE` / `UPDATE` điền chỗ đang NULL. Không `RENAME`, không `DROP`, không đổi
  kiểu cột nào đang có dữ liệu. Rollback code không mất dữ liệu.
- **Hai script đều DRY-RUN mặc định.** Phải có `--apply` mới ghi.

## 1. Thứ tự BẮT BUỘC

Sai thứ tự không hỏng dữ liệu, nhưng sẽ cho một kết quả "sạch" vô nghĩa và phải chạy lại.

```bash
# (1) Áp schema — thêm cột, không dời gì
pnpm prisma migrate deploy

# (2) Dời cây tổ chức: SATAROBO(ROOT) → HO/CS1/CS2  ⇒  HO(gốc) → DANANG → CS1/CS2
pnpm tsx scripts/nen-p1-reshape-org-tree.ts            # XEM TRƯỚC — đọc kỹ danh sách việc
pnpm tsx scripts/nen-p1-reshape-org-tree.ts --apply

# (3) Điền orgUnitId cho dòng đang thiếu (52 bảng)
pnpm tsx scripts/nen-p1-backfill-orgunit.ts            # XEM TRƯỚC — số dòng theo từng bảng
pnpm tsx scripts/nen-p1-backfill-orgunit.ts --apply

# (4) Tạo pháp nhân gốc + gắn 4 đơn vị vào (US-06 AC2)
pnpm tsx prisma/seed-orgunit.ts

# (5) Xác nhận
pnpm tsx scripts/nen-p1-doi-soat-orgunit.ts
```

**Bước (4) dễ bị quên** — phát hiện khi chạy thật trên DB dev 11/08. Bảng `LegalEntity` vừa
được migration tạo nên **rỗng**, mà đường tạo pháp nhân gốc (`seedPrimaryLegalEntity`) chỉ
chạy qua seed. Không có bước này thì mọi đơn vị có `legalEntityId = NULL`, và script dời cây
in cảnh báo `⚠️ Chưa có pháp nhân gốc (isPrimary)`.

Chạy `prisma/seed-orgunit.ts` **trực tiếp** chứ không `pnpm db:seed`: file có guard tự chạy
nên chỉ gọi `seedOrgUnits`, không kéo theo cả `prisma/seed.ts`. Idempotent theo `code`, và
**không đụng node `SATAROBO`** (nó không nằm trong danh sách seed nên giữ nguyên trạng thái
đã đóng ở bước 2).

**Vì sao (2) phải trước (3):** backfill ánh xạ theo `Center`, nên nó vẫn chạy đúng khi cây
chưa dời — nhưng lúc đó chưa có node vùng, và mọi thứ phải soát lại sau khi dời. Chạy đúng
thứ tự là làm một lần.

## 2. Đọc kết quả bước (4) thế nào

Script in bảng Markdown và thoát mã ≠ 0 nếu có lệch.

⚠️ **"0 lệch" chỉ có nghĩa khi mẫu số khác 0.** Dữ liệu vận hành prod đã bị dọn sạch
01/08/2026; một đêm sạch trên bảng rỗng không chứng minh gì về backfill. Báo cáo có cột
"Tổng dòng" đúng để tránh chuyện đó, và cron trả cờ `inconclusive: true` khi tổng = 0.

Ba loại số:

| Cột | Nghĩa | Phải làm gì |
|---|---|---|
| `Thiếu orgUnitId` | dòng có `centerId` mà chưa có `orgUnitId` | chạy lại bước (3) |
| `Sai ánh xạ` | có cả hai nhưng `orgUnitId` không trỏ về đơn vị của `centerId` đó | **điều tra tay** — đây là mâu thuẫn nội tại, backfill không sửa được |
| `scopedDb = CÓ` | bảng nằm trong `SCOPED_MODELS` | nhóm nguy hiểm nhất: tới P4 mọi dòng `orgUnitId` NULL sẽ **biến mất** với người dùng cấp cơ sở |

## 3. Sau khi chạy xong

- Cron `/api/cron/orgunit-drift` (03:00 VN) tự đối soát mỗi đêm và ghi `OrgUnitDriftRun`.
  Có **bản ghi run riêng** để phân biệt "đêm sạch" với "job không chạy" — đúng bài học từ
  vụ 20 cron prod chết vì canonical 308 mà không ai thấy.
- Cổng P4 (KR5) đọc chuỗi `OrgUnitDriftRun` này: **7 ngày liên tiếp 0 lệch VÀ mẫu số > 0**.

## 4. Rollback

| Bước | Cách lùi |
|---|---|
| (1) migration | Không cần lùi — additive. Nếu buộc phải, code cũ vẫn chạy vì không cột nào bị đổi/xoá. |
| (2) dời cây | Không có nút lùi tự động. Trước khi `--apply`, chụp lại `SELECT id, code, "parentId", path FROM "OrgUnit"` để dựng lại tay nếu cần. Script không xoá node nào (SATAROBO chỉ bị đóng `deletedAt`). |
| (3) backfill | Lùi bằng `UPDATE <bảng> SET "orgUnitId" = NULL` — cột `centerId` không bị đụng nên nghiệp vụ không đổi. |
| Cơ chế ghi kép | Gỡ `.$extends(dualWriteExtension())` trong `lib/db.ts`. Hệ chạy tiếp, chỉ mất việc tự điền. |

## 5. Việc CÒN LẠI của P1

### ✅ Đã xử lý 12/08/2026

**`AuditLog.orgUnitId` trộn hai không gian khoá — XONG.**
Đo trước khi vá: **246/369 dòng (67 %)** mang `Center.id`, tập trung ở `enrollment` (145)
và `finance` (93). Hậu quả: đường đọc lọc `orgUnitId IN visibleOrgUnitIds` (toàn
`OrgUnit.id`) nên **hai phần ba nhật ký vô hình với quản lý cơ sở** — im lặng, không lỗi.

- Đường GHI vá ở **biên**: `resolveAuditOrgUnitId()` trong `lib/audit/audit-log.ts` nhận cả
  hai loại ID và chuẩn hoá bằng MỘT truy vấn (`OrgUnit.centerId` là `@unique` nên không thể
  khớp nhầm). Vá ở đây chứ không sửa 47 chỗ gọi: hai ID đều là chuỗi cuid, nhìn không phân
  biệt được, nên chỗ thứ 48 chắc chắn lại sai.
- Dữ liệu CŨ: `scripts/nen-p1-sua-audit-orgunit.ts` (dry-run mặc định).
  ```bash
  pnpm tsx scripts/nen-p1-sua-audit-orgunit.ts            # xem trước
  pnpm tsx scripts/nen-p1-sua-audit-orgunit.ts --apply    # ghi thật
  ```
  Đã chạy trên DB dev: 246 dòng đổi, **0 mồ côi**, chạy lại lần hai ra 0 (idempotent).
  ⚠️ **PROD chưa chạy** — luật cứng #4, người vận hành chạy tay sau khi xem dry-run.

  ⚠️ **Script KHÔNG chạm được PROD từ máy dev**: `.env` local trỏ DB dev, còn
  `DATABASE_URL` của prod bị Vercel đánh dấu Sensitive nên `vercel env pull` không
  lấy ra được. Đường duy nhất tới DB prod là **Supabase SQL Editor**. Bản SQL dưới
  đây tương đương script — đã chạy đối chiếu trên dev và cho ĐÚNG cùng con số.

  **Bước 1 — xem trước (chỉ đọc):**
  ```sql
  SELECT
    count(*) FILTER (WHERE a."orgUnitId" IS NULL)                             AS null_giu_nguyen,
    count(*) FILTER (WHERE o_id.id IS NOT NULL)                               AS da_dung,
    count(*) FILTER (WHERE o_id.id IS NULL AND o_ct.id IS NOT NULL)           AS doi_duoc,
    count(*) FILTER (WHERE a."orgUnitId" IS NOT NULL
                       AND o_id.id IS NULL AND o_ct.id IS NULL)               AS mo_coi
  FROM "AuditLog" a
  LEFT JOIN "OrgUnit" o_id ON o_id.id = a."orgUnitId"          AND o_id."deletedAt" IS NULL
  LEFT JOIN "OrgUnit" o_ct ON o_ct."centerId" = a."orgUnitId"  AND o_ct."deletedAt" IS NULL;
  ```
  `mo_coi > 0` thì DỪNG, xem tay trước — đó là id không khớp cả OrgUnit lẫn Center
  (đơn vị đã xoá), script cố ý không tự sửa.

  **Bước 2 — ghi thật:**
  ```sql
  UPDATE "AuditLog" a
     SET "orgUnitId" = o_ct.id
    FROM "OrgUnit" o_ct
   WHERE o_ct."centerId" = a."orgUnitId"
     AND o_ct."deletedAt" IS NULL
     AND NOT EXISTS (
           SELECT 1 FROM "OrgUnit" o_id
            WHERE o_id.id = a."orgUnitId" AND o_id."deletedAt" IS NULL
         );
  ```
  ⚠️ **SQL Editor của Supabase KHÔNG giữ transaction giữa các lần bấm Run** — chạy
  bước 2 là ăn ngay, không có `ROLLBACK`. Chạy lại bước 1 để đối chiếu: `doi_duoc`
  phải về 0, `mo_coi` giữ nguyên.

**28 bảng `CHUA_RA_SOAT` → còn 20.**
Rà bằng số đo trực tiếp trên DB, tiêu chí chuyển gồm cả bốn: bảng CÓ dữ liệu · 0 dòng
`centerId IS NULL` · 0 dòng thiếu `orgUnitId` · 0 dòng lệch ánh xạ.
- **8 bảng đạt cả bốn** → đã chuyển sang `BACKFILL_SPECS` với số đo kèm theo: `Class`,
  `Room`, `ClassGroup`, `EmployeeCheckin`, `CenterDayChecklist`, `MakeupNeed`,
  `TimesheetAdjustmentRequest`, `SataCoinTransaction`.
- **8 bảng RỖNG** — không có dòng nào thì không suy ra được gì, để nguyên.
- **12 bảng CÓ dòng `centerId = NULL`** — đây mới là phần cần NGƯỜI trả lời: `NULL` nghĩa
  là "toàn hệ thống" (như nghỉ lễ quốc gia) hay "chưa khớp được cơ sở" (như lead mới về)?
  Hai nghĩa dẫn tới hai cách xử lý ngược nhau ở P4. Số NULL từng bảng ghi ngay trong
  `lib/org/center-bridge.ts`.

Tin tốt từ lần đo này: **0 dòng lệch ánh xạ và 0 dòng thiếu `orgUnitId` trên cả 28 bảng** —
cơ chế ghi kép đang chạy đúng.

**Cổng "7 đêm đối soát sạch" — trước 12/08 CHƯA HỀ BẮT ĐẦU ĐẾM.**
Bảng `OrgUnitDriftRun` rỗng. Lý do: `/api/cron/orgunit-drift` có đăng ký trong
`vercel.json`, nhưng **Vercel Cron không chạy trên environment `test`**, còn
`cron-pump-test.yml` chỉ bơm `dispatch-events` + `email-queue` + `chat-zns-notify` — không
ai gọi nó trên môi trường mà DB đang nằm.
- Đã thêm job `doi-soat-dem` vào `cron-pump-test.yml`, nhịp riêng `0 20 * * *` UTC
  (= 03:00 giờ VN, cùng giờ với `vercel.json` để hai môi trường so được với nhau). Tách job
  chứ không nhét vào vòng lặp 5 phút: một lượt quét 52 bảng mất ~24 giây.
- Job **báo đỏ khi `inconclusive: true`** (quét được 0 dòng) — "sạch" kiểu đó là giả, không
  được tính vào 7 đêm.
- Đêm sạch **thứ 1/7** đã ghi nhận (chạy tay 12/08): 52 bảng · 1.566 dòng · lệch 0.
- ⚠️ **PROD chưa kiểm** — cần đo `OrgUnitDriftRun` trên DB prod để biết cron đêm ở đó có
  thật sự chạy không. Nếu cũng rỗng thì cổng P1 trên prod cũng chưa bắt đầu đếm.

### Còn lại
- **4 cột tham chiếu cơ sở không mang tên `centerId`** nên lọt khỏi mọi lệnh quét theo tên:
  `LeadChild.interestedCenterId`, `LeadTransfer.fromCenterId/toCenterId`,
  `StudentTransferRequest.fromCenterId/toCenterId`.
- **`updateMany` không được ghi kép** — ở đó một khối `data` áp cho nhiều dòng có thể thuộc
  nhiều cơ sở, mà `where` không nói được cơ sở nào. Suy một `orgUnitId` chung cho cả lô là
  gán sai hàng loạt; thà để trống cho đối soát nhặt.
- **Đường ghi bằng SQL thô** (`$executeRaw`, migration, script) không đi qua cơ chế ghi kép.
  Đây chính là lý do đối soát đêm phải tồn tại, và là ca được ghim ở `[US-07-IT-10]`.
