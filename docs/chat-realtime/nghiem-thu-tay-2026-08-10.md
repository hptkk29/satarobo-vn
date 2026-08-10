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
| **TS-11** kick giữa phiên | ⏳ xem §2 | |
| **TS-13** vòng thông báo | ⏳ xem §2 | |
| **TS-14** ảnh + signed URL | ❌ **CHẶN** — xem §3 | |
| **TS-15** báo tin ZNS | ⛔ không nghiệm thu được trên test — xem §4 | |
| **TS-17** ngày đầu của PH | ◐ một phần — xem §4 | |

## 2. TS-11 · hai cận trên KHÁC NHAU, đừng gộp

*(điền sau khi lần chạy 10/08 chốt số)*

- **Cận trên bảo mật** = lúc server thôi trả nội dung. `leftAt` được set trong CHÍNH
  transaction đổi trạng thái ghi danh ⇒ tức thì.
- **Cận trên trải nghiệm** = lúc client đang mở tự thoát. Tín hiệu đi
  `DomainEvent → outbox → cron dispatch-events → broadcast`, nên nó bị chặn trên bởi
  **nhịp cron**, không phải bởi realtime:
  - PROD: `* * * * *` (mỗi phút — `vercel.json`)
  - TEST: 5 phút/lần (`cron-pump-test.yml`, vì Vercel Cron không chạy cho custom env)

  ⇒ Con số đo trên test **không** dùng để kết luận trải nghiệm prod.

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

## 5. Hai cổng khác nhau — đừng gộp

- **Cổng "được merge lên prod"**: mọi mục ✅ ở §1 + 3 việc checklist mục G + việc CORS
  ở §3. Chat lên prod ở trạng thái nội bộ (GV/quản lý) dùng trước, ZNS chat vẫn TẮT.
- **Cổng "được mở pilot cho PH thật"**: thêm TS-15, TS-17 và mẫu ZNS — theo đúng điều
  kiện cứng của PRD (≥70% kích hoạt **và** ≥50% đọc thông báo đầu trong 48h).
