# Runbook: bật "Thu học phí linh hoạt" cho riêng CS2

> Chủ dự án chốt 18/09/2026: pilot **một cơ sở trước**, và **chủ dự án tự bật**.
> Backfill `Payment.orderItemId` đã chạy xong trên prod (run `35296161114`): 146 khoản / 119 đơn.
> Còn lại đúng **4 khoản / 4.836.000đ** trên `ORD-260917-000001` (CS2, 2 con) — đó là đơn để thử.

---

## 0 · Hai điều phải biết TRƯỚC khi bật

### KHÔNG có màn nào bật riêng cho một cơ sở

Màn `/admin/cau-hinh-van-hanh` (tab **Tiền**) **chỉ ghi công tắc TOÀN HỆ** — nó gọi
`saveGlobalSettingAction`. Server Action cho override theo cơ sở **có tồn tại**
(`saveCenterSettingAction`) nhưng **0 component nào gọi nó**, tức chưa có giao diện.

⇒ Bật riêng CS2 **phải bằng SQL**. Đó là hiện trạng, không phải lựa chọn thiết kế.

### Cờ đọc qua CACHE 300 GIÂY — sửa bằng SQL KHÔNG có tác dụng tức thì

`getSetting` bọc trong `safeCache` với `revalidate: 300` (`lib/settings/service.ts:45`).

| Đường sửa | AuditLog | Hiệu lực sau |
|---|---|---|
| màn cấu hình (`setCenterSetting`) | **CÓ** — ai bật, lúc nào, lý do | **ngay** (tự xoá cache) |
| SQL tay | **KHÔNG** | **tới 5 phút** |

⚠️ Hệ quả cho ca sự cố: **SQL không phải công tắc ngắt nhanh.** Xem mục 4.

---

## 1 · BẬT cho CS2

Chạy trên **Supabase SQL Editor** (prod). Ba câu, chạy lần lượt.

### 1.1 — Xác nhận công tắc toàn hệ đang TẮT

```sql
SELECT key, "valueJson", "updatedByName", "updatedAt"
FROM "SystemSetting"
WHERE key = 'billing.flexV1Enabled';
```

**Kỳ vọng: 0 dòng** (chưa ai bật ⇒ theo mặc định `false`), hoặc 1 dòng `valueJson = false`.
Nếu ra `true` thì **toàn hệ đã bật rồi** — dừng lại và đọc mục 4, vì lúc đó việc cần làm là
*gỡ CS1 ra*, không phải *thêm CS2 vào*.

### 1.2 — Lấy `OrgUnit.id` của CS2

```sql
SELECT id, code, name, path FROM "OrgUnit" WHERE code = 'CS2';
```

Phải ra **đúng 1 dòng**, `path = '/ho/danang/cs2/'`.

⚠️ **`orgUnitId`, KHÔNG phải `centerId`.** `CenterSetting` khoá theo `OrgUnit.id`; đưa
`Center.id` vào thì tra không ra dòng nào và hàm **âm thầm rơi về giá trị toàn hệ** — cờ riêng
của cơ sở không có tác dụng mà không lỗi nào báo.

### 1.3 — Ghi override BẬT cho CS2

Câu này tự tra `OrgUnit.id` nên không phải chép id bằng tay.

> **Đã đối chiếu 18/09/2026** (chủ dự án kiểm hộ trên prod): `OrgUnit` CS2 =
> `cmraivxqv000dxb0jmfx2r700`, `code = 'CS2'`, `centerId = 'co-so-hoang-dieu'`.
> Câu dưới dùng `ou.code = 'CS2'` nên ra đúng dòng đó — **không sửa thành id gõ tay**: id gõ
> tay đúng hôm nay và sai vào ngày ai đó dựng lại cây OrgUnit, còn `code` thì không.

```sql
INSERT INTO "CenterSetting" ("orgUnitId", "key", "valueJson", "updatedByName", "updatedAt")
SELECT ou.id, 'billing.flexV1Enabled', 'true'::jsonb,
       'Chu du an (SQL tay) - pilot CS2 18/09/2026', now()
FROM "OrgUnit" ou
WHERE ou.code = 'CS2'
ON CONFLICT ("orgUnitId", "key")
DO UPDATE SET "valueJson" = 'true'::jsonb,
              "updatedByName" = EXCLUDED."updatedByName",
              "updatedAt" = now()
RETURNING "orgUnitId", "key", "valueJson", "updatedAt";
```

Ba chi tiết **không được bỏ**:
- `'true'::jsonb` — **JSON boolean**, không phải chuỗi `'"true"'`. Schema là `z.boolean()`;
  chuỗi sẽ không validate và giá trị bị coi là không hợp lệ.
