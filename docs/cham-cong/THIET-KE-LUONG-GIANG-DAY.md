# THIẾT KẾ TẦNG QUY ĐỔI TIỀN — LƯƠNG GIẢNG DẠY

| | |
|---|---|
| **Mã tài liệu** | TK-LUONG-GD-001 |
| **Ngày** | 07/09/2026 |
| **Căn cứ** | SR.QD.230 + 09 phụ lục · BA-CC-CD-001 + phụ lục đính chính · chốt chủ dự án 07/09 |
| **Trạng thái** | ⏸ **BẢN THIẾT KẾ — CHƯA CODE.** Chờ duyệt |

> Chủ dự án yêu cầu: *"Đừng dựng bảng lương ngay. Trước hết đưa tôi bản thiết kế… Dừng ở bản
> thiết kế. Chờ tôi duyệt rồi mới code."*

---

## 0. Hai điều quyết định toàn bộ thiết kế này

**(1) Chốt của chủ dự án 07/09 — tách hai tầng:**

```
TẦNG GHI NHẬN     theo BUỔI cho TẤT CẢ. Mọi giáo viên, mọi contractType.
                  Một luồng dữ liệu duy nhất. KHÔNG rẽ nhánh ở tầng này.
        │
        ▼
TẦNG QUY ĐỔI TIỀN rẽ theo contractType — và CHỈ ở đây.
                  · FT/PT  → buổi để đối chiếu định mức; TIỀN theo lớp/tháng
                  · Thời vụ & trợ giảng → tiền = buổi × hệ số × đơn giá Rank
```

**(2) Khuôn của repo, đã có sẵn ở module thanh toán — bắt chước, đừng nghĩ kiểu mới:**
append-only + snapshot cứng + khoá kỳ. Nhưng **bắt chước có chọn lọc**: khuôn đó đang có một
lỗ hổng nghiêm trọng phải tránh (§3.4).

---

## 1. Sơ đồ model

```
┌─ TẦNG GHI NHẬN ─ không có chữ "contractType" ở bất kỳ đâu ────────────────────┐
│                                                                               │
│  ClassSession ──┐                                                             │
│   · sessionCategoryId  (phân loại buổi — đã có, 07/09)                        │
│   · rosterSize         (sĩ số biên chế chốt cứng — đã có, 07/09)              │
│   · actualStartAt/EndAt                                                       │
│                 ├──▶  ★ SessionTeachingAssignment  (CHƯA CÓ — gỡ chặn C1)     │
│  TrialClassSession ┘      ai dạy buổi nào, vai trò gì · nhiều người/buổi      │
│                                    │                                          │
│                                    ▼                                          │
│                          ★ TeachingRecord  (CHƯA CÓ)                          │
│                          1 dòng = 1 người × 1 buổi × 1 vai                    │
│                          snapshot: categoryCode · rosterSize · credit         │
└───────────────────────────────────┬───────────────────────────────────────────┘
                                    │
                    ┌───────────────┴────────────────┐
                    │  ★ lib/payroll/mo-hinh.ts      │  ◀── ĐIỂM RẼ NHÁNH DUY NHẤT
                    │     chonMoHinh(employee)       │      (§2)
                    └───────────────┬────────────────┘
                                    │
┌─ TẦNG QUY ĐỔI TIỀN ───────────────▼───────────────────────────────────────────┐
│                                                                               │
│   ★ PayrollRateCard          ★ PayrollPeriod  ──1:n──▶  ★ PayrollLine        │
│     bảng giá có hiệu lực       kỳ lương                    BÚT TOÁN            │
│     (khuôn CommissionRate-     schemaVersion               append-only         │
│      Config: effectiveFrom/To) status/lockedAt             snapshot đơn giá    │
│                                                            amount Int (±)      │
└───────────────────────────────────────────────────────────────────────────────┘

★ = model mới
```

### 1.1 `SessionTeachingAssignment` — ai dạy buổi nào, vai gì

