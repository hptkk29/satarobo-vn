# Nghiệm thu [TAY] module chat — 10/08/2026

> Môi trường: **test.satarobo.vn** (deploy thật, Supabase Realtime thật, R2 thật).
> Dữ liệu: bộ seed `scripts/_zztest-chat-nghiemthu-seed.ts` (prefix `ZZTEST_CHAT_NT`) —
> ADMIN · GV (dạy cả 2 lớp) · PH1 + PH2 (LopA) · PH3 (LopB).
> Bộ chạy lại được: `pnpm exec playwright test -c playwright.acceptance.config.ts`.

## 0. Cách nghiệm thu này khác "diễn tập" trong TestScenarios

TestScenarios yêu cầu *"toàn bộ [TAY] pass trên staging trong một buổi diễn tập có Dev
chứng kiến"*. Buổi này làm **hai đường song song**:

| Đường | Dùng cho | Ai chứng kiến |
|---|---|---|
| 2 trình duyệt thật (Brave + Chrome, 2 hồ sơ) | TS-16, US-15 — thứ cần MẮT NGƯỜI xác nhận "đổi ngay, không tải lại trang" | Chủ dự án xem trực tiếp |
| Playwright đa-context trỏ vào chính test.satarobo.vn | TS-09, TS-11, TS-13, TS-14 — thứ cần cắt mạng chính xác, bấm giờ, đếm trùng lặp | Log + ảnh chụp lưu trong `test-results/acceptance/` |

**Vì sao không dùng 2 tab của một trình duyệt:** `test.satarobo.vn` rơi vào nhánh
`unknown` của `proxy.ts` (BRANCH 3) — `/admin`, `/portal`, `/teacher` **cùng một host**
⇒ chung một hũ cookie ⇒ đăng nhập vai thứ hai là đá văng vai thứ nhất. Mỗi vai phải là
một `BrowserContext`/hồ sơ trình duyệt riêng.

## 1. Kết quả

| Kịch bản | Kết quả | Số đo |
|---|---|---|
| Hai vai song song | ✅ | 5 tài khoản đăng nhập đồng thời, không đá phiên nhau |
| **TS-09** mất mạng không mất tin | ✅ | GV→PH **1.854 ms** · mất mạng 30s/5 tin → hồi đủ **3.902 ms** · mất mạng **10 phút**/3 tin → hồi đủ **26.484 ms** · **0 tin trùng**, thứ tự đúng |
| **TS-16** khoá hội thoại khẩn cấp | ✅ (mắt người) | Khoá → ô nhập GV xám **không reload**; mở khoá → tự bật lại, gửi được ngay |
| **US-15** tra cứu có lý do + audit | ✅ (mắt người) | Nội dung đóng tới khi nhập lý do; `AuditLog` ghi **trước** khi hiện nội dung |
| Nhật ký chat | ✅ | 4 dòng đúng thứ tự: `READ` → `Cập nhật status/locked` (khoá) → (mở khoá) → `Tạo mới Message` |
| **US-16** cổng chính sách | ✅ | 3/3 phụ huynh gặp cổng ở lần đầu; `ChatPolicyAcceptance` ghi đúng version `2026-08-10` |
| **US-16 AC4** bảng đo pilot | ✅ | `/admin/bao-cao/chat-pilot` chạy: 26 nhóm lớp · kích hoạt 60% (97/162) · đọc thông báo đầu ≤48h 50% |
| **TS-11** kick giữa phiên | ✅ phần bảo mật · ⚠️ phần trải nghiệm — xem §2 | server chặn đọc **ngay** |
| **TS-13** thông báo tới máy PH đang mở | ✅ **sau khi vá** — xem §3-bis | `Đã đọc 0/2` lúc gửi → `1/2` sau khi PH1 đọc; PH2 còn trong danh sách chưa đọc |
| **TS-13** quota 10/ngày | ✅ đã có test tự động chặn merge (`lib/chat/announcements.test.ts`, quota theo NGÀY VN pin bằng mốc ISO tuyệt đối) | |
| **TS-14** ảnh + signed URL | ❌ **CHẶN** — xem §3 | |
| **TS-15** báo tin ZNS | ⛔ không nghiệm thu được trên test — xem §4 | |
| **TS-17** ngày đầu của PH | ◐ một phần — xem §4 | |