- `"updatedAt" = now()` — cột `TIMESTAMP(3) NOT NULL` **không có DEFAULT** (Prisma quản
  `@updatedAt` ở tầng app, không ở tầng DB). Thiếu nó là câu INSERT sập.
- `"updatedByName"` — vì SQL tay **không ghi AuditLog**, cột này là dấu vết duy nhất còn lại.
  Ghi rõ "SQL tay" để lần sau không ai tưởng nó do màn cấu hình ghi.

#### 1.3b — KIỂM NGAY: phải ghi được ĐÚNG MỘT DÒNG

| Nơi chạy | Kết quả ĐÚNG | Kết quả SAI |
|---|---|---|
| `psql` / terminal | `INSERT 0 1` | `INSERT 0 0` |
| Supabase SQL Editor | **1 dòng trả về** (nhờ `RETURNING`) | **0 dòng / "No rows returned"** |

> ⛔ **Ra `INSERT 0 0` (hoặc 0 dòng) ⇒ KHÔNG CÓ DÒNG NÀO ĐƯỢC GHI. DỪNG LẠI. ĐỪNG GỌI SALE.**
>
> Cờ vẫn đang TẮT — sale vào sẽ không thấy nút, rồi báo "hệ thống lỗi", và ta mất một lượt thử
> vì một việc chưa làm xong.
>
> Nguyên nhân gần như chắc chắn: **câu `SELECT` không tìm ra `OrgUnit`** nào có `code = 'CS2'`
> (viết thường `cs2`? cây OrgUnit vừa bị dựng lại?). `ON CONFLICT DO UPDATE` **không bao giờ**
> cho ra 0 dòng khi `SELECT` có dữ liệu — kể cả khi dòng đã tồn tại, nó vẫn báo 1. Nên 0 dòng
> chỉ có một nghĩa: **không có gì để ghi**.
>
> Cách chữa: chạy lại câu **1.2** (`SELECT id, code, name, path FROM "OrgUnit" WHERE code='CS2'`).
> Nó cũng phải ra 1 dòng. Không ra thì sai `code`, không phải sai câu INSERT.

⚠️ Vì sao thêm `RETURNING`: **Supabase SQL Editor không in mã lệnh `INSERT 0 1`** như `psql` —
nó chỉ báo thành công chung. Không có `RETURNING` thì phép kiểm "ghi được mấy dòng" **không quan
sát được ở đúng nơi ta đang chạy**, tức một phép kiểm chỉ tồn tại trên giấy. `RETURNING` làm nó
hiện ra thành dữ liệu thật.

---

## 2 · SQL KIỂM sau khi bật — phải ra ĐÚNG CS2

```sql
SELECT ou.code                                   AS co_so,
       ou.name,
       cs."valueJson"                            AS co_rieng,
       (SELECT s."valueJson" FROM "SystemSetting" s
         WHERE s.key = 'billing.flexV1Enabled')  AS co_toan_he,
       CASE
         WHEN cs."valueJson" IS NULL THEN 'theo toàn hệ'
         WHEN cs."valueJson" = 'true'::jsonb THEN 'BẬT (riêng cơ sở)'
         ELSE 'TẮT (riêng cơ sở)'
       END                                       AS ket_qua,
       cs."updatedByName", cs."updatedAt"
FROM "OrgUnit" ou
LEFT JOIN "CenterSetting" cs
       ON cs."orgUnitId" = ou.id AND cs.key = 'billing.flexV1Enabled'
WHERE ou.type = 'CENTER'
ORDER BY ou.code;
```

**Kỳ vọng đúng:**

| co_so | co_rieng | co_toan_he | ket_qua |
|---|---|---|---|
| CS1 | `NULL` | `NULL` hoặc `false` | theo toàn hệ |
| **CS2** | **`true`** | `NULL` hoặc `false` | **BẬT (riêng cơ sở)** |

⚠️ Câu này liệt kê **mọi** cơ sở, kể cả cơ sở không khai gì — cố ý. Một câu chỉ `SELECT … FROM
"CenterSetting"` sẽ ra một dòng CS2 và trông như "đúng rồi", mà không nói được CS1 có bị bật
lây hay không. Muốn kiểm "chỉ đúng một nơi bật" thì phải thấy cả những nơi KHÔNG bật.

**Chờ HƠN 5 phút** rồi mới thử trên giao diện (cache 300s — mục 0). Cảnh báo đầy đủ cho
người thao tác nằm ở đầu mục 3, **cố ý đặt ngay cạnh bước bấm** chứ không ở ghi chú cuối:
một điều kiện đặt ở chỗ không ai đọc thì bằng không có.

