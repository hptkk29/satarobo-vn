# Rà soát bảo mật TĨNH — luồng media KHU VỰC F

**Phạm vi:** chỉ luồng ảnh/video lớp học (`ClassSessionMedia`) và hạ tầng kho R2 nó dùng.
**Phương pháp:** đọc mã trực tiếp trên nhánh `hptkk29/runhop20_08`. Không chạy khai thác, không chạm prod.
Mọi khẳng định kèm `file:dòng` và đoạn mã **nguyên văn**. Đây là **review mã**, không phải khai thác đã xác nhận.

**Ba câu hỏi trọng tâm được đặt:**
1. Quyền truy cập ảnh học viên → §1 (A/B/C), §5 (I), §6 (J)
2. URL ký của R2 → §1 (A), §3 (E)
3. Khả năng rò ảnh **chưa duyệt** ra ngoài → §1 (B), §2 (C)

---

## Bản đồ điểm vào → biến tin cậy → sink

| # | Điểm vào (attacker-controlled) | Biến | Sink |
|---|---|---|---|
| 1 | `POST /api/admin/upload-url` — `{category, filename, mimeType, sizeBytes}` | `filename` → `safeName`/`ext` | **Object key R2** (`route.ts:119`) → URL công khai `cdn.satarobo.vn/<key>` |
| 2 | Trình duyệt `PUT <uploadUrl>` (URL ký sẵn) | **body tuỳ ý** | Object thật trên bucket công khai |
| 3 | Server Action `uploadClassMedia({classId, fileUrl, studentIds, isClassWide, …})` | `fileUrl`, `studentIds`, `isClassWide` | `ClassSessionMedia.fileUrl` → hiển thị portal PH |
| 4 | Server Action `uploadClassMediaBatch` / `publishClassMediaAction` / `deleteDraftMediaAction` — `mediaIds[]`, `studentIds[]` | `mediaIds` | Đổi `status`, ghi `MediaStudentTag` |
| 5 | `DELETE /api/admin/upload-delete` — `{url, key}` | **`key` thô** | `DeleteObjectCommand` trên bucket |
| 6 | `?classId=` (site GV), cookie `portal_active_site` (portal) | `classId`, `studentId` | Truy vấn đọc media |

**Ranh giới tin cậy quan trọng nhất:** giữa bước 1 và bước 3 **không có ràng buộc nào**. URL ký được cấp
trước khi hệ thống biết ảnh thuộc lớp nào, buổi nào, học viên nào — và object đã nằm trên CDN công khai
trước khi bất kỳ kiểm tra quyền lớp / consent / duyệt nào chạy.

---

## 1. `lib/storage/signed-url.ts` · `lib/storage/r2-client.ts` · `.env.example`

### 1. [HIGH] [Kiểm soát truy cập / Mã hoá đầu ra] Cờ `MEDIA_SIGNED_URL` không đóng được lỗ nào — signed URL ký vào chính bucket công khai

**Bằng chứng:**

`lib/storage/signed-url.ts:37-40` — ký GET vào bucket lấy từ `getR2Bucket()`:
```ts
export async function signedMediaUrl(key: string, ttlSeconds = 600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: getR2Bucket(), Key: key });
  return getSignedUrl(getR2Client(), command, { expiresIn: ttlSeconds });
}
```

`lib/storage/r2-client.ts:91-94` — cùng bucket đó có URL công khai:
```ts
export function getPublicUrl(key: string): string {
  const cleanKey = key.startsWith("/") ? key.slice(1) : key;
  return `${getR2PublicUrl()}/${cleanKey}`;
}
```

`.env.example:91-93` — bản chất bucket:
```
# ⚠️ Bucket này CÔNG KHAI: nó gắn custom domain R2_PUBLIC_URL (cdn.satarobo.vn),
#    nên MỌI object trong đó tải được vô danh qua https://cdn.satarobo.vn/<key>.
#    Chỉ để file được phép công khai (ảnh trang web, tài liệu public, SCORM…).
```

Chính repo này đã **giải đúng bài toán ở chỗ khác** — `lib/storage/chat-storage.ts:57-64`:
```ts
  const publicBucket = (process.env.R2_BUCKET_NAME ?? "").trim();
  if (publicBucket && bucket === publicBucket) {
    throw new ChatStorageConfigError(
      "R2_CHAT_BUCKET_NAME đang trỏ đúng vào bucket công khai (R2_BUCKET_NAME) — " +
        "ảnh chat sẽ tải được vô danh qua R2_PUBLIC_URL. Hãy tạo bucket riêng.",
    );
  }
```

**Mức rủi ro: High**

**Kịch bản tấn công:**
1. Phụ huynh A (đã xác thực hợp lệ) mở `/portal/hinh-anh`. Nếu bật `MEDIA_SIGNED_URL`, trang trả URL ký
   dạng `https://<account>.r2.cloudflarestorage.com/<bucket>/uploads/images/2026-08/abc-1a2b3c4d.jpg?X-Amz-…`.
2. A đọc phần `<key>` nằm nguyên trong URL, ghép thành `https://cdn.satarobo.vn/uploads/images/2026-08/abc-1a2b3c4d.jpg`.
3. URL mới **không có chữ ký, không có hạn**, tải được **vô danh** (không cần đăng nhập).
4. A giữ/chia sẻ link này. Sau đó trung tâm gỡ ảnh, phụ huynh thu hồi consent, hoặc quản lý từ chối ảnh —
   link vẫn sống (xem phát hiện 3).

Kẻ tấn công = bất kỳ ai từng nhận một URL: PH của lớp, PH đã nghỉ, nhân viên đã nghỉ việc, người được
chuyển tiếp ảnh, hoặc bất kỳ ai đọc được Referer/lịch sử trình duyệt. Nạn nhân = học viên trong ảnh.

**Ảnh hưởng:** toàn bộ ảnh học viên (`ClassSessionMedia.fileUrl`), ảnh/tài liệu bài nộp
(`uploads/submissions/…`, `app/api/portal/upload-url/route.ts:89`), tài liệu giảng dạy, gói SCORM —
mọi thứ trong `R2_BUCKET_NAME`. Cơ chế thu hồi truy cập **không tồn tại**.

**Cách sửa:**
- Tách bucket riêng cho media lớp (`R2_MEDIA_BUCKET_NAME`) **không gắn custom domain**, dùng đúng khuôn
  fail-closed của `lib/storage/chat-storage.ts:48-65` (throw khi trống hoặc khi trùng `R2_BUCKET_NAME`).
- `signedMediaUrl` đọc bucket mới; `resolveMediaUrl` trở thành đường **bắt buộc**, không phải cờ.
- Với `fileUrl` di sản còn trỏ bucket cũ: hoặc copy object sang bucket mới + rewrite `fileUrl`, hoặc
  chấp nhận hai kho song song nhưng phải nới `isOwnStorageUrl` (`app/(admin)/admin/media/actions.ts:150-156`)
  cho đúng cả hai — hiện nó chỉ so với **một** `getR2PublicUrl()`.