## 2. TS-11 · hai cận trên KHÁC NHAU, đừng gộp

- **Cận trên bảo mật** = lúc server thôi trả nội dung. `leftAt` được set trong CHÍNH
  transaction đổi trạng thái ghi danh ⇒ **tức thì**. Đã kiểm: ngay sau khi admin bấm,
  phụ huynh mở lại đúng URL đó bằng một tab khác của chính mình → không còn ô nhập,
  màn hình báo lỗi tử tế (không trắng). ✅
- **Cận trên trải nghiệm** = lúc client ĐANG MỞ tự thoát ra. Tín hiệu đi
  `DomainEvent → outbox → cron dispatch-events → broadcast` ⇒ bị chặn trên bởi **nhịp
  cron**, không phải bởi realtime.

**Số đo thật trên `test` (10/08):**

| Sự kiện `chat.participant_removed` tạo lúc | được xử lý lúc |
|---|---|
| 02:25:33 | 02:57:02 |
| 02:37:24 | 02:57:02 *(cùng một mẻ)* |
| 03:04:44 | vẫn `NULL`, `attempts=0` sau 11 phút |
| 09/08 09:58 | 10:14 |

⇒ Nhịp thật của outbox trên `test` là **~20–30 phút**, KHÔNG phải 5 phút như
`cron-pump-test.yml` ghi — lịch cron của GitHub Actions trôi là chuyện thường. Trên
**PROD** job này là `* * * * *` (Vercel Cron, `vercel.json`) nên cận trên ≈ **1 nhịp
cron**.