| Trường | Ghi chú |
|---|---|
| `sessionSource` | `CLASS` \| `TRIAL` — hai model buổi khác nhau, quy về một |
| `sessionId` · `userId` | |
| `role` | `MAIN` · `SUBSTITUTE` · `ASSISTANT` · `MAIN_TRAINEE` · `ASSISTANT_TRAINEE` |
| `isSecondment` | Cơ sở của lớp ≠ cơ sở chủ quản người dạy |
| `replacedUserId` | Khi `role = SUBSTITUTE` |
| `@@unique([sessionSource, sessionId, userId])` | Một người một vai trên một buổi |

**Vì sao cần**, khi `ClassSession` đã có `actualTeacherId`/`substituteTeacherId`: hai cột đó chỉ
chứa **một** người, và **trợ giảng chỉ tồn tại ở cấp LỚP**. Hệ quả đang chạy hôm nay: đổi trợ
giảng giữa khoá là **quy lại cả những buổi cũ**. Hôm nay vô hại vì dòng `TRO_GIANG` để
`countsInPeriod = false`; nối vào tiền là biến nó thành lỗi tính tiền.

**Chuyển tiếp:** dữ liệu cũ không có bảng này. Bộ sinh `TeachingRecord` đọc bảng này **nếu có
dòng**, không thì rơi về suy luận hiện tại (`cong-day-db.ts`). Enum vai mở rộng thêm hai giá trị
`*_TRAINEE` vì bảng đơn giá PL03 §1 là **Rank × 4 vai**, không phải 3.

### 1.2 `TeachingRecord` — tầng ghi nhận

| Trường | Ghi chú |
|---|---|
| `sessionSource` · `sessionId` · `userId` · `role` | |
| `sessionDate` · `centerId` · `orgUnitId` | Cơ sở **của lớp**; cơ sở chủ quản người dạy nằm ở hồ sơ |
| 🔒 `categoryCode` | Snapshot mã phân loại buổi |
| 🔒 `rosterSize` | Snapshot sĩ số biên chế (từ `ClassSession.rosterSize`) |
| 🔒 `rosterSource` | Số đo hay số suy đoán — **đi kèm suốt**, không rụng dọc đường |
| `minutes` | Từ `actualStartAt/EndAt`, rơi về giờ lớp |
| 🔒 `creditFactor` · `credit` | Hệ số loại công dạy tại thời điểm sinh, và tích |
| `@@unique([sessionSource, sessionId, userId])` | Chống đếm hai lần |

**Sinh khi nào:** buổi chuyển `COMPLETED` (cùng chỗ đang chốt `rosterSize`), và sinh lại được
theo yêu cầu **chừng nào kỳ lương chưa khoá**.

🔴 **Ràng buộc kiến trúc:** ở tầng này **không được có chữ `contractType`**, không có `salaryRank`,
không có `Employee`. Đề xuất chặn bằng **test tĩnh** theo đúng khuôn `nav-coverage` / `bang-coverage`
đang chạy: quét `lib/payroll/ghi-nhan/**` và chỗ ghi `TeachingRecord`, thấy các định danh đó thì đỏ.
Ràng buộc bằng lời hứa thì sáu tháng nữa sẽ có người thêm một `if`.

### 1.3 `PayrollRateCard` — bảng giá có hiệu lực

Khuôn chép từ `CommissionRateConfig` (đã chạy, có `effectiveFrom`/`effectiveTo`).

