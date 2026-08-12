# PRD — Nền Hệ thống (System Kernel) tái cấu trúc satarobo

> Ngày lập: 08/08/2026 · Trạng thái: DRAFT v0.1 · Nguồn: BA 08/08 (00-BA-module-he-thong.md)
> Skill: pm-execution:create-prd (8 mục)

---

## 1. Tóm tắt

Xây lõi "Thiết lập › Hệ thống" cho satarobo theo mô hình đã khảo sát từ MISA AMIS: cây tổ chức 3 tầng làm gốc phân quyền, vai trò gắn vị trí, phạm vi dữ liệu 4 mức là trục riêng, registry quyền tập trung — cộng 3 thứ MISA không có: trục quan hệ nhượng quyền, kế thừa danh mục có kiểm soát, hợp đồng nhượng quyền có vòng đời. Lõi này là nền để mọi nghiệp vụ giáo dục cắm vào và là điều kiện để cắt MISA (trừ Kế toán) theo quyết định 05/08.

## 2. Đầu mối

| Người | Vai trò | Ghi chú |
|---|---|---|
| Dev | Product owner / BA / quyết định cuối | Duyệt mọi cổng pha |
| Kiệt | Dev duy nhất, IAM/RolePermission owner | Toàn bộ code; là ràng buộc năng lực chính |
| Claude Code | Agent thi công | Làm theo README bàn giao, một story mỗi phiên |

## 3. Bối cảnh

- Cơ cấu thật đã đổi thành 3 tầng (HO → khối tỉnh/TP → cơ sở) nhưng hệ đang chạy chỉ có `centerId` phẳng — không biểu diễn nổi khối vùng, không mô hình hoá được giáo viên biên chế HO tác nghiệp ở cơ sở.
- Định hướng nhượng quyền đã chốt: từ công ty mẹ phải sinh được đơn vị con dễ dàng, phân quyền tới từng đơn vị/nhân viên/vai trò/module nhỏ nhất.
- Quyết định 05/08: bỏ MISA, chỉ giữ Kế toán (+ Tiền lương/BHXH/Thuế TNCN). Văn phòng số xây lại trong satarobo trên nền này. Chat là module đầu tiên cắm vào — đang code, dùng adapter `can()` mỏng chờ nền.
- Vì sao bây giờ: mỗi module mới viết trước khi có nền là một lần refactor sau này. Chat đã bị ràng bằng điều khoản adapter; module thứ hai (Quy trình/Công việc — cần cho việc cắt MISA) không nên khởi công khi chưa có nền.

## 4. Mục tiêu

**Mục tiêu:** một lõi Hệ thống duy nhất mà mọi module nghiệp vụ dùng chung — không module nào tự chế cơ chế quyền riêng — và mô hình nhượng quyền vận hành được về mặt dữ liệu lẫn pháp lý.

**Key Results (đo tại thời điểm đóng P5):**

| KR | Số đo | Đích |
|---|---|---|
| KR1 | Thời gian dựng một cơ sở nhượng quyền mới từ `UnitTemplate` | ≤ 30 phút, một wizard |
| KR2 | Số thao tác để cắt toàn bộ quyền dẫn xuất khi chấm dứt hợp đồng | = 1 (đổi trạng thái hợp đồng) |
| KR3 | Số điểm kiểm tra quyền nằm ngoài `can()` trong codebase | = 0 (kiểm bằng lint rule) |
| KR4 | Độ phủ test ma trận quyền | 4 dataScope × 3 relationshipType × DENY, 100% chạy CI |
| KR5 | Khác biệt chưa giải thích trong log shadow-compare trước cutover P4 | = 0 trong ≥ 7 ngày liên tục |

## 5. Phân khúc sử dụng

Không phải khách hàng ngoài — người dùng của lõi là chính tổ chức:

| Phân khúc | Việc cần làm (job) | Ràng buộc |
|---|---|---|
| Admin HO | Dựng đơn vị, gán vai trò, cấp/cắt quyền franchise | Chưa tới 20 người dùng hệ thống hiện tại; thao tác phải một người làm được |
| Đội Đào tạo HO | Xuất bản chương trình, khoá nội dung, mở theo buổi | Nội dung là tài sản thương hiệu, LOCKED tuyệt đối |
| Quản lý cơ sở / vùng | Xem dữ liệu trong phạm vi đơn vị mình và cấp dưới | Không xem được nội dung chương trình, chỉ danh sách |
| Giáo viên (biên chế HO, tác nghiệp cơ sở) | Vào đúng lớp mình dạy ở đúng cơ sở được điều đến | Chuỗi 4 điều kiện xem nội dung buổi |
| Bên nhận nhượng quyền (tương lai) | Vận hành cơ sở với chương trình được cấp phép | Mọi quyền dẫn xuất từ hợp đồng, HO chỉ thấy tài chính tổng hợp + khoản tính phí |
| Module nghiệp vụ (chat, lớp học, học phí...) | Gọi `can()` và registry, không tự chế | Hợp đồng adapter đã ghi cho chat |

