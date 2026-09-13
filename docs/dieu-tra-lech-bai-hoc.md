# Điều tra lệch tên bài học giữa ClassSession và giáo trình

| | |
|---|---|
| **Ngày** | 07/09/2026 |
| **Trạng thái** | Bước 1 xong (đọc mã). Bước 2 xong — **nhưng DB dev không trả lời được**, xem §2.1. Chờ đường đọc PROD. |
| **Nhánh đọc** | `origin/main` @ `c78d0ae0` — `git rev-list --left-right --count origin/main...HEAD` = `0 0` |
| **Đã ghi gì vào DB** | **KHÔNG.** Bước 1 chỉ đọc mã. |

> Ký hiệu theo `docs/luat-doc-so-va-ket-luan.md`: **ĐO** = có phép tính kèm theo ·
> **SUY** = suy luận từ mã, chưa đo · **CHƯA BIẾT** = không kết luận được ở bước này.

---

## 1. Sơ đồ quan hệ hiện tại

```
Course ──1:N── Curriculum ──1:N── Lesson
               (version, isActive)   (order, title, moduleCode)
                                     @@unique([curriculumId, order])
  │                    ▲
  │                    │ curriculumId + curriculumVersion  (GHIM lúc tạo lớp, nullable)
  ▼                    │
Class ──1:N── ClassSessionPlan ──┐   (seq, order, lessonId, customTitle)
  │                              │   @@index([classId, order])  ← KHÔNG có unique
  │                              │
  └──1:N── ClassSession ─────────┘
             date        Timestamptz(6)   ← MANG GIỜ THẬT, không phải @db.Date
             lessonId    FK → Lesson,  onDelete: SetNull
             planId      FK → ClassSessionPlan, onDelete: SetNull
             topic       String?            ← chuỗi tự do, là NGUỒN DỰ PHÒNG của tên bài
             KHÔNG có cột thứ tự nào. KHÔNG có @@unique([classId, …]).
```

### 1.1 Buổi học trỏ tới bài bằng cách nào

**Bằng CẢ BA, theo thứ tự ưu tiên** — `lib/lms/session-project-name.ts:140-144`:

```ts
export function deriveSessionTitle(src) {
  return meaningful(src.planTitle) || meaningful(src.lessonTitle) || meaningful(src.topic);
}
```

| Nguồn | Kiểu | Đi theo giáo trình khi giáo trình đổi? |
|---|---|---|
| `plan.customTitle` | **chuỗi chép** trên `ClassSessionPlan` | ❌ không |
| `lesson.title` qua `ClassSession.lessonId` | **FK** | ⚠️ chỉ khi FK trỏ đúng bản giáo trình đang dùng |
| `ClassSession.topic` | **chuỗi chép** trên chính buổi | ❌ không |

⇒ Câu trả lời cho câu hỏi của anh: **vừa FK vừa chuỗi chép**. FK là nguồn chính, nhưng
hai nguồn chuỗi đứng **trước và sau** nó trong thứ tự ưu tiên, nên một buổi có thể in
tên bài mà FK của nó không hề trỏ tới.

### 1.2 "Buổi N" trên UI đến từ đâu

**Tính lúc render, bằng HẠNG THEO NGÀY** — `lib/lms/session-order.ts:38-56`:

```ts
export function buildSessionNumberMap(rows) {
  ...
  const sorted = [...list].sort((a, b) => timeOf(a.date) - timeOf(b.date) || a.id.localeCompare(b.id));
  sorted.forEach((s, i) => out.set(s.id, i + 1));
}
```

Không có cột nào lưu số buổi. Và việc **không** dùng `ClassSessionPlan.seq` / `Lesson.order`
là **chủ đích, có ghi lý do** — `lib/lms/session-order.ts:12-14`:

> *"Không lấy `ClassSessionPlan.seq` / `Lesson.order` làm nguồn: hai cột đó rỗng ở lớp
> không ghim giáo trình và bị SetNull khi dời/huỷ buổi, nên số sẽ khuyết đúng ở những lớp
> cần nhìn nhất."*

### 1.3 ⚠️ Bug này ĐÃ ĐƯỢC BIẾT VÀ GHI LẠI TỪ 25/08

`lib/lms/session-project-name.ts:150-154`, trong docblock của `deriveSessionProjectName`:

> *"số N ở đây là số buổi THEO NGÀY của lớp (`buildSessionNumberMap`), **không phải
> `Lesson.order`**; chèn buổi bù hay huỷ buổi làm **hai số lệch nhau**, nên `Dự án 8` có
> thể dán vào bài số 7 của giáo trình. Bỏ tiền tố là hết nguy cơ đó."*

Đợt 25/08 đã nhìn thấy đúng cơ chế lệch này, nhưng **chỉ gỡ TRIỆU CHỨNG** (bỏ tiền tố
`Dự án N:` khỏi phiếu gửi phụ huynh) chứ không sửa gốc. Nhãn buổi trên site GV
(`deriveSessionLabel`) **vẫn ghép** `Buổi {hạng theo ngày}` với `{tên bài theo FK}` —
đúng chỗ anh đang thấy sai.

---

## 2. Bảng: nơi ghi ClassSession → logic gán bài → có reindex không

Quét bằng `grep -rn "classSession\.(create|createMany|update|updateMany|upsert|delete|deleteMany)"`
trên `app/ lib/ scripts/ prisma/`, bỏ `*.test.*` / `*.spec.*`. **ĐO: 32 lời gọi / 20 file.**
Dưới đây là các đường **sản xuất** (bỏ seed demo và script dọn dữ liệu test):

| # | Nơi ghi | Gán bài theo logic gì | Reindex? |
|---|---|---|---|
| 1 | `lib/classes/generate.ts:145-155` (nhánh có plan) | `dates[i]` ↔ `plans[i].lessonId` — **ghép theo CHỈ SỐ** | ❌ |
| 2 | `lib/classes/generate.ts:193-199` (nhánh cũ) | `dates[i]` ↔ `lessonIds[i]`, `lessonIds` lấy `orderBy: {order: asc}` của **`curriculum` `isActive` `version desc`** | ❌ |
| 3 | `lib/classes/adjust.ts:102-108` `cancelSession` | Buổi bù **chép nguyên** `lessonId` + `planId` của buổi bị huỷ, đặt ở **ngày mới cuối lịch** | ❌ |
| 4 | `lib/classes/snapshot.ts:151-153` `adoptCurriculumVersion` | `classSession.update({ data: { planId, lessonId: remaining[i]?.id } })` — **ghép lại theo CHỈ SỐ** khi lớp đổi bản giáo trình | ❌ |
| 5 | `lib/classes/session-sync.ts` `resyncClassSessions` | **CHỈ đổi `date`.** Docblock:*"1. CHỈ đổi `date`. KHÔNG tạo, KHÔNG xoá buổi"* | ❌ (và không cần) |
| 6 | `lib/holidays/apply.ts` | **CHỈ đổi `date`** (dời buổi trùng ngày nghỉ) | ❌ |
| 7 | `app/(admin)/admin/sessions/_actions.ts:175,217` | `lessonId` do **người dùng chọn tay** trên form | ❌ |
| 8 | `prisma/seed-curriculum-sata.ts:333-373` | Remap hàng loạt — xem §3.3 | ❌ |

**Không có một đường nào reindex.** Nghĩa là mỗi lần lịch đổi (dời ngày, huỷ buổi, thêm
buổi bù), quan hệ "buổi thứ N ↔ bài thứ N" trượt thêm một nấc và **không bao giờ được
kéo lại**.

---

## 3. Nguyên nhân gốc

### 3.1 Gốc chung: HAI THỨ TỰ ĐỘC LẬP, không có ràng buộc nào bắt chúng khớp

| | Số buổi hiển thị | Tên bài |
|---|---|---|
| Nguồn | hạng theo `date` | `lessonId` / `planId` / `topic` |
| Tính khi nào | **mỗi lần render** | **ghi một lần lúc sinh lịch** |
| Đổi khi dời ngày | **CÓ** | **KHÔNG** |

Chỉ cần một buổi đổi ngày là hai dãy lệch nhau vĩnh viễn. Không có cột nào, không có
`@@unique` nào, không có test nào ràng chúng lại.

### 3.2 Ca 1 (Sata6 — 42 T7 mang bài 1-42, 6 T5 mang bài 43-48)

**Giả thuyết của anh KHÔNG khớp mã ở phần "sinh trong một lần".**
`computePhasedSessionDates` (`lib/classes/phases.ts:180-201`) quét **từng ngày một**
(`cur = vnAddDays(cur, 1)`) và `push` khi ngày đó khớp slot ⇒ mảng `dates` **luôn tăng
dần**. Một lần gọi `generateClassSessions` **không thể** đẻ ra 42 ngày T7 trước rồi 6
ngày T5 xen vào giữa.

