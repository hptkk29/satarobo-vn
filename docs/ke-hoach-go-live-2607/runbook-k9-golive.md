# Runbook K9 — Deploy GO-LIVE 26/07 + rollback

> **Owner:** Kiệt · **Trạng thái:** 🟡 KHUNG — hoàn thiện dần đến GĐ4 (23–26/07).
> Nguồn: [KIET.md](KIET.md) K9 · quy trình migrate theo [bien-ban-chot-tbd-k7.md](bien-ban-chot-tbd-k7.md) TBD-3.

## 1. Trước khi deploy (checklist cứng)

- [ ] `pnpm typecheck && pnpm lint && pnpm build` xanh trên commit sẽ deploy.
- [ ] CI xanh; mọi PR đụng tiền/enrollment có review Kiệt (K8).
- [ ] **Backup Supabase** ngay trước `migrate deploy` (điều kiện cứng — TBD-3.3).
- [ ] `prisma migrate status` trên prod = up to date sau khi apply.
- [ ] Deploy ngoài giờ học (TBD-3.2).

## 2. Deploy

1. Merge vào `main` → Vercel auto-deploy Production.
2. Theo dõi deployment: `npx vercel ls` / dashboard → chờ ● Ready.
3. Smoke sau deploy (mục 4).

## 3. Sự cố đã biết & cách xử (troubleshooting)

| Triệu chứng | Chẩn đoán | Xử lý |
|---|---|---|
| Deployment **● Error** nhưng log build SẠCH (`Build Completed` rồi chết ở `Deploying outputs...`, không có message) | **Lỗi transient hạ tầng Vercel** khi upload output — KHÔNG phải lỗi code. Tiền lệ: 02/07/2026 22:57 (`satarobo-3azhnpcg7`) build 3m OK, chết ở Deploying outputs; redeploy 28' sau (`satarobo-q9eh5isfe`) cùng code → Ready, giữ đủ 4 domain | **Đừng debug code.** Dashboard → deployment → ⋯ → **Redeploy** (hoặc `npx vercel redeploy <url>`). Nếu fail lần 2 liên tiếp → check status.vercel.com |
| Deployment Error CÓ dòng lỗi trong log build | Lỗi code/config thật | Đọc dòng lỗi: `npx vercel inspect --logs <url>` → fix theo lỗi |
| Sau migrate, page báo `db.<model> undefined` | Prisma Client cache stale | Redeploy (serverless tự generate lại); local thì restart dev server |
| Env var mới không ăn | Env chỉ áp vào deployment MỚI | Redeploy sau khi đổi env |

## 4. Smoke test sau deploy (prod)

- [ ] `satarobo.vn` (public) load, giá khoá học hiện "Liên hệ".
- [ ] Login từng vai trò: SUPER_ADMIN · CENTER_MANAGER CS1 (Toại) · CENTER_MANAGER CS2 (Liên) · SALES_CSM · TEACHER · HO_ACCOUNTANT · TRAINING · PARENT.
- [ ] Cách ly cơ sở: tài khoản CS1 KHÔNG thấy dữ liệu CS2 (leads/classes/students) và ngược lại; kế toán HO thấy cả 2.
- [ ] Luồng tiền: tạo đơn 2 đợt → ghi nhận → KT xác nhận → phiếu thu mã theo cơ sở → `/admin/cong-no` đúng.
- [ ] `/admin/scorm` mở được (GV trình chiếu 1 gói).
- [ ] Portal PH: `/portal/hoc-phi` khớp admin công nợ.

## 5. Rollback

| Tầng | Cách lui | Thời gian |
|---|---|---|
| Code | Vercel dashboard → deployment Ready trước đó → **Promote to Production** (instant rollback, không cần build lại) | ~1 phút |
| Feature flag | Set env (`RBAC_V2_ENABLED=false`…) + Redeploy | ≤ 5 phút |
| DB (migration hỏng dữ liệu) | Restore backup Supabase gần nhất (RPO 24h / RTO 4–8h) — chấp nhận mất dữ liệu từ lần backup (TBD-3.4) | 4–8h |

> Nguyên tắc: migration additive (2-phase, không drop cột đang dùng) → rollback code KHÔNG cần rollback DB trong hầu hết trường hợp.

## 6. Liên hệ khi sự cố

- Deploy/DB: Kiệt · LMS/SCORM: Huy · RBAC/scopedDb: Luân · CRM/login: Trí · UI: Vy.
- Vercel status: status.vercel.com · Supabase status: status.supabase.com
