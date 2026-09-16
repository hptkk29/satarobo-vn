# Site giáo viên — đợt 25/08/2026

Ghi lại **chốt của chủ dự án** + những gì đổi dưới nắp máy, để lần sau ai đọc code không
phải đoán vì sao.

---

## 0. Việc bắt buộc chạy TAY sau khi merge

Không có cái nào tự chạy theo deploy.

```bash
# 1) Migration (2 file, đều ADDITIVE — chỉ thêm cột nullable + 2 index)
pnpm exec prisma migrate deploy

# 2) Nạp giáo trình Sata thật vào Curriculum + Lesson (idempotent, chạy lại được)
pnpm exec dotenv -e .env -- tsx prisma/seed-curriculum-sata.ts

# 3) (TÙY CHỌN) nối LỚP ĐANG CÓ vào giáo trình mới — xem trước rồi mới chạy thật
pnpm exec dotenv -e .env -- tsx prisma/seed-curriculum-sata.ts --relink --dry-run
pnpm exec dotenv -e .env -- tsx prisma/seed-curriculum-sata.ts --relink
```

**Hai chốt chặn ghi đè** (mặc định BẬT, chỉ gỡ bằng cờ):

| Chốt | Bảo vệ cái gì | Gỡ bằng |
|---|---|---|
| Bỏ qua khoá đã có giáo trình **người soạn** | Đào tạo đã gõ tên 48 bài ở `/admin/curriculums` — seed sẽ xoá sạch mà không có đường lùi (`Lesson.title` không có bản sao nào khác). Nhận biết bằng `isPlaceholderTitle`: tiêu đề đúng dạng `"Buổi N"` = ô trống do nút "Áp dụng số buổi" sinh ra. | `--force` |
| Không nối lớp đang có | `--relink` **ghi đè tiêu đề buổi giáo vụ đã sửa tay** ở `/admin/classes/[id]` tab Chương trình. | `--relink` |

Không chạy `--relink` thì lớp cũ vẫn in tên buổi cũ — giáo trình mới chỉ áp cho lớp tạo SAU.
Seed cũng **không hồi sinh bài đã lưu trữ** (`archivedAt` giữ nguyên): gỡ bài khỏi giáo
trình là quyết định của Đào tạo, seed không được tự đảo.

Muốn soi trước "phụ huynh sẽ đọc thấy chữ gì" mà không đụng DB:

```bash
pnpm exec tsx scripts/xem-truoc-giao-trinh.ts
```

---

## 1. Tên buổi học / tên dự án — nguồn sự thật mới

**Vấn đề:** tên dự án thật của từng buổi (`Bàn Tay Ma Thuật`, `Đấu Trường Con Quay`, …)
lâu nay **chỉ nằm hardcode trong data marketing của site public**
(`components/legacy-laptrinhrobot/_data/roadmap-5-years.ts` + `exam-roadmap.ts`) và chưa
bao giờ được đổ vào bảng `Lesson`. Bảng `Lesson` thì hoặc trống, hoặc chứa chỗ trống tự
sinh `"Buổi N"` (`lib/lms/curriculum.ts`, nút "Áp dụng số buổi"). Vì thế **phiếu nhận xét
gửi phụ huynh in tên sai cho MỌI giáo trình** — thường là hằng `"Dự án 1: Làm quen hệ thống"`.

**Cách vá:**

| Thành phần | Vai trò |
|---|---|
| `lib/lms/curriculum-sata.ts` | THUẦN — dịch 2 file marketing thành bản thiết kế giáo trình (9 khoá: Sata1–8 + Combo). Có test. |
| `prisma/seed-curriculum-sata.ts` | Nạp bản thiết kế xuống `Curriculum` + `Lesson`. Idempotent. |
| `Lesson.moduleCode` / `moduleName` | **cột mới** — học phần của bài (`HP1` / `Học phần 1`). |
| `deriveSessionLabel()` | Nhãn bảng: `Buổi 1 - HP1 - Bàn Tay Ma Thuật`. |
| `deriveSessionProjectName()` | Tên gửi phụ huynh: `Bàn Tay Ma Thuật` (**bỏ tiền tố `Dự án N:`**). |

