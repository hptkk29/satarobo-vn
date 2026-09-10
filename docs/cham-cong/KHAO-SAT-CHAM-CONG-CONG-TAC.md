# KHẢO SÁT — chấm công đi công tác (phần A) + cột `soCapQuetKyVong` (B1)

> **Đo 10/09/2026. CHƯA viết mã, CHƯA mở PR.** Ba câu chờ chủ dự án chốt ở cuối file.
> Ràng buộc đã chốt từ trước: **KHÔNG mã QR · KHÔNG ghim toạ độ · KHÔNG thêm model đơn từ mới.**

---

## A · Hiện trạng mã ca `NG`

Nguồn: `lib/cham-cong/catalog.ts`, mục `timed("NG", "Công tác ngoài", …)`.

```
kind: TIMED
segments: 08:00–11:30 + 13:30–17:30, mỗi đoạn place: OFFSITE
defaultPlace: OFFSITE
attendanceMode: OPTIONAL
nominalMinutes: 450
dayCredit: 1        (mặc định của hàm `timed`)
```

---

## A · Bốn phép đo đổi cách nhìn bài toán

### 1. "0 cặp quét" hôm nay KHÔNG đến từ cột nào — nó đến từ `attendanceMode`

`lib/cham-cong/engine.ts`, nhánh "Ca làm việc": **toàn bộ** phép kiểm quét nằm trong
`if (a.attendanceMode === "REQUIRED")`. `NG` là `OPTIONAL` ⇒ không `KHONG_CO_LUOT`, không
`THIEU_BUOI_SANG`/`THIEU_BUOI_CHIEU`, không `DI_MUON`, không `VE_SOM`.

⇒ Bảng chốt xếp `NG` vào nhóm `soCapQuetKyVong = 0`, nhưng **mã không có cột ấy**; hành vi
"0" là hệ quả phụ của một trường khác.

### 2. 🟢 "1 công" ĐÃ ĐÚNG SẴN, và quét không đụng tới nó

`engine.ts`: `const dayCreditEarned = dayCreditExpected;` — **vô điều kiện** (luật T-01,
ghi ngay đầu file: *"CÔNG ĐẾM THEO KẾ HOẠCH… Engine KHÔNG tự …"*).

⇒ Đảo `NG` sang "1 cặp quét" **chỉ đổi CỜ, không đổi công của bất kỳ ai.** Rủi ro của
quyết định này thấp hơn vẻ ngoài — và đây là con số cần nói ra trước khi ai đó lo.

### 3. 🟢 Toạ độ từng lượt ĐÃ CÓ, không phải xây mới

`StaffTimeLog` có `latitude` · `longitude` · `accuracyMeters` · `distanceMeters` ·
`withinGeofence`; `recordTimeLog` ghi sẵn từng lượt.

### 4. 🔴 Rào THẬT nằm ở đúng một chỗ

`lib/cham-cong/timelog.ts` · `recordTimeLog`: `workLocationId` là trường **bắt buộc**, và
hàm mở đầu bằng tra `WorkLocation`; không thấy thì trả `rejectReason: "NO_WORKLOCATION"`.

Cả đường chấm công hôm nay neo vào QR:

```
màn quầy hiện QR XOAY (kiosk token 60s)
  → người quét mở trang check-in → trang cấp VÉ 120s
  → bấm nút → consumeTicket() TIÊU VÉ NGUYÊN TỬ, trả workLocationId
  → recordTimeLog()
```

Không QR ⇒ không vé ⇒ không `workLocationId` ⇒ **không ghi được lượt**.
(`lib/attendance/checkin-action.ts` là Server Action duy nhất gọi `recordTimeLog`.)

**Nhưng schema đã mở sẵn cửa:**

| chỗ | trạng thái |
|---|---|
| `StaffTimeLog.workLocationId` | `String?` — **nullable** |
| chú thích cột `StaffTimeLog.centerId` trong `schema.prisma` | *"không WorkLocation thì assignment.centerId, rồi home, rồi hoi-so"* — đã lường trước đúng ca này |
| `StaffTimeLogSource` | `TICKET` · `LEGACY_CHECKIN` · `MANUAL_ADJUST` · `KIOSK` — đường công tác cần một giá trị nữa |
| `verifyMethod` · `verifyRefId` · `verifyScore` | đã có, chú thích ghi *"chỗ cắm đợt 2"* |
| `recordRejectedLog` | đã nhận `workLocationId: null` (checkin-action dùng khi vé hỏng) |

⇒ Việc phải làm nằm ở **tầng hàm**, không phải tầng bảng. Không cần migration cho phần lõi.

