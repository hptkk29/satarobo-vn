# 04 — UI Public / Portal / Auth

## Host routing (`lib/auth/route-policy.ts` → `decideRoute`)
| Host | Ai vào | Lọt sai host |
|---|---|---|
| `satarobo.vn` (public) | Ai cũng | `/admin`,`/portal` → redirect đúng host |
| `admin.satarobo.vn` | 7 role staff (TRỪ PARENT) | PARENT → 307 portal |
| `hocvien.satarobo.vn` | PARENT | staff → 307 admin |

## 1. Public site (`app/(public)/`) — ~20 route
Layout: Header + Footer + FloatingCTA (desktop) + StickyMobileCTA (mobile) + CampaignPopup + CookieConsent. SEO: canonical + breadcrumb + JSON-LD.

| Route | Nội dung |
|---|---|
| `/` | Trang chủ — 2 khoá chính, JSON-LD Organization/WebSite. ISR 60s |
| `/khoa-hoc` | DS khoá — bảng so sánh, 6 cam kết. ItemList JSON-LD |
| `/khoa-hoc/[slug]` | Chi tiết khoá (27+ slug, SSG + ISR 60s) — sections từ DB (mission/outcomes/highlights), Course JSON-LD |
| `/khoa-hoc/{laptrinhrobot,luyenthirobosim}` | Landing **legacy** (UI cũ, SEO migration) |
| `/tin-tuc` · `/[slug]` · `/category/[slug]` · `/tag/[slug]` | Blog (dynamic + ISR 60s) |
| `/vinh-danh` · `/[slug]` · `/tat-ca` | Vinh danh nhân sự (CEO quote, 4 category, timeline) |
| `/ve-chung-toi` · `/tuyen-dung`(+`/[slug]`) · `/hoc-cu` | Brand · tuyển dụng (JobPosting JSON-LD) · học cụ ZMROBO |
| `/lien-he` | **FORM LEAD chính** (ContactForm) + 2 cơ sở + LocalBusiness JSON-LD |
| `/chinh-sach-bao-mat` · `/chinh-sach-hoan-tra` · `/dieu-khoan-su-dung` · `/quyen-rieng-tu` | Pháp lý + Privacy Center (consent toggle, NĐ 13/2023) |

**Form lead** xuất hiện ở: `/lien-he` (chính) + CTA từ course detail (`?courseSlug=`) + homepage/khoa-hoc/FloatingCTA/StickyMobileCTA (`?free-trial=true`). Submit → `POST /api/leads` → Lead + enqueue email.

## 2. Portal phụ huynh (`app/(portal)/portal/`) — ~19 route
Layout: Header (Logo + **SiteSwitcher** chọn con + Logout) + Sidebar. Defense: `force-dynamic`, `requireActiveStudent()`, `robots: noindex`.

| Route | Nội dung |
|---|---|
| `/portal` | Home: greeting + con đang xem + 3 stat (buổi tới/bài tập/bài thi) + lớp đang học |
| `/ho-so` · `/ho-so-con` | Hồ sơ PH (sửa tên) · hồ sơ con (read + năng lực robotics) |
| `/lich-hoc` | Tiến độ + buổi sắp tới/đã qua (nhãn dời/lễ/bù) |
| `/bai-giang` · `/bai-tap`(+`/[assignmentId]`) · `/bai-thi`(+`/[examId]`) | Bài giảng · nộp bài (text/file, LATE nếu quá hạn) · làm trắc nghiệm (timer, auto-submit) |
| `/hinh-anh` | **Gate consent** — chỉ ảnh APPROVED + tag con + consent GRANTED; thu hồi → ẩn |
| `/nhan-xet` · `/danh-gia` · `/ket-qua` · `/hoc-ba` | Nhận xét GV · đánh giá năng lực · kết quả tổng hợp · học bạ (print/PDF) |
| `/hoc-phi` | Học phí + lịch sử thanh toán + công nợ |
| `/yeu-cau` | Gửi yêu cầu (báo vắng/bù/chuyển/bảo lưu) → ParentRequest PENDING; hủy khi PENDING |
| `/thong-bao` · `/satacoin` · `/khao-sat` | Thông báo · điểm thưởng · khảo sát NPS |

**Cơ chế "site con" (R4 — không lộ studentId):**
```
PH login (PARENT) → getPortalContext() lấy children (parentUserId)
SiteSwitcher chọn con → setActiveSite(studentId):
   assertOwnsStudent(studentId) → makeActiveSiteToken (HMAC) → cookie portal_active_site (httpOnly, signed, 30d)
Mỗi page: requireActiveStudent() → verify cookie + studentId ∈ children → redirect /login nếu fail
```
→ URL sạch (không studentId); cookie tamper sang con người khác bị từ chối (verify trong children). Xem [06](06-audit-lo-hong.md) (IDOR portal ✅).

## 3. Auth (`app/(auth)/`)
- `/login` — Credentials (email + password). callbackUrl sanitized (chống open-redirect). Banner: session hết hạn / tài khoản vô hiệu (tokenVersion/deactivated).
- `/kich-hoat` — **setup tài khoản phụ huynh (3 bước):**
  1. Nhập email → `requestActivationOtp` (gửi OTP; email không tồn tại/đã ACTIVE → trả generic chống dò; cooldown 60s).
  2. Nhập OTP + mật khẩu (≥8) → `activateAccount`: verify OTP → bcrypt hash → `accountStatus=ACTIVE` + `emailVerified` → consume OTP → email welcome + audit.
  3. Done → `/login`.

## SEO & ISR tóm tắt
- Mỗi public page: `metadata` (title/description/canonical/openGraph) + breadcrumb JSON-LD.
- Dynamic `[slug]`: `generateMetadata` + `generateStaticParams` + `revalidate` (60s list, course/news/honor/job).
- Portal/auth: `robots: noindex`. Ảnh: `next/image` (trừ admin thumbnail).
- Brand: cam `#F97316`, tím `#7C3AED`. Mobile-first 375px.
