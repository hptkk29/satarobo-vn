# architecture.md — Thu học phí linh hoạt (trạng thái thiết kế)

> Tài liệu **ý định**: mô tả hệ thống phải như thế nào sau V1. Chưa phải mô tả mã hiện có. Mọi tên bảng/cột được ánh xạ tên thật ở `docs/thanh-toan-linh-hoat/gate-0.md` (US-01).

## 1. Tổng quan

Module quản lý công nợ học phí theo **ghi danh** (1 con × 1 khoá × 1 cơ sở), cho phép một phụ huynh có nhiều con đóng tiền linh hoạt: nhiều đợt, cọc, bỏ bớt con, thêm con, bảo lưu, đổi khoá, chuyển tiền giữa các con. Tiền chưa thuộc con nào nằm ở **ví gia đình**. Tiền về ngân hàng khớp theo **kỳ thu** (1 VA/QR gom nhiều dòng).

**Giả định chính:** (1) ~200 học viên, vài chục dòng tiền mỗi gia đình; (2) SePay là cổng tiền duy nhất đang chạy thật; (3) mỗi cơ sở có thể là một đơn vị kế toán riêng; (4) dữ liệu buổi đã diễn ra đủ tin để **gợi ý**, sale xác nhận.

## 2. Công nghệ

| Tầng | Công nghệ |
|---|---|
| Giao diện + nghiệp vụ | Next.js 16 App Router, Server Actions, React 19, Tailwind |
| Dữ liệu | Prisma → Supabase Postgres; migration SQL tay + `migrate deploy`; RLS bật trên bảng mới |
| Tiền về | SePay webhook → Route Handler |
| Việc định kỳ | Vercel Cron (+ workflow GitHub chỉ-đọc `shadow-compare-cong-no.yml`) |
| Thông báo nội bộ | `lib/notifications/notify.ts` (đường ghi duy nhất của StaffNotification) |

## 3. Thành phần

```
app/(admin)/…/gia-dinh/[id]          Màn hồ sơ thu tiền gia đình (5 tab)
app/(admin)/…/chinh-sach-hoc-phi      Màn cấu hình chính sách (admin)
app/api/…/webhook/sepay               Nhận tiền về
lib/finance/debt.ts                   NHÀ DUY NHẤT của mọi phép cộng tiền và trạng thái suy ra
lib/finance/ledger/
  ghiNghiepVuTien.ts                  ĐƯỜNG GHI DUY NHẤT: khoá gia đình, quyền, bất biến, idempotency
  kiem-bat-bien.ts                    Hàm thuần kiểm B1–B9
  build/*.ts                          Bộ dựng dòng cho từng loại nghiệp vụ (thuần, không chạm DB)
  preview.ts                          Tính màn xem trước + hash trạng thái
lib/finance/pricing/                  Bảng giá buổi, ưu đãi, luật làm tròn
lib/finance/policy/                   Đọc phiên bản chính sách, kiểm giới hạn
lib/finance/matching/                 Khớp giao dịch → kỳ thu → gia đình
lib/finance/feature.ts                laThuTienLinhHoatBat(orgUnitId) — nơi duy nhất đọc công tắc
```

**Luật phụ thuộc:** `build/*` và `kiem-bat-bien` là hàm thuần; chỉ `ghiNghiepVuTien` được mở transaction ghi tiền; UI và webhook chỉ gọi Server Action/handler → `ghiNghiepVuTien`.

## 4. Luồng xác thực và phạm vi

1. Phiên đăng nhập → `userId`, role, phạm vi (GLOBAL/REGION/CENTER/OWN) qua RBAC v2 `can()`.
2. Server Action kiểm quyền thao tác ở cửa (sớm) **và** `ghiNghiepVuTien` kiểm lại quyền trên mọi `enrollmentId` xuất hiện trong dòng sinh ra (muộn, không tin tham số).
3. Webhook: không có phiên người dùng; xác thực bằng khoá SePay; actor ghi là `SYSTEM_WEBHOOK`; chỉ được sinh loại dòng PAYMENT và ví `OVERPAY`/`UNMATCHED_TO_WALLET`.
4. Cron: xác thực `CRON_SECRET`; chỉ-đọc, trừ bảng tổng hợp quá hạn và bảng kết quả kiểm cân.
5. `SUPER_ADMIN` được `can()` trả true vô điều kiện — bất biến B1–B9 vẫn áp (bất biến không phải quyền).