| Trường | Ghi chú |
|---|---|
| `kind` | `RANK` (16 ô: Rank × 4 vai) · `CLASS_MONTH` (14 ô: Nhóm × trợ giảng × bậc sĩ số) · `CATEGORY_FACTOR` (100/75/120%) · `DUTY_SHIFT` (ca trực PL05) · `QUOTA_OVERAGE` (80.000đ/buổi) |
| `key` Json | `{rank, role}` \| `{group, hasAssistant, sizeBand}` \| `{categoryCode, sizeBand}` |
| `value` Int/Float | Tiền (Int VND) hoặc hệ số (Float) |
| `orgUnitId?` | null = toàn hệ thống; có giá trị = đè theo đơn vị |
| `effectiveFrom` · `effectiveTo` · `documentNo` | `SR.QD.230.003`… |
| `createdById` · `approvedById` | **Hai người** mới đổi được bảng giá |

⚠️ **`orgUnitId` phải có ngay từ bản đầu, kể cả khi hôm nay chưa dùng.** Bài học đã burn ở
`lib/crm/commission.ts`: hằng số trần trong mã khiến người vận hành sửa ở màn Cấu hình mà đường ghi
vẫn chặn theo số cũ. Và ⚠️ **`saveCenterSettingAction` hiện KHÔNG CÓ NGƯỜI GỌI** — nếu thiết kế hứa
"đè theo cơ sở" thì phải làm luôn màn đặt, không thì khai `orgUnitId` chỉ để đó và nói thẳng là
chưa dùng.

### 1.4 `PayrollPeriod` — kỳ lương

| Trường | Ghi chú |
|---|---|
| `periodKey` | `"2026-09"` |
| `orgUnitId?` | **Xem §5 — câu chưa quyết** |
| `status` | `OPEN` → `LOCKED` → `PAID` |
| 🔴 `schemaVersion` Int | Bắt buộc **ngay từ bản đầu** — xem §3.5 |
| `lockedAt` · `lockedById` · `lockReason` | |
| `totalsJson` | Số tổng đóng băng lúc khoá |

### 1.5 `PayrollLine` — bút toán, append-only

| Trường | Ghi chú |
|---|---|
| `periodId` · `userId` | |
| `kind` | `TEACHING_PER_SESSION` · `TEACHING_PER_CLASS_MONTH` · `QUOTA_OVERAGE` · `DUTY_SHIFT` · `ALLOWANCE` · `ADJUSTMENT` |
| `amount` Int | **VND, CÓ THỂ ÂM.** Toàn schema dùng `Int` cho tiền |
| 🔒 `rateSnapshot` Json · `factorSnapshot` Float · `rateCardId` | Đơn giá + hệ số **đã áp**, không tra lại |
| `sourceKey` | Khoá idempotency: `teachingRecordId`, hoặc `"class:<id>:2026-09"` |
| `adjustmentOfId?` | Trỏ dòng gốc — kể cả dòng ở **kỳ khác** |
| `reason?` | **Bắt buộc** khi `kind = ADJUSTMENT` |
| `centerId` · `orgUnitId` | Hạch toán ngân sách (Phần II.5) |
| `@@unique([periodId, userId, kind, sourceKey])` | Sinh lại kỳ không đẻ dòng trùng |

---

## 2. Điểm rẽ nhánh `contractType` — một chỗ, và chỉ một

```ts
// lib/payroll/mo-hinh.ts — THUẦN, không chạm DB, test không cần Postgres.
export type MoHinhLuong = "PER_SESSION" | "PER_CLASS_MONTH" | "KHONG_AP_DUNG";

export function chonMoHinh(hoSo: HoSoLuong): MoHinhLuong
```

**Đây là hàm duy nhất trong toàn hệ thống đọc `contractType` để quyết cách tính tiền.** Mọi nơi
khác nhận `MoHinhLuong` đã quyết sẵn.

| `contractType` | Mô hình | Căn cứ |
|---|---|---|
| `FULLTIME` | `PER_CLASS_MONTH` | PL01 + PL04 §A.1 |
| `PARTTIME` | `PER_CLASS_MONTH` | PL02 + PL04 §A.1 |
| `FREELANCE` | `PER_SESSION` | PL03 |
| `INTERN` · `THU_VIEC` · `CHINH_THUC_*` | ❓ **chưa quyết** — §5 Q3 | — |
| chưa khai / không có hồ sơ | ❓ **chưa quyết** — §5 Q4 | — |

