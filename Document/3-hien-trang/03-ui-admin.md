# 03 — UI Admin (`app/(admin)/admin/`)

> ~158 route, 59 thư mục chính. Layout đã `auth() + redirect /login`; mỗi page check role gate; Server Action `auth()` + `assertCan` đầu hàm. Bảng theo domain.

## 1. Dashboard
- `/dashboard` — gộp 6 panel theo role (Manager KPI · GV buổi+HV · Sale lead+enrollment · Kế toán · Marketing · HR); union nếu nhiều role.

## 2. CRM / Lead
| Route | Mục đích | Quyền |
|---|---|---|
| `/crm` | Dashboard phễu chuyển đổi + hiệu suất sale | `leads:view-all` |
| `/leads` (table+kanban) | DS lead (SALES_CSM scope own) | `leads:view-all`/`:view-own` |
| `/leads/new`, `/leads/[id]`, `/leads/[id]/edit`, `/leads/import` | CRUD + import xlsx | `leads:create/edit` |
| `/leads/bao-cao-chuyen` · `/leads/cau-hinh-chia` | Báo cáo chuyển đổi · cấu hình chia lead | `leads:view-all` · SUPER_ADMIN |
| `/crm/commission` · `/crm/messenger` · `/crm/webhook-replay` | Hoa hồng · inbox Messenger · replay webhook | — / SUPER_ADMIN |
| `/ban-giao-lead` · `/cham-soc-hv` · `/canh-bao-rui-ro` | Bàn giao · chăm sóc HV · cảnh báo rủi ro | — |
| `/marketing` · `/marketing/funnel` · `/khao-sat` | Dashboard marketing · phễu · khảo sát | `leads:view-all` |

## 3. Học viên / Lớp
| Route | Mục đích |
|---|---|
| `/students` (+7 lifecycle view: All/Active/Paused/Graduated/Inactive/Frequently-Absent/Sap-het-khoa) · `/new` · `/[id]/edit` · `/import` · `/sap-het-khoa` | Quản lý HV |
| `/classes` · `/new` (ClassForm) · `/[id]/edit` · `/[id]/progress` · `/import` | Quản lý lớp + **tạo lớp + sinh buổi học** |
| `/class-groups` · `/new` · `/[id]` · `/[id]/edit` | Nhóm lớp cố định |
| `/chuyen-lop` · `/hoc-bu` · `/hoan-thanh-khoa` · `/hoc-ba` | Chuyển lớp/cơ sở · học bù · hoàn thành+chứng chỉ · học bạ |
| `/enrollments` · `/new` · `/[id]/edit` | Đăng ký học |
| `/sessions` (upcoming/past/all) · `/new` · `/[id]` (điểm danh+feedback) · `/[id]/edit` | Buổi học |

## 4. LMS — Giáo trình / Bài
| Route | Mục đích |
|---|---|
| `/curriculums` · `/new` · `/[id]/edit` | Giáo trình (version) |
| `/assignments` · `/new` · `/[id]/edit` | Bài tập |
| `/exams` · `/new` · `/[id]/builder` · `/[id]/attempts` | Bài thi + builder |
| `/questions` · `/new` · `/[id]/edit` · `/import` | Ngân hàng câu hỏi |
| `/documents` · `/kits` · `/media` · `/satacoin` | Tài liệu · bộ tài liệu · thư viện media · SataCoin |

## 5. Tài chính
| Route | Mục đích | Quyền |
|---|---|---|
| `/orders` · `/new` · `/[id]` | Đơn hàng | `orders:view/manage` |
| `/products` · `/payment-methods` · `/vouchers` · `/course-packages` · `/course-prerequisites` | Sản phẩm · PTTT · voucher · gói · tiên quyết | `*:view/create/edit` |

## 6. HR — Chấm công & Nhân sự
| Route | Mục đích |
|---|---|
| `/cham-cong` · `/man-hinh` (QR) · `/checkin` · `/chinh-cong` · `/lich-ca` · `/lich-ca-nhan-vien` · `/duyet-ca` · `/yeu-cau-cong` · `/checklist-co-so`(+`/tong-quan`) | Chấm công QR + geofence + đăng ký ca + duyệt + chỉnh công + checklist cơ sở |
| `/nhan-su` · `/new` · `/[id]`(+`/edit`,`/schedule`) · `/import` · `/teachers` · `/teachers/[id]` | Nhân sự + giáo viên |

## 7. Cấu hình / Quyền
| Route | Mục đích | Quyền |
|---|---|---|
| `/users` · `/new` · `/[id]/edit` · `/[id]/permissions` · `/[id]/org-roles` · `/[id]/reset-password` | Tài khoản + override quyền + org-role | `users:manage` (SUPER_ADMIN) |
| `/roles` | RBAC (read + audit mọi thay đổi) | `roles:manage` |
| `/centers`(+new/edit/import) · `/rooms`(…) · `/holidays`(…) | Cơ sở (geofence lat/lng) · phòng · ngày nghỉ | `*:view/create/edit` |
| `/settings` · `/site-content` · `/tich-hop` · `/email-templates`(…) · `/email-logs` · `/audit-log` | Cài đặt · CMS · tích hợp · template email · log · audit | SUPER_ADMIN / `audit:view` |

## 8. Nội dung / Tuyển dụng / Phản hồi
- `/news`(+new/edit) · `/honors`(+new/edit/settings/timeline) · `/jobs`(+new/edit) · `/trials`.
- `/parent-feedback` · `/parent-requests`(+`/bao-vang`) — duyệt yêu cầu phụ huynh.
- `/inventory/{dashboard,items,movements,audit}` — kho.

## Bảng quyền chính (v1 matrix)
| Resource | Action → Role |
|---|---|
| leads | view-all (SUPER_ADMIN, CENTER_MANAGER, SALES_CSM) · view-own (SALES_CSM) · create/edit (SALES_CSM) · assign (SUPER_ADMIN, CENTER_MANAGER) · delete (SUPER_ADMIN) |
| students | view-all (SUPER_ADMIN, CENTER_MANAGER, TEACHER) · create (+SALES_CSM) · edit (SUPER_ADMIN, CENTER_MANAGER) |
| classes | view-all (…, TEACHER) · create/edit (SUPER_ADMIN, CENTER_MANAGER) |
| enrollments | view-all (+TEACHER, ACCOUNTANT) · create (+SALES_CSM, ACCOUNTANT) |
| sessions | create (SUPER_ADMIN, CENTER_MANAGER, TEACHER) |
| hr_attendance | view (CENTER_MANAGER, TEACHER, HR) |
| employees | view-all (SUPER_ADMIN, CENTER_MANAGER, HR) · create (SUPER_ADMIN, HR) |
| users / roles | manage (SUPER_ADMIN) |
| orders | view (…, ACCOUNTANT) · manage (SUPER_ADMIN, ACCOUNTANT) |

> ⚠️ ~27 action gate bằng mảng role inline thay vì `can()` (xem [06](06-audit-lo-hong.md) T1). Field-level (lương, DoB): `getEmployeeFieldVisibility(role)`.

## Quy ước UI admin
- shadcn/ui only (NO Magic UI/Motion — ESLint chặn). Charts: `@/components/charts/*` (300ms).
- Server Component fetch → client table + row action trong `useTransition`. Confirm-delete 2-click.
- Sau mutation: `revalidatePath('/admin/<resource>')` + public mirror nếu có.
