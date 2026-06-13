# 📚 Document — Bộ tài liệu kỹ thuật Sata Robo VN

> Sinh tự động từ quét toàn bộ codebase ngày **2026-06-05** (138 models, 80+ pages, ~30 API routes, 20+ server action modules).
> Khi doc và code xung đột → **code thắng**; cập nhật doc theo code.

## Cấu trúc folder

```
Document/
├── 0-yeucau/                    # Yêu cầu khách hàng: gốc → PM tiếp nhận → BA phân tích → kế hoạch
├── 1-project-overview/          # Người mới đọc đầu tiên
├── 2-architecture-design/       # Kiến trúc, DB, hạ tầng
├── 3-technical-specification/   # Tech spec FE + BE
├── 4-api-communication/         # Hợp đồng FE ↔ BE
├── 5-system-flows/              # User flow, nghiệp vụ, data flow
└── 6-quality-security/          # Bảo mật, test
```

## Thứ tự đọc đề xuất

```
PRD → API Contract → System Architecture → DB Design → Tech Spec (FE+BE) → User Flow → Security → Test Plan
```

## Danh mục

### Nhóm 0 — Yêu cầu khách hàng (intake → analysis → plan)
| Bước | Folder | Nội dung |
|---|---|---|
| Quy trình + trạng thái | [0-yeucau/README.md](0-yeucau/README.md) | PM → BA → Kế hoạch, trạng thái từng tài liệu |
| 0. Tài liệu gốc | `0-yeucau/0-tai-lieu-goc/` | File khách gửi (PDF/DOCX) — không sửa |
| 1. PM tiếp nhận | `0-yeucau/1-pm-tiep-nhan/` | Phiếu tiếp nhận, phân loại, câu hỏi xác nhận |
| 2. BA phân tích | `0-yeucau/2-ba-phan-tich/` | Gap analysis vs hiện trạng, user stories + AC |
| 3. Kế hoạch | `0-yeucau/3-ke-hoach-trien-khai/` | Roadmap release, task breakdown; phases A0→R5 ✅ + **R6 Hardening (BA #04) + R7 LMS v3.1 (18 ticket — chờ duyệt)** trong [`phases/`](0-yeucau/3-ke-hoach-trien-khai/phases/README.md) |

### Nhóm 1 — Project Overview
| Doc | File | Ai đọc |
|---|---|---|
| 1. PRD / Project Overview | [1-project-overview/01-prd-project-overview.md](1-project-overview/01-prd-project-overview.md) | Tất cả (người mới đọc đầu tiên) |

### Nhóm 2 — Architecture & Design
| Doc | File | Ai đọc |
|---|---|---|
| 2. System Architecture | [2-architecture-design/02-system-architecture.md](2-architecture-design/02-system-architecture.md) | Dev, DevOps, Tech Lead |
| 3. Database Design | [2-architecture-design/03-database-design.md](2-architecture-design/03-database-design.md) | Backend Dev, DBA |
| 4. Infrastructure | [2-architecture-design/04-infrastructure.md](2-architecture-design/04-infrastructure.md) | DevOps, Backend Lead |
| 13. **Architecture Redesign Proposal** (HO org model, role động, modular monolith, domain events) | [2-architecture-design/13-architecture-redesign.md](2-architecture-design/13-architecture-redesign.md) | Tech Lead, BE Dev, PM/CEO |
| 14. Review CEO's Architecture Evolution Proposal (phản biện) | [2-architecture-design/14-review-architecture-evolution-proposal.md](2-architecture-design/14-review-architecture-evolution-proposal.md) | Tech Lead, PM/CEO |
| 15. ⭐ **FINAL Project Blueprint v2 — BẢN CHỐT DUY NHẤT** (hợp nhất blueprint kỹ thuật + chốt nghiệp vụ CEO 05/06: login chung, Messenger-first CRM, HO/CS1/CS2, LMS offline, roadmap A0→R5 + PR sequencing, DoD 18 điểm). Khi xung đột tài liệu khác → file này thắng | [2-architecture-design/15-final-architecture-blueprint.md](2-architecture-design/15-final-architecture-blueprint.md) | Toàn team |

### Nhóm 3 — Technical Specification
| Doc | File | Ai đọc |
|---|---|---|
| 5. Frontend Tech Spec | [3-technical-specification/05-frontend-tech-spec.md](3-technical-specification/05-frontend-tech-spec.md) | Frontend Dev |
| 6. Backend Tech Spec | [3-technical-specification/06-backend-tech-spec.md](3-technical-specification/06-backend-tech-spec.md) | Backend Dev |

### Nhóm 4 — FE ↔ BE Communication
| Doc | File | Ai đọc |
|---|---|---|
| 7. API Contract | [4-api-communication/07-api-contract.md](4-api-communication/07-api-contract.md) | Cả team |

### Nhóm 5 — System Flows
| Doc | File | Ai đọc |
|---|---|---|
| 8. User Flow / Journey Map | [5-system-flows/08-user-flow.md](5-system-flows/08-user-flow.md) | BA, FE, QA |
| 9. Business Logic Flow | [5-system-flows/09-business-logic-flow.md](5-system-flows/09-business-logic-flow.md) | Backend Dev, BA |
| 10. Data Flow Diagram | [5-system-flows/10-data-flow-diagram.md](5-system-flows/10-data-flow-diagram.md) | Backend Dev, DevOps |

### Nhóm 6 — Quality & Security
| Doc | File | Ai đọc |
|---|---|---|
| 11. Security Design | [6-quality-security/11-security-design.md](6-quality-security/11-security-design.md) | Toàn team |
| 12. Test Plan | [6-quality-security/12-test-plan.md](6-quality-security/12-test-plan.md) | QA, Dev |

## Tài liệu liên quan ngoài folder này

- `CLAUDE.md` + `.claude/rules/*.md` — quy ước code (FROZEN conventions).
- `docs/*.md` (16 file) — spec nghiệp vụ chi tiết từng feature (lead-handover, makeup-flow, payment-qr-installments, satacoin, otp-service, zalo-adapter, ...).
- `prisma/schema.prisma` — nguồn sự thật schema DB.
- `lib/auth/route-policy.ts` + `permissions.ts` — nguồn sự thật phân quyền.

## Quy ước bảo trì

1. Thay đổi kiến trúc/quyền/API public → cập nhật doc tương ứng **trong cùng PR/commit**.
2. Doc mới đặt vào đúng folder nhóm, đánh số tiếp theo (13, 14...), thêm dòng vào danh mục này.
3. Không paste secret/giá trị env thật vào doc — chỉ tên biến.
4. Diagram dùng Mermaid (render được trên GitHub).
