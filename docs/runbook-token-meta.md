# Runbook — lấy token Meta cho đồng bộ chi phí quảng cáo (`OQ-D4`)

> **Vì sao có file này.** Hướng dẫn đã gửi trong chat **hai lần** và trôi mất cả hai lần.
> Từ nay nó nằm trong repo. Ai cần thì mở đây, đừng hỏi lại trong chat.
>
> **Câu hỏi cần đóng:** `OQ-D4` — *token Meta thuộc loại gì, hết hạn bao lâu*. Đây là câu
> **duy nhất còn lại của cả bộ PRD chưa có câu trả lời**, và nó **chặn cứng toàn bộ nhánh
> D** (chi phí marketing) — kéo theo ba ô **Chi phí / Lợi nhuận / Dòng tiền** của tab Tài
> chính đang phải hiện *"Chưa đủ dữ liệu"*.

---

## 0. Đọc 60 giây trước khi bấm gì

| Thứ | Giá trị hôm nay | Đo ở đâu |
|---|---|---|
| Biến môi trường chứa token | `META_PAGE_ACCESS_TOKEN` | `lib/crm/ads-insights.ts:84` |
| Biến chứa id tài khoản quảng cáo | `META_AD_ACCOUNT_ID` | `lib/crm/ads-insights.ts:85` |
| Phiên bản Graph API đang gọi | **v21.0** | `lib/crm/ads-insights.ts:90` |
| Endpoint | `act_<id>/insights`, lấy `spend,impressions,clicks` theo ngày | `:90-93` |
| Quyền tối thiểu token cần | **`ads_read`** | endpoint `/insights` chỉ đọc |

🔴 **Tên biến `META_PAGE_ACCESS_TOKEN` đang gợi ý sai.** Nó nói "Page token" — loại gắn
với **một con người** và hạn ngắn. Nếu thực tế đang cắm Page token vào đó thì ngày người
đó đổi mật khẩu / nghỉ việc / gỡ quyền là job **chết im**, không ai biết cho tới lúc có
người hỏi *"sao số quảng cáo không nhảy"*. Đổi sang **System User token** là việc nên làm
ngay ở bước dưới; tên biến giữ nguyên để khỏi phải sửa mã trong cùng một lượt.

---

## 1. Lấy token — đường đi từng bước

Người làm: **quản trị Meta Business** (Trưởng Marketing). Dev không làm hộ được vì cần
quyền Admin trên Business.

### Bước 1 — mở Business Settings

<https://business.facebook.com/settings> → chọn đúng **Business** của Sata Robo ở góc trên
bên trái (nếu tài khoản của anh đang thuộc nhiều Business, chọn nhầm là mọi bước sau đều
không thấy tài khoản quảng cáo).

### Bước 2 — tạo System user

Cột trái → **Users** → **System users** → **Add**.

- **Tên:** đặt theo việc, không theo người — ví dụ `satarobo-ads-sync`.
- **Role:** chọn **Employee**. Không cần Admin: việc duy nhất của nó là **đọc** số liệu
  quảng cáo.

> 🔴 **Đây là điểm quan trọng nhất của cả runbook.** System user **không gắn với một con
> người**, nên nhân sự nghỉ việc / đổi mật khẩu **không làm chết job**. Token của Page
> hoặc của User cá nhân thì có.

### Bước 3 — gán tài khoản quảng cáo cho system user

Vẫn ở màn system user vừa tạo → **Assign assets** → **Ad accounts** → tick tài khoản
quảng cáo đang chạy → bật quyền **View performance** (đủ cho việc đọc; không cần *Manage
campaigns*).

⚠️ Bỏ bước này thì bước 4 vẫn **cấp token thành công**, nhưng gọi API sẽ trả lỗi quyền —
và lỗi đó trông y hệt lỗi token sai. Đừng bỏ.

### Bước 4 — sinh token

Ở màn system user → **Generate new token**.