**Vì sao bỏ tiền tố `Dự án N:` khỏi phiếu phụ huynh** (chốt của chủ dự án, và có lý do kỹ
thuật đi kèm): số `N` ở đó là **số buổi theo NGÀY của lớp** (`buildSessionNumberMap`),
không phải `Lesson.order`. Chèn buổi bù hay huỷ buổi là hai số lệch nhau ⇒ `Dự án 8` dán
vào bài số 7 của giáo trình. Bỏ tiền tố là hết nguy cơ đó; số buổi vẫn hiện đủ ở nhãn bảng.

**Cấu trúc giáo trình sau khi seed**

| Khoá | Số buổi | Học phần |
|---|---|---|
| Sata3 · Sata4 · Sata5 · Sata6 · Sata7 | 48 | 4 × 12 buổi (`HP1`…`HP4`) |
| Sata1 · Sata2 | 16 | không chia ⇒ nhãn rút còn `Buổi 1 - <tên bài>` |
| Sata8 | 5 | không chia |
| Combo | 32 | `HP1` = Sata1 (16) + `HP2` = Sata2 (16) |

⚠️ **Nguồn tên là 2 file marketing, KHÔNG phải DB.** Sửa tên dự án = sửa
`roadmap-5-years.ts` / `exam-roadmap.ts` rồi chạy lại seed. Gõ tay vào DB thì lần seed
sau ghi đè.

⚠️ **`ClassSessionPlan.customTitle` thắng `Lesson.title`** trong `deriveSessionTitle`. Nó
là bản sao đông cứng chụp lúc tạo lớp và **không bao giờ tự đồng bộ lại** khi giáo trình
đổi tên. Đó là lý do phải có `--relink`.

---

## 2. Gộp cột "Buổi" + "Buổi học"

Trước 25/08 ba bảng có **hai** cột: `Buổi` (in `"Buổi 1"`) và `Buổi học` (in hằng
`"Buổi học"`, vì `ClassSession.topic` gần như luôn null). Nay còn **một** cột `Buổi học`
in `deriveSessionLabel`, phòng học xuống dòng phụ.

Đã sửa: `/teacher/diem-danh` · Class Hub tab Điểm danh · Class Hub tab Nhận xét ·
`/teacher/nhan-xet` (thẻ + tiêu đề chi tiết).

Mọi truy vấn buổi nay phải `select` thêm:
```ts
plan: { select: { customTitle: true } },
lesson: { select: { order: true, title: true, moduleCode: true } },
```

---

## 3. Lớp của tôi — ẩn lớp đã hoàn thành

Ô tick **"Hiện lớp đã hoàn thành (N)"**, mặc định TẮT. Lọc phía client (đồng bộ với 3 bộ
lọc sẵn có của màn). Ô `Trạng thái` suy option từ tập đã lọc ⇒ `Hoàn thành` chỉ xuất hiện
khi ô tick bật; bỏ tick khi đang chọn `Hoàn thành` thì reset về `Tất cả` (nếu không, ô
select hiện nhãn rỗng + bảng trắng). `CANCELLED` **không** bị ẩn — yêu cầu chỉ nói "hoàn thành".

---

## 4. Ảnh lớp — bỏ khâu kho nháp cho giáo viên

**Chốt:** up ảnh xong **đẩy thẳng sang hàng chờ QLCS duyệt**, không qua kho nháp nữa.

- Hộp thoại đăng ảnh còn **một** chế độ: chọn nhiều ảnh. Đã gỡ "Đăng ngay 1 ảnh", ô
  "Ngày chụp", ô chú thích, chip gắn học viên, ô "Ảnh chung cả lớp".
- **Buổi học là BẮT BUỘC** — cả trang Ảnh lớp nay phân loại theo buổi.
- Ảnh tạo ra ở `PENDING` (hoặc `APPROVED` nếu người up có `media:approve`).
  `uploadSessionMediaAction` dùng lại `createDraftMediaBatch` làm đường vận chuyển rồi
  nâng trạng thái.
