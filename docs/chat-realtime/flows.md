# flows.md — Các luồng chạm quyền & side effect

> Chỉ liệt kê luồng chạm phân quyền / toàn vẹn dữ liệu / side effect / riêng tư. Không phải feature spec — spec ở PRD/UserStories.

## F-SEND · Gửi tin CHAT

**Actor:** PH/GV/QLCS là participant hiệu lực · **Tiền điều kiện:** hội thoại ACTIVE · **Kết quả:** tin trong DB + mọi client online thấy.

| Bước | Tầng | Authz check (deny case) | Side effect |
|---|---|---|---|
| 1. Client gọi `sendMessage(convId, body, clientMsgId)` | TB1 | — | — |
| 2. Guard: participant hiệu lực (`leftAt IS NULL`) | Server Action | Không phải participant / đã rời → **403** | — |
| 3. Guard: status = ACTIVE | Server Action | ARCHIVED/LOCKED → **403** mã lỗi riêng | — |
| 4. Rate limit 20/phút/user | Server Action | Vượt → **429** thông điệp tiếng Việt | — |
| 5. Transaction | Prisma | — | INSERT message; UPDATE lastMessageAt; UPDATE unreadCount (trừ sender) |
| 6. Broadcast (sau commit, ngoài TX) | TB3 service role | — | Đẩy `conv:{id}`; **fail → log warning, KHÔNG rollback, KHÔNG báo user** |
| 7. Enqueue push cho user offline | Server | — | Push từng tin (không gộp) |

Idempotency: `clientMsgId` — gửi lại cùng id không tạo tin thứ hai.

## F-SUB · Subscribe realtime

| Bước | Tầng | Authz check (deny case) |
|---|---|---|
| 1. Client subscribe `conv:{id}` với `private: true` | TB2 | — |
| 2. Realtime chạy policy SELECT trên `realtime.messages` | RLS | Không phải participant hiệu lực → **CHANNEL_ERROR**, không nhận payload nào |
| 3. Client về `SUBSCRIBED` → gọi `fetchMessagesSince(lastSeenId)` | TB1 | Guard participant như F-SEND bước 2 |

Điểm chết người: bước 2 chỉ chạy **lúc join** (cache theo connection) — xem F-KICK.

## F-KICK · Gỡ thành viên giữa phiên đang mở

**Trigger:** nghiệp vụ (gỡ phân công GV, học viên chuyển lớp/nghỉ) — không phải thao tác chat.

| Bước | Tầng | Kiểm soát |
|---|---|---|
| 1. Thao tác nghiệp vụ commit, trong CÙNG transaction: `syncConversationMembership` set `leftAt` | Prisma | Rollback nghiệp vụ → không sync nửa vời (TS-05.4) |
| 2. API lịch sử chặn NGAY (guard đọc `leftAt`) | TB1 | Cửa chặn cứng, độ trễ 0 |
| 3. Server broadcast `participant.removed` xuống topic | TB3 | Client tự unsubscribe + thoát màn hình |
| 4. Cửa sổ rò rỉ còn lại: broadcast phát sinh giữa bước 1 và lúc client xử lý bước 3 | — | **Rủi ro chấp nhận**, độ trễ đo và ghi tại TS-11.4 |

## F-ANN · Gửi ANNOUNCEMENT

Khác F-SEND ở: guard vai (chỉ MODERATOR/GV, QLCS-MEMBER/CENTER_MANAGER, Admin — PH → **403**); quota 10/ngày/lớp (vượt → 429); push **xuyên mute**; ghi `AnnouncementRead` khi PH đưa thông báo vào viewport (không phải lúc mở app).

## F-FILE · Đính kèm ảnh

| Bước | Tầng | Authz check (deny case) | Side effect |
|---|---|---|---|
| 1. Client xin signed **upload** URL | TB1 | Không phải participant → 403; mime ∉ {jpg,png,webp} (kiểm **magic bytes**, không tin đuôi file) → 415; >10MB hoặc >5 ảnh/tin → 413 | — |
| 2. Client upload thẳng lên Storage | TB4 | URL sai/hết hạn → 403 | Object vào bucket private |
| 3. Render: client xin signed **read** URL | TB1 | Không phải participant của hội thoại chứa ảnh → 403; tin đã bị gỡ → 403 | URL sống 5 phút |

## F-DEL · Thu hồi / gỡ tin

| Nhánh | Authz check (deny case) | Side effect |
|---|---|---|
| Tự thu hồi | sender = mình VÀ ≤15' (quá → 403 cả khi UI ẩn nút) | Soft delete; broadcast `message.deleted` |
| GV gỡ tin người khác | GV là MODERATOR của nhóm đó; thiếu lý do → 400 | Soft delete + SYSTEM message + audit |
| Admin gỡ | mọi nơi, bắt buộc lý do | Như trên |
| QLCS/PH gỡ tin người khác | → **403** luôn | — |

Bất biến: API đọc không bao giờ trả `body` của tin đã xoá cho user thường; signed URL ảnh của tin đã gỡ bị từ chối.

## F-AUDIT · Admin tra cứu hội thoại không phải của mình

| Bước | Authz check (deny case) |
|---|---|
| 1. Route `/admin/hoi-thoai` | Chỉ Admin HO; QLCS → 403 |
| 2. Mở nội dung hội thoại mình không phải thành viên | **Server-side** đòi `reason` — thiếu → 403 (modal UI không phải chốt duy nhất, TS-04.3) |
| 3. Trả nội dung chế độ chỉ đọc | Admin gửi tin vào đó → 403 |
| 4. Side effect | AuditLog: ai / khi nào / hội thoại / lý do — trước khi nội dung trả về |

## F-LOCK · Khoá / mở hội thoại

Admin only + lý do; status → LOCKED; broadcast event để mọi client vô hiệu ô nhập ngay; mọi guard gửi tin từ chối; audit cả khoá lẫn mở.

## F-SYNC · Đồng bộ thành viên (nền của mọi thứ)

Điểm gọi bắt buộc (checklist PR US-03.5): mở lớp · phân công/gỡ GV · thêm/chuyển/nghỉ học viên · đổi QLCS · kết thúc lớp. Luật khó nhất: PH nhiều con cùng lớp — `leftAt` chỉ set khi **tập** con trong lớp rỗng (TS-06). Idempotent. Lưới cuối: job đối soát đêm (cron.md).