---

## 3 · Checklist cho SALE — HAI đơn, HAI việc KHÁC NHAU

> # ⏳ ĐỢI HƠN 5 PHÚT SAU KHI CHẠY INSERT, RỒI SALE MỚI THAO TÁC
>
> Cờ đọc qua cache **300 giây** (`revalidate: 300`). SQL tay **không xoá cache**, nên trong
> **5 phút đầu** hệ thống vẫn đang trả giá trị CŨ.
>
> **Nút gắn chưa hiện trong 5 phút đầu là BÌNH THƯỜNG — KHÔNG phải lỗi.** Đừng báo sự cố,
> đừng bấm lại nhiều lần, đừng chạy lại INSERT. Chỉ cần **đợi**.
>
> Cách làm đúng: chạy INSERT (mục 1.3) → **xem đồng hồ, chờ đủ 5 phút** → chạy SQL kiểm
> (mục 2) → **rồi** mới gọi sale vào làm.
>
> Người giao việc nên nói câu này cho sale TRƯỚC khi họ mở máy. Một người được bảo "vào thử
> đi" rồi thấy không có nút sẽ kết luận tính năng hỏng — và kết luận ấy khó gỡ hơn 5 phút chờ.

**Pilot chạy trên HAI đơn, và chúng thử hai thứ khác nhau. Đừng gộp làm một:**

| Đơn | Hiện trạng | Thử việc gì |
|---|---|---|
| `ORD-260917-000001` | 2 con · **4 khoản** đã thu chưa gắn con (mỗi lần chuyển một khoản), **không** có giao dịch ngân hàng phía sau | **Gắn** từng khoản cho từng bé |
| `ORD-260918-000001` | 2 con · **MỘT** khoản 9.530.000đ cho cả hai · đợt đang mở 9.478.000đ | **B1 ·** cổng tạo đợt (phải CHẶN) — rồi **B2 · TÁCH** khoản cho hai bé |

> ⛔ **B2 ĐANG TẠM DỪNG**: khoản 9.530.000đ lệch **26.000đ** so với hai nửa học phí và **chưa ai giải thích được** khoản chênh ấy. Phải hỏi phụ huynh / kế toán rồi mới tách — chi tiết ở mục **B2** bên dưới. **Đừng tự dồn 26.000đ vào bé nào.**

Quyền — **ba việc, ba quyền khác nhau**:

| Việc | Quyền |
|---|---|
| Gắn khoản cho bé · **Tách khoản cho nhiều bé** | `payments:record` |
| Bỏ gắn (kế toán) | `payments:manage` |
| Tạo / huỷ đợt | `orders:manage` |

> ⚠️ **TÁCH cố ý dùng chung quyền với GẮN**, dù nó có sinh một bút toán đảo bên trong. Bút
> toán ấy đúng bằng −số tiền dòng gốc và trỏ thẳng vào dòng gốc, nên nó **không đổi tổng tiền
> của đơn một đồng nào** — nó là cơ chế của phép ghi, không phải một quyết định về giá trị.
> Việc thật mà người bấm đang làm vẫn là *"9.530.000đ này của bé nào"*, đúng việc của sale.

> ⚠️ Bản runbook trước ghi *"`payments:record` (gắn + chia + tạo đợt)"* — **sai ở vế cuối**.
> `taoDotChoConAction` gác bằng `requireOrdersManage()`, tức `orders:manage`. Người chỉ có
> `payments:record` sẽ **gắn được khoản nhưng không tạo được đợt**. Biết trước để đừng gọi
> nhầm người rồi tưởng tính năng hỏng.

---

### ĐƠN A · `ORD-260917-000001` — gắn 4 khoản cho 2 con

Đơn này ở **CS2**, **2 con**, có **4 khoản đã thu chưa gắn con**:
`1.188.000 · 1.230.000 · 1.188.000 · 1.230.000` = **4.836.000đ**.

> ⚠️ **Bốn khoản này KHÔNG có giao dịch ngân hàng phía sau.** Đó là lý do phải làm ở
> **trang đơn**, không phải ở `/admin/bien-dong-so-du` — màn kia liệt kê giao dịch ngân
> hàng, mà 4 khoản này không có dòng nào ở đó. Ai đi tìm chúng bên `bien-dong-so-du` sẽ
> không thấy gì và kết luận nhầm là mất tiền.

