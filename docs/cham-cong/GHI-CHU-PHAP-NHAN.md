# Ghi chú — `LegalEntity` đang được dùng thế nào (đo 09/09/2026)

Ghi theo yêu cầu chủ dự án khi chốt việc neo vai kế toán: *"Ba pháp nhân riêng biệt. Bảng
lương và file Excel cho Kế toán về sau nhiều khả năng phải tách theo PHÁP NHÂN chứ không
chỉ theo cơ sở. Đừng thiết kế theo hướng chặn điều đó."*

## 🔴 Số đo KHÔNG khớp với lời chốt — cần chủ dự án xử lý trước

Workflow `Chấm công · PROD · ĐO` (`viec = vai-ke-toan`), user `satarobo_readonly`:

| | |
|---|---|
| `LegalEntity` chưa xoá mềm trên prod | **1** |
| MST | `0402301783` — Công ty Cổ phần Công nghệ Giáo dục Sata Robo |
| `isPrimary` | `true` |
| Đơn vị trỏ tới nó | **HO, DANANG, CS1, CS2** — cả bốn |
| Đơn vị chưa gán pháp nhân | `SATAROBO` (type `ROOT`) |

**Chủ dự án nói ba pháp nhân; DB có một.** Cả CS1 và CS2 đang trỏ về đúng pháp nhân của
Hội sở, nên hiện tại **không có đường nào tách số theo pháp nhân** — mọi phép gom theo
`legalEntityId` sẽ ra một nhóm duy nhất.

Đây là dữ liệu, không phải mã: thêm hai `LegalEntity` rồi trỏ `OrgUnit.legalEntityId` của
CS1/CS2 sang là xong, không phải sửa code. Nhưng **MST của hai công ty con phải do chủ dự
án cung cấp** — `taxCode` là `@unique` và là khoá nghiệp vụ thật, đoán là hỏng dữ liệu.

## Cơ chế đang có (đọc từ schema, không suy)

```
LegalEntity 1 ──< OrgUnit.legalEntityId   (onDelete: Restrict, nullable)
```

- `LegalEntity.taxCode` `@unique` — khoá nghiệp vụ.
- `isPrimary` ép bằng partial unique index: **đúng một** pháp nhân gốc.
- Xoá mềm bằng `deletedAt`.
- `OrgUnit.legalEntityId` **nullable** ⇒ đơn vị không bắt buộc thuộc pháp nhân nào. Hiện
  chỉ `SATAROBO(ROOT)` đang null.

## Điều KHÔNG được làm khi xây bảng lương / file Excel Kế toán

**Đừng gom số theo `centerId` rồi coi đó là "theo pháp nhân".** Hôm nay hai vế trùng nhau
(mỗi cơ sở một đơn vị, tất cả cùng một pháp nhân) nên code viết theo `centerId` sẽ *chạy
đúng* và không ai phát hiện gì — cho tới ngày CS1/CS2 được trỏ sang pháp nhân riêng, lúc
đó số đã sai mà không có lỗi nào ném ra. Đúng hình dạng luật 1: đường đọc còn sống, dữ
liệu chưa tới, số im lặng.

⇒ Đường gom phải đi qua `OrgUnit.legalEntityId`, kể cả khi hôm nay nó chỉ trả về một nhóm.

## Việc còn treo

1. Chủ dự án cung cấp MST + tên pháp nhân của hai công ty con (CS1, CS2).
2. Trỏ `OrgUnit.legalEntityId` của CS1/CS2 sang pháp nhân tương ứng — script chạy-thử-trước,
   chạy tay, như mọi thay đổi dữ liệu prod khác.
3. Quyết `SATAROBO(ROOT)` gán pháp nhân nào, hay để null. (Ghi chú: `CLAUDE.md` nói cây
   mặc định **không còn** node `ROOT`; node này vẫn tồn tại trên prod — chuyện riêng, chưa
   đo, đừng gộp vào đây.)

## Ghi chú phụ, không phải lỗi mới

`Employee(SR.NV.002).centerId = HO` nhưng `orgUnitId = null`. Khớp với bản ghi mồ côi đã
biết: `Center("hoi-so")` không có `OrgUnit` nào trỏ tới (V7 cấm đơn vị HO mang `centerId`),
nên đường ghi kép không suy ra được `orgUnitId`. **Đừng nới V7 để "vá"** — đã thử ở US-05
và phải gỡ; xem `CLAUDE.md` mục Permission & tổ chức.
