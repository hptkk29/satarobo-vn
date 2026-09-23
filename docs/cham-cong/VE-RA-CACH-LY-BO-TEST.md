# VÉ — rà cách ly toàn bộ các bộ test chạm Postgres (luật 18)

> **Trạng thái:** MỞ. Ghi 10/09/2026 sau khi vá hai lỗ đầu tiên trên PR #242.
> **Đây là danh sách CẦN ĐO, không phải danh sách LỖI.** Thiếu `beforeEach` không tự động
> là sai — nhiều bộ cố ý dùng `beforeAll` cho dữ liệu CHỈ ĐỌC. Phép đo thật là **chạy từng
> ca một mình**.

---

## Vì sao có vé

Luật 18 (`docs/luat-doc-so-va-ket-luan.md`): *mỗi ca test phải XANH khi chạy MỘT MÌNH.*
Bộ xanh khi chạy đủ chỉ chứng minh thứ tự hiện tại đang cứu nhau.

Đã đo hai file, **cả hai đều có lỗ, và cả hai đều có sẵn** — không cần runner chậm:

| file | ca | chạy một mình | đã vá |
|---|---|---|---|
| `tests/cham-cong/import.spec.ts` | *import lại y hệt → không tạo mới* | `expected 486 to be +0` | ✅ PR #242 |
| `tests/chat/permission-matrix.spec.ts` | *[AC3] mở khoá LopA* | `expected undefined to match object { locked: false, status: "ACTIVE" }` | ✅ PR #242 |

Tỉ lệ: **2 file đo → 2 file có lỗ.** Đó là lý do phải rà nốt chứ không suy ra "chắc còn lại ổn".

---

## Cách đo (dùng lại cho từng file)

```
pnpm exec vitest list -c <config> <spec>        # lấy danh sách ca
pnpm exec vitest run  -c <config> <spec> -t "<chuỗi hẹp, duy nhất>"
```

⚠️ **Hai bẫy đã dính, đừng dính lại:**

1. `-t` nhận **regex**, và truyền cả chuỗi `describe > describe > it` thì **không khớp ca
   nào** — mọi lượt "xanh" với **0 ca chạy**. Lọc bằng riêng tiêu đề của `it`, đã escape.
2. Bộ đo phải **ép đúng 1 ca chạy**. 0 hoặc >1 ⇒ báo *không kết luận*, KHÔNG tính là xanh.
   Bản đầu của script thiếu vế này và cho ra 20/20 "sạch" hoàn toàn giả.

---

## Danh sách cần đo — 16 file, ≥2 ca thật, không có `beforeEach`/`afterEach` nào

Sắp theo số ca (nhiều ca = nhiều cặp có thể mượn nhau = ưu tiên cao hơn).
✅ = đã đo và đã vá trong PR #242.

| ca | file | ghi chú |
|---:|---|---|
| 29 | `tests/chat/dm-us13.spec.ts` | chưa đo |
| 20 | `tests/chat/permission-matrix.spec.ts` | ✅ đo rồi — **có 1 lỗ**, đã vá |
| 19 | `tests/lead-intake/ingest.spec.ts` | chưa đo |
| 18 | `tests/chat/db-invariants.spec.ts` | chưa đo · có **7** `beforeAll` |
| 14 | `tests/cham-cong/khung-ca.spec.ts` | chưa đo |
| 14 | `tests/chat/list-and-admin-search.spec.ts` | chưa đo |
| 11 | `tests/cham-cong/requests.spec.ts` | chưa đo |
| 9 | `tests/chat/dm-f5-sale.spec.ts` | chưa đo |
| 8 | `tests/nen/position-permission.spec.ts` | ✅ đo 23/09 — **CÓ LỖ, đã vá**. Nhưng KHÔNG phải cơ chế mà sổ quan sát đoán: xem mục "Lỗ thứ hai" dưới |
| 6 | `tests/cham-cong/period.spec.ts` | chưa đo |
| 6 | `tests/cham-cong/timelog.spec.ts` | chưa đo · 2 `beforeAll` |
| 5 | `tests/cham-cong/recompute.spec.ts` | chưa đo |
| 5 | `tests/nen/work-scope.spec.ts` | ✅ đo 23/09 — **CÓ LỖ, cùng nguyên nhân với `position-permission`**, đã vá |
| 4 | `tests/cham-cong/import.spec.ts` | ✅ đo rồi — **có 1 lỗ**, đã vá |
| 4 | `tests/chat/parent-permission.spec.ts` | chưa đo |
| 2 | `tests/nen/import-nhan-su-va.spec.ts` | chưa đo |