**Điều phải nói thẳng:** AC gốc viết *"trong vài giây app tự thoát"*. Kiến trúc hiện tại
**không đạt được "vài giây"** kể cả trên prod, vì tín hiệu đi qua outbox theo đúng thiết
kế (side-effect không-atomic ⇒ DomainEvent). Cận trên thực tế trên prod là ~1 phút.
Cái *bảo vệ* thật sự vẫn nguyên: server chặn đọc ngay, và kênh realtime bị từ chối ở lần
JOIN kế tiếp (chu kỳ gia hạn vé ≤240s — đã đo 4,8s sau một chu kỳ, xem `00-dieu-chinh`
mục E-ter #3).

Bài test đã được sửa cho khớp bản chất: hỏi thẳng `DomainEvent.processedAt`; outbox chưa
chạy thì ghi *"không kết luận được"*, chỉ đánh trượt khi **outbox đã phát mà client vẫn
không thoát**.

## 3. TS-14 — LỖI CHẶN: bucket ảnh chat thiếu luật CORS

Trình duyệt xin ticket OK (`POST /api/chat/upload-url` → **200**, kèm signed URL của
bucket `satarobo-chat`), nhưng bước PUT thẳng lên R2 bị chặn:

```
Access to XMLHttpRequest at 'https://satarobo-chat.<acct>.r2.cloudflarestorage.com/…'
from origin 'https://test.satarobo.vn' has been blocked by CORS policy
PUT … net::ERR_FAILED
```

**Hệ quả:** toàn bộ US-11 (gửi ảnh) chết ở cả test lẫn prod. Người dùng chọn ảnh xong
chỉ thấy chữ "Lỗi", nút Gửi không bao giờ bật.

**Vì sao không cổng test nào bắt được:** `attachments.test.ts` và `chat-storage.test.ts`
đều giả lập tầng mạng; server thật vẫn trả 200. Chỉ trình duyệt thật, PUT thật, mới lộ.

**Cách vá:** đặt CORS cho bucket `satarobo-chat` (và bucket chat của PROD khi điền
`R2_CHAT_BUCKET_NAME` cho scope Production):

```json
[
  {
    "AllowedOrigins": [
      "https://satarobo.vn", "https://www.satarobo.vn", "https://test.satarobo.vn",
      "https://admin.satarobo.vn", "https://hocvien.satarobo.vn",
      "https://giaovien.satarobo.vn", "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Script sẵn: `pnpm exec tsx scripts/apply-r2-cors.ts chat` — **cần token R2 quyền
Admin Read & Write**; token hiện tại trong `.env.local` chỉ có Object R/W nên trả
`Access Denied`. Không có token thì đặt tay trong dashboard R2 → Settings → CORS Policy.

→ **Thêm việc thứ 4 vào checklist đưa chat lên prod** (mục G của
[`00-dieu-chinh-cho-repo.md`](./00-dieu-chinh-cho-repo.md)).

## 3-bis. TS-13 — LỖI THẬT ĐÃ VÁ: thông báo không hiện realtime

**Triệu chứng đo được:** GV gửi thông báo → tin vào DB ngay, nhưng máy phụ huynh **đang
mở luồng** không thấy gì trong 30 giây.

**Nguyên nhân:** `lib/chat/announcements.ts:457` phát tên sự kiện RIÊNG
`announcement.created`, còn `components/chat/use-chat-channel.ts` chỉ nhận đúng 4 tên:
`message.created`, `message.deleted`, `conversation.locked`, `participant.removed`.
Thông báo bị **nuốt im**.

**Vì sao lỗi này sống sót qua mọi cổng test:** nó *tự khỏi* nếu chờ đủ lâu — mỗi lần
re-SUBSCRIBED (gia hạn vé ~4 phút, hoặc nối lại sau khi rớt) kéo theo một vòng reconcile
đọc bù từ DB. Nên nó **lúc xanh lúc đỏ tuỳ thời điểm**: lần chạy đầu của buổi nghiệm thu
này còn xanh, lần sau mới đỏ. Một lần chạy may mắn là đủ để tưởng đã chạy tốt.

**Bản vá (đã làm trong buổi này):**
- `components/chat/use-chat-channel.ts` — thêm nhánh `announcement.created`: hợp nhất vào
  luồng như tin thường + gọi `onAnnouncement` để khung GHIM (do RSC dựng) được dựng lại.
- `components/chat/portal/chat-thread.tsx` + `components/chat/staff/chat-thread.tsx` —
  truyền `onAnnouncement: () => router.refresh()`.
- `components/chat/use-chat-channel.test.ts` — thêm test khoá bất biến này.
  **Đã kiểm ngược bằng đột biến**: đổi tên sự kiện trong code ⇒ test ĐỎ; khôi phục ⇒ 32/32 xanh.

## 3-ter. LỖI NẶNG NHẤT: phụ huynh không gửi được tin nào (đã vá)

**Triệu chứng:** phụ huynh gửi tin — chữ hay ảnh — đều `PERMISSION_DENIED`, trên test
VÀ prod. Không có thông báo lỗi: client rơi vào nhánh *thử lại*, tin nằm im ở bong bóng
"Gửi lại". Trong khi `permissions.md` ghi rõ **PH ✅ Gửi CHAT**.

**Nguyên nhân gốc — đo trên DB:** `114 tài khoản PARENT / 0 dòng UserOrgRole`. RBAC v2
lấy quyền DUY NHẤT từ `UserOrgRole` ⇒ `actor.permissions` rỗng ⇒ không có gì để khớp
scope. `reconcileUserOrgRoles` chỉ được gọi từ 3 màn quản trị (nhân sự, giáo viên,
users) — **luồng cấp tài khoản phụ huynh không gọi**.

**Vì sao ẩn kỹ:** đường ĐỌC chat kiểm theo tư cách thành viên hội thoại, không qua
`can()` ⇒ phụ huynh vào đọc bình thường; chỉ khâu gửi mới lộ.

**Vì sao mọi test cũ đều xanh:** `chat-permissions.test.ts` dựng actor v2 bằng cách đưa
thẳng hàng permission của `ROLE_SEED` vào `buildActor` — nó kiểm *"nếu PH có vai PARENT
thì được gửi"*, đúng và vô dụng, vì ngoài đời không phụ huynh nào có vai đó. **Không test
nào đi từ `User` thật trong DB ra tới `can()`.**

**Một chỗ tôi suy luận sai, ghi lại để không ai đi lại đường đó:** ban đầu tôi kết luận
"kể cả có `UserOrgRole` thì scope `OWN` cũng không khớp vì target chat không có
`createdById`". SAI — `sendTargetOf` (`lib/chat/messages.ts:396-403`) cố ý gán
`createdById = actor.userId` **khi người gửi là thành viên hội thoại**, tức ngữ nghĩa
"participant" đã được mã hoá đúng qua scope `OWN`. Thêm một scope `PARTICIPANT` nữa chỉ
là bộ máy thừa chồng lên thứ đang chạy được.

**Bản vá (chủ dự án yêu cầu dứt điểm, không để tồn đọng):** khái niệm **vai quan hệ** —
`RELATIONSHIP_ROLE_CODES` trong `lib/auth/actor.ts`. Vai không gắn đơn vị nào thì nạp
thẳng từ `RoleDef` theo `User.role`/`User.roles`, không cần `UserOrgRole`:
- không phải backfill 114 tài khoản cũ, **và không đời nào quên với tài khoản mới**;
- **cố ý không** đóng góp `isHoLevel`/`visibleCenterIds`/`visibleOrgUnitIds`, `centerScope`
  để `null` — gắn PH vào ROOT (cách vá "dễ") sẽ biến họ thành HO-level thấy mọi cơ sở;
- `RoleDef` vẫn là nơi duy nhất định nghĩa PH được làm gì.

**Test khoá lại đúng mắt xích đã đứt:** `tests/chat/parent-permission.spec.ts` đi từ
`User` thật (role=PARENT, **không** tạo `UserOrgRole`) → `resolveActorUncached` → `can()`,
kèm đối chứng: PH không gửi được nơi mình không phải thành viên, không HO-level, không
thấy cơ sở nào, và **nhân viên thiếu `UserOrgRole` vẫn trắng tay** (bản vá không phát
quyền đại trà). Đã kiểm ngược bằng đột biến. CI job `Chat DB invariants` nay seed
`RoleDef` trước khi chạy — quyền v2 nằm ở DỮ LIỆU, không seed thì bài test vô nghĩa mà
vẫn xanh, đúng kiểu lỗ hổng vừa rồi sống sót.

## 4. Những thứ KHÔNG nghiệm thu được trên `test` — còn nợ trước khi mở pilot

| Mục | Vì sao | Ai làm |
|---|---|---|
| **TS-15** báo tin qua ZNS | Creds Zalo chỉ có ở scope **Production**; trên test luôn `SIMULATED`. Cấm nhân bản `ZALO_OA_REFRESH_TOKEN` sang môi trường 2 (token xoay vòng, hai môi trường giết token của nhau) | Smoke trên prod sau merge |
| Mẫu ZNS cho chat | `SystemSetting.chat.znsTemplateNewMessage` còn rỗng; `chat.znsNotifyEnabled` mặc định **TẮT** ⇒ không chặn merge, nhưng PH sẽ không nhận báo tin | Chủ dự án xin mẫu ZBS mới |
| **TS-17** mốc "≤3 phút, không cần trợ giúp" | Là đồng hồ bấm giờ của một PH THẬT trên điện thoại thật + link kích hoạt + OTP thật | Diễn tập trước ngày mở lớp |
| TS-09 với 4G chập chờn | Bộ máy cắt mạng dứt khoát; 4G phập phù là chế độ hỏng khác | 2 điện thoại thật |

**Phần TS-17 đã chứng minh được:** cổng chính sách hiện ở lần vào đầu và ghi mốc đồng ý;
sau khi đồng ý PH vào thẳng nhóm lớp của con **không phải thao tác join**; bảng đo pilot
đếm đúng. Chỉ còn thiếu khúc "kích hoạt bằng link + OTP thật" và cái đồng hồ.

## 4-bis. Đã lên PROD 10/08 — trạng thái sau merge

`main` = `5b44198b`. "Migrate Production DB (Supabase)" **success** (9 migration chat,
toàn bộ additive: CREATE TABLE + FK + ENABLE RLS trên đúng bảng chat mới, không đụng
bảng dữ liệu cũ nào).

**Bằng chứng cron prod đã sống lại** — gọi vào chính URL mà Vercel Cron dùng:

```
https://satarobo-vn.vercel.app/api/cron/dispatch-events  →  HTTP 401   (trước: 308)
```

401 = handler ĐÃ chạy tới nơi rồi mới từ chối vì thiếu token (Vercel Cron gửi kèm
`Authorization: Bearer`). Trước bản vá `ec427b6a`, request ăn 308 sang domain thật và
header `Authorization` rụng theo ⇒ **20 cron chưa từng chạy một lần nào**.

**Bốn việc còn lại trên prod** (mục G của `00-dieu-chinh-cho-repo.md`) — mỗi việc đều
đổi hành vi thật nên phải có người bấm:

| # | Việc | Trạng thái 10/08 | Ghi chú |
|---|---|---|---|
| 1 | Seed RolePermission | ✅ đã chạy | Reset toàn bộ RolePermission theo `seed-roles.ts`. RBAC v2 ON ⇒ đổi quyền ngay khi chạy |
| 2 | Backfill nhóm lớp | ✅ **12/12 nhóm, 0 lỗi** | 13 lớp ACTIVE, 1 lớp đã tự có nhóm (thao tác nghiệp vụ sau khi chat lên prod đã kích `syncConversationMembership` — đúng thiết kế, script bỏ qua) |
| 3 | `R2_CHAT_BUCKET_NAME` scope Production | ✅ đã điền `satarobo-chat` | |
| 4 | CORS bucket ảnh chat | ✅ đã đặt | Preflight `204` + `ACAO` cho cả `satarobo.vn` lẫn `test.satarobo.vn` |
| 5 | Token R2 phải có bucket `satarobo-chat` | ✅ trên `test` · ⏳ prod chưa xác minh | **Phát hiện 10/08:** token bị giới hạn theo bucket ⇒ `PUT` trả `403 AccessDenied`, mà R2 không kèm header CORS vào response lỗi nên trình duyệt báo nhầm thành lỗi CORS. Xác minh prod rẻ nhất: đăng nhập GV thật → gửi một tấm ảnh vào nhóm lớp |

**Kiểm chứng sau backfill:** tài khoản GV thật (Nguyễn Đức Tuấn) mở site giáo viên thấy
đủ nhóm lớp. Tài khoản GV KHÔNG phụ trách lớp ACTIVE nào thì thấy danh sách rỗng — **đúng
thiết kế**, không phải lỗi: thành viên nhóm dẫn xuất từ `Class.teacherId`/`assistantId`.
Tài khoản admin cũng thấy rỗng vì quyền đọc chat là participant-based; đường của admin là
`/admin/hoi-thoai` (tra cứu bắt buộc nhập lý do).

## 5. Hai cổng khác nhau — đừng gộp

- **Cổng "được merge lên prod"**: mọi mục ✅ ở §1 + 3 việc checklist mục G + việc CORS
  ở §3. Chat lên prod ở trạng thái nội bộ (GV/quản lý) dùng trước, ZNS chat vẫn TẮT.
- **Cổng "được mở pilot cho PH thật"**: thêm TS-15, TS-17 và mẫu ZNS — theo đúng điều
  kiện cứng của PRD (≥70% kích hoạt **và** ≥50% đọc thông báo đầu trong 48h).
