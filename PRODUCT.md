# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Nhân viên nội bộ của Công ty Cổ phần Công nghệ Giáo dục Sata Robo (Đà Nẵng) — trung tâm dạy lập trình robot cho trẻ lớp 1–8. Dùng hệ thống **6–8 tiếng/ngày** như công cụ làm việc chính, không phải khách vãng lai.

Chín vai, mỗi vai một màn hình chủ đạo khác nhau:

| Vai | Việc chính hằng ngày |
|---|---|
| `SUPER_ADMIN` | Cấu hình hệ thống, phân quyền, cây tổ chức |
| `CENTER_MANAGER` | Điều hành một cơ sở: lớp, lịch, nhân sự, công nợ |
| `SALES_CSM` | Phễu lead L1→L2→L3, xếp học thử, chốt ghi danh |
| `TEACHER` | Điểm danh, nhận xét buổi học, giao bài, học bạ |
| `TRAINING` | Toàn bộ LMS: chương trình, học liệu, SCORM |
| `HR` | Hồ sơ nhân sự, chấm công, đơn từ |
| `ACCOUNTANT` | Thu học phí, đối soát ngân hàng, công nợ |
| `MARKETING` | Nội dung site public, nguồn lead, affiliate |
| `PARENT` | Cổng phụ huynh: học bạ, lịch, tin nhắn, học phí (khác surface) |

Ngoài ra có **4 site / 4 domain** chạy chung một app Next.js: public `satarobo.vn`, admin `admin.satarobo.vn`, portal phụ huynh `hocvien.satarobo.vn`, site giáo viên `giaovien.satarobo.vn`.

## Product Purpose

Thay thế việc điều hành bằng Excel + Zalo + MISA bằng một hệ thống duy nhất, và là nền dữ liệu để mở rộng theo mô hình **nhượng quyền** (đơn vị không thuộc sở hữu nhưng nằm trong cây vận hành).

Thành công = một người làm được việc trước đây cần ba người và bốn công cụ, và mở một cơ sở mới là **thêm dữ liệu chứ không sửa code**.

## Positioning

Đối chuẩn thật là **MISA AMIS** (đội đã khảo sát trực tiếp 27/07/2026), không phải một SaaS giáo dục nào. Ba thứ hệ này có mà AMIS không có:

1. **Trục `relationshipType`** — nhượng quyền là đơn vị *không thuộc sở hữu* nhưng *trong cây vận hành*. AMIS chỉ mô hình hoá được "chi nhánh trong một pháp nhân".
2. **Kế thừa danh mục có kiểm soát** — `LOCKED` / `BOUNDED` / `OVERRIDABLE` / `LOCAL_ONLY`, thay vì nhị phân dùng-chung/tách-hoàn-toàn.
3. **Hợp đồng nhượng quyền là thực thể có vòng đời** — cắt quyền bên nhận bằng **một thao tác** đổi trạng thái.

## Operating Context

- **Tổ chức thật:** HO (Hội sở) → Khối Đà Nẵng → CS1 (211 Nguyễn Hữu Thọ) · CS2 (114 Hoàng Diệu).
- **Nhịp làm việc:** ca dạy chiều/tối và cuối tuần; sale làm giờ hành chính; kế toán chốt sổ theo tháng.
- **Thiết bị:** desktop là chính (nhân viên ngồi quầy). Giáo viên điểm danh **trên điện thoại ngay trong lớp** — đó là ca mobile thật duy nhất và nó xảy ra khi tay đang bận.
- **Dữ liệu dày:** 90 học viên, 56 lead, 102 ghi danh còn nợ, hàng nghìn buổi học. Màn hình nào cũng là bảng, bộ lọc, trạng thái.
- **Tiếng Việt là ngôn ngữ duy nhất.** Tên người có dấu và dài ("Nguyễn Bảo Minh — MAKEUP"), tên cơ sở dài ("Trụ sở chính - Nguyễn Hữu Thọ"), tiền tệ dài (`955.563.000đ`).

## Capabilities and Constraints

**Stack cố định (FROZEN):** Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 · shadcn/ui · Framer Motion · Prisma + Supabase · Vercel (region `hnd1`).

**Ràng buộc kiến trúc chạm tới UI:**

