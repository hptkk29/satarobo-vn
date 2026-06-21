# LMS Fix — Rollout & Migration Runbook

> Triển khai loạt fix LMS (nhánh `FixLMS`, 2026-06-18). Tất cả đã verify local:
> `typecheck` + `lint` + **631 unit test** + `build` PASS. Mục này = các bước **bạn**
> cần làm để đưa lên prod (apply migration + bật dần). Nguồn: [LMS-problems-fix-plan](./LMS-problems-fix-plan.md) · [LMS-roadmap-complete](./LMS-roadmap-complete.md).

## 1. Migration cần apply (theo thứ tự)

> ⚠️ Backup/PITR phải bật TRƯỚC (xem [backup-pitr-runbook.md](./backup-pitr-runbook.md)).
> Apply bằng `prisma migrate deploy` (KHÔNG `migrate dev`/`reset` trên prod).

**Nền ERD (P0/P1 — nếu prod chưa có):**
| Migration | Nội dung | Rủi ro |
|---|---|---|
| `20260617000000_enable_rls_all_public` | Bật RLS | thấp |
| `20260617010000_stockbalance_qty_nonneg` | CHECK qty ≥ 0 | thấp (fail nếu có data âm — kiểm trước) |
| `20260617020000_finance_restrict_soft_delete` | onDelete RESTRICT + soft-delete | thấp |
| `20260617030000_timestamptz_all` | timestamp → timestamptz(UTC) | **trung bình** — đọc kỹ comment trong file (convert UTC, không phải +7) |
| `20260617040000_check_constraints` | CHECK tiền/voucher | thấp (fail nếu data vi phạm — kiểm trước) |

**LMS fix (2026-06-18):**
| Migration | Nội dung | Rủi ro |
|---|---|---|
| `20260618000000_money_float_to_int_vnd` | 5 cột tiền Float→Int (ROUND) | thấp (VND nguyên) |
| `20260618010000_skill_assessment_session_link` | +classSessionId/lessonId | thấp (additive) |
| `20260618020000_exam_attempt_retake` | +attemptNo, đổi unique | **trung bình** — đảm bảo dữ liệu attempt hiện tại OK (mỗi (exam,HV) ≤1 → attemptNo=1 không đụng unique mới) |
| `20260618030000_message_thread` | bảng MessageThread/Message | thấp (mới) |
| `20260618040000_session_substitute` | +substituteTeacherId/RoomId | thấp (additive) |
| `20260618050000_revenue_target` | bảng RevenueTarget | thấp (mới) |

Sau apply: **restart** (Prisma Client cache) — Vercel redeploy tự lo.

## 2. Cấu hình mới

- **Env (tùy chọn):** `RETENTION_DAYS` (mặc định 1825 = 5 năm) cho cron rà soát lưu trữ.
- **Cron mới** (đã ở `vercel.json`, tự chạy sau deploy): `reserve-expiry` (06:00 hàng ngày),
  `retention-scan` (07:00 thứ Hai).

## 3. Bật dần (rollout an toàn)

Các fix bảo mật/đúng-đắn (P2) + lifecycle (P3) **không sau cờ** — hiệu lực ngay khi deploy
(đây là vá lỗ hổng, cần bật). RBAC v2 **vẫn shadow** (không đổi). Trình tự đề xuất:

1. **Shadow/canary:** deploy lên 1 môi trường preview → smoke theo §4.
2. **Canary 1 cơ sở:** quan sát log (conflict lịch, refund suggest, cron) 1–2 ngày.
3. **On toàn hệ:** giữ nguyên (không cờ riêng cần bật cho P2–P7 ngoài cron).

## 4. Smoke nghiệm thu (catalog use-case làm checklist)

- **P2** GV A KHÔNG điểm danh/chấm/hoàn-tất buổi lớp GV B (403/“không phụ trách”).
- **P2** Nộp bài thi sau giờ → `submittedAt` bị clamp về deadline.
- **P2** Chỉnh buổi trùng phòng/GV → bị chặn (trừ allowConflict).
- **P3** Rút học giữa khóa → action trả `refundSuggestions` (prorate đúng số buổi).
- **P3** Hủy lớp → enrollment WITHDREW + email PH + buổi tương lai CANCELLED.
- **P4** Thi lại tới `maxAttempts`; học bạ hiện điểm bài tập + kỹ năng + điểm CAO NHẤT mỗi đề.
- **P4** GV phụ trách mở được SkillEditor (trước bị disable).
- **P5** PH gửi tin `/portal/tin-nhan` → staff thấy ở `/admin/tin-nhan` và trả lời được.
- **P7** SUPER_ADMIN: `/admin/compliance` xuất JSON + xoá ẩn danh 1 HV (audit ghi ERASE_PII).

## 5. Lệnh verify chuẩn (đã PASS local)

```
pnpm typecheck && pnpm lint && pnpm build
pnpm exec vitest run    # 631 pass
```

## 6. Việc CÒN LẠI (follow-up, không chặn)

- Dashboard Recharts cho 4 report mới (P6) — engine + KPI đã xong, chỉ thiếu trang vẽ.
- Calendar view (P5) — data đã có ở list views.
- SCORM scoring (LMS-14) — DEFER (online học trỏ SataWorld).
- E2E Playwright theo từng flow §4 (cần DB test harness + app chạy).
- RBAC v2 flip global (240 file) — quyết định riêng, ngoài phạm vi vá này.