**RULE-CD-07 (Phần II.3) — "hai mô hình không áp dụng đồng thời"** ép ở đây: hàm trả **đúng một**
giá trị cho một người trong một kỳ. Không có đường nào cho một người ra hai mô hình.

**Vì sao tách thành hàm thuần chứ không viết inline:** nó là chỗ duy nhất luật ở trên có thể bị
phá, nên phải là chỗ duy nhất phải canh. Cùng khuôn với `lib/cham-cong/noi-quy.ts` và
`lib/payments/method-scope.ts` — hai lần trước đều đúng.

### 2.1 Hai nhánh quy đổi

**Nhánh A — theo buổi** (thời vụ, CTV, trợ giảng):
```
tiền 1 dòng = RateCard[RANK][rank, role]
            × RateCard[CATEGORY_FACTOR][categoryCode, sizeBand(rosterSize)]
            × credit
```

**Nhánh B — theo lớp/tháng** (FT/PT):
```
đơn giá lớp = RateCard[CLASS_MONTH][group, hasAssistant, sizeBand(rosterSize)]
tỷ lệ       = số buổi người đó THỰC DẠY lớp đó trong kỳ ÷ số buổi KẾ HOẠCH của lớp trong kỳ
tiền 1 lớp  = đơn giá lớp × tỷ lệ
```
`sizeBand` lấy từ `rosterSize` **đã snapshot**, không tra lại danh sách lớp. `group` (Nhóm 1 ≥6
tháng dạy chính / Nhóm 2 <6 tháng) — ❓ **chưa có cột nào** ghi ngày bắt đầu dạy chính (§4).

**Bộ đếm định mức** (chỉ FT/PT): đếm `TeachingRecord` có `categoryCode` thuộc nhóm
`countsTowardQuota`; trong định mức ⇒ **0đ**; vượt ⇒ `(n − Q) × RateCard[QUOTA_OVERAGE]`.

---

## 3. Chốt sổ — và vì sao số đã chốt KHÔNG bị đổi ngược

> Câu hỏi của chủ dự án: *"sau khi chốt thì bản ghi buổi/hệ số thay đổi có ảnh hưởng ngược không?"*

## **KHÔNG.** Bốn cơ chế, độc lập nhau, mỗi cái đủ chặn một đường.

### 3.1 Snapshot cứng trên từng dòng
`PayrollLine` mang `rateSnapshot` + `factorSnapshot` + `rateCardId`. Đọc lại **không tra bảng giá**.
Sửa bảng giá về sau không chạm được dòng đã sinh — đúng tinh thần PL09 §4 Bước 4: *"Rank mới áp
dụng cho kỳ lương liền kề sau ngày phê duyệt, không hồi tố."* Khuôn này đã chạy ở
`OrderItem.unitPrice` và `Enrollment.finalPrice`.

### 3.2 Sĩ số đã đóng băng từ tầng dưới
`rosterSize` chốt lúc hoàn tất buổi (đã làm 07/09). Học viên vào lớp tháng 10 **không** đổi được
sĩ số buổi tháng 8. Đây là chỗ chặn thấp nhất, và là chỗ chắc nhất.

### 3.3 Khoá kỳ ép ở tầng hàm nghiệp vụ
`status = LOCKED` ⇒ mọi đường sinh/sửa `PayrollLine` từ chối. Khuôn giống `AttendancePeriod` và
`CommissionStatement` đang chạy.

⚠️ **Sửa một lỗi của khuôn cũ:** `buildPeriodSummary` hiện dựng số **NGOÀI** transaction khoá — giữa
lúc dựng và lúc khoá vẫn có thể có lượt ghi chen vào. Thiết kế này **khoá trước, dựng số sau, trong
cùng một transaction**.