## 5. Ranh giới tin cậy

| Ranh giới | Rủi ro | Kiểm soát |
|---|---|---|
| Trình duyệt → Server Action | Sửa tham số số tiền, `enrollmentId`, bỏ qua màn xem trước | Server tự tính lại; so `expectedHash`; quyền trên dòng sinh ra |
| SePay → webhook | Giả mạo, bắn lại, bắn trễ vào kỳ thu đã huỷ | Xác thực khoá; unique `bankTxnId`; kỳ thu không OPEN → ví |
| Cron → app | Gọi giả mạo | `CRON_SECRET`; chỉ-đọc |
| Đơn vị kế toán A ↔ B | Tiền đi chéo pháp nhân | Bất biến B8 ở đường ghi |
| Server → Postgres | Ghi tắt qua Prisma ngoài đường ghi | Test grep US-04/AC6; RLS; kiểm cân đêm |

## 6. Dữ liệu

Xem `01-BA` mục 5. Tóm tắt nguồn sự thật:

| Câu hỏi | Nguồn duy nhất |
|---|---|
| Con này phải trả bao nhiêu? | `PaymentRequest` không huỷ của ghi danh |
| Con này đã trả bao nhiêu? | `Payment` CONFIRMED, chưa xoá mềm, mọi `paymentType` |
| Đợt nào đã trả? | Suy ra (waterfall) trong `debt.ts` — không lưu |
| Giá của buổi k? | `EnrollmentPriceSegment` hiệu lực |
| Tiền chưa thuộc con nào? | `GuardianWalletEntry` |
| Ai làm gì, lúc nào, trước → sau? | `MoneyOperation` + `AuditLog` |
| Chính sách áp cho ghi danh? | `Enrollment.policyVersionId` |

`OrderInstallment` là sổ cũ: chỉ đọc khi công tắc bật; giải thể sau US-25.

## 7. Rủi ro và giả định đã biết

| # | Rủi ro | Hiện ở đâu |
|---|---|---|
| R1 | Nhiều chỗ tự cộng `amount` ngoài `lib/finance/` (đo được 15 trục A + 4 trục B trước đây) | G0-7; US-05/AC5 |
| R2 | `PaymentRequest` unique theo đơn chặn mô hình theo ghi danh | US-03 migration B |
| R3 | `allocateByWeight` chia tỉ trọng | Đường mới không gọi; test spy TS-20 |
| R4 | Cờ bật tính năng thành cờ chết (tiền lệ `PAYMENT_LEDGER_V2`) | `lib/finance/feature.ts`; TS-07 |
| R5 | DB dev/test phân kỳ migration với main; drift 14 bảng | US-01/AC6; cấm `migrate dev` |
| R6 | Dữ liệu buổi học từng lệch → số buổi đã dùng | G0-4; sale xác nhận; TS-29 |
| R7 | `payos-ingest` không set `enrollmentId` | Ngoài V1 (payOS chưa chạy); không bật payOS khi công tắc bật |
| R8 | Webhook có thể im lặng (sự cố 401 tháng 8) | US-24/AC3 |

## 8. Không có trong module

- Không có email giao dịch — không có `emails.md`.
- Không có route công khai cần SEO — không có `seo.md`.
- Không có agent/LLM; webhook SePay là tự động hoá duy nhất — xem `automation.md`.

## Tài liệu liên quan

- `flows.md` — luồng có quyền, tiền, tác dụng phụ
- `permissions.md` — ma trận quyền
- `variables.md` — biến môi trường và cấu hình
- `cron.md` — việc định kỳ
- `automation.md` — webhook SePay
- `tests.md` — bản đồ kiểm chứng
- `../01-BA-thanh-toan-linh-hoat.md`, `../02-PRD-…`, `../03-PreMortem-…`, `../04-UserStories-…`, `../05-TestScenarios-…`
