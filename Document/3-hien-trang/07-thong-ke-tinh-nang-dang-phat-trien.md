# 07 — Thống kê tính năng đang phát triển

> **Bản tái lập 18/08/2026.** Bản gốc "chốt sổ 28/07/2026" là file untracked (chưa từng commit) và đã mất khỏi máy — nội dung cũ KHÔNG khôi phục được từ git. Bản này tái lập theo những gì **đã xác minh lại được đến 18/08**; các mục kế thừa từ bản 28/07 chưa rà lại được đánh dấu ⚠️.
>
> Nguyên tắc giữ nguyên từ bản 28/07: trạng thái lấy từ **code + git + đo thật**, KHÔNG chép từ bảng ticket kế hoạch (`phases/R7/README.md` dừng cập nhật 15/06 và `FL-R2-fixlms-round2.md` đã lệch code — nhiều mục ghi TODO nhưng code có rồi).

---

## 1. Module Ảnh lớp / Kho ảnh — ✅ ĐÃ NGHIỆM THU E2E (18/08/2026)

**Chuỗi tính năng** (đều đã merge `main`, LIVE trên test + prod):

| Mốc | Commit | Nội dung |
|---|---|---|
| 02/08 | `e7cfa298` + migration `20260802090000_media_status_draft` | Kho ảnh buổi học: upload lô vào kho `DRAFT`, GV chọn ảnh gửi PH |
| 11/08 | `303d7d95` | Mở rộng: **Marketing + Giáo vụ góp ảnh vào kho**; GV vẫn là người duy nhất gửi PH. Hai cổng quyền `canStageToClass` / `canPublishToClass` + action mới `media:upload-draft`. Tài liệu: `docs/kho-anh-lop.md` |

**Kết quả nghiệm thu tay toàn tuyến trên `test.satarobo.vn` (18/08/2026)** — PASS đủ vai, chạy bằng browser thật:

| Vai (account test) | Kết quả |
|---|---|
| MARKETING (`nv.marketing.01@seed…`, HO_MARKETING@HO) | ✅ Vào `/media`, form tự chuyển chế độ "Góp ảnh vào kho của lớp" (không có đường gửi PH), thấy lớp mọi cơ sở, upload → DRAFT thành công, ghi đúng tên người tải |
| Giáo vụ `CENTER_CLASS_MANAGER` (gán tạm @CS1 cho sale seed) | ✅ Vào `/media` **chỉ nhờ vai v2** (legacy role 0 quyền media) — dropdown chỉ hiện lớp CS1 (cách ly cơ sở đúng), góp kho OK, **chỉ xoá được ảnh của chính mình** (ảnh người khác không có nút xoá) |
| SALES_CSM thuần (`nv.kinh_doanh.01@seed…`) | ✅ Đúng thiết kế R7-09: `/media` đá về dashboard, menu ẩn — sale KHÔNG có UI upload (chỉ còn đường tầng action cho sale phụ trách lớp) |
| TEACHER (`giaovien.test@…`, GV lớp Sata3 test) | ✅ Kho hiện ảnh marketing góp + tên người tải; chặn gửi khi chưa chọn HS/chưa tick "Ảnh chung cả lớp" (C6.2); HS chưa consent bị gạch khỏi gắn thẻ (C6.3); gửi class-wide + gắn buổi → PENDING |
| CENTER_MANAGER (`nv.ban_giam_doc.01@seed…`, QLCS CS1) | ✅ Thấy ảnh "Chờ" ở `/media`, duyệt ✓ → APPROVED; xoá ảnh (dialog xác nhận) hoạt động |
| PARENT (`phuhuynh.test@…`, 2 con học đúng lớp) | ✅ Portal `/portal/hinh-anh` hiện album mới theo đúng buổi GV gắn ("Buổi 14 · 12/08/2026 · 1 ảnh") sau khi duyệt |

Dữ liệu test đã dọn sạch sau nghiệm thu (DB 0 record, R2 0 object, vai gán tạm đã gỡ).

**Phát hiện hạ tầng trong lúc nghiệm thu (quan trọng):**