Nên hình dạng đó chỉ ra được bằng **HAI lần ghi**. Ứng viên, chưa phân định được bằng mã:
- Lớp sinh lịch lần 1 (42 buổi T7), sau đó **thêm 6 buổi** qua `sessions/_actions.ts` (#7)
  với `lessonId` chọn tay; hoặc
- Lớp đổi giai đoạn lịch (`ClassSchedulePhase`) rồi sinh lại một phần.

**CHƯA BIẾT — phải đo ở Bước 2** (so `ClassSession.createdAt` theo nhóm thứ trong tuần).

### 3.3 Ca 2 (Sata4 — hoán vị trong tập bài 1-17) và vai trò của script remap

`prisma/seed-curriculum-sata.ts:333-364` là nơi đáng ngờ nhất vì nó **chạm mọi lớp của
mọi khoá** — khớp với việc anh thấy *"sai ở TẤT CẢ các khoá"*. Memory ghi script này
**đã chạy trên prod 26/08**.

```ts
let slot = 0;
for (const s of sessions) {                       // orderBy: [{date:asc},{id:asc}]
  const viaPlan = s.planId !== null ? planTarget.get(s.planId) : undefined;
  const anchor  = s.lessonId !== null ? (orders.get(s.lessonId) ?? undefined) : undefined;

  if (typeof anchor === "number") {
    if (anchor > slot) slot = anchor;             // ← chỉ TIẾN, KHÔNG BAO GIỜ LÙI
  } else {
    slot += 1;
  }
  const target = viaPlan ?? (typeof anchor === "number" ? cur.lessons.get(anchor)
                                                        : cur.lessons.get(slot));
```

Ba tính chất, cả ba đều đẩy về phía giữ nguyên/khuếch đại lệch:

1. **`anchor` thắng vị trí trong dãy ngày.** Buổi thứ 5 theo ngày mà đang mang bài có
   `order = 6` thì được map sang **bài 6 của giáo trình mới**, không phải bài 5. Script
   **bảo tồn** hoán vị sẵn có thay vì nắn lại. → khớp ca 2.
2. **`slot` là mốc cao nhất, chỉ tiến.** Một buổi không neo được bài (bù/huỷ) đứng sau
   một buổi có `anchor` cao sẽ nhảy vọt. → khớp *"bài 18 bị đẩy xuống tận buổi 48"*.
3. **`viaPlan` thắng tất cả**, mà `planTarget` map theo **vị trí `i+1`** trong
   `plans` sắp `[{order:asc},{seq:asc}]`. `ClassSessionPlan` **không có
   `@@unique([classId, seq])`** nên `order`/`seq` trùng hoặc thưa là dãy trượt ngay.

Script tự biết nó đang đoán: nó đếm `hasGuess` và `st.guessedClasses.push(cls.name)`
(dòng 368) — tức tác giả đã lường trước ca đoán sai, chỉ là báo tên lớp chứ không chặn.

### 3.4 Ca 3 (Sata3 — tên bài không tồn tại trong giáo trình hiện hành)

Hai cơ chế đều đủ để gây ra, **chưa phân định được bằng mã**:

- **(a) FK trỏ bản giáo trình CŨ.** `Curriculum` có `version` và `@@unique([courseId, version])`;
  `Class.curriculumId` **ghim một bản lúc tạo lớp**. Buổi trỏ `lessonId` của bản cũ vẫn
  hợp lệ về mặt FK, `lesson.title` vẫn ra tên — chỉ là tên của bản cũ. **Không cần chuỗi
  chép nào.**
- **(b) Chuỗi chép.** `plan.customTitle` hoặc `ClassSession.topic` đứng trước/sau
  `lesson.title` trong `deriveSessionTitle`, nên chúng in được tên mà FK không trỏ tới.
  Kèm `onDelete: SetNull`: xoá/seed lại Lesson là `lessonId` hoá null, và `topic` trở thành
  nguồn duy nhất.

**Phân định bằng Bước 2**: nếu các buổi đó có `lessonId` khác null và
`lesson.curriculumId ≠ class.curriculumId` ⇒ (a). Nếu `lessonId IS NULL` mà `topic`/
`customTitle` có chữ ⇒ (b).

Còn chi tiết *"chỉ 47 buổi / 48 bài"* thì `generate.ts` có sẵn `shortPlanWarning(dates.length, plans.length)`
— sinh thiếu ngày là **cảnh báo, không chặn**.

---

## 4. Phát hiện ngoài dự kiến (báo, không tự vá)

1. **`ClassSessionPlan` thiếu `@@unique([classId, seq])`.** Cột `seq` được chú thích là
   *"số thứ tự buổi gốc theo curriculum"* nhưng không có ràng buộc nào cấm trùng/thưa.
2. **`ClassSession` không có ràng buộc nào theo lớp.** Không `@@unique([classId, lessonId])`,
   không cột thứ tự ⇒ hai buổi cùng mang một bài là hợp lệ với DB.
3. **`onDelete: SetNull` trên `lessonId`.** Seed lại giáo trình (xoá Lesson cũ) làm mọi
   buổi trỏ tới nó **mất bài trong im lặng**, rồi rơi về `topic`.
4. **`prisma/seed-curriculum-sata.ts` là đường ghi sản xuất chạy trên prod** dù nằm trong
   `prisma/`. Memory ghi `--dry-run` của nó **vẫn ghi** (sự cố 26/08).

---

## 5. Bước 2 — chưa chạy

Query rà soát chưa viết. Cần đo trước khi kết luận ca 1 và ca 3.

## 6. Quyết định cần chủ dự án chốt

Chưa mở — sẽ nêu sau khi có số ở Bước 2.

---

# Bước 2 — số đo trên DB dev

| | |
|---|---|
| **Script** | `scripts/ra-soat-lech-bai-hoc.ts` |
| **DB** | `aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres` — chuỗi `DIRECT_URL` trong `.env` của repo chính = **DB dev**. Phải đi **session pooler `:5432`**; qua `:6543` script chết ở `prepared statement "s8" does not exist` (bẫy đã ghi ở `.claude/rules/prisma-db.md`). |
| **Chạy lúc** | 2026-09-08T06:48Z |

## 2.0 Ba tự kiểm trước khi tin số

### (1) Script có đúng 0 lệnh ghi không?

Pattern: `\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|executeRaw|queryRaw`

```
8: * `$executeRaw`. Chạy được bằng tài khoản chỉ có quyền đọc. Kiểm nhanh:
9: *     grep -nE "create|update|delete|upsert|executeRaw" scripts/ra-soat-lech-bai-hoc.ts
→ 2 dòng khớp, CẢ HAI nằm trong khối chú thích đầu file.
```

**0 dòng MÃ ghi.** Script chỉ gọi `findMany` / `count` / `groupBy`.

### (2) Dùng hàm thật hay chép logic?

**Dùng hàm THẬT — 2 thứ:**

| Đại lượng | Hàm | Ở đâu |
|---|---|---|
| Số buổi (hạng theo ngày) | `buildSessionNumberMap` | import ở `scripts/ra-soat-lech-bai-hoc.ts:22` từ `lib/lms/session-order` |
| Tên bài in ra | `deriveSessionTitle` | import ở `:23` từ `lib/lms/session-project-name` |

Script cũng tuân đúng cảnh báo trong docblock của `buildSessionNumberMap` (*"caller PHẢI nạp đủ buổi của lớp"*): nó nạp **toàn bộ** `ClassSession`, không lọc gì.

**⚠️ BA chỗ CHÉP LẠI, không mô phỏng được 1:1 — phải biết khi đọc số:**

| Chỗ chép | Vì sao không dùng được hàm thật | Rủi ro sai |
|---|---|---|
| **Suy "giáo trình hiệu lực" của lớp** — script dùng `class.curriculumId`, không có thì lấy `Curriculum` `isActive` có `version` cao nhất của khoá | `resolveEffectiveCurriculumVersion` (`lib/classes/snapshot.ts:16`) chỉ trả **số version**, không trả id; nhánh fallback thật nằm **inline** trong `lib/classes/generate.ts:170-176`, không export được | Khoá có **2 bản `isActive`** thì script chọn bản version cao, còn `generate.ts` lúc sinh có thể đã gán theo bản khác ⇒ **A đếm nhầm** |
| **Tên UI in ra** — script gọi `deriveSessionTitle` (chỉ phần TÊN) | Site GV thật in `deriveSessionLabel` = `Buổi N - HP1 - <tên bài>` | Cột "UI đang in" là **tên bài trần**, thiếu tiền tố `Buổi N - HPx`. Phần cần soi là tên nên không đổi kết luận |
| **Mốc "đã dạy"** — script tự dựng | **Không có hàm thật nào** định nghĩa việc này trong repo | Xem (3) |

### (3) Cột nào làm mốc "đã dạy", và sai ở ca nào?

Một buổi được coi là **ĐÃ DẠY** khi thoả **BẤT KỲ** điều nào (hợp của 5 dấu vết):

```
status = 'COMPLETED'   ∪   completedAt ≠ null
∪ có ≥1 Attendance(sessionId)
∪ có ≥1 StudentSessionFeedback(classSessionId)
∪ có ≥1 ClassSessionMedia(classSessionId)
```

Chọn **hợp** (rộng nhất) là cố ý **fail-safe**: thà giữ nguyên nhầm một buổi chưa dạy còn hơn sửa nhầm một buổi đã dạy.

**Bốn ca mốc này SAI:**

1. **Sai an toàn** (báo đã dạy trong khi chưa): ai đó điểm danh sớm, hoặc up nhầm ảnh sang buổi khác. Hậu quả: buổi đó không được re-map — mất cơ hội sửa, không hỏng gì.
2. **⚠️ SAI NGUY HIỂM** (báo chưa dạy trong khi ĐÃ dạy): buổi dạy thật nhưng **không để lại dấu vết nào** — không điểm danh, không nhận xét, không ảnh. Buổi đó bị coi là "chưa diễn ra" và **được phép re-map**. Đây là chiều duy nhất gây hỏng, và nó **có thật**: prod đo 07/09 chỉ có **2 `COMPLETED` / 287 `SCHEDULED`**, tức `status` gần như vô dụng và toàn bộ sức nặng dồn lên ba dấu vết còn lại.
3. **`ClassSessionMedia.classSessionId` là NULLABLE** — ảnh không gắn buổi không tính được cho buổi nào.
4. **Mốc này KHÔNG nhìn thấy học bạ.** `ReportCard` gắn **1-1 với `Enrollment`**, không có cột nào trỏ `ClassSession` (ĐO: `awk '/^model ReportCard/,/^}/' prisma/schema.prisma` → không có `classSessionId`/`sessionId`). Nên một lớp **đã phát hành học bạ** (`publishedAt`, `publishedSnapshot` đóng băng số liệu) vẫn có thể có buổi bị chấm "chưa diễn ra". **Phải chặn ở cấp LỚP, không phải cấp buổi** — chưa làm, xem Q5.

---

## 2.1 Output thật (dán nguyên văn)

```
# RÀ SOÁT LỆCH BÀI HỌC — chỉ đọc
DB: aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres
Lúc: 2026-09-08T06:48:54.130Z

## Tổng
Lớp (chưa xoá):                 100
  ... có ít nhất 1 buổi:        54
  ... LỆCH (bất kỳ A–E):        0
  ... không suy được giáo trình:0
Buổi học:                       609

A. buổi trỏ bài KHÁC giáo trình của lớp:  0
A. buổi lessonId IS NULL (đã SetNull):    0
B. buổi lệch thứ tự (hạng ngày ≠ order):  0
C. lớp có số buổi ≠ số bài giáo trình:    0
D. bài mồ côi (không buổi nào trỏ):       0
D. bài bị ≥2 buổi cùng trỏ:               0
E. tên in ra bị plan.customTitle che:     0
E. tên in ra bị topic che:                0
F. buổi LỆCH đã dạy (KHÔNG ĐƯỢC ĐỤNG):   0
F. buổi LỆCH chưa diễn ra (re-map được):  0

## Lớp lệch (0 lớp)
mã lớp  khoá  buổi  bài  A  null  B  kiểu  Δmax  C  mồcôi  trùng  Eplan  Etopic  lệch-đãdạy  lệch-chưa

## CS2.SATA6.26.001: KHÔNG TÌM THẤY trên DB này
## CS2.SATA4.26.001: KHÔNG TÌM THẤY trên DB này
## CS1.SATA3.26.001: KHÔNG TÌM THẤY trên DB này
```

## 2.2 Bảng tổng A–G

| Phép | Đo được | Ghi chú |
|---|---|---|
| **A** bài khác giáo trình | **0** | và `lessonId IS NULL` = **0** |
| **B** lệch thứ tự | **0** | không có delta nào để phân loại "đều" vs "xáo trộn" |
| **C** số buổi ≠ số bài | **0** lớp | |
| **D** bài mồ côi / bài bị ≥2 buổi trỏ | **0 / 0** | |
| **E** tên bị `customTitle` che / bị `topic` che | **0 / 0** | |
| **F** buổi lệch đã dạy / chưa diễn ra | **0 / 0** | không có buổi lệch nào để phân tầng |
| **G** truy vết đợt ghi | **CHƯA ĐO** | lớp Sata6 không có trên DB này |

## 2.3 Bảng theo từng lớp lệch

**RỖNG — 0 lớp lệch.** Đây **không phải** "đã rà, hệ thống lành". Xem §2.4.

## 2.4 ⚠️ Vì sao toàn 0 này KHÔNG trả lời được câu hỏi

**ĐO — chẩn đoán tự kiểm (Prisma `count`, cùng phiên, cùng DB):**

| Số | Giá trị | Nghĩa |
|---|---|---|
| Buổi có `lessonId` | **609 / 609** | không buổi nào bị SetNull ⇒ A(null)=0 là thật |
| Dòng `ClassSessionPlan` | **0** | **nhánh plan của `generate.ts` (đường ghi #1) chưa từng chạy** |
| Buổi có `planId` | **0** | |
| Lớp có `curriculumId` ghim | **0 / 100** | **cơ chế ghim bản giáo trình chưa từng dùng** |
| `Curriculum` / `Lesson` | 7 / 90 | **PHÉP TÍNH: 90 ÷ 7 ≈ 12,9 bài/bản** — sự cố nói giáo trình **48 bài** |
| 3 lớp mẫu | **cả ba KHÔNG TỒN TẠI** | mã lớp dev dạng khác hẳn: `CS1.SATA-4.001`, `CS1.SATA-1.010`… |

Bốn hệ quả:

1. Giáo trình dev ~13 bài/bản ⇒ **khác bộ dữ liệu** với sự cố (48 bài).
2. **0 `ClassSessionPlan`** ⇒ đường ghi **#1** và **#4** (`adoptCurriculumVersion`) — hai ứng viên chính của ca Sata4 và Sata3 — **chưa từng chạm dev**.
3. **0 lớp ghim `curriculumId`** ⇒ cơ chế "FK trỏ bản giáo trình CŨ" (§3.4a) **không thể xảy ra** ở dev: mọi lớp đều rơi về bản `isActive` mới nhất.
4. `prisma/seed-curriculum-sata.ts` (§3.3) **chưa chạy trên dev** — không có bài Sata thật.

**Phân loại theo Luật 1 (`docs/luat-doc-so-va-ket-luan.md`): "đường ghi SỐNG + 0 dòng".** Cả 8 đường ghi vẫn nằm nguyên trên `origin/main`; chỉ là tập dữ liệu dev chưa đi qua chúng. **Không được dùng số 0 này để hạ mức nghiêm trọng.**

### Bằng chứng phép đo KHÔNG rỗng

`--lop=CS1.SATA-3.013` (lớp thật trên dev, 12 buổi / 12 bài) — bảng dựng đủ bốn cột:

```
Buổi ngày        thứ UI đang in                 order-FK  đáng lẽ là                    đãdạy  createdAt
1    2026-07-31  T6  Làm quen bộ học cụ         1         Buổi 1 — Làm quen bộ học cụ   x      2026-08-26T18:15:16
2    2026-08-07  T6  Khung xe và bánh dẫn động  2         Buổi 2 — Khung xe và bánh…    x      2026-08-26T18:15:16
...
12   2026-10-16  T6  Dự án mở rộng              12        Buổi 12 — Dự án mở rộng              2026-08-26T18:15:16
-- G: 2026-08-26T18:15   12 buổi   thứ={T6}
```

Khớp 1..12 vì lớp **sinh MỘT lần rồi không ai đụng** (một cụm ghi duy nhất) — đúng hình dạng "chưa lệch" mà §3.1 dự đoán.

## 2.5 Đối chiếu từng buổi cho 3 lớp mẫu Sata3 / Sata4 / Sata6

**CHƯA ĐO — cả ba lớp không tồn tại trên DB dev** (output §2.1 in `KHÔNG TÌM THẤY` cho cả ba). Cơ chế đo đã sẵn sàng: `--lop=<mã>` in bảng từng buổi (Buổi · ngày · thứ · UI đang in · order-FK · đáng lẽ là · đãdạy · createdAt) + cụm ghi G. Chạy được ngay khi có đường đọc prod.

## 2.6 Kết quả G

**CHƯA ĐO.** Câu hỏi treo từ §3.2 (Sata6 sinh mấy đợt ghi) vẫn treo.

---

## 2.7 Việc cần chủ dự án cấp

Máy này chỉ có `.env` trỏ **dev**. Hai đường tới prod:

- **(a)** Cấp chuỗi kết nối **chỉ đọc** (nhớ cổng **5432**, không phải 6543).
- **(b)** Tôi thêm workflow `workflow_dispatch` **chỉ đọc** dùng secret `PROD_DATABASE_URL` sẵn có (mẫu `seed-prod-roles.yml`), anh bấm chạy và dán kết quả. Chuỗi không rời GitHub.

Chưa làm (b) vì nó thêm file vào repo.

## 2.8 Điều đã chốt được dù chưa có prod

1. **Số buổi và tên bài là hai thứ tự độc lập, không ràng buộc** (§3.1) — lệch là *khi nào*, không phải *có hay không*.
2. **Không đường ghi nào reindex** (§2) — lệch một lần là lệch vĩnh viễn.
3. **Bug đã ghi nhận từ 25/08** (`session-project-name.ts:150-154`), chỉ gỡ triệu chứng ở phiếu phụ huynh.

## 2.9 Quyết định cần chốt trước Bước 3

| # | Quyết định | Phương án | Hệ quả |
|---|---|---|---|
| Q1 | Đường đọc prod | (a) chuỗi read-only · (b) workflow chỉ đọc | (b) an toàn hơn, chậm một nhịp |
| Q2 | Mốc "đã dạy" | giữ **hợp 5 dấu vết** như §2.0(3) | Chiều nguy hiểm: buổi dạy thật mà **không có dấu vết nào** — prod chỉ 2/287 `COMPLETED` |
| Q3 | Buổi **đã dạy** mang tên bài sai | (a) giữ nguyên · (b) giữ + ghi chú "theo giáo trình cũ" · (c) Đào tạo duyệt từng ca | Anh đã chốt (a); học bạ sẽ mãi mang tên không có trong giáo trình — Đào tạo có chấp nhận không? |
| Q4 | Dọn `topic` / `plan.customTitle` | chúng **che mất FK** ở tầng hiển thị | Không dọn thì vá FK xong vẫn bị che |
| **Q5** | **Lớp đã PHÁT HÀNH học bạ** | Mốc theo buổi **không thấy** học bạ (§2.0(3) ca 4) | Đề xuất: **loại cả lớp** khỏi re-map nếu `ReportCard.publishedAt ≠ null` — cần anh xác nhận |


---

# Bước 2b — SỐ ĐO TRÊN PROD (đã chạy)

| | |
|---|---|
| **DB** | `aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres` — biến `PROD_READONLY_URL` |
| **Chạy lúc** | 2026-09-08T08:05Z |
| **Đã ghi gì** | **KHÔNG.** Grep lệnh ghi trên script → 0 dòng mã. |

## 2b.A Cổng quyền (thay phép "thử ghi")

```sql
SELECT current_user, has_table_privilege(current_user,'"ClassSession"','INSERT') …
```
```
role              | ins | upd | del | lesson_upd | plan_upd
satarobo_readonly |  f  |  f  |  f  |     f      |    f
```
**Cả 5 cột `f` ⇒ QUA CỔNG.** Không thử ghi thật — ca xấu nhất của phép thử đó là "đã ghi
vào prod rồi mới biết không được phép".

## 2b.B Bảng tổng

```
Lớp (chưa xoá):        21        Buổi học: 687
  có ít nhất 1 buổi:   16
  LỆCH (bất kỳ A–E):   16        ← 16/16 lớp có buổi đều lệch
```

| Phép | Số | Ghi chú |
|---|---|---|
| **A** buổi trỏ bài KHÁC giáo trình của lớp | **0** | ⚠️ **Bác giả thuyết §3.4a** — không có FK nào trỏ bản giáo trình cũ |
| **A** `lessonId IS NULL` | **0** | không buổi nào bị SetNull |
| **B** buổi lệch thứ tự | **222 / 687** | = **32,3 %** |
| **C** lớp có số buổi ≠ số bài | **1** | `CS1.SATA3.26.001`: 47 buổi / 48 bài |
| **D** bài mồ côi | **1** | |
| **D** bài bị ≥2 buổi trỏ | **0** | |
| **E** `customTitle` che `lesson.title` | **687** | ⚠️ đếm quá tay — xem 2b.F |
| **E** `topic` che | **0** | `topic` không phải nguồn của lỗi này |
| **F** buổi LỆCH **đã dạy** | **47** | KHÔNG ĐƯỢC ĐỤNG |
| **F** buổi LỆCH **chưa diễn ra** | **175** | re-map được |
| **G** | xem 2b.E | |

### Phân rã mốc "đã dạy" (mỗi dấu vết đếm độc lập)

```
status = COMPLETED:         40
completedAt ≠ null:         40
có điểm danh:              187      ← gánh gần như toàn bộ
có nhận xét:                67
có ảnh:                      4
HỢP (tính là đã dạy):      187 / 687
```

**Xác nhận lo ngại ở Q2:** `status` chỉ đỡ được **40/187 = 21 %**. Nếu chỉ dùng `status`
làm mốc thì **147 buổi đã dạy sẽ bị chấm "chưa diễn ra"** và bị re-map.

### Q2 — mốc nước cao

```
buổi được CỨU nhờ RIÊNG luật này: 31
(= không có dấu vết nào, nhưng nằm dưới mốc nước cao của lớp)
```

**31 buổi.** Không có luật này thì 31 buổi nằm GIỮA hai buổi đã dạy sẽ bị re-map. Luật
đáng giá. *(Ghi chú kỹ thuật: sắp theo `date` chứ không `(date, startTime)` — `ClassSession`
KHÔNG có cột `startTime`, giờ nằm trong `date`.)*

### Q4 — chuỗi chép đang che FK

```
customTitle · trùng tên bài CỦA LỚP:          144
customTitle · trùng tên bài giáo trình KHÁC:    0
customTitle · KHÔNG trùng bài nào:            543
topic · (cả ba nhóm):                           0
```

### Khoá có ≥2 bản `isActive`

**(không có).** Lớp bị ảnh hưởng: **0** ⇒ phép đo **A không có vùng "không kết luận được"**.

### Q5 — học bạ ở cấp lớp

```
lớp có ≥1 ReportCard:     0
lớp ĐÃ PHÁT HÀNH học bạ:  0
buổi "chưa diễn ra" trong lớp đã phát hành: 0
```

**PROD CHƯA CÓ HỌC BẠ NÀO.** Theo Luật 1: đây là **"đường ghi SỐNG + 0 dòng"** — cửa phát
hành học bạ vẫn còn, nên **luật chặn cấp lớp vẫn phải cài**, chỉ là hôm nay nó chưa chặn ai.

## 2b.C Bảng theo từng lớp lệch (16/16 lớp có buổi)

| mã lớp | khoá | buổi | bài | B | kiểu | Δmax | C | mồ côi | Eplan | lệch-đãdạy | lệch-chưa |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CS1.SATA3.26.003 | Sata3 | 48 | 48 | **48** | xáo trộn | 47 | 0 | 0 | 48 | 2 | 46 |
| CS2.SATA4.26.002 | Sata4 | 48 | 48 | **47** | xáo trộn | −47 | 0 | 0 | 48 | 17 | 30 |
| CS2.SATA6.26.001 | Sata6 | 48 | 48 | **47** | xáo trộn | 41 | 0 | 0 | 48 | 17 | 30 |
| CS2.SATA4.26.001 | Sata4 | 48 | 48 | **39** | xáo trộn | −30 | 0 | 0 | 48 | 8 | 31 |
| CS2.SATA3.26.001 | Sata3 | 48 | 48 | **29** | xáo trộn | −28 | 0 | 0 | 48 | 0 | 29 |
| CS1.COMBO.26.002 | Combo | 32 | 32 | **11** | xáo trộn | −10 | 0 | 0 | 32 | 2 | 9 |
| CS1.SATA3.26.001 | Sata3 | **47** | 48 | 1 | đều (+37) | 37 | **−1** | **1** | 47 | 1 | 0 |
| CS1.SATA4.26.001 | Sata4 | 48 | 48 | 0 | — | 0 | 0 | 0 | 48 | 0 | 0 |
| CS1.SATA6.26.001 | Sata6 | 48 | 48 | 0 | — | 0 | 0 | 0 | 48 | 0 | 0 |
| CS1.COMBO.26.001 | Combo | 32 | 32 | 0 | — | 0 | 0 | 0 | 32 | 0 | 0 |
| CS1.SATA4.26.002 | Sata4 | 48 | 48 | 0 | — | 0 | 0 | 0 | 48 | 0 | 0 |
| CS1.SATA3.26.002 | Sata3 | 48 | 48 | 0 | — | 0 | 0 | 0 | 48 | 0 | 0 |
| CS2.Combo.26.001 | Combo | 32 | 32 | 0 | — | 0 | 0 | 0 | 32 | 0 | 0 |
| CS1.SATA1.26.001 | Sata1 | 16 | 16 | 0 | — | 0 | 0 | 0 | 16 | 0 | 0 |
| CS2.SATA3.26.003 | Sata3 | 48 | 48 | 0 | — | 0 | 0 | 0 | 48 | 0 | 0 |
| CS2.SATA4.26.003 | Sata4 | 48 | 48 | 0 | — | 0 | 0 | 0 | 48 | 0 | 0 |

**9/16 lớp có B = 0** — thứ tự bài khớp thứ tự ngày. Chúng vẫn bị đếm "lệch" chỉ vì cột
**Eplan**, mà Eplan lại là phép đo đếm quá tay (2b.F). ⇒ **Số lớp lệch THẬT là 7**, không
phải 16.

## 2b.D Đối chiếu từng buổi — 3 lớp mẫu

### CS2.SATA6.26.001 (48 buổi, ghim giáo trình v1)

| Buổi | ngày | thứ | UI đang in | order-FK | đáng lẽ là |
|---|---|---|---|---|---|
| 1 | 20/06 | T7 | Buổi 1 - HP1 - Bước vào thế giới ảo | 1 | ✔ khớp |
| 2 | 25/06 | **T5** | Buổi 2 - **HP4 - Chạy tổng hợp nhiệm vụ** | **43** | HP1 - Đèn tín hiệu giao thông |
| 3 | 27/06 | T7 | Buổi 3 - HP1 - Đèn tín hiệu giao thông | 2 | HP1 - Đèn thông minh |
| 4 | 02/07 | **T5** | Buổi 4 - **HP4 - Tối ưu chương trình** | **44** | HP1 - Lựa chọn ngẫu nhiên |
| 6 | 09/07 | **T5** | Buổi 6 - **HP4 - Kiểm tra lắp ráp** | **45** | HP1 - Xe robot di chuyển |
| 8 | 16/07 | **T5** | Buổi 8 - **HP4 - Kiểm tra lập trình** | **46** | HP1 - Cảm biến dò line |
| 10 | 23/07 | **T5** | Buổi 10 - **HP4 - Demo thi đấu** | **47** | HP1 - Dự án cuối học phần |
| 12 | 30/07 | **T5** | Buổi 12 - **HP4 - Thi đấu nội bộ** | **48** | HP1 - Báo cáo cuối học phần |
| 13→48 | T7 | | lệch đều **−6** so với hạng ngày | 7…42 | |

### CS2.SATA4.26.001 (48 buổi) — hoán vị cục bộ, không phải dịch đều

| Buổi | UI đang in | order-FK | đáng lẽ là |
|---|---|---|---|
| 5 | HP1 - Tránh chướng ngại vật | **6** | HP1 - Ôn tập kiến thức |
| 6 | HP1 - Nhận diện màu sắc | **7** | HP1 - Tránh chướng ngại vật |
| 7 | HP1 - Ôn tập kiến thức | **5** | HP1 - Nhận diện màu sắc |
| 10 | **HP2 - Thiết kế lắp ráp** | **15** | HP1 - Dự án cuối học phần |
| 11 | HP1 - Demo cuối học phần | 11 | ✔ khớp |
| 12 | HP1 - Dự án cuối học phần | **10** | HP1 - Báo cáo cuối học phần |

Cụm ghi G: **một cụm** `2026-08-06T10:25`, `thứ={T4,T2}`.

### CS1.SATA3.26.001 (47 buổi / 48 bài) — ca "tên bài lạ"

| Buổi | UI đang in | order-FK | đáng lẽ là |
|---|---|---|---|
| 4 | **Lập trình di chuyển** | 4 | HP1 - Chiến Xa Tốc Độ |
| 5 | **Cảm biến dò line** | 5 | HP1 - Ôn tập kiến thức |
| 6 | **Lắp ráp khung gầm** | 6 | HP1 - Vũ Công Robot |
| 7 | **Lắp ráp khung gầm nâng cao** | 7 | HP1 - Trở Về Tuổi Thơ |
| 8 | **Cánh tay robot & servo** | 8 | HP1 - Kỹ Sư Làm Mát |
| 11 | **HP4 - Báo cáo cuối khoá** | **48** | HP1 - Demo cuối học phần |
| 12 | **Robot tránh vật cản** | 12 | HP1 - Báo cáo cuối học phần |
| 15→ | HP2 - Họa Sĩ Robot | 15 | ✔ khớp từ đây trở đi |

**⚠️ Chú ý cột `order-FK`: buổi 4→4, 5→5, 6→6, 7→7, 8→8 — FK KHỚP THỨ TỰ.** Tên lạ
KHÔNG đến từ FK. Nó đến từ `ClassSessionPlan.customTitle` — **chuỗi chép của giáo trình cũ**.

## 2b.E Kết quả G — truy vết đợt ghi

| Lớp | Cụm ghi `createdAt` | Thứ |
|---|---|---|
| CS2.SATA6.26.001 | **1 cụm** `2026-08-06T11:41` — 48 buổi | {T7, T5} |
| CS2.SATA4.26.001 | **1 cụm** `2026-08-06T10:25` — 48 buổi | {T4, T2} |
| CS1.SATA3.26.001 | **1 cụm** `2026-08-06T17:56` — 47 buổi | {T7} |

**⇒ BÁC BỎ giả thuyết "hai đợt ghi" (§3.2) — của cả anh lẫn của tôi.** Mỗi lớp sinh
**một lần duy nhất**.

### Lời giải thật cho ca Sata6 (ĐO, không suy)

Bốn phép đo nối nhau:

1. `ClassSessionPlan` của lớp **hoàn toàn sạch**: `plan.order` 0..47 ↔ `lesson.order` 1..48,
   tuần tự đúng.
2. `s.lessonId` **luôn khớp** `plan.lessonId` của chính buổi đó
   (`lech_plan_vs_session = f` toàn bộ) ⇒ **`lessonId` KHÔNG bị ghi đè độc lập**.
3. Chuỗi plan theo hạng ngày là `0, 42, 1, 43, 2, 44, …` ⇒ **buổi nhận plan nào đã sai
   ngay từ đầu?** Không — xem (4).
4. **Lớp KHÔNG có `ClassSchedulePhase` nào, `scheduleDays = {6}` = CHỈ THỨ 7.**

Ghép lại: lúc sinh, `computeSessionDates` chỉ sinh **48 ngày Thứ 7 tăng dần**, ghép
`dates[i] ↔ plans[i]` ⇒ **đúng răm rắp**. Sáu buổi mang bài 43–48 (cuối lịch) **về sau bị
DỜI NGÀY** sang các Thứ 5 tháng 6–7. Bộ dời ngày **không đụng `lessonId`** (đường ghi #3/#5/#6
đều "CHỈ đổi `date`"), còn "Buổi N" thì **tính lại theo ngày mỗi lần render**.

⇒ **Đây chính là §3.1 xảy ra ngoài đời**, không cần script remap, không cần hai đợt ghi.
Ai dời ngày và vì sao thì **CHƯA ĐO** — cần audit log, để Bước 3.

## 2b.F ⚠️ Tự đính chính: phép đo E đếm QUÁ TAY

`E = 687 = TOÀN BỘ buổi` là **con số không dùng được như đang hiểu**.

Script đếm E khi *"có `customTitle` **và** có `lesson.title`"*. Nhưng hàm thật
`deriveSessionTitle` gọi `meaningful()`, và `meaningful()` **loại các chuỗi rỗng-hình-dạng**
— `session-project-name.ts:42`: *"Ô TRỐNG mang hình dạng tiêu đề: `"Buổi 7"` và không gì khác"*.

Đo được ở CS2.SATA6.26.001: `customTitle` là `"Buổi 1"`, `"Buổi 2"`, … ⇒ **bị `meaningful()`
loại**, nên UI **vẫn in `lesson.title`** — đúng như bảng 2b.D cho thấy. Vậy chúng **không hề
che** FK.

**Hệ quả cho Q4:** con số `543 "KHÔNG trùng bài nào"` **trộn hai thứ khác hẳn nhau**:
- placeholder `"Buổi N"` — **rác máy sinh**, xoá vô hại;
- tên bài giáo trình CŨ (ca Sata3: *"Lắp ráp khung gầm"*, *"Cánh tay robot & servo"*) —
  **đây mới là thứ đang che FK**.

**CHƯA ĐO: tách 543 thành hai nhóm đó.** Cần chạy lại với `meaningful()` áp đúng. Đừng
dùng 144/543 để quyết Q4.

## 2b.G Kết luận đo được

1. **16/16 lớp có buổi bị đếm lệch, nhưng lệch THẬT là 7 lớp** (9 lớp còn lại chỉ dính E — phép đo hỏng).
2. **222/687 buổi (32,3 %) sai thứ tự bài.**
3. **47 buổi lệch ĐÃ DẠY** — không được đụng. **175 buổi lệch chưa diễn ra** — re-map được.
4. **A = 0**: không FK nào trỏ giáo trình cũ ⇒ giả thuyết §3.4a **sai**. Tên lạ đến từ
   `plan.customTitle`, tức §3.4b.
5. **G bác bỏ "hai đợt ghi"**: mỗi lớp một cụm ghi. Nguyên nhân thật là **dời ngày sau khi
   sinh**, đúng §3.1.
6. **`status` chỉ đỡ 21 %** mốc "đã dạy"; **mốc nước cao cứu thêm 31 buổi**.
7. **Prod chưa có học bạ nào** — luật chặn cấp lớp vẫn phải cài (đường ghi còn sống).

---

# Bước 2c — độ phủ `plan.order` + tách chuỗi chép (prod, CHỈ ĐỌC)

| | |
|---|---|
| **Script** | `scripts/ra-soat-plan-order.ts` — 0 dòng mã ghi |
| **DB** | prod, biến `PROD_READONLY_URL`, role `satarobo_readonly` |
| **Chạy lúc** | 2026-09-08 |

## 2c.0 Chốt lại nguyên nhân (chủ dự án đóng 08/09)

**KHÔNG có bug ghi dữ liệu.** Thứ tự đúng vẫn nguyên trong DB. Cái sai là **NHÃN HIỂN THỊ**
ghép `"Buổi N tính theo ngày"` với `"tên bài theo FK"`.

**Kế hoạch cũ HUỶ:** không thêm `sequenceNo`, không migration re-map 175 buổi.
`ClassSessionPlan.order` **chính là** `sequenceNo` và nó đã có sẵn, sạch.

**Đóng câu hỏi "ai dời ngày 6 buổi Sata6"** — dời ngày là nghiệp vụ hợp lệ (dạy bù), biết
ai làm cũng không đổi cách vá.

**Hướng vá: SỬA HIỂN THỊ, 0 dòng dữ liệu bị ghi.** Nếu đi hướng này thì:
- **47 buổi đã dạy tự an toàn** — không ai đụng tới chúng;
- **Q2 / Q3 / Q5 mất sức nặng** — chúng là câu hỏi của kế hoạch re-map, mà re-map đã huỷ.

## 2c.A Độ phủ `ClassSessionPlan.order` — câu quyết định Bước 3

```
lớp có buổi:                     16
  ghim giáo trình:               16 lớp / 687 buổi
  KHÔNG ghim:                     0 lớp /   0 buổi
  plan ĐỦ (mọi buổi có plan):    16 lớp
  plan THIẾU một phần:            0 lớp
  KHÔNG có dòng plan nào:         0 lớp
  buổi CÓ planId:                687
  buổi KHÔNG có planId:            0   ← rơi vào fallback
  lớp order liên tục 0..N-1:     16
  lớp order HỔNG:                 0
  lớp order TRÙNG:                0
  lớp plan khớp 1-1 lesson.order: 16
  buổi có lessonId KHÁC plan:      0
```

**16/16 lớp sạch tuyệt đối.** Từng lớp một đều `liênTục` + `khớp1-1` + `lệchPlan = 0`.

> ### Kết luận cần rút
> Đổi `"Buổi N"` sang `plan.order + 1` thì **687/687 buổi (100 %) hiển thị ĐÚNG**, và
> **0 buổi rơi vào fallback**. Không có vùng xám nào trên dữ liệu prod hôm nay.

⚠️ **Nhưng đây là "0 dòng" loại BOM HẸN GIỜ, không phải "cơ chế không tồn tại"** (Luật 1):
- `lib/classes/generate.ts:169-199` **vẫn còn nhánh fallback** tạo buổi **KHÔNG có plan**
  cho lớp chưa ghim giáo trình. Hôm nay prod 0 lớp như vậy — mai tạo một lớp là có.
- `ClassSession.planId` là **`onDelete: SetNull`**: xoá một `ClassSessionPlan` là mọi buổi
  trỏ nó **mất `planId` trong im lặng**.

⇒ Fallback **bắt buộc phải có**, dù hôm nay nó không chạy cho buổi nào.

## 2c.B Tách chuỗi chép — áp `meaningful()` của HÀM THẬT

`meaningful` là hàm private; script cô lập nó qua
`deriveSessionTitle({ planTitle: X, lessonTitle: null, topic: null })` ⇒ dùng **luật thật**.

```
customTitle (687 buổi):
  trống / null:                        0
  placeholder (meaningful() LOẠI):   502   ← rác máy sinh, KHÔNG che FK
  trùng tên bài GIÁO TRÌNH CỦA LỚP:  144
  trùng tên bài giáo trình KHÁC:       0
  KHÔNG trùng bài nào:                41
topic (687 buổi):
  trống / null:                      687   ← topic KHÔNG đóng vai gì trong lỗi này
```

`502 + 144 + 41 = 687` ✔

### ⚠️ Nhóm "41 KHÔNG trùng" KHÔNG đọc được là "GV tự đặt"

20 mẫu in ra đều thuộc `CS1.SATA3.26.001` / `.002`:

```
Bàn tay ma thuật · Đấu trường con quay · Siêu xe bứt phá · Lập trình di chuyển
Cảm biến dò line · Lắp ráp khung gầm · Lắp ráp khung gầm nâng cao
Cánh tay robot & servo · Lập trình theo kịch bản · Dự án nhóm: robot phân loại
Xử lý lỗi & tối ưu · Robot tránh vật cản · Ôn tập & kiểm tra · Tổng kết & trình diễn
```

`"Bàn tay ma thuật"` bị xếp vào "không trùng" **mặc dù giáo trình hiện hành CÓ bài đó** —
vì bài tên là `"HP1 - Bàn tay ma thuật"`, lệch đúng tiền tố `HPn - `. Phép so của script là
khớp-chuỗi-chính-xác sau `trim`+`lowercase`, **không gỡ tiền tố học phần**
(`stripModulePrefix` trong `session-project-name.ts`).

**⇒ Con số 41 là HỖN HỢP** của (a) tên trùng bài hiện hành nhưng lệch tiền tố, và (b) tên
giáo trình cũ thật sự. **CHƯA ĐO** tỷ lệ hai nhóm. Không dùng 41 để quyết Q4.

## 2c.C Sửa lại con số "16 lớp lệch" ở Bước 2b

| | Số | |
|---|---|---|
| Bước 2b báo | **16 lớp lệch** | ❌ SAI |
| Lớp có **B > 0** (thứ tự bài ≠ thứ tự ngày) | **7** | |
| Lớp có ≥1 buổi bị `customTitle` **CÓ NGHĨA** che `lesson.title` | **6** | |

**Vì sao số cũ sai:** phép đo E ở Bước 2b đếm điều kiện *"có `customTitle` **và** có
`lesson.title`"*. Nhưng `customTitle` của 502/687 buổi là placeholder dạng `"Buổi 1"`,
`"Buổi 2"` — mà hàm thật `meaningful()` **loại** chúng
(`session-project-name.ts:42`: *"Ô TRỐNG mang hình dạng tiêu đề: `"Buổi 7"` và không gì
khác"*). Chúng **không hề che** FK; UI vẫn in `lesson.title`.

Vì E đếm quá tay và **mọi** buổi đều có `customTitle`, E = 687 và **mọi lớp bị đánh dấu
lệch** — kể cả 9 lớp có B = 0.

## 2c.D Trả lời 3 câu (chưa code)

### (a) Đổi `"Buổi N"` sang `plan.order`, giữ hạng-theo-ngày làm fallback — rủi ro gì?

**Rủi ro 1 — nơi tiêu thụ rất rộng.** `buildSessionNumberMap` được gọi ở **23 file**
(admin 6, site GV 8, portal 4, lib 5). Đổi ngữ nghĩa của nó là đổi cùng lúc 23 màn.

**Rủi ro 2 — 6 nơi dùng số buổi để SẮP XẾP**, không chỉ để in:
`sortSessionsForWork` / `compareSessionWorkOrder` (`lib/lms/session-order.ts:…`) được dùng ở
`teacher/diem-danh`, `teacher/nhan-xet`, `teacher/lop/_components/hub-reviews-tab`,
`hub-sessions-tab`, `lib/classes/session-feedback-data.ts`. Chúng sắp **tăng dần theo số
buổi** trong từng nhóm việc.
⇒ Đổi số buổi sang thứ tự giáo trình là **danh sách việc của giáo viên thôi xếp theo thời
gian**. Xem (b).

**Rủi ro 3 — lý do gốc của `session-order.ts` vẫn còn hiệu lực cho TƯƠNG LAI.** Docblock
`:12-14` nói không dùng `plan.seq`/`Lesson.order` vì *"hai cột đó rỗng ở lớp không ghim giáo
trình và bị SetNull khi dời/huỷ buổi"*. Đo hôm nay: **0 lớp không ghim, 0 buổi mất plan** ⇒
lý do đó **không còn đúng với dữ liệu hiện tại**, nhưng **vẫn đúng với mã**: nhánh fallback
của `generate.ts` còn sống, và `planId` vẫn `onDelete: SetNull`.

**Rủi ro 4 — hai buổi cùng số.** DB **không có** `@@unique([classId, seq])` trên
`ClassSessionPlan`. Hôm nay 0 lớp trùng `order`, nhưng không gì chặn. Hạng-theo-ngày thì
luôn tự sinh số duy nhất; `plan.order` thì không.

**Chỗ ngầm giả định "Buổi N là thứ tự thời gian":** chính là 6 nơi ở rủi ro 2. Ngoài ra
**không có màn nào LỌC theo số buổi** (grep `filter|slice|where|<=|>=|take` quanh
`sessionNumber` → 0 kết quả).

### (b) Nhãn thành "Buổi 43" vào 25/06 — màn nào sắp/lọc theo số buổi sẽ sai?

- **LỌC: không màn nào.** ĐO: không có chỗ nào lọc theo số buổi.
- **SẮP XẾP: 5 màn + 1 lib** (danh sách ở rủi ro 2). Với Sata6, buổi ngày **25/06** thành
  **"Buổi 43"** và bị xếp **SAU** buổi ngày **12/09** ("Buổi 19"). Danh sách "việc còn nợ"
  của giáo viên **thôi theo thứ tự thời gian**.

  Đây là đánh đổi thật, không phải lỗi triển khai: nhãn nói đúng sự thật *(buổi 43 dạy sớm)*
  nhưng thứ tự làm việc thì giáo viên cần theo **ngày**. **Đề xuất: tách hai khái niệm** —
  `sortSessionsForWork` sắp theo **ngày**, còn nhãn in theo **plan.order**. Hai thứ vốn là
  hai câu hỏi khác nhau, `session-order.ts` đang trả lời cả hai bằng một con số.

### (c) Lớp không có plan thì lấy gì làm thứ tự lộ trình?

**Đo trên prod: 0 lớp như vậy.** Nhưng nhánh sinh buổi không-plan còn sống, nên phải trả lời:

1. **Có nguồn:** `lib/classes/generate.ts:193-199` — nhánh fallback **vẫn gán `lessonId`**
   theo `curriculum.lessons` sắp `order: asc`. Vậy **`Lesson.order` qua `lessonId` là nguồn
   thứ tự hợp lệ** cho lớp không plan.
2. **Không có nguồn:** khi `lessonId` **cũng** null (buổi thêm tay không chọn bài, hoặc bị
   `SetNull`). Lúc đó **KHÔNG CÓ nguồn thứ tự lộ trình nào** — nói thẳng như vậy. Chỉ còn
   hạng-theo-ngày, và nó **không phải** thứ tự lộ trình, chỉ là thứ tự thời gian.

⇒ Thang fallback đề xuất: `plan.order + 1` → `Lesson.order` → hạng-theo-ngày (và khi rơi
xuống nấc cuối thì **nhãn phải nói rõ đó là số theo lịch**, đừng để người đọc tưởng là số
bài).

---

# Bước 3 — THIẾT KẾ BẢN VÁ (chưa code, chưa ghi gì)

Trạng thái: **đề xuất, chờ chủ dự án duyệt.** Không sửa file mã sản phẩm, không migration.
Mọi số dưới đây **ĐO trên prod** bằng script chỉ-đọc.

## 3.0 Việc 1 — đo lại nhóm 41 sau khi gỡ tiền tố `HPn - `

Dùng **hàm thật** `meaningfulSessionTitle` (export ở `session-project-name.ts:115`) cho
**cả hai vế** — nó làm đúng việc cần: `clean()` + coi `"Buổi N"` là rỗng + cắt tiền tố
`"Buổi N —"` + **gỡ `"HPn - "`**.

| | trước (chỉ trim+lower) | **sau (gỡ tiền tố)** |
|---|---|---|
| placeholder — `meaningful()` loại | 502 | **502** |
| trùng bài giáo trình CỦA LỚP | 144 | **153** |
| trùng bài giáo trình KHÁC | 0 | **3** |
| KHÔNG trùng bài nào | 41 | **29** |

**29 chuỗi còn sót ⇒ 10 TÊN PHÂN BIỆT**, 9 tên lặp **đúng 3 lần** (một lần / mỗi lớp Sata3),
1 tên lặp 2 lần. Toàn bộ nằm ở `CS1.SATA3.26.001`, `CS1.SATA3.26.002`, `CS2.SATA3.26.001`.

> ### Kết luận Q4
> **`customTitle` là 100 % chuỗi MÁY CHÉP. Không có bằng chứng nào cho "giáo viên tự đặt".**
> Không ai gõ tay trùng khít 10 tên qua 3 lớp. 29 chuỗi này là giáo trình Sata3 **cũ**, mà
> các `Lesson` của bản cũ đó **không còn trong DB** (nên không khớp được bài nào).
>
> ⇒ **Q4 giải quyết trọn ở tầng HIỂN THỊ, không cần ghi một dòng nào.**
>
> ⚠️ Đây là "0 bằng chứng", không phải "không thể xảy ra": mai có giáo viên gõ tay một tiêu
> đề là nhóm này khác ngay. Nên thiết kế vẫn **không được XOÁ** `customTitle`.

### Số thật sự quan trọng: chỉ 32 buổi bị ảnh hưởng

Đếm buổi mà tên hiển thị **thực sự khác** `lesson.title` (sau chuẩn hoá; bỏ placeholder và
bỏ nhóm trùng-chữ):

```
buổi hiện tên KHÁC lesson.title:  32   (không phải 687)
  trong đó ĐÃ DẠY:               26
  CHƯA DIỄN RA:                   6
số lớp:                            3   (CS1.SATA3.26.001/.002, CS2.SATA3.26.001)
```

**153 buổi "trùng bài của lớp" hiển thị ĐÚNG CÙNG CHỮ** với `lesson.title`, nên dù
`customTitle` thắng thì người dùng **không thấy khác gì**. Vấn đề tên bài **không phải 687
buổi, mà là 32 buổi ở 3 lớp**.

---

## 3.1 Phản biện đề xuất "đảo ưu tiên theo trạng thái"

Đề xuất của chủ dự án: buổi **đã dạy** → giữ `customTitle`; buổi **chưa diễn ra** →
`lesson.title` thắng.

**Nó đúng mục tiêu Q3.** Nhưng ba điều nên cân nhắc trước khi làm:

**(1) Tên sẽ ĐỔI DƯỚI CHÂN NGƯỜI DÙNG.** Ngay khi giáo viên điểm danh buổi đó, tên hiển thị
**lật** từ `lesson.title` sang `customTitle`. Nặng hơn: với luật **mốc nước cao**, điểm danh
buổi 20 làm **buổi 1..19 cùng lật một lượt**. Một cái tên tự đổi khi ai đó bấm điểm danh là
thứ khó giải thích với giáo viên, và nó **ngược đúng tinh thần Q3** ("ghi nhận sự thật thì
phải ổn định").

**(2) Quy mô không xứng với chi phí.** Việc này thêm một nhánh **phụ thuộc trạng thái** vào
hàm hiển thị đang có **22 nơi tiêu thụ** — để sửa **đúng 6 buổi** (số buổi chưa diễn ra đang
hiện tên cũ). Sáu buổi, ba lớp, một khoá.

**(3) Tiền đề của Q3 yếu hơn ta tưởng.** Q3 nói *"buổi đã dạy là ghi nhận sự thật"*. Nhưng
`customTitle` **không phải** ghi nhận của con người — nó là ảnh chụp của một giáo trình cũ do
máy chép (đo ở 3.0). Không có cột nào lưu "giáo viên thật sự đã dạy bài gì". Nên cả
`customTitle` lẫn `lesson.title` **đều không phải sự thật lịch sử**; ta đang chọn giữa hai
phỏng đoán.

### Ba phương án, xếp theo mức tôi khuyến nghị

| | Phương án | Ghi dữ liệu | 26 buổi đã dạy | 6 buổi chưa dạy | Nhận xét |
|---|---|---|---|---|---|
| **A ⭐** | **Đợt 1 KHÔNG đụng ưu tiên tên.** Chỉ sửa SỐ BUỔI. Ba lớp Sata3 giao **Đào tạo** sửa `customTitle` bằng màn quản trị (dữ liệu của họ, họ quyết) | 0 | giữ nguyên ✔ | Đào tạo sửa | Ít máy móc nhất; đúng người quyết nội dung; **sửa được cả 26 lẫn 6** nếu Đào tạo muốn |
| B | Đảo ưu tiên **theo trạng thái** (đề xuất của anh) | 0 | giữ nguyên ✔ | tự đúng | Sửa được 6; đổi tên lúc điểm danh (điểm 1) |
| C | **Đóng băng lúc chốt buổi**: khi buổi chuyển COMPLETED, chép tên đang hiển thị vào một cột trên `ClassSession`; hiển thị = cột đóng băng → `lesson.title` | **CÓ** (1 ghi/buổi + backfill 47 buổi) | đóng băng thật ✔ | tự đúng | Sạch nhất về khái niệm, nhưng phải ghi dữ liệu ⇒ Đợt 2 |

**Khuyến nghị: A cho Đợt 1** (0 rủi ro, 0 ghi), và nếu sau này muốn "đã dạy = đóng băng" là
tính chất của hệ thống chứ không phải quy ước hiển thị thì làm **C ở Đợt 2**.

Nếu anh vẫn chọn **B**, tôi làm được — chỉ xin ghi rõ trong mã rằng tên lật khi có dấu vết
đầu tiên, kèm số đo 6/26 để người sau biết đánh đổi.

---

## 3.2 ĐỢT 1 — thuần hiển thị, **0 dòng dữ liệu bị ghi**

### 3.2.1 Tách hai khái niệm trong `lib/lms/session-order.ts`

Gốc của lỗi: **một con số trả lời hai câu hỏi khác nhau.** Tách làm hai hàm, đặt tên theo lối
tiếng Việt của repo:

```ts
/** Thứ tự LỘ TRÌNH — dùng để IN NHÃN. plan.order + 1 → Lesson.order → null. */
export function soBuoiTheoLoTrinh(row): number | null

/** Thứ tự THỜI GIAN — dùng để SẮP XẾP và làm nấc cuối của nhãn. Hạng theo ngày. */
export function soBuoiTheoLich(rows): Map<string, number>   // = buildSessionNumberMap, đổi tên

/** Nhãn: có số lộ trình thì in thẳng; không thì in số lịch và NÓI RÕ đó là số theo lịch. */
export function nhanSoBuoi(loTrinh: number|null, lich: number|null): string
```

**Thang fallback của nhãn** (chốt ở Bước 2c):
`plan.order + 1` → `Lesson.order` → hạng-theo-ngày *(và ở nấc này nhãn phải nói rõ là **số
theo lịch**, đừng để người đọc tưởng là số bài)*.

**Vì sao giữ `buildSessionNumberMap` chứ không xoá:** 22 nơi đang gọi nó. Đổi tên + giữ một
`export` cũ trỏ sang tên mới trong một đợt, rồi mới dọn — tránh đổi 22 file trong một PR.

### 3.2.2 Bảng ĐỦ 22 nơi tiêu thụ — nơi nào cần số nào

Phân loại bằng cách đếm lời gọi hàm nhãn (`deriveSessionLabel` / `sessionNumberLabel` /
`deriveSessionProjectName`) và hàm sắp (`sortSessionsForWork` / `compareSessionWorkOrder`).

| # | Nơi | nhãn | sắp | Cần |
|---|---|---|---|---|
| 1 | `admin/attendance/page.tsx` | 3 | 0 | **LỘ TRÌNH** |
| 2 | `admin/classes/[id]/edit/page.tsx` | 0 | 0 | **cần xem tay** — dựng `sessionNumberOf` rồi truyền xuống form |
| 3 | `admin/classes/[id]/page.tsx` | 0 | 0 | **cần xem tay** — docblock cảnh báo về `take` |
| 4 | `admin/duyet-media/page.tsx` | 2 | 0 | **LỘ TRÌNH** |
| 5 | `admin/media/actions.ts` | 3 | 0 | **LỘ TRÌNH** |
| 6 | `admin/sessions/[id]/page.tsx` | 2 | 0 | **LỘ TRÌNH** |
| 7 | `teacher/anh-lop/page.tsx` | 3 | 0 | **LỘ TRÌNH** |
| 8 | `teacher/diem-danh/page.tsx` | 3 | **3** | **CẢ HAI** — nhãn lộ trình, sắp theo lịch |
| 9 | `teacher/hoc-vien/page.tsx` | 7 | 0 | **LỘ TRÌNH** |
| 10 | `teacher/lop/page.tsx` | 2 | 0 | **LỘ TRÌNH** |
| 11 | `teacher/lop/_components/hub-reviews-tab.tsx` | 6 | **3** | **CẢ HAI** |
| 12 | `teacher/lop/_components/hub-sessions-tab.tsx` | 3 | **3** | **CẢ HAI** |
| 13 | `teacher/nhan-xet/page.tsx` | 3 | **2** | **CẢ HAI** |
| 14 | `teacher/nhan-xet/pdf/[sessionId]/[studentId]/route.ts` | 2 | 0 | **LỘ TRÌNH** — PDF gửi phụ huynh |
| 15 | `lib/classes/session-feedback-data.ts` | 0 | **2** | **LỊCH** (thuần sắp xếp) |
| 16 | `lib/lms/attendance-queue.ts` | 0 | 0 | **LỊCH** — có `number` + `time` để phá hoà ⇒ đang sắp xếp |
| 17 | `lib/media-review/tree.ts` | 2 | 0 | **LỘ TRÌNH** |
| 18 | `lib/portal/buoi-hoc.ts` | 5 | 0 | **LỘ TRÌNH** — cổng phụ huynh |
| 19 | `lib/portal/feedback.ts` | 0 | 0 | **cần xem tay** — trả thẳng map ra ngoài |
| 20 | `lib/portal/photos.ts` | 0 | 0 | **cần xem tay** |
| 21 | `lib/portal/student-assignments.ts` | 0 | 0 | **cần xem tay** |
| 22 | `lib/lms/session-project-name.ts` | — | — | nơi dựng nhãn: nhận số từ caller |

**Tóm tắt:** 11 nơi cần **lộ trình** · 2 nơi cần **lịch** · 4 nơi cần **cả hai** · **5 nơi
phải đọc tay** trước khi phân loại (2, 3, 19, 20, 21) — chúng chỉ chuyền map đi tiếp nên
không suy được từ lời gọi.

⚠️ **Không tự phân loại 5 nơi đó bằng suy đoán.** Đó là việc đầu tiên của đợt code.

### 3.2.3 Sáu nơi SẮP XẾP phải chuyển sang sắp theo NGÀY

`sortSessionsForWork` / `compareSessionWorkOrder` hiện sắp theo **số buổi**. Sau khi tách,
chúng phải nhận **số theo lịch**, không phải nhãn mới. Nếu quên: với `CS2.SATA6.26.001`,
buổi **25/06** mang nhãn "Buổi 43" sẽ bị xếp **SAU** buổi **12/09** ("Buổi 19") — danh sách
việc còn nợ của giáo viên thôi theo thứ tự thời gian.

Nơi phải sửa: `teacher/diem-danh`, `teacher/nhan-xet`, `hub-reviews-tab`, `hub-sessions-tab`,
`lib/classes/session-feedback-data.ts`, `lib/lms/attendance-queue.ts`.

### 3.2.4 Ưu tiên tên bài

Theo khuyến nghị **A** ở 3.1: **Đợt 1 KHÔNG đụng** `deriveSessionTitle`. Ba lớp Sata3 xử lý
bằng dữ liệu, do Đào tạo quyết.

*(Nếu chủ dự án chọn B thì thêm tham số trạng thái vào `deriveSessionTitle` — nhưng đó là
đổi chữ ký của hàm 22 nơi dùng, cân nhắc kỹ.)*

### 3.2.5 Viết lại docblock `session-order.ts:12-14`

Câu hiện tại: *"Không lấy `ClassSessionPlan.seq` / `Lesson.order` làm nguồn: hai cột đó rỗng
ở lớp không ghim giáo trình và bị SetNull khi dời/huỷ buổi"*.

**Nay sai với DỮ LIỆU, vẫn đúng với MÃ.** Đo prod 08/09: **0 lớp không ghim · 687/687 buổi có
`planId` · 0 lớp `order` trùng · 0 lớp `order` hổng**. Nhưng nhánh fallback của
`generate.ts:169-199` còn sống và `planId` vẫn `onDelete: SetNull`.

Viết lại theo hướng: *"`plan.order` là nguồn ĐÚNG cho số lộ trình (đo 08/09: phủ 100 % prod).
Vẫn phải có fallback vì hai đường vẫn đẻ ra buổi không plan: nhánh không-ghim của
`generate.ts` và `onDelete: SetNull` của `planId`. Hạng-theo-ngày là số THỜI GIAN, không phải
số lộ trình — đừng dùng nó làm nhãn khi còn nguồn tốt hơn."*

### 3.2.6 Ba câu bắt buộc cho Đợt 1

| | |
|---|---|
| **Ảnh hưởng 47 buổi đã dạy?** | **KHÔNG.** Đợt 1 không ghi một dòng dữ liệu nào; chỉ đổi cách đọc. Tên bài của 26 buổi đã dạy đang hiện tên cũ **giữ nguyên** (phương án A). Nhãn SỐ của chúng có đổi (từ số-theo-ngày sang số-lộ-trình) — **đó chính là bản vá**, và nó là hiển thị chứ không phải ghi nhận. |
| **Kiểm chứng sau khi vá** | (1) Test thuần cho `soBuoiTheoLoTrinh` + thang fallback (3 nấc + ca không có nguồn nào). (2) Test thuần: `sortSessionsForWork` vẫn sắp theo NGÀY khi nhãn đổi — ca `CS2.SATA6.26.001` (buổi 25/06 nhãn 43) phải đứng TRƯỚC buổi 12/09. (3) Chạy lại `scripts/ra-soat-lech-bai-hoc.ts` trên prod: **B phải về 0** trong khi mọi cột khác không đổi. |
| **Quay lui** | `git revert` PR. **0 dữ liệu bị đụng nên quay lui là tuyệt đối** — không có bước khôi phục nào. |

---

## 3.3 ĐỢT 2 — chống tái phát (có migration, additive)

### 3.3.1 `@@unique([classId, order])` trên `ClassSessionPlan`

**Xác nhận trước khi viết (ĐO 08/09):** `lớp order TRÙNG: 0` / 16 lớp; `lớp order HỔNG: 0`.
⇒ **thêm được ngay**, migration không cần dọn dữ liệu.

⚠️ **Phải đo lại NGAY TRƯỚC khi chạy migration** — số này chụp ngày 08/09; giữa lúc duyệt và
lúc chạy có thể có lớp mới.

| | |
|---|---|
| **Ảnh hưởng 47 buổi đã dạy?** | **KHÔNG** — chỉ thêm ràng buộc, không sửa dòng nào. |
| **Kiểm chứng** | Chạy lại đoạn đo `order TRÙNG` → vẫn 0. Thêm test: tạo 2 plan cùng `(classId, order)` phải bị DB từ chối. |
| **Quay lui** | `DROP INDEX` — an toàn, không mất dữ liệu. |
| **Rủi ro** | Đường ghi nào đang tạo plan trùng `order` sẽ **bắt đầu ném lỗi**. Phải rà `createSessionPlansForClass` + `adoptCurriculumVersion` trước. |

### 3.3.2 Nhánh `generate.ts:169-199` tạo buổi KHÔNG có plan

**Đề xuất: BỔ SUNG plan, không chặn.** Lý do: chặn là làm hỏng đường tạo lớp cho khoá chưa
ghim giáo trình — một nghiệp vụ hợp lệ. Thay vào đó, trước khi sinh buổi thì gọi
`createSessionPlansForClass` (đã có sẵn, idempotent) để lớp luôn có plan; nhánh không-plan
chỉ còn là lưới cho lớp **không có giáo trình nào**.

| | |
|---|---|
| **Ảnh hưởng 47 buổi đã dạy?** | **KHÔNG** — chỉ áp cho lớp tạo MỚI sau khi vá. |
| **Kiểm chứng** | Test: tạo lớp không ghim → sinh buổi → mọi buổi phải có `planId`. Đo lại prod: `buổi KHÔNG có planId` vẫn 0. |
| **Quay lui** | `git revert`; lớp đã có plan thì giữ plan (vô hại). |

### 3.3.3 `planId onDelete: SetNull`

**Rủi ro hiện tại:** xoá một `ClassSessionPlan` là mọi buổi trỏ nó **mất `planId` trong im
lặng** ⇒ tụt xuống fallback, nhãn đổi mà không ai biết.

**Ba hướng, kèm rủi ro:**

| Hướng | Được | Mất |
|---|---|---|
| **Giữ `SetNull`** (không đổi) | không rủi ro triển khai | lỗi vẫn im lặng |
| **Đổi sang `Restrict`** | không thể xoá plan khi còn buổi trỏ | **có thể chặn một đường xoá đang chạy** — phải rà `adoptCurriculumVersion` (nó `update` planId, có xoá plan cũ không?) trước khi đổi |
| **Giữ `SetNull` + cảnh báo** | không rủi ro | thêm việc giám sát |

**Đề xuất: chưa đổi vội.** Trước hết **đo** xem có đường nào đang xoá `ClassSessionPlan`
không; nếu **không có đường xoá nào** thì `Restrict` là thay đổi không rủi ro. **CHƯA ĐO** —
đây là việc đầu tiên của Đợt 2.

---

## 3.4 Việc CHƯA làm / CHƯA đo

- **5 nơi tiêu thụ chưa phân loại được** (mục 3.2.2: #2, #3, #19, #20, #21) — phải đọc tay.
- **Đường xoá `ClassSessionPlan`** — chưa đo, cần cho 3.3.3.
- **Ba lớp Sata3**: ai sửa `customTitle`, sửa thế nào — việc của Đào tạo, cần chủ dự án giao.
- Tất cả những thứ trên **không chặn Đợt 1**.

---

# Bước 3b — ba việc trước khi merge Đợt 1

## 3b.1 `adoptCurriculumVersion` — đọc mã + đối chiếu dữ liệu

Nguồn: `lib/classes/snapshot.ts:68-175`.

| Câu hỏi | Trả lời (đọc mã) |
|---|---|
| **Dựng lại plan cho buổi nào?** | **CHỈ buổi chưa `COMPLETED`.** `:126` xoá mọi plan **không** thuộc buổi COMPLETED; `:131` dựng lại từ `target.lessons.slice(keptCount)`; `:148-155` re-link **chỉ** `futureSessions` (`status !== "COMPLETED"`, sắp theo ngày). |
| **`customTitle` của plan mới lấy từ đâu?** | `:139` — **`customTitle: l.title`**, chép thẳng tên bài của giáo trình **MỚI**. |
| **Buổi quá khứ giữ nguyên plan cũ?** | **Đúng.** Plan của buổi COMPLETED nằm trong `keptPlanIds` nên thoát lệnh xoá, và buổi đó không bị re-link. |

### ⚠️ Giả thuyết về ca Sata3 KHÔNG KHỚP MÃ — bác bằng số đo

Giả thuyết: *"buổi 4–14 giữ `customTitle` giáo trình cũ, từ buổi 15 khớp giáo trình mới,
vì hàm này chỉ chạm buổi tương lai."*

**ĐO — `ClassSessionPlan` của `CS1.SATA3.26.001`, `order` 0..17:**

```
order | lesson.order | customTitle                  | tên bài HIỆN HÀNH            | completed
    0 |            1 | Bàn tay ma thuật             | HP1 - Bàn tay ma thuật       | f
    1 |            2 | Đấu trường con quay          | HP1 - Đấu trường con quay    | f
    2 |            3 | Siêu xe bứt phá              | HP1 - Siêu xe bứt phá        | f
    3 |            4 | Lập trình di chuyển          | HP1 - Chiến Xa Tốc Độ        | f
   …  |            … | …(tên giáo trình CŨ)…        | …(tên MỚI)…                  | f
   13 |           14 | Tổng kết & trình diễn        | HP2 - Cỗ Máy Xúc Cát         | f
   14 |           15 | Buổi 15                      | HP2 - Họa Sĩ Robot           | f
   15 |           16 | Buổi 16                      | HP2 - Chinh Phục Đại Dương   | f
   16 |           17 | Buổi 17                      | HP2 - Ôn tập kiến thức       | f
   17 |           18 | Buổi 18                      | HP2 - Chiếc Hộp Giai Điệu    | f
```

**Ba điều bác giả thuyết:**

1. **`completed = f` ở TOÀN BỘ dải này.** Cả lớp chỉ có **1** buổi `COMPLETED` (ĐO:
   `count(*) FILTER (WHERE status='COMPLETED')` → `CS1.SATA3.26.001` = 1/47), và nó nằm ở
   `order` 47, ngoài vùng lệch. ⇒ ranh giới **không phải** "COMPLETED vs tương lai".
2. **Ranh giới thật nằm ở `order` 13/14**, và bản chất là **"tên thật vs placeholder"**:
   plan 0–13 mang **tên giáo trình cũ**, plan 14+ mang **`"Buổi 15"`, `"Buổi 16"`…** —
   placeholder mà `meaningful()` loại, nên chúng vô hình chứ không phải "khớp".
3. **Buổi 1–3 trông "đúng" chỉ vì trùng tên ngẫu nhiên.** `"Bàn tay ma thuật"` có ở **cả
   hai** giáo trình. Không có ranh giới nào ở buổi 4 cả.

**Hệ quả quan trọng nhất:** nếu `adoptCurriculumVersion` đã chạy trên lớp này thì plan mới
**phải mang `customTitle = l.title` của giáo trình MỚI** (`:139`). Chúng **không** mang.
⇒ **Hàm này CHƯA TỪNG chạy trên `CS1.SATA3.26.001`.**

**Hình dạng thật (SUY từ dữ liệu, chưa có audit log xác nhận):** giáo trình Sata3 cũ có
**~14 bài** → lớp tạo theo bản đó (plan 0–13 mang tên thật) → mở rộng lên 48 buổi bằng plan
**placeholder** (14–47) → sau đó `lessonId` được trỏ sang bản 48 bài mới **mà `customTitle`
để nguyên**. Không đường nào trong 8 đường ghi dọn `customTitle` khi `lessonId` đổi.

⇒ **Đây KHÔNG phải hành vi có chủ đích của `adoptCurriculumVersion`.** Không ghi thành luật;
ghi thành **vết thương đã đo** như trên.

## 3b.2 `@@unique([classId, order])` — **ĐỪNG THÊM**

**ĐO ngay lúc này:** `SELECT count(*) FROM (… GROUP BY classId, order HAVING count(*)>1)`
→ **0 cặp trùng**. Về mặt dữ liệu, thêm được.

**Nhưng nó sẽ LÀM VỠ `adoptCurriculumVersion`**, và đây là ca cụ thể có thật:

- Plan của buổi COMPLETED **giữ nguyên `order` GỐC** — hàm **không** đánh số lại chúng.
- Plan mới đánh từ `keptCount`: `order: keptCount + i` (`:141`).
- `CS1.SATA3.26.001` có **1** buổi COMPLETED, plan của nó ở **`order` 47**. ⇒ `keptCount = 1`,
  plan mới nhận `order` **1, 2, …, 47** — **đụng đúng `order` 47 đang tồn tại**.

Trong transaction, plan cũ ở order 47 **không bị xoá** (nó trong `keptPlanIds`) còn plan mới
lại xin order 47 ⇒ **vi phạm ràng buộc, cả transaction rollback**, và lớp đó **không đổi
được giáo trình nữa**.

> **Kết luận: KHÔNG thêm `@@unique([classId, order])` ở thời điểm này.** Muốn thêm thì phải
> sửa `adoptCurriculumVersion` trước — cho nó đánh lại `order` **liên tục từ 0** trên toàn bộ
> plan còn lại thay vì tiếp nối từ `keptCount`. Đó là việc riêng, có rủi ro riêng.

Cùng lý do đó, `planId onDelete: SetNull` **giữ nguyên**: `snapshot.ts:126` là đường xoá
plan **duy nhất** trong mã sản phẩm, và chú thích ngay tại đó nói rõ nó **dựa vào** `SetNull`
(*"buổi future trỏ planId sẽ SetNull"*). Đổi sang `Restrict` là làm vỡ nó.

## 3b.3 Ca test đỏ — kết quả săn

Xem mục cuối tài liệu này (cập nhật sau khi chạy đủ 10 lượt).
**KẾT QUẢ SĂN (08/09):**

| Đợt | Số lượt | Kết quả |
|---|---|---|
| Lượt 1 — **VÔ HIỆU** | 10 | Chạy **đè lên lúc đang sửa file**. Lượt 5–6 đỏ vì `[PARSE_ERROR]` do chính tôi (docblock chứa `*/` trong regex đã đóng comment sớm). Lượt 7–10 đỏ vì bản vá thật (mục dưới). **Không dùng làm bằng chứng flake.** |
| Lượt 2 — sạch | 10 | 10/10 xanh, 5658 test |
| Lượt 3 — sạch, sau khi vá cổng phụ huynh | 8 | 8/8 xanh |

**Tổng 18 lượt sạch, 0 đỏ.** Có **1 lượt đỏ lẻ** xen giữa hai đợt (chạy không lưu output nên
không bắt được tên) — nhắc lại rằng flake còn đó, chỉ là thưa.

**Nhưng lượt VÔ HIỆU vẫn cho 3 tên ca** — chúng đỏ dưới tải nặng (typecheck + soạn thảo chạy
song song), thời gian đều sát mốc chờ:

| Ca | Lượt đỏ | Thời gian | Liên quan bản vá? |
|---|---|---|---|
| `tests/cham-cong/requests.spec.ts > isSubmittedLate` | 7, 9 | 5184 ms · 5013 ms | **KHÔNG** — module chấm công, không đụng buổi/bài |
| `tests/elearning/trn-training-need-invariants.test.ts > bảng sinh ở ĐÚNG một migration` | 9 | 9114 ms | **KHÔNG** — quét thư mục `prisma/migrations` |
| `tests/elearning/trn-reminder-incident-invariants.test.ts > không migration nào khác cùng đụng hai bảng này` | 9 | 9462 ms | **KHÔNG** — cùng loại |

Cả ba đều **quá-hạn-chờ dưới tải I/O**, không phải sai kết quả: `isSubmittedLate` là hàm
thuần (không I/O) mà mất 5,1 giây — đó là tiến trình bị đói CPU chứ không phải logic. Hai ca
migration đọc cả cây `prisma/migrations` bằng I/O đồng bộ. **Đây là flake hạ tầng, không phải
flake nghiệp vụ**, và không nơi nào chạm mã của bản vá.

### Ca đỏ THẬT do bản vá — 1 ca, đã xử

`lib/portal/buoi-hoc.test.ts > tên bài mang sẵn tiền tố học phần → tách đúng chỗ, không in lặp`
— đỏ **liên tục** ở lượt 7–10 (không phải flake). Dựng **một** buổi, `lesson.order = 9`:

```
Expected: "Buổi 1 - HP2 - Họa Sĩ Robot"   ← hạng theo ngày của buổi duy nhất
Received: "Buổi 9 - HP2 - Họa Sĩ Robot"   ← số lộ trình
```

Ca này đang **khoá đúng cái hành vi vừa bị bác bỏ**. Sửa **kỳ vọng**, không sửa mã, và thêm
khẳng định `soBuoi === 1` để giữ nguyên vế "thứ tự trong danh sách vẫn theo ngày".

---

# Đợt 1b — nối nhãn vào số lộ trình

## 1b.1 Một chỗ sửa gốc

`sessionOrLessonNumber` (`lib/lms/session-project-name.ts`) đảo thứ tự ưu tiên:

```
TRƯỚC: sessionNumber (hạng theo NGÀY) → lessonOrder → null
NAY:   plan.order + 1 → Lesson.order  → sessionNumber (hạng theo ngày) → null
```

Mọi nơi in nhãn đều đi qua `deriveSessionLabel` / `deriveSessionProjectName`, nên đảo ở đây
chữa cho **tất cả cùng lúc** — không phải sửa 22 lời gọi.

⚠️ **Nấc cuối ở đây in `Buổi N` TRẦN, KHÔNG kèm `(theo lịch)`.** Cố ý: nhãn ghép đi qua
`stripSessionNumberPrefix` ở cổng phụ huynh, mẫu cắt tiền tố đòi số đứng ngay trước dấu gạch.
Chèn chữ vào giữa là hỏng việc cắt. Chỗ in số **trần** thì dùng `nhanSoBuoi`
(`lib/lms/session-order.ts`) — hàm đó có kèm chú thích.

## 1b.2 Bản đồ 22 nơi — làm gì ở mỗi nơi

**Nơi cần số LỘ TRÌNH (11):** `admin/attendance/page.tsx` · `admin/duyet-media/page.tsx` ·
`admin/media/actions.ts` · `admin/sessions/[id]/page.tsx` · `teacher/anh-lop/page.tsx` ·
`teacher/hoc-vien/page.tsx` · `teacher/nhan-xet/pdf/[sessionId]/[studentId]/route.ts` (PDF
gửi phụ huynh) · `lib/media-review/tree.ts` · `lib/portal/buoi-hoc.ts` (cổng phụ huynh) ·
`lib/portal/feedback.ts` · `app/(portal)/portal/nhan-xet/page.tsx`.
→ mở rộng `plan: { select: { customTitle: true } }` thêm `order: true`, và đặt `planOrder`
kèm mỗi dòng `planTitle`.

**Nơi cần CẢ HAI — nhãn theo lộ trình, sắp theo lịch (4):** `teacher/diem-danh/page.tsx` ·
`teacher/lop/_components/hub-reviews-tab.tsx` · `teacher/lop/_components/hub-sessions-tab.tsx` ·
`teacher/nhan-xet/page.tsx`.
→ vế nhãn như trên; vế sắp xếp đã làm ở Đợt 1 (`thoiGian = date.getTime()`).

**Nơi thuần SẮP XẾP (2, xong ở Đợt 1):** `lib/classes/session-feedback-data.ts` ·
`lib/lms/attendance-queue.ts`.

**TỔNG: 19 `plan.select` mở rộng · 22 nơi truyền `planOrder`.**

## 1b.3 ⚠️ Hai nơi định "tách ticket" hoá ra KHÔNG phải chỉ-chú-thích

Chủ dự án chốt tách riêng `lib/portal/photos.ts`, `lib/portal/student-assignments.ts` và
"trường `order` chết". **Đo lại thì cả hai vế đều không đúng** — nói thẳng vì để nguyên là
bản vá tự sinh ra lỗi hiển thị mới:

| Nơi | Trường | Ai đọc | Hậu quả nếu để nguyên |
|---|---|---|---|
| `lib/portal/photos.ts:79` | `order: b.soBuoi` | `components/portal/hinh-anh-page.tsx:58` in `{g.order}` | Huy hiệu in **"2"** ngay cạnh tiêu đề `nhanDayDu` = **"Buổi 43 - …"**. Cùng một nhóm ảnh, hai con số chọi nhau. |
| `lib/portal/student-assignments.ts:163` | `order: b.soBuoi` | `lib/portal/student-home.ts:140-141` in `` `Buổi ${it.order}` `` | Trang chủ portal in **"Buổi 2"** cho buổi mang bài 43. |

Trường **thật sự chết** là `BuoiHoc.nhanSoBuoi` — grep toàn repo: chỉ có nơi khai và nơi gán,
**0 nơi đọc**. Nó vẫn được vá (chuyển sang `nhanSoBuoi()` có chú thích `(theo lịch)`) vì để
nguyên là để sẵn bẫy cho người dùng nó lần sau.

**Đã vá trong Đợt 1b:** `BuoiHoc` thêm trường `soBuoiLoTrinh: number | null`; hai nơi trên đọc
nó, lùi về `soBuoi` khi null. `soBuoi` giữ nguyên nghĩa **hạng theo ngày** và vẫn là thứ dùng
để sắp xếp — hai con số nay tách bạch cả ở kiểu dữ liệu.

**Còn lại tách ticket riêng:** `admin/classes/[id]/page.tsx` và `admin/classes/[id]/edit/page.tsx`
(#2, #3). Hai màn này dựng `seq` từ `buildSessionNumberMap` rồi truyền xuống form quản lý lộ
trình, nơi `plan.order` đã hiển thị **riêng** thành một cột. Chúng không ghép số với tên bài
nên **không mang lỗi**, nhưng chữ "seq" ở đó nghĩa mập mờ — việc dọn tên, không phải việc sửa lỗi.

## 1b.4 Đối chiếu nhãn trước–sau cho Đào tạo

`scripts/doi-chieu-nhan-truoc-sau.ts` — chỉ đọc, in **những buổi ĐỔI nhãn** của 3 lớp mẫu:

```
PROD_READONLY_URL='postgresql://…:5432/postgres' \
  pnpm exec tsx scripts/doi-chieu-nhan-truoc-sau.ts
```

Truyền mã lớp làm tham số để chạy lớp khác. **CHƯA CHẠY** — chuỗi chỉ-đọc prod chủ dự án cắm
tay ở phiên trước đã hết khỏi shell; không đưa secret prod vào repo.

---

# Bước 4 — đóng ca Sata3, đối chiếu nhãn, đối soát nơi tiêu thụ

## 4.1 MỌI đường ghi `customTitle` — và đường nào đã ghi cho 3 lớp Sata3

Quét toàn repo (`app` · `lib` · `components` · `scripts` · `prisma` · migration SQL), rồi kiểm
lại trên **`origin/main`** chứ không phải nhánh đang đứng.

| # | Đường | Ghi giá trị gì | Còn sống trên `origin/main`? |
|---|---|---|---|
| 1 | `lib/classes/snapshot.ts:56` — `createSessionPlansForClass` | `customTitle: l.title` — chép tên bài của giáo trình **tại thời điểm tạo lớp**, cho **toàn bộ** bài | **CÒN**, gọi từ `createClass` (`admin/classes/_actions.ts:557`) |
| 2 | `lib/classes/snapshot.ts:140` — `adoptCurriculumVersion` | `customTitle: l.title` của giáo trình **MỚI**, chỉ cho plan của buổi chưa COMPLETED | **CÒN**, gọi từ `adoptCurriculumVersionAction` |
| 3 | `admin/classes/[id]/_curriculum-actions.ts:69` — `updateSessionPlan` | chuỗi giáo vụ **gõ tay** (rỗng thành `null`) | **CÒN**, dùng ở `class-curriculum.tsx` |
| 4 | `prisma/seed-curriculum-sata.ts:318` | **`customTitle: null`** — đây là đường **DỌN**, không phải đường ghi | **CÒN** |
| — | migration `20260615130000` | chỉ `ADD COLUMN "customTitle" TEXT` | — |

**Không có đường thứ năm.** Không đường nào khác chạm cột này.

### Đo prod: đường nào để lại dấu vết trên 3 lớp mẫu

```
CS2.SATA4.26.001  lớp tạo 2026-08-06T10:21:30  ghim v1
  plan 48 · cụm createdAt 1: 2026-08-06T10:21:30×48
  SỬA SAU khi tạo (updatedAt lệch >2s): 0
  customTitle placeholder "Buổi N": 48 (order 0…47)
  customTitle TÊN THẬT: 0
  customTitle === Lesson.title hiện hành: 0/48

CS2.SATA6.26.001  lớp tạo 2026-08-06T10:24:45  ghim v1
  plan 48 · cụm createdAt 1: 2026-08-06T10:24:45×48
  SỬA SAU khi tạo: 0
  customTitle placeholder "Buổi N": 48 (order 0…47)
  customTitle TÊN THẬT: 0
  customTitle === Lesson.title hiện hành: 0/48

CS1.SATA3.26.001  lớp tạo 2026-08-06T13:33:25  ghim v1
  plan 48 · cụm createdAt 1: 2026-08-06T13:33:25×48
  SỬA SAU khi tạo: 0
  customTitle placeholder "Buổi N": 34 (order 14…47)
  customTitle TÊN THẬT: 14 (order 0…13)
  customTitle === Lesson.title hiện hành: 0/48
```

**Đọc ra:** cả ba lớp có **đúng MỘT cụm `createdAt`** và **0 plan bị sửa sau khi tạo**
nên toàn bộ `customTitle` do **một lần `createMany`** duy nhất — **đường #1**. Đường #2 và #3
**chưa từng chạy** trên ba lớp này: nếu #3 chạy thì `updatedAt` phải lệch; nếu #2 chạy thì
plan phải mang tên của giáo trình mới.

**Ranh giới order 13/14 KHÔNG do hai lần ghi.** Nó là ảnh chụp của **giáo trình lúc 06/08**:
sáng 06/08 giáo trình Sata4 và Sata6 chưa được đặt tên bài nào (48/48 vẫn `"Buổi N"`); tới
13:33 cùng ngày, Đào tạo đã đặt tên **14 bài đầu** của Sata3 và chưa đặt 34 bài sau. Lớp Sata3
tạo lúc đó chụp lại đúng trạng thái nửa vời ấy.

Vậy **đường ghi là #1**, đã xác định. Không phải gán cho "đường gần đúng nhất": ba dấu vết
(một cụm `createdAt`, `updatedAt` không lệch, giá trị khớp ảnh chụp giáo trình theo giờ)
chỉ cùng lúc đúng với #1.

### Câu chốt: đường đó CÒN CHẠY ĐƯỢC — Đào tạo sửa tay là chưa đủ

`createSessionPlansForClass` **còn sống nguyên** và chạy trên **mọi lớp mới**. Nó luôn chép
`customTitle = Lesson.title` của thời điểm đó. Giáo trình đổi tên bài sau là lệch lại.

**Nay giáo trình đã đủ tên thật** (đo: 0 bài `"Buổi N"` trên cả 9 giáo trình prod), nên lớp
tạo từ giờ chép đúng — nhưng cơ chế đông cứng vẫn còn, nên đây là **bom hẹn giờ**, không phải
đã tắt.

**Có đường dọn rẻ hơn sửa tay 32 buổi:** `prisma/seed-curriculum-sata.ts` set
`customTitle: null` cho plan đã nối đúng `lessonId`. `customTitle = null` thì nhãn rơi về
`lesson.title`, tức **luôn khớp giáo trình hiện hành**. Đo cho thấy `customTitle === Lesson.title`
là **0/48 ở cả ba lớp**, nên dọn sạch là đúng chứ không mất thông tin nào của con người:
14 chuỗi "tên thật" kia là tên **giáo trình cũ**, không phải ghi nhận của giáo viên.

⚠️ **Trước khi chạy phải đọc `--dry-run` cho kỹ**: `seed-curriculum-sata.ts:389` tự khai
*"--dry-run CHỈ che phần --relink. Curriculum + Lesson vẫn được ghi."* Đây là script đã
từng ghi nhầm lên prod 26/08.

**Đề xuất (chưa làm — chờ chủ dự án quyết):** vá gốc ở đường #1 — `createSessionPlansForClass`
để `customTitle: null` thay vì chép `l.title`. Chuỗi ưu tiên tên bài đã có `lesson.title` làm
nấc kế, nên bỏ bản sao đông cứng không mất gì mà tắt hẳn bom. Việc này **thay đổi hành vi tạo
lớp**, nên tách khỏi PR này.

## 4.2 Đối chiếu nhãn trước–sau (prod, 08/09)

`scripts/doi-chieu-nhan-truoc-sau.ts` — chỉ in buổi ĐỔI nhãn.

| Lớp | Buổi | Đổi nhãn |
|---|---|---|
| `CS2.SATA4.26.001` | 48 | **39** |
| `CS2.SATA6.26.001` | 48 | **47** |
| `CS1.SATA3.26.001` | 47 | **1** |

Ca tiêu biểu:

```
2026-06-25  COMPLETED   Buổi 2  - HP4 - Chạy tổng hợp nhiệm vụ  → Buổi 43   (Sata6)
2026-07-08  COMPLETED   Buổi 7  - HP1 - Ôn tập kiến thức        → Buổi 5    (Sata4)
2026-07-20  COMPLETED   Buổi 10 - HP2 - Thiết kế lắp ráp robot  → Buổi 15   (Sata4)
2027-04-07  SCHEDULED   Buổi 48 - HP2 - Lập trình nhiệm vụ 3    → Buổi 18   (Sata4)
2026-09-05  COMPLETED   Buổi 11 - HP4 - Báo cáo cuối khoá       → Buổi 48   (Sata3)
```

Dòng Sata3 nói rõ mức vô lý của bản cũ: **"Buổi 11 — Báo cáo cuối khoá"**. Dòng Sata4 cuối
cùng cũng vậy: buổi **cuối khoá** in "Buổi 48" nhưng thật ra dạy **bài 18**.

## 4.3 Đối soát nơi tiêu thụ — con số CUỐI CÙNG

Các lượt trước đếm lệch nhau (22 → 20 → 17) vì mỗi lượt đếm một thứ khác: lượt đếm **dòng**
`planTitle`, lượt đếm **file**, lượt đếm file **đã phân loại được**. Đếm lại một lần, theo
**file**, ba nhóm:

**A. Gọi hàm NHÃN — 19 file** (`deriveSessionLabel` / `deriveSessionProjectName` / `sessionNumberLabel`):

| Đã cấp số lộ trình (14) | Còn in số TRẦN, CHƯA cấp (5) |
|---|---|
| `admin/attendance/page.tsx` | `admin/classes/[id]/_components/class-attendance-panel.tsx` |
| `admin/duyet-media/page.tsx` | `admin/classes/[id]/_components/class-eval-panel.tsx` |
| `admin/media/actions.ts` | `admin/classes/[id]/_components/class-feedback-panel.tsx` |
| `admin/sessions/[id]/page.tsx` | `admin/classes/[id]/_components/class-sessions-manage.tsx` |
| `portal/nhan-xet/page.tsx` | `teacher/lop/page.tsx` |
| `teacher/anh-lop/page.tsx` | |
| `teacher/diem-danh/page.tsx` | |
| `teacher/hoc-vien/page.tsx` | |
| `teacher/lop/_components/hub-reviews-tab.tsx` | |
| `teacher/lop/_components/hub-sessions-tab.tsx` | |
| `teacher/nhan-xet/page.tsx` | |
| `teacher/nhan-xet/pdf/[sessionId]/[studentId]/route.ts` | |
| `lib/media-review/tree.ts` | |
| `lib/portal/buoi-hoc.ts` | |

**B. Gọi hàm SẮP XẾP — 6 file**, đã vá ở Đợt 1: `teacher/diem-danh/page.tsx` ·
`hub-reviews-tab.tsx` · `hub-sessions-tab.tsx` · `teacher/nhan-xet/page.tsx` ·
`lib/classes/session-feedback-data.ts` · `lib/lms/attendance-queue.ts`.
Bốn file đầu nằm trong **cả A và B** — đó là 4 nơi "cả hai".

**C. TIÊU THỤ số ở cổng phụ huynh — 2 file**, vá ở Đợt 1b: `lib/portal/photos.ts` ·
`lib/portal/student-assignments.ts` (đọc `soBuoiLoTrinh` mới).

**Tổng file mã sản phẩm đã sửa: 22** = 14 (A đã cấp) + 2 (B không trùng A) + 2 (C) +
`lib/portal/feedback.ts` (dựng nguồn) + `lib/lms/session-project-name.ts` (gốc) +
`lib/lms/session-order.ts` (Đợt 1) + `prisma/schema.prisma` (chú thích).

### ⚠️ 5 nơi còn hở — ghi rõ để KHÔNG rơi im lặng

Cả 5 in `sessionNumberLabel(seq)` = `"Buổi N"` **trần**, cạnh **ngày**, **không ghép chung một
chuỗi với tên bài**. Khác hẳn ca `photos.ts`: ở đó bản vá làm hai vế cạnh nhau chọi số (huy
hiệu "2" cạnh tiêu đề "Buổi 43 - …"), nên bắt buộc phải vá trong cùng PR. Ở 5 nơi này số
**vẫn y như trước bản vá** — bản vá không làm chúng xấu đi.

Nhưng chúng vẫn in số theo lịch mà không nói ra:

| Nơi | In gì | Mức |
|---|---|---|
| `class-feedback-panel.tsx:93` | cột "Buổi {seq}" cạnh cột `label` = `"Bài {order}: {title}"` | **cao nhất** — hai cột cạnh nhau, hai con số; may là cột `label` tự khai "Bài N" nên còn đọc được |
| `class-sessions-manage.tsx:176` | `"Buổi N"` cạnh ngày, bảng quản lý buổi | thấp — bảng vốn xếp theo ngày |
| `class-attendance-panel.tsx:23` · `class-eval-panel.tsx:108` | `"Buổi N · dd/MM"` trong ô chọn buổi | thấp |
| `teacher/lop/page.tsx:184` | `"Buổi N"` trong danh sách việc còn nợ của giáo viên | trung bình |

**Đề xuất Đợt 1c (chưa làm):** cấp `plan.order` cho 2 page server dựng `seq`
(`admin/classes/[id]/page.tsx`, `edit/page.tsx`) rồi truyền xuống 4 component; riêng
`teacher/lop/page.tsx` đổi sang `nhanSoBuoi` để nó tự khai `(theo lịch)`. Không gộp vào PR
này vì nó đổi kiểu dữ liệu truyền xuống 4 component — rủi ro riêng, cần test riêng.

## 4.4 Ticket tách riêng

1. **Test hạ tầng chạm timeout khi chạy song song** — `cham-cong/requests.spec.ts > isSubmittedLate`
   (hàm THUẦN mà mất 5,1 giây), `trn-training-need-invariants`, `trn-reminder-incident-invariants`
   (quét cây `prisma/migrations` bằng I/O đồng bộ). Không liên quan bản vá này.
2. **Đợt 1c** — 5 nơi in số trần ở bảng trên.
3. **Dọn tên biến `seq`** ở `admin/classes/[id]/page.tsx` + `edit/page.tsx`: chữ "seq" ở đó là
   hạng-theo-ngày, trong khi cột `order` ngay cạnh là thứ tự lộ trình.
4. **Vá gốc đường #1** — `createSessionPlansForClass` thôi chép `customTitle`.

---

# Bước 5 — quét lớp lỗi TZ trong test, và bộ nghiệm thu đợt dọn

## 5.1 Bug TZ: quét toàn repo, KHÔNG phải lớp lỗi rộng

Ca đỏ ở `tests/cham-cong/timelog.spec.ts` (08/09) đặt câu hỏi: còn bao nhiêu test dựng ngày
theo UTC trong khi mã sản phẩm chốt ngày theo VN? Quét bốn góc:

| Góc quét | Mẫu | Số chỗ |
|---|---|---|
| A | `Date.UTC(… getUTC*)` trong test | 3 |
| B | `new Date("YYYY-MM-DD")` trong test | 110 |
| C | `getDay/getDate/getMonth/getFullYear` (giờ MÁY) trong test | 4 |
| D | chép tay phép đổi múi giờ (`7 * 60 * 60 * 1000`, `VN_OFFSET`) | 1 file |

**110 chỗ ở góc B loại ngay:** chúng là **hằng cố định** (`new Date("2026-06-08T00:00:00Z")`),
không đọc giờ chạy, nên không thể sinh cửa sổ đỏ. Lớp nguy hiểm chỉ gồm test **lấy giờ hiện
tại rồi cắt ngày** — lọc lại còn 6 file, xét từng cái:

| Nơi | Chẩn đoán | Đã đỏ bao giờ chưa | Cửa sổ giờ gây đỏ |
|---|---|---|---|
| `tests/cham-cong/timelog.spec.ts:180,215` | **LỖI THẬT** — `Date.UTC(now.getUTC*)` vs `vnDateOnly(now)` của `timelog.ts:82` | **CÓ** — 15:49Z và 15:58Z ngày 08/09 | **15:30Z → 24:00Z mỗi ngày** (22:30–07:00 VN). Đã vá ở #235 |
| `tests/e2e/fl/dashboard-scope.spec.ts:50` | **TRỘN HAI HỆ** — `dayStart` theo giờ MÁY, nhưng `period = monthKeyVN(now)` theo VN | **CHƯA** — job `E2E Phase FL` xanh ở 12 run gần nhất, gồm 15:42Z và 16:46Z | Hẹp: **ngày cuối tháng, 17:00Z→24:00Z** (~7 giờ/tháng), khi VN đã sang tháng mới mà giờ máy chưa |
| `tests/e2e/r7/attendance-fixes.spec.ts:36-40` | **BẢN SAO** — tự chép `VN_OFFSET_MS = 7*60*60*1000` thay vì dùng `lib/time/vn.ts`; chú thích `:395` nói rõ *"phải TRÙNG công thức của server"* | **CHƯA** — `E2E Phase R7 1/2` xanh 12/12 | Không có cửa sổ giờ. Rủi ro là **phân kỳ** nếu `lib/time/vn.ts` đổi — nợ kỹ thuật, không phải bom hẹn giờ |
| `tests/e2e/r1/marketing-alerts.spec.ts:19-20` | An toàn — mốc là **ngày 10 / ngày 3 của THÁNG SAU**, cách `effectiveFrom` ≥ 10 ngày. VN luôn đi trước UTC nên lệch một ngày không kéo mốc xuống dưới | CHƯA | không có |
| `lib/trial/service.test.ts:8` | An toàn — dựng (`new Date(2026,5,1)`) và đọc (`ymd`) **cùng một múi**, round-trip luôn khớp | CHƯA | không có |
| `lib/lms/lms-r3-rest.test.ts:38` | An toàn — đầu vào là hằng `Z` cố định | CHƯA | không có |
| `lib/chat/policy.test.ts:37` | An toàn — `Date.UTC(2026,7,10,…)` hằng cố định | CHƯA | không có |

**Kết luận: một lỗi thật (đã vá), một rủi ro hẹp, một nợ kỹ thuật.** Không cần chia lô lớn.

### Đề xuất lưới chặn — CHƯA làm, chờ quyết

| Cách | Được | Mất |
|---|---|---|
| **Ép TZ cố định cho bộ test** (`process.env.TZ = "Asia/Ho_Chi_Minh"` trong `tests/setup.ts`) | Test giờ-máy hết lệch giữa dev và CI; một dòng | ⚠️ **Che mất lỗi thật**: prod chạy UTC, ép test sang VN là làm test dễ hơn prod. Và ghi chép dự án đã cấm đặt TZ toàn cục — nó làm vỡ cột `@db.Date`. **Tôi khuyên KHÔNG** |
| **Ép TZ = UTC cho bộ test** | Máy dev chạy đúng như prod; bắt sớm mọi lệch VN/UTC ngay ở local | Máy dev đang +07; đổi sẽ làm một số test hiện đang xanh chuyển đỏ — phải dọn trước. Sạch hơn cách trên |
| **Ca canary chạy 17:30Z** | Bắt đúng cửa sổ, không đụng test nào | Thêm một lịch chạy; chỉ báo sau khi lỗi đã có |
| **Lint chặn `getUTCDate()` trong `tests/`** khi file cũng nhắc `workDate` | Chặn ngay lúc viết | Quy tắc hẹp, dễ lách |

Nghiêng về **ép `TZ=UTC` cho bộ test** (khớp prod, không che lỗi) cộng **một canary 17:30Z**
trong lúc chuyển tiếp. Cần dọn trước những test hiện dựa vào giờ máy +07.

## 5.2 Kiểm câu lệnh `--apply` trước khi gõ trên prod

Nghi vấn: cổng chặn ghi vào `docs/` có bắn vào cờ `--csv-nguoi-go` không, và có thể chết
**sau** khi đã ghi DB không?

**Đọc mã — thứ tự thực thi:**

```
:263  ghi CSV người-gõ        ← cờ --csv-nguoi-go
:267  if (!APPLY) return
:272  CỔNG chặn đường DUMP    ← chỉ kiểm --dump, KHÔNG kiểm --csv-nguoi-go
:285  ghi file dump
:313  updateMany              ← ghi DB, sau CÙNG
```

Mọi cổng nằm **trước** `updateMany`, nên không có ca "chết sau khi đã ghi DB". Cổng cũng
không bắn vào `--csv-nguoi-go` — cố ý: CSV bàn giao chỉ 2 dòng đã rà tay, khác dump là bản
sao nội dung khách hàng.

**Chạy thử trọn vòng trên DB nháp `satarobo_vitest`, ĐÚNG câu lệnh sẽ dùng trên prod
(chỉ đổi chuỗi kết nối)** — 4 plan, trong đó 1 dòng giả lập người-gõ (`updatedAt` lệch 48h):

```
SẼ DỌN: 3 · GIỮ NGUYÊN: 1  (THU.009 order 3 | "NGUOI GO" | +48h)
Đã xuất bàn giao nhóm người-gõ: …/docs/ban-giao/customtitle-nguoi-sua-can-xac-nhan.csv
Đã dump giá trị cũ: …/var/customtitle/dump-truoc-khi-don.json
Đã dọn 3 dòng.
EXIT=0
```

DB sau đó: 3 dòng NULL, dòng người-gõ **còn nguyên**. Dump chứa cả `giuNguyen` lẫn 3 dòng
`daDon` kèm giá trị cũ. **Chạy hết từ đầu tới cuối, không chết giữa chừng.**

⇒ **Câu lệnh dùng được nguyên văn, không phải đổi đích CSV:**

```bash
DATABASE_URL='<prod, quyền ghi>' pnpm exec tsx scripts/don-customtitle-may-chep.ts \
  --tat-ca --csv-nguoi-go=docs/ban-giao/customtitle-nguoi-sua-can-xac-nhan.csv --apply
```

Dòng thứ hai script in ra là `Đích: <user>@<host>:<port>/<db>` — đối chiếu nó ra
`…pooler.supabase.com` với user **có quyền ghi** trước khi để chạy tiếp.

## 5.3 Bộ nghiệm thu sau `--apply`

`scripts/nghiem-thu-don-customtitle.ts` — chỉ đọc, một lệnh ra ba kết quả, mã thoát 1 nếu có
phép trượt (dùng được trong runbook).

```bash
PROD_READONLY_URL='postgresql://…:5432/postgres' \
  pnpm exec tsx scripts/nghiem-thu-don-customtitle.ts
```

| Phép | Kỳ vọng |
|---|---|
| 1. Không còn gì để dọn | `SẼ DỌN 0` · `GIỮ 2` |
| 2. Ba lớp mẫu — không buổi nào còn hiện tên giáo trình cũ | `0 buổi` |
| 3. Toàn hệ thống chỉ còn 2 plan mang customTitle | `2/960` |

Phép 2 **cố ý không** đo bằng "số buổi đổi nhãn" của `doi-chieu-nhan-truoc-sau.ts`: script đó
đếm cả buổi đổi vì **SỐ** (lộ trình thay hạng-theo-ngày) — việc đó là chủ đích và vẫn đúng
sau khi dọn. Ở đây chỉ hỏi một câu: `customTitle` còn che `Lesson.title` ở buổi nào nữa không.

**Đã chạy TRƯỚC khi dọn để chứng minh nó thật sự đo được** — cả ba TRƯỢT, số khớp với các
phép đo độc lập trước đó:

```
✘ 1. SẼ DỌN 958 (kỳ vọng 0) · GIỮ 2 (kỳ vọng 2)
✘ 2. 32 buổi (kỳ vọng 0)
✘ 3. 960/960 plan (kỳ vọng 2)
mã thoát = 1
```

Trượt thì in sẵn câu quay lui.

## 5.4 Flake `lib/finance/*` — đo dứt điểm, và một lần suýt gán nhầm

Ticket "test hạ tầng chạm timeout khi chạy song song" nay có số đo đầy đủ. Ca:
`lib/finance/truc-a.test.ts > [BUOC-6] … accountantStatus: CONFIRMED` (và ca song sinh ở
`ghi-nhan.test.ts`), `Error: Test timed out in 5000ms`.

**Chạy RIÊNG hai bộ đó: 825 ms và 669 ms** — cách ngưỡng 5000 ms rất xa. Chúng chỉ vượt khi
chạy trong bộ đầy đủ (400+ file song song, mỗi bộ `readdirSync` + `readFileSync` toàn bộ
`app/ lib/ components/ scripts/`).

**Đo cân bằng trên cùng máy, cùng buổi:**

| Nhánh | Lượt | Kết quả |
|---|---|---|
| nhánh việc | 1, 2, 3 | ĐỎ |
| `origin/main` sạch | 1 | xanh |
| `origin/main` sạch | 2 | **ĐỎ** |
| nhánh việc | 4, 5 | **xanh** |

⇒ **Flake thuần, không phụ thuộc nhánh.** Ghi lại vì suýt kết luận sai hai lần: lần đầu ba
lượt đỏ liên tiếp trên nhánh cộng một lượt xanh trên main trông y hệt hồi quy do nhánh — chỉ
tới khi chạy thêm hai lượt mỗi bên mới lộ ra là ngẫu nhiên. **Ba lượt đỏ liên tiếp chưa đủ để
quy trách nhiệm cho một thay đổi; phải chạy đối chứng ở CẢ HAI phía.**

CI xanh (`Unit tests (Vitest)` pass ở #235) nên đây là đặc thù máy dev — nhưng ngưỡng 5000 ms
cho một phép quét toàn cây là quá sát, và cây đang lớn dần. Việc dọn thuộc ticket riêng.

## 5.5 ⚠️ SỬA LỖ trong §5.1 — "hằng cố định" KHÔNG phải an toàn

§5.1 loại 110 chỗ `new Date("YYYY-MM-DD")` với lý do *"chúng là hằng cố định, không đọc
giờ chạy, nên không thể sinh cửa sổ đỏ"*. **Câu đó chỉ đúng một nửa và đã trả giá ngay.**

**Đúng với MÚI GIỜ. Sai với THỜI GIAN TRÔI.** Hằng cố định mà mã sản phẩm so nó với
`new Date()` thì nó hoá quá khứ rồi nổ — và nổ **một chiều**: không có cửa sổ giờ để đợi nó
tự xanh lại như bug TZ.

### Ca đã nổ — đo trên CÙNG một commit

`tests/cham-cong/requests.spec.ts > LEAVE 2 ngày duyệt ⇒ ghi P cả 2 ngày`:

| Chạy | Kết quả |
|---|---|
| `main` 507ff13b, CI ngày **10/09** | xanh |
| `main` 507ff13b, **rerun ngày 13/09** | **ĐỎ** |
| `origin/main` sạch, local 13/09 | ĐỎ |

Ca xin nghỉ cho **11–12/09/2026** mà **không truyền `now`** ⇒ `submitAttendanceRequest` rơi
về `input.now ?? new Date()`. Một ca **trước đó trong cùng file** đặt
`NGHI_PHEP.noticeDays = 1`, nên cổng `isSubmittedLate` so `11/09` với hôm nay: xanh tới
10/09, **đỏ mãi** từ 11/09. Vá ở PR #244 (chốt `now`, không đụng mã sản phẩm).

### Tiêu chí quét ĐÚNG — ba điều kiện cùng lúc

1. test dựng ngày **CỨNG** (`utc(2026, …)` / `new Date("2026-…")`), **và**
2. hàm sản phẩm nó gọi có `now?: Date` mặc định `?? new Date()` — repo có **~30 hàm** như
   vậy (`lib/cham-cong/{requests,timelog,period,brief-db,reconcile-db,scope-href}` ·
   `lib/crm/{convert-lead,lead-qualify}` · `lib/finance/debt` · `lib/lead/*` ·
   `lib/chat/{queries,pilot-stats,attachments}` · `lib/auth/{actor,shadow-report}` · …), **và**
3. test **KHÔNG** truyền `now`.

Hàm có `now?: Date` là **thiết kế ĐÚNG** — lỗi nằm ở test không dùng nó.

### Danh sách cần soát — chia lô, chưa vá

Xếp theo "nhiều ngày cứng nhất / chốt `now` ít nhất":

| File | ngày cứng | chỗ chốt `now` |
|---|--:|--:|
| `tests/cham-cong/requests.spec.ts` | 19 | 3 → **4** (vá #244) |
| `lib/portal/buoi-hoc.test.ts` | 17 | 1 |
| `tests/e2e/r6/reserve-request.spec.ts` | 12 | **0** |
| `tests/e2e/r7/payment-request-lifecycle.spec.ts` | 11 | **0** |
| `tests/e2e/r6/commission-config.spec.ts` | 8 | **0** |
| `lib/chat/admin.test.ts` | 8 | **0** |
| `tests/e2e/r7/bulk-convert.spec.ts` | 7 | **0** |
| `lib/lead/rotation.test.ts` | 7 | **0** |
| `tests/e2e/r7/class-snapshot.spec.ts` | 6 | **0** |
| `tests/e2e/r1/messenger-models.spec.ts` | 6 | **0** |
| `lib/lms/assignment-window.test.ts` | 6 | **0** |
| `lib/crm/marketing-report.test.ts` | 6 | **0** |

Cột "0 chỗ chốt `now`" **không** đồng nghĩa có lỗi — phần lớn dùng ngày cứng làm **dữ liệu**
chứ không so với hôm nay. Phải xét điều kiện (2) cho từng ca. Ghi ra đây để lần sau không
phải quét lại từ đầu.

### Lưới chặn — cập nhật đề xuất §5.1

Đề xuất cũ (ép `TZ=UTC` + canary 17:30Z) **không bắt được họ lỗi này** — nó không liên quan
múi giờ. Thêm một lưới thứ hai, hiệu quả hơn cả hai:

> **Một lượt CI định kỳ chạy với đồng hồ đẩy lên +90 ngày** (`libfaketime`, hoặc đơn giản
> là một job hằng tuần chạy bộ test trên runner có ngày hệ thống đặt trước). Bom hẹn giờ
> ngày cứng lộ ra ngay, trước khi nó nổ vào mặt người khác.

Rẻ hơn nữa, và nên làm trước: **lint chặn `submitAttendanceRequest`/`decideRequest`/… gọi
trong `tests/**` mà thiếu `now:`** — hẹp nhưng đúng chỗ đau, và không cần hạ tầng mới.

---

# Bước 6 — soát 12 file, và hai lưới chặn họ lỗi ngày

## 6.1 Lưới #1 — lint, ĐÃ LÀM

`lib/eslint/require-now-in-tests.mjs` + test riêng. Chặn `submitAttendanceRequest` /
`decideRequest` gọi trong `tests/**` mà thiếu `now` khai **tường minh**.

### Phát hiện kèm theo: `pnpm lint` KHÔNG quét `tests/`

Script cũ: `eslint app components lib scripts`. **Không có `tests`.** Nghĩa là mọi rule
nhắm test đều vô hiệu trong CI — kể cả rule vừa viết. Bằng chứng: rule báo **12 lỗi** khi
gọi `eslint <file>` tay, `pnpm lint` thì **im lặng**. Đúng luật 10: cổng không soi tới nơi
cần soi thì bằng không có cổng.

Vá: thêm `tests` vào `pnpm lint`, khai globals Node cho `tests/**` (y như khối `scripts/**`
đã làm ở EL-07 — `Buffer`/`console` thật sự tồn tại khi Vitest chạy), vá 3 lỗi
`no-useless-assignment` có sẵn trong `tests/manual/**`. Nay **`pnpm lint` = 0 error** với
phạm vi rộng hơn.

### Rule hẹp có chủ đích — bỏ `recordTimeLog`

Nó cũng có `now ?? new Date()` và cũng đã nổ một lần (#235). Nhưng đo: cả **5 lời gọi** của
nó trong `timelog.spec.ts` **không truyền ngày nào** — chúng cố ý dựa vào "hôm nay" và
khẳng định `CHAM_NGOAI_LICH`. Bắt chúng là **5 dương tính giả**, và rule ồn thì bị vô hiệu
hoá. Ca nguy hiểm của nó mang hình dạng KHÁC (test tự dựng `workDate` bằng `Date.UTC` trong
khi hàm chốt bằng `vnDateOnly`) — đó là lệch múi giờ, cần rule khác.

### Đã cấy lại HAI lỗi để chứng minh cổng bắt được

| Lỗi cấy vào | Kết quả |
|---|---|
| nới rule coi `...spread` là đã chốt `now` | **2 ca ĐỎ** |
| nới phạm vi rule ra cả mã sản phẩm | **1 ca ĐỎ** |
| bản đúng | 9/9 xanh |

Và cấy lại bom thật (bỏ `now` khỏi ca LEAVE): **test đỏ** + **lint báo 1 lỗi** — hai lưới
độc lập cùng bắt.

## 6.2 Soát 12 file — đo TRỰC TIẾP, không suy

Thay vì đọc mã đoán ngày nổ, đẩy đồng hồ hệ thống lên rồi chạy thật (`vi.useFakeTimers`
chỉ fake `Date`, `shouldAdvanceTime: true` để không treo `setTimeout`).

### An toàn — đo được, xanh tới +400 ngày

| File | +90 ngày | +400 ngày |
|---|---|---|
| `lib/portal/buoi-hoc.test.ts` | ✅ | ✅ |
| `lib/lead/rotation.test.ts` | ✅ | ✅ |
| `lib/lms/assignment-window.test.ts` | ✅ | ✅ |
| `lib/crm/marketing-report.test.ts` | ✅ | ✅ |
| `lib/chat/admin.test.ts` | ✅ | ✅ |
| `lib/chat/queries.test.ts` | ✅ | ✅ |

**121/121 ca xanh** ở cả hai mốc. Sáu file này dùng ngày cứng làm **dữ liệu**, không đưa
vào cổng so-với-hôm-nay. Không cần vá.

Thêm: `tests/cham-cong` (toàn bộ, 65 ca) cũng **xanh ở +400 ngày** sau bản vá — bom đã tắt
thật, không phải tắt tạm.

### Đã nổ và đã vá

| File | Ngày nổ | Vá |
|---|---|---|
| `tests/cham-cong/requests.spec.ts` | **11/09/2026** (`d11` hoá hôm nay; xanh tới 10/09) | #244 + 12 lời gọi còn lại ở PR này |
| `tests/cham-cong/timelog.spec.ts` | không phải ngày — **cửa sổ giờ 15:30Z→24:00Z** | #235 |

### CHƯA ĐO ĐƯỢC — 5 file Playwright + 1 file ngoài `include`

| File | Ngày cứng muộn nhất | Vì sao chưa đo |
|---|---|---|
| `tests/e2e/r7/payment-request-lifecycle.spec.ts` | 2026-11-01 | không nằm trong `include` của `vitest.config.ts` ⇒ chạy bằng runner khác |
| `tests/e2e/r6/reserve-request.spec.ts` | 2026-09-01 | Playwright |
| `tests/e2e/r6/commission-config.spec.ts` | 2026-06-10 | Playwright |
| `tests/e2e/r7/bulk-convert.spec.ts` | 2026-09-15 | Playwright |
| `tests/e2e/r7/class-snapshot.spec.ts` | 2026-07-22 | Playwright |
| `tests/e2e/r1/messenger-models.spec.ts` | 2026-06-08 | Playwright |

Lưới fake-timer của Vitest **không áp** cho Playwright — nó chạy tiến trình riêng. Ghi
**"chưa đo"** thay vì đoán ngày nổ (luật 1: đo ≠ suy). Muốn đo thì cần `libfaketime` hoặc
đặt ngày hệ thống của runner — chính là lưới #2 dưới đây.

Ba file có ngày cứng đã **thuộc quá khứ** (06/2026, 07/2026, 09/2026) mà CI vẫn xanh ⇒ khả
năng cao chúng dùng ngày làm dữ liệu chứ không qua cổng so-ngày. Nhưng đó là **suy luận**,
không phải số đo — nên vẫn xếp vào nhóm chưa đo.

## 6.3 Lưới #2 — CI định kỳ đẩy đồng hồ. Đề xuất, chờ duyệt

### Chu kỳ và giờ chạy

**Hằng tuần, Chủ nhật 02:00 giờ VN (19:00Z thứ Bảy).** Lý do từng vế:

- **Hằng tuần**, không phải hằng ngày: bom ngày cứng nổ theo *ngày*, và một tuần là đủ sớm
  để vá trước khi nó đỏ vào mặt người khác. Hằng ngày thì thành tiếng ồn, mà tiếng ồn là
  đường dẫn tới chỗ người ta thôi đọc.
- **Chủ nhật 02:00 VN**: không PR nào đang chạy, không ai đang nghiệm thu. Quan trọng hơn:
  nó nằm **trong** cửa sổ giờ 15:30Z→24:00Z của họ lỗi TZ, nên **một lượt bắt cả hai họ**.
- Chạy **hai mốc**: `+90` ngày (sắp nổ) và `+400` ngày (bom xa). Hai job riêng để biết cái
  nào đỏ.

### Cách báo — phải đọc được là "bom sắp nổ", KHÔNG phải "PR này hỏng"

Đây là điều kiện chủ dự án đặt ra, và nó quyết định thiết kế:

1. **Workflow RIÊNG** (`.github/workflows/bom-hen-gio.yml`), **không** nằm trong `ci.yml`.
   Nó sẽ không bao giờ xuất hiện trong danh sách check của một PR.
2. **`on: schedule` + `workflow_dispatch` duy nhất** — không `push`, không `pull_request`.
   Không có đường nào để nó bám vào một PR.
3. Tên job nói thẳng nó là gì: **`Bom hẹn giờ (+90 ngày)`** / **`Bom hẹn giờ (+400 ngày)`**.
   Người đọc thấy tên là biết ngay đây không phải cổng của PR.
4. **Đỏ thì mở issue**, không chỉ đỏ trong tab Actions: `gh issue create` với nhãn
   `bom-hen-gio`, tiêu đề `[bom] <tên ca> sẽ đỏ từ <ngày>`, thân bài chứa mốc đã dùng +
   log ca đỏ. Một lượt đỏ trong tab Actions mà không ai mở tab thì bằng không có lưới.
5. **Issue trùng thì cập nhật, không mở mới** — tra theo nhãn + tiêu đề trước khi tạo.

### Giới hạn phải biết trước

Lưới này **chỉ phủ bộ Vitest**. Playwright chạy tiến trình riêng nên `vi.useFakeTimers`
không tới; muốn phủ thì phải đặt ngày hệ thống của runner (`sudo date`) hoặc `libfaketime`,
và cả hai đều dễ làm vỡ TLS (chứng chỉ hết hạn theo đồng hồ giả). **Đề xuất: giai đoạn 1
chỉ làm Vitest** — nó phủ `lib/**` + `tests/{chat,nen,lead-intake,cham-cong,elearning}`,
tức phần lớn logic nghiệp vụ. Playwright để giai đoạn 2, quyết riêng.

## 6.4 Lưới TZ=UTC + canary 17:30Z — ĐÃ QUYẾT, và TZ=UTC ĐÃ LÀM

Chủ dự án hỏi giữ hay bỏ. Quyết từng vế, có số đo:

### Canary 17:30Z — **BỎ**

Lưới #2 ở trên chạy Chủ nhật 19:00Z, tức **nằm trong** cửa sổ 15:30Z→24:00Z của họ lỗi TZ.
Một lượt bắt cả hai họ. Thêm canary riêng là hai lịch làm cùng một việc, và mỗi lịch thêm
vào là một thứ nữa để người ta học cách bỏ qua.

### Ép `TZ=UTC` cho bộ test — **GIỮ, và đã làm luôn trong PR này**

Hôm 08/09 tôi đề xuất "đo trước rồi mới quyết". Đã đo:

| Phép đo | Kết quả |
|---|---|
| `TZ=UTC pnpm test:unit` | **5970/5970 xanh** |
| `TZ=UTC` + `tests/cham-cong` trên Postgres local | **65/65 xanh** |

**0 ca đang dựa vào máy dev ở +07** ⇒ nó miễn phí, nên hoãn là vô nghĩa. Đặt
`env: { TZ: "UTC" }` trong `vitest.config.ts`.

Giá trị mà lưới #2 không thay được: nó bắt họ TZ **ngay ở local**, trước cả CI.

⚠️ **KHÔNG phải "đặt TZ toàn cục" mà ghi chép dự án cấm.** Lệnh cấm đó nhắm việc đặt `TZ`
cho **tiến trình ỨNG DỤNG** — nó làm vỡ cách Prisma đọc cột `@db.Date`. Đây là tiến trình
chạy **test**, và đặt về **đúng thứ prod dùng**; ngược chiều với cái bị cấm.

### Và cấu hình này có ca chứng minh của chính nó

`lib/time/tz-bo-test.test.ts`. Vì sao cần: Node đọc `TZ` **lúc khởi tạo tiến trình** — một
cấu hình đặt muộn hơn thời điểm đó sẽ không có tác dụng gì, **và im lặng**. Repo đã bị đúng
loại "cổng im lặng" ba lần (hook đọc biến không tồn tại · `pnpm lint` không quét `tests/` ·
`include` của vitest là bộ lọc cứng).

Đã cấy lại lỗi: **bỏ `env: { TZ }` ⇒ cả 3 ca ĐỎ** (`expected -420 to be +0`, `expected 23
to be 16`); để lại ⇒ 3/3 xanh.

---

# Bước 7 — sửa phạm vi "chưa đo", và lưới #2

## 7.1 ⚠️ SỬA §6.2 — nhóm "chưa đo" hẹp hơn tôi ghi

§6.2 xếp 5 file Playwright + `payment-request-lifecycle` vào "chưa đo được, lưới fake-timer
không tới". **Câu đó đánh giá thấp phạm vi đã phủ.**

Lưới #1 (ESLint) chặn theo **HÌNH DẠNG LỜI GỌI**, không cần chạy — nên nó phủ luôn `.spec.ts`
của Playwright, không vướng fake-timer. Phạm vi rule đã khai đúng thế từ đầu:
`['tests/**/*.ts', '**/*.test.ts', '**/*.spec.ts']`.

**Khoảng hở thật hẹp hơn nhiều:** chỉ là hàm nhạy-thời-gian **chưa có trong**
`HAM_NHAY_THOI_GIAN`.

### Đo khoảng hở đó

6 file kia import gì (đọc thật, không đoán):

| File | Module sản phẩm nó gọi |
|---|---|
| `payment-request-lifecycle` | `lib/auth/actor` · `rbac-service` · `db` · `db-scope` |
| `reserve-request` | `lib/auth/actor` · `rbac-service` · `db` · `settings/service` · `students/lifecycle` |
| `commission-config` | `lib/auth/actor` · `rbac-service` · `db` |
| `bulk-convert` | `lib/crm/convert-lead-v2` |
| `class-snapshot` | `lib/classes/adjust` · `lib/classes/snapshot` |
| `messenger-models` | `lib/auth/actor` · `rbac-service` · `db` · `db-scope` |

Soát 8 module đó bằng 8 tác nhân độc lập, rồi **phản biện từng ứng viên bằng 2 góc soi**
("có phải chỉ đóng dấu `createdAt`?" và "có thật đối chiếu với ngày CALLER truyền, hay với
giá trị đọc từ DB?"), mặc định bác bỏ khi không chắc.

**Kết quả: 1 hàm sống sót, 0 bị bác.**

`buildActor` (`lib/auth/actor.ts:217`) — cổng lọc vai còn hiệu lực:

```ts
const now = input.now ?? new Date();
const liveRows = input.rows.filter((r) =>
  r.status === "ACTIVE" && r.role.isActive &&
  r.effectiveFrom <= now && (r.effectiveTo == null || r.effectiveTo >= now));
```

`effectiveFrom` / `effectiveTo` nằm trên `input.rows` — **ngày do caller truyền**. Đạt cả hai
vế của tiêu chí.

## 7.2 Nhưng KHÔNG thêm `buildActor` vào rule — lý do bằng số

Đo trước khi thêm, đúng như chủ dự án dặn. Thêm tạm rồi chạy lint:

| | |
|---|---|
| Vi phạm sinh ra | **14** |
| Trong đó là bom thật | **0** |

Ba file `lib/**` (12/14 vi phạm) dựng hàng vai như nhau:

```ts
effectiveFrom: new Date("2000-01-01"),
effectiveTo: null,
```

`effectiveFrom = 2000-01-01` luôn ≤ mọi `now`; `effectiveTo = null` luôn thoả nhánh
`== null`. **Cổng không bao giờ đổi câu trả lời** — an toàn vĩnh viễn. Hai file `tests/e2e/r7/*`
còn lại không truyền ngày hiệu lực nào.

### Điều kiện thứ ba mà tiêu chí cũ thiếu

"Có cổng đối chiếu" là điều kiện **cần**, chưa **đủ**. Còn cần:

> **Ngày rủi ro phải NHÌN THẤY ĐƯỢC ngay tại lời gọi.**

- `submitAttendanceRequest({ fromDate: d11, … })` — ngày nằm **ngay đó**. Rule tĩnh đọc được
  hình dạng, và thiếu `now` là dấu hiệu thật.
- `buildActor({ rows, … })` — ngày nằm **trong `rows`**, dựng ở chỗ khác. Rule nhìn tại lời
  gọi **không có thông tin** để phân biệt an toàn với nguy hiểm ⇒ mọi lời gọi đều bị bắt,
  14/14 là dương tính giả.

Và hình dạng ngày cũng không tự tố cáo: đo toàn repo có **11 chỗ** `effectiveTo` mang ngày
cứng, nhưng ngày **quá khứ** ở đó dùng để kiểm *"đã hết hiệu lực"* (an toàn mãi mãi), còn
`effectiveFrom: 2099-01-01` dùng để kiểm *"chưa tới hiệu lực"* (an toàn tới 2099). Thứ phân
biệt là **kỳ vọng của ca**, không phải con số ngày — mà rule tĩnh không đọc được kỳ vọng.

### Phân công đúng giữa hai lưới

| Lưới | Bắt được gì | Vì sao |
|---|---|---|
| **#1 ESLint** | hình dạng **tự tố cáo** — ngày rủi ro nằm ngay tại lời gọi | tất định, chặn lúc viết, phủ cả Playwright |
| **#2 đẩy đồng hồ** | rủi ro **ẩn trong dữ liệu** — `rows`, fixture, seed | chạy thật nên đọc được kỳ vọng của ca |

`buildActor` thuộc ô thứ hai, và lưới #2 **đã phủ nó**: 564 ca (gồm `lib/**`) xanh ở +90 ngày.

⇒ Ghi `buildActor` vào docblock của rule như **hàm đã xét và cố ý loại**, kèm lý do, để lần
sau không phải soát lại từ đầu.

## 7.3 Lưới #2 — ĐÃ LÀM

| Tệp | Vai trò |
|---|---|
| `tests/_helpers/setup-bom-hen-gio.ts` | đẩy đồng hồ `DAY_OFFSET` ngày; chỉ fake `Date`, `shouldAdvanceTime` để không treo `setTimeout` |
| `vitest.bom.config.ts` | nối setup trên vào cấu hình gốc + bật `ALLOW_DB_RESET` (bom nằm nhiều nhất ở bộ chạm DB — chính `tests/cham-cong` đã nổ) |
| `scripts/bao-bom-hen-gio.mjs` | đọc JSON reporter → mở / **cập nhật** issue |
| `.github/workflows/bom-hen-gio.yml` | Chủ nhật 02:00 VN (19:00Z thứ Bảy), ma trận `+90` và `+400` ngày |

### Không bám vào PR nào

Chỉ `schedule` + `workflow_dispatch` — **không** `push`, **không** `pull_request`. Không có
đường nào để nó xuất hiện trong danh sách check của một PR. Tên job: `Bom hẹn giờ (+90 ngày)`.

### Issue nói được BOM NÀO

Điều kiện chủ dự án đặt ra, và nó quyết định thiết kế `bao-bom-hen-gio.mjs`: script đọc
**chính file test** của ca đỏ để trích ngày cứng, chứ không đoán từ tên ca. Thử bằng bom cấy
lại:

```
[THỬ] SẼ MỞ issue mới
  tiêu đề : [bom] tests/cham-cong/requests.spec.ts > requests — DB thật > LEAVE 2 ngày duyệt …
  file    : tests/cham-cong/requests.spec.ts
  ca      : requests — DB thật > LEAVE 2 ngày duyệt ⇒ ghi P cả 2 ngày (nguồn LEAVE); …
  ngày cứng: 2026-08-20 · 2026-09-01 · … · 2026-09-11 · 2026-09-12 · …
```

`2026-09-11` — đúng ngày bom thật — nằm trong danh sách.

### Không mở issue thứ hai cho cùng một ca

Khoá trùng là `<file> > <tên ca>`, nhúng vào tiêu đề. Trước khi tạo, tra issue **đang mở**
cùng nhãn; trùng khoá thì **comment vào cái cũ**. Tuần nào cũng một issue mới là cách nhanh
nhất để người ta thôi đọc nhãn đó.

Nhãn `bom-hen-gio` đã tạo trên repo (màu #B60205).

### Chế độ `--thu`

In ra thứ **sẽ** mở, không gọi `gh`. Có để kiểm được chính script mà không rải issue thật —
và đó là cách duy nhất thử đường trích dữ liệu trước khi tin nó.

### Giới hạn đã biết, ghi ngay trong file

Chỉ phủ bộ Vitest. Playwright chạy tiến trình riêng nên `vi.useFakeTimers` không tới — nhưng
khoảng hở đó **không bỏ ngỏ**, lưới #1 phủ bằng hình dạng lời gọi (xem §7.1).
