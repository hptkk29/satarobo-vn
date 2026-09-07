# Luật đọc số và luật kết luận

| | |
|---|---|
| **Lập** | 07/09/2026, sau hai lần kết luận sai trong cùng một tuần |
| **Áp dụng cho** | mọi báo cáo, mọi phiên làm việc, mọi module |
| **Ai đọc** | agent và người viết báo cáo cho chủ dự án |

Hai luật dưới đây ra đời từ hai sự cố có thật, không phải từ nguyên tắc chung. Mỗi
luật kèm sự cố sinh ra nó, vì luật không có vết thương đi kèm thì lần sau không ai nhớ.

---

## Luật 1 — "0 dòng trên prod" KHÔNG được dùng để hạ mức nghiêm trọng

Một bảng rỗng nói lên **hai chuyện hoàn toàn khác nhau**, và chúng đòi hai hành động
ngược nhau. Phân biệt bằng **đường ghi còn sống hay đã chết**, không bằng số dòng.

| Đo được | Nghĩa | Phải làm |
|---|---|---|
| Đường ghi **SỐNG** + 0 dòng | **Bom hẹn giờ.** Chưa ai kích, không phải không kích được. | **Chặn ngay.** Cầu dao tính năng, không đợi lịch. |
| Đường ghi **CHẾT** + 0 dòng | Tính năng **chưa tồn tại** trên thực tế. | Xếp vào **vé xây**, không phải vé sửa. |

**Mỗi lần báo một con số 0, phải ghi kèm nó thuộc loại nào.** Không ghi = báo cáo
chưa xong.

> **Sự cố sinh ra luật (07/09/2026).** `RefundRequest` đo được 0 dòng trên prod. Đọc
> vội thành "hoàn tiền không phải việc gấp". Nhưng đường tạo đơn hoàn tiền vẫn sống, và
> `refund.ts` đọc `sessionsLearned = 0` (vì buổi kẹt ở SCHEDULED) nên nó đề xuất **hoàn
> 100% học phí** cho mọi đơn. 0 dòng ở đây nghĩa là *chưa ai bấm*, không phải *bấm cũng
> không sao*.

### Hệ quả: mọi con số phải ghi kèm phép tính sinh ra nó

Ghi **nhãn** là chưa đủ; phải ghi **cách ra số**. Số đo được và số suy ra phải tách
bạch, ở hai dòng khác nhau.

```
✅ "~16–20 tin đêm đầu — SUY RA: giả định 285 buổi phân bố đều trên 01/06→07/09
    (2,9 buổi/ngày × cửa sổ 7 ngày). CHƯA đo."
✅ "609/609 buổi có giờ khác nửa đêm — ĐO: psql trên satarobo_local,
    count(*) FILTER (WHERE date::time <> '00:00:00')."
❌ "khoảng 16–20 tin."
❌ "phần lớn buổi có giờ."
```

---

## Luật 2 — kết luận "hệ thống KHÔNG có cơ chế X" phải kiểm trên `origin/main`

Nhánh feature tụt sau `main` là trạng thái **bình thường**, không phải ngoại lệ. Đọc mã
trên nhánh đang đứng rồi kết luận về **hệ thống** là đọc một ảnh chụp quá khứ.

**Bắt buộc trước khi viết câu "không có / chưa có / không đường nào":**

```bash
git fetch origin main
git rev-list --left-right --count origin/main...HEAD   # trái = main đi trước bao nhiêu
git log origin/main --oneline -S "<từ khoá của cơ chế>" -- <đường dẫn>
git merge-base --is-ancestor <commit> origin/main       # cơ chế đó có trên prod chưa
```

Câu khẳng định phủ định phải nói rõ **đo trên ref nào, lúc nào**:
*"Không có handler nào tự đóng buổi — đo trên `origin/main` @ `6ce7ff9c`, 07/09/2026."*

> **Sự cố sinh ra luật (07/09/2026).** Báo cáo khẳng định *"không cron/handler nào tự
> đóng buổi; chỉ 2 chỗ ghi `status = COMPLETED`"*. Sai. Khối `#TU-HOAN-TAT` (commit
> `8b2ed43a`, 04/09/2026) tự đóng buổi sau khi lưu điểm danh, **đã trên `main` ⇒ đã lên
> prod**. Nhánh chấm công lúc đó tụt sau `main` **87 commit**, nên đọc mã trên nhánh là
> đọc hiện trạng của bốn ngày trước. Chẩn đoán, thứ tự ưu tiên và cả thiết kế việc C đều
> dựng trên tiền đề sai đó.

### Hệ quả: gộp `main` là việc ĐẦU TIÊN của phiên, không phải việc cuối

Độ lệch **tăng mỗi ngày** (60 → 87 trong một ngày, tại repo này). Giá phải trả tăng theo
hai đường cùng lúc: xung đột đắt hơn, **và** kết luận sai nhiều hơn. Đo trước khi gộp,
không cần chạm cây làm việc:

```bash
git merge-tree --write-tree origin/main HEAD   # thoát 1 = có xung đột
```

⚠️ Khi gộp mà `main` sửa file nhánh mình **đã xoá** (`CONFLICT (modify/delete)`), phải
mở từng bản vá của `main` ra đọc trước khi giữ việc xoá — bản vá bảo mật biến mất ở đây
thì **không để lại dấu vết nào** trong diff cuối.

---

## Luật 3 — chú thích không phải bằng chứng, schema mới là

Khi một con số phụ thuộc vào **hình dạng dữ liệu** (cột có giờ không, null nghĩa là gì,
đơn vị là gì), phải xác minh trên **schema + dữ liệu thật**, không tin chú thích.

> **Sự cố sinh ra luật (07/09/2026).** `HoanTatInput.ngayBuoi` chú thích
> *"(`@db.Date` — nửa đêm UTC của ngày VN)"*. Schema thật là `@db.Timestamptz(6)`, và
> đo trên `satarobo_local`: **609/609 buổi mang giờ thật (08:00–18:00), 0 buổi nửa đêm**.
> Cổng `ngayBuoi > vnDateOnly(now)` vì thế **luôn** trả "chưa tới ngày" trong chính ngày
> dạy ⇒ cơ chế tự đóng buổi không bao giờ nổ. Bộ test còn đóng dấu cho giả định sai: ca
> *"buổi HÔM NAY cũng đóng được"* truyền đúng nửa đêm — một hình dạng dữ liệu không tồn
> tại trong DB. **Test xanh, prod chết.**

Cách xác minh rẻ nhất, theo thứ tự:

1. đọc `prisma/schema.prisma` — kiểu cột thật;
2. một câu `psql` đếm phân bố (`count(*) FILTER (WHERE ...)`), không lấy mẫu 1 dòng;
3. chạy chính hàm đó với **một giá trị thật lấy từ DB**, in ra quyết định.

Bước 3 là bước biến "tôi nghĩ" thành "tôi đo".
