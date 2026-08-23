# KHU VỰC F — Kho media & quy trình duyệt ảnh/video

**Nguồn spec (đã chốt):** `docs/specs/spec-dashboard-qlcs-duyet-media-lead.md` — KHU VỰC F (F-01…F-32)
**Nền schema đã khảo:** `docs/prd/A-nen-tang.md` §10.2 (SL-02 … SL-07) + §10.5 (thứ tự khoá)
**Phạm vi file này:** backlog WWA cho F + pre-mortem cho F. Không mở sang B/C/D/E/G.

> Mọi khẳng định hiện trạng dưới đây đều đọc lại trực tiếp từ mã nguồn trên nhánh `hptkk29/runhop20_08` và kèm `file:dòng`.

---

## 0. Hiện trạng đã xác minh — bốn điểm chi phối toàn bộ backlog

### 0.1 Vòng đời media hiện tại là HAI đường song song, không phải một chuỗi

| Đường | Điểm vào | Trạng thái sinh ra | Bằng chứng |
|---|---|---|---|
| (A) "Đăng ngay 1 ảnh" | `uploadClassMedia` | `autoApprove ? APPROVED : PENDING` | `app/(admin)/admin/media/actions.ts:233` (khai hàm), `:337` (`const autoApprove = await checkPermission("media:approve")`), `:345` (`status: autoApprove ? "APPROVED" : "PENDING"`) |
| (B) "Kho" | `createDraftMediaBatch` → `publishClassMedia` | `DRAFT` → `PENDING`/`APPROVED` | `lib/lms/media-publish.ts:43`, `:131`, `:218` (`const status = input.autoApprove ? "APPROVED" : "PENDING"`) |

🔴 **Người có quyền duyệt mà tự upload thì ảnh APPROVED ngay, không qua bước duyệt nào** (`actions.ts:337, :345, :351-353`). Cả trang duyệt F.2 lẫn báo cáo SLA F.4 phải hiểu điều này, nếu không SLA sẽ luôn xanh cho những lớp mà QLCS tự up ảnh.

Trần lô (đọc đúng giá trị, không phải số dòng):

```
lib/lms/media-publish.ts:18   export const DRAFT_BATCH_MAX = 40;     // tối đa 40 ảnh / 1 lô vào kho
lib/lms/media-publish.ts:20   export const PUBLISH_BATCH_MAX = 60;   // tối đa 60 ảnh / 1 lượt gửi hoặc xoá kho
```

Guard đua đã có: `updateMany(where status DRAFT)` rồi so `upd.count !== mediaIds.length` → `throw new Error("DRAFT_RACE")` (`media-publish.ts:244`), bắt lại ở `:272`.

### 0.2 Duyệt là MỘT ẢNH MỘT LƯỢT, và mốc `approvedAt` bẩn

- `reviewMedia` chỉ nhận `{ id, decision: "APPROVED" | "REJECTED" }` (`actions.ts:385, :387`). **Không có API duyệt hàng loạt.**
- `approvedById` / `approvedByName` / `approvedAt` được ghi cho **CẢ** `REJECTED` (`actions.ts:410-414`) ⇒ dùng `approvedAt` để tính "thời điểm duyệt" cho F-32 sẽ lẫn cả ảnh bị từ chối.
- UI: mỗi lần bấm = 1 server action + 1 `router.refresh()` (`app/(admin)/admin/media/_components/media-client.tsx:774-806`). Duyệt 40 ảnh = 40 vòng full refresh.

### 0.3 Xoá KHÔNG bao giờ đụng R2 — object sống vĩnh viễn trên CDN công khai

| Đường xoá | Có gọi `DeleteObjectCommand`? | Bằng chứng |
|---|---|---|
| `deleteMedia` (ảnh đã vào luồng duyệt) | ❌ chỉ `delete` row DB | `actions.ts:430` (khai hàm), `:440` (`await sdb.classSessionMedia.delete(...)`) |
| `deleteDraftMedia` (ảnh trong kho) | ❌ chỉ `deleteMany` row DB | `lib/lms/media-publish.ts:288`, `:308`; chú thích tự khai ở `:12` và `:286` |
| `/api/admin/upload-delete` | ✅ có gọi R2 (`route.ts:64`) | **nhưng call-site duy nhất là `components/admin/ImageUploader.tsx:152`** — không luồng media lớp nào gọi |

Không cron nào dọn object mồ côi: `vercel.json` có **23** cron (`grep -c '"path"' vercel.json` = 23), không job nào chạm storage.

⚠️ `/api/admin/upload-delete/route.ts:21-24` gác quyền bằng `allowedRoles.includes(session.user.role)` — kiểm quyền inline theo chuỗi role, trái luật cứng Nền Hệ thống #1 (`eslint.config.mjs:62, :93`). Đừng dùng lại mẫu này cho F.

### 0.4 🔴 Bucket R2 là bucket CÔNG KHAI — signed URL không cứu được

- `.env.example:91-92`: *"Bucket này CÔNG KHAI: nó gắn custom domain R2_PUBLIC_URL (cdn.satarobo.vn), nên MỌI object trong đó tải được vô danh qua https://cdn.satarobo.vn/&lt;key&gt;."*
- `ClassSessionMedia.fileUrl` là URL công khai đó (`lib/storage/r2-client.ts:91` `getPublicUrl`).
- Cờ `MEDIA_SIGNED_URL` mặc định OFF (`lib/flags.ts:80-81`).

  **ĐÍNH CHÍNH so với ghi chép lưu hành nội bộ:** cờ này **CÓ** call-site sản phẩm — `app/(admin)/admin/media/page.tsx:73`, `app/(portal)/portal/hinh-anh/page.tsx:89`, `app/(teacher)/teacher/anh-lop/page.tsx:189`, `lib/portal/photos.ts:44`, `app/(portal)/portal/bai-giang/page.tsx:14`. Nói "không có consumer" là sai.
  Nhưng bật cờ **cũng không đóng được lỗ**: `signedMediaUrl` ký GET trên **chính bucket công khai** (`lib/storage/signed-url.ts:38` → `getR2Bucket()`), mà signed URL chứa nguyên object key ⇒ ghép `https://cdn.satarobo.vn/<key>` là tải được bản vĩnh viễn, không hạn giờ.
- Cách vá đã được ký duyệt và đã hiện thực **cho module chat**: **tách bucket riêng**, fail-closed. `lib/storage/chat-storage.ts:48-66` — thiếu `R2_CHAT_BUCKET_NAME` hoặc trỏ trùng `R2_BUCKET_NAME` thì `throw ChatStorageConfigError` chứ không âm thầm rơi về bucket công khai. Lý do đầy đủ ghi ở `.env.example:104-107`.
- Object key sinh từ **tên file người dùng**: `app/api/admin/upload-url/route.ts:109-119` (`safeName` = slug hoá tên file gốc, cắt 50 ký tự) → key `uploads/images/2026-08/<tên-file>-<8 ký tự uuid>.jpg`. Ảnh chụp bằng điện thoại đặt tên `be-an-lop-3a.jpg` là lộ tên trẻ trên URL vĩnh viễn.
- Hàm dựng key chuẩn, không nhúng tên học sinh, **là mã chết**: `lib/lms/media-key.ts:8` `buildMediaObjectKey` — call-site duy nhất là `lib/lms/lms-logic.test.ts:51`.

### 0.5 Những gì CHƯA CÓ (không phải "sắp có")

| Thứ | Trạng thái | Bằng chứng |
|---|---|---|
| `ClassSessionMedia.centerId` / `.orgUnitId` | **CHƯA CÓ** | `prisma/schema.prisma:4501-4527` — không có cột nào |
| `ClassSessionMedia` trong `SCOPED_MODELS` | **CHƯA CÓ** (không xuất hiện ở `lib/db-scope.ts` dù ở `SCOPED_MODELS` hay `SCOPE_EXEMPT`) | grep `classSessionMedia` trong `lib/db-scope.ts` = 0 hit |
| Phân biệt ảnh/video (`kind`, `mimeType`, `durationSec`) | **CHƯA CÓ** | `prisma/schema.prisma:4501-4527` |
| `MediaStatus.DELETED` | **CHƯA CÓ** — enum có `PENDING/APPROVED/REJECTED/DRAFT` | `prisma/schema.prisma:4492-4499`; chú thích `:4497` quy ước giá trị mới đặt CUỐI |
| Bảng tiến độ xem video | **CHƯA CÓ** | không model nào |
| Bảng sổ duyệt theo ngày | **CHƯA CÓ** | không model nào |
| Liên kết media ↔ học bạ | **CHƯA CÓ** ở mọi tầng | `ReportCard` (`prisma/schema.prisma:6268-6295`) không có field media |
| Nén / transcode video | **CHƯA CÓ** | không `ffmpeg`; `sharp` chỉ xuất hiện ở `package.json:162` trong `pnpm.onlyBuiltDependencies`, không phải dependency của repo |
| Upload video ở luồng ảnh lớp | **CHƯA CÓ** — lọc cứng ảnh | `app/(teacher)/teacher/anh-lop/_components/upload-photo-dialog.tsx:159-161`; `app/(admin)/admin/media/_components/media-client.tsx:279-281`; cả hai hard-code `category: "image"` (`upload-photo-dialog.tsx:54`, `media-client.tsx:30`) |
| Cron media | **CHƯA CÓ** — thông báo chỉ sinh khi người dùng TỰ mở chuông | `app/api/notifications/route.ts:53-68` gọi `syncStaffNotifications` qua `after()` sau khi response đã đi |
| Mốc "học bạ đã XUẤT" | **CHƯA CÓ** — 4 route xuất PDF không ghi gì | `app/(teacher)/teacher/hoc-ba/pdf/[enrollmentId]/route.ts`, `app/api/admin/reports/transcript/route.ts`, `app/api/portal/report-card/[id]/route.ts`, `app/api/portal/transcript/route.ts` — không route nào gọi `writeAudit` hay tạo `ProgressReportLog` |

Hai thứ **có** và F phải dùng lại, không viết lại:
- `ReportCard.publishedAt` / `publishedById` / `publishedSnapshot` (`prisma/schema.prisma:6277-6280`) — **phát hành** (khác **xuất PDF**).
- `ClassSession.centerId` đã có và `ClassSession` ĐÃ ở trong `SCOPED_MODELS` (`prisma/schema.prisma:1944`; `lib/db-scope.ts:11`) ⇒ cây folder theo ngày lọc được cơ sở qua `ClassSession`, kể cả trước khi SL-02 xong.

### 0.6 Trang duyệt hiện tại — vì sao không nới được, phải làm lại

`app/(admin)/admin/media/page.tsx:29-56`:
1. Nạp tối đa **200 lớp** trong tầm nhìn actor (`:33 take: 200`).
2. Hai truy vấn: **100** ảnh non-DRAFT + **100** ảnh DRAFT (`:45`, `:51`).
3. Phẳng, không phân trang, không gom theo lớp/buổi (`:56 const rows = [...mainRows, ...draftRows]`).

🔴 Ảnh `PENDING` cũ hơn 100 dòng gần nhất **không bao giờ hiện ra trên trang duyệt** — và với F-16 ("lớp chỉ hoàn tất khi MỌI media đã xử lý") thì ảnh vô hình = lớp không bao giờ đóng được.

Việc tồn (chuông) cũng bị trần: `lib/pending-tasks.ts:202-233` — `take: 50` (`:217`), đọc bằng `db` **trần** chứ không `scopedDb` (`lib/pending-tasks.ts:1` import `db`), và lọc cơ sở **chỉ khi** actor là `CENTER_MANAGER` thuần: `const centerScope = isCM && !isSuper ? (user.centerId ?? null) : null` (`:114`). Vai khác giữ `media:approve` đếm ảnh PENDING của **mọi cơ sở**.

### 0.7 F-04 hiện CHƯA được áp

`lib/portal/photos.ts` lọc: consent `GRANTED` (`:18`), enrollment ACTIVE (`:21-24`), `status: "APPROVED"` (`:32`), và `tags.some(studentId)` HOẶC `isClassWide` (`:33-36`).
🔴 **Không có điều kiện nào theo `classSessionId`** — trường này chỉ dùng để gom nhóm hiển thị (`:46-53`). Yêu cầu F-04 "phải đúng buổi học đó" **chưa tồn tại trong mã**.

### 0.8 Retention hiện tại không xoá gì

`lib/compliance/retention.ts` dài **51 dòng**, không có lệnh xoá nào: `runRetentionScan` (`:43-51`) chỉ đếm và `console.warn` (`:48`), con số **không lưu ở đâu**. `RETENTION_DAYS` mặc định **5 năm** (`:11`) và chỉ áp cho bảng `Student` (`:25-31`). Cron `/api/cron/retention-scan` chạy `0 7 * * 1` (`vercel.json`). **Không có chính sách nào cho `ClassSessionMedia`.**

---

## PHẦN 1 — BACKLOG (WWA)

Ký hiệu: **[SPIKE]** = phải điều tra kỹ thuật trước, chưa ước lượng được cho tới khi spike xong.
`Effort` chỉ có nghĩa **sau** khi spike đóng.

---

### 🔴 Nhóm 0 — Hạ tầng chặn đường (không xong thì mọi story F sau đều phải làm lại)

#### Story 1: Tách bucket R2 riêng cho ảnh/video học viên **[SPIKE]**