- **DRAFT KHÔNG bị bỏ:** Marketing/Giáo vụ (`media:upload-draft`, không có quyền publish)
  vẫn sinh DRAFT, và dữ liệu DRAFT cũ vẫn còn. Panel kho đổi tên thành "Kho ảnh cũ", tự ẩn
  khi rỗng.
- Đã xoá dòng link "Trang Ảnh lớp (gửi/xoá ảnh trong kho)" ở tab Ảnh của Class Hub.

### Nút "Tải ảnh" ở phiếu nhận xét → "Chọn ảnh"

Không upload nữa. Mở danh sách ảnh **đã duyệt của đúng buổi đó**, giáo viên bấm để gắn
thẻ học viên (`MediaStudentTag`). Tôn trọng `StudentConsent`: em chưa có đồng ý thì không
gắn được (nhưng **gỡ** thẻ thì vẫn được — đó là đường sửa sai khi phụ huynh thu hồi).

⚠️ **Hệ quả có chủ đích:** ảnh up lên **không tự gắn học viên, không tự là ảnh cả lớp** ⇒
ảnh đã duyệt mà không ai bấm chọn thì **không tới phụ huynh nào**. Ô "Chưa có" ở phiếu
nhận xét và dòng "Chưa gán học viên" ở trang Ảnh lớp là chỗ lộ ra chuyện đó.

---

## 5. Học viên Trial — 2 bảng phẳng

Thay lưới thẻ theo ngày bằng:

- **"Các suất sắp Trial"** — hôm nay → hết 7 ngày tới, xếp theo ngày tăng dần. **Không có
  suất nào thì không hiện bảng.**
- **"Đã Trial"** — dưới cùng, cùng bộ cột, mới nhất trước.
- ~~Khối "Chưa xếp buổi" giữ nguyên~~ **[ĐÃ GỠ 26/08, rồi ĐẢO CÁCH GIẢI 04/09]**
  Chủ dự án cho gỡ khối này 26/08. Nhưng 28/08 lại gỡ auto-gán buổi, nên từ đó **mọi**
  ghi danh tạo qua giao diện admin mang `scheduledSessionId = null` — và bảng thì lọc
  `scheduledSessionId: { in: [...] }`, mà `in` không bao giờ khớp null. Giao nhau của hai
  quyết định đúng-riêng-lẻ: **bảng Trial của giáo viên rỗng sạch**, không ai nhập được
  phiếu nào (báo 04/09).

  Cách giải hiện tại giữ ĐÚNG tinh thần chốt 26/08 — *không bày dòng không có ngày giờ* —
  mà không làm giáo viên tàng hình: em học cả lớp được suy một **buổi đại diện** từ chính
  lịch của giáo viên (`lib/lms/trial-representative-session.ts`: buổi gần nhất chưa qua,
  không còn thì buổi cuối đã qua). Lớp không có buổi nào trong cửa sổ ⇒ **bỏ dòng**, đúng
  như 26/08 muốn. Dòng có gắn hậu tố `· học cả lớp` để không đọc nhầm thành lịch chốt.

  ⚠️ Buổi đại diện chỉ để xếp bảng và nhét vào link mở phiếu. **Không ghi ngược vào**
  `TrialEnrollment.scheduledSessionId` — cột đó nay nghĩa là "xếp RIÊNG một buổi", ghi vào
  là đảo ngầm chốt 28/08 và làm bảng điểm danh thôi hiểu "em học mọi buổi".

Cột: `Buổi` · `Học viên` (`Hoàng Gia Bảo - 2016`) · `Phụ huynh` · `Khoá học` · `Đánh giá`
(chỉ Nhập/Xem phiếu — **đã gỡ nút Xuất PDF**) · `Trạng thái`.

> Cột `Buổi` là thứ chủ dự án không liệt kê, nhưng bảng xếp theo ngày mà không in ngày thì
> giáo viên không dùng được — giữ lại, đặt đầu bảng.

### ⚠️ ĐẢO "câu 46"

