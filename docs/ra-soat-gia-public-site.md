# Rà soát giá VNĐ trên Public Site (satarobo.vn) — để duyệt chuyển "Liên hệ"

> **Ngày rà soát:** 30/06/2026 · **Phạm vi:** chỉ public site (`satarobo.vn`) — gồm `app/(public)/**`, `app/(legacy)/**` và mọi component render ra public. **KHÔNG** gồm admin (`admin.satarobo.vn`) và portal phụ huynh (`hocvien.satarobo.vn`).

## Cách dùng file này

Mỗi mục bên dưới là **một nơi đang/sẽ hiển thị số tiền VNĐ** trên public site, có **mã** (vd `HP-1`).

- ❌ **Mục bạn XOÁ khỏi file** → **GIỮ NGUYÊN** số tiền (không đổi).
- ✅ **Mục bạn GIỮ LẠI trong file** → tôi sẽ **đổi sang "Liên hệ"** (hoặc gỡ số tiền theo ghi chú).

Sau khi bạn sửa xong, gửi lại file này, tôi thực thi đúng các mục còn lại.

### Chú thích trạng thái
- 🔴 **ĐANG HIỆN SỐ** — khách thấy số tiền ngay bây giờ (cần xử lý nếu muốn ẩn).
- 🟡 **ẨN/PHỤ** — chỉ trong thẻ meta SEO, `aria-label`, hoặc structured-data (không hiện trên thân trang nhưng vẫn nằm trong mã nguồn / kết quả Google).
- 🟢 **ĐÃ AN TOÀN** — hiện đã là "Liên hệ", liệt kê để bạn biết, **không cần làm gì**.
- ⚪ **CHƯA HIỂN THỊ (dead code)** — mã có giá nhưng chưa được trang nào dùng; chỉ rủi ro tương lai.

### Đề xuất nhanh của tôi
- **NHÓM 1 (Học phí khoá học)** → nên chuyển hết về "Liên hệ" (đúng vấn đề bạn nêu — trang chi tiết như `sata3` vẫn để giá).
- **NHÓM 2 (Tiền khác: quà tặng, giải thưởng, lương, ví dụ pháp lý)** → đây **không phải học phí**, thường là điểm thu hút marketing. **Nếu muốn GIỮ → xoá các mục đó khỏi file.**
- **NHÓM 3 (Nguồn dữ liệu giá)** → sửa kèm theo NHÓM 1 cho sạch.
- **NHÓM 4 (Dead code / đã an toàn)** → tham khảo, phần lớn không cần đụng.

> ⚠️ **Lưu ý quan trọng đã phát hiện:** Lần đổi "Liên hệ" trước đây **chỉ áp dụng cho các component landing cũ** (`Roadmap5Years`, `RegistrationForm` đã hiện "Liên hệ"). Nhưng **trang chi tiết khoá học `/khoa-hoc/[slug]`, bảng so sánh `/khoa-hoc`, và FAQ trang chủ vẫn render số tiền thật** → đó là lý do `sata3` còn để giá.

---

## 📊 Tổng quan

| Nhóm | Số mục | Trạng thái chính |
|---|---|---|
| NHÓM 1 — Học phí khoá học | HP-1 → HP-7 | 🔴 đang hiện số (ưu tiên) |
| NHÓM 2 — Tiền khác (quà/giải thưởng/lương/pháp lý) | K-1 → K-9 | 🔴 đang hiện số (cân nhắc giữ) |
| NHÓM 3 — Nguồn dữ liệu giá (backing data) | N-1 → N-3 | 🔴 nguồn của NHÓM 1 |
| NHÓM 4 — Dead code / đã an toàn | D-1 → D-7 | 🟢/⚪ phần lớn không cần làm |

---

# NHÓM 1 — HỌC PHÍ KHOÁ HỌC (ưu tiên cao)