**Bước 1 — Mở đơn, xem công nợ theo con**
1. Vào `admin.satarobo.vn/admin/orders`, tìm `ORD-260917-000001`, bấm mở.
2. Kéo tới khối **"Công nợ theo con"**.
3. Phải thấy **2 dòng con**, mỗi dòng 4 ô: **Học phí · Đã thu · Chờ xác nhận · Còn nợ**.
4. Phải thấy khung vàng **"Có 4.836.000đ đã vào đơn nhưng chưa gắn cho con nào"**, bên trong
   là **4 dòng khoản**, mỗi dòng có nút **"Gắn cho bé…"**.

> ⛔ **DỪNG nếu:** khối "Công nợ theo con" **không hiện**. Kiểm theo ĐÚNG THỨ TỰ này:
>   1. đã đủ **5 phút** từ lúc chạy INSERT chưa? Chưa ⇒ **đợi**, không phải lỗi;
>   2. đủ 5 phút rồi ⇒ chạy lại SQL **mục 2**, xem CS2 có ra `BẬT (riêng cơ sở)` không;
>   3. SQL đúng mà màn vẫn không hiện ⇒ **báo lại**, đừng thử tiếp bằng cách khác.

**Bước 2 — Gắn từng khoản cho đúng bé**
5. Bấm **"Gắn cho bé…"** trên một dòng → chọn bé ở ô **"— chọn bé —"** → bấm **"Gắn"**.
6. Lặp lại cho đủ **4 khoản**.

> ⚠️ Mỗi dòng khoản có thêm chữ nhỏ **"kế toán chưa xác nhận"**. Đó là BÌNH THƯỜNG và
> **vẫn gắn được**. Gắn con ≠ xác nhận kế toán — hai việc rời nhau, làm độc lập.

> ⚠️ **Một khoản gắn cho ĐÚNG MỘT bé.** Chia một khoản cho hai bé **chưa hỗ trợ** — màn hình
> có in đúng câu đó. Gặp ca phải xé đôi một khoản thì **báo lại**, đừng tìm cách lách.

> ⛔ **DỪNG nếu:** **nút "Gắn cho bé…" không hiện** dù khung vàng có. Hai lý do và chúng khác
> nhau: thiếu quyền `payments:record`, hoặc cờ chưa ăn. Kiểm SQL mục 2 trước; cờ đúng thì là
> quyền. **Đừng nhờ người quyền cao hơn bấm hộ** — làm vậy là mất luôn phép thử này.

**Bước 3 — Kiểm ngay trên giao diện**
7. Khung vàng **"chưa gắn cho con nào" biến mất**.
8. **Σ ô "Chờ xác nhận" của 2 con = 4.836.000đ.**
9. Ô **"Đã thu"** của hai con vẫn **0đ** — **ĐÚNG**, không phải lỗi: kế toán chưa xác nhận
   khoản nào. Tiền nay đã biết là của bé nào, nhưng chưa vào công nợ chính thức.

> ⛔ **DỪNG NGAY nếu thấy bất kỳ dấu hiệu nào dưới đây** — và **đừng gắn thêm khoản nào nữa**:
>
> | Dấu hiệu | Nghĩa là |
> |---|---|
> | Σ "Chờ xác nhận" của 2 con **≠ 4.836.000đ** | có khoản gắn nhầm con, hoặc gắn hai lần |
> | **"Còn nợ" của một con ÂM** | con đó nhận quá phần của mình |
> | khung vàng **vẫn còn tiền** | có khoản chưa gắn xong |
> | nút gắn biến mất giữa lúc làm | cờ vừa bị tắt, hoặc phiên hết hạn |
>
> Bỏ gắn cần `payments:manage` (kế toán) — sale **không** tự gỡ. Báo lại, đừng chữa.

---

### ĐƠN B · `ORD-260918-000001` — HAI việc: cổng tạo đợt, rồi TÁCH KHOẢN

> ⚠️ **Số của đơn này đã ĐÍNH CHÍNH theo lượt pilot 20/09.** Bản runbook trước ghi tổng
> 20.064.000đ / 3 đợt mở 15.228.000đ — đó là ảnh chụp cũ. Số ĐÚNG, do chính chủ dự án đọc ra
> từ câu lỗi của cổng:

| | |
|---|---|
| tổng đơn | **19.008.000đ** = 8.976.000 (bé A) + 10.032.000 (bé B) |
| phụ huynh đã chuyển | **9.530.000đ** — MỘT lần, cho CẢ HAI con, kế toán chưa xác nhận |
| đợt đang mở | **9.478.000đ** (= 19.008.000 − 9.530.000) |

---

