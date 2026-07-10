# Runbook — Diễn tập rollback `RBAC_V2_ENABLED`

> **Mục tiêu:** chứng minh đường lui khỏi RBAC v2 hoạt động **trước** khi flip thật, và đo thời gian.
> Đây là **cổng (c)** của flip `#09` (xem [de-xuat-doi-cong-c.md](de-xuat-doi-cong-c.md)).
> **Ai chạy:** người có credential Vercel + Supabase. Agent KHÔNG có credential prod.
> **Cơ chế rollback** (bảng 3 tầng) đã mô tả ở [runbook-k9-golive.md](runbook-k9-golive.md) §5 — tài liệu này
> **không lặp lại**, chỉ mô tả bài **diễn tập** cơ chế đó.
> **Soạn:** 10/07/2026, sau smoke 9 vai trò ([smoke-8-vai-tro.md](smoke-8-vai-tro.md) §7–§10).

---

## 0. Hai sự thật nền, đã kiểm chứng — đừng nhớ nhầm

Cả bài diễn tập dựa trên hai điều dưới đây. Chúng **không phải phỏng đoán**: đã đối chiếu tài liệu
Vercel và đọc mã nguồn repo (10/07).

**(1) Đổi env KHÔNG tác động lên deployment đang chạy.**

> *"Changes to environment variables are not applied to previous deployments, they only apply to new
> deployments. You must redeploy your project to update the value of any variables you change."*
> — [vercel.com/docs/environment-variables/managing-environment-variables](https://vercel.com/docs/environment-variables/managing-environment-variables)

**(2) Instant Rollback KHÔNG build lại, và deployment cũ giữ NGUYÊN env đã đóng băng lúc nó được build.**

> *"This points production traffic to the deployment you specify without rebuilding. The rollback happens
> at the routing layer, so it takes effect within seconds."*
> — [vercel.com/docs/deployments/rollback-production-deployment](https://vercel.com/docs/deployments/rollback-production-deployment)
>
> *"There are no change in Environment Variables, and they will remain in their original state."*
> — [vercel.com/docs/instant-rollback](https://vercel.com/docs/instant-rollback)

⚠️ **Hai cơ chế này KHÔNG đối xứng — đừng lẫn.**

| | Cách làm | Thời gian |
|---|---|---|
| **Flip (đi tới)** | đổi env → **Redeploy** (build đầy đủ) | **phút** |
| **Rollback (lui)** | Instant Rollback về deployment cũ (không build) | **giây** |

Flip *không* phải cú bật/tắt tức thì. Muốn bật/tắt trong vài giây thì phải chuyển cờ sang nguồn runtime
(Edge Config / DB / Vercel Flags) — **ngoài phạm vi go-live 26/07**.

**Vì sao rollback an toàn cho dữ liệu:** flip **không kèm migration nào**. `RoleDef` / `RolePermission` /
`UserOrgRole` / `RbacShadowDiff` do các migration thường tạo, tồn tại **bất kể** cờ
(`20260608020000_add_dynamic_rbac`, `20260613062956_r6f2_rbac_shadow_diff`); `isRbacV2Enabled()` chỉ đọc
`process.env` (`lib/flags.ts:7-9`). Hai trạng thái cờ dùng **chung một schema** ⇒ lui code không cần lui DB.

> ⚠️ Khẳng định trên chỉ đúng với **schema**. Xem §5 — dữ liệu **ghi trong cửa sổ** dưới v2 vẫn ở lại sau
> khi rollback. Đó là lý do phải đóng băng ghi, chứ không phải "không cần rollback DB" một cách trống không.

---

## 1. Phân vai (không làm một mình lúc 2h sáng)

| Vai | Người | Việc |
|---|---|---|
| **Thao tác** | Kiệt (hoặc TGĐ) | bấm Vercel, đổi env, Instant Rollback |
| **Xác nhận độc lập** | Luân (RBAC/scopedDb) | chạy các phép kiểm §4, đọc kết quả to lên |
| **Quyền hô ABORT** | Kiệt | một người, nói rõ từ đầu là ai |
| **Canh lỗi** | ai cũng được | mở sẵn Sentry + Vercel Function Logs của deployment prod |

Kênh thoại/chat mở suốt cửa sổ. **Người thao tác không tự xác nhận kết quả của chính mình.**

---

## 2. Pha 0 — Chuẩn bị (làm trước, ngoài giờ bấm giờ)

- [ ] **Merge xong** mọi PR liên quan (#48, #50) và Vercel deploy Ready. Sau bước này **KHÔNG merge gì nữa**.
- [ ] **Đóng băng `main`** suốt cửa sổ và cho tới khi env được đặt lại `false`.
      Lý do: Git Integration auto-deploy. Bất kỳ ai merge trong lúc env đang `= true` sẽ **âm thầm bật lại v2**
      hoặc đè mất deployment dùng làm phao. Thông báo cả đội, không chỉ 4 người test.
- [ ] **KHÔNG chạy `seed-prod-roles` trong bài diễn tập.** Seed mutate `RolePermission` prod ⇒ theo
      [runbook-prod-flip-prereq.md](runbook-prod-flip-prereq.md) Phần C, mọi thay đổi làm đổi hành vi v2 sẽ
      **reset đồng hồ shadow**. Nếu buộc phải seed (vì đổi role), coi như đồng hồ về 0 và **lịch flip thật
      phải lùi lại** cho đủ số ngày sạch.
- [ ] **Ghi lại Deployment ID hiện tại → gọi là `D1`.** Đây là phao: nó được build khi cờ đang OFF, nên
      env OFF đã **đóng băng bên trong** nó.
- [ ] **Xác minh phao dùng được, đừng giả định:**
      - Instant Rollback có bật trong Project Settings không?
      - Gói Vercel là gì? **Hobby chỉ lui được về deployment production liền trước**; Pro/Enterprise lui
        được về bất kỳ deployment nào từng làm production.
      - `D1` còn trong danh sách Deployments và còn **Promote** được không?
- [ ] **Biết trước hệ quả phụ:** sau khi Instant Rollback, Vercel **tắt auto-assign domain production** —
      push mới sẽ **không tự lên prod** cho tới khi bấm *Undo Rollback* / promote lại. Đây là tính năng,
      không phải sự cố; nhưng phải nhớ bật lại, nếu không deploy hôm sau "không ăn".
- [ ] **Đo trước đường lui #2** (phòng khi Instant Rollback hỏng): thời gian một lần Redeploy đầy đủ là bao
      lâu? Ghi con số thật, đừng ghi "≤5 phút" theo cảm tính.
- [ ] Baseline: `SELECT COUNT(*) FROM "RbacShadowDiff";` và mốc **T0**.

### 2.1 Chọn cửa sổ — "vắng người" ≠ "vắng hệ thống"

`vercel.json` có **13 cron**. Đừng chọn 02:00.

| Giờ | Cron |
|---|---|
| **mỗi phút** | `dispatch-events` ← **xử lý outbox, CÓ GHI** |
| mỗi 5' | `email-queue` |
| mỗi 15' | `sla-check` |
| mỗi giờ | `parent-request-reminder` |
| 01:00 | `class-reminder` |
| **02:00** | `renewal-reminder` **và** `marketing-alerts` |
| 03:00 | `debt-reminder` · 04:00 `order-debt-reminder` · 05:00 `assignment-due-soon` · 06:00 `reserve-expiry` |

→ **Tạm dừng Vercel Cron trong cửa sổ diễn tập** (hoặc chấp nhận và làm §5). `dispatch-events` chạy mỗi
phút và **ghi dữ liệu**, nên không có khe nào thực sự "yên tĩnh".

Riêng `email-queue` là cron duy nhất có gọi `checkPermission` — nhưng `authorize()` short-circuit bằng
`Bearer $CRON_SECRET` **trước** khi tới đó (`app/api/cron/email-queue/route.ts:11-19`), nên lịch cron
không đổi hành vi theo cờ. Chỉ người thật gọi tay endpoint đó mới đi qua `checkPermission`.

---

## 3. Pha 1 — Flip *(bắt đầu bấm giờ)*

1. Vercel → Settings → Environment Variables → **Production**: `RBAC_V2_ENABLED = true`.
2. Deployments → **Redeploy** commit mới nhất. **Bắt buộc** — xem §0(1). Sinh ra **`D2`**.
   - ⚠️ Nếu Vercel dùng lại build cache, vẫn phải chắc `D2` **thật sự đọc cờ ON** (kiểm ở §4 phép 1).
3. Chờ ● Ready. Ghi **`D2` ID**.

> Cân nhắc mạnh: kiểm `D2` trên **preview URL** trước khi promote lên domain thật. Flip thẳng production
> nghĩa là **mọi phiên đang mở** đổi hệ quyền giữa chừng, không chỉ 4 tài khoản test.

---

## 4. Pha 2 — Kiểm chứng

### 4.1 Phép ĐỌC (menu) — nhanh, nhưng KHÔNG đủ

| # | Vai | Kỳ vọng | Chứng minh điều gì |
|---|---|---|---|
| 1 | Kiệt (SUPER_ADMIN) | `/roles` mở, sidebar đầy đủ | `D2` thật sự chạy v2 **và** đường cứu hộ còn sống |
| 2 | **Toại** (QL cơ sở) | 9 mục **biến mất khỏi menu** (không phải bấm vào bị đá) | menu đi theo cờ (#47) |
| 3 | Toại | menu **"Chấm công" vẫn còn** | #50 — `hr_attendance:view[CENTER]` không bị menu ẩn oan |
| 4 | Mỹ (Sale + Giáo vụ) | menu **"Điểm danh" vẫn còn**; `/hoc-ba` vẫn chặn | #50 + gate `/hoc-ba` |
| 5 | Linh (Marketing) | `/site-content` + `/honors` mở được | v2 cấp `honors:settings` cho `HO_MARKETING` |
| 6 | Kiệt | RoleSwitcher: đổi sang từng vai rồi về "Mọi vai trò" — mỗi lần **HTTP 200**, menu thu hẹp, không `PermissionError` | fix crash `#13` + `menuActorForRole` |

> Phép 6 phải đo được: **HTTP 200 + không có lỗi trong Sentry/log**, chứ không phải "trông có vẻ ổn".

### 4.2 Phép GHI có target — đây mới là thứ v2 thật sự đổi

Menu tính bằng action **trần** (không target), nên §4.1 **về nguyên tắc không thể** phát hiện hai kiểu hỏng
nguy hiểm nhất của v2. Bỏ qua mục này là **tự cho mình sự tự tin giả**.

| # | Vai | Thao tác | Kỳ vọng |
|---|---|---|---|
| 7 | Toại (QL CS2) | sửa 1 lead **thuộc CS2** | **THÀNH CÔNG** — v2 không khoá anh ấy khỏi cơ sở mình |
| 8 | Toại | mở/sửa 1 bản ghi **thuộc CS1** (qua URL trực tiếp) | **BỊ CHẶN** — `scopedDb` cách ly cơ sở |
| 9 | Mỹ (Giáo vụ CS2) | điểm danh 1 buổi **thuộc CS2** | **THÀNH CÔNG** — `attendance:edit[CENTER]` khớp target |
| 10 | Mỹ | điểm danh 1 buổi **thuộc CS1** | **BỊ CHẶN** |

Bốn phép này **có ghi**. Nếu không muốn ghi lên prod → dựng chúng trên **staging/preview với bản seed
giống prod** và chạy **trước** khi flip prod. Đừng bỏ, chỉ đổi chỗ chạy.

### 4.3 Điều kiện ABORT — phải đo được

Rollback ngay nếu bất kỳ điều nào:

- error-rate trong Sentry/Vercel logs **vượt baseline** trong 2 phút liên tiếp *(ghi baseline ở Pha 0)*;
- bất kỳ vai nào **không đăng nhập được**;
- `/dashboard` trả **5xx**;
- **Kiệt mất `/roles`** — mất đường cứu hộ, rollback không do dự;
- phép 7 hoặc 9 **thất bại** (v2 khoá người ta khỏi chính cơ sở mình);
- phép 8 hoặc 10 **thành công** (rò rỉ chéo cơ sở) — 🔴 nặng nhất, rollback + không flip lại cho tới khi tìm ra.

---

## 5. Pha 3 — Rollback *(đây mới là thứ đang được đo)*

1. **Đặt env `RBAC_V2_ENABLED = false` TRƯỚC.** Làm trước, không phải sau: nó thu hẹp cửa sổ mà một
   deploy vô tình có thể bật lại v2. Đổi env **không** tác động deployment đang chạy, nên bước này an toàn
   và không mất giây nào của phép đo.
2. Vercel → Deployments → **`D1`** → **Instant Rollback** *(Promote to Production)*.
3. **Bấm giờ** tới khi `admin.satarobo.vn` phục vụ `D1`. Kỳ vọng **< 60 giây** (đổi con trỏ ở tầng routing,
   không build lại).
4. Kiểm sau rollback:
   - Toại **thấy lại 9 mục**;
   - Mỹ vẫn vào admin bình thường;
   - **Cookie tồn dư:** ai đã chọn vai v2 trong RoleSwitcher (cookie `sr_active_role = "CENTER_SALES_CSM"`)
     → menu quay về **"Mọi vai trò"**, **không 500**. Đây là tính chất cố ý của #47: `resolveActiveRoleFrom`
     trả `null` khi mã cookie không thuộc danh sách vai hợp lệ của hệ quyền đang chạy.
     👉 Test bằng tài khoản **đã có cookie từ trước khi rollback**, không phải phiên mới tinh — phiên mới
     không tái hiện được ca này.
5. Nhớ: Vercel đã **tắt auto-assign domain**. Khi muốn deploy tiếp → *Undo Rollback* / promote lại.

**Nếu `D1` không promote được** → đường lui #2: env đã `false` từ bước 1, chỉ cần **Redeploy** (một build
đầy đủ). Ghi thời gian thật. Vẫn nên đạt cổng < 10 phút, **nhưng phải coi đường nhanh là HỎNG** và tìm hiểu
trước khi flip thật.

---

## 6. Pha 4 — Ghi nhận & dọn

- [ ] Thời gian rollback đo được: `____` giây.
- [ ] Bật lại Vercel Cron (nếu đã tạm dừng). Mở lại `main`.
- [ ] **Đối soát dữ liệu ghi trong cửa sổ.** Đây là phần dễ quên nhất: các row tạo/sửa **dưới v2** (kể cả do
      `dispatch-events`) **ở lại** sau khi rollback code. Nếu v2 gán `centerId` sai thì đó là dữ liệu bẩn,
      không "lui" theo cờ. Query các bản ghi `createdAt`/`updatedAt` trong khung giờ, xác nhận `centerId` đúng.
- [ ] **Đừng dùng delta `RbacShadowDiff` của buổi diễn tập làm tín hiệu.** 6 phép đọc = traffic không đáng kể,
      delta ~0 kể cả khi v2 sai. Ngược lại, các dòng shadow sinh **trong cửa sổ ON** sẽ **làm bẩn "đồng hồ sạch"**
      của Phần C. Sau rollback: đánh dấu/loại các dòng thuộc khung giờ diễn tập, hoặc `TRUNCATE` rồi đếm lại.

**PASS:** rollback < 10 phút (thực tế nên < 2 phút) · không 5xx · phép 7 & 9 thành công · phép 8 & 10 bị chặn
· 4 vai đăng nhập bình thường sau rollback.

---

## 7. Flip thật

Lặp **Pha 1 + Pha 2** rồi **để nguyên**. Giữ `D1` (không xoá) ít nhất **1 tuần**. Giữ shadow chạy — sau
rollback `checkPermission` **vẫn** tính cả v1 lẫn v2 và ghi `RbacShadowDiff` khi lệch
(`permission-eval.ts:23-28`, không hề gate theo cờ), nên dữ liệu vẫn tiếp tục về.

Trước khi flip thật, **báo trước cho Toại**: đúng thời điểm flip anh ấy mất 9 nhóm quyền —
`payments/orders/vouchers/products:manage`, `inventory:audit`, `honors:settings`,
`students/enrollments/leads:delete`.