## 6. Giá trị

- **Tránh đau:** hết cảnh sửa quyền tay từng người khi nhân sự đổi chỗ; hết refactor mỗi lần thêm module; hết rủi ro pháp lý nhìn thấy tài chính franchise vượt phạm vi.
- **Được gì:** mở đơn vị mới bằng wizard thay vì một tuần dựng tay; cắt franchise một thao tác; nền sẵn để thay dần Văn phòng số của MISA.
- **Hơn đối chuẩn (chính là MISA) ở đâu:** MISA chỉ có nhị phân dùng-chung/tách-hoàn-toàn — satarobo có kế thừa + ghi đè trong biên độ (`LOCKED/BOUNDED/OVERRIDABLE/LOCAL_ONLY`), và có trục `relationshipType` cho đơn vị không thuộc sở hữu.

## 7. Giải pháp

### 7.1 Luồng chính (mô tả, chưa có thiết kế UI — sẽ vẽ khi vào từng story)

1. **Wizard mở đơn vị:** chọn `UnitTemplate` → nhập thông tin pháp nhân → hệ sinh phòng ban, vị trí, bộ vai trò, tham chiếu danh mục → đơn vị ACTIVE.
2. **Điều giáo viên:** admin thêm `WorkScope` cho assignment → giáo viên thấy lớp ở cơ sở mới, quyền không đổi.
3. **Cắt franchise:** đổi hợp đồng sang TERMINATED → mọi grant `derivedFrom` tắt ngay, GRACE giữ quyền đọc học viên của họ.
4. **Module đăng ký quyền:** file khai báo `PermissionDescriptor` của module được nạp vào registry lúc deploy.

### 7.2 Tính năng chính (theo pha)

| Pha | Tính năng | Ghi chú |
|---|---|---|
| P0 | Registry quyền · hàm `can()` · **UserGroup** (chốt Q1) · khung test ma trận | Chỉ thêm, không đụng PROD |
| P1 | `OrgUnit` (path, unitType, relationshipType) · `LegalEntity` · backfill `centerId→orgUnitId` song song | Migration lớn nhất |
| P2 | `Position` · `Assignment` · `WorkScope` · **`reportsToPositionId`** (chốt Q2) | Backfill từ bảng nhân sự |
| P3 | Resolver dataScope 4 mức chạy **shadow** | Chỉ ghi log |
| P4 | Cutover — resolver chặn thật, gỡ `centerId` | Cổng: KR5 |
| P5 | `FranchiseContract` · `CatalogItem` (4 chính sách ghi đè) · `UnitTemplate` wizard | Tính năng mới thuần |

### 7.3 Công nghệ

Giữ nguyên stack: Next.js App Router + Server Actions, Prisma, Supabase Postgres, Vercel. `path` materialized-path có index prefix cho `UNIT_AND_BELOW`. Không microservice — quyết định 26/07 vẫn đứng.

### 7.4 Giả định (chưa kiểm chứng — gắn vào Pre-Mortem)

- A1. Điều khoản adapter `can()` đã/sẽ được ghi vào CLAUDE.md đợt chat trước khi chat viết Server Action có kiểm quyền.
- A2. Kiệt rảnh khỏi đợt chat trước khi P1 khởi công (không chạy song song).
- A3. Backfill `centerId→orgUnitId` phủ được 100% bản ghi hiện có (không có centerId mồ côi).
- A4. Dữ liệu nhân sự hiện tại đủ để suy ra Position/Assignment ban đầu (26 hồ sơ đã nhập Word trước đó là nguồn đối chiếu).
- A5. Seam kế toán: satarobo chốt bảng công + doanh thu tháng → đẩy MISA; định dạng file trao đổi chưa chốt.

## 8. Phát hành

- **Ước lượng tương đối:** P0 ≈ 1 tuần · P1 ≈ 1,5–2 tuần · P2 ≈ 1–1,5 tuần · P3 ≈ 1 tuần chạy nền + quan sát · P4 ≈ 2–3 ngày + 1 tuần theo dõi · P5 ≈ 2 tuần. Tổng ≈ 6–8 tuần một dev, **tuần tự sau khi chat xong**.
- **Bản đầu (v1) = P0–P4:** nền quyền + cây tổ chức chạy thật trên dữ liệu hiện có (OWNED, chưa có franchise thật).
- **Bản sau (v2) = P5:** franchise, danh mục kế thừa, wizard — kích hoạt khi có đối tác nhượng quyền đầu tiên hoặc trước ngày cắt Văn phòng số MISA, tuỳ cái nào đến trước.
- Không cam kết ngày cụ thể; mọi cổng pha theo KR5 và checklist test.
