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
| 8 | `tests/nen/position-permission.spec.ts` | chưa đo — **đã từng đỏ một lần 08/09**, sổ quan sát ghi *"chưa loại trừ: rò trạng thái giữa hai lượt"*. Đây là ứng viên số 1 |
| 6 | `tests/cham-cong/period.spec.ts` | chưa đo |
| 6 | `tests/cham-cong/timelog.spec.ts` | chưa đo · 2 `beforeAll` |
| 5 | `tests/cham-cong/recompute.spec.ts` | chưa đo |
| 5 | `tests/nen/work-scope.spec.ts` | chưa đo |
| 4 | `tests/cham-cong/import.spec.ts` | ✅ đo rồi — **có 1 lỗ**, đã vá |
| 4 | `tests/chat/parent-permission.spec.ts` | chưa đo |
| 2 | `tests/nen/import-nhan-su-va.spec.ts` | chưa đo |

**Có `beforeEach` (không vào danh sách, nhưng vẫn nên đo):**
`tests/cham-cong/sua-gio-quet-tay.spec.ts` · `tests/lead-intake/health.spec.ts`

⚠️ Bộ lọc để lập danh sách này **đã sai một lần**: bản đầu lọc theo chuỗi `PrismaClient` và
**bỏ sót đúng `permission-matrix.spec.ts`** — file duy nhất lúc đó đã biết là có lỗ — vì nó
lấy `db` từ helper. Danh sách "sạch" của một bộ lọc hẹp chỉ nói lên bộ lọc.

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
