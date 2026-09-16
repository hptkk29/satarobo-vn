# Vé — danh sách ngày lễ trên prod gần như chắc chắn thiếu

**Mở 09/09/2026 · CHƯA LÀM · chờ danh sách chính thức từ Nhân sự**

## Số đo

Workflow `Chấm công · PROD · ĐO` (`viec = danh-muc-nen`), user `satarobo_readonly`,
09/09/2026:

| | |
|---|---|
| Tổng dòng `Holiday` trên prod | **1** |
| Năm 2026 | **1** |
| Năm 2027 | **0** |
| Có `AuditLog CREATE` | 0 |
| Không có audit | 1 |
| `createdAt` sớm nhất | `2026-08-30T08:13:18Z` |

Một ngày lễ cho **cả năm** là con số không thể đúng — Việt Nam có ~11 ngày nghỉ lễ theo
luật, chưa kể ngày nghỉ bù.

## Vì sao KHÔNG gộp vào việc nhập danh mục nền

**`Holiday` không thuộc phạm vi `prisma/seed-cham-cong.ts`.** Đo bằng cách đọc chính file
đó: nó gọi đúng 5 hàm seed — `seedShiftTemplates`, `seedLeaveTypes`, `seedWorkLocations`,
`seedSessionCategories`, `seedTeachingCreditTypes`. Không có ngày lễ.

Nguồn ghi thật của bảng này (đo bằng `rg`):

| Đường ghi | File |
|---|---|
| màn quản trị | `app/(admin)/admin/holidays/_actions.ts` |
| nhập hàng loạt | `app/api/admin/import/holidays/route.ts` |
| seed UAT (chỉ local) | `prisma/seed-uat/01-nen.ts` |

Dòng duy nhất trên prod **không có audit CREATE**, tức nó không vào bằng màn quản trị.
Nhiều khả năng là đường nhập hàng loạt (route đó không ghi audit) — chưa xác định chắc.

⚠️ **Không có danh mục ngày lễ trong mã nguồn để mà seed.** Khác hẳn 5 nhóm kia: ngày lễ
là dữ liệu vận hành theo năm, do Nhân sự công bố, không phải hằng số của hệ thống. Tự điền
theo lịch nhà nước là bịa dữ liệu công ty chưa duyệt.

## Câu phải hỏi Nhân sự trước khi làm

1. Danh sách ngày nghỉ lễ **chính thức của công ty** năm 2026 và 2027 — kèm ngày nghỉ bù,
   vì nghỉ bù không suy ra được từ luật.
2. Ngày nghỉ riêng của công ty ngoài lịch nhà nước (nghỉ Tết dài hơn, nghỉ thành lập…)?
3. Ngày lễ có khác nhau giữa Hội sở / CS1 / CS2 không? — kiểm `Holiday` có cột phân theo
   đơn vị không trước khi hứa gì.

## Hệ quả nếu để nguyên

Chưa đo hết. Cần kiểm trước khi kết luận: chỗ nào đọc `Holiday` để tính công, và một ngày
lễ **thiếu** làm số công của ngày đó ra sai theo chiều nào. Ghi ở đây để lần sau không
phải bắt đầu từ con số không — **đừng kết luận "không ảnh hưởng" khi chưa đo** (luật 1).

## Liên hệ

- Phép đo đầy đủ 5 nhóm danh mục nền: `scripts/do-danh-muc-nen.ts`, mục 6.
- Cổng cảnh báo danh mục rỗng (`lib/cham-cong/suc-khoe-danh-muc.ts`) **cố ý không canh
  `Holiday`** — nó không có "số dòng đúng" để so, và một cảnh báo không nói được ngưỡng
  thì chỉ là tiếng ồn.