### 3.4 🔴 Bút toán điều chỉnh PHẢI ĐƯỢC CỘNG — lỗ hổng của khuôn thanh toán, không chép lại

**Số đo được ở module thanh toán hôm nay: bút toán `ADJUSTED` KHÔNG CÓ BẤT KỲ CHỖ ĐỌC NÀO.**

`adjustPayment` ghi một dòng `Payment` mới với `accountantStatus = ADJUSTED` và `amount` âm, trỏ về
dòng gốc qua `adjustmentOfId`. Nhưng **mọi phép cộng tiền chỉ lấy `CONFIRMED`** —
`lib/finance/debt.ts:134`, `lib/portal/billing-student.ts:55`, `lib/finance/refund.ts:81`,
`lib/reports/trung-tam.ts:66-72`. Dòng gốc vẫn `CONFIRMED` nên vẫn cộng đủ; dòng điều chỉnh không ai
cộng.

⇒ **Sau khi "điều chỉnh", công nợ và doanh thu không đổi một đồng nào.** Đó là một nút bấm giả.
Nặng hơn: `confirmPayment` từ chối mọi bản ghi không ở `PENDING`, mà `adjustPayment` tạo thẳng ở
`ADJUSTED` ⇒ **`ADJUSTED` là ngõ cụt trạng thái**, không bao giờ trở thành `CONFIRMED` được kể cả
khi sau này có người sửa công thức đọc. `REFUNDED` cũng vậy: hoàn tiền không làm công nợ tăng lại.

**Thiết kế này tránh bằng cách bỏ hẳn ý tưởng "trạng thái quyết định có được cộng hay không":**

```
Tổng phải trả của một kỳ = Σ amount của MỌI PayrollLine thuộc kỳ đó.
```

Không lọc theo trạng thái. Không có dòng nào "tồn tại nhưng không được cộng". Bút toán điều chỉnh
là một `PayrollLine` **y hệt mọi dòng khác**, chỉ khác `kind = ADJUSTMENT` và `amount` âm — nên
**không thể bị bỏ quên**, vì bỏ quên nó là bỏ quên cả bảng lương.

Kèm theo: `adjustPayment` hiện **không kiểm trạng thái bản gốc** (không chặn điều chỉnh một khoản
đang `PENDING`, đã `REJECTED`, hay đã là `ADJUSTED`) ⇒ chuỗi điều chỉnh chồng điều chỉnh không giới
hạn. Ở đây không cần chặn chuỗi: tổng luôn đúng vì mọi dòng đều được cộng.

### 3.5 `schemaVersion` ngay từ bản đầu

`AttendancePeriod.summaryJson` là **hợp đồng không có phiên bản**, và đã phải vá tay:
`thong-ke/page.tsx:108-110` — *"Kỳ CHỐT TRƯỚC 07/09 có summaryJson đóng băng theo hình CŨ — không có
noiQuy. Đọc thẳng `r.noiQuy` là TypeError và cả màn rơi vào error boundary."*

Mọi JSON đóng băng của lương mang `schemaVersion` từ dòng đầu tiên.

⚠️ Và **`summaryJson` chỉ có MỘT ô** — mở lại rồi chốt lại là **ghi đè số cũ**, nhật ký chỉ giữ 4 con
số tổng chứ không giữ chi tiết theo người. Lương **không** dùng một ô JSON bị đè: bản đóng băng là
chính các dòng `PayrollLine`, vốn append-only.

---

## 4. Điều chỉnh sau chốt sổ

> Nguyên tắc chủ dự án đặt: *"bản đã chốt bất biến, sai thì ghi bút toán bổ sung vào kỳ hiện tại."*

