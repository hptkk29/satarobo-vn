# permissions.md — Ma trận quyền tĩnh

> Bản đối chiếu cho audit access-control. `flows.md` là bản động; `tests.md` cho biết ô nào đã được test pin.

## Vai & nguồn scope

| Vai | Xác định bằng | Scope dẫn xuất từ |
|---|---|---|
| PH | `User.role=PARENT` | Quan hệ PH→học viên→lớp (DB, không phải token) |
| GV | `User.role=TEACHER` | Phân công dạy lớp (DB) — KHÔNG theo `centerId` của user (GV biên chế HO dạy chéo cơ sở) |
| QLCS | Quản lý `Center` | `Class.centerId` của lớp (DB) |
| Sale | `User.role=SALE` | **P0: không có quyền chat nào** (F5 đã dời) |
| Admin HO | Quản trị hệ thống | Toàn cục, nhưng đọc nội dung ngoài thành viên phải qua F-AUDIT |

Mọi scope tính từ **DB tại thời điểm request**, không nhúng vào JWT — trừ TB2 (subscribe) nơi policy RLS tự query DB lúc join.

## Ma trận resource × operation × vai

Ký hiệu: ✅ cho phép · ❌ từ chối (kèm test pin ô đó) · ⚠️ cho phép có điều kiện.

### Nhóm lớp (CLASS_GROUP)

| Operation | PH | GV | QLCS | Sale | Admin |
|---|---|---|---|---|---|
| Đọc tin | ✅ lớp của con | ✅ lớp mình dạy | ✅ lớp cơ sở mình | ❌ | ⚠️ qua F-AUDIT nếu không phải thành viên |
| Gửi CHAT | ✅ | ✅ | ✅ | ❌ | ❌ (nếu không phải thành viên) |
| Gửi ANNOUNCEMENT | ❌ | ✅ | ✅ | ❌ | ✅ |
| Xem thành viên | ✅ **bản ẩn liên hệ** (BR-30: không SĐT/email trong payload) | ✅ đầy đủ | ✅ đầy đủ | ❌ | ✅ |
| Xem đã-đọc ANNOUNCEMENT | ❌ | ✅ | ✅ | ❌ | ✅ |
| Thu hồi tin mình ≤15' | ✅ | ✅ | ✅ | — | ✅ |
| Gỡ tin người khác | ❌ | ✅ nhóm mình + lý do | ❌ | ❌ | ✅ + lý do |

### 1-1 (DM_TEACHER_PARENT)

| Operation | PH | GV | QLCS | Sale | Admin |
|---|---|---|---|---|---|
| Tạo/mở | ⚠️ chỉ với GV đang dạy con mình (quan hệ hiệu lực) | ⚠️ chỉ với PH của học viên lớp mình | ❌ | ❌ | ❌ |
| Đọc | ✅ của mình | ✅ của mình | ❌ | ❌ | ⚠️ F-AUDIT bắt buộc lý do + audit |
| Gửi | ✅ khi ACTIVE | ✅ khi ACTIVE | ❌ | ❌ | ❌ |

### Quản trị

| Operation | QLCS | Admin |
|---|---|---|
| `/admin/hoi-thoai` | ❌ | ✅ |
| Khoá/mở hội thoại | ❌ | ✅ + lý do + audit |
| Xem AuditLog | ❌ | ✅ |

## Trạng thái đè lên tất cả

| Trạng thái | Hiệu lực |
|---|---|
| ARCHIVED | Đọc ✅ (PH hết hạn sau 90 ngày — GV/QLCS/Admin không hết hạn) · Gửi ❌ mọi vai |
| LOCKED | Đọc ✅ thành viên · Gửi ❌ mọi vai kể cả GV |
| Participant `leftAt` đã set | Đọc tin sau `leftAt` ❌ · trước `leftAt` ✅ trong hạn 90 ngày · Gửi ❌ |

## RLS vs code-enforced

| Bề mặt | Cơ chế |
|---|---|
| Subscribe channel (TB2) | **RLS** — policy SELECT duy nhất trên `realtime.messages`; KHÔNG có policy INSERT cho client |
| Toàn bộ còn lại (đọc lịch sử, gửi, file, admin) | **Code-enforced** trong Server Actions — client không query trực tiếp bảng chat |
| Bảng `Conversation/Participant/Message/...` | Không expose qua PostgREST/RLS ở P0 — nếu sau này bật, phải viết RLS tương đương ma trận này trước |