#### B1 · Cổng tạo đợt — kết quả ĐÚNG là BỊ CHẶN

10. Mở đơn, xem khối **"Công nợ theo con"**.
11. Thử **tạo một đợt** cho một bé, số tiền bất kỳ (kể cả **1đ**).

**Phải BỊ CHẶN**, câu lỗi nhắc tới **ĐƠN** — lượt pilot 20/09 nhận đúng câu *"còn nợ đơn
9.478.000đ, đợt đang mở 9.478.000đ"*.

> **Vì sao chặn mới là đúng:** đơn còn được thu 9.478.000đ, mà số đó đã bị các đợt đang mở
> chiếm trọn. Mở thêm một đợt nữa là phát QR đòi phần phụ huynh vừa chuyển.
>
> ⛔ **Nếu nó CHO TẠO ⇒ cổng hai vế không ăn. DỪNG PILOT, báo ngay.**

12. Muốn đơn này thu thêm cho đúng thì phải **huỷ bớt đợt cũ** rồi mới tạo đợt theo con. Việc
    đó cần `orders:manage` — **kế toán làm, không phải sale**.

---

#### B2 · TÁCH KHOẢN 9.530.000đ cho hai bé  ⭐ việc chính của lượt này

Đơn này là ca CHÍNH của module: **một lần chuyển, hai con**. Khoản 9.530.000đ đang nằm ở khối
vàng *"chưa gắn cho con nào"*.

> # ⛔ CHƯA TÁCH ĐƯỢC — CÒN 26.000đ CHƯA AI GIẢI THÍCH ĐƯỢC
>
> **Đọc mục này trước khi mở màn hình. Đừng bấm "Tách" rồi mới đọc.**
>
> Hai nửa học phí của hai bé cộng lại **không bằng** số phụ huynh đã chuyển:
>
> ```
>   4.488.000  (nửa học phí bé A — 8.976.000 ÷ 2)
> + 5.016.000  (nửa học phí bé B — 10.032.000 ÷ 2)
> ───────────
>   9.504.000
>   9.530.000  ← tiền thật đã vào tài khoản
> ───────────
>      26.000  ← CHÊNH, chưa ai giải thích được
> ```
>
> **26.000đ ấy là tiền thật.** Nó có thể là phụ huynh làm tròn, có thể là số học phí ghi sai,
> có thể là một khoản phụ phí — **hiện chưa ai biết**.
>
> ### Luật của lượt này
>
> **KHÔNG tự dồn 26.000đ vào bé nào.** Không sale, không kế toán, không hệ thống.
>
> Hệ thống cố ý **không gợi ý** cách chia: nó chỉ từ chối và in ra *"còn THIẾU 26.000đ"*.
> Runbook này cũng **không in cặp số nào** để chép — vì chép một cặp số là chốt hộ một quyết
> định nghiệp vụ mà chưa ai ra quyết định.
>
> ### Phải làm gì
>
> 1. **HỎI phụ huynh / kế toán** 26.000đ ấy là gì.
> 2. Chờ **chủ dự án đưa cặp số đúng**.
> 3. **Rồi mới** làm bước 13–16 dưới đây.
>
> Trong lúc chờ: **đừng tách đơn này**. Ô đếm ngược trên màn hình sẽ khoá nút "Tách" cho tới
> khi tổng khớp — đó đúng là chỗ buộc người dùng dừng lại và đi hỏi, không phải lỗi giao diện.

---

**Khi đã có cặp số đúng thì làm như sau:**

13. Trên dòng khoản **9.530.000đ**, bấm **"Tách cho nhiều bé…"** (nút nằm cạnh *"Gắn cho bé…"*).
14. Nhập số tiền cho **từng bé**. Màn hình in **"tối đa …"** cho mỗi bé và một dòng đếm
    **"Đã chia … · còn THIẾU …"** ngay dưới.
15. Nút **"Tách"** chỉ sáng khi **đã chia ĐÚNG BẰNG 9.530.000đ** và có **từ hai bé trở lên**.
16. Bấm **"Tách"**.

**Kiểm ngay trên màn — bốn điều:**
- khối vàng *"chưa gắn cho con nào"* **biến mất**;
- Σ hai ô **"Chờ xác nhận"** = **9.530.000đ** (bằng đúng cặp số vừa nhập);
- ô **"Đã thu"** của hai bé **vẫn 0đ** — ĐÚNG, kế toán chưa xác nhận;
- tổng đơn, *"còn nợ"* của đơn **KHÔNG ĐỔI** — tách là đổi cách ghi tên chủ của tiền, không
  phải thu thêm.