- Trước khi làm xong: **đừng bật `MEDIA_SIGNED_URL` rồi coi là đã siết**; cờ này hiện chỉ đổi hình dạng URL.

---

### 2. [HIGH] [Kiểm soát truy cập] Ảnh **chưa duyệt** (DRAFT/PENDING) nằm trên CDN công khai ngay khi PUT, trước mọi kiểm tra

**Bằng chứng:**

`app/(admin)/admin/media/_components/media-client.tsx:25-48` (bản site GV giống hệt —
`app/(teacher)/teacher/anh-lop/_components/upload-photo-dialog.tsx:49-72`):
```ts
async function presignAndPut(f: File): Promise<UploadedFile> {
  const sign = await fetch("/api/admin/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category: "image",
      filename: f.name,
      mimeType: f.type,
      sizeBytes: f.size,
    }),
  });
  if (!sign.ok) throw new Error("Không ký được URL");
  const { uploadUrl, publicUrl } = (await sign.json()) as {
    uploadUrl: string;
    publicUrl: string;
  };
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": f.type },
    body: f,
  });
  if (!put.ok) throw new Error("Tải ảnh thất bại");
  return { fileUrl: publicUrl, fileName: f.name };
}
```
Hàm này chạy ở `onFile` (`media-client.tsx:248-266`) — tức **ngay khi người dùng chọn file**, chưa bấm
lưu, chưa gọi Server Action nào.

`app/api/admin/upload-url/route.ts:136-141` — server trả thẳng URL công khai:
```ts
    return NextResponse.json({
      uploadUrl,
      publicUrl: getPublicUrl(key),
      key,
      expiresIn: ttl,
    });
```

Trong khi đó `app/api/admin/upload-url/route.ts:18-47` **không nhận `classId`** và không kiểm tra bất kỳ
ràng buộc lớp/cơ sở nào — chỉ kiểm vai:
```ts
  const allowedRoles = ["SUPER_ADMIN", "CENTER_MANAGER", "MARKETING", "TEACHER", "TRAINING"];
```

**Mức rủi ro: High**

**Kịch bản tấn công:**
1. Giáo viên chọn 40 ảnh vào "Đưa vào kho". 40 object lên `cdn.satarobo.vn` trước khi
   `uploadClassMediaBatch` chạy — tức trước `canStageToClass`, trước `isOwnStorageUrl`, trước consent.
2. Nếu người dùng đổi ý và **không** bấm gửi, hoặc thao tác lỗi: DB không có dòng nào, nhưng object
   vẫn sống trên CDN vĩnh viễn, không con trỏ nào để dọn.
3. Ảnh ở `status = DRAFT`/`PENDING` (chưa qua duyệt của quản lý, có thể chứa trẻ chưa consent —
   `lib/lms/media-consent.ts:105-108` mô tả rõ nhóm này) **đã công khai** trước khi ai kịp xem.
4. Bước duyệt/từ chối của quản lý chỉ đổi cột `status` trong DB — không đụng gì tới object.

**Ảnh hưởng:** vòng duyệt media (F-13/F-15/F-16) chỉ kiểm soát **hiển thị trong app**, không kiểm soát
**khả năng tải file**. Từ góc bảo mật, "chưa duyệt" và "đã duyệt" ở cùng một mức truy cập.

**Cách sửa:**
- Sau khi tách bucket riêng (phát hiện 1), điều này tự hết vì object không còn tải vô danh được.
- Nếu chưa tách bucket: chuyển sang **upload qua server** (mẫu `app/api/admin/upload/route.ts`) và chỉ
  ghi object sau khi Server Action đã xác nhận lớp + quyền; hoặc ký PUT vào prefix cách ly
  (`staging/<userId>/…`) rồi `CopyObject` sang prefix chính khi Server Action chấp nhận, và xoá staging.
- Bổ sung job dọn object staging quá hạn.

---

### 3. [HIGH] [Kiểm soát truy cập] Mọi đường xoá media **không** xoá object R2 — ảnh sống vĩnh viễn sau khi bị từ chối/gỡ

**Bằng chứng:**

`app/(admin)/admin/media/actions.ts:438-447` — gỡ ảnh đã duyệt:
```ts
  const { actorId, actorName } = getAuditActor(session);
  const sdb = scopedDb(await resolveActor(session.user.id));
  await sdb.classSessionMedia.delete({ where: { id } }).catch(() => null);
  await writeAudit({
```

`lib/lms/media-publish.ts:306-311` — dọn kho DRAFT:
```ts
  const deleted = await db.$transaction(async (tx) => {
    const res = await tx.classSessionMedia.deleteMany({
      where: { id: { in: mediaIds }, status: "DRAFT" },
    });
    if (res.count > 0) {
```

Không có lệnh `DeleteObjectCommand` nào trong toàn bộ luồng media — grep toàn repo cho thấy nó chỉ xuất
hiện ở `app/api/admin/upload-delete/route.ts:64` (route riêng, **không** được luồng media gọi;
call-site duy nhất là `components/admin/ImageUploader.tsx:152`).

Từ chối ảnh cũng vậy — `app/(admin)/admin/media/actions.ts:408-416` chỉ `update` cột `status`.

**Mức rủi ro: High**

**Kịch bản tấn công:**
1. Giáo viên đăng nhầm một ảnh chứa trẻ chưa consent. Quản lý bấm "Từ chối" → `status = REJECTED`.
2. Ảnh biến mất khỏi portal, nhưng object vẫn ở `cdn.satarobo.vn/<key>`, tải vô danh.
3. Phụ huynh gọi điện yêu cầu **xoá** ảnh con. Quản lý bấm "Xoá" → row DB biến mất.
4. Object vẫn sống, **và giờ không còn con trỏ nào trong DB** để tìm ra key mà dọn tay.

Đây là bước **bất đối xứng** đúng như PRD đã nêu (`docs/prd/F-media.md:571-576`) nhưng chưa có phần
thực thi. Nạn nhân là học viên; "kẻ tấn công" ở đây là bất kỳ ai còn giữ URL — kể cả người trong nhà.

**Ảnh hưởng:** không có cách nào thực hiện quyền xoá dữ liệu của phụ huynh. Kho rác lớn dần mỗi ngày,
và mỗi object rác là một ảnh trẻ em tải được vô danh.

**Cách sửa:**
- Thêm bước xoá R2 **trước** khi xoá row, theo đúng thứ tự PRD chốt (`docs/prd/F-media.md:571-591`):
  ghi log `objectKey` → `DeleteObjectCommand` → mới xoá/đánh dấu row.
- Áp cho cả 3 đường: `deleteMedia`, `deleteDraftMedia`, và đường từ chối (`reviewMedia` decision
  `REJECTED`).