1. 🔴→✅ **Bucket R2 của env test (`satarobo-test`) chưa từng được áp CORS** → trước 18/08 **mọi role** đều không upload được ảnh qua browser trên test.satarobo.vn (preflight OPTIONS 403, "chết câm" — server presign vẫn 200 nên không test tự động nào bắt được; y hệt sự cố bucket chat 10/08). **Đã vá 18/08** (áp CORS qua Cloudflare dashboard — token trong `.env.r2test` và `.env.local` đều không có quyền `PutBucketCors`). Bài học lặp: bucket mới nào cũng phải chạy `scripts/apply-r2-cors.ts --bucket=<tên>` một lần.
2. ✅ **RBAC v2 đang ON trên env `test`** — xác minh thực nghiệm 18/08 (vai chỉ-có-ở-v2 hoạt động). Test = prod = v2; chỉ local/dev còn chạy v1.
3. ⚠️ **Chưa kiểm CORS bucket PROD** cho luồng upload ảnh browser trên `admin.satarobo.vn`/`giaovien.satarobo.vn` — nếu bucket prod cũng chưa áp CORS thì upload ảnh trên prod chết câm y hệt. Nên smoke 1 lần trên prod.

**Việc còn treo của module:**

- ⬜ **Gán vai Giáo vụ cho người thật** — DB test/dev hiện KHÔNG ai giữ `CENTER_CLASS_MANAGER` (ngoài `uat.sale@satarobo.vn`); gán qua `/admin/users/[id]/org-roles`. Prod: cần seed-prod-roles đã chạy sau 11/08 (RoleDef `media:upload-draft`) — dev/test đã seed, prod chưa xác minh từ phiên này.
- ⬜ **Cờ `MEDIA_SIGNED_URL` vẫn OFF** (`lib/flags.ts:81`, mặc định OFF) — ảnh lớp đang render bằng URL R2 công khai (`pub-*.r2.dev`); bật dần để siết quyền truy cập ảnh (mục 🟡 từ bản 28/07, còn nguyên).
- ⬜ Bug UX màn login (ảnh hưởng UAT tay, không riêng module này): form Waves **nuốt lần submit đầu** sau điều hướng (hydration wipe) — fix nằm ở branch `fix/teacher-e2e-login-hydration` CHƯA merge.

---

## 2. Các luồng in-flight kế thừa từ bản 28/07 — ⚠️ CHƯA RÀ LẠI (18/08)

> Bản 28/07 thống kê 5 luồng đang dở. Từ đó đến nay `main` đã nhận thêm ~130 commit (lead-intake P3/P4, chat F5, nhận xét buổi học, nền hệ thống P1/P2, a11y…) nên trạng thái dưới đây **phải verify lại bằng `lib/flags.ts` + `git log` trước khi báo cáo**:

| Luồng (theo bản 28/07) | Trạng thái 28/07 | Ghi chú 18/08 |
|---|---|---|
| AUTH-SĐT (email→SĐT qua Zalo ZNS) | Plan xong, CHƯA code, chờ chốt ngân sách ZNS + câu chữ mẫu tin | ⚠️ chưa rà lại; plan tại `Document/0-yeucau/3-ke-hoach-trien-khai/phases/AUTH-SDT-chuyen-doi-xac-thuc.md` (file có sửa 11/08) |
| Batch tính năng 25/07 (14 task/6 nhóm — nặng nhất thu học phí Q1-Q4/Q7/Q8/Q11) | Chờ user chốt câu hỏi | ⚠️ chưa rà lại |
| FIN-01/FIN-02 (sổ tiền) | Đang dở | ⚠️ chưa rà lại |
| Cờ tính năng OFF (28/07: 7 cờ OFF/11) | — | ⚠️ đếm lại từ `lib/flags.ts` khi cần (18/08 xác nhận riêng: `MEDIA_SIGNED_URL` vẫn OFF; `TEACHER_SITE_ENABLED` ON; `RBAC_V2_ENABLED` ON prod+test) |
| Backlog FL-R2 / R6 / R7b | Bảng ticket đã lệch code — nhiều mục TODO nhưng code có rồi | ⚠️ giữ nguyên cảnh báo: đừng chép trạng thái từ file phase |

---

*Cập nhật gần nhất: 18/08/2026 — thêm mục 1 (nghiệm thu E2E kho ảnh lớp + phát hiện CORS/RBAC v2). Người cập nhật sau nhớ ghi ngày + căn cứ đo (code/git/đo thật).*