**Có `beforeEach` (không vào danh sách, nhưng vẫn nên đo):**
`tests/cham-cong/sua-gio-quet-tay.spec.ts` · `tests/lead-intake/health.spec.ts`

⚠️ Bộ lọc để lập danh sách này **đã sai một lần**: bản đầu lọc theo chuỗi `PrismaClient` và
**bỏ sót đúng `permission-matrix.spec.ts`** — file duy nhất lúc đó đã biết là có lỗ — vì nó
lấy `db` từ helper. Danh sách "sạch" của một bộ lọc hẹp chỉ nói lên bộ lọc.

---

## Lỗ thứ hai — KHÔNG nằm trong file test, nằm trong HELPER DÙNG CHUNG [23/09/2026]

**Sổ quan sát đoán sai cơ chế, và cái đoán sai ấy suýt làm mất công đo.** Nó ghi
*"chưa loại trừ: rò trạng thái giữa hai lượt"* — tức nghi ca này mượn của ca kia **trong cùng
file**. Đo ra thì không phải: ba ca đỏ (`position-permission [AC2]` + 2 ca `work-scope`)
**đỏ ngay cả khi chạy MỘT MÌNH trên database trắng**, và xanh chỉ khi một bộ KHÁC đã chạy
trước đó trong cùng database.

### Nguyên nhân

`seedOrgUnits` (`prisma/seed-orgunit.ts`) **TRA** `Center` theo mã để gán `OrgUnit.centerId`;
nó không tạo `Center` — và đúng là không nên, vì trên prod danh mục cơ sở do người vận hành
giữ. Đường seed thật tôn trọng thứ tự đó (`prisma/seed.ts` dựng `Center` ở mục đầu rồi mới
gọi `seedOrgUnits`).

Nhưng helper test `seedOrg` thì gọi thẳng `seedOrgUnits`. Trên database TRẮNG:

```
seedOrg(["HO","CS1","CS2"])  →  OrgUnit CS1/CS2 có centerId = null
⇒ buildActor → visibleCenterIds: []   ⇒ 3 ca ĐỎ
```

Nó **xanh trên CI** vì `test:nen-db` chạy SAU `test:chat-db` trong cùng job, mà bộ chat có
dựng `Center`. Tức bộ này mượn trạng thái của **một bộ khác**, không phải của ca khác.

### Vá

`seedOrg` upsert `Center` cho các cơ sở được xin **trước** khi gọi `seedOrgUnits`, lấy dữ
liệu từ chính `CENTERS` của `seed-orgunit` (export thêm — không chép danh sách thứ hai), rồi
**cổng FAIL-LOUD**: OrgUnit cơ sở nào còn `centerId = null` thì ném ngay tại tầng seed. Không
có cổng đó thì một lần lệch mã lại cho ra fixture hỏng âm thầm, và ta quay về đúng chỗ vừa
thoát ra — triệu chứng ở tầng phân quyền, nguyên nhân ở tầng seed.

Đo sau vá: `tests/nen` **30/30 ngay lượt đầu** trên DB trắng tinh; **từng spec chạy một mình**
trên DB mới tạo cũng xanh (5/5 file); 5 bộ DB chạy đúng thứ tự CI đều xanh. Cấy lại (gỡ phần
dựng `Center`) ⇒ đỏ đúng ba ca ban đầu.

### Bài học thêm vào phép đo ở mục "Cách đo"

Phép đo hiện tại (chạy từng ca, xem có mượn nhau không) **không bắt được lớp này**, vì nó giả
định thủ phạm nằm trong cùng file. Thêm một bước rẻ:

> **Chạy cả FILE một mình trên một database VỪA TẠO** (không phải database đã dùng), trước
> khi đi vào từng ca. Đỏ ở bước này nghĩa là fixture thiếu thứ gì đó mà bộ khác vẫn dựng hộ —
> và thủ phạm sẽ nằm ở HELPER, không nằm trong file.