**Why**: Hôm nay ảnh trẻ em nằm trong bucket có custom domain `cdn.satarobo.vn`, tải được **vô danh** (`.env.example:91-92`) — kể cả ảnh **chưa duyệt** vừa upload xong. Toàn bộ khu vực F đang xây thêm màn duyệt, thêm video, thêm retention **lên trên** một kho phát công khai; mỗi story F ship ra là thêm dữ liệu vào một lỗ đã biết. Repo đã ký và đã hiện thực đúng cách vá này cho module chat (`lib/storage/chat-storage.ts:48-66`) — F chỉ cần nhân bản, không phải phát minh.

**What**: `lib/storage/class-media-storage.ts` theo mẫu `chat-storage.ts`: env `R2_CLASS_MEDIA_BUCKET_NAME`, fail-closed khi trống hoặc trùng `R2_BUCKET_NAME`; endpoint presign upload + presign GET riêng cho media lớp; `fileUrl` chuyển từ URL công khai sang **object key**; `resolveMediaUrl` đọc key → ký GET trên bucket riêng. Kèm kế hoạch di trú object cũ (copy sang bucket mới + đổi `fileUrl` + xoá bản cũ).

**Spike phải trả lời trước khi ước lượng**: (a) số object và tổng dung lượng `uploads/images/` hiện thuộc `ClassSessionMedia`; (b) copy cross-bucket trong R2 làm bằng `CopyObject` server-side hay phải tải về — ảnh hưởng thời gian chạy; (c) `fileUrl` đang là URL tuyệt đối ở **mọi** call-site đọc (`lib/portal/photos.ts:39`, `app/(teacher)/teacher/anh-lop/page.tsx:189`, `app/(admin)/admin/media/page.tsx:73`) — đổi sang key thì `keyFromPublicUrl` (`lib/storage/signed-url.ts:15-31`) xử lý được cả hai dạng chưa; (d) TTL bao nhiêu để phụ huynh mở album 200 ảnh không bị hết hạn giữa chừng.

**Acceptance**:
- [ ] `getClassMediaBucket()` **throw** khi `R2_CLASS_MEDIA_BUCKET_NAME` trống, và **throw** khi giá trị trùng `R2_BUCKET_NAME`; có unit test cho cả hai nhánh (mẫu: `lib/storage/chat-storage.ts:48-66`).
- [ ] Ghép `https://cdn.satarobo.vn/<key>` của một media lớp bất kỳ trả **404/403**, không trả file — kiểm bằng curl không kèm cookie.
- [ ] Media `PENDING` (chưa duyệt) không có bất kỳ URL nào tải được khi không đăng nhập.
- [ ] Signed URL hết hạn → tải lại trả 403; test tự động ghim TTL.
- [ ] **Biên/lỗi**: chưa cấu hình env → luồng upload media lớp trả 503 `STORAGE_NOT_CONFIGURED` và **không** rơi về bucket công khai; luồng ảnh/tài liệu khác (honors, news, SCORM) vẫn chạy bình thường.
- [ ] Script di trú chạy dry-run in ra: số object sẽ copy, số `fileUrl` sẽ đổi, số object không tìm thấy — chưa ghi gì.

Priority: **P0** | Effort: **L** (chốt sau spike) | Dependencies: none

---

#### Story 2: SL-02 — cột phạm vi cơ sở cho `ClassSessionMedia` + `MediaStudentTag`

**Why**: `ClassSessionMedia` không có `centerId`, không có `orgUnitId`, và **không nằm trong `SCOPED_MODELS` lẫn `SCOPE_EXEMPT`** (`prisma/schema.prisma:4501-4527`; grep `lib/db-scope.ts` = 0 hit). Cách ly cơ sở đang làm **tay** ở từng call-site qua tập `classId` đã scope (`app/(admin)/admin/media/page.tsx:37`, `actions.ts:27-40`). Khu vực F đẻ thêm ít nhất 4 màn mới và 2 bảng mới trỏ về bảng này; mỗi màn mới là một lần phải nhớ lọc tay, và quên một lần là QLCS cơ sở này duyệt ảnh trẻ của cơ sở kia.