> ⛔ **DỪNG NGAY nếu:** Σ hai ô "Chờ xác nhận" ≠ 9.530.000đ · một bé có **"Còn nợ" ÂM** ·
> khối vàng vẫn còn tiền · *"còn nợ đơn"* đổi số.

> ⚠️ **TÁCH RỒI KHÔNG GỘP LẠI ĐƯỢC.** Không có nút hoàn tác, và đó là chủ đích: sau khi tách,
> hai phần là hai khoản bình thường mà kế toán có thể đã xác nhận / từ chối / xuất phiếu thu.
>
> Nhập nhầm số thì đường sửa là: **kế toán bỏ gắn từng phần** (`payments:manage`, bắt buộc ghi
> lý do) → rồi **gắn hoặc tách lại**. Tổng tiền không đổi ở bất kỳ bước nào.
>
> Cái không lấy lại được: sau khi bỏ gắn, khối vàng hiện **hai dòng** chứ không phải một dòng
> 9.530.000đ như ban đầu.

**Đây là lý do phải hỏi cho ra 26.000đ TRƯỚC khi tách**, chứ không phải tách đại rồi sửa sau.

#### Sau khi tách — việc của KẾ TOÁN

Hai phần nay là hai khoản riêng, nên kế toán **xác nhận / từ chối từng phần độc lập**, và
**mỗi bé có phiếu thu riêng**. Xác nhận phần của bé A trong khi từ chối phần của bé B là hợp
lệ: nợ bé A giảm thật, nợ bé B quay lại đủ.

⚠️ Phần của một bé **chưa có ghi danh** thì kế toán chưa xác nhận được (hệ thống cần ghi danh
để phát phiếu thu). Gắn ghi danh trước ở màn nhân sự/lớp, rồi xác nhận.

---

## 4 · SQL để chủ dự án tự kiểm SAU KHI sale làm xong

```sql
SELECT p.id                    AS payment_id,
       p.amount,
       oi."itemName"           AS con,
       p."orderItemId",
       p."accountantStatus",
       p."paidDate"
FROM "Payment" p
JOIN "Order"      o  ON o.id = p."orderId"
LEFT JOIN "OrderItem" oi ON oi.id = p."orderItemId"
WHERE o.code = 'ORD-260917-000001'
  AND p."deletedAt" IS NULL
ORDER BY p."paidDate", p.amount;
```

**Ba điều phải đúng:**
1. **4 dòng**, và **không dòng nào** có `orderItemId` là `NULL`;
2. `orderItemId` rơi vào **đúng 2 giá trị khác nhau** (2 con), không phải 1, không phải 3;
3. `SUM(amount) = 4 836 000`.

Một câu gộp trả lời cả ba, `ket_qua` phải là `ĐẠT`:

```sql
SELECT COUNT(*)                                        AS so_khoan,
       COUNT(*) FILTER (WHERE p."orderItemId" IS NULL) AS con_chua_gan,
       COUNT(DISTINCT p."orderItemId")                 AS so_con_duoc_gan,
       SUM(p.amount)                                   AS tong_tien,
       CASE WHEN COUNT(*) = 4
             AND COUNT(*) FILTER (WHERE p."orderItemId" IS NULL) = 0
             AND COUNT(DISTINCT p."orderItemId") = 2
             AND SUM(p.amount) = 4836000
            THEN 'ĐẠT' ELSE 'KHÔNG ĐẠT — soi từng dòng bằng câu trên' END AS ket_qua
FROM "Payment" p
JOIN "Order" o ON o.id = p."orderId"
WHERE o.code = 'ORD-260917-000001' AND p."deletedAt" IS NULL;
```

### Còn `ORD-260918-000001` — HAI phép kiểm, cho HAI việc

#### B1 · cổng tạo đợt: đơn phải KHÔNG CÓ ĐỢT NÀO MỚI

**Khi cổng làm đúng việc, bước B1 KHÔNG để lại dấu vết nào trong DB.** Bằng chứng "cổng có
chặn" nằm ở **câu lỗi trên màn hình**, không ở SQL.

Nên câu SQL dưới đây kiểm điều ngược lại. Chạy nó **HAI lần — ngay trước khi sale thử, và
ngay sau** — rồi so hai kết quả với nhau.

```sql
SELECT COUNT(*)                          AS so_dot_dang_mo,
       COALESCE(SUM(pr."amountDue"), 0)  AS tong_tien_dang_doi
FROM "PaymentRequest" pr
JOIN "Order" o ON o.id = pr."orderId"
WHERE o.code = 'ORD-260918-000001'
  AND pr.status IN ('PENDING', 'PARTIAL');
```