### 5. 🔴 Một lệch prod đã ghi mà chưa xử — đúng vào `NG`

`docs/cham-cong/BANG-MA-CA-CHOT.md`, mục "Lệch giữa seed và prod":

> `HC` `12` `21` `2C` `NG` — `place` **bên trong `segments`**: seed **có**
> (`ASSIGNED` · `CENTER:CS1` · `CENTER:CS2` · `ANY_CENTER` · `OFFSITE`), prod **MẤT HẾT**.
> Ai đúng: **seed** 🔴

Tức trên prod, `NG` không còn mang `OFFSITE` ở đoạn ca. Phần A dựng trên `NG` mà không xử
chỗ này là dựng trên một mã ca **prod đang hiểu khác** file seed.

---

## A · Nơi đặt hai nút

`components/admin/cham-cong/me-nav.tsx` — khối "Của tôi": hai tab (`Lịch ca` →
`/cham-cong/lich-ca`, `Đơn của tôi` → `/don-tu/cua-toi`) + một nút `Chấm công` trỏ
`/cham-cong/checkin`.

⚠️ File này là **LỐI VÀO DUY NHẤT** của mấy route đã rời sidebar, và `href` phải là **chuỗi
literal ngay sau `href:`** — `components/admin/nav-coverage.test.ts` quét đúng vị trí đó.
Thêm lối vào mới phải theo đúng khuôn ấy, không thì màn thành mồ côi.

---

## B1 · Cột `soCapQuetKyVong`

**Thiết kế đã duyệt, chưa cắm** — bảng ba giá trị nằm ở `BANG-MA-CA-CHOT.md`, mục cùng tên.

**Trong mã: không tồn tại.** Chỗ duy nhất nhắc tới là `lib/cham-cong/catalog.test.ts`:
`expect(BANG).toContain("soCapQuetKyVong")` — chỉ kiểm **tài liệu có chứa chuỗi đó**, không
kiểm hành vi nào. (Đúng loại test luật 11 gọi là mong manh nhất.)

Hành vi hôm nay nằm ở **HAI** cơ chế rời:

| giá trị thiết kế | cơ chế thật hôm nay |
|---|---|
| `0` | `attendanceMode` = `OPTIONAL` / `NONE` |
| `1` vs `2` | `mergeIntervals(segs)` — cắt theo **đoạn LIỀN NHAU**, không theo *"khoảng hở lớn nhất"* như thiết kế viết |

⇒ Cắm cột này là **thay hai cơ chế**, không phải thêm một cột.

### Một chỗ tưởng là bug, đo ra KHÔNG phải

Chốt ghi `CG` = **1** cặp quét, nhưng `mergeIntervals` cho `CG` ra **hai** cụm (09:00–11:30
và 14:00–17:45 rời nhau). Chạy thử ca "vào 09:00, ra 17:45" (một cặp duy nhất): dòng
`const covered = pairedIntervals.some((p) => overlap(p, blk) > 0);` cứu — cặp ấy phủ cả hai
cụm nên `covered` đúng ở cả hai, và nhánh `if (firstIn === undefined && !covered)` không
chạy ⇒ **không** ra cờ `THIEU_BUOI_*`.

**Không phải bug sống.** Nhưng con số "1" của chốt **không nằm ở đâu trong mã** — nó đúng
nhờ một dòng phòng hờ, không nhờ ai khai. Đúng loại "đúng vì may" mà luật 17 bảo đừng ghi
thành số trong tài liệu rồi yên tâm.

---

## Ba câu CHỜ CHỐT — đo xong nhưng không tự quyết được

1. **Lượt công tác đi đường nào?** Qua `recordTimeLog` với `workLocationId: null`, hay một
   hàm riêng?
   · Đi chung ⇒ phải nới một tham số vốn **bắt buộc** — ngược luật 7, và mọi call site cũ
     mất lưới `tsc`.
   · Tách ⇒ có **hai** đường ghi `StaffTimeLog`, và mọi luật hậu kiểm phải nhớ cả hai.

2. **`NG` sang "1 cặp quét" làm khi nào?** Đổi `attendanceMode` `OPTIONAL → REQUIRED` ngay,
   hay đợi cột `soCapQuetKyVong` (B1) rồi làm một lượt?
   · Làm trước ⇒ `NG` mượn **cơ chế sai** để ra **kết quả đúng** — đúng hình dạng đã đẻ ra
     bug `isLeave` hôm 10/09.

3. **Lệch `place` của `NG` trên prod** — xử trong phần A này, hay tách vé riêng?
