# RUNBOOK P3 + P4 — shadow resolver `dataScope` rồi cutover sang cây đơn vị

> Phạm vi: US-12 (P3, shadow) và US-13 (P4, cutover). Đọc kèm `RUNBOOK-P1.md`
> (dời cây + backfill `orgUnitId`) — P3 **giả định P1 đã chạy xong trên PROD**,
> vì không có `orgUnitId` trong dữ liệu thì chẳng có gì để so.

---

## 0. Việc này đổi cái gì, và không đổi cái gì

Hệ thống đang đo phạm vi dữ liệu bằng **`centerId`**. Đích là đo bằng **`orgUnitId`**
(cây đơn vị) — mở cơ sở mới chỉ là thêm dữ liệu, và khối vùng/hội sở mới có nghĩa.

P3 **không đổi gì cả**: nó chạy cách đo mới song song cách đo cũ, so, ghi lệch.
P4 mới lật, bằng một cờ.

**Không có bước nào drop cột.** `centerId` vẫn còn nguyên sau P4 (AC3 chỉ gỡ *ghi
kép*, và chỉ sau 7 ngày ổn định kể từ khi lật).

---

## 1. Bật shadow (P3)

**Điều kiện:** migration `20260813000000_nen_p3_us12_scope_shadow` đã áp (tạo bảng
`ScopeShadowDiff`). Trên prod nó đi cùng `deploy.yml` khi merge vào `main`.

1. Vercel → Production → env `SCOPE_SHADOW_ENABLED="true"`.
2. **Redeploy.** Nơi nhận cắm ở `instrumentation.ts`, chỉ chạy lúc khởi động server —
   đặt env mà không redeploy thì shadow không chạy và bảng rỗng.
3. Sau ~1 giờ dùng thật, kiểm có số:

   ```
   gh workflow run nen-p3-bao-cao-shadow.yml --ref main -f ngay=1
   ```

   Bảng rỗng ⇒ đọc mục "KHÔNG có bản ghi nào" trong chính báo cáo, nó liệt kê 3 chỗ
   phải kiểm theo thứ tự.

**Tải thêm:** mỗi lượt `can()` thêm một phép so trong bộ nhớ; ghi DB chỉ khi LỆCH,
CHƯA PHỦ, hoặc trúng mẫu thưa **1/500** ca GIỐNG.

> Vì sao vẫn ghi ca GIỐNG dù thưa: nếu chỉ ghi lệch thì khi hệ sạch bảng sẽ RỖNG, và
> lúc đó "0 lệch trong 7 ngày" không phân biệt được với "shadow không chạy ngày nào".
> Mẫu thưa là **mẫu số** — nó cho cổng quyền nói "đã đo, và đo sạch".

---

## 2. Đọc báo cáo — con số nào trước

Chạy hằng đêm 03:00 VN, hoặc gọi tay:

```
gh workflow run nen-p3-bao-cao-shadow.yml --ref main -f ngay=7
```

Đọc theo thứ tự này, **không phải theo thứ tự bảng in ra**:

| # | Con số | Nghĩa | Làm gì |
|---|---|---|---|
| 1 | **CHƯA PHỦ** | chỗ gọi chưa truyền `orgUnitId` vào `Target` ⇒ cách đo mới **chưa từng được thử** ở đó | thêm `orgUnitId` vào target ở chỗ gọi; báo cáo liệt kê theo `permissionKey` |
| 2 | **LỆCH** | lật cờ sẽ **đổi** quyết định ⇒ có người mất/được quyền | điều tra từng ca bằng câu SQL báo cáo in sẵn |
| 3 | **GIỐNG** | mẫu chứng | chỉ dùng để biết shadow có chạy |

**CHƯA PHỦ đứng trước LỆCH** vì "0 lệch" khi chưa phủ còn cao là sạch trên mẫu rỗng.
Và vì cách đo mới **fail-closed**: thiếu `orgUnitId` là TỪ CHỐI. Mỗi lượt chưa phủ
hôm nay là một cú 403 vào ngày lật cờ.