- **Server-first.** Mặc định Server Component; `'use client'` chỉ khi cần state/handler. Data fetch trong RSC, mutation qua Server Action.
- **Phân tách thư viện UI (ESLint chặn cứng):** admin = shadcn/ui + Recharts. **Magic UI và Framer Motion bị chặn ở admin** — chỉ dùng cho site public.
- **Ngân sách hiệu năng:** admin ≥ 90 Lighthouse mobile, animation admin = CSS transition, không hơn.
- **Mọi màn phải có 4 trạng thái**, không phải 1: loading · rỗng · lỗi · **không có quyền**. Trạng thái thứ tư là bắt buộc vì phân quyền theo từng module và từng cơ sở — người dùng gặp nó hằng ngày, không phải ca hiếm.
- **Không thêm dependency** khi shadcn/ui đã có tương đương.

**Đang dở:** đợt tái cấu trúc "Nền Hệ thống" 6 pha (P0/P1 đã xong 11/08/2026, còn P2–P5). Đợt merge UI từ repo `TeachUI` đang chờ.

## Brand Commitments

- Tên: **Sata Robo**. CEO Hồ Đắc Phúc.
- Hai khoá chủ lực: **Lập trình Robot** (offline K-9) và **Luyện thi RoboSim**.
- Giọng: ngắn, trung tính, tiếng Việt. **Không marketing-speak trong admin.**
- ⚠️ **Bảng màu đang có BA phiên bản mâu thuẫn** — chưa chốt, xem `## Evidence on Hand`. Đây là quyết định của chủ dự án, không phải của agent.

## Evidence on Hand

**Có thật, đo được trong repo (11/08/2026):**

- Token khai trong `app/globals.css`: cam `#F97316`, tím `#7C3AED` (+ `#A855F7`, `#6B21A8`, `#EA580C`).
- `--primary` = **cam**, nhưng CTA chính lại hardcode `bg-[#7C3AED]` **tím** (`app/(admin)/admin/students/page.tsx:365`). Token và thực tế đang nói ngược nhau.
- Đếm class màu hardcode trong `app/(admin)` + `components/admin`: `orange-500` ×227 · `orange-600` ×149 · `amber-700` ×107 · `purple-700` ×80 · `amber-100` ×72 · `purple-500` ×29 … Tức **không có kỷ luật token**; mỗi màn tự chọn màu.
- Repo `nhhatvy/TeachUI` (bản dựng lại UI của chính admin.satarobo.vn bằng dữ liệu mock, Next 14 + Tailwind 3): README tuyên bố **"Tone tím đã được loại bỏ hoàn toàn"**, chỉ giữ cam `#f97316`.
- Brief của chủ dự án cho đợt UI này lại khai bộ thứ ba: tím `#610B8A` / `#4E237D`, cam `#FF8F2D` / `#F8903B`.

**Lỗi hiển thị đã chụp được, không phải suy đoán:**

- `955.563.000đ` **tràn ra ngoài thẻ** KPI ở `/dashboard`.
- Badge "Đang học" **xuống 2 dòng** trong pill ở bảng `/students`.
- Chiều cao dòng bảng **65–71px và không đều nhau** (chuẩn admin dày là 40–44px).
- Nút "Áp dụng" chiếm **nguyên một hàng** dưới bộ lọc.

**Không có:** khách hàng tham chiếu công khai, số liệu benchmark, testimonial. Đừng bịa.

## Product Principles

1. **Mật độ thắng khoảng trắng.** Người dùng ngồi 8 tiếng và cần thấy nhiều dòng cùng lúc; đây không phải trang marketing.
2. **Tiếng Việt dài là mặc định, không phải ca biên.** Mọi ô phải chịu được tên có dấu, tên cơ sở dài, và số tiền 9 chữ số.
3. **Trạng thái "không có quyền" là màn hình hạng nhất.** Phân quyền theo module × cơ sở nên người dùng gặp nó thường xuyên.
4. **Một nguồn sự thật cho màu và khoảng cách.** Cấm hex rời trong component — mọi thứ đi qua token, vì đó chính là thứ đã hỏng.
5. **Animation gần như vô hình.** Ở admin, chuyển động tốt là chuyển động không ai để ý.

## Accessibility & Inclusion

- Vùng chạm ≥ 44px trên đường giáo viên điểm danh bằng điện thoại trong lớp.
- Trạng thái không được chỉ mã hoá bằng màu — badge phải có chữ (hiện đã đúng, phải giữ).
- Font phải render đủ dấu tiếng Việt ở mọi trọng lượng.