Site GV **trước đây cố ý giấu hẳn phụ huynh** ở màn Trial. Chủ dự án 25/08 yêu cầu cột
"Phụ huynh" ⇒ nay `lead.parentName` được trả về **ở đúng chỗ này và chỉ chỗ này**.
**SĐT/email phụ huynh vẫn tuyệt đối không ra khỏi server** — `canViewParentContact` vẫn
chặn TEACHER ở mọi màn khác.

### 7 trạng thái + dữ liệu chống lưng

`lib/lms/trial-row-status.ts` (THUẦN, có test). Thứ tự ưu tiên: kết cục đã chốt thắng tất cả.

| Nhãn | Nguồn dữ liệu | Trước 25/08 |
|---|---|---|
| Sắp tới | ngày buổi ≥ hôm nay | có |
| **Bị dời lịch** | `TrialEnrollment.rescheduledFromSessionId` | **KHÔNG có đường ghi nào** |
| Chờ đánh giá | buổi đã qua / COMPLETED, chưa có rubric | có |
| Đã đánh giá | `TrialRubricEval` | có |
| **Đã nhập học · +1% HH** | `LeadTrialHistory.outcome = "ENROLLED"` | cột có, **chưa bao giờ được ghi** |
| **Bị rớt** | `LeadTrialHistory.outcome = "LOST"` | cột có, **chưa bao giờ được ghi** |
| Đã rút | `TrialEnrollment.status = WITHDRAWN` | có (chưa hiện ra đâu) |

### Dời lịch (mới)

`rescheduleTrialEnrollment()` + `rescheduleTrialEnrollmentAction` + nút **"Dời lịch"** ở
`/admin/trial-classes/[id]`. Trước đó `scheduledSessionId` ghi **đúng một lần** lúc xếp
con vào lớp rồi bất biến — muốn đổi buổi phải gỡ con ra rồi xếp lại, mất sạch dấu vết.
Bắt buộc nêu **lý do** (vào AuditLog), phát `trial.schedule_changed` (cùng tên sự kiện với
đường V1) để Sale phụ trách nhận thông báo.

### `LeadTrialHistory.outcome` — cột chết nay đã sống

- `"ENROLLED"` ghi trong **transaction convert** (`lib/crm/convert-lead-v2.ts`).
- `"LOST"` ghi khi lead chuyển sang `LOST` (`updateLeadStatus`), chỉ đụng dòng đang `PENDING`.
- Sửa luôn một lỗi cũ: `lib/trial/sale-roster.ts:160` đọc `outcome === "ENROLLED"` để bật
  cờ "đã nhập học" ⇒ cờ đó **vĩnh viễn tắt** trên prod cho tới bản này.

### ⚠️ Hoa hồng `+1% HH` — đọc kỹ trước khi đụng

`lib/crm/trial-teacher-commission.ts`. Ghi 1 dòng `CommissionLine` tier `TRIAL_TEACHER`,
1% `Enrollment.finalPrice`, **trong transaction convert**, idempotent bằng unique
`(statementId, tier, recipientId, enrollmentId)`.

**Ba luật cứng — cả ba đều là lỗi thật đã vá sau rà soát đối kháng:**

1. **Chỉ trả khi con ĐÃ ĐIỂM DANH CÓ MẶT** (`TrialAttendance.status = PRESENT`), không
   phải khi "đã được xếp lớp". Ghi danh trải nghiệm mang `ACTIVE` NGAY lúc Sale xếp con
   vào một buổi TƯƠNG LAI, và `syncTrialProgress` chỉ chuyển COMPLETED khi đủ buổi có
   mặt — nên con vắng mặt, con no-show, con mới đặt lịch tuần sau đều là `ACTIVE`. Phụ
   huynh đóng tiền trước buổi thử (chuyện thường) từng làm hệ thống trả 1% cho giáo viên
   chưa dạy buổi nào. Lấy buổi có mặt GẦN NHẤT ⇒ cũng hết luôn ca trả nhầm người khi con
   thử ở hai lớp.