**What**: thêm `centerId String?` + `orgUnitId String?` (ghi kép, luật cứng #3 cho bảng cũ) cho `ClassSessionMedia` và `MediaStudentTag`; khai vào `SCOPED_MODELS` (`lib/db-scope.ts:11`) **và** `BACKFILL_SPECS` (`lib/org/center-bridge.ts`); index `[centerId, status]` + `[centerId, createdAt]`; migration backfill từ `Class.centerId`; vá mọi đường `create` để set `centerId` (⚠️ `scopedDb` **không** che write — `lib/db-scope.ts:2, :291`).

**Acceptance**:
- [ ] `pnpm typecheck` xanh và test `[US-07-IT-08b]` (kiểm tra model mới khai đủ ở `BACKFILL_SPECS`) xanh.
- [ ] e2e: actor CS1 gọi `sdb.classSessionMedia.findMany()` **không** truyền `where` trả **0 dòng** thuộc CS2.
- [ ] Backfill: sau migration, `SELECT count(*) FROM "ClassSessionMedia" WHERE "centerId" IS NULL` = 0 trên DB test; báo cáo dry-run in ra số dòng sẽ vá trước khi chạy prod.
- [ ] Mọi đường tạo media (`actions.ts:341` create đơn, `lib/lms/media-publish.ts` create lô) set `centerId` + `orgUnitId`; có test bắt lỗi nếu tạo mà thiếu.
- [ ] **Biên/lỗi**: media có `classId` trỏ tới lớp **đã xoá** (cột phẳng, không FK — `prisma/schema.prisma:4503`) → backfill để `centerId = NULL` và **không** crash; dòng như vậy được liệt kê ra file để người vận hành quyết, không tự đoán.
- [ ] Sau khi vào `SCOPED_MODELS`: chạy lại toàn bộ e2e media hiện có, không có test nào chuyển sang trả rỗng ngoài dự kiến (bẫy: dòng `centerId = NULL` sẽ **biến mất** khỏi mọi truy vấn của actor cấp cơ sở).

Priority: **P0** | Effort: **M** | Dependencies: SL-00 (quy ước `centerId`+`orgUnitId` cho bảng mới, PRD A §10)

---

#### Story 3: SL-04 — phân loại IMAGE/VIDEO + metadata kỹ thuật

**Why**: F-17/F-18/F-19 (video duyệt chung luồng, bắt buộc xem hết, badge tiến độ) **bất khả thi** khi không phân biệt được ảnh với video. Hôm nay không field nào phân biệt (`prisma/schema.prisma:4501-4527`) và cả hai dialog upload lọc cứng `f.type.startsWith("image/")` (`upload-photo-dialog.tsx:159-161`, `media-client.tsx:279-281`). F-02 (nén H.264/720p) cũng không có chỗ lưu trạng thái xử lý.

**What**: enum mới `MediaKind { IMAGE, VIDEO }` + cột `kind MediaKind @default(IMAGE)`, `mimeType String?`, `sizeBytes Int?`, `durationSec Int?`, `width Int?`, `height Int?`, `transcodeStatus` (enum `NONE/PENDING/DONE/FAILED`), `transcodeError String?`. Backfill: mọi dòng cũ = `IMAGE` (đúng, vì luồng chỉ nhận ảnh).

**Acceptance**:
- [ ] Migration additive; dòng cũ có `kind = IMAGE`, `transcodeStatus = NONE`.
- [ ] `kind` được suy từ `mimeType` ở **server** lúc tạo record, không tin giá trị client gửi lên; test gửi `kind: "IMAGE"` kèm `mimeType: "video/mp4"` → server ghi `VIDEO`.
- [ ] Grid hiện tại (`media-client.tsx`) render dòng `kind = VIDEO` không vỡ layout (kể cả khi chưa có story 11).
- [ ] **Biên/lỗi**: `mimeType` null hoặc lạ (file cũ, upload qua đường khác) → `kind = IMAGE`, `transcodeStatus = NONE`, không throw; ghi cảnh báo có `mediaId` để rà sau.

Priority: **P0** | Effort: **S** | Dependencies: Story 2

---

#### Story 4: SL-03 — trạng thái `DELETED`, xoá R2 thật, và thùng rác có thời gian ân hạn

**Why**: F-03 và F-15 nói "từ chối → xoá khỏi R2". Hôm nay **không đường xoá nào của luồng media chạm R2** (`actions.ts:440`, `lib/lms/media-publish.ts:308`; chú thích tự khai ở `:12` và `:286`), nên "xoá" hiện tại là rò rỉ có tổ chức: row biến mất khỏi DB, file vẫn tải được vĩnh viễn trên `cdn.satarobo.vn`. Ngược lại, một khi nối R2 thật thì **mất là vĩnh viễn** — ảnh buổi học đã qua không chụp lại được, và F-15 đặt nút "X lớn" ngay trong luồng vuốt nhanh. Xoá cứng tức thì trong một UI thiết kế để bấm nhanh là công thức mất dữ liệu.

**What**: (a) thêm `DELETED` vào enum `MediaStatus` **đặt CUỐI** (quy ước tự khai tại `prisma/schema.prisma:4497`); (b) thêm `deletedAt`, `deletedById`, `deleteReason`, `purgeAfterAt`; (c) `deleteMedia`/từ chối chuyển sang **soft**: `status = DELETED` + đặt `purgeAfterAt = now + N ngày` (N là setting, xem story 15); (d) cron `/api/cron/media-purge` xoá `DeleteObjectCommand` **rồi** mới xoá/đóng dấu row, ghi `writeAudit`; (e) màn "Thùng rác" cho phép khôi phục trước hạn.

**Acceptance**:
- [ ] Bấm từ chối/xoá → media chuyển `DELETED`, **biến mất khỏi portal PH và khỏi trang duyệt ngay lập tức**, nhưng object R2 **vẫn còn**.
- [ ] Trong hạn ân hạn, người có `media:approve` khôi phục được về trạng thái trước đó; audit ghi cả hai lượt.
- [ ] Cron purge: xoá object R2 **thành công trước**, sau đó mới đóng dấu row đã purge. Nếu `DeleteObjectCommand` lỗi → row **giữ nguyên** ở `DELETED`, `purgeAfterAt` lùi lại, ghi log có `mediaId` + `key`; lần chạy sau thử lại.
- [ ] **Biên/lỗi (thứ tự ngược)**: test giả lập R2 trả lỗi 500 → không có row nào bị mất mà object còn sống, và không có object nào bị xoá mà row còn trỏ tới. Kiểm bằng đếm trước/sau.
- [ ] **Biên/lỗi (mồ côi)**: object có trong R2 nhưng không row nào trỏ tới → job liệt kê ra báo cáo, **không tự xoá**.
- [ ] Enum `DELETED` nằm cuối; migration là `ALTER TYPE ... ADD VALUE`, không drop giá trị nào.
- [ ] Không có đường nào trong F gọi `/api/admin/upload-delete` (route đó gác quyền bằng chuỗi role — `route.ts:21-24`, trái luật cứng #1).

Priority: **P0** | Effort: **L** | Dependencies: Story 2, Story 1 (xoá phải xoá đúng bucket)

---

#### Story 5: F-02 — nén video về H.264 / 720p **[SPIKE]**

**Why**: Spec F-02 đòi chuẩn hoá trước khi lưu R2. Repo **không có** `ffmpeg`, không có pipeline media nào (`sharp` chỉ nằm ở `package.json:162` trong `pnpm.onlyBuiltDependencies`, không phải dependency dùng được). Video 500MB được `upload-config.ts:53-63` cho phép về nguyên tắc, mà Vercel function có trần thời gian — nơi cao nhất repo đang dùng là `maxDuration = 300` (`app/api/admin/import/leads/registered/route.ts:46`). Chọn sai chỗ chạy thì hoặc job chết giữa chừng, hoặc phải thêm hạ tầng ngoài Vercel — cả hai đều đổi hình dạng của story 9, 11, 13.

**Spike phải trả lời**: (1) nén ở **client** trước khi upload (WebCodecs / `ffmpeg.wasm`) hay ở **server**? (2) nếu server: Vercel function (trần thời gian? có Fluid compute không?), hay Cloudflare Stream, hay job ngoài? (3) chi phí/tháng ở mức 2 cơ sở × ~10 lớp × video 1-2 phút/buổi. (4) Nếu **không** nén được trong đợt này thì đường lùi là gì — giới hạn dung lượng + thời lượng lúc upload có chấp nhận được không (và ai ký)?

**What (sau spike)**: pipeline nén + `transcodeStatus` chuyển `PENDING → DONE/FAILED`; media `transcodeStatus = PENDING` **không** vào hàng duyệt.

**Acceptance**:
- [ ] Tài liệu spike ≤ 2 trang, có số đo thật (thời gian nén 1 video 60s/1080p ở phương án được chọn), chi phí ước tính, và **một** khuyến nghị.
- [ ] Video sau xử lý: codec H.264, chiều cao ≤ 720px, kiểm bằng `ffprobe` trong test.
- [ ] Media `transcodeStatus = PENDING` không xuất hiện trên trang duyệt và không tính vào mẫu số "n/m video" của F-19.
- [ ] **Biên/lỗi**: nén thất bại → `transcodeStatus = FAILED` + `transcodeError`, GV thấy trạng thái rõ ràng và **không** bị coi là "chưa duyệt" trong SLA; QLCS không bị chặn nút "Duyệt tất cả" bởi một video hỏng.
- [ ] **Biên/lỗi**: file khai `video/mp4` nhưng nội dung không phải video → từ chối ở server, không tạo record.

Priority: **P1** | Effort: **[SPIKE] chưa ước lượng** | Dependencies: Story 3

---

#### Story 6: SL-05 — bảng `MediaWatchProgress` (tiến độ xem video theo người)

**Why**: F-18 chặn nút "Duyệt tất cả" cho tới khi **mọi video trong folder đã được phát hết** (`watchedDuration ≥ 95% duration`), và tua nhanh không tính. Đây là ràng buộc theo **cặp (người duyệt × media)** — không tồn tại gì tương đương trong repo. Không có bảng này thì F-13 (nút Duyệt tất cả) không có cách nào bật/tắt đúng, và toàn bộ luận điểm "QLCS đã thực sự xem" trở thành lời hứa suông trong biên bản.

**What**: model mới `MediaWatchProgress(id, mediaId, userId, watchedSeconds Int, durationSec Int?, completedAt DateTime?, centerId String?, orgUnitId String?)`, `@@unique([mediaId, userId])`, index `[userId, completedAt]`. Ngưỡng 95% là **hằng số tầng mã**, không nhét vào schema. Server action `recordWatchProgress` cộng dồn theo **khoảng đã phát thật**, không nhận `watchedSeconds` tuyệt đối từ client.

**Acceptance**:
- [ ] Unique `[mediaId, userId]`; gọi `recordWatchProgress` hai lần cùng cặp không sinh dòng thứ hai.
- [ ] Xem tuần tự hết video → `completedAt` được set; xem 90% → chưa set.
- [ ] **Chống tua**: kịch bản "nhảy từ giây 0 sang giây cuối rồi phát 2 giây" → `watchedSeconds` tăng đúng 2, `completedAt` vẫn null. Test tự động bằng chuỗi sự kiện, không bằng thao tác tay.
- [ ] **Chống giả mạo**: client POST thẳng `watchedSeconds = 9999` → server kẹp về `min(durationSec, tổng khoảng hợp lệ)`, không set `completedAt`.
- [ ] Bảng mang **cả hai** cột `centerId` + `orgUnitId` và khai vào `SCOPED_MODELS` + `BACKFILL_SPECS` (SL-00).
- [ ] **Biên/lỗi**: media không có `durationSec` (chưa nén xong / metadata lỗi) → không bao giờ tự đánh dấu `completedAt`, và F-13 hiển thị lý do cụ thể chứ không chỉ disable nút câm.

Priority: **P0** | Effort: **M** | Dependencies: Story 3

---

#### Story 7: SL-06 — bảng `ClassMediaReviewDay` (sổ duyệt theo ngày)

**Why**: Bốn yêu cầu của spec hiện **không có chỗ lưu**: ghi chú giải trình "hôm nay không có ảnh" (F-14), mốc "đã duyệt hết folder" (F-13), hạn duyệt (F-20), và bốn trạng thái của báo cáo SLA (F-30..F-32). Repo hiện chỉ có `ClassSession.ckMedia` (`prisma/schema.prisma:1967`) — một ô tích **TAY** trong checklist chuẩn bị buổi, không suy từ trạng thái duyệt và không mang ngày/hạn/ghi chú. Không có bảng này thì **không dựng nổi bảng SLA**, và mọi báo cáo F.4 sẽ phải đếm lại `ClassSessionMedia` mỗi lần mở trang — vừa chậm vừa đổi số theo thời gian.

**What**: model mới `ClassMediaReviewDay(id, classId, reviewDate Date, status, noPhotoNote Text?, deadlineAt DateTime, reviewedById String?, reviewedByName String?, reviewedAt DateTime?, mediaCount Int, approvedCount Int, deletedCount Int, centerId String?, orgUnitId String?)`, `@@unique([classId, reviewDate])`, index `[centerId, reviewDate]`, `[status, deadlineAt]`. Trạng thái khớp F-31: `CHUA_DUYET | DA_DUYET | DUYET_TRE | KHONG_CO_ANH`.

**Acceptance**:
- [ ] Unique `[classId, reviewDate]`; hai lượt chốt song song cùng lớp/ngày → chỉ một dòng, lượt thua nhận lỗi rõ ràng (mẫu guard `DRAFT_RACE` — `lib/lms/media-publish.ts:244`).
- [ ] `deadlineAt` được **đóng băng** trên dòng lúc tạo, không tính lại từ setting mỗi lần đọc — đổi cấu hình deadline không được viết lại lịch sử SLA của những ngày đã qua.
- [ ] `reviewedAt` chỉ ghi cho hành động **duyệt trọn folder**, không ghi cho từ chối lẻ (khác `ClassSessionMedia.approvedAt` hiện đang bẩn — `actions.ts:410-414`).
- [ ] Bảng mang cả `centerId` + `orgUnitId`, khai vào `SCOPED_MODELS` + `BACKFILL_SPECS`.
- [ ] **Biên/lỗi**: lớp có buổi trong ngày nhưng **không** có media và **chưa** ai bấm "Hôm nay không có ảnh" → dòng ở `CHUA_DUYET`, **không** tự chuyển `KHONG_CO_ANH`. Hệ thống không được tự kết luận thay người.
- [ ] **Biên/lỗi**: GV upload thêm ảnh **sau khi** folder đã chốt `DA_DUYET` → dòng quay về `CHUA_DUYET` và ghi vết lần chốt trước, không im lặng nuốt ảnh mới.

Priority: **P0** | Effort: **M** | Dependencies: Story 2

---

#### Story 8: SL-07 — liên kết media ↔ học bạ + mốc "học bạ đã xuất"

**Why**: F-05 treo điều kiện xoá vào câu "**nếu học bạ đã xuất**". Câu này hôm nay **không trả lời được**: `ReportCard` không có field media nào (`prisma/schema.prisma:6268-6295`), và 4 route xuất PDF học bạ/bảng điểm **không ghi bất kỳ mốc nào** (`app/(teacher)/teacher/hoc-ba/pdf/[enrollmentId]/route.ts`, `app/api/admin/reports/transcript/route.ts`, `app/api/portal/report-card/[id]/route.ts`, `app/api/portal/transcript/route.ts` — không route nào gọi `writeAudit`/`ProgressReportLog`). Ship story 18 (retention) trước story này = job xoá chạy trên một điều kiện luôn trả `false` hoặc luôn trả `true`, và nó xoá ảnh trẻ em.

**What**: (a) chốt và ghi vào `documentation/` định nghĩa **"đã xuất"** — đề xuất: `ReportCard.publishedAt != null` (đã có sẵn, `:6277`) là **phát hành**, còn "xuất PDF" cần mốc mới; (b) ghi mốc xuất: 4 route trên gọi `writeAudit({ action: 'EXPORT' })` + tạo `ReportCardExportLog(reportCardId, exportedById, exportedAt, channel)`; (c) liên kết media: `ClassSessionMedia.reportCardId String?` **hoặc** bảng nối `ReportCardMedia`, + `retentionDueAt DateTime?`.

**Acceptance**:
- [ ] Mỗi lần tải PDF học bạ qua bất kỳ trong 4 route → sinh đúng 1 dòng log có `reportCardId`, người tải, thời điểm, kênh (teacher/admin/portal).
- [ ] Truy vấn "học bạ X đã được xuất chưa, lần cuối lúc nào" trả lời được bằng **một** câu SQL.
- [ ] Gắn/gỡ media vào học bạ ghi audit; media đã gắn hiện rõ trên màn học bạ.
- [ ] Định nghĩa "đã xuất" vs "đã phát hành" viết thành văn trong `documentation/`, và **mọi** chỗ trong F tham chiếu cùng một định nghĩa.
- [ ] **Biên/lỗi**: học bạ bị `RECALLED` (`prisma/schema.prisma:6265`) sau khi đã xuất → media **không** rơi vào diện đủ điều kiện xoá; có test riêng cho nhánh này.
- [ ] **Biên/lỗi**: media không thuộc học bạ nào (ảnh sinh hoạt, ảnh lớp chung) → có nhánh xử lý tường minh, không mặc định là "được xoá".

Priority: **P0** | Effort: **M** | Dependencies: Story 2

---

### Nhóm 1 — Kho & vòng đời (F.1)

#### Story 9: F-01 — GV đưa **ảnh và video** vào kho chưa lưu hành, gắn lớp + buổi + ngày

**Why**: Đường kho đã chạy thật và đúng hình dạng spec (`createDraftMediaBatch` → `DRAFT`, `lib/lms/media-publish.ts:43`), nhưng **chỉ nhận ảnh**: hai dialog lọc cứng `image/*` (`upload-photo-dialog.tsx:159-161`, `media-client.tsx:279-281`) và hard-code `category: "image"` (`upload-photo-dialog.tsx:54`, `media-client.tsx:30`). Không có story này thì F-17/F-18/F-19 không có dữ liệu để duyệt.

**What**: mở luồng kho cho video: `category: "video"` (`lib/storage/upload-config.ts:53-63` đã có, 500MB, MP4/WEBM/MOV/AVI), bộ lọc dialog nhận `image/*` **và** `video/*`, hiển thị thumbnail + thời lượng trong kho, ghi `kind`/`mimeType`/`sizeBytes`/`durationSec`. Giữ nguyên trần lô (`DRAFT_BATCH_MAX = 40`, `media-publish.ts:18`) nhưng thêm **trần dung lượng lô** cho video.

**Acceptance**:
- [ ] GV chọn 1 video + 3 ảnh trong một lượt → 4 dòng `DRAFT`, `kind` đúng từng dòng.
- [ ] Media gắn `classSessionId` phải thuộc đúng lớp (bất biến đã có — `media-publish.ts` kiểm buổi thuộc lớp); `takenAt` fallback ngày buổi.
- [ ] Người có `media:upload-draft` mà **không** có `media:upload` chỉ đưa được vào kho, không đăng thẳng (giữ nguyên hai cổng quyền hiện có — `actions.ts:101-108`).
- [ ] **Biên/lỗi**: chọn file `.exe` đổi đuôi thành `.mp4` → server từ chối theo `validateFile` (`app/api/admin/upload-url/route.ts:102-105`), không tạo record, thông báo tiếng Việt rõ ràng.
- [ ] **Biên/lỗi**: lô vượt trần dung lượng → báo trước khi upload byte đầu tiên, không để GV chờ 5 phút rồi mới báo lỗi.
- [ ] **Biên/lỗi**: mất mạng giữa lô → ảnh đã lên vẫn ở kho, ảnh chưa lên báo tên cụ thể (mẫu đã có ở `media-client.tsx:270`), không rollback cả lô.

Priority: **P0** | Effort: **M** | Dependencies: Story 1, Story 3

---

#### Story 10: F-04 — khoá sử dụng: chỉ media `APPROVED` **và đúng buổi học** mới tới phụ huynh

**Why**: F-04 có hai vế; vế "đúng buổi học" **hiện chưa tồn tại trong mã**. `lib/portal/photos.ts:29-41` lọc theo `classId` + `status: "APPROVED"` + (tag con **hoặc** `isClassWide`), và `classSessionId` chỉ dùng để gom nhóm hiển thị (`:46-53`). Hệ quả: ảnh gắn buổi 3 vẫn hiện trong album của một học viên chỉ tham gia buổi 5, miễn em đó cùng lớp. Đây là lỗi lộ hình ảnh chéo trong cùng lớp, không phải lỗi thẩm mỹ.

**What**: siết truy vấn đọc của phụ huynh: media có `classSessionId` chỉ hiện cho học viên **có mặt/ghi danh tại buổi đó**; media không gắn buổi giữ nguyên luật hiện tại (mức lớp). Áp cùng luật ở cả `lib/portal/photos.ts` và `app/(portal)/portal/hinh-anh/page.tsx`.

**Acceptance**:
- [ ] Học viên A ghi danh lớp X nhưng **không** có `Attendance` ở buổi S → không thấy media gắn `classSessionId = S`, kể cả `isClassWide = true`.
- [ ] Media không gắn buổi (`classSessionId = null`) vẫn hiện theo luật cũ — không hồi quy album hiện có.
- [ ] Consent vẫn là điều kiện đầu tiên: `hasMediaConsent` false → 0 ảnh (giữ `lib/portal/photos.ts:18-19`).
- [ ] **Biên/lỗi**: học viên chuyển lớp giữa khoá → thấy đúng media của những buổi mình có mặt ở **cả hai** lớp, không mất và không thừa.
- [ ] **Biên/lỗi**: buổi học bị `CANCELLED` (`prisma/schema.prisma:2008`) nhưng có media → có quyết định tường minh (đề xuất: vẫn hiện, vì ảnh đã chụp), viết vào `documentation/`.
- [ ] Test ma trận: 3 học viên × 3 buổi × 2 loại media (tag / class-wide), khớp bảng kỳ vọng viết trước.

Priority: **P0** | Effort: **M** | Dependencies: none (chạy được ngay trên schema hiện tại)

---

### Nhóm 2 — Trang duyệt QLCS (F.2)

#### Story 11: F-10 + F-11 — cây folder **ngày → lớp**, tự ẩn khi đã duyệt hết

**Why**: Trang duyệt hiện tại là một lưới **phẳng 200 dòng** không phân trang, không gom nhóm (`app/(admin)/admin/media/page.tsx:40-56`). Với F-16 ("lớp chỉ hoàn tất khi MỌI media đã xử lý"), ảnh `PENDING` cũ hơn 100 dòng gần nhất **không bao giờ hiện ra** ⇒ có lớp không bao giờ đóng được mà QLCS không hiểu tại sao. Cây folder không phải trang trí: nó là cơ chế **đảm bảo không sót**.

**What**: trang `/admin/media/duyet`: cấp 1 = ngày (chỉ ngày **có `ClassSession`** và **có media chưa xử lý**), cấp 2 = lớp trong ngày (tên lớp link sang chi tiết lớp, icon ⓘ hover hiện tên GV phụ trách). Ngày/lớp đã xử lý hết → ẩn. Đếm bằng truy vấn gom nhóm `(classId, reviewDate, status)`, **không** nạp toàn bộ dòng.

**Acceptance**:
- [ ] Ngày không có `ClassSession` nào → **không** có folder ngày, kể cả khi có media `takenAt` rơi vào ngày đó (media mồ côi đi vào một khu riêng, xem tiêu chí biên).
- [ ] Lớp đã xử lý hết (mọi media `APPROVED` hoặc `DELETED`) → ẩn khỏi cây; xuất hiện lại nếu GV upload thêm.
- [ ] Số đếm trên folder khớp số ô thực tế trong lưới (story 12) — test so hai con số.
- [ ] Cách ly cơ sở: QLCS CS1 không thấy folder nào của CS2, kể cả khi truyền `?date=` + `?classId=` của CS2 trên URL → 404/redirect, **không** 500 và không lộ tên lớp.
- [ ] Hiệu năng: 2 cơ sở × 30 ngày × 12 lớp/ngày, thời gian dựng cây < 1s; không truy vấn nào nạp quá 500 dòng media.
- [ ] **Biên/lỗi**: media có `classId` trỏ lớp đã xoá (cột phẳng không FK — `prisma/schema.prisma:4503`) → gom vào folder "Không thuộc lớp nào" hiện tường minh, **không** biến mất im lặng.
- [ ] **Biên/lỗi**: lớp chưa phân công GV → icon ⓘ hiện "Chưa phân công", không hiện rỗng.

Priority: **P0** | Effort: **L** | Dependencies: Story 2, Story 7

---

#### Story 12: F-12 + F-17 — lưới toàn bộ media của folder lớp, ảnh và video **chung một lưới**

**Why**: Spec chốt rõ (quyết định #6): video không tách màn riêng. Lưới hiện tại cao 112px, 2 cột, không lightbox (`media-client.tsx`), thiết kế cho việc liếc chứ không cho việc **xem để chịu trách nhiệm**. QLCS đang phải xác nhận "đã xem và duyệt toàn bộ ảnh" (F-13) trên một giao diện không cho xem được ảnh.

**What**: lưới của một folder (lớp × ngày): thumbnail ảnh + poster video có badge thời lượng, sắp theo buổi rồi theo giờ, hiện tên học viên được tag, trạng thái từng ô. Phân trang cuộn theo lô. Đây cũng là màn nền cho story 13 (badge tiến độ xem) và story 14 (nút chốt).

**Acceptance**:
- [ ] Lưới hiện **đủ** media của folder — kể cả khi > 200 ảnh; không có trần im lặng nào (đối lập trực tiếp với `page.tsx:45, :51 take: 100`).
- [ ] Ảnh và video nằm chung một dòng thời gian, không tách tab.
- [ ] Media `DRAFT` (kho GV chưa gửi) **không** xuất hiện — giữ bất biến hiện có (`actions.ts:405-407` chặn duyệt DRAFT).
- [ ] Mobile 375px: lưới không tràn ngang; thao tác chạm được.
- [ ] **Biên/lỗi**: folder rỗng → hiện trạng thái rỗng + nút "Hôm nay không có ảnh" (story 14), **không** hiện nút "Duyệt tất cả".
- [ ] **Biên/lỗi**: thumbnail lỗi tải (object đã bị xoá, signed URL hết hạn) → ô hiện placeholder + nút thử lại, không làm hỏng cả lưới.

Priority: **P0** | Effort: **M** | Dependencies: Story 11

---

#### Story 13: F-15 — chế độ xem từng media (vuốt / phím mũi tên) + từ chối

**Why**: Đây là nơi QLCS thực sự **nhìn** từng tấm ảnh trước khi nó tới phụ huynh — chốt kiểm soát duy nhất chống ảnh không phù hợp lọt ra ngoài. Đồng thời là nơi nguy hiểm nhất của cả khu vực F: một nút "X lớn" trong luồng vuốt nhanh, nối thẳng vào xoá R2 (F-03). Repo hiện **không có** lightbox nào cho media lớp.

**What**: overlay xem từng media: vuốt trái/phải trên cảm ứng, `←`/`→` trên bàn phím, `Esc` thoát về lưới. Nút **X lớn** = từ chối → popup xác nhận → chuyển `DELETED` (soft, story 4). Nút X góc = thoát. Video phát trong overlay này và tính tiến độ xem (story 14).

**Acceptance**:
- [ ] Vuốt/mũi tên chuyển ảnh mượt, không tải lại trang; vị trí hiện tại giữ được khi đóng/mở lại.
- [ ] Nút **X lớn** luôn hiện popup xác nhận, **không** có đường tắt bỏ qua popup, **không** có phím tắt nào kích hoạt từ chối.
- [ ] Nút X lớn và nút X góc (thoát) **khác nhau rõ rệt** về vị trí, kích thước, màu; test người dùng thật ≥ 3 QLCS, 0 lần bấm nhầm trong 20 lượt vuốt/người.
- [ ] Sau khi từ chối, hiện toast có nút **"Hoàn tác"** sống ≥ 10 giây; bấm → media trở lại trạng thái trước đó.
- [ ] **Biên/lỗi**: bấm từ chối liên tiếp 5 lần thật nhanh → đúng 5 media bị đánh dấu, không nhiều hơn; không có lượt nào đánh trúng media kế tiếp do render trễ.
- [ ] **Biên/lỗi**: media cuối folder → mũi tên phải không nhảy sang folder khác; hiện "Hết folder".
- [ ] **Biên/lỗi**: mất mạng lúc bấm từ chối → báo lỗi rõ, ảnh **giữ nguyên** trạng thái cũ trên giao diện (không hiển thị lạc quan rồi âm thầm sai).

Priority: **P0** | Effort: **L** | Dependencies: Story 4, Story 12

---

#### Story 14: F-18 + F-19 — bắt buộc xem hết video + chỉ báo tiến độ

**Why**: Toàn bộ giá trị pháp lý của bước duyệt nằm ở câu "QLCS **đã xem** rồi mới duyệt". Với video, "đã xem" không suy được từ việc mở trang. Spec chốt (quyết định #6) là bắt buộc phát hết, và tua nhanh không tính. Không có chỉ báo (F-19) thì QLCS bị chặn nút mà không biết còn thiếu video nào — chặn không giải thích là công thức để người ta đi tìm đường vòng.

**What**: player ghi tiến độ vào `MediaWatchProgress` (story 6) theo khoảng đã phát thật; badge trên từng ô video: `Đã xem` / `Còn X:XX chưa xem`; header folder: `Đã xem n/m video`; nút "Duyệt tất cả" đọc trạng thái này.

**Acceptance**:
- [ ] Phát hết video → badge `Đã xem`; header tăng đúng 1.
- [ ] Tua từ giây 0 sang gần cuối rồi phát → badge vẫn hiện phần chưa xem đúng số giây còn thiếu.
- [ ] Header "Đã xem n/m video" khớp số badge trong lưới; test so hai con số.
- [ ] Tiến độ ghi **theo người**: QLCS A xem xong không làm QLCS B đủ điều kiện.
- [ ] **Biên/lỗi**: đóng tab giữa chừng → tiến độ đã phát được giữ, không mất về 0 (ghi định kỳ, không chỉ ghi lúc kết thúc).
- [ ] **Biên/lỗi**: video không phát được (codec lạ / transcode `FAILED`) → hiện lý do cụ thể + đường xử lý (báo GV up lại), và **không** khoá vĩnh viễn nút "Duyệt tất cả" của cả folder.
- [ ] **Biên/lỗi**: folder không có video nào → điều kiện F-18 coi như thoả, nút bật bình thường.

Priority: **P0** | Effort: **L** | Dependencies: Story 6, Story 12, Story 13

---

#### Story 15: F-13 + F-14 + F-16 — chốt folder: "Duyệt tất cả" / "Hôm nay không có ảnh" / bất biến duyệt trọn

**Why**: Đây là hành động sinh ra **bản ghi trách nhiệm** — dòng `ClassMediaReviewDay` mà báo cáo SLA F.4 đọc. Hôm nay hoàn toàn không có: duyệt là từng ảnh một (`actions.ts:385-387`), và không có khái niệm "folder đã xong". F-16 nói lớp chỉ hoàn tất khi **mọi** media đã `APPROVED` hoặc `DELETED` — bất biến này phải cưỡng chế ở **server**, không phải ở nút.

**What**: (a) nút "Duyệt tất cả" — chỉ hiện khi folder **có** media, popup *"Xác nhận đã xem và duyệt toàn bộ ảnh"*; (b) nút "Hôm nay không có ảnh" — chỉ hiện khi folder **không** có media, bắt buộc nhập ghi chú giải trình; (c) server action `closeMediaReviewDay` chạy trong **một transaction**: đổi trạng thái mọi media còn `PENDING` → `APPROVED`, ghi/cập nhật `ClassMediaReviewDay`, ghi `writeAudit`, `publishEvent` cho các hệ hạ nguồn.

**Acceptance**:
- [ ] "Duyệt tất cả" chỉ bật khi: folder có media **và** mọi video đã xem hết (F-18) **và** không còn media `transcodeStatus = PENDING`. Nút disabled luôn kèm **câu giải thích cụ thể** đang thiếu điều kiện nào.
- [ ] "Hôm nay không có ảnh" bắt buộc ghi chú ≥ 10 ký tự; bỏ trống → không gửi được, thông báo tiếng Việt.
- [ ] Hai nút **loại trừ nhau tuyệt đối**: không bao giờ hiện đồng thời; server từ chối `closeMediaReviewDay(KHONG_CO_ANH)` khi folder thực tế có media (chống đua: GV upload xen giữa lúc QLCS mở trang).
- [ ] Toàn bộ trong một transaction: giả lập lỗi giữa chừng → **không** có media nào đổi trạng thái và **không** có dòng `ClassMediaReviewDay` nào được tạo.
- [ ] Ghi audit + `publishEvent` idempotent theo `dedupeKey = media-review-day:<classId>:<date>` (mẫu `lib/events/publish.ts:11-35`); bấm hai lần không sinh hai sự kiện.
- [ ] **Biên/lỗi (đua)**: GV upload ảnh mới **trong lúc** popup đang mở → khi bấm xác nhận, server phát hiện số media đã đổi, **từ chối** và yêu cầu tải lại (mẫu `DRAFT_RACE` — `lib/lms/media-publish.ts:244, :272`). Không được im lặng duyệt cả ảnh QLCS chưa nhìn thấy.
- [ ] **Biên/lỗi**: bấm "Duyệt tất cả" cho folder ngoài phạm vi cơ sở → 403, không đổi gì.

Priority: **P0** | Effort: **L** | Dependencies: Story 7, Story 12, Story 14

---

### Nhóm 3 — Deadline & cảnh báo (F.3)

#### Story 16: F-20 + F-21 — deadline duyệt cấu hình được + cron nhắc quá hạn

**Why**: Deadline mặc định 10h sáng hôm sau đã chốt (quyết định #7), nhưng hôm nay **không có cron media nào** — thông báo `media_approval:pending/overdue` chỉ sinh khi người dùng **tự mở chuông** (`app/api/notifications/route.ts:53-68`, chạy qua `after()` sau khi response đã đi). QLCS không mở chuông thì hệ thống im lặng vô thời hạn, và F-21 mất hết ý nghĩa. Thêm nữa, đường đếm hiện tại lọc cơ sở **chỉ khi** actor là `CENTER_MANAGER` thuần (`lib/pending-tasks.ts:114`) và dùng `db` **trần** (`lib/pending-tasks.ts:1`), trần `take: 50` (`:217`).

**What**: (a) setting `media.reviewDeadlineTime` (mặc định `"10:00"`, lệch ngày +1) theo mẫu `lib/settings/registry.ts` — thêm một entry vào `SETTINGS` (`:116`) là trang `/cau-hinh-van-hanh` tự render vì nó map toàn bộ `SETTING_KEYS` (`:766`); **không cần migration**. Mẫu tham chiếu: `storage.presignTtlSec` (`registry.ts:607-614`). (b) cron `/api/cron/media-review-deadline` chạy mỗi 30' — dựng/cập nhật dòng `ClassMediaReviewDay` cho lớp có buổi hôm trước, đặt trạng thái `DUYET_TRE` khi quá hạn, gọi `notifyStaff` (`lib/notifications/notify.ts`) theo tiền tố `media_approval:` đã khai ở `lib/notifications/catalog.ts:137-140`.

**Acceptance**:
- [ ] Đổi giờ deadline trên `/cau-hinh-van-hanh` có hiệu lực với các ngày **mới**, và **không** làm đổi `deadlineAt` của dòng lịch sử (đã đóng băng — story 7).
- [ ] Quá hạn mà folder chưa chốt → QLCS phụ trách cơ sở đó nhận đúng 1 thông báo, deep-link tới đúng folder.
- [ ] Thông báo **không** trùng: chạy cron 5 lần liên tiếp chỉ có 1 dòng `StaffNotification` (dựa `@@unique([userId, dedupeKey])`).
- [ ] Người nhận đúng cơ sở: QLCS CS1 không nhận thông báo lớp CS2 — kể cả vai không phải `CENTER_MANAGER` thuần (vá lỗ `lib/pending-tasks.ts:114`).
- [ ] **Biên/lỗi (xác thực cron)**: gọi endpoint không có `Authorization: Bearer CRON_SECRET` → 401. ⚠️ Đã từng có 20 cron prod **chưa từng chạy** vì header rụng theo redirect canonical — bắt buộc smoke test trên prod sau merge, không chỉ trên test.
- [ ] **Biên/lỗi**: cron chạy lại sau khi lỗi giữa chừng → không tạo dòng `ClassMediaReviewDay` trùng (unique `[classId, reviewDate]`).
- [ ] **Biên/lỗi**: ngày lễ / lớp nghỉ (`ClassSession.status = CANCELLED`) → không sinh dòng, không nhắc.

Priority: **P0** | Effort: **M** | Dependencies: Story 7

---

### Nhóm 4 — Báo cáo SLA (F.4)

#### Story 17: F-30 + F-31 + F-32 — bảng báo cáo SLA duyệt ảnh

**Why**: Đây là thứ QLCS bị **đo**, nên nó phải đúng ngay từ ngày đầu — số sai một lần là mất niềm tin vào cả khu vực F. Repo đã có đúng mẫu để dựng: `lib/crm/sla.ts` (ngưỡng động đọc từ `SystemSetting` — `:22-36`, hàm THUẦN `evaluateSla`, cron 15') và bộ `lib/reports/*.ts` (hàm build thuần + test). Đừng phát minh mẫu thứ ba.

**What**: trang báo cáo `/admin/bao-cao/duyet-anh`: cột **STT · Tên lớp · Ngày GV up · Trạng thái · Ghi chú**. Trạng thái theo F-31: `Chưa duyệt` / `Đã duyệt` / `Phê duyệt trễ` / `Không có ảnh`. Cột Ghi chú theo F-32: trễ → `<thời điểm duyệt> / <deadline>`; chưa duyệt & đã duyệt → trống; không có ảnh → nội dung giải trình từ F-14. Logic tính trạng thái là **hàm thuần** có test, tách khỏi truy vấn.

**Acceptance**:
- [ ] Hàm thuần `evaluateMediaReviewSla(row, now)` có test phủ đủ **4** trạng thái + ranh giới đúng khoảnh khắc deadline (`t = deadline` thuộc nhóm nào — chốt tường minh, viết vào test).
- [ ] Cột Ghi chú: đúng 3 nhánh của F-32, không nhánh nào rơi vào chuỗi rỗng ngoài ý muốn.
- [ ] Số liệu đọc từ `ClassMediaReviewDay`, **không** đếm lại `ClassSessionMedia` mỗi lần mở trang → mở lại trang cho cùng khoảng ngày ra cùng con số.
- [ ] Cách ly cơ sở: QLCS chỉ thấy lớp trong `visibleCenterIds`; truyền `?centerId=` ngoài phạm vi bị bỏ qua im lặng, không 500.
- [ ] `approvedAt` của `ClassSessionMedia` **không** được dùng làm "thời điểm duyệt" (trường đó ghi cả cho `REJECTED` — `actions.ts:410-414`); dùng `ClassMediaReviewDay.reviewedAt`.
- [ ] **Biên/lỗi**: lớp mà người **có quyền duyệt tự upload** (ảnh vào thẳng `APPROVED` — `actions.ts:337, :345`) → trạng thái được đánh dấu tường minh (đề xuất nhãn phụ "tự duyệt"), **không** hiện `Đã duyệt` như thể đã qua quy trình.
- [ ] **Biên/lỗi**: khoảng ngày rỗng → bảng rỗng có thông báo, không lỗi.

Priority: **P1** | Effort: **M** | Dependencies: Story 7, Story 15, Story 16

---

### Nhóm 5 — Lưu trữ (F.5)

#### Story 18: F-05 — retention 12 tháng có điều kiện học bạ

**Why**: Vừa là nghĩa vụ (giữ ảnh trẻ em quá lâu là rủi ro pháp lý và chi phí) vừa là rủi ro cao nhất của cả khu vực F (xoá nhầm = mất vĩnh viễn). Hiện `lib/compliance/retention.ts` **không xoá gì** — chỉ đếm học viên `INACTIVE` rồi `console.warn` (`:43-51`), mặc định **5 năm** (`:11`), và **chỉ áp cho bảng `Student`** (`:25-31`). Không có chính sách nào cho media. Ship story này **trước** story 8 nghĩa là chạy một job xoá ảnh trẻ em trên một điều kiện chưa trả lời được.

**What**: (a) đặt `retentionDueAt` cho media theo ngày buổi + 12 tháng; (b) job **hai pha**: pha 1 chỉ **liệt kê** ứng viên xoá ra báo cáo và gửi cho người phụ trách dữ liệu; pha 2 chỉ chạy sau khi có phê duyệt, và chỉ xoá media **đã gắn học bạ đã xuất**; (c) media thuộc học bạ **chưa xuất** → **không xoá**, ghi log lý do + học bạ nào (đúng câu chữ F-05); (d) mọi lượt xoá đi qua đường soft `DELETED` + ân hạn của story 4, không xoá thẳng.

**Acceptance**:
- [ ] Chế độ mặc định là **dry-run**; muốn xoá thật phải có tham số tường minh + người vận hành chạy tay (luật cứng Nền Hệ thống #4).
- [ ] Báo cáo dry-run liệt kê: số media đủ điều kiện, số bị giữ lại vì học bạ chưa xuất (kèm `reportCardId`), số không thuộc học bạ nào, tổng dung lượng sẽ giải phóng.
- [ ] Media thuộc học bạ **chưa xuất** → không bao giờ bị xoá; có test riêng.
- [ ] Media thuộc học bạ `RECALLED` → không bị xoá; có test riêng.
- [ ] Xoá đi qua `DELETED` + `purgeAfterAt`, có thể khôi phục trong hạn ân hạn.
- [ ] **Biên/lỗi (điều kiện không trả lời được)**: media mà **không xác định được** học bạ liên quan → **giữ lại** và đưa vào danh sách rà soát tay. Mặc định fail-safe là GIỮ, không phải XOÁ.
- [ ] **Biên/lỗi**: job bị ngắt giữa chừng → chạy lại không xoá trùng, không bỏ sót; idempotent theo `mediaId`.
- [ ] Con số của mỗi lần chạy được **lưu vào DB** (không lặp lại lỗi `console.warn` của `retention.ts:48` — con số hiện không lưu ở đâu).

Priority: **P1** | Effort: **L** | Dependencies: Story 4, Story 8

---

## BẢNG ĐỐI CHIẾU — mã spec → story

| Mã spec | Nội dung | Story phủ | Ghi chú |
|---|---|---|---|
| F-01 | GV up ảnh/video vào kho chưa lưu hành, gắn lớp + buổi + ngày | **9** | phần ảnh đã chạy (`media-publish.ts:43`); story 9 mở cho video |
| F-02 | Chuẩn nén H.264 / 720p trước khi lưu R2 | **5** [SPIKE] | không có pipeline nào hôm nay |
| F-03 | Trạng thái `PENDING → APPROVED / DELETED` (xoá khỏi R2) | **4** | + Story 1 (xoá đúng bucket) |
| F-04 | Chỉ media `APPROVED` mới ra PH, và **phải đúng buổi** | **10** | vế "đúng buổi" hiện CHƯA CÓ (`lib/portal/photos.ts:29-41`) |
| F-05 | Retention 12 tháng nếu học bạ đã xuất | **18** | phụ thuộc Story 8 (mốc "đã xuất" hiện không tồn tại) |
| F-10 | Cây folder theo ngày, ẩn ngày đã duyệt hết | **11** | |
| F-11 | Folder lớp trong ngày, link chi tiết lớp, ⓘ tên GV | **11** | |
| F-12 | Màn view toàn bộ media của folder | **12** | |
| F-13 | Nút "Duyệt tất cả" + popup xác nhận | **15** | điều kiện bật đến từ Story 14 |
| F-14 | Nút "Hôm nay không có ảnh" + bắt buộc ghi chú | **15** | nơi lưu = Story 7 |
| F-15 | Xem từng ảnh kiểu slide, X lớn = từ chối → xoá R2 | **13** | nối vào đường soft-delete Story 4 |
| F-16 | Duyệt toàn bộ, không duyệt một phần | **15** | cưỡng chế ở server, không ở nút |
| F-17 | Video duyệt chung luồng ảnh | **12** | dữ liệu từ Story 3 + 9 |
| F-18 | Bắt buộc xem hết video (≥95%, tua không tính) | **14** | bảng đo = Story 6 |
| F-19 | Chỉ báo tiến độ xem (badge + "Đã xem n/m") | **14** | |
| F-20 | Cấu hình deadline (mặc định 10h sáng hôm sau) | **16** | thêm entry `SETTINGS` (`registry.ts:116`), không migration |
| F-21 | Notification quá hạn cho QLCS | **16** | hiện KHÔNG có cron media nào |
| F-30 | Bảng SLA (STT · Lớp · Ngày up · Trạng thái · Ghi chú) | **17** | |
| F-31 | Enum 4 trạng thái | **17** | định nghĩa lưu ở Story 7 |
| F-32 | Logic cột Ghi chú (3 nhánh) | **17** | |
| — | SL-02 cột phạm vi `ClassSessionMedia` | **2** | PRD A §10.2 |
| — | SL-03 `DELETED` + xoá R2 thật | **4** | |
| — | SL-04 phân loại ảnh/video | **3** | |
| — | SL-05 bảng tiến độ xem video | **6** | |
| — | SL-06 bảng sổ duyệt theo ngày | **7** | |
| — | SL-07 liên kết media ↔ học bạ | **8** | |
| — | Bucket R2 riêng (không có mã spec, là điều kiện pháp lý) | **1** | `.env.example:91-92`, mẫu `chat-storage.ts:48-66` |

**Không mã spec nào bị bỏ trống.** Story 1 là mục **vượt spec có chủ đích**: spec F không nhắc bucket, nhưng F-03/F-15 nói "xoá khỏi R2" và F.2 nói QLCS duyệt trước khi ảnh tới PH — cả hai vô nghĩa khi mọi object tải được vô danh trước cả khi được duyệt.

---

## Story Map

### Must-have — không có thì F không ra mắt được

| Thứ tự | Story | Vì sao must |
|---|---|---|
| 1 | **Story 1** — bucket R2 riêng | Ra mắt F trên bucket công khai = tăng khối lượng ảnh trẻ em phát vô danh |
| 2 | **Story 2** — SL-02 cột phạm vi | Mọi màn F sau đều phải lọc tay nếu thiếu; sửa sau = migration trên bảng có dữ liệu prod |
| 3 | **Story 3** — SL-04 phân loại | F-17/18/19 bất khả thi nếu không phân biệt ảnh/video |
| 4 | **Story 4** — SL-03 xoá thật + ân hạn | F-03/F-15 nói "xoá khỏi R2"; hôm nay không đường nào chạm R2 |
| 5 | **Story 7** — SL-06 sổ duyệt ngày | Không có bảng này thì F-13/14/20/30-32 đều không có chỗ lưu |
| 6 | **Story 6** — SL-05 tiến độ xem | Điều kiện bật nút F-13 |
| 7 | **Story 11 → 12 → 13** — cây folder → lưới → xem từng ảnh | Là chính bản thân trang duyệt |
| 8 | **Story 14 → 15** — xem hết video → chốt folder | Nơi sinh bản ghi trách nhiệm |
| 9 | **Story 16** — deadline + cron | Không có cron thì F-21 chỉ là thông báo khi người ta tự mở chuông |
| 10 | **Story 10** — F-04 đúng buổi | Lỗ lộ hình ảnh chéo trong cùng lớp, đang mở |
| 11 | **Story 8** — mốc "đã xuất" học bạ | Điều kiện của F-05; thiếu nó thì job xoá chạy mù |

### Should-have — ra mắt được nhưng thiếu thì đau

| Story | Vì sao chưa phải must |
|---|---|
| **Story 9** — video vào kho | Có thể ra mắt F **chỉ với ảnh** ở đợt 1, video ở đợt 2 (nhưng phải nói rõ với BGĐ, không để tưởng là có) |
| **Story 17** — báo cáo SLA | Số liệu quản trị; QLCS vẫn duyệt được mà không có bảng này |
| **Story 18** — retention 12 tháng | Nghĩa vụ có hạn định, không chặn ngày ra mắt — nhưng **không được lùi quá 1 quý** |

### Nice-to-have — đợt sau

- Duyệt hàng loạt theo nhiều folder cùng lúc (hôm nay 1 ảnh/lượt — `actions.ts:385-387`; sau story 15 thì đã đủ dùng ở mức folder).
- Xuất báo cáo SLA ra Excel (mẫu có sẵn ở đường export lead).
- Watermark động trên ảnh phụ huynh xem (đã có tiền lệ ở SCORM).
- Gợi ý tag học viên bằng đối chiếu danh sách điểm danh của buổi (rule-based, **không** nhận diện khuôn mặt — scope đã LOẠI theo Doc 15 §0).

---

## Technical Notes

### Thay đổi schema (đều ADDITIVE, không drop)

```
prisma/schema.prisma
  enum MediaStatus              + DELETED            ← ĐẶT CUỐI (quy ước tự khai tại :4497)
  enum MediaKind                + IMAGE | VIDEO      ← MỚI
  enum MediaTranscodeStatus     + NONE|PENDING|DONE|FAILED   ← MỚI
  enum MediaReviewDayStatus     + CHUA_DUYET|DA_DUYET|DUYET_TRE|KHONG_CO_ANH  ← MỚI

  model ClassSessionMedia (:4501)
    + centerId String?  + orgUnitId String?          ← SL-02 (ghi kép, luật cứng #3)
    + kind MediaKind @default(IMAGE)
    + mimeType String?  + sizeBytes Int?  + durationSec Int?  + width Int?  + height Int?
    + transcodeStatus  + transcodeError String?
    + deletedAt  + deletedById  + deleteReason  + purgeAfterAt
    + reportCardId String?   (hoặc bảng nối ReportCardMedia)  + retentionDueAt DateTime?
    + @@index([centerId, status]) @@index([centerId, createdAt])

  model MediaStudentTag (:4557)
    + centerId String?  + orgUnitId String?          ← SL-02

  model MediaWatchProgress      ← MỚI (SL-05)  @@unique([mediaId, userId])
  model ClassMediaReviewDay     ← MỚI (SL-06)  @@unique([classId, reviewDate])
  model ReportCardExportLog     ← MỚI (SL-07)  index [reportCardId, exportedAt]
```

### Nơi PHẢI khai thêm khi thêm model (quên = rò im lặng hoặc CI đỏ)

| Nơi | File | Hậu quả nếu quên |
|---|---|---|
| `SCOPED_MODELS` | `lib/db-scope.ts:11` | `injectScope` thoát ngay ở `lib/db-scope.ts:269` → **không lọc gì** |
| `BACKFILL_SPECS` | `lib/org/center-bridge.ts` | test `[US-07-IT-08b]` đỏ |
| Ghi kép `orgUnitId` | tự động qua `lib/org/dual-write.ts` cắm trong `lib/db.ts` | không phải tự gọi; **nhưng** SQL thô không đi qua nó |

⚠️ **`scopedDb` KHÔNG che write** (`lib/db-scope.ts:2`, `:291`). Mọi `create` trên model thuộc `SCOPED_MODELS` phải tự set `centerId`; mọi `update`/`delete` phải tự `passesScope()`.

⚠️ Bốn cột phẳng **không FK** liên quan tới F — Prisma không join được, phải 2 bước, không có ràng buộc toàn vẹn:
`ClassSessionMedia.classId` (`:4503`), `ClassSessionMedia.classSessionId` (`:4514`), `MediaStudentTag.studentId` (`:4561`), `ReportCard.enrollmentId` (`:6269`). Xoá `Class` **không** làm gì media của nó.

### Hạ tầng dùng lại (đừng viết lại)

| Cần | Dùng | Vị trí |
|---|---|---|
| Audit bất biến, tự suy `orgUnitId` | `writeAudit()` | `lib/audit/audit-log.ts` |
| Tách side-effect không-atomic | `publishEvent(type, payload, {tx, dedupeKey})` idempotent (bắt P2002) | `lib/events/publish.ts:11-35`; đăng ký handler `on(type, handler)` ở `lib/events/register.ts` |
| Thêm tham số vận hành | thêm 1 entry vào `SETTINGS`; trang `/cau-hinh-van-hanh` tự render vì map toàn bộ `SETTING_KEYS` | `lib/settings/registry.ts:116`, `:766`; mẫu `storage.presignTtlSec` `:607-614` — **không cần migration** |
| Ngưỡng động + hàm thuần + cron | mẫu SLA CRM | `lib/crm/sla.ts:22-36` (`loadSlaThresholds` đọc `SystemSetting`) |
| Bảng báo cáo | mẫu "hàm build thuần + test" | `lib/reports/*.ts` |
| Job xoá thật, idempotent | `purgeExpiredOtpRecords` (`lib/otp/cleanup.ts:22`), `pruneDriftLog` (`lib/org/drift-report.ts:180`) | |
| Bucket riêng fail-closed | `getChatBucket()` | `lib/storage/chat-storage.ts:48-66` |
| Guard đua khi đổi trạng thái lô | `updateMany` + so `count` + throw | `lib/lms/media-publish.ts:244`, bắt ở `:272` |
| Thông báo nhân sự | `notifyStaff()` là **đường ghi duy nhất**; "loại" = tiền tố `dedupeKey` khai ở catalog | `lib/notifications/catalog.ts:137-140` (`media_approval:`) |

### Cron

`vercel.json` đang có **23** cron. F thêm 2: `/api/cron/media-review-deadline` (mỗi 30') và `/api/cron/media-purge` (hằng ngày). Hồ sơ repo có ghi lo ngại về trần số cron của Vercel nhưng **chưa kiểm chứng** — cần xác nhận trước khi merge, nếu chạm trần thì gộp vào một endpoint điều phối.

⚠️ **Đã từng xảy ra: 20 cron prod CHƯA TỪNG CHẠY** vì header `Authorization` rụng theo redirect canonical. Bắt buộc smoke test đường cron **trên prod** sau merge, không chỉ trên `test`.

### Môi trường

- `test.satarobo.vn` và máy local **dùng chung một DB**. Mọi migration DROP/RENAME sẽ xoá dữ liệu đang làm việc ở local. Toàn bộ F đi đường **additive**, không có migration nào thuộc loại đó.
- Test chạy trên Postgres **local**, không bao giờ trỏ Supabase (`.claude/rules/prisma-db.md`).
- Migration prod: dry-run + **người vận hành chạy tay** (luật cứng Nền Hệ thống #4).

---

## Open Questions

| # | Câu hỏi | Vì sao chặn | Chủ | Hạn |
|---|---|---|---|---|
| **OQ-F1** | Nén video (F-02) chạy ở đâu? Nếu không nén được trong đợt này thì đường lùi (giới hạn thời lượng + dung lượng lúc upload) có được chấp nhận không? | Chặn Story 5, đổi hình dạng Story 9/12/14 | Chủ dự án + Dev BE | Trước khi bắt đầu Story 9 |
| **OQ-F2** | Thời gian **ân hạn** trước khi xoá vĩnh viễn khỏi R2 là bao lâu (đề xuất 30 ngày)? Ai được khôi phục? | Chặn Story 4; số này quyết định giữa "mất vĩnh viễn" và "gọi lại được" | Chủ dự án | Trước Story 4 |
| **OQ-F3** | "Học bạ **đã xuất**" nghĩa là `publishedAt != null` (đã phát hành) hay là có lần tải PDF? | Chặn Story 8 + 18; hiểu sai = job xoá chạy sai chiều | Chủ dự án + Đào tạo | Trước Story 8 |
| **OQ-F4** | Ảnh **không thuộc học bạ nào** (ảnh sinh hoạt, ảnh chung lớp) áp chính sách lưu trữ nào? | F-05 không nói; đây là **đa số** ảnh trong kho | Chủ dự án | Trước Story 18 |
| **OQ-F5** | Ảnh **đã bị QLCS từ chối** có được xoá khỏi R2 **ngay** không, hay cũng vào ân hạn? Spec F-15 nói xoá ngay. | Ảnh bị từ chối thường là ảnh có vấn đề (lộ mặt trẻ chưa có consent, ảnh riêng tư) — giữ lại 30 ngày trên storage là rủi ro; xoá ngay là mất khả năng khiếu nại | Chủ dự án | Trước Story 4 |
| **OQ-F6** | Người **có quyền duyệt tự upload** thì ảnh vào thẳng `APPROVED` (`actions.ts:337, :345`). Giữ nguyên hay bắt qua duyệt như mọi ảnh khác? | Đổi hành vi đang chạy trên prod; ảnh hưởng trực tiếp con số F-30 | Chủ dự án | Trước Story 15 |
| **OQ-F7** | Đợt 1 ra mắt **chỉ ảnh** rồi video ở đợt 2, hay chờ đủ cả hai? | Quyết định thứ tự Story 5/9 và câu chữ thông báo cho GV | Chủ dự án | Trước khi bắt đầu Story 11 |
| **OQ-F8** | Ai là **người phụ trách dữ liệu** ký duyệt lệnh xoá theo retention (Story 18 pha 2)? | Không có người ký thì pha 2 không bao giờ chạy được, và pha 1 thành báo cáo không ai đọc | Chủ dự án | Trước Story 18 |
| **OQ-F9** | Có văn bản đồng ý sử dụng hình ảnh (`StudentConsent` type `CLASS_MEDIA`) ký với **bao nhiêu %** phụ huynh hiện tại? Có điều khoản về **rút lại** không? | Rút consent không thu hồi được ảnh đã phát tán — cần biết quy mô trước khi mở rộng kho | Chủ dự án + Pháp chế | Trước Story 1 |

---
---

# PHẦN 2 — PRE-MORTEM

**Giả định**: khu vực F đã ra mắt trên prod và **thất bại**. Làm ngược lại để tìm nguyên nhân.

Khung: **Tigers** (rủi ro thật, cần hành động) / **Paper Tigers** (trông đáng sợ nhưng dễ kiểm soát hơn vẻ ngoài) / **Elephants** (rủi ro tổ chức mà đội biết nhưng tránh nói).

---

## Risk Summary

| Loại | Số lượng | Ý nghĩa |
|---|---|---|
| 🐯 **Launch-Blocking Tigers** | **9** | Chưa xử xong thì **không được bật F trên prod** |
| 🐆 **Fast-Follow Tigers** | **7** | Bật được, nhưng phải đóng trong ≤ 2 tuần sau ra mắt |
| 👀 **Track Tigers** | **6** | Theo dõi có chỉ số; leo thang khi vượt ngưỡng |
| 📄 **Paper Tigers** | **6** | Nghe to, thực tế kiểm soát được — kèm điều kiện biến nó thành Tiger thật |
| 🐘 **Elephants in the Room** | **6** | Rủi ro tổ chức/chính trị, cần người nêu ra bàn |
| **Tổng** | **34** | |

Phân bố theo hai nhóm được yêu cầu đào sâu:
- **(i) Mất dữ liệu ảnh học viên**: 5 Launch-Blocking + 2 Fast-Follow + 2 Track.
- **(ii) Pháp lý hình ảnh trẻ em**: 4 Launch-Blocking + 3 Fast-Follow + 2 Track + 3 Elephant.

**Quy ước hạn**: `T-0` = ngày bật F trên prod. `T-14` = 14 ngày trước đó. Tên chủ để ở dạng **vai**; điền tên người tại buổi kickoff — một vai không có tên người là một Tiger chưa có chủ.

---

## 🐯 Launch-Blocking Tigers

| # | Rủi ro | Khả năng | Tác động | Giảm thiểu | Chủ | Hạn |
|---|---|---|---|---|---|---|
| **T1** | **Bucket công khai**: ảnh trẻ em — kể cả ảnh **CHƯA DUYỆT** — tải được vô danh qua `https://cdn.satarobo.vn/<key>` (`.env.example:91-92`). Ra mắt F là đổ thêm ảnh và video vào lỗ này. Bật cờ `MEDIA_SIGNED_URL` **không cứu được** vì `signedMediaUrl` ký trên chính bucket công khai (`lib/storage/signed-url.ts:38`) | **Chắc chắn** (đang xảy ra) | **Thảm hoạ** — vi phạm bảo vệ dữ liệu trẻ em, không thể "sửa sau" vì file đã có thể bị lưu | Story 1: bucket riêng fail-closed sao chép `lib/storage/chat-storage.ts:48-66`. Nghiệm thu bằng **curl không cookie** vào 5 key ngẫu nhiên (2 PENDING, 3 APPROVED) → phải 403/404. Di trú object cũ có dry-run trước | Dev BE (hạ tầng) | **T-21** (phải xong trước mọi story F khác) |
| **T2** | **Duyệt nhầm bấm X hàng loạt, không hoàn tác được**: F-15 đặt "X lớn" ngay trong luồng vuốt nhanh, F-03 nối thẳng vào xoá R2. QLCS duyệt 40 ảnh cuối ngày, bấm nhầm vài tấm → mất vĩnh viễn. Ảnh buổi học đã qua **không tái tạo được** | **Cao** | **Nặng** — mất ký ức của học viên, PH khiếu nại, không có gì để đưa lại | Story 4 (soft `DELETED` + `purgeAfterAt` + thùng rác) **là điều kiện bắt buộc** của Story 13. Story 13: popup xác nhận không có đường tắt, không phím tắt từ chối, toast "Hoàn tác" ≥ 10s. Nghiệm thu bằng test người thật: ≥ 3 QLCS × 20 lượt vuốt, **0** lần bấm nhầm không hoàn tác được | Dev FE + QLCS CS1 (nghiệm thu) | **T-7** |
| **T3** | **Xoá row DB và xoá R2 lệch pha**: xoá row trước rồi R2 lỗi → object mồ côi sống vĩnh viễn trên CDN công khai (đúng lỗ T1); xoá R2 trước rồi DB lỗi → row trỏ file không tồn tại, PH thấy ô hỏng. Hiện **không đường nào chạm R2** (`actions.ts:440`, `media-publish.ts:308`) nên khi nối vào là đường mới hoàn toàn, chưa từng chạy | **Cao** | **Nặng** | Story 4: thứ tự cứng **R2 trước, DB sau**; R2 lỗi → giữ nguyên row ở `DELETED`, lùi `purgeAfterAt`, thử lại lần sau. Test giả lập R2 trả 500 (bắt buộc, không phải tuỳ chọn). Job đối soát tuần: liệt kê object không có row + row không có object, **không tự xoá** | Dev BE | **T-7** |
| **T4** | **Job retention xoá nhầm vì điều kiện "học bạ đã xuất" hiện KHÔNG trả lời được**: 4 route xuất PDF học bạ không ghi mốc nào. Nếu hiện thực F-05 với một điều kiện đoán (vd `publishedAt != null`) thì hoặc xoá cả ảnh của học bạ chưa xuất, hoặc không xoá gì và tưởng là đã tuân thủ | **Trung bình–cao** | **Thảm hoạ** — xoá hàng loạt ảnh trẻ em theo lô, không hoàn tác | Story 8 **trước** Story 18, không đảo thứ tự. Mặc định fail-safe: không xác định được → **GIỮ**. Job mặc định dry-run; xoá thật cần tham số tường minh + người vận hành chạy tay (luật cứng #4) + có người ký (OQ-F8) | Dev BE + người phụ trách dữ liệu | **T-0** (không xoá thật trước khi có chữ ký) |
| **T5** | **Không có backup R2 và không có thùng rác**: hôm nay không có snapshot, không có versioning bucket, không có bảng vết xoá. Mọi cơ chế cứu ở T2/T3/T4 đều đứng trên giả định "còn cái gì đó để khôi phục" | **Chắc chắn** (đang xảy ra) | **Thảm hoạ** — một lệnh sai là hết | Bật **object versioning** hoặc lifecycle giữ bản cũ trên bucket mới (Story 1); Story 4 dựng thùng rác + `purgeAfterAt`. Diễn tập khôi phục 1 ảnh đã xoá, có biên bản, **trước** T-0 | Dev BE (hạ tầng) | **T-14** |
| **T6** | **Trần 100 dòng làm ảnh cũ biến mất khỏi trang duyệt rồi bị coi là "đã xử lý"**: `page.tsx:45, :51 take: 100`, phẳng, không phân trang. Với F-16 (lớp chỉ xong khi MỌI media đã xử lý), ảnh vô hình = lớp không bao giờ đóng — hoặc tệ hơn, đếm "đã xong" theo cái nhìn thấy được và bỏ qua phần khuất | **Cao** | **Nặng** — vừa mất kiểm soát nội dung, vừa làm SLA F-30 sai một cách có hệ thống | Story 11/12: đếm bằng truy vấn gom nhóm, không nạp toàn bộ; lưới phân trang cuộn hết. Test dựng lớp có **500** media rồi kiểm số đếm folder = số ô thực tế | Dev BE + QA | **T-7** |
| **T7** | **Object key sinh từ tên file người dùng làm lộ tên học sinh trên URL vĩnh viễn**: `app/api/admin/upload-url/route.ts:109-119` slug hoá tên file gốc. `be-an-lop-3a.jpg` → key chứa tên trẻ. Hàm dựng key an toàn `buildMediaObjectKey` (`lib/lms/media-key.ts:8`) là **mã chết**, call-site duy nhất là test | **Cao** (phụ thuộc thói quen đặt tên của GV) | **Nặng** — PII trẻ em nằm trên URL, còn lại kể cả sau khi đổi bucket nếu không đổi key | Story 1: luồng media lớp dùng key **vô danh** (`class-media/<classSessionId>/<mediaId>.<ext>`) — chính là `buildMediaObjectKey` đang chết; đưa nó vào chạy thật. Bổ sung test `keyContainsName` (`media-key.ts:18`) chạy trên dữ liệu mẫu. Di trú key cũ nằm trong dry-run của Story 1 | Dev BE | **T-21** (cùng Story 1) |
| **T8** | **Rút lại đồng ý (consent) không thu hồi được ảnh đã phát tán**: hệ thống có `StudentConsent` `CLASS_MEDIA` và chặn tag khi chưa GRANTED (`actions.ts:280-310`, `media-publish.ts` C6.3), nhưng khi PH **rút** đồng ý, ảnh đã tải về / đã share link vẫn còn. Bucket công khai làm việc này thành vĩnh viễn | **Trung bình** | **Nặng** — đây là tình huống pháp lý điển hình nhất, và là tình huống PH sẽ viện dẫn | (a) Story 1 (bucket riêng + signed URL) làm link cũ chết theo TTL; (b) quy trình: rút consent → media của em đó chuyển `DELETED` + purge theo ân hạn, gửi xác nhận bằng văn bản cho PH; (c) ghi rõ trong văn bản đồng ý rằng bản đã tải về trước thời điểm rút **không** thu hồi được — nói trước, không nói sau | Pháp chế + Dev BE | **T-14** |
| **T9** | **F-04 chưa được áp: ảnh lộ chéo giữa các học viên cùng lớp**: `lib/portal/photos.ts:29-41` không lọc `classSessionId`. Học viên chỉ dự buổi 5 vẫn thấy ảnh buổi 3. Đây là lỗ **đang mở trên prod**, không phải rủi ro tương lai | **Chắc chắn** (đang xảy ra) | **Trung bình–nặng** — lộ hình ảnh trẻ khác trong cùng lớp; ra mắt F mà không vá thì spec F-04 là lời hứa sai trong biên bản nghiệm thu | Story 10, chạy được **ngay** trên schema hiện tại, không chờ story nào. Test ma trận 3 học viên × 3 buổi × 2 loại media | Dev BE | **T-14** |

---

## 🐆 Fast-Follow Tigers

| # | Rủi ro | Khả năng | Tác động | Giảm thiểu | Chủ | Hạn |
|---|---|---|---|---|---|---|
| **T10** | **Việc tồn đếm sai cơ sở**: `lib/pending-tasks.ts:114` lọc cơ sở **chỉ khi** actor là `CENTER_MANAGER` thuần và dựa `user.centerId` (ảnh chụp JWT lúc đăng nhập). Vai khác có `media:approve` đếm ảnh PENDING của **mọi cơ sở**; dùng `db` **trần** (`:1`), trần `take: 50` (`:217`) | Cao | Trung bình — QLCS bị nhắc việc của cơ sở khác, mất niềm tin vào chuông | Chuyển sang `scopedDb(actor)` + `actor.visibleCenterIds`; bỏ nhánh riêng cho `CENTER_MANAGER`; e2e 2 cơ sở | Dev BE | T+7 |
| **T11** | **Cron media không chạy trên prod** vì header `Authorization` rụng theo redirect canonical — **đã từng xảy ra với 20 cron**. F-21 im lặng mà không ai biết | Trung bình | Nặng nếu xảy ra — deadline thành trang trí | Smoke test cron **trên prod** ngay sau merge (không chỉ trên `test`); thêm chỉ số "lần chạy cuối" hiện trên `/cau-hinh-van-hanh`; cảnh báo nếu > 2h không chạy | Dev BE | T+3 |
| **T12** | **Video 500MB làm sập trải nghiệm**: `upload-config.ts:53-63` cho 500MB; không có nén (Story 5 chưa chốt). GV up video 5 phút bằng 4G, PH mở album trên điện thoại | Cao (nếu mở video mà chưa nén) | Trung bình — chi phí băng thông + PH bỏ xem | Trước khi có Story 5: **hạ trần** dung lượng + thời lượng video ở luồng lớp (vd 100MB / 90 giây) bằng cấu hình, nói rõ với GV; sau Story 5 mới nới | Dev BE + Đào tạo | T+14 |
| **T13** | **QLCS bỏ qua bằng cách tự upload**: người có `media:approve` upload là `APPROVED` ngay (`actions.ts:337, :345`). Khi bị đo bởi SLA F-30, đường tắt hợp lệ là tự up ảnh thay GV | Trung bình | Trung bình — số đẹp, kiểm soát rỗng | Story 17: nhãn phụ "tự duyệt" trên báo cáo, tách khỏi `Đã duyệt`; theo dõi tỷ lệ. Chốt OQ-F6 | Chủ dự án + Dev BE | T+14 |
| **T14** | **Ảnh không thuộc học bạ nào không có chính sách lưu trữ** (OQ-F4) — mà đó là **đa số** ảnh. Kho phình vô hạn, và mỗi tháng thêm là thêm rủi ro của T1/T8 | Cao | Trung bình | Chốt OQ-F4 thành một dòng chính sách; áp cùng cơ chế `retentionDueAt` của Story 18 | Chủ dự án | T+21 |
| **T15** | **Không có giới hạn chia sẻ link ra ngoài**: sau Story 1, PH vẫn có thể gửi signed URL cho người khác trong thời gian TTL | Trung bình | Trung bình | TTL ngắn (≤ 10 phút, `signed-url.ts:37` đang mặc định 600s); watermark động mang tên PH trên ảnh xem toàn màn hình (đợt sau); ghi vào văn bản đồng ý rằng chia sẻ lại là trách nhiệm của PH | Dev FE + Pháp chế | T+30 |
| **T16** | **Đua GV-upload vs QLCS-chốt**: GV up ảnh trong lúc QLCS đang mở popup "Duyệt tất cả" → ảnh chưa ai nhìn bị duyệt kèm | Trung bình | Trung bình — đúng loại lỗi mà F sinh ra để chặn | Story 15 đã có tiêu chí; đảm bảo test đua chạy trong CI (mẫu `DRAFT_RACE` — `media-publish.ts:244`) | Dev BE + QA | T+7 |

---

## 👀 Track Tigers

| # | Rủi ro | Chỉ số theo dõi | Ngưỡng leo thang | Chủ |
|---|---|---|---|---|
| **T17** | Kho phình quá nhanh, chi phí R2 vượt dự toán | GB/tháng theo cơ sở | > 150% dự toán tháng | Kế toán + Dev BE |
| **T18** | QLCS không kịp duyệt trước deadline → SLA đỏ triền miên, người ta ngừng nhìn báo cáo | % folder `DUYET_TRE` / tuần | > 30% hai tuần liên tiếp | Chủ dự án |
| **T19** | Ảnh bị từ chối nhiều bất thường ở một lớp/GV (dấu hiệu GV chưa hiểu quy tắc chụp) | Tỷ lệ `DELETED` / tổng upload theo GV | > 20% trong 1 tháng | Đào tạo |
| **T20** | Số cron chạm trần Vercel (đang 23, F thêm 2) — hồ sơ repo nêu lo ngại nhưng **chưa kiểm chứng** | Số cron đăng ký + trạng thái chạy | Bất kỳ cron nào không chạy 24h | Dev BE |
| **T21** | Dòng `ClassSessionMedia` có `classId` trỏ lớp đã xoá (cột phẳng không FK — `:4503`) tích tụ, làm sai số đếm folder | Số dòng mồ côi | > 50 dòng | Dev BE |
| **T22** | Tỷ lệ PH đã ký `StudentConsent` `CLASS_MEDIA` thấp → nhiều ảnh không tag được ai, kho đầy ảnh không dùng được | % học viên ACTIVE có consent GRANTED | < 80% | QLCS + Sale |

---

## 📄 Paper Tigers

| # | Nghe như rủi ro lớn | Vì sao thực tế **dễ kiểm soát hơn vẻ ngoài** | Điều gì biến nó thành **Tiger thật** |
|---|---|---|---|
| **P1** | "Phải xây lại toàn bộ luồng upload cho video" | Luồng kho đã đúng hình dạng spec và đã chạy thật (`lib/lms/media-publish.ts:43`, `:131`), có guard đua (`:244`), có bất biến consent C6.2/C6.3. `upload-config.ts:53-63` đã khai sẵn category `video` (500MB, MP4/WEBM/MOV/AVI). Việc thật là **nới bộ lọc + thêm cột phân loại**, không phải viết mới | Nếu Story 5 (nén) chọn phương án **client-side** thì luồng upload đổi bản chất (nén trước khi presign) và P1 thành Tiger. Chốt OQ-F1 sớm |
| **P2** | "Thêm cấu hình deadline phải sửa nhiều nơi + migration" | Thêm **một** entry vào `SETTINGS` (`lib/settings/registry.ts:116`) là xong: trang `/cau-hinh-van-hanh` tự render vì nó map toàn bộ `SETTING_KEYS` (`:766`). Mẫu có sẵn: `storage.presignTtlSec` (`:607-614`). **Không cần migration** | Nếu deadline cần **khác nhau theo cơ sở** thì phải dùng `centerOverridable` và kiểm lại đường đọc — vẫn nhẹ, nhưng phải nói ra trước |
| **P3** | "Cách ly cơ sở cho media rất khó vì `ClassSessionMedia` không có `centerId`" | Cách ly **đang hoạt động** qua tập `classId` đã scope (`page.tsx:37`, `actions.ts:27-40` dùng `sdb.class.findUnique` + `canManageClass`), và `ClassSession` đã có `centerId` + đã ở trong `SCOPED_MODELS` (`prisma/schema.prisma:1944`) ⇒ cây folder theo ngày lọc được cơ sở **ngay cả trước** SL-02 | Mỗi màn mới quên lọc tay là một lỗ. Số màn mới của F là **4**. Đó chính là lý do SL-02 vẫn là P0 — nhưng nó là "nợ tích tụ", không phải "chặn cứng ngày mai" |
| **P4** | "Bảng SLA sẽ rất khó tính đúng" | Có **hai** mẫu đã ship trong repo: ngưỡng động + hàm thuần + cron của `lib/crm/sla.ts:22-36`, và bộ `lib/reports/*.ts` (hàm build thuần + test). Nếu đọc từ `ClassMediaReviewDay` (Story 7) thì mỗi dòng đã chốt sẵn trạng thái, báo cáo chỉ là truy vấn | Nếu ai đó quyết "tính lại từ `ClassSessionMedia` mỗi lần mở trang" thì số sẽ trôi theo thời gian và P4 thành Tiger ngay. Ghi cấm điều này vào tiêu chí nghiệm thu Story 17 |
| **P5** | "Bật cờ `MEDIA_SIGNED_URL` là đủ, không cần tách bucket" | Đây là **Paper Tiger ngược**: nghe như giải pháp rẻ nhưng **không phải giải pháp**. Signed URL chứa nguyên object key và bucket vẫn có custom domain ⇒ ghép domain là tải được (`lib/storage/signed-url.ts:38` ký trên `getR2Bucket()`; lý do đầy đủ ở `.env.example:104-107`) | Nó đã là Tiger (T1). Ghi ở đây để **chặn** lập luận "bật cờ cho nhanh" khi lịch bị ép |
| **P6** | "Prisma không join được vì các cột phẳng không FK" | Repo đã sống với việc này ở nhiều nơi; mẫu 2 bước có sẵn (`lib/lms/report-card.ts:210-224`). Cách làm rõ ràng, chỉ là dài dòng hơn | Nếu ai viết `db.enrollment.findMany({ include: { reportCard: true } })` thì **lỗi runtime** chứ không phải chậm. Ghi vào tiêu chí review code của Story 8 |

---

## 🐘 Elephants in the Room

> Sáu điều đội biết nhưng thường tránh nói. Mỗi mục kèm **câu mở đầu gợi ý** để ai đó đưa ra bàn mà không biến buổi họp thành đấu tố.

**E1 — Chúng ta đã phát ảnh trẻ em qua một bucket công khai suốt một thời gian dài, và chưa ai tính xem đã có bao nhiêu file.**
Không phải lỗi của khu vực F — F chỉ là lúc nó thành không thể lờ được. Nhưng ra mắt F mà không nói ra điều này thì biên bản nghiệm thu ghi "đã có quy trình duyệt trước khi ảnh tới phụ huynh", trong khi thực tế mọi ảnh đều đã tải được từ trước bước duyệt.

> *Câu mở đầu:* "Trước khi bàn màn duyệt, em muốn đặt lên bàn một dữ kiện đã có trong tài liệu cấu hình của chính mình: bucket ảnh hiện là bucket công khai, `.env.example` dòng 91-92 ghi rõ. Em không nghĩ đây là lỗi của ai, nhưng em nghĩ nó phải là việc số 1, trước cả F-10."

**E2 — F-13 bắt QLCS bấm "Xác nhận đã xem và duyệt toàn bộ ảnh". Đó là một chữ ký chịu trách nhiệm. Chúng ta chưa hỏi QLCS có đồng ý ký không.**
Với 12 lớp/ngày × 20-40 ảnh, đây là 15-30 phút mỗi tối, mỗi ngày, trước 10h sáng hôm sau. Nếu người ký thấy đây là gánh nặng không được ghi nhận, họ sẽ bấm cho xong — và toàn bộ giá trị kiểm soát của F bay hết, trong khi hồ sơ vẫn đẹp.

> *Câu mở đầu:* "Em muốn hỏi thẳng anh/chị QLCS: nếu mỗi tối phải xem hết 200-400 tấm và ký xác nhận, việc này nằm ở đâu trong ngày làm việc của anh/chị? Nếu câu trả lời là 'chen vào lúc nào rảnh' thì em nghĩ ta nên thiết kế lại, chứ không nên ship rồi mới biết."

**E3 — Chúng ta chưa biết bao nhiêu phụ huynh đã thực sự ký văn bản đồng ý dùng hình ảnh, và văn bản đó có điều khoản rút lại chưa.**
Hệ thống có `StudentConsent` và chặn tag khi chưa GRANTED — nhưng đó là dữ liệu trong DB, không phải giấy tờ. Nếu một PH khiếu nại và yêu cầu xuất trình văn bản, ai cầm?

> *Câu mở đầu:* "Có ai đang giữ bộ văn bản đồng ý dùng hình ảnh bản giấy/PDF không ạ? Em hỏi vì Story 18 sẽ tự động xoá ảnh theo hạn, và trước khi tự động hoá bất cứ gì em muốn biết cơ sở pháp lý của việc **giữ** là gì."

**E4 — Job xoá tự động ảnh trẻ em cần một người ký. Chưa ai muốn là người đó.**
F-05 nói "job tự xoá". Trong repo, chính sách hiện hành đi ngược lại: `lib/compliance/retention.ts:5-7` ghi rõ *"KHÔNG tự động xoá (dữ liệu trẻ em — xoá là không thể hoàn tác, cần người xác nhận)"*, và đường xoá thật (`applyStudentErasure`) là **ẩn danh PII**, không hard-delete, chỉ SUPER_ADMIN bấm tay. F-05 đòi đảo nguyên tắc đó. Đây là quyết định của người có thẩm quyền, không phải của người viết mã.

> *Câu mở đầu:* "Spec F-05 nói job tự xoá. Nguyên tắc đang chạy trong hệ thống nói ngược lại và có ghi lý do. Em không định tự chọn — em cần một người ký vào phương án, và em đề xuất pha 1 chỉ liệt kê, pha 2 mới xoá và phải có chữ ký."

**E5 — Khu vực F được xếp làm sớm vì "nặng nhất", nhưng nó đang bị lịch của các khu vực khác ép.**
A chặn B/C/D/E; F chạy song song. Nếu lịch dashboard gấp, thứ đầu tiên bị cắt trong F sẽ là những story vô hình với người xem demo: Story 1 (bucket), Story 4 (thùng rác), Story 8 (mốc học bạ). Đúng ba story chống mất dữ liệu và chống rủi ro pháp lý. Demo vẫn đẹp, rủi ro vẫn nguyên.

> *Câu mở đầu:* "Nếu tuần sau phải cắt scope của F, em muốn thống nhất **trước** rằng ba thứ không được cắt là bucket riêng, thùng rác, và mốc học bạ — vì cắt chúng thì phần còn lại vẫn demo được, và đó chính là chỗ nguy hiểm."

**E6 — Chúng ta đang xây thêm màn hình trên một trang duyệt mà chưa ai xác nhận có người dùng thật.**
Trang `/admin/media` đã tồn tại, nhưng không có số liệu về việc nó có được dùng hay không — không có chỉ số, không có báo cáo. Nếu suốt thời gian qua không ai duyệt và ảnh vẫn tới PH (vì người có quyền duyệt tự upload = APPROVED ngay), thì F không phải "cải tiến quy trình", mà là **lần đầu tiên quy trình được áp** — và tải công việc mới sẽ là cú sốc, không phải cải thiện.

> *Câu mở đầu:* "Trước khi thiết kế trang duyệt mới, ta có thể lấy một con số không: 30 ngày qua có bao nhiêu lượt `reviewMedia` thật và bao nhiêu ảnh vào thẳng APPROVED do người duyệt tự up? Con số đó quyết định F là 'cải tiến' hay 'áp mới', và hai thứ đó cần cách truyền thông khác nhau."

---

## Go / No-Go Checklist

Bật F trên prod chỉ khi **toàn bộ** mục dưới đây có dấu ✅ kèm bằng chứng, không phải lời khẳng định.

### Cổng A — Dữ liệu không mất được (nhóm rủi ro (i))

- [ ] **A1** Bucket media lớp **không** phải bucket công khai. Bằng chứng: `curl` không cookie vào 5 object key (2 `PENDING`, 3 `APPROVED`) → **403/404** cả 5. Ảnh chụp màn hình đính kèm biên bản.
- [ ] **A2** Xoá là **soft**: mọi đường từ chối/xoá đặt `status = DELETED` + `purgeAfterAt`; object R2 vẫn còn trong hạn ân hạn. Test tự động xanh.
- [ ] **A3** **Diễn tập khôi phục** một ảnh đã xoá, thành công, có biên bản ghi thời gian và người thực hiện.
- [ ] **A4** Test giả lập R2 lỗi 500 khi purge → **0** row mất mà object còn, **0** object mất mà row còn. Đếm trước/sau khớp.
- [ ] **A5** Job đối soát object mồ côi chạy được ở chế độ **chỉ liệt kê**, đã chạy 1 lần, kết quả được đọc.
- [ ] **A6** Trang duyệt hiện **đủ** media của folder: dựng lớp thử 500 media, số đếm folder = số ô lưới. **Không** còn trần 100 dòng im lặng.
- [ ] **A7** Job retention **chưa** được phép xoá thật: chế độ mặc định là dry-run, và có tên người ký (OQ-F8) cho pha 2.
- [ ] **A8** Test người thật nút "X lớn": ≥ 3 QLCS × 20 lượt vuốt → **0** lần từ chối nhầm mà không hoàn tác được.

### Cổng B — Pháp lý hình ảnh trẻ em (nhóm rủi ro (ii))

- [ ] **B1** Ảnh **chưa duyệt** không có URL nào tải được khi không đăng nhập. Kiểm bằng curl trên 3 media `PENDING`.
- [ ] **B2** Object key của media lớp **không chứa** tên file người dùng nhập. Kiểm bằng test `keyContainsName` (`lib/lms/media-key.ts:18`) chạy trên 50 media mới nhất.
- [ ] **B3** Quy trình **rút consent** viết thành văn: rút → media chuyển `DELETED` → purge theo ân hạn → xác nhận bằng văn bản cho PH. Có người chịu trách nhiệm nhận yêu cầu rút.
- [ ] **B4** Văn bản đồng ý dùng hình ảnh: nói rõ phạm vi sử dụng, thời hạn lưu, quyền rút, và **giới hạn** (bản đã tải trước thời điểm rút không thu hồi được). Pháp chế duyệt.
- [ ] **B5** F-04 đã áp: học viên không dự buổi S không thấy media gắn buổi S. Test ma trận xanh.
- [ ] **B6** TTL signed URL ≤ 10 phút; test link hết hạn → 403.
- [ ] **B7** Có người đứng tên nhận và xử lý khiếu nại của PH về hình ảnh, kèm SLA phản hồi.
- [ ] **B8** Chính sách lưu trữ cho ảnh **không thuộc học bạ nào** đã được chốt bằng văn bản (OQ-F4) — không để trống với lý do "sẽ tính sau".

### Cổng C — Vận hành

- [ ] **C1** Cách ly cơ sở: e2e QLCS CS1 không thấy folder/ảnh/báo cáo nào của CS2, kể cả khi truyền tham số CS2 trên URL.
- [ ] **C2** Cron media đã chạy thật **trên prod** (không chỉ trên `test`) và có chỉ số "lần chạy cuối" xem được.
- [ ] **C3** Chuông báo quá hạn tới đúng người, đúng cơ sở, không trùng — kiểm bằng chạy cron 5 lần.
- [ ] **C4** `pnpm typecheck && pnpm lint && pnpm build` PASS; e2e media xanh; test `[US-07-IT-08b]` xanh.
- [ ] **C5** Migration: dry-run đã chạy, số dòng ảnh hưởng đã đọc, người vận hành chạy tay theo runbook (luật cứng #4).
- [ ] **C6** GV và QLCS đã được hướng dẫn (không chỉ email — có buổi 30 phút), biết chuyện gì đổi và tại sao.
- [ ] **C7** Rollback viết sẵn: tắt trang duyệt mới thì luồng ảnh cũ vẫn chạy; có cờ hoặc đường lùi cụ thể, đã thử một lần.
- [ ] **C8** OQ-F1 … OQ-F9 đã đóng, hoặc đóng có điều kiện với người ký và hạn ghi rõ.

**No-Go tự động** nếu bất kỳ điều nào sau đây đúng:
- Bucket vẫn công khai (A1 đỏ) — **không có ngoại lệ**, kể cả "chỉ bật cho một cơ sở để thử".
- Chưa diễn tập khôi phục thành công (A3 đỏ).
- Job retention được phép xoá thật mà chưa có người ký (A7 đỏ).
- F-04 chưa áp (B5 đỏ) — vì lúc đó câu "media chỉ tới đúng người, đúng buổi" trong biên bản là sai.
