# Design — Sata Robo Admin

<!-- impeccable:design-schema 1 -->

> Phạm vi: **trang admin** (`app/(admin)/admin/**`) và site giáo viên (`app/(teacher)/**`).
> Site public `satarobo.vn` **KHÔNG** theo file này — nó là surface Persuade, giữ nguyên.
> Chốt 11/08/2026. Mode: **Operate** — người dùng đến để hoàn thành một việc, không để bị thuyết phục.

---

## 0. Vì sao file này tồn tại

Đo được trong repo ngày 11/08/2026, trước khi sửa:

| Số đo | Giá trị |
|---|---|
| Class màu hardcode trong `app/(admin)` + `components/admin` | `orange-500` ×227 · `orange-600` ×149 · `amber-700` ×107 · `purple-700` ×80 · `amber-100` ×72 · `purple-500` ×29 … |
| Token `--primary` khai là | **cam** `#F97316` |
| Nút CTA chính thực tế render | **tím** `bg-[#7C3AED]` hardcode (`students/page.tsx:365`) |
| Số bảng màu "chính thức" đang cùng tồn tại | **3** |

Tức là **không có kỷ luật token nào cả** — mỗi màn tự chọn màu. Đó là nguyên nhân gốc của "giao diện xấu", chứ không phải thiếu hiệu ứng đẹp. Sửa từng màn mà không chốt token là sơn lại lần thứ tư.

## 1. Màu — chốt cứng, cấm đề xuất bảng mới

Chủ dự án chốt 11/08/2026:

| Vai trò | Mã | Dùng ở đâu |
|---|---|---|
| `primary` | `#610B8A` | Nút hành động chính, nav active, focus ring |
| `primary-dark` | `#4E237D` | Trạng thái hover/pressed của primary |
| `accent` | `#FF8F2D` | CTA phụ, điểm nhấn thương hiệu, biểu tượng |
| `accent-dark` | `#F8903B` | Hover của accent |

**Bảng này KHÔNG phải màu tuỳ tiện** — `--parent: #610C8D` và `--student: #FD8F2D` đã có sẵn trong `globals.css` từ đợt merge SataUI cho portal phụ huynh, lệch vài đơn vị hex. Đợt này thống nhất về đúng 4 mã trên.

**Màu ngữ nghĩa là thang RIÊNG, không mượn màu thương hiệu.** Đây là lỗi cũ: trạng thái "Đang học / Đã duyệt" từng mượn tone brand, làm cam vừa nghĩa "thương hiệu" vừa nghĩa "ổn".

| Ngữ nghĩa | Mã | Nghĩa |
|---|---|---|
| `success` | `#10B981` | Đang học · Đã duyệt · Có mặt · Hoàn tất |
| `warning` | `#F59E0B` | Chờ xử lý · Sắp hết hạn |
| `danger` | `#EF4444` | Quá hạn · Từ chối · Đã huỷ |
| `info` | `#3B82F6` | Thông tin trung tính · Đã hoàn thành khoá |
| `muted` | xám | Nháp · Tạm nghỉ · Không áp dụng |

**Luật:** cấm hex rời trong component. Mọi màu đi qua token. Vi phạm dễ thấy nhất cần truy: `bg-[#...]`, `text-[#...]`.

### Phạm vi token

Token admin khai trong `.admin-scope` (khung `app/(admin)/admin/layout.tsx` đã có sẵn class này), theo đúng tiền lệ `.portal-v2`. **Không** đổi `--primary` toàn cục — làm thế là lật màu nút của cả site public, vốn ngoài phạm vi.

## 2. Mật độ — admin là giao diện dữ liệu dày

Người dùng ngồi 6–8 tiếng và cần thấy nhiều dòng cùng lúc.