---

## 3. Cổng cutover (P4 · AC1)

```
pnpm tsx scripts/nen-p4-kiem-cong.ts --ngay 7
```

Thoát 0 = đủ điều kiện. Ba điều kiện, không phải một:

1. 0 lượt **LỆCH**;
2. 0 lượt **CHƯA PHỦ**;
3. có bản ghi shadow ở **đủ 7 ngày riêng biệt** — chống xanh giả.

---

## 4. Lật cờ (P4 · AC2)

**Cờ KHÔNG nằm ở env.** Nó là `SystemSetting("orgScope.cutoverEnabled")`, sửa ở màn
**Cấu hình** (chỉ SUPER_ADMIN, bắt buộc ghi lý do, có audit).

> Vì sao không dùng env: AC2 đòi rollback **một thao tác, không cần deploy**. Đổi env
> trên Vercel là phải redeploy — vài phút, và suốt lúc chờ thì quyền vẫn sai.

**Bật:** Cấu hình → `orgScope.cutoverEnabled` → `true` + lý do.
Hiệu lực ≤ 5 phút (TTL cache cấu hình), không deploy.

**Rollback:** đặt lại `false`. Cùng độ trễ. Đường tắt cờ giữ **y nguyên** mã cũ —
mọi nhánh mới đều nằm sau `if (actor.orgScopeCutover)`, nên rollback là quay về đúng
mã đang chạy hôm nay, không phải một đường thứ ba.

**Diễn tập trước khi làm thật (TS-14):** bật trên `test`, bấm vài màn có lọc theo cơ
sở, tắt lại, bấm lại. Đo thời gian từ lúc bấm tắt tới lúc hành vi về cũ — phải < 1 phút
cộng TTL.

---

## 5. Sau 7 ngày ổn định (P4 · AC3) — CHƯA LÀM

Khi cờ đã bật và chạy sạch 7 ngày:

- gỡ ghi kép `centerId` → `orgUnitId` (`lib/org/dual-write.ts`);
- đánh dấu cột `centerId` **deprecated** trong `schema.prisma`;
- **KHÔNG drop cột** (luật cứng #4 + mẫu 2 pha của repo).

Đây là việc **chưa được phép làm** cho tới khi §3 xanh và §4 chạy đủ 7 ngày.

---

## 6. `OWN` của phụ huynh (P4 · AC4) — ĐÃ LÀM, không phụ thuộc cờ

`can(actor, key, { studentId })` nay khớp scope `OWN` khi actor là người giám hộ của
học viên đó (`Student.parentUserId`, nạp vào `actor.guardedStudentIds`).

**Không buộc vào cờ cutover**, vì đây là sửa lỗi chứ không phải đổi đơn vị đo: trước
đó quyền của phụ huynh kiểm bằng `assertOwnsStudent` gọi tay **ngoài** `can()` — vi
phạm luật cứng #1, và quên một chỗ gọi là IDOR. Buộc nó vào cờ nghĩa là phụ huynh
phải chờ hết pha shadow mới hết bị 403.

Ba hành vi được ghim bằng test (TS-15): xem con mình ⇒ được; đổi ID sang học viên
khác ⇒ từ chối; gỡ liên kết ⇒ từ chối ngay ở request kế tiếp.

---

## 7. Điều đã biết trước, đừng ngạc nhiên

**Nhánh `PermissionGrant` sẽ gần như im lặng.** Bảng đó gần như không có dòng nào —
cả repo chỉ có **một** chỗ ghi vào nó (`admin/user-groups/_actions.ts`, chỉ grant cấp
nhóm). Nên trong báo cáo, cột `PermissionGrant` ~0 là **đúng**, không phải shadow hỏng.

Vì vậy shadow đo **cả** nhánh `PermEntry` (`scopeType: "CENTER"`) — đó mới là thứ
prod đang thật sự dùng để chặn, và là thứ cờ cutover lật. Nếu chỉ đo nhánh
`PermissionGrant` thì P3 đo một đằng, P4 lật một nẻo.
