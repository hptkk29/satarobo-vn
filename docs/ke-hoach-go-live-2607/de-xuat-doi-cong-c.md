# Đề xuất: đổi cổng C của #01 và flip RBAC v2 (#09) SỚM, trước UAT

> Trình: Kiệt / BGĐ · Người soạn: lane #01 · Ngày 09/07/2026
> Liên quan: `runbook-prod-flip-prereq.md` §4 (cổng C), `shadow-log.md`, task #01/#09/#10/#12.

## 1. Tóm tắt một câu

Cổng C hiện tại — *"3–5 ngày shadow-compare sạch trên traffic thật"* — **không thể đạt trên prod
trước 17/07 vì prod chưa có người dùng**; giữ nguyên nó thì cổng sẽ tự thoả mãn một cách rỗng, còn
UAT 20–25/07 sẽ nghiệm thu **sai engine phân quyền**. Đề nghị flip `RBAC_V2_ENABLED` **trước** UAT.

## 2. Chứng cứ (đo trên PROD, 09/07)

| Kiểm | Kết quả |
|---|---|
| Bản ghi `Employee` active | **1** — CEO Hồ Đắc Phúc, không email, không cơ sở, không tài khoản |
| Tài khoản nhân viên active | **3** — `admin@`, `daotao@`, `giaovien.cs1@` (tài khoản kỹ thuật) |
| `UserOrgRole` trước 09/07 | **0** (dry-run `patch-rbac-staff`: *"giữ nguyên 0"*) |
| Học viên / lớp / traffic | không có |

⇒ Không có ai để sinh `checkPermission()`, nên bảng `RbacShadowDiff` sẽ trống **vì không ai dùng**,
chứ không phải vì mapping đúng. Chính runbook §4/C2 đã cảnh báo: *"Bảng trống vì không ai dùng ≠ đã kiểm chứng."*

## 3. Rủi ro của việc giữ nguyên kế hoạch

1. **Bằng chứng rỗng.** Đếm đủ 5 ngày sạch vào 14/07 rồi flip — nhưng chưa một vai trò nào được kiểm.
2. **UAT nghiệm thu nhầm engine.** Flip sau UAT nghĩa là UAT (#10, 20–25/07) chạy trên **v1 matrix**,
   còn go-live 26/07 chạy **v2**. Ta ký nghiệm thu cho một hệ khác hệ sẽ ship. Đây là rủi ro lớn hơn
   hẳn cái mà 5 ngày shadow đang cố chặn, và nghịch với câu 5 phiếu BGĐ
   (*"không chấp nhận bất kỳ rủi ro chất lượng code nào"*).
3. **Shadow đặt sai chỗ.** Cơ chế này sinh ra để de-risk việc flip một hệ **đang sống**. Prod chưa sống.
   Ngược lại, flip lúc prod trống thì thiệt hại tối đa ≈ 0, và rollback = đổi 1 biến env + redeploy.

## 4. Đề xuất

| # | Việc | Ai | Khi |
|---|---|---|---|
| 1 | Vá 4 action `*-own` thiếu `SUPER_ADMIN` trong matrix v1 (dọn lớp nhiễu có cấu trúc) | lane #01 | **xong 09/07** |
| 2 | Provisioning prod: tài khoản + `UserOrgRole` đủ 8 vai trò × cơ sở (#12 mở rộng) | Kiệt | 10–11/07 |
| 3 | Chạy shadow trên **DEV** (nơi có 24 `UserOrgRole` + traffic thật của Vy/Kiệt/Toại) tới khi 0 lệch | lane #01 | 10–14/07 |
| 4 | **Smoke có kịch bản 8 vai trò** trên prod thay cho "traffic thật" | lane #01 + Kiệt | sau bước 2 |
| 5 | **Flip `RBAC_V2_ENABLED=true`** khi DEV sạch + smoke prod xanh | Kiệt | **15–17/07, trước UAT** |
| 6 | UAT #10 (20–25/07) chạy thẳng trên v2 — nghiệm thu đúng engine sẽ ship | Vy/Toại | 20–25/07 |
| 7 | Giữ shadow bật 1 tuần sau flip (đảo chiều theo dõi) | lane #01 | tới 24/07 |

**Cổng C mới đề nghị:** thay *"3–5 ngày sạch trên traffic thật prod"* bằng
> **(a)** shadow trên DEV = 0 lệch qua ≥3 ngày có thao tác thật, **và**
> **(b)** smoke 8 vai trò trên prod không sinh dòng `RbacShadowDiff` nào, **và**
> **(c)** rollback đã diễn tập: đổi `RBAC_V2_ENABLED=false` + redeploy < 10 phút.

Lý do (a) dùng DEV hợp lệ: shadow so **mapping `role → permission`**, không so dữ liệu. DEV chạy cùng
code, cùng seed `RoleDef/RolePermission` (re-seed 08/07). Lệch phụ thuộc dữ liệu (thiếu `target` ở action
CENTER-scope) lộ ra ở cả hai môi trường như nhau.

## 5. Việc đã làm để chuẩn bị (09/07)

- Gỡ deadlock RC-A: `admin@` không có `UserOrgRole` ⇒ mọi picker "Đơn vị" trong admin rỗng ⇒ không gán
  được cơ sở cho ai. Đã chạy `patch-rbac-staff` (apply) → 3 `UserOrgRole` đầu tiên, picker sống lại.
- Thêm workflow **Shadow-compare report (read-only)** và **Patch UserOrgRole (dry-run mặc định)**.
- Vá 4 action `*-own` + thêm test bất biến *"SUPER_ADMIN phủ toàn bộ action"* chặn tái phát.

## 6. Nếu BGĐ giữ nguyên cổng C cũ

Vẫn làm được, nhưng phải chấp nhận **một trong hai**: hoặc dời flip sang sau UAT (25/07 — sát go-live,
rủi ro cao nhất), hoặc ký nhận rằng "5 ngày sạch" đạt được trên một hệ không có người dùng và
**không mang giá trị kiểm chứng nào**. Lane #01 khuyến nghị không chọn cả hai.