- Cần script rà object mồ côi lịch sử (`uploads/images/**` đối chiếu `ClassSessionMedia.fileUrl`),
  dry-run mặc định, người vận hành chạy tay (luật cứng #4 — `CLAUDE.md`).

---

## 2. `app/api/admin/upload-delete/route.ts`

### 4. [HIGH] [Phân quyền] Quản lý cơ sở xoá được **object bất kỳ** dưới `uploads/` — kể cả của cơ sở khác, và nhận `key` thô từ client

**Bằng chứng:**

`app/api/admin/upload-delete/route.ts:21-24` — gác bằng enum vai v1 tĩnh, không qua `can()`:
```ts
  const allowedRoles = ["SUPER_ADMIN", "CENTER_MANAGER"];
  if (!allowedRoles.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
```

`:33-39` + `:55-60` — `key` đi thẳng từ body, ràng buộc duy nhất là tiền tố:
```ts
  const { url, key: rawKey } = (body ?? {}) as { url?: string; key?: string };
```
```ts
  if (!key.startsWith("uploads/")) {
    return NextResponse.json(
      { error: "Chỉ cho phép xoá file trong /uploads/" },
      { status: 400 },
    );
  }
```

Chính chú thích trong mã thừa nhận không suy được cơ sở (`:69-72`):
```ts
    // SEC-M07: audit xoá object R2 (truy vết ai xoá key nào). Lưu ý: key R2 phân theo
    // LOẠI file (uploads/images|documents|…), KHÔNG theo cơ sở — asset admin dùng chung
```

**Mức rủi ro: High**

**Kịch bản tấn công:**
1. Quản lý cơ sở CS1 (vai hợp lệ, `scopedDb` chặn họ **đọc** dữ liệu CS2) mở DevTools trên một trang
   admin bất kỳ.
2. Gửi `DELETE /api/admin/upload-delete` với `{"key":"uploads/images/2026-08/<key-ảnh-lớp-CS2>.jpg"}`.
3. Không có bước nào tra `ClassSessionMedia` → không có bước nào so `class.centerId` với
   `actor.visibleCenterIds`. Object bị xoá.
4. Row DB **vẫn còn** và vẫn trỏ tới key đã chết → ảnh vỡ ở portal phụ huynh CS2, không ai biết vì sao.

Key cần biết trước, nhưng lấy nó không khó: bất kỳ ai từng nhận link ảnh (kể cả phụ huynh) đều có key,
và một người trong tổ chức chỉ cần mở trang lớp mình đang nhìn thấy. Đường xoá **hàng loạt** cũng mở:
lặp qua danh sách key thu thập được.

**Ảnh hưởng:** phá hoại/mất mát dữ liệu xuyên cơ sở, xuyên module (ảnh honors, news, tài liệu, gói SCORM
đều nằm dưới `uploads/`). `writeAudit` ghi lại được ai xoá, nhưng không ngăn được.

**Cách sửa:**
- Đổi gác quyền sang `assertPermission(...)` với target, thôi so `session.user.role` (luật cứng #1 —
  `CLAUDE.md` mục "Nền Hệ thống": cấm điều kiện quyền viết tay).
- Bắt buộc tra ngược chủ sở hữu trước khi xoá: nếu key khớp một `ClassSessionMedia.fileUrl` thì phải qua
  `mediaClassInScope` (mẫu sẵn có tại `app/(admin)/admin/media/actions.ts:27-40`); khớp `Document`/
  `Honor` thì qua gate tương ứng; không khớp gì thì từ chối thay vì cho qua.
- Nếu vẫn cần đường xoá "asset admin dùng chung", tách thành route riêng chỉ `SUPER_ADMIN`.

---

## 3. `app/api/admin/upload-url/route.ts`

### 5. [MEDIUM] [Phân quyền / Tài nguyên] `ContentLength` không được ký ⇒ giới hạn dung lượng chỉ là lời khai của client; route lại **không** có rate-limit trong khi route portal anh em thì có

**Bằng chứng:**

Server tin `sizeBytes` do client gửi (`:63`, `:93-105`):
```ts
  const maxSize = UPLOAD_CONFIG[category].maxSize;
  if (sizeBytes > maxSize) {
```
Nhưng URL ký ra **chỉ ký `Content-Type`** (`:122-129`), có chú thích cố ý:
```ts
    // CHỈ ký Content-Type. KHÔNG ký Metadata (x-amz-meta-*) hay ContentLength:
    // browser PUT chỉ gửi Content-Type nên các header đã-ký-nhưng-không-gửi sẽ
    // làm R2 trả 403 SignatureDoesNotMatch → xhr báo "Lỗi mạng khi upload" (A1).
    const command = new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
      ContentType: mimeType,
    });
```

**So sánh handler anh em** — `app/api/portal/upload-url/route.ts:26-38` có chốt mà route admin thiếu:
```ts
  // SEC-M08: rate-limit presign theo parent (chống loop presign→PUT multi-GB cost-DoS).
  // fail-soft (Upstash→memory). 30 presign/phút/parent rộng cho nộp vài file bài tập.
  const rl = await rateLimit({
    key: `upload-presign:parent:${session.user.id}`,
    max: 30,
    windowMs: 60_000,
  });
```
Trong `app/api/admin/upload-url/route.ts` không có `rateLimit` — không import, không gọi.

**Mức rủi ro: Medium**

**Kịch bản tấn công:**
1. Bất kỳ tài khoản nào qua được `:27` hoặc nhánh `media:upload-draft` (`:39-41`) — gồm mọi giáo viên —
   gọi presign với `{"category":"image","filename":"a.jpg","mimeType":"image/jpeg","sizeBytes":1}`.
   Kiểm tra 10MB ở `:94` pass vì `sizeBytes` là con số họ tự khai.
2. Dùng `uploadUrl` nhận được để PUT một body **5GB**. R2 chấp nhận: chữ ký không ràng buộc kích thước.
3. Lặp: không có rate-limit nào cản. Với `category: "archive"` thì trần khai báo còn là 1GB (`upload-config.ts:83`).
4. Object nằm trên bucket công khai, không có con trỏ DB, và (theo phát hiện 3) không có đường dọn.

Kẻ tấn công = nhân viên nội bộ bất mãn hoặc một tài khoản nhân viên bị chiếm. Nạn nhân = chi phí lưu trữ/
băng thông R2 của công ty, và không gian tên `cdn.satarobo.vn` (có thể dùng để phát tán file tuỳ ý dưới
tên miền công ty).

**Ảnh hưởng:** chi phí không giới hạn; lạm dụng tên miền công ty làm nơi lưu trữ; kho rác không dọn được.

**Cách sửa:**
- Thêm `rateLimit` theo `session.user.id` vào route admin, đúng mẫu `app/api/portal/upload-url/route.ts:28-38`.
- Ký kèm `ContentLength` **và** sửa client gửi header tương ứng, hoặc dùng
  `x-amz-content-sha256`/policy có `content-length-range` (POST policy) để R2 tự từ chối body quá cỡ.
  Nếu không làm được thì tối thiểu phải có job đối soát kích thước object thật sau khi PUT.
- Đưa `category` cho phép theo vai vào cùng chỗ với quyền: hiện `archive` (1GB) mở cho mọi vai trong
  `allowedRoles` dù chỉ SCORM cần.

---

### 6. [MEDIUM] [Rò rỉ PII] Object key sinh từ **tên file người dùng** ⇒ tên học viên có thể lọt vào URL công khai; hàm chuẩn `buildMediaObjectKey` là mã chết

**Bằng chứng:**

`app/api/admin/upload-url/route.ts:107-119`:
```ts
  const config = UPLOAD_CONFIG[category];
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  const safeName = filename
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);

  const datePrefix = new Date().toISOString().slice(0, 7);
  const uniqueId = uuid().slice(0, 8);
  const key = `${config.folder}/${datePrefix}/${safeName || "file"}-${uniqueId}${ext}`;
```

Trong khi repo **đã có** hàm dựng key privacy-first — `lib/lms/media-key.ts:1-15`:
```ts
// lib/lms/media-key.ts — R3-06: object key R2 + TTL signed URL (privacy-first, C6.5).
// Object key KHÔNG chứa tên/định danh học sinh; signed URL hết hạn 15'.
…
/** Dựng object key R2 cho 1 media buổi học. KHÔNG nhúng tên học sinh (C6.5). THUẦN. */
export function buildMediaObjectKey(input: {
```
Grep toàn repo: call-site duy nhất của `buildMediaObjectKey` là `lib/lms/lms-logic.test.ts:51`. Không có
mã sản phẩm nào gọi nó → **mã chết**, và luật C6.5 nó đại diện **không được thực thi ở đâu cả**.

**Mức rủi ro: Medium**

**Kịch bản tấn công:** không cần tấn công — chỉ cần một giáo viên đặt tên file theo thói quen
(`Nguyen Van An - buoi 5.jpg`). `safeName` giữ nguyên chữ cái/số, chỉ đổi ký tự đặc biệt thành `-`, ra
`nguyen-van-an-buoi-5`. Key thành `uploads/images/2026-08/nguyen-van-an-buoi-5-1a2b3c4d.jpg`, và đó
chính là URL công khai. Tên học viên nằm trong URL: lộ ra Referer khi ai đó mở link từ trang khác, lộ
trong lịch sử/bookmark, lộ trong log CDN, lộ khi phụ huynh chia sẻ link.

Kết hợp phát hiện 1: kể cả bật `MEDIA_SIGNED_URL`, key vẫn nằm nguyên trong URL ký → tên vẫn lộ.

**Ảnh hưởng:** PII trẻ em (họ tên) trong URL công khai, vĩnh viễn, không sửa được sau khi đã tạo.

**Cách sửa:**
- Cho luồng media lớp dùng `buildMediaObjectKey` (`lib/lms/media-key.ts:8-15`) — key chỉ gồm id, không
  tên. Muốn giữ tên gốc để tải xuống thì lưu vào cột `fileName` (đã có, `schema.prisma:4505`) chứ đừng
  đưa vào key.
- Nếu chưa đổi được ngay: thay `safeName` bằng chuỗi ngẫu nhiên, không lấy từ `filename`.
- Xoá hoặc gắn call-site thật cho `keyContainsName` (`media-key.ts:18-22`) — hiện nó là kiểm tra phòng
  thủ không ai gọi.

---

## 4. `lib/lms/media-publish.ts` · `app/(admin)/admin/media/actions.ts`

### 7. [HIGH] [Rò rỉ dữ liệu / Kiểm soát riêng tư] Cờ `isClassWide` **bỏ qua hoàn toàn** kiểm tra consent — trẻ đã thu hồi đồng ý vẫn xuất hiện trong ảnh gửi cho mọi gia đình khác

**Bằng chứng:**

`lib/lms/media-publish.ts:141-146` — bật `isClassWide` là `studentIds` bị làm rỗng:
```ts
  const isClassWide = input.isClassWide === true;
  // Class-wide & tag theo HS loại trừ nhau (mirror uploadClassMedia).
  const studentIds = isClassWide ? [] : [...new Set(input.studentIds ?? [])];
  // C6.2 — không tag & không class-wide → ảnh ẩn vĩnh viễn với PH: chặn từ đầu.
  if (!isClassWide && studentIds.length === 0) {
    return fail("NO_TARGET", 'Chọn học viên trong ảnh hoặc đánh dấu "Ảnh chung cả lớp"');
```
`:169-172` — toàn bộ khối kiểm consent nằm sau một điều kiện không bao giờ đúng ở nhánh class-wide:
```ts
  // C6.3 + thuộc lớp: consent GRANTED CLASS_MEDIA check TRỰC TIẾP theo id, và HS
  // phải đang học lớp này (chống tag chéo lớp bằng payload tuỳ ý).
  if (studentIds.length > 0) {
    const [granted, enrolled] = await Promise.all([
```

Đường "đăng ngay 1 ảnh" giống hệt — `app/(admin)/admin/media/actions.ts:271-276`:
```ts
  const tagIds = isClassWide ? [] : (d.studentIds ?? []);

  // C6.3 / AC4 — KHÔNG cho tag HS chưa có consent CLASS_MEDIA (reject server-side).
  // Kiểm tra TRỰC TIẾP theo tagId (không chỉ dựa danh sách lớp) → chống payload tuỳ ý.
  if (tagIds.length > 0) {
    const [granted, enrolled] = await Promise.all([
```

Phía đọc, portal chỉ hỏi consent của **con đang xem**, không của trẻ trong ảnh — `lib/portal/photos.ts:29-41`:
```ts
  const media = await db.classSessionMedia.findMany({
    where: {
      classId: { in: classIds },
      status: "APPROVED",
      OR: [
        { tags: { some: { studentId } } }, // ảnh gắn thẻ con
        { isClassWide: true }, // ảnh chung cả lớp
      ],
```

Chốt duy nhất còn lại là một **banner nhắc người** — `lib/lms/media-consent.ts:105-108`:
```ts
 * R7-09 — HS đang học của 1 lớp CHƯA có consent CLASS_MEDIA (status != GRANTED).
 * Dùng cho banner cảnh báo lúc upload: nhắc GV làm mờ thủ công / loại khỏi khung,
 * và chặn tag các HS này (server-side). Trả [] nếu lớp không có HS.
```

**Mức rủi ro: High**

**Kịch bản tấn công:** không cần kẻ tấn công — đây là lối đi mặc định của nghiệp vụ.
1. Gia đình của học viên X thu hồi consent `CLASS_MEDIA` (`revokeMediaConsent`, `media-consent.ts:83-85`).
2. Giáo viên chụp ảnh cả lớp có X trong khung, chọn **"Ảnh chung cả lớp"** (nhanh hơn tag từng em) rồi gửi.
3. `publishClassMedia` không chạy một dòng kiểm consent nào. Ảnh thành `APPROVED`.
4. `getStudentPhotos` trả ảnh này cho **mọi** phụ huynh còn lại của lớp (họ đã GRANTED cho con họ).
   Gia đình X thì không thấy gì — nên cũng không phát hiện ra.

Nạn nhân = học viên X và gia đình đã tuyên bố không đồng ý. Đây là luồng **chéo-gia-đình**, không phải
"attacker = victim".

**Ảnh hưởng:** ảnh trẻ em không có sự đồng ý được phát cho toàn bộ phụ huynh của lớp. Bất biến ghi trong
`CLAUDE.md` ("media phải tag + tôn trọng `StudentConsent`") và loạt C6.1–C6.4 chỉ đúng cho nhánh tag; nhánh
class-wide không có cơ chế nào. Bộ test cũng chỉ phủ nhánh tag (`tests/e2e/r3/media-consent.spec.ts:28-56`,
`tests/e2e/r7/media-draft.spec.ts:172-215`) — không có case nào cho `isClassWide` + trẻ thu hồi consent.

**Cách sửa:**
- Khi `isClassWide = true`, chặn publish nếu lớp còn học viên chưa GRANTED: gọi
  `getNonConsentStudents(classId)` (`lib/lms/media-consent.ts:109-130`) ở **server**, không chỉ để vẽ banner —
  trả `fail("NO_CONSENT", …)` kèm danh sách tên, buộc người đăng chọn đường tag hoặc xử lý ảnh trước.
- Hoặc (nếu nghiệp vụ cần class-wide kể cả khi có em chưa consent): thêm cột ghi nhận "đã xác nhận đã
  làm mờ/loại khỏi khung" + audit người xác nhận, và ẩn ảnh class-wide khỏi portal khi có em trong lớp
  vừa thu hồi consent sau ngày đăng.
- Bổ sung test khoá bất biến cho đúng kịch bản này trước khi sửa (luật cứng #5).

---

### 8. [MEDIUM] [Xác thực đầu vào] `isOwnStorageUrl` **fail-open** khi thiếu env R2 ⇒ nhét được URL ngoài vào album lớp

**Bằng chứng:** `app/(admin)/admin/media/actions.ts:150-156`:
```ts
function isOwnStorageUrl(fileUrl: string): boolean {
  try {
    return fileUrl.startsWith(getR2PublicUrl() + "/");
  } catch {
    return true;
  }
}
```
Chú thích ngay trên nó (`:144-148`) giải thích lý do fail-open: *"Thiếu env R2 → không chặn (lúc đó chính
luồng upload cũng không chạy được)"*. Lập luận này **không đúng cho đường tấn công**: `fileUrl` tới từ
payload của Server Action (`:263-265`, `:493-495`), kẻ tấn công không cần route presign để đưa giá trị vào.

**Mức rủi ro: Medium**

**Kịch bản tấn công:**
1. Trên một môi trường thiếu `R2_PUBLIC_URL` (preview deploy, môi trường mới dựng, biến bị xoá nhầm),
   `getR2PublicUrl()` throw (`lib/storage/r2-client.ts:29-33`).
2. Người có quyền đăng ảnh lớp gọi thẳng Server Action `uploadClassMedia` với
   `fileUrl: "https://server-cua-toi.example/anh.jpg"`. `catch → return true` cho qua.
3. Zod chỉ kiểm `z.string().url()` (`actions.ts:218`) nên URL ngoài hợp lệ.
4. Sau khi quản lý duyệt, portal render `<img src={m.url}>` (`app/(portal)/portal/hinh-anh/page.tsx:135-136`).
   Chủ server ngoài **đổi được nội dung ảnh sau khi đã duyệt**, và thu được IP + Referer của từng phụ
   huynh mỗi lần mở album.

Nạn nhân = phụ huynh (lộ IP/Referer) và uy tín nội dung đã duyệt.

**Ảnh hưởng:** vòng duyệt bị vô hiệu (nội dung đổi sau duyệt); rò metadata mạng của phụ huynh ra bên thứ ba.

**Cách sửa:** đổi `catch { return true }` thành `catch { return false }` (fail-closed). Thiếu env R2 thì
luồng ảnh đằng nào cũng hỏng — hỏng ồn ào an toàn hơn hỏng im lặng. Nếu cần hỗ trợ nhiều bucket sau khi
tách kho (phát hiện 1), so với **danh sách** host cho phép thay vì một chuỗi.

**Ghi nhận mặt tốt của chính hàm này:** dấu `/` nối thêm ở `getR2PublicUrl() + "/"` chặn được
`https://cdn.satarobo.vn.evil.com/x` — thiếu dấu đó là thủng ngay.

---

## 5. `app/(admin)/admin/media/page.tsx`

### 9. [MEDIUM] [Phân quyền] Trang `/media` chỉ cách ly theo **cơ sở**, không theo **lớp phụ trách** — lệch với hai handler anh em cùng đọc đúng dữ liệu đó

**Bằng chứng:**

`app/(admin)/admin/media/page.tsx:29-56` — lấy **mọi** lớp trong tầm nhìn rồi lấy mọi ảnh của chúng:
```ts
  const classes = await sdb.class.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true, name: true, classCode: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const classIds = classes.map((c) => c.id);
```
Gate vào trang chỉ là `checkAnyPermission(PAGE_GATES["/media"])` (`:20-22`), và
`lib/auth/page-gates.ts:121`:
```ts
  "/media": ["media:view", "media:upload"],
```
`media:view` được seed **GLOBAL** cho TEACHER (`prisma/seed-roles.ts:689`) và cho MARKETING
(`prisma/seed-roles.ts:262`).

**Handler anh em 1** — site giáo viên gác theo lớp được phân
(`app/(teacher)/teacher/anh-lop/page.tsx:132-133`):
```ts
    // Guard assigned (chống IDOR): lớp không phải của mình → không xem, không lộ tên lớp.
    if (!actor.assignedClassIds.has(classId)) return <NotYours />;
```

**Handler anh em 2** — trang chi tiết lớp trong admin cũng gác theo lớp
(`app/(admin)/admin/classes/[id]/page.tsx:166-171`):
```ts
  // IDOR view-own: chỉ GV/TA của lớp mới xem được khi chỉ có quyền view-own.
  if (!hasEdit && !hasViewAll && hasViewOwn) {
    if (cls.teacherId !== session.user.id && cls.assistantId !== session.user.id) {
      redirect("/dashboard?error=unauthorized");
    }
  }
```

`/admin/media` **không có** chốt tương đương. Nó còn trả về ảnh mọi trạng thái, gồm `DRAFT` fetch riêng
(`page.tsx:48-53`), kèm tên học viên được gắn thẻ (`:60-69`, `:84`).

**Mức rủi ro: Medium**

**Kịch bản tấn công:**
1. Giáo viên T dạy lớp A ở CS1, và có thêm một vai nhân sự khác (ví dụ kiêm Sale) nên **không** bị
   `decideRoute` đẩy khỏi host admin (`lib/auth/route-policy.ts:403-404` chỉ đẩy "GV thuần").
2. T mở `admin.satarobo.vn/media`. Gate pass nhờ `media:view` GLOBAL.
3. T thấy ảnh của **mọi lớp trong CS1** — kể cả lớp T không dạy — ở mọi trạng thái, kèm **tên học viên
   được gắn thẻ** trong từng ảnh, kèm ảnh `DRAFT` chưa ai duyệt.
4. Cùng dữ liệu đó, nếu T mở `/admin/classes/<id-lớp-khác>` thì bị `redirect` ở `:169`; nếu T mở
   `/teacher/anh-lop?classId=<lớp-khác>` thì bị `<NotYours />`. Chỉ `/media` là mở.

Với vai MARKETING (Hội sở) còn rộng hơn: `visibleCenterIds` gồm mọi cơ sở nên `sdb.class.findMany`
không lọc gì — thấy ảnh + tên học viên của **toàn hệ thống**. Tài liệu `docs/kho-anh-lop.md:45-47` viết
*"Cách ly cơ sở do `scopedDb`/`passesScope` ở tầng query"* — mệnh đề đó **không có tác dụng** với vai
cấp Hội sở, nhưng tài liệu không nói ra.

**Ảnh hưởng:** ảnh + danh sách tên học viên gắn thẻ, gồm ảnh chưa duyệt, lộ rộng hơn ranh giới mà hai
màn còn lại đang giữ.

**Cách sửa:**
- Với actor **không** phải quản lý (không `classes:view-all`/`media:approve`), lọc `classIds` xuống
  `actor.assignedClassIds` — tái dùng đúng predicate của `canPublishToClass`
  (`app/(admin)/admin/media/actions.ts:85-109`) thay vì viết điều kiện mới.
- Cân nhắc hạ `media:view` của TEACHER từ `GLOBAL` xuống scope lớp, hoặc bỏ hẳn (site GV đã có màn riêng
  gác đúng). Nhớ chạy lại seed vai (`docs/kho-anh-lop.md:53-54`).
- Nếu vai Marketing Hội sở **cần** nhìn toàn hệ thống thì ghi rõ điều đó vào `docs/kho-anh-lop.md`, và
  bỏ câu "cách ly cơ sở do scopedDb" — nó đang tạo cảm giác an toàn không có thật.

---

## 6. `lib/pending-tasks.ts`

### 10. [MEDIUM] [Phân quyền — fail-open] `mediaApproval` mất bộ lọc cơ sở khi `User.centerId` là NULL ⇒ liệt kê ảnh chờ duyệt của **mọi** cơ sở

**Bằng chứng:** `lib/pending-tasks.ts:206-218`:
```ts
  // ClassSessionMedia.classId là cột phẳng → lọc cơ sở qua tập classId trong cơ sở.
  let classFilter: { classId: { in: string[] } } | undefined;
  if (centerScope) {
    const classes = await db.class.findMany({ where: { centerId: centerScope, deletedAt: null }, select: { id: true } });
    classFilter = { classId: { in: classes.map((c) => c.id) } };
  }
  const rows = await db.classSessionMedia.findMany({
    where: { status: "PENDING", ...(classFilter ?? {}) },
    select: { id: true, fileName: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
```
`centerScope` đến từ `:109-116`:
```ts
function scope(user: TaskUser) {
  const isSuper = hasRole(user, "SUPER_ADMIN");
  const isCM = hasRole(user, "CENTER_MANAGER");
  const isManager = isSuper || isCM;
  // CM (không kèm SUPER_ADMIN) → giới hạn cơ sở mình; còn lại null = mọi cơ sở.
  const centerScope = isCM && !isSuper ? (user.centerId ?? null) : null;
  return { isSuper, isCM, isManager, centerScope };
}
```
Truy vấn dùng `db` trần, **không** `scopedDb` — nên không có lớp chặn thứ hai
(và `ClassSessionMedia` vốn không nằm trong `SCOPED_MODELS`, `lib/db-scope.ts:11-50`).

**Mức rủi ro: Medium**

**Kịch bản tấn công:**
1. Một tài khoản `CENTER_MANAGER` được tạo mà **quên gán `User.centerId`** (repo có nhiều bản ghi
   `centerId` null theo thiết kế — xem `lib/db-scope.ts:46-49`, `SCOPE_EXEMPT` cho `WorkRequest`
   `:92-95` với đúng lý do đó).
2. `user.centerId ?? null` → `centerScope = null` → `classFilter = undefined`.
3. Widget "Ảnh chờ duyệt" trên dashboard liệt kê 50 ảnh `PENDING` **của mọi cơ sở**, kèm `fileName`.
4. `fileName` là tên file gốc do người tải đặt — thường chứa tên học viên (xem phát hiện 6).

Kẻ tấn công = quản lý cơ sở A (hoặc bất kỳ ai chiếm tài khoản đó). Nạn nhân = học viên cơ sở B.

**Ảnh hưởng:** rò tên file (thường mang tên học viên) + khối lượng ảnh chờ duyệt của cơ sở khác. Không
lộ `fileUrl` ở đường này (chỉ `id`, `fileName`, `createdAt`), nên hạn chế ở mức metadata.

**Cách sửa:** đổi mặc định thành fail-closed — `centerScope == null && !isSuper` thì trả `null` (không
hiện nhóm việc) thay vì bỏ bộ lọc. Hoặc lấy tầm nhìn từ `actor.visibleCenterIds` (`resolveActor`) thay
vì `user.centerId` đơn lẻ, đúng như mọi truy vấn media khác trong repo.

---

## 7. `app/(admin)/admin/media/actions.ts` (audit) · `tests/e2e/r7/portal-media.spec.ts`

### 11. [LOW] [Truy vết] Audit của duyệt/xoá media không mang `orgUnitId`, và `ClassSessionMedia` không nằm trong `DUAL_WRITE_MODELS` nên cũng không tự suy được

**Bằng chứng:** `app/(admin)/admin/media/actions.ts:417-424` (duyệt) và `:441-447` (xoá) — cả hai bỏ trống
`orgUnitId`, khác hẳn các đường còn lại của cùng module (`:166-180` truyền `orgUnitId: cls?.centerId ?? null`;
`lib/lms/media-publish.ts:102`, `:267`, `:319` cũng truyền):
```ts
  await writeAudit({
    actor: { id: actorId, name: actorName },
    module: "media",
    entityType: "ClassSessionMedia",
    entityId: input.id,
    action: "STATUS_CHANGE",
    newValues: { status: input.decision },
  });
```
Đường suy dự phòng của `writeAudit` cũng không cứu được: `lib/audit/audit-log.ts:76-77` chặn ngay từ đầu:
```ts
  if (!entityType || !entityId) return null;
  if (!DUAL_WRITE_MODELS.has(entityType)) return null;
```
`DUAL_WRITE_MODELS` (`lib/org/center-bridge.ts:306-309`) dựng từ `BACKFILL_SPECS` + `PR_A_MODELS`; grep
`ClassSessionMedia` trong `lib/org/center-bridge.ts` và `lib/org/dual-write.ts` **không có kết quả** —
bảng này không có cột `centerId`/`orgUnitId` (`prisma/schema.prisma:4501-4527`).

Với `deleteMedia` còn nặng hơn: row bị xoá ở `:440` **trước** khi `writeAudit` chạy ở `:441`, nên kể cả
sau này thêm `ClassSessionMedia` vào `DUAL_WRITE_MODELS` thì `findUnique` cũng không tìm thấy gì.

**Mức rủi ro: Low**

**Kịch bản:** không phải đường khai thác. Hệ quả là dấu vết "ai duyệt/xoá ảnh nào" nằm ở `AuditLog` với
`orgUnitId = null`; màn xem audit tự nhận biết hạn chế này (`app/(admin)/admin/audit-log/page.tsx:53`:
*"bản ghi cũ không mang orgUnitId nên không lọc theo cơ sở được"*).

**Ảnh hưởng:** điều tra sự cố theo cơ sở bị hụt đúng ở hai hành động nhạy cảm nhất của module.

**Cách sửa:** truyền `orgUnitId: cls?.centerId ?? null` cho cả hai (đã có `mediaClassInScope` tra `classId`
ngay trước đó — chỉ cần trả thêm `centerId` thay vì `boolean`), và trong `deleteMedia` đọc `classId`/
`centerId` **trước** khi xoá row.

---

### 12. [LOW] [Chất lượng kiểm thử] Test được đặt tên là bằng chứng cho "URL ký hết hạn → 403" nhưng không kiểm điều đó

**Bằng chứng:** `tests/e2e/r7/portal-media.spec.ts:335-341`:
```ts
  // ── AC5 — signed URL: tách key đúng; hết hạn/đổi id → 403 (R2) ──
  test("C6: keyFromPublicUrl tách đúng key; URL ký hết hạn/đổi id → 403", async () => {
    // Thuần — không cần DB: key tách từ public URL đúng định dạng.
    expect(keyFromPublicUrl("https://cdn.example.com/uploads/images/2026-06/a-b.jpg"))
      .toBe(null); // không khớp R2_PUBLIC_URL trong môi trường test → null (fallback fileUrl)
    expect(db).toBeTruthy();
  });
```
Hai `expect` này kiểm: (a) hàm trả `null` khi URL **không khớp** cấu hình, (b) biến `db` tồn tại. Không có
gì kiểm hết hạn, không có gì kiểm 403, không có gì kiểm chính nhánh khớp prefix.

**Mức rủi ro: Low**

**Ảnh hưởng:** AC5 của R7-09 được coi là "đã phủ test" trong khi cơ chế nó bảo vệ (phát hiện 1) thực chất
không hoạt động. Đây là lý do lỗ hổng gốc sống lâu: có tên test, có tick xanh.

**Cách sửa:** đổi tên test cho đúng phạm vi (`keyFromPublicUrl` trả null khi không khớp), và thêm test
thật cho nhánh khớp prefix. Bảo đảm "hết hạn → 403" chỉ kiểm được sau khi tách bucket riêng — trước đó
nó không đúng nên **không nên** có test khẳng định nó.

---

## Chủ đề gốc (root cause)

Ba nguyên nhân chạy xuyên gần hết danh sách trên:

**1. Kho lưu trữ là công khai, còn kiểm soát truy cập lại được cài ở tầng ứng dụng.**
`ClassSessionMedia.fileUrl` là URL vô danh trên `cdn.satarobo.vn` (`r2-client.ts:91-94` + `.env.example:91-93`).
Mọi thứ ở trên nó — trạng thái duyệt, consent, `scopedDb`, `assignedClassIds` — chỉ điều khiển **ai thấy
đường link trong giao diện**, không điều khiển **ai tải được file**. Phát hiện 1, 2, 3, 6 đều là các mặt
khác nhau của cùng sai lệch này. Repo đã biết cách sửa và đã sửa đúng một lần cho chat
(`lib/storage/chat-storage.ts:9-28`); luồng media chưa được hưởng.

**2. Bất biến riêng tư được cài ở *một* nhánh rồi coi như đã cài xong.**
Consent chặn chặt ở nhánh tag (kiểm trực tiếp theo id, hai lần, ở cả hai đường ghi) nhưng nhánh
`isClassWide` đi vòng qua toàn bộ (phát hiện 7). Tương tự, gác theo lớp có ở site GV và ở trang chi tiết
lớp, nhưng không có ở `/media` (phát hiện 9). Khuôn chung: **so sánh các handler anh em là nơi lỗ hổng
lộ ra**, vì mỗi nhánh được viết ở một thời điểm khác nhau.

**3. `ClassSessionMedia` không có cột đơn vị nên nằm ngoài mọi cổng tự động.**
Bảng không có `centerId`/`orgUnitId` (`schema.prisma:4501-4527`), do đó không thuộc `SCOPED_MODELS`
(`lib/db-scope.ts:11-50`) lẫn `DUAL_WRITE_MODELS`. Hệ quả dây chuyền: cách ly cơ sở phải làm tay ở **từng**
call-site — grep `classSessionMedia` trong `app/` + `lib/` (bỏ test) ra **34 call-site trên 19 file**,
mỗi chỗ tự lo lấy ranh giới — audit không suy được `orgUnitId` (phát hiện 11), và bất kỳ
call-site mới nào quên guard là thủng im lặng — như `lib/pending-tasks.ts:213` (phát hiện 10) và
`lib/classes/detail-tabs-data.ts:34,40` (dùng `db` trần, an toàn chỉ nhờ caller ở
`app/(admin)/admin/classes/[id]/page.tsx:291` gác trước).

---

## Những gì ĐÃ LÀM TỐT

Không phải khen xã giao — đây là các chốt thật, có mã, và vài chốt trong số này chặn đúng những lỗi
mà rất nhiều codebase khác vấp phải:

1. **Chống tag chéo lớp bằng payload tuỳ ý — vá ở CẢ HAI đường ghi.**
   `lib/lms/media-publish.ts:171-206` và `app/(admin)/admin/media/actions.ts:275-313` đều kiểm
   `studentIds` theo **id trực tiếp** (consent GRANTED **và** đang ghi danh đúng lớp), không dựa vào
   danh sách mà client gửi. Chú thích `actions.ts:82-85` ghi rõ đường thứ hai từng sót và đã được vá cho
   khớp — đúng tinh thần "handler anh em phải cùng bất biến".

2. **Tách bucket riêng cho ảnh chat, fail-closed hai lớp.**
   `lib/storage/chat-storage.ts:48-65` từ chối chạy khi thiếu biến **và** khi biến trỏ trùng bucket công
   khai, kèm giải thích chính xác vì sao signed URL trên bucket có custom domain là vô nghĩa. Đây là
   khuôn mẫu đúng, đã kiểm chứng trong repo — media chỉ cần dùng lại.

3. **Chặn SVG có chủ đích, kèm lý do.** `lib/storage/upload-config.ts:15-16`:
   *"SVG cố tình KHÔNG cho phép: file lưu R2 public + serve inline theo Content-Type, một SVG chứa
   `<script>` sẽ chạy JS trên origin CDN (stored XSS)"*. Và vì `Content-Type` **được ký** vào URL presign
   (`upload-url/route.ts:128`), client không đổi được kiểu MIME lúc PUT → không nhét được HTML/JS dưới
   vỏ ảnh.

4. **`isOwnStorageUrl` có dấu `/` ở cuối.** `actions.ts:152` dùng `getR2PublicUrl() + "/"`, nên
   `https://cdn.satarobo.vn.evil.com/x` **không** lọt. Đây là bug kinh điển và ở đây đã tránh được.

5. **Sinh object key không nhận đường dẫn từ người dùng.** `upload-url/route.ts:109-119`: `safeName` chỉ
   giữ `[a-z0-9-]` (nên `../` bị triệt tiêu), thư mục lấy từ `config.folder` phía server, phần ngẫu nhiên
   do server sinh — client **không** chọn được key, nên không ghi đè được object của người khác.
   `validateFile` (`upload-config.ts:123-126`) chặn đuôi file lạ nên `ext` cũng không lách được ra khỏi
   thư mục. Tôi đã thử bác bỏ hướng path-traversal và không dựng được đường đi nào.

6. **Chống IDOR theo `mediaId` ở đường ghi.** `mediaClassInScope` (`actions.ts:27-40`) tra ngược
   `media → class → scopedDb`, và `publishClassMediaAction`/`deleteDraftMediaAction` bắt buộc mọi
   `mediaIds` phải cùng **một** lớp (`:559-561`, `:621-623`) rồi mới hỏi quyền — chặn được kiểu trộn lô
   để lách.

7. **Guard chống đua khi publish.** `lib/lms/media-publish.ts:233-244` lặp lại điều kiện `status: "DRAFT"`
   **bên trong** `updateMany` và rollback cả lô nếu `upd.count` lệch — tag và đổi trạng thái không bao giờ
   lệch pha.

8. **Tách hai cổng quyền có chủ đích và có tài liệu.** `canStageToClass` (vào kho) tách khỏi
   `canPublishToClass` (gửi phụ huynh) — `actions.ts:76-142`, `docs/kho-anh-lop.md:10-21`. Vai
   Marketing/Giáo vụ góp ảnh nhưng không tự gửi được. Ranh giới này được thực thi ở server, không chỉ ẩn nút.

9. **Portal không lộ `studentId` trên URL.** `lib/portal/session.ts:86-90` lấy con đang chọn từ cookie
   **có ký HMAC** rồi vẫn kiểm lại `children.find(...)` — token bị giả cũng không chuyển sang con nhà khác.
   `getSigningSecret()` đã bỏ fallback rỗng (`:38`, SEC-H05).

10. **TTL presign có chặn trên/dưới.** `lib/settings/registry.ts:607-614`:
    `z.number().int().min(30).max(3600)`, mặc định 300 — người quản trị không đặt được TTL vô hạn.

11. **Route portal có rate-limit presign** (`app/api/portal/upload-url/route.ts:26-38`) và **prefix riêng**
    `uploads/submissions/…` (`:89`), tách hẳn khỏi route admin. Ý tưởng đúng — chỉ là route admin chưa
    được hưởng (phát hiện 5).

12. **Tài liệu đã tự tố cáo phần lớn các lỗ này.** `docs/prd/F-media.md:23`, `:80-83`, `:571-576`,
    `documentation/variables.md:197`, `:399`, `documentation/architecture.md:565-570` đều ghi thẳng bucket
    công khai + xoá không đụng R2 + `MEDIA_SIGNED_URL` OFF nghĩa là gì. Hiếm có repo nào ghi rõ nợ kỹ
    thuật của mình đến mức này; rà soát này chủ yếu **xác nhận lại bằng mã** chứ không phát hiện mới ở
    ba điểm đó.

---

## Những gì KHÔNG kiểm chứng được (bạn nên tự kiểm)

Đây là rà soát **tĩnh**. Các mục sau phụ thuộc cấu hình/dữ liệu thật, không đọc được từ mã:

1. **Bucket R2 có thật sự đang công khai không.** Tôi chỉ đọc được `.env.example:91-93` (mẫu) và
   `R2_PUBLIC_URL="https://cdn.satarobo.vn"`. Giá trị thật trên Vercel Production và cấu hình
   Public Access/custom domain của bucket phải kiểm trên Cloudflare. **Cách kiểm nhanh:** lấy một
   `fileUrl` bất kỳ từ DB, mở bằng trình duyệt ẩn danh (không đăng nhập). Tải được = xác nhận phát hiện 1–3.

2. **`MEDIA_SIGNED_URL` đang bật hay tắt trên prod.** Mã mặc định OFF (`lib/flags.ts:80-82`) nhưng env
   thật quyết định. Lưu ý: theo phát hiện 1, **bật hay tắt không đổi bản chất** — đừng dùng trạng thái cờ
   này làm căn cứ đánh giá rủi ro.

3. **Số object mồ côi hiện có trên R2.** Cần `ListObjectsV2` trên `uploads/images/**` rồi đối chiếu
   `ClassSessionMedia.fileUrl` để biết quy mô di sản của phát hiện 3. Phải dry-run và do người vận hành
   chạy tay (luật cứng #4).

4. **Có bao nhiêu `User` mang vai `CENTER_MANAGER` mà `centerId` NULL.** Quyết định phát hiện 10 là lý
   thuyết hay đang xảy ra. Một câu SQL đếm là đủ.

5. **Có bao nhiêu ảnh `isClassWide = true` thuộc lớp đang có học viên `StudentConsent` REVOKED.** Quyết
   định mức độ thực tế của phát hiện 7. Cũng là một câu SQL.

6. **Bao nhiêu `fileName`/object key hiện chứa tên học viên** (phát hiện 6) — cần rà dữ liệu thật, có thể
   tái dùng `keyContainsName` (`lib/lms/media-key.ts:18-22`) đối chiếu với `Student.name`.

7. **CSP thực tế.** `docs/kho-anh-lop.md:26` nói CSP đang ở chế độ Report-Only; tôi không đọc cấu hình
   header trong lần rà này, nên mức độ giảm nhẹ cho phát hiện 8 chưa xác định.

8. **Hành vi quyền trên prod khác local.** `RBAC_V2_ENABLED=true` trên Production còn mặc định trong mã là
   OFF (`CLAUDE.md`), nên các kết luận về vai (phát hiện 9, 10) cần kiểm lại bằng `RoleDef`/`UserOrgRole`
   thật trên prod, không phải bằng ma trận v1 ở máy local.

9. **Tôi không kiểm luồng SCORM, luồng chat, và luồng bài nộp** ngoài phần chúng dùng chung bucket/route
   presign. Chúng nằm ngoài phạm vi được giao, nhưng phát hiện 1, 3, 4, 5 chạm tới chúng vì dùng chung
   `R2_BUCKET_NAME` và `uploads/`.
