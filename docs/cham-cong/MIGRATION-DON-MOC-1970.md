# Dọn mốc Unix 1970 khỏi `Employee.joinedAt` / `Employee.endDate` — BẢN NHÁP

| | |
|---|---|
| **Ngày soạn** | 08/09/2026 |
| **Trạng thái** | 🟡 **CHƯA CHẠY** — chờ duyệt |
| **Vì sao chưa tạo thư mục migration** | Tạo `prisma/migrations/<ts>_.../` là nó **tự chạy ở lần deploy kế**. Bản nháp để ở docs cho tới khi được duyệt. |

## 1. Cột đã nullable sẵn — KHÔNG cần đổi schema

```prisma
model Employee {
  joinedAt  DateTime? @db.Timestamptz(6)
  endDate   DateTime? @db.Timestamptz(6)
}
```

Cả hai vốn đã `?`. Nên đây là **migration DỮ LIỆU thuần**, không `ALTER TABLE`, không
khoá bảng lâu, không đụng cột nào khác.

## 2. Số đo trên prod (08/09/2026, workflow ĐO chỉ-đọc)

| | |
|---|---|
| `Employee` có `joinedAt` = 1970 | ~~13~~ → **5** |
| `Employee` có `endDate` = 1970 | ~~14~~ → **5** |
| Bản ghi `Honor` sẽ hiện số năm sai | **0** (bảng Vinh danh đang rỗng) |

⚠️ **ĐO LẠI 08/09/2026, sau sự cố nhập nhân sự.** Lượt nhập hỏng — xoá trắng ba cột ngày
trên 9 hồ sơ, xem `docs/luat-doc-so-va-ket-luan.md` mục *Sổ sự cố* — vô tình dọn 8 trong
số đó: **13/14 → 5/5**.

Migration vì thế **thu nhỏ, nhưng KHÔNG bỏ**: 5 dòng vẫn là 5 dòng sai. Và cổng chặn ghi
`boMocUnix()` giữ nguyên bất kể còn bao nhiêu dòng — luật 1: *"0 dòng trên prod" không hạ
được mức nghiêm trọng khi đường ghi còn sống*.

Con số 13/14 ban đầu lớn hơn 10 người trong danh sách chưa-gán-cơ-sở vì nó tính cả hồ sơ
đã có cơ sở và hồ sơ đã nghỉ.

## 3. SQL đề xuất

```sql
-- Dọn mốc Unix: "không nhập" từng bị ghi thành 0 (1970-01-01), không phải ngày thật.
-- Mốc so sánh là 1970-01-02 để bắt cả trường hợp lệch vài giờ do múi giờ.
BEGIN;

-- Đếm TRƯỚC (chạy riêng để đối chiếu với số sau khi ghi)
SELECT
  count(*) FILTER (WHERE "joinedAt" < TIMESTAMPTZ '1970-01-02') AS join_1970,
  count(*) FILTER (WHERE "endDate"  < TIMESTAMPTZ '1970-01-02') AS end_1970
FROM "Employee";

UPDATE "Employee" SET "joinedAt" = NULL WHERE "joinedAt" < TIMESTAMPTZ '1970-01-02';
UPDATE "Employee" SET "endDate"  = NULL WHERE "endDate"  < TIMESTAMPTZ '1970-01-02';

-- Đếm SAU — phải ra 0 / 0
SELECT
  count(*) FILTER (WHERE "joinedAt" < TIMESTAMPTZ '1970-01-02') AS join_1970,
  count(*) FILTER (WHERE "endDate"  < TIMESTAMPTZ '1970-01-02') AS end_1970
FROM "Employee";

COMMIT;
```

⚠️ **Không hoàn tác được**, nhưng thứ mất đi là mốc Unix — không phải dữ liệu thật. Nếu
muốn chắc, chạy `SELECT "employeeCode","joinedAt","endDate" FROM "Employee" WHERE …`
trước và lưu kết quả.

## 4. Ngày THẬT — chốt 08/09/2026, làm SAU khi dọn

`joinedAt` = **ngày làm việc CHÍNH THỨC**, không phải ngày thử việc. Người đang thử
việc, chưa có ngày chính thức ⇒ **NULL**. "Còn làm việc" vẫn quyết bằng `status`/
`isActive`, nên NULL không làm ai biến mất.

| Mã NV | `joinedAt` | Ghi chú |
|---|---|---|
| SR.NV.002 | `2026-08-16` | |
| SR.NV.006 | `2026-07-11` | |
| SR.NV.007 | `2026-08-12` | |
| SR.NV.008 | `2026-07-11` | |
| SR.NV.005 | *(giữ nguyên `2025-11-24`)* | đang đúng trong DB |
| SR.NV.001, 003, 009, 010 | **NULL** | 001/003 bảng không ghi · 009 thử việc từ 4/8, chưa chính thức · 010 bảng trống |
| SR.NV.004 | **NULL** | bảng chỉ ghi "1/2026" — tháng, không có ngày. **ĐỪNG tự điền mùng 1**: bịa độ chính xác là đúng cái đang dọn. Chờ Nhân sự cho ngày |
| 13 dòng 1970 còn lại | **NULL** | bổ sung sau |

Bốn ngày thật ở trên nhập qua **file import** (cột `joinedAt`), an toàn sau bản vá cổng
ghi — hoặc sửa tay ở màn hồ sơ, tuỳ tiện.

## 5. Vì sao dọn dữ liệu KHÔNG đủ (đã vá riêng)

Form nhân sự đọc `1970-01-01` ra ô ngày rồi **ghi lại nguyên xi** khi ai đó mở-và-lưu.
Cửa thứ hai: `z.coerce.date()` biến số `0` thành 1970.

Cả hai đã bịt bằng `boMocUnix()` (`lib/hr/ngay-vao-lam.ts`), cắm ở
`lib/validators/employee.ts` (đường form) và route import.

⚠️ **KHÔNG áp cho `dateOfBirth`** — sinh 01/01/1970 là ngày THẬT của một người có thật.

## 6. Thứ tự chạy

1. Bản vá cổng ghi đã lên prod *(đi cùng PR sau #229)*;
2. chạy SQL mục 3 (qua Supabase SQL Editor), đối chiếu 13/14 → 0/0;
3. nhập 4 ngày thật ở mục 4;
4. chạy lại workflow ĐO — mục V6 phải ra 0/0.

Đảo thứ tự 1↔2 thì bước 2 bị bước sửa hồ sơ kế tiếp làm hỏng.