- **Hai lượt ra cùng số** ⇒ cổng đã chặn. Đạt.
- **`so_dot_dang_mo` tăng** ⇒ cổng đã cho tạo. **Báo ngay**, đó là con bug cần chặn.

> ⚠️ **Đừng đóng cứng số đợt vào phép kiểm.** Lúc pilot (20/09/2026) đơn này đang đòi
> 9.478.000đ, nhưng kế toán có thể huỷ bớt đợt bất cứ lúc nào. Một câu
> `CASE WHEN COUNT(*) = 3` sẽ báo đỏ vì lý do chẳng liên quan — và một cổng báo đỏ sai là
> cổng người ta học cách bỏ qua. Thứ phải bằng nhau là **trước và sau**.

#### B2 · tách khoản: bốn dòng, tổng KHÔNG ĐỔI

Sau khi tách, khoản 9.530.000đ nở thành **4 dòng**: dòng gốc (giữ nguyên) · một bút toán
**đảo** `−9.530.000` · và **hai phần** mang tên hai bé. Cộng lại vẫn đúng 9.530.000đ.

```sql
SELECT p.id,
       p.amount,
       p."paymentType",
       p."accountantStatus",
       oi."itemName"      AS con,
       p."adjustmentOfId"
FROM "Payment" p
JOIN "Order" o ON o.id = p."orderId"
LEFT JOIN "OrderItem" oi ON oi.id = p."orderItemId"
WHERE o.code = 'ORD-260918-000001' AND p."deletedAt" IS NULL
ORDER BY p."createdAt";
```

Một câu gộp trả lời cả cụm, `ket_qua` phải là `ĐẠT`:

```sql
SELECT COUNT(*)                                                  AS so_dong,
       COUNT(*) FILTER (WHERE p."paymentType" = 'ADJUSTMENT')    AS so_but_toan_dao,
       COUNT(*) FILTER (WHERE p."orderItemId" IS NOT NULL)       AS so_phan_da_gan_be,
       COUNT(DISTINCT p."orderItemId")                           AS so_be_nhan,
       SUM(p.amount)                                             AS tong_tien,
       CASE WHEN SUM(p.amount) = 9530000
             AND COUNT(*) FILTER (WHERE p."paymentType" = 'ADJUSTMENT') = 1
             AND COUNT(*) FILTER (WHERE p."orderItemId" IS NOT NULL) = 2
            THEN 'ĐẠT' ELSE 'KHÔNG ĐẠT — soi từng dòng bằng câu trên' END AS ket_qua
FROM "Payment" p
JOIN "Order" o ON o.id = p."orderId"
WHERE o.code = 'ORD-260918-000001' AND p."deletedAt" IS NULL;
```

> ⚠️ **`tong_tien` là con số phải nhìn trước tiên.** Nó phải bằng **đúng 9.530.000** — y hệt
> trước khi tách. Tách là đổi cách ghi tên chủ của tiền, không phải thu thêm. `tong_tien` mà
> khác đi thì **dừng ngay**, đừng tách thêm đơn nào nữa.
>
> ⚠️ Thấy một dòng **`−9.530.000`** là BÌNH THƯỜNG, không phải tiền bị trừ mất: nó là bút
> toán đảo đi kèm dòng gốc, và cặp gốc/đảo cộng lại bằng 0. Đó là cách cuốn sổ ghi "dòng này
> đã được chia lại" mà không sửa dòng gốc.

---

## 5 · TẮT NHANH khi có sự cố

### Câu lệnh

```sql
-- Gỡ CS2 ra khỏi tính năng. Ghi FALSE, KHÔNG xoá dòng.
UPDATE "CenterSetting" cs
SET "valueJson" = 'false'::jsonb,
    "updatedByName" = 'TAT KHAN - su co pilot CS2',
    "updatedAt" = now()
WHERE cs.key = 'billing.flexV1Enabled'
  AND cs."orgUnitId" = (SELECT id FROM "OrgUnit" WHERE code = 'CS2');
```

⚠️ **Ghi `false`, đừng `DELETE` dòng.** Xoá dòng nghĩa là "cơ sở không khai gì" ⇒ CS2 **rơi về
công tắc toàn hệ**. Hôm nay toàn hệ đang tắt nên hai cách trông giống nhau — nhưng ngày toàn hệ
được bật, cái `DELETE` ấy sẽ **bật lại CS2** đúng lúc không ai ngờ. Ghi `false` là tắt **có chủ
đích**, và `giaiCongTac` phân biệt `undefined` với `false` chính vì việc này.