2. **Bảng kê của kỳ dựng NGOÀI transaction convert** (`ensureCommissionStatement`).
   `upsert` của Prisma trên model nhiều unique biên dịch thành đọc-rồi-ghi, nên hai lượt
   convert song song vào lần đầu tiên của tháng đâm `P2002` — ném bên trong
   `db.$transaction` là **rollback CẢ lượt convert** (lead claim, phụ huynh, học viên,
   ghi danh, đơn học phí). Đã dựng lại được lỗi này trên Postgres thật.
3. **Đóng sổ đúng lớp, chỉ dòng `PENDING`.** Lọc trần theo `leadChildId` vừa đè mất dòng
   `LOST` của lần thử trước, vừa bật `ENROLLED` cho MỌI lớp con từng vào — mà site GV in
   nhãn theo cặp `(leadChildId, trialClassId)`, nên giáo viên **không nhận được đồng nào
   vẫn thấy hệ thống hứa trả 1%**. Đó là cãi nhau về lương, không phải lỗi hiển thị.

Kỳ đã `APPROVED` thì **không nuốt im lặng**: ghi `AuditLog`
`TRIAL_TEACHER_COMMISSION_SKIPPED` (kỳ, số tiền, người nhận) để kế toán mở lại kỳ và bù
tay — tầng này chưa có job đối soát nào.

> **KHÔNG BAO GIỜ thêm `TRIAL_TEACHER` vào `COMMISSION_TIERS`.**
> `MAX_TOTAL_RATE = 0.08` và Σ 4 tầng Sale **đúng bằng 8,00%** (QC 1 + SALE_ADMIN 1 +
> SALE 4 + QL_TT 2). Thêm tầng thứ 5 vào mảng đó là `validateRates()` ném
> `RATE_EXCEEDS_CAP` ở **mọi** lần gọi `computeCommission()` ⇒ chết luôn hoa hồng Sale.
> Nâng trần 8%→9% là quyết định chính sách tiền của BGĐ. Có test khoá hai điều này.

> **Sự thật cần biết:** tới 25/08 **chưa từng có dòng `CommissionLine` nào được sinh ra
> trong sản phẩm** — `setStatementLines` (đường của 4 tầng Sale) chỉ có test gọi. Bộ máy
> bảng kê Sale được dựng nhưng **chưa nối vào dữ liệu thật**. Các dòng `TRIAL_TEACHER` ở
> đây là những dòng hoa hồng thật đầu tiên của hệ thống. `setStatementLines` đã được sửa
> để **không xoá** chúng khi kế toán dựng lại bảng kê Sale.

**Còn nợ:** phần feeder cho 4 tầng Sale vẫn chưa có — đó là nợ CŨ, không phải do đợt này.

---

## 6. Bài tập — quá hạn tự đóng + gia hạn nộp trễ

`lib/lms/assignment-window.ts` (THUẦN, 14 test) là **nguồn sự thật duy nhất** cho câu hỏi
"bài này lúc này còn nộp được không". Cổng phụ huynh và nhãn ở màn GV cùng hỏi qua đây.

- **Suy lúc đọc, không ghi DB, không cron.** Quá `dueAt` mà không có cửa gia hạn ⇒ ĐÓNG.
- `Assignment.lateUntil` = hạn cửa nộp bù do GV mở. **Không bao giờ sửa `dueAt`** ⇒ bài
  nộp trong cửa gia hạn vẫn tính `LATE` (học bạ không mất dấu nộp trễ).
- `status = CLOSED` lưu trong DB (người đóng tay) **thắng** cửa gia hạn cũ; nút gia hạn
  lật `CLOSED → PUBLISHED` trong cùng lệnh update nên vẫn mở lại được.
- `grantLateWindowAction` / `revokeLateWindowAction` — bắt buộc **lý do** (5–500 ký tự),
  hạn mới phải ở tương lai và sau `dueAt`. Audit đầy đủ.
- **Đổi hành vi cổng phụ huynh:** trước đây nộp muộn được nhận **vô thời hạn** (chỉ gắn cờ
  LATE). Nay quá hạn là bị từ chối, kèm câu nói rõ hết hạn lúc nào.
- Landmine đã xử: bài seed có `dueAt` = epoch 1970 được coi là **không có hạn** — không thì
  cả đám đó chuyển "Đã đóng" ngay ngày lên bản này.