1. **App:** chọn App của Sata Robo trong Meta for Developers. *(Chưa có App thì phải tạo
   trước tại <https://developers.facebook.com/apps> — token luôn thuộc về một App.)*
2. **Permissions:** tick **`ads_read`**. Chỉ cần đúng quyền này cho việc đọc chi phí.
3. **Token expiration:** chọn **Never** nếu Meta cho phép. Nếu chỉ có **60 days**, chọn 60
   ngày và **bắt buộc** làm bước 6.
4. Bấm **Generate token** → **copy ngay**.

> 🔴 **Token chỉ hiện MỘT LẦN.** Đóng hộp thoại là mất, phải sinh lại từ đầu. Dán vào chỗ
> an toàn trước khi bấm gì khác.

### Bước 5 — lấy id tài khoản quảng cáo

Business Settings → **Accounts** → **Ad accounts** → chọn tài khoản → chép **Ad account ID**.

> 🔴 **BẪY ĐÃ CÓ TRONG MÃ, đọc kỹ dòng này.** Mã tự ghép tiền tố `act_` vào
> (`` `act_${acct}` `` — `lib/crm/ads-insights.ts:90`). Vì thế biến `META_AD_ACCOUNT_ID`
> phải chứa **CHỈ PHẦN SỐ**, không có `act_`:
>
> | Dán vào env | URL sinh ra | Kết quả |
> |---|---|---|
> | `1234567890` ✅ | `act_1234567890/insights` | chạy |
> | `act_1234567890` ❌ | `act_act_1234567890/insights` | lỗi 400 |
>
> Meta hiển thị id kèm chữ `act_` ở nhiều màn, nên đây là chỗ rất dễ dán nguyên si.

### Bước 6 — ghi hạn + đặt nhắc

Ghi vào file này (mục *Nhật ký token* cuối trang): **ngày cấp**, **ngày hết hạn**, **ai cấp**.
Đặt nhắc lịch **trước hạn 14 ngày**.

Chọn "Never" thì vẫn ghi ngày cấp: token vĩnh viễn **vẫn chết** khi ai đó gỡ tài sản khỏi
system user, đổi quyền App, hoặc Meta buộc xác minh doanh nghiệp lại.

---

## 2. Kiểm TRƯỚC KHI dán vào Vercel

Chạy ở máy anh (thay hai giá trị). Đây là đúng lời gọi mà hệ thống sẽ chạy:

```bash
curl -s "https://graph.facebook.com/v21.0/act_<ID_SỐ>/insights?fields=spend,impressions,clicks&time_increment=1&time_range=%7B%22since%22%3A%222026-08-01%22%2C%22until%22%3A%222026-08-07%22%7D&access_token=<TOKEN>"
```

| Trả về | Nghĩa |
|---|---|
| `{"data":[ … ]}` (kể cả mảng rỗng) | ✅ token + id đều đúng. Mảng rỗng chỉ nghĩa là khoảng ngày đó không chi tiền |
| `"Unsupported get request"` / `(#803)` | Sai **id** — nhiều khả năng đang dán kèm `act_` (bẫy bước 5) |
| `(#200) … requires ads_read` | Thiếu quyền — làm lại **bước 3** hoặc **bước 4.2** |
| `"Error validating access token"` | Token sai, đã hết hạn, hoặc bị thu hồi |

Kiểm bằng lệnh này **trước** khi dán lên Vercel, vì sau khi dán thì biến là **Sensitive**
— không đọc lại được để đối chiếu, chỉ biết đúng/sai qua hành vi.

---

## 3. Dán vào Vercel

Hai biến, dán ở **cả** ba môi trường đang dùng (Production · Preview · môi trường `test`):

```
META_PAGE_ACCESS_TOKEN = <token vừa sinh>
META_AD_ACCOUNT_ID     = <id, CHỈ phần số>
```

⚠️ **Không nhân bản token xoay vòng sang môi trường thứ hai.** Bài học Zalo trong
CLAUDE.md: `ZALO_OA_REFRESH_TOKEN` xoay mỗi lần refresh, hai môi trường dùng chung sẽ
**giết token của nhau** và phải OAuth lại bằng tay. Token System User **không** xoay vòng
nên dùng chung được — nhưng nếu sau này chuyển sang loại có refresh thì phải tách.

---

## 4. Sau khi có token — phần việc của Dev

Không phải việc của anh, ghi ở đây để biết còn gì phía sau:

1. **Vá chỗ token đi trong query string.** Hôm nay token nằm trong URL
   (`&access_token=` — `lib/crm/ads-insights.ts:93`), tức nó **rơi vào log** của mọi tầng
   trung gian. Bước D.4 chuyển sang gửi bằng **header**.
2. **Vòng lặp nhiều ad account** — `OQ-D3` đã chốt là *nhiều tài khoản*, mã hiện chỉ đọc
   một. Cần danh sách id (xem mục 5).
3. **Cron `meta-token-refresh`** theo khuôn `zalo-token-refresh` — chỉ cần nếu token có
   hạn (không chọn được "Never").
4. Nối `getAdsSpend()` (`lib/finance/cost.ts`) vào nguồn thật. Hàm đó đang trả `null` có
   chủ đích — xem mục 6.

---

## 5. Câu còn thiếu đi kèm — `OQ-D3`

Ngoài token, khâu gọi Meta thật còn cần **danh sách id tài khoản quảng cáo**. Marketing
chép từ Ads Manager, dạng `act_xxxxxxxxx`, mỗi tài khoản một dòng — nhớ **bỏ `act_`** khi
đưa vào cấu hình, cùng lý do ở bước 5.

Câu này **không chặn** việc lấy token; hai thứ lấy song song được.

---

## 6. Trong lúc chưa có token thì hệ thống đang làm gì

Ba ô **Chi phí · Lợi nhuận · Dòng tiền** ở tab Tài chính hiện **"Chưa đủ dữ liệu"**, kèm
dòng giải thích. `getAdsSpend()` trả **`null`**, cố ý **không trả `0`**:

> `0` là một **khẳng định** — "đã đo, không tốn đồng nào".
> `null` là một **thú nhận** — "chưa nối được nguồn".

Trả `0` sẽ làm chi phí báo thiếu và **lợi nhuận báo cao hơn thực tế** — sai theo hướng dễ
chịu, tức hướng không ai đi kiểm. Chi phí nhập tay/import **vẫn chạy bình thường** và vẫn
hiện đủ ở bảng "Chi phí theo đầu mục"; chỉ ba ô tổng là chờ.

---

## 7. Nhật ký token

Điền mỗi lần cấp/đổi token. Trống nghĩa là **chưa ai làm bước 1–6**.

| Ngày cấp | Loại token | Hết hạn | Người cấp | Ghi chú |
|---|---|---|---|---|
| | | | | |