Hình dạng nhận biết: **chạy một mình thì đỏ, chạy cả bộ thì xanh** — NGƯỢC với hình dạng mà
luật 18 mô tả (*"cấy vào thì chạy 1 ca ĐỎ, cả bộ XANH"*). Hai hình dạng, hai thủ phạm khác
nhau, và cùng một triệu chứng "CI xanh mà máy đỏ".

---

## Việc còn nợ, ngoài việc rà

### Trần thời gian của `tests/chat` — CHƯA quyết

Sau khi vá cách ly, câu hỏi trần vẫn còn:

```
tests/chat/permission-matrix.spec.ts, ca nặng nhất trên CI (lượt xanh) = 1 199 ms = 24% trần 5 000 ms
biến thiên giữa hai lượt CI đo được (cùng job, cùng mã)                 ≥ 4,85×
                                          1 199 × 4,85 ≈ 5 815 ms  →  VƯỢT trần
```

Khuôn có sẵn: `vitest.cham-cong.config.ts` (tách config riêng, không đụng bộ khác). Phép
tính và hệ số đều ghi trong file đó, kể cả câu *"ca cần hơn 20 s là ca phải TÁCH, không phải
trần phải nâng tiếp"*.

### Cổng tự động cho luật 18?

Chưa có. Chạy từng ca một mình cho **mọi** bộ DB là hàng trăm lượt vitest — quá đắt cho mỗi
PR. Ý tưởng chưa chốt: một job **hằng đêm** chạy phép rà này và mở issue khi có ca đỏ.
Chưa làm, chưa hứa.

---

## Phụ lục — CHỤP MÀN site giáo viên ở máy (15/09/2026)

Ghi lại vì lượt đầu mất 5 vòng thử mới chạy được, và cả 5 lỗi đều là bẫy MÔI TRƯỜNG chứ
không phải mã. Lần sau ai cần soi bố cục một màn GV thì khỏi dò lại.

Khuôn có sẵn: `playwright.teacher.config.ts` + `tests/e2e/_helpers/{seed,auth}.ts`
(`resetDb` · `seedOrg` · `seedRoles` · `seedUser` · `login`).

| Bẫy | Triệu chứng | Cách qua |
|---|---|---|
| **`AUTH_URL` của `.env.local`** | login xong bị đá về `localhost:3000/login`, treo tới hết timeout | `.env.local` đặt `AUTH_URL=http://localhost:3000` và nó THẮNG khối `env` của `webServer`. Tự bật dev server với `AUTH_URL`/`NEXTAUTH_URL`/`NEXT_PUBLIC_APP_URL` trỏ đúng cổng, rồi chạy `TEACHER_SKIP_WEBSERVER=1`. CI không dính vì CI không có `.env.local` |
| `seedOrg(["CS1"])` | `thiếu Center CS1` | Nó dựng **OrgUnit**, không dựng **Center** — hai cây khác nhau (`lib/org/center-bridge.ts`). Tạo `db.center` riêng |
| `ShiftAssignment.segments` | `Argument 'segments' is missing` | Cột bắt buộc, kiểu Json |
| `ShiftAssignment.templateId` | lỗi FK | Bắt buộc và trỏ `ShiftTemplate`. Chạy `seedShiftTemplates(db)` rồi tra id theo `code`; mã nào danh mục không có thì bỏ qua ô ca |
| `TEACHER_SITE_ENABLED` | `/teacher/*` đá về `/dashboard` | Phải `=true` cho tiến trình server |

⚠️ **Và bẫy thứ sáu, không phải môi trường:** giáo viên seed KHÔNG có `UserOrgRole` thì
`scopedDb` lọc sạch mọi bảng trong `SCOPED_MODELS`. Ở lượt chụp 15/09 nó làm thẻ "Kỳ công"
in **"Chưa lập kỳ"** cho một kỳ ĐÃ lập. Đó là dữ liệu fixture thiếu — nhưng nó phơi ra một
lỗi THẬT trong mã: `null` từ `scopedDb` không phân biệt được "chưa có" với "không được xem",
nên màn hình nói một câu SAI thay vì nói "không biết". Vá bằng `getMyPeriod` (own-rows).
**Chụp màn là thứ duy nhất tìm ra nó** — `tsc`, eslint và cả bộ test đều xanh.