⚠️ **Tắt toàn hệ KHÔNG gỡ được CS2.** Override của cơ sở **thắng** công tắc toàn hệ (cả hai
chiều). Đặt `SystemSetting` về `false` mà CS2 vẫn khai `true` thì CS2 **vẫn bật**.

### Hiệu lực: tới 5 PHÚT, không tức thì

Cache `revalidate: 300`. **Đây là điểm yếu thật của đường SQL, không phải chi tiết nhỏ** — trong
5 phút đó sale vẫn gắn được tiền. Nếu cần chặn NGAY thì chặn ở **người**: bảo sale dừng bấm, rồi
mới chạy SQL.

### Đơn đã tạo đợt / đã gắn tiền thì sao

**Tắt cờ KHÔNG hoàn lại gì.** Nói rõ từng thứ:

| Thứ đã tạo | Sau khi tắt cờ |
|---|---|
| `Payment.orderItemId` đã gắn | **GIỮ NGUYÊN**. Cột này không do cờ quản; backfill đã điền 146 khoản khi cờ đang tắt |
| Phiếu thu theo con (`PaymentRequest.orderItemId` ≠ NULL) | **GIỮ NGUYÊN**, vẫn nhận được tiền qua webhook |
| Mã QR đã in theo đợt của con | **VẪN QUÉT ĐƯỢC** — QR nằm ngoài cờ |
| Màn "Công nợ theo con" | **ẨN** |
| Nút gắn theo con trên biến động số dư | **ẨN** — quay về đường gắn cả đơn (`ganGiaoDichVaoDon`) |
| Nút **"Gắn cho bé…"** / **"Tách cho nhiều bé…"** / **"Bỏ gắn"** trên trang đơn | **ẨN**. Khoản đã gắn vẫn gắn, khoản đã tách vẫn tách — chỉ mất đường sửa |
| Khoản đã **TÁCH** | **GIỮ NGUYÊN** cả 4 dòng (gốc · bút toán đảo · hai phần). Tắt cờ KHÔNG gộp chúng lại |

⇒ **Tắt cờ = dừng tạo cái MỚI, không phải hoàn cái CŨ.** Đúng như `lib/settings/registry.ts:308`
đã dặn: *"BẬT RỒI TẮT LẠI KHÔNG VÔ HẠI: phiếu thu đã sinh theo con vẫn nằm đó khi cờ tắt.
Đường lùi là tắt cho đơn MỚI rồi xử lý tay số đơn đã lỡ sinh."*

Nên nếu sự cố là **số tiền sai**, tắt cờ **không sửa** nó. Việc phải làm là **gỡ gắn**, và
cả hai đường gỡ đều cần `payments:manage` — nhưng chúng **không làm cùng một việc**:

| Khoản đó đến từ đâu | Đường gỡ | Nó làm gì |
|---|---|---|
| Có **giao dịch ngân hàng** đằng sau (gắn ở `/admin/bien-dong-so-du`) | *"Gỡ gắn"* trên màn biến động số dư | sinh **bút toán đảo** có log và đưa giao dịch về `UNMATCHED` |
| **Không** có giao dịch ngân hàng (4 khoản của đơn A) | *"Bỏ gắn"* trên trang đơn, **bắt buộc ghi lý do** | chỉ đưa `Payment.orderItemId` về `NULL` + AuditLog. **Không** bút toán đảo, **không** giao dịch nào về `UNMATCHED` — vì chẳng có giao dịch nào để về |

> ⚠️ Đừng chờ thấy giao dịch quay về `UNMATCHED` sau khi *"Bỏ gắn"* ở đơn A. Chờ một dấu
> hiệu không bao giờ tới rồi kết luận "gỡ không ăn" là cách nhanh nhất để gỡ hai lần. Bằng chứng
> đúng là ô **"Chờ xác nhận"** của bé đó giảm xuống và khoản quay về khung vàng.

---

## Việc còn treo, KHÔNG thuộc runbook này

- **7 giao dịch / 28.472.000đ** khớp đơn `CONFIRMED` đã hết phiếu mở →
  `docs/ra-soat-giao-dich-khop-don-confirmed.md` (giao kế toán).
- **4 giao dịch / 25.388.000đ** không khớp đơn/lead/học viên nào → sale tra tay (mục A2 nhóm 3
  của báo cáo đối soát).
- Chưa có **giao diện** cho override theo cơ sở — nay phải SQL, không có AuditLog, hiệu lực trễ
  5 phút. Nếu pilot mở rộng ra nhiều cơ sở thì đây là việc phải làm trước.
