# tests.md — Bản đồ kiểm chứng

> **Viết lại 09/08/2026** sau khi Đợt 0 + Đợt 1 xong. Bản gốc 07/08 ghi "chưa có dòng
> test nào tồn tại" — đúng lúc đó, sai bây giờ. Tài liệu này chỉ có giá trị nếu nó
> **trung thực**: cột "Cổng chạy" phân biệt rõ thứ CHẶN MERGE với thứ chỉ chạy tay.

## 0. Hạ tầng chạy test

| Cổng | Chạy gì | Chặn merge? |
|---|---|---|
| CI job **Quality** | `typecheck` + `lint` + `boundaries` + `build` | ✅ |
| CI job **Unit tests (Vitest)** | toàn bộ `*.test.ts` cạnh source | ✅ |
| CI job **Chat DB invariants** *(thêm 09/08)* | `tests/chat/**` với Postgres 16 dựng trong job (`pnpm test:chat-db`) | ✅ |
| `scripts/_zztest-chat-*.ts` | chạy **TAY** trên DB dev — cần secret thật (Supabase Realtime, R2) mà CI không có | ❌ |

⚠️ **Vì sao job "Chat DB invariants" phải tồn tại:** trước 09/08, `tests/chat/**` bọc
`describe.skipIf(!HAS_LOCAL_DB)` mà job `unit-tests` không có Postgres ⇒ **skip sạch**.
Một phiên audit đối kháng đã chứng minh: đổi bộ lọc "người phải rời nhóm" thành rỗng
(⇒ phụ huynh bị gỡ khỏi lớp vẫn đọc được lịch sử, vẫn vào được kênh realtime, F-KICK
chết) mà **CI vẫn xanh 100%**. Đó là lý do bộ test tầng DB phải chạy tự động, không
phải "có script chạy tay là đủ".

## 1. Existing coverage — test TỰ ĐỘNG (chặn merge)

| File | Phủ | Cổng |
|---|---|---|
| `tests/chat/db-invariants.spec.ts` | 6 bất biến sống còn: sync đặt `leftAt` · bẫy PH nhiều con · phát `chat.participant_removed` (+ rollback không sót event) · cổng đọc `NOT_PARTICIPANT` · BR-30 · cron REMOVE tự thi hành / ADD chỉ log — **mỗi bất biến đã kiểm ngược bằng đột biến** | Chat DB |
| `tests/chat/permission-matrix.spec.ts` | seed chuẩn + khung TS-01/03/04 (còn 32 `it.todo` — xem §3) | Chat DB |
| `lib/auth/chat-permissions.test.ts` | ma trận `permissions.md` × **cả v1 lẫn v2**, actor v2 dựng từ chính `ROLE_SEED` (seed lệch ⇒ test đỏ) | Unit |
| `lib/chat/messages.test.ts` | US-06: idempotency `clientMsgId` · rate limit · trạng thái hội thoại · đính kèm (tiền tố `storagePath` phải khớp hội thoại — chống gán ảnh nhóm khác) | Unit |
| `lib/chat/queries.test.ts` | US-08/09: sắp xếp · cursor · **BR-30 bằng máy dò duyệt sâu** (khoá nhạy cảm + regex SĐT/email) | Unit |
| `lib/chat/announcements.test.ts` | US-10: quota theo **ngày VN** (pin bằng mốc ISO tuyệt đối) · ai xem được thống kê · BR-30 trong danh sách chưa đọc | Unit |
| `lib/chat/moderation.test.ts` | US-12: cửa sổ 15' · bắt buộc lý do (400 ≠ 403) · luôn soft delete | Unit |
| `lib/chat/attachments.test.ts` | US-11: **magic bytes** byte thật (exe đổi đuôi + khai gian mime) · giới hạn số/cỡ · `[SEC]` luồng chat không chạm bucket công khai | Unit |
| `lib/storage/chat-storage.test.ts` | bucket chat tách hẳn; thiếu env → fail-closed; trùng bucket công khai → từ chối | Unit |
| `lib/chat/supabase-client.test.ts` | đường subscribe THẬT luôn `private: true` + `setAuth` trước khi join | Unit |
| `lib/chat/broadcast.test.ts` | fail-and-forget: lỗi/thiếu env không ném ra ngoài | Unit |
| `lib/chat/realtime-token.test.ts` | claims · TTL 15' · từ chối khi `tokenVersion` lệch | Unit |
| `lib/chat/sync-membership.test.ts` | `computeDerivedMembership` (thuần) | Unit |
| `lib/chat/reconcile-membership.test.ts` | `diffMembership` (thuần) | Unit |
| `lib/chat/_handlers/participant-removed.test.ts` | handler nhận **cả object event**, payload hỏng thì không bắn | Unit |
| `lib/chat/migrate-legacy.test.ts` | luật ánh xạ chat cũ (công cụ dự phòng — chủ dự án chốt KHÔNG migrate) | Unit |
| `components/chat/chat-store.test.ts` | US-07: khử trùng 2 tầng · race broadcast-trước-response · 3 lần thử lại | Unit |
| `components/chat/use-chat-channel.test.ts` | reconcile mỗi lần re-SUBSCRIBED · `participant.removed` · gia hạn token · dọn listener | Unit |
| `components/chat/attachments/rules.test.ts` · `components/chat/portal/format.test.ts` | luật chọn ảnh phía client · định dạng giờ VN | Unit |