```
Kỳ 09/2026 (LOCKED)                      Kỳ 10/2026 (OPEN)
  PayrollLine #123                          PayrollLine #456
   userId: GV-A                              userId: GV-A
   kind: TEACHING_PER_CLASS_MONTH            kind: ADJUSTMENT
   amount: +1.000.000                        amount: −250.000
   ▲                                         adjustmentOfId: #123
   │                                         reason: "Lớp CS1-A3 dạy 3/4 buổi,
   └───────────── trỏ về ────────────────     chốt nhầm thành 4/4"
   BẤT BIẾN. Không sửa, không xoá.           periodId: kỳ 10
```

**Luật:**
1. Kỳ `LOCKED` — dòng **không sửa, không xoá, không thêm**. Không có ngoại lệ.
2. Sai sót ⇒ dòng `ADJUSTMENT` mới ở **kỳ đang OPEN**, `amount` chênh lệch (âm hoặc dương),
   `adjustmentOfId` trỏ dòng gốc, `reason` **bắt buộc**.
3. Bút toán bổ sung **chỉ nhận `amount` + `reason`**; mọi thứ khác (`userId`, `centerId`,
   `orgUnitId`) **kế thừa từ dòng gốc**.
   → Bài học `Payment.method`: Server Action là endpoint HTTP riêng, nên trường nào cho gõ tự do
   thì có người gọi thẳng và ghi giá trị tuỳ ý. Cách vá bên đó là **gỡ hẳn field khỏi schema đầu
   vào**. Chép nguyên cách vá.
4. **Không** có cơ chế "mở lại kỳ đã trả lương". Mở lại kỳ `LOCKED` chưa `PAID` thì được (quyền cao
   + lý do, ghi nhật ký); đã `PAID` thì đường duy nhất là bút toán bổ sung.

---

## 5. Bảy câu chưa quyết được từ mã nguồn

| # | Câu hỏi | Đề xuất |
|---|---|---|
| **Q1** | Kỳ lương theo **cơ sở** (như `AttendancePeriod`, `@@unique[centerId, periodKey]`) hay **toàn hệ thống** (như `CommissionStatement`)? Định mức 50 buổi/tháng là của **một NGƯỜI**; đọc công theo kỳ-cơ-sở thì giáo viên dạy chéo hai cơ sở có thể "vượt định mức" **hai lần**. | **Toàn hệ thống**, `centerId` nằm trên từng **dòng** để hạch toán ngân sách (Phần II.5). Một người ⇒ một bộ đếm định mức. |
| **Q2** | Buổi **trải nghiệm** đã có hoa hồng `TRIAL_TEACHER` 1% học phí (`lib/crm/trial-teacher-commission.ts`). Lương cũng trả công dạy cho buổi đó ⇒ **trả hai lần**. | Chốt **một** đường. Cảnh báo này đã được ghi sẵn trong mã: *"gộp hai thứ đó là trả hai lần cho cùng một buổi"*. Cần chính sách, không phải code. |
| **Q3** | 5 giá trị `ContractType` còn lại (`INTERN`, `THU_VIEC`, `CHINH_THUC_XAC_DINH`, `CHINH_THUC_KHONG_XAC_DINH`, và người kiêm nhiệm) xếp vào mô hình nào? Hai loại `CHINH_THUC_*` nghe như Fulltime nhưng **không phải** giá trị `FULLTIME`. | Cần Nhân sự ánh xạ. Đây là ánh xạ **dữ liệu**, không phải mã. |
| **Q4** | Người **chưa khai `contractType`** (3/15 trên prod) và người dạy **không có hồ sơ Employee** (`User.employeeId` nullable) xử lý sao? | `KHONG_AP_DUNG` + hiện cờ **"chưa đủ dữ liệu để tính lương"**, KHÔNG mặc định Fulltime. Mặc định im lặng là trả sai tiền cho người thật. |
| **Q5** | **Rank 1–4** và **Bậc GV1–GV4 / Mức 1–2** lưu ở đâu? `salaryRank` là 1–9, `salaryLevel` là 1–5, dải không khớp, và `lib/elearning/assignment-rule.ts` đang đọc chúng với **nghĩa khác**. | **ĐO trước** phân bố thật trên prod, rồi Nhân sự quyết: dùng lại + nới dải / ánh xạ / thêm cột. Đừng chọn hộ. |
| **Q6** | **Mức lương cơ bản** (số tiền theo Bậc/Mức) lưu ở đâu? Hệ thống **không có mức lương ở bất kỳ đâu** — `bhxhBase` là mức đóng BHXH, không phải lương. | Bảng version theo thời gian (khuôn `CommissionRateConfig`), **không** thêm cột tiền vào `Employee` — lương đổi theo thời gian và cần lịch sử. |
| **Q7** | **Làm tròn.** Tiền là `Int` VND toàn schema; công là `Float` (`dayCreditEarned`). `credit × đơn giá` ra số lẻ. | Làm tròn **tại lúc ghi `PayrollLine`**, đến **đồng**, và ghi cả số chưa làm tròn vào `rateSnapshot` để đối chiếu. Làm tròn ở tầng hiển thị là tổng không khớp chi tiết. |

