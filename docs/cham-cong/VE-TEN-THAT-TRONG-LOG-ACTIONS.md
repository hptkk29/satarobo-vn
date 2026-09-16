# VÉ — họ tên nhân sự thật nằm trong log GitHub Actions của repo PUBLIC

> **Trạng thái:** MỞ. Chủ dự án chốt 15/09/2026: *"ghi vé riêng và chỉ in userid"*.
> Hai script trong luồng đang dùng ĐÃ vá cùng ngày; phần còn lại là nội dung vé này.

---

## Sự việc

Repo `hptkk29/satarobo-vn` là **PUBLIC** (`gh repo view --json visibility` → `PUBLIC`,
đo 13/09/2026). Log của mọi lượt GitHub Actions trên repo public **ai cũng đọc được, không
cần đăng nhập**, và log được giữ 90 ngày.

Các script đo prod in kết quả **ra stdout** — đó là thiết kế có chủ đích ("in kết quả ra log,
không ghi file, không commit gì ngược lại repo"). Hệ quả không ai để ý: mọi **họ tên nhân sự
thật** mà script in ra cũng nằm trong log công khai ấy.

Ví dụ thật, lượt `viec = noi-chiu-cong-lech` ngày 13/09:

```
  người                          số ngày  đang ghi → đáng ra
  Hồ Đắc Phúc                          1  CS1 → HO
```

⚠️ **Đây không phải lỗ hổng bảo mật** — không có mật khẩu, chuỗi kết nối hay dữ liệu học
viên nào. Nhưng nó là **dữ liệu người thật** đi ra ngoài mà không ai quyết định cho nó đi.

---

## Đã vá (15/09/2026)

| Script | Trước | Sau |
|---|---|---|
| `scripts/do-noi-chiu-cong-lech.ts` | in `Hồ Đắc Phúc  1 ngày  CS1 → HO` | in `userId` · **bỏ luôn `name` khỏi câu `select`** |
| `scripts/tinh-lai-mot-ngay.ts` | in `name ?? email ?? id` — **email còn tệ hơn tên** | in `userId` |

**Bỏ khỏi `select` chứ không chỉ bỏ khỏi `console.log`**: không lấy thì không lỡ in. Một
dòng log thêm vào sau này sẽ không có gì để rò.

Tra `userId` → người: **Supabase SQL Editor**, không công khai. Việc này hiếm và nên hiếm.

---

## 🔑 Còn phải rà — danh sách ĐÃ ĐO, không phải ước lượng

Đếm bằng `grep -cE "user\.name|u\.name|tenNguoi|\.email"` trên các script mà
`cham-cong-prod-do-chi-doc.yml` gọi:

| Script | chỗ chạm tên/email người | `viec` gọi nó |
|---|---|---|
| `scripts/do-khung-ca-diem-cham.ts` | **2** | `khung-ca-diem-cham` |
| `scripts/do-noi-quet.ts` | **3** | `noi-quet` |
| `scripts/do-vai-ke-toan.ts` | **3** | `vai-ke-toan` |

Các script còn lại (`do-buoi-ket-theo-lop` · `do-cong-day-thuc-te` · `do-lech-buoi-day` ·
`do-danh-muc-nen` · `do-backlog-buoi-chua-chot` · hai script `backfill-*`) có chạm `.name`
nhưng là **tên CƠ SỞ / tên MÃ CA / tên LỚP** — không phải tên người. Không phải việc của vé này.

⚠️ Con số trên là **số chỗ chạm trong mã**, không phải số chỗ IN RA. Khi làm phải mở từng
chỗ xem nó có tới `console.log` không — đếm gộp là thổi số (luật đọc số).

---

## Ba hướng, chủ dự án chọn

| | việc | đánh đổi |
|---|---|---|
| **A** | Vá nốt 3 script trên theo đúng khuôn vừa dùng (bỏ khỏi `select`, in `userId`) | rẻ, nhất quán; đổi lại người vận hành đọc log khó hơn, phải tra id |
| **B** | Chuyển repo sang **private** | đóng luôn cả lớp vấn đề, kể cả log sau này. Nhưng Actions hết miễn phí (vé `VE-CI-DINH-KY-TREN-MAIN.md` đang tính chi phí dựa trên "repo public ⇒ phút Actions miễn phí"), và mọi tính toán ở đó phải làm lại |
| **C** | Giữ nguyên 3 script, chỉ vá đường nào chạm dữ liệu nhạy hơn | ranh giới "nhạy hơn" do người quyết từng lần ⇒ sớm muộn lệch |

Nghiêng về **A** — nó đã là khuôn đang chạy, và không kéo theo quyết định nào khác.

---

## Không thuộc vé này

- **Workflow GHI** (`cham-cong-prod-seed.yml`): cũng in log công khai, nhưng chỉ chủ dự án
  bấm được và nội dung là danh mục vận hành, không phải danh sách người. Rà sau, nếu cần.
- **Log Vercel** không công khai — khác chuyện.

## Liên quan

- `docs/cham-cong/USER-CHI-DOC-PROD.md` — user chỉ-đọc của workflow đo.
- `docs/cham-cong/VE-CI-DINH-KY-TREN-MAIN.md` — phần tính chi phí giả định repo PUBLIC.
