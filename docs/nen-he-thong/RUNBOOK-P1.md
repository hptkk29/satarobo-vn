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

# (4) Xác nhận
pnpm tsx scripts/nen-p1-doi-soat-orgunit.ts
```

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

## 5. Việc CÒN LẠI của P1 (chưa làm trong đợt này)

- **28 bảng của PR-A mang nhãn `CHUA_RA_SOAT`** — chưa ai rà `centerId = NULL` ở đó nghĩa
  là gì. Đối soát vẫn đếm và hiện, nhưng "thiếu orgUnitId" cố ý **không** báo động (kêu sói
  mỗi đêm trên 28 bảng chưa duyệt là cách nhanh nhất khiến cả đội thôi đọc alert). Rà xong
  bảng nào thì chuyển sang `BACKFILL_SPECS` kèm bằng chứng.
- **`AuditLog.orgUnitId` đang trộn hai không gian khoá** — nhiều call-site nhét `Center.id`
  vào cột vốn để chứa `OrgUnit.id`. Chuẩn hoá là migration GHI trên dữ liệu prod ⇒ phải là
  story riêng có dry-run (luật cứng #4), cố ý **không** nhét vào US-07.
- **4 cột tham chiếu cơ sở không mang tên `centerId`** nên lọt khỏi mọi lệnh quét theo tên:
  `LeadChild.interestedCenterId`, `LeadTransfer.fromCenterId/toCenterId`,
  `StudentTransferRequest.fromCenterId/toCenterId`.
- **`updateMany` không được ghi kép** — ở đó một khối `data` áp cho nhiều dòng có thể thuộc
  nhiều cơ sở, mà `where` không nói được cơ sở nào. Suy một `orgUnitId` chung cho cả lô là
  gán sai hàng loạt; thà để trống cho đối soát nhặt.
- **Đường ghi bằng SQL thô** (`$executeRaw`, migration, script) không đi qua cơ chế ghi kép.
  Đây chính là lý do đối soát đêm phải tồn tại, và là ca được ghim ở `[US-07-IT-10]`.