### [HP-1] 🔴 Trang chi tiết khoá học — KHỐI GIÁ (⬅️ **chính là trang `sata3` bạn nêu**)
- **Trang:** `/khoa-hoc/sata1` … `/khoa-hoc/sata8`, `/khoa-hoc/combo-sata1-sata2` (tất cả 9 trang chi tiết).
- **File:** `app/(public)/khoa-hoc/[slug]/page.tsx` (dòng 64 `formatVnd`, **khối render dòng 183–228**).
- **Đang hiển thị:** giá gạch ngang (listPrice) + **giá lớn màu cam** (giá cuối) + dòng "Tiết kiệm X" + dòng "X/tháng × 12 tháng".
  - VD `sata3`: ~~10.560.000đ~~ → **7.920.000đ** · Tiết kiệm **2.640.000đ** · **660.000đ/tháng × 12 tháng**.
  - VD `sata1`: ~~1.650.000đ~~ → **1.485.000đ** · `sata8`: **2.500.000đ** (giá cố định) · `combo`: ~~4.690.000đ~~ → **3.986.000đ**.
- **Nguồn:** DB `CoursePackage` (nếu admin đã nhập) → fallback bảng hardcode `courses-pricing.ts`.
- **Nếu giữ mục này → tôi đổi:** thay **toàn bộ khối giá** thành **"Liên hệ"** + giữ nút "Đăng ký tư vấn".


### [HP-3] 🔴 Trang chủ — FAQ "Học phí các khoá học bao nhiêu?"
- **Trang:** `/` (mục Câu hỏi thường gặp).
- **File:** `components/home/faq-section.tsx` (mảng `FAQS`, **dòng 40, 44, 45, 46**).
- **Đang hiển thị:**
  - "Học phí **từ 1.485.000đ đến 14.400.000đ**"
  - "Sata1 — Robosim Master: **1.485.000đ**"
  - "Sata7 …: **10.800.000đ** (ưu đãi 25%)"
  - "Combo Sata1 + Sata2: **3.986.000đ** (tiết kiệm **704.000đ**)"
- **Nguồn:** hardcode.
- **Nếu giữ mục này → tôi đổi:** bỏ hết con số, vd "Học phí tuỳ khoá — vui lòng **liên hệ** để nhận bảng giá".

### [HP-5] 🟡 SEO — meta description 9 trang chi tiết khoá có nêu giá
- **Trang:** thẻ `<meta name=description>` + OpenGraph + Twitter của 9 trang `/khoa-hoc/[slug]` (không hiện trên thân trang, **nhưng lộ trong mã nguồn & kết quả Google**).
- **File:** `components/legacy-laptrinhrobot/_data/courses-details.ts` (`metaDescription` dòng 26, 53, 80, 107, 132, 157, 182, 207, 232).
- **Đang hiển thị:** vd "…Ưu đãi còn **1.485.000đ**", "…còn **3.986.000đ** (147.000đ/buổi)", "Giá cố định **2.500.000đ**"…
- **Nếu giữ mục này → tôi đổi:** bỏ số tiền khỏi metaDescription (vd "Ưu đãi học phí — liên hệ tư vấn").

### [HP-6] 🔴 Trang chi tiết — số tiền NHÚNG trong "Điểm nổi bật / Sứ mệnh / Kết quả"
- **Trang:** thân các trang `/khoa-hoc/[slug]` (mục ĐIỂM NỔI BẬT, SỨ MỆNH, SAU KHI HOÀN THÀNH).
- **File:** `components/legacy-laptrinhrobot/_data/courses-details.ts` (highlights 94/123/148/173/198/223/246; mission 85/237; outcomes 90).
- **Đang hiển thị:** vd "Giá ưu đãi: **147.000đ/buổi**", "Chỉ **660.000đ/tháng × 12 tháng**", "Tiết kiệm **704.000đ** so với học riêng", "Giá CỐ ĐỊNH **2.500.000đ**", "HOÀN LẠI ĐỦ **2.500.000đ**".
- **Nếu giữ mục này → tôi đổi:** gỡ số tiền trong câu, xoá các ý liên quan đến hoàn phí (vd "hoàn 100% học phí").

### [HP-7] 🔴 Trang Combo — "Ưu điểm đặc biệt" nêu giá niêm yết/combo
- **Trang:** `/khoa-hoc/combo-sata1-sata2` (mục Ưu điểm đặc biệt).
- **File:** `components/legacy-laptrinhrobot/_data/exam-roadmap.ts` (dòng 103–104), render qua `components/khoa-hoc/exam-detail-sections.tsx`.
- **Đang hiển thị:** "Giá niêm yết **4.690.000đ**", "Giá combo **3.986.000đ**, tiết kiệm **704.000đ**".
- **Nếu giữ mục này → tôi đổi:** gỡ 2 dòng giá (hoặc đổi "Liên hệ").

