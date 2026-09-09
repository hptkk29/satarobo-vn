# Ghi chú — `LegalEntity` đang được dùng thế nào (đo 09/09/2026)

Ghi theo yêu cầu chủ dự án khi chốt việc neo vai kế toán: *"Ba pháp nhân riêng biệt. Bảng
lương và file Excel cho Kế toán về sau nhiều khả năng phải tách theo PHÁP NHÂN chứ không
chỉ theo cơ sở. Đừng thiết kế theo hướng chặn điều đó."*

## ⏸️ SỐ PHÁP NHÂN THẬT — CHƯA XÁC NHẬN. Đừng sửa gì cho tới khi có câu trả lời.

Chủ dự án nói "ba pháp nhân" hôm 09/09, rồi **tự rút lại ngay trong ngày**: CS1 và CS2 có
thể là **CHI NHÁNH hạch toán phụ thuộc** chứ không phải công ty riêng có MST riêng. Nếu
vậy thì **một `LegalEntity` là ĐÚNG và không có gì phải sửa**.

Đang chờ chủ dự án hỏi chị Huệ (kế toán, SR.NV.002) rồi báo lại.

> **ĐỪNG thêm `LegalEntity` nào. ĐỪNG trỏ lại `OrgUnit.legalEntityId` của đơn vị nào.**

Phần dưới là SỐ ĐO, vẫn đúng bất kể câu trả lời.

## Số đo hiện trạng (09/09/2026)

Workflow `Chấm công · PROD · ĐO` (`viec = vai-ke-toan`), user `satarobo_readonly`:

| | |
|---|---|
| `LegalEntity` chưa xoá mềm trên prod | **1** |
| MST | `0402301783` — Công ty Cổ phần Công nghệ Giáo dục Sata Robo |
| `isPrimary` | `true` |
| Đơn vị trỏ tới nó | **HO, DANANG, CS1, CS2** — cả bốn |
| Đơn vị chưa gán pháp nhân | `SATAROBO` (type `ROOT`) |

Cả CS1 và CS2 đang trỏ về đúng pháp nhân của Hội sở, nên hiện tại **không có đường nào
tách số theo pháp nhân** — mọi phép gom theo `legalEntityId` ra một nhóm duy nhất.

Nếu về sau xác nhận là nhiều pháp nhân thì đó là **dữ liệu, không phải mã**: thêm
`LegalEntity` rồi trỏ `OrgUnit.legalEntityId` sang là xong. Nhưng MST phải do chủ dự án
cung cấp — `taxCode` là `@unique` và là khoá nghiệp vụ thật, **đoán là hỏng dữ liệu**.

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

1. **Chờ trả lời:** CS1/CS2 là công ty riêng có MST riêng, hay chi nhánh hạch toán phụ
   thuộc? Chủ dự án hỏi chị Huệ. **Cho tới lúc đó, một `LegalEntity` được coi là ĐÚNG.**
2. Chỉ khi câu 1 trả lời là "công ty riêng": xin MST + tên pháp nhân, rồi trỏ
   `OrgUnit.legalEntityId` bằng script chạy-thử-trước, chạy tay.
3. Quyết `SATAROBO(ROOT)` gán pháp nhân nào, hay để null. (Ghi chú: `CLAUDE.md` nói cây
   mặc định **không còn** node `ROOT`; node này vẫn tồn tại trên prod — chuyện riêng, chưa
   đo, đừng gộp vào đây.)

## Ghi chú phụ, không phải lỗi mới

`Employee(SR.NV.002).centerId = HO` nhưng `orgUnitId = null`. Khớp với bản ghi mồ côi đã
biết: `Center("hoi-so")` không có `OrgUnit` nào trỏ tới (V7 cấm đơn vị HO mang `centerId`),
nên đường ghi kép không suy ra được `orgUnitId`. **Đừng nới V7 để "vá"** — đã thử ở US-05
và phải gỡ; xem `CLAUDE.md` mục Permission & tổ chức.