| Thứ | Giá trị | Lý do |
|---|---|---|
| Chiều cao dòng bảng | **44px** (`py-3.5` + `text-sm`) | Trước khi sửa: 65–71px và **không đều nhau** |
| Padding ô | `px-5 py-3.5` | |
| Header bảng | `text-xs font-semibold uppercase tracking-wide` màu muted | |
| **`whitespace-nowrap` trên `th` VÀ `td`** | bắt buộc | Đây là thứ duy nhất chặn chiều cao dòng nhảy loạn |
| Bo góc thẻ | `rounded-xl` (0.75rem) | |
| Khoảng cách khối | 20–24px (`gap-5`/`gap-6`) | |

## 3. Tiếng Việt dài là mặc định, không phải ca biên

Ba lỗi đã chụp được, và luật sinh ra từ chúng:

| Lỗi thật | Luật |
|---|---|
| `955.563.000đ` **tràn ra ngoài thẻ** KPI | Số liệu `text-xl`, KHÔNG `text-4xl`. Thẻ phải có `min-w-0`, nhãn `truncate` |
| Badge "Đang học" **xuống 2 dòng** trong pill | Pill luôn `inline-flex whitespace-nowrap` |
| Header cột "TRẠNG THÁI"/"HÀNH ĐỘNG" xuống 2 dòng | `whitespace-nowrap` trên `th` |

Mọi ô phải chịu được: tên có dấu và dài (`Nguyễn Bảo Minh — MAKEUP`), tên cơ sở dài (`Trụ sở chính - Nguyễn Hữu Thọ`), tiền 9 chữ số (`955.563.000đ`).

## 4. Chuyển động — càng ít càng tốt

- 150–200ms · `ease-out` khi vào · `ease-in` khi ra.
- **Cấm** bounce, elastic, spring.
- **Cấm** animate bảng và danh sách dài.
- Admin chỉ dùng CSS transition. Framer Motion và Magic UI **bị ESLint chặn** ở admin — đó là luật của repo, không phải sở thích.
- Thước đo đúng: sau một đợt, **số lượng animation phải GIẢM**.

## 5. Bốn trạng thái, không phải một

Mọi màn phải có đủ. Trạng thái thứ tư là hạng nhất ở hệ này vì phân quyền theo module × cơ sở — người dùng gặp nó hằng ngày.

| Trạng thái | Yêu cầu |
|---|---|
| Đang tải | Skeleton đúng hình dạng nội dung thật, không phải spinner giữa màn |
| Rỗng | Nói rõ *vì sao* rỗng và *làm gì tiếp*, kèm hành động chính |
| Lỗi | Câu tiếng Việt người thường đọc được + đường thử lại |
| **Không có quyền** | Nói rõ **thiếu quyền nào** và **hỏi ai** — không phải 403 trần |

## 6. Bản tham chiếu hình thức: `nhhatvy/TeachUI`

TeachUI là bản dựng lại UI của **chính** `admin.satarobo.vn` bằng dữ liệu mock. Dùng làm chuẩn cho **hình thức và cấu trúc component**.

⚠️ **KHÔNG lấy màu của nó.** README TeachUI tuyên bố *"Tone tím đã được loại bỏ hoàn toàn"* và dùng cam `#F97316` làm primary — trái với quyết định 11/08 ở §1. Lấy **form**, không lấy **màu**.

Component đáng port: `stat-card` · `status-pill` · `page-header` · `list-toolbar` · `empty-state` · `table` (mật độ) · `skeletons`.

## 7. Cấm

- Gradient trong admin (kể cả badge). Gradient thuộc site public.
- Bóng đổ nặng. Tối đa `shadow-sm`; hover có thể lên `shadow-md`.
- Chữ dưới 12px cho nội dung đọc được (chỉ metadata phụ mới `text-[11px]`).
- Icon-only button không có `aria-label`.
- Thêm thư viện UI khi shadcn/ui đã có tương đương — chạy `pick-ui-library` trước khi cài bất cứ gì.
- Đổi 4 mã màu ở §1.