---

## 6. Những gì SR.QD.230 quy định mà thiết kế này CHƯA phủ

> Chủ dự án yêu cầu mục này. Chia ba nhóm theo lý do chưa phủ.

### 6.1 Chưa có DỮ LIỆU (không phải chưa có code)

| Điều khoản | Thiếu gì |
|---|---|
| PL04 §A.1 — **Nhóm 1 vs Nhóm 2** (dạy chính ≥6 tháng) | Không cột nào ghi *ngày bắt đầu dạy chính*. `Employee.joinedAt` là ngày vào công ty, khác nghĩa |
| PL01 §3 · PL02 §3 — **hội nhập 60 ngày → 85% lương cơ bản** | Không có mốc bắt đầu hội nhập, và không có lương cơ bản để nhân 85% |
| PL03 §3 — **xét Rank cần Rate ≥ 90%**; §3 — **Rate < 80% hạ 1 Rank** | Hệ thống **không có chỉ số Rate** của giáo viên |
| Phần II.2 — **buổi tối thiểu 90 phút** | `actualStartAt/EndAt` gần như luôn rỗng ⇒ không kiểm được (xem phụ lục đính chính Đ-2) |
| PL04 §A.1 — **tỷ lệ hoàn thành** = buổi thực dạy ÷ **buổi kế hoạch** của lớp trong kỳ | "Buổi kế hoạch của lớp trong tháng" lấy từ đâu chưa chốt (BA §13 Q4) |
| PL06 — phụ cấp Trưởng nhóm, **prorate theo ngày công** | Không cột nào đánh dấu ai là Trưởng nhóm Giáo viên |

### 6.2 Ngoài phạm vi đợt này, nhưng SR.QD.230 có quy định

| Điều khoản | Nội dung |
|---|---|
| PL04 §B.1 | Thưởng doanh thu 1% (tái tục / trial chuyển đổi) — đã có đường hoa hồng riêng |
| PL04 §B.2 | Thưởng thành tích thi đấu 300k → 1,5tr |
| PL04 §B.3 | Thưởng chất lượng Rate = `HVĐG × 10.000 × Rate` |
| PL04 §B.4–B.6 | Thưởng dự án · Giáo viên xuất sắc năm |
| PL05 §2 | Ca trực trải nghiệm 80k offline / 40–70k online — model có (`kind = DUTY_SHIFT`), **chưa có cách phân biệt ca trực với ca thường trên lưới phân ca** |
| PL09 | Quy trình xét Rank 4 bước (đề xuất → Đào tạo → Kế toán → BLĐ) |
| — | **Thuế TNCN và BHXH** — không nằm trong bất kỳ phần nào của thiết kế này |
| SR.QD.216 | Hệ số Thưởng HST (chia lợi nhuận) — ngoài hệ thống |

### 6.3 🔴 Quy định mà thiết kế CÓ chỗ nhưng CHƯA chặn được