**Còn nợ (ngoài phạm vi):** `/admin/assignments` vẫn in cột `status` thô ⇒ sẽ ghi "Đang mở"
cho bài mà màn GV gọi "Đã đóng". Trang chi tiết bài tập bên portal vẫn hiện form nộp khi
đã đóng (bấm nộp thì bị từ chối tử tế). `openAt`/`closeAt` vẫn chỉ-ghi-không-đọc.

---

## 7. Bảng bị tràn ngang

**Lỗi thật tìm ra:** không phải thiếu vùng cuộn (24/24 bảng site GV đều có), mà là **thanh
phân trang bị nhốt TRONG vùng cuộn**: nếp cũ bọc cả `<PhanTrangBang>` trong một div
`overflow-x-auto`, nên kéo bảng sang phải đọc cột cuối là nút chuyển trang trôi khỏi màn.

**Vá dùng chung:** thêm cờ `cuonNgang` cho `PhanTrangBang` — nó bọc **riêng cái `<table>`**,
thanh phân trang đứng ngoài. Đã áp cho **17 bảng** site giáo viên.

```tsx
// TRƯỚC                              // SAU
<div className="overflow-x-auto">     <PhanTrangBang cuonNgang>
  <PhanTrangBang>                       <table className="min-w-[…]">
```

Bảng học bạ (8 cột / 990px) **không vừa laptop 1280px** (khung nội dung site GV chỉ còn
~960px sau sidebar 256 + padding 64) ⇒ gộp cột "Cập nhật" thành dòng phụ trong ô trạng
thái, còn 7 cột / 880px. Sau đó **mọi bảng site GV vừa màn 1280px**; ở 375px vẫn cuộn —
đúng thiết kế.

---

## 8. Migration

| File | Nội dung |
|---|---|
| `20260825100000_lesson_module_code` | `Lesson.moduleCode`, `Lesson.moduleName` |
| `20260825110000_teacher_site_2508` | `Assignment.lateUntil/lateReason/lateGrantedById/lateGrantedAt` · `TrialEnrollment.rescheduledFromSessionId/rescheduledAt/rescheduleReason` · `CommissionLine.enrollmentId/note` + unique + index |

Tất cả **ADDITIVE**: chỉ thêm cột nullable, không đổi/bỏ cột nào. Rollback = `DROP COLUMN`.
`CommissionLine.enrollmentId` để `NULL` cho 4 tầng Sale nên không vướng unique mới
(trong Postgres `NULL` không bằng `NULL`).

---

## 9. MEDIA-REVIEW — màn duyệt ảnh MỚI cho QLCS (26/08)

Chủ dự án **đảo chốt** giữa chừng: ban đầu duyệt lại trên `ClassSessionMedia`, sau đổi
thành *"toi khong muon dung lai classsessionmedia nữa, làm mới cho tôi"*. Module dựng lại
từ đầu theo BA MEDIA-REVIEW 26/08.

### 9.1 Bảng mới

| Bảng | Vai trò |
|---|---|
| `MediaAsset` | một tấm ảnh/video của một buổi + trạng thái duyệt + xoá mềm 7 ngày |
| `SessionMediaReview` | **kết luận của cả buổi** — 1-1 với `ClassSession` (`@unique`) |