## 2. Kiểm chứng chạy TAY (không chặn merge)

Cần secret thật nên CI không chạy được. Chạy trước mỗi lần phát hành.

| Script | Phủ | Ghi chú |
|---|---|---|
| `_zztest-chat-us02.ts` | **TS-02 đủ 6 bước** kể cả **canary TS-02.5** ("Allow public access" bị bật lại ⇒ đỏ) | Cần Supabase Realtime thật |
| `_zztest-chat-us01/03/04/06/08/10/11/12.ts` | TS-01, TS-03, TS-05→TS-08, TS-10, TS-12, TS-14 trên DB thật | us11 cần R2 thật |
| `_zztest-chat-us07-kick.ts` | F-KICK: event trong tx, rollback không sót | |
| `_zztest-chat-dot0-{seed,verify}.ts` | dựng/kiểm dữ liệu nghiệm thu tay trên test.satarobo.vn | có `cleanup` |

## 3. Gaps — rule có tài liệu nhưng chưa có gì kiểm

| Gap | Lộ gì | Kế hoạch |
|---|---|---|
| **32 `it.todo` trong `permission-matrix.spec.ts`** | Từng ô ma trận chưa có assertion ở tầng DB (tầng tĩnh `chat-permissions.test.ts` đã phủ) | Mở dần; nay job Chat DB đã tồn tại nên mở là chạy được ngay |
| **TS-09, TS-11, TS-13, TS-15, TS-16, TS-17** ([TAY]) | Mất mạng không mất tin · kick giữa phiên · vòng thông báo · push · khoá hội thoại · ngày đầu của PH | TS-15/16/17 phụ thuộc US-14/15/16 (Đợt 2). TS-09/11 cần 2 thiết bị thật |
| **Canary "grep bundle client không có service_role"** | Secret lọt bundle | `variables.md` liệt là cổng bắt buộc nhưng **chưa có step CI** — nên thêm sau `pnpm build` |
| Quy trình con người xử lý yêu cầu xoá ảnh trẻ em | Pháp lý/uy tín — không test kỹ thuật nào phủ được | Văn bản quy trình, fast-follow T6 |
| Độ trễ P95 ≤1,5s dưới tải thật | Trải nghiệm | Đo trong pilot Đợt 2 |

## Quy tắc CI

- Nhánh bảo vệ: **Quality + Unit tests + Chat DB invariants** đỏ ⇒ không merge. Đây là "người review thứ hai" (pre-mortem T2) — tắt là một quyết định rủi ro có ghi nhận, không phải thao tác tiện tay.
- **Test mới phải chứng minh bắt được lỗi**: áp đột biến vào code thật → test đỏ → khôi phục → xanh. Bài học 09/08: 12 story đều "test 2 lần pass" mà vẫn có 2 lỗ hổng kiểm chứng nghiêm trọng lọt qua.
- Định nghĩa sẵn sàng Đợt 2 (từ TestScenarios): AUTO xanh 3 lần liên tiếp + toàn bộ [TAY] pass trong một buổi diễn tập có chủ dự án chứng kiến + TS-17 ≤3 phút.