---

# NHÓM 2 — TIỀN KHÁC (KHÔNG phải học phí — cân nhắc GIỮ)

> Các mục này là **giá trị quà tặng / tiền thưởng / lương / ví dụ minh hoạ**, thường dùng để thu hút. Nếu bạn muốn **giữ nguyên** → **xoá mục đó khỏi file**.


### [K-4] 🔴 Landing Lập trình Robot — Ưu đãi giới thiệu bạn
- **Trang:** `/khoa-hoc/laptrinhrobot` (section "Ưu đãi").
- **File:** `components/legacy-laptrinhrobot/_data/promotions.ts` (70), render `SpecialOfferCountdown.tsx`.
- **Đang hiển thị:** "Người giới thiệu nhận **300.000đ** tiền mặt. Người được giới thiệu giảm thêm **300.000đ** học phí."
- **Nếu giữ mục này → tôi đổi:** "nhận thưởng tiền mặt / giảm thêm học phí" (bỏ số).


### [K-9] 🔴 Trang Chính sách hoàn trả — ví dụ tính tiền
- **Trang:** `/chinh-sach-hoan-tra`.
- **File:** `content/legal/chinh-sach-hoan-tra.md` (dòng 35).
- **Đang hiển thị:** "Ví dụ: Khoá học 20 buổi, học phí **4.000.000 VND**. Rút sau buổi 4 (20%) → hoàn 70% × 4.000.000 = **2.800.000 VND**."
- **Nếu giữ mục này → tôi đổi:** đổi ví dụ sang số trung tính / diễn đạt không nêu số tiền (giữ bảng % hoàn).

---

# NHÓM 3 — NGUỒN DỮ LIỆU GIÁ (sửa kèm NHÓM 1)

> Đây là nơi **chứa con số** mà NHÓM 1 đọc ra. Thường tôi sẽ sửa **nơi render** (NHÓM 1) là đủ để ẩn giá; nhưng nếu muốn xoá sạch số khỏi repo / lead thì xử lý thêm các mục này.

### [N-1] 🔴 Bảng giá gốc hardcode (fallback cho trang chi tiết)
- **File:** `components/legacy-laptrinhrobot/_data/courses-pricing.ts` (dòng 65–79).
- **Chứa:** listPrice / earlyBirdPrice / comboPrice / fixedPrice / savedAmount / installmentOutside + chuỗi `value` ("…Giá ưu đãi 1.485.000đ"). Đầy đủ 9 khoá:
  - Sata1 1.650.000→1.485.000 · Sata2 3.040.000→2.736.000 · Combo 4.690.000→3.986.000 (saved 704.000) · Sata8 cố định 2.500.000
  - Sata3 10.560.000→7.920.000 (góp 660.000) · Sata4 11.520.000→8.640.000 (720.000) · Sata5 12.480.000→9.360.000 (780.000) · Sata6 13.440.000→10.080.000 (840.000) · Sata7 14.400.000→10.800.000 (900.000)
- **Ghi chú:** chuỗi `value` còn được gửi kèm lên lead qua `<option>` trong form đăng ký legacy. Sửa nơi render [HP-1] là khách không thấy số; muốn sạch hẳn thì gỡ số trong file này.

### [N-2] 🔴 Giá trong DB `CoursePackage` + script seed
- **File schema:** `prisma/schema.prisma` (`CoursePackage.priceOriginal / priceEarlyBird / priceMember`, dòng ~1677–1694).
- **File seed (chạy tay):** `scripts/seed-course-packages.ts` — seed giá thật cho các gói published (vd Sata1 2.400.000→1.800.000, Sata3 10.560.000→7.920.000, Combo 5.440.000→3.808.000…).
- **Ghi chú:** trang chi tiết [HP-1] **ưu tiên giá DB này** (nếu đã chạy script), nếu không thì rơi về [N-1]. **Đặt `priceOriginal/priceEarlyBird = null` KHÔNG đủ để hiện "Liên hệ"** vì code sẽ fallback sang số hardcode → **bắt buộc sửa khối render [HP-1]**. `priceMember` không hiển thị public.