Cả hai vào `SCOPED_MODELS`, `BACKFILL_SPECS` (`nullMeaning: "BAT_BUOC"`) và **map prefix
`"media:"` trong `getModelPrefixes`**. Cái cuối là bẫy đã từng mắc với `Attendance` (#04):
model nằm trong `SCOPED_MODELS` mà **không có map prefix** thì tầm nhìn rơi về `isHoLevel`
diện rộng ⇒ bất kỳ ai có **một** vai neo tại Hội sở, kể cả vai chẳng liên quan, đọc được
ảnh học viên của **mọi cơ sở**. Có test riêng chặn (`lib/db-scope-function.test.ts`).

### 9.2 Ba chỗ cố ý làm KHÁC bản mô tả

1. **Cây dựng từ LỊCH HỌC, không từ kho ảnh.** BA vừa đòi "chỉ hiện folder có ảnh chưa
   duyệt" vừa đòi nút "Hôm nay không có ảnh" — hai điều chọi nhau: dựng cây từ ảnh thì lớp
   **không có ảnh** không bao giờ xuất hiện, không ai bấm được nút đó, mất luôn cơ chế giải
   trình và báo cáo SLA. Nay lớp rời danh sách khi **có kết luận**, không phải khi hết ảnh.
2. **Hai mức trên một route** (`/duyet-media` và `?sessionId=`) thay vì 4 route M1–M4:
   QLCS duyệt liên tục hàng chục lớp mỗi sáng, mỗi lần vào/ra một mức là một lượt tải trang.
3. **`OperationSetting.mediaReviewDeadline` → `SystemSetting`** khoá `media.reviewDeadlineHour`:
   repo đã có bảng cấu hình key/value, thêm bảng thứ hai chỉ để giữ một con số là thừa.

### 9.3 Nối vào đường đang chạy (2-phase)

`ClassSessionMedia` **vẫn là bản ghi GIAO cho phụ huynh** (consent, tag học viên, portal,
đính vào nhận xét buổi). `MediaAsset` chỉ thay phần **KHO + DUYỆT**. Nối bằng
`MediaAsset.legacyMediaId` (1-1, `@unique`):

- **Tải lên** (`createDraftMediaBatch`) tạo **cả hai dòng trong cùng transaction** — chỉ
  khi ảnh **có gắn buổi**, vì cây duyệt xếp theo ngày→lớp.
- **Duyệt / loại** ở màn mới đẩy ngược sang dòng cũ (`propagateToLegacy`): `APPROVED` →
  `APPROVED` vì nút **"Chọn ảnh"** ở phiếu nhận xét lọc đúng `APPROVED`
  (`getSessionPhotoPicker`). Để `DRAFT` là giáo viên duyệt xong vẫn không thấy gì.
- `APPROVED` ở hệ cũ **không** có nghĩa "phụ huynh xem được ngay": ảnh mang
  `isClassWide: false` và chưa có `MediaStudentTag`, mà cổng phụ huynh lọc theo thẻ.

**Phase B** (sau khi chạy ổn trên prod): gỡ `ClassSessionMedia` → gỡ `legacyMediaId`.

### 9.4 Việc phải chạy TAY sau merge

```bash
pnpm exec tsx scripts/backfill-media-assets.ts --dry-run   # xem trước
pnpm exec tsx scripts/backfill-media-assets.ts             # chạy thật
```

Dựng hàng chờ từ ảnh cũ, **giữ nguyên kết luận đã có** (`APPROVED` cũ → đóng sẵn
`SessionMediaReview`), không bắt QLCS duyệt lại vài trăm tấm. Idempotent, có `--reset`.
Script dùng **`DIRECT_URL`** (session pooler): transaction pooler dùng lại tên prepared
statement giữa các kết nối ⇒ script chạy dài đâm ngay `42P05 prepared statement "s0"
already exists`.

Đã chạy trên DB dev/test 26/08: **252 ảnh · đóng sẵn 78 buổi · 49 buổi vào hàng chờ**.

### 9.5 Migration

| File | Nội dung |
|---|---|
| `20260826180000_media_review` | `MediaAsset` · `SessionMediaReview` · 3 enum (`MediaType`, `MediaAssetStatus`, `SessionReviewStatus`) |
| `20260826190000_media_asset_legacy_link` | `MediaAsset.legacyMediaId` + unique index |

`MediaAssetStatus` chứ không `MediaStatus`: tên sau **đã tồn tại** (enum của
`ClassSessionMedia`).

### 9.6 Còn nợ (V1.1 / V2 của BA)

- cron nhắc quá hạn + cron dọn file `REJECTED` khỏi R2 sau 7 ngày (`purgeAfterAt` đã ghi sẵn)
- báo cáo SLA duyệt · mục "Đã xử lý" xem lại lịch sử
- video: `markVideoWatchedAction` + cổng 90% đã có ở server, **chưa có đường tải video lên**