| Điều khoản | Vì sao chưa chặn được |
|---|---|
| **PL05 §4.c — chống trùng ngân sách** (*"tuyệt đối tránh chi trả chồng ngân sách lương cho cùng một ca làm việc chính và ca trực"*) | Cần phân biệt **ca trực** với **ca làm việc chính** trên lưới phân ca. `ShiftTemplate` hiện không có cờ đó ⇒ **chưa phát hiện được chồng lấn** |
| **PL04 §A.1.b — Trial/Bù/Vượt nằm trong lương cơ bản FT/PT** | Cột `countsTowardQuota` đã có (07/09) nhưng **buổi trải nghiệm luôn mang `categoryCode = null`** (`TrialClassSession` không có cột phân loại) ⇒ Trial **không bao giờ** vào được định mức, dù chính sách nói nó là buổi trách nhiệm |
| **PL07 §1 — lớp mở khi ≥ 4 học viên** | `rosterSize` đã snapshot nên **kiểm được**, nhưng chưa có nơi nào cảnh báo |
| **Định mức prorate** cho người vào/nghỉ giữa tháng, nghỉ thai sản | Kỳ công là tháng dương lịch trọn vẹn, không có khái niệm "định mức theo ngày công thực tế". SR.QD.230 cũng **không nói rõ** — cần Nhân sự |

---

## 7. Thứ tự làm, nếu được duyệt

| Bước | Nội dung | Ra được gì |
|---|---|---|
| **B1** | `SessionTeachingAssignment` + mở rộng enum vai (4 vai) + đường ghi ở form hoàn tất buổi | Nhiều người/buổi; trợ giảng thôi bị quy hồi tố |
| **B2** | `TeachingRecord` + bộ sinh + **test tĩnh chặn `contractType`** | Tầng ghi nhận xong, chưa có tiền |
| **B3** | Hồ sơ lương: Bậc/Mức/Rank (sau khi Q5 có trả lời) + `PayrollRateCard` + màn bảng giá | Tra được đơn giá |
| **B4** | `lib/payroll/mo-hinh.ts` + nhánh A (theo buổi) | Tiền cho thời vụ/trợ giảng — nhóm ít người, dễ đối chiếu tay |
| **B5** | Nhánh B (lớp/tháng) + bộ đếm định mức | Tiền cho FT/PT |
| **B6** | `PayrollPeriod` + `PayrollLine` + chốt/điều chỉnh + xuất Excel | Sổ lương |
| **B7** | Chạy **song song một kỳ** với cách tính tay, đối chiếu từng người | Nghiệm thu |

**B4 trước B5 có chủ đích:** nhóm thời vụ/trợ giảng ít người và công thức đơn giản, nên sai gì thì
lộ ngay và đối chiếu tay được trong một buổi. Làm nhánh FT/PT trước là đưa nhóm đông người nhất và
công thức rắc rối nhất ra làm chuột bạch.

---

## 8. Ba điều tôi sẽ KHÔNG làm, kể cả khi được duyệt, cho tới khi có trả lời

1. **Không mặc định `contractType` rỗng thành Fulltime.** Trả sai tiền cho người thật, im lặng.
2. **Không sinh tiền cho buổi có `rosterSource ≠ SNAPSHOT`** mà không có người xác nhận. Số suy đoán
   không được lặng lẽ biến thành tiền.
3. **Không mở sổ tiền thứ hai chạy song song sổ hiện có.** Repo đang có đúng vết thương đó:
   `Payment` + `OrderInstallment` (sổ cũ) và `PaymentRequest`/`PaymentAllocation` (sổ mới), cờ
   `PAYMENT_LEDGER_V2` mặc định TẮT và *"chưa nối vào màn nào"*, tiền về payOS phải ghi **cả hai**
   bên. Lương là sổ mới hoàn toàn — đừng đẻ thêm một cái nữa bên cạnh nó.