### [N-3] 🟢 Giá hiển thị trên card `/khoa-hoc` (DB `Course.priceDisplay`)
- **Trang:** `/khoa-hoc` (card mỗi khoá, dòng 268–272).
- **File:** `prisma/schema.prisma` (`Course.priceDisplay`, default ở schema) + seed `prisma/seed.ts` (116, 140).
- **Hiện tại:** đã là **"Liên hệ tư vấn"** cho cả 2 khoá public → 🟢 **không lộ số**.
- **Rủi ro:** đây là ô text tự do → admin có thể gõ "2.400.000đ". **Nếu giữ mục này → tôi:** chặn cứng (bỏ render giá trên card hoặc validate admin) để không bao giờ lộ số.

---

# NHÓM 4 — DEAD CODE / ĐÃ AN TOÀN (tham khảo, phần lớn không cần làm)

### [D-1] 🟢 Trang Học cụ `/hoc-cu` — giá bộ kit
- **File:** `app/(public)/hoc-cu/page.tsx` (239) đọc `ZMRoboKit.priceDisplay` (DB).
- **Hiện tại:** seed = **"Liên hệ tư vấn"** cho cả 3 kit → 🟢 không lộ số. (Rủi ro giống [N-3]: field tự do.)

### [D-2] ⚪ `lib/data/products.ts` — 8 giá học cụ hardcode (KHÔNG dùng)
- **Chứa:** 1.200.000 / 2.500.000 / 4.500.000 / 3.800.000 / 5.200.000 / 350.000 / 250.000 / 180.000.
- **Trạng thái:** **không trang nào import** → chưa lộ ra public. Đề xuất: xoá file/field nếu không dùng, hoặc bỏ qua.

### [D-3] ⚪ JSON-LD `productJsonLd` / `jobPostingJsonLd` (structured-data, chưa gọi)
- **File:** `lib/seo/jsonld.ts` (productJsonLd 131–146 có `offers.price`; jobPostingJsonLd 210–273 có `baseSalary` VND).
- **Trạng thái:** **đã định nghĩa nhưng chưa trang nào gọi** → giá/lương **chưa lộ** trong structured-data. Nếu sau này bật cho SEO thì phải xử lý đồng bộ.

### [D-5] ⚪ `product-page-template` + `design-system/cards/course-card` (render `Course.priceDisplay`)
- **File:** `components/client/product-page-template.tsx` (219) → `components/design-system/cards/course-card.tsx` (124–133).
- **Trạng thái:** không route public nào dùng template này → chưa lộ. Nếu bật lại sẽ hiện `Course.priceDisplay` (hiện đã "Liên hệ").

### [D-6] ⚪ `design-system/cards/job-card.tsx` — lương "8-15 triệu"
- **Trạng thái:** chỉ dùng ở trang **preview admin** (`/admin/design-system-preview`), không public.

### [D-7] 🟢 Landing cũ ĐÃ chuyển "Liên hệ" (việc lần trước đã làm)
- `components/legacy-laptrinhrobot/Roadmap5Years.tsx` (card lộ trình 5 năm) → đã hiện **"Liên hệ"**.
- `components/legacy-laptrinhrobot/RegistrationForm.tsx` (ô chi tiết khoá khi chọn) → đã hiện **"Học phí / Giá combo / Giá cố định: Liên hệ"**.
- *(Liệt kê để bạn biết phần này đã xong — không cần làm lại.)*

---

## Phụ lục — những thứ KHÔNG tính là "giá" (đã loại, không đưa vào danh sách)
- Số điện thoại / hotline, mã số thuế, năm (2026).
- Số đếm: "2.000+ phụ huynh", "48 buổi", "12 tháng", sĩ số "≤12 học viên", "300+ patents".
- Phần trăm đơn thuần không kèm số tiền: "GIẢM 45%", "học bổng đến 50%", "EB 30%", "ưu đãi 25%", "Tiết kiệm 15%".
- Điểm thi (781/800), thông số kỹ thuật (4000mAh, 1.5 m/s).
- Sự kiện analytics `currency:"VND", value:0` trong `consult-modal.tsx` (không hiển thị, value = 0).
