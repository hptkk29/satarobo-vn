# US-16 — Onboarding phụ huynh vào chat (pilot)

> Trạng thái: đã hiện thực trên nhánh `feat/chat-realtime` (10/08/2026).
> Migration `20260810100000_chat_policy_acceptance` **chưa chạy ở đâu** — apply theo quy
> trình nhánh (`test` → nghiệm thu → `main`).

## 1. AC1 — "đăng nhập lần đầu là thấy ngay nhóm lớp" (KHÔNG viết thêm code)

Đã chạy sẵn nhờ US-03. Đường đi thật:

| Bước | Nơi xảy ra |
|---|---|
| Cấp tài khoản PH (link `Student.parentId` + tài khoản `PENDING_ACTIVATION`) | `app/(admin)/admin/students/_actions.ts` — `createParentAccount`, gọi `syncConversationMembership` cho mọi lớp con đang học **trong cùng transaction** (`{ timeout: 30_000, maxWait: 10_000 }`) |
| Convert lead → ghi danh | `lib/crm/convert-lead-v2.ts:364` (cùng tx) |
| PH kích hoạt qua `/kich-hoat` (OTP) | `accountStatus: PENDING_ACTIVATION → ACTIVE` — **không đụng membership**, vì participant đã tồn tại từ bước cấp tài khoản |

⇒ Lần đăng nhập đầu tiên, `/portal/tin-nhan` đã có sẵn nhóm lớp. Không có thao tác "join".

**Hai chỗ vẫn hỏng, đều là dữ liệu chứ không phải code:**

1. Lớp đã ở trạng thái ACTIVE **trước** ngày phát hành chat thì không có sự kiện nào để
   sinh nhóm ⇒ chạy `scripts/backfill-nhom-lop-chat.ts --apply` (đã ghi ở
   `00-dieu-chinh-cho-repo.md` mục G.2). Trang danh sách rỗng nhìn giống hệt "tính năng
   chưa chạy".
2. Job đối soát đêm **chỉ tự thi hành REMOVE, còn ADD chỉ ghi log**. Nếu ai đó gán PH cho
   học viên bằng SQL tay/script (ngoài các điểm gọi đã wire), PH sẽ **không** tự vào nhóm —
   xem `/admin/hoi-thoai/doi-soat`.

## 2. AC2 — cổng chính sách (3 lớp, đều ở SERVER)

| Lớp | File | Chặn cái gì |
|---|---|---|
| Layout của segment | `app/(portal)/portal/tin-nhan/layout.tsx` | chưa đồng ý ⇒ `children` không vào cây React ⇒ page RSC bên dưới **không chạy** |
| Từng page | `page.tsx`, `[conversationId]/page.tsx`, `.../thanh-vien`, `.../thong-bao` | lớp thứ hai — bất biến bảo mật không đi nhờ quy ước render của framework |
| Vé realtime | `app/api/chat/realtime-token/route.ts` | tài khoản **thuần PARENT** chưa đồng ý ⇒ 403 `CHAT_POLICY_REQUIRED`; nếu không, nghe broadcast là đọc được tin mới mà không qua trang nào |

Ghi mốc: bảng `ChatPolicyAcceptance` (UNIQUE `userId + version`, đã `ENABLE ROW LEVEL
SECURITY`). Ghi bằng `acceptChatPolicyAction` (`app/(portal)/portal/tin-nhan/actions.ts`) —
upsert với `update: {}` nên bấm 2 lần/2 tab vẫn giữ `acceptedAt` **lần đầu**.

### Đổi nội dung chính sách

Sửa `lib/chat/policy-content.ts` **và tăng `CHAT_POLICY_VERSION`** (dạng ngày phát hành).
Hệ quả cố ý: mọi PH phải bấm đồng ý lại, bản ghi cũ giữ nguyên làm bằng chứng, và cột
"Đồng ý quy định" trên dashboard reset.

⚠️ `policy-content.ts` (nội dung, client-safe) tách khỏi `policy.ts` (chạm DB) vì màn
chính sách là Client Component — gộp lại là kéo Prisma vào bundle client.

## 3. AC3 — việc vận hành (KHÔNG code)

Trước ngày mở cho PH, mỗi lớp pilot phải có **≥1 thông báo (ANNOUNCEMENT) chào mừng** do
GV đăng. Không có thông báo thì lớp đó **không có mẫu số** cho chỉ số 48h — dashboard hiện
"chưa có thông báo" chứ không tính thành 0%.

## 4. AC4 — dashboard `/admin/bao-cao/chat-pilot`

Gate `chat:admin` (chỉ SUPER_ADMIN). Đặt ở `bao-cao/` vì segment đó đã có trong
`ADMIN_ROUTE_SEGMENTS` — không phải sửa route policy, và bản chất đây là báo cáo.
Cách ly cơ sở: lọc **tay** theo `getVisibleCenterIds(actor)` trong `lib/chat/pilot-stats.ts`
(`Conversation` ∈ SCOPE_EXEMPT còn `Class` ∈ SCOPED_MODELS — đi `scopedDb` là mất nửa dữ liệu).

Định nghĩa từng cột (khớp `lib/chat/pilot-stats.test.ts`):

- **Mẫu số** = phụ huynh đang là thành viên nhóm, xác định bằng `isAnnouncementRecipient`
  — **dùng chung** với màn "đã đọc x/N" của GV. GV/trợ giảng/QLCS không tính.
- **Đã kích hoạt** = `accountStatus = ACTIVE`. ⚠️ Tài khoản tạo trước cụm cấp-TK-qua-OTP
  vốn đã ACTIVE ⇒ cột này có thể cao hơn thực tế. Cột **Đã đăng nhập** (`lastLoginAt`) mới
  là tín hiệu chắc chắn.
- **Thông báo đầu** = ANNOUNCEMENT sớm nhất **còn hiển thị** (bỏ tin đã gỡ).
- **Đọc ≤48h** = `AnnouncementRead.readAt − Message.createdAt ≤ 48h`, chỉ đếm PH. Chưa đủ
  48h thì gắn nhãn "đang trong 48h" — con số còn chạy, đừng đem đi kết luận cổng Đợt 2.
- Hàng tổng **cộng dồn**, không trung bình-của-trung-bình; lớp chưa có thông báo bị loại
  khỏi mẫu số của chỉ số đọc.

Trang **không hiển thị một chữ nội dung nào** và không select `name/phone/email` của PH —
muốn biết *ai* chưa đọc là việc của GV trong nhóm (`getAnnouncementReadStats`).
