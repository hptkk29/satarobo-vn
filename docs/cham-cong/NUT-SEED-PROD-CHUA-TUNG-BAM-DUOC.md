# NÚT SEED PROD CHƯA TỪNG BẤM ĐƯỢC — đính chính một giả định

| | |
|---|---|
| **Ngày** | 07/09/2026 |
| **Về** | `.github/workflows/cham-cong-prod-seed.yml` |
| **Đổi giả định** | Từ *"nút đã dùng được, đang chờ bấm"* → **"nút chưa bao giờ tồn tại như một nút"** |

---

## Số đo

`cham-cong-prod-seed.yml` **có** trong danh sách workflow của GitHub. Nhưng ba lượt chạy của nó là:

```
2026-09-05T19:21:54Z  event=push  branch=hptkk29/module-cham-cong  failure
2026-09-05T19:21:51Z  event=push  branch=test                      failure
2026-09-05T19:21:49Z  event=push  branch=test                      failure
```

**Cả ba đều `event=push` và `failure`.** Không có lượt `workflow_dispatch` nào.

Đó chính là ba entry **"Invalid workflow file"** GitHub sinh ra khi không phân tích được YAML hỏng ở
commit `a435434b` — tên bước chứa `: ` không bọc ngoặc. Commit kế `9cac4113` đã vá cú pháp, nhưng ba
vết lỗi thì ở lại.

So sánh với một nút thật sự đang dùng: `seed-prod-roles.yml` có **28** lượt.

## Vì sao nó không bấm được

GitHub **chỉ đăng ký một workflow `workflow_dispatch` khi file có trên NHÁNH MẶC ĐỊNH** (`main`).
File này chỉ tồn tại trên `hptkk29/module-cham-cong` — `origin/main` và `origin/test` đều không có.

Nó lọt vào danh sách **không phải vì dùng được**, mà vì GitHub tạo entry lỗi khi phân tích thất bại
lúc push. Đó là một cái bẫy đọc: **thấy tên trong Actions không có nghĩa là bấm được.**

## Giả định bị đảo

Từ 06/09 tới nay, mọi bản báo cáo và kế hoạch đều ngầm coi nút seed prod là **thứ đã sẵn sàng, chỉ
chờ ai đó bấm** — kể cả câu "⚠️ Trước khi bấm: …" ngay trong header của chính file đó.

Thực tế: **nó chưa bao giờ chạy một lần nào.** Danh mục nền chấm công (mã ca, loại nghỉ, điểm chấm
công, phân loại buổi, loại công dạy) **chưa hề được seed lên prod**.

## Hệ quả — khi đưa nó lên main, coi là LẦN CHẠY ĐẦU TIÊN

Không phải "chạy lại". Cụ thể:

| Điều | Vì sao khác nhau |
|---|---|
| **Kỳ vọng số dòng** | Lần đầu: **tạo mới toàn bộ** (21 mã ca · 8 loại nghỉ · 2 điểm chấm · 7 phân loại buổi · 6 loại công dạy). Không phải "0 tạo, N cập nhật" như một lần chạy lại |
| **`--force` là vô nghĩa ở lần đầu** | Không có dòng nào để đè. Bật `force` lần đầu chỉ thêm rủi ro, không thêm tác dụng |
| **Bảng phạm vi in ra là thứ phải đọc** | Script tự in "đang có / sẽ tạo / sẽ đè" trước khi ghi. Lần đầu, cột **ĐANG CÓ phải toàn số 0**. Thấy khác 0 nghĩa là ai đó đã seed bằng đường khác — **dừng, tìm hiểu trước khi bấm** |
| **Điều kiện tiên quyết chưa chắc đã xong** | Header của file dặn migration phải lên prod trước. Vì nút chưa từng chạy, **không có bằng chứng nào** rằng dặn dò đó đã được làm. Bấm `Prod DB migrate status (read-only)` để kiểm |
| **Nghỉ "idempotent nên bấm thoải mái" là sai chỗ này** | Idempotent bảo vệ lần thứ hai trở đi. Lần đầu thì mọi ghi đều là ghi thật |

## Bài học chung

Ba thứ trong đợt này cùng một hình dạng — **có thật, nhưng không ai đọc / không ai chạy**:

| | |
|---|---|
| Bút toán `ADJUSTED` bên thanh toán | Dòng có thật, không phép cộng nào lấy ⇒ "điều chỉnh" không đổi một đồng |
| `tests/cham-cong` ngoài cổng merge | Test có thật, không job nào chạy ⇒ đỏ im lặng |
| **Nút seed prod** | **Tên có thật trong Actions, chưa lượt dispatch nào** ⇒ tưởng đã sẵn sàng |

Cách kiểm nhanh cho lần sau — đừng tin danh sách, hỏi số lượt chạy:

```bash
gh api "repos/:owner/:repo/actions/workflows/<tên-file>.yml/runs" \
  --jq '.workflow_runs[] | "\(.created_at)  event=\(.event)  concl=\(.conclusion)"'
```

`event=push` + `failure` là vết lỗi phân tích, **không phải** lượt chạy.
