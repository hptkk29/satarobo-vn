# NỢ — 4 job E2E cần trình duyệt hết giờ trên `test`: hiện KHÔNG có phủ trình duyệt

> **Trạng thái: ĐÃ TÌM RA NGUYÊN NHÂN VÀ VÁ — 21/09/2026.**
> Phần dưới mục "Đã tìm ra" là kết luận; phần trên nó giữ nguyên làm **nhật ký điều tra**
> (ích cho lần sau: nó cho thấy bốn nghi can nghe rất hợp lý đã bị loại bằng phép đo nào).

## Đo được gì

Bốn job **cancelled** (không phải `failed`), mỗi cái chết **đúng ở `timeout-minutes` của
chính nó**:

| Job | `timeout-minutes` | thời gian chạy | khai ở |
|---|---|---|---|
| E2E smoke (Playwright) | 20 | 20m17s | `.github/workflows/ci.yml:227-229` |
| E2E Phase A0 (Playwright + Postgres local) | 20 | 20m20s | `ci.yml:341-343` |
| E2E site GV #06 (browser + prebuilt server, flag ON) | 25 | 25m21s | `ci.yml:774-776` |
| E2E đào tạo nội bộ EL-07 (browser + prebuilt server, flag ON) | 25 | 25m17s | `ci.yml:872-874` |

**Không phải chuyện của một nhánh.** Cùng bốn job, cùng hình dạng, trên ba lượt chạy khác
nhau:

| Run | Nhánh / PR | SHA |
|---|---|---|
| `35566010133` | `test` | `103cd5ea` |
| `35565213674` | PR #321 (`test` → `main`) | `103cd5ea` |
| `35588363672` · `35601320254` | PR #322 (PHIÊN D) | `3e902122` · `62f68a74` |

⚠️ **`gh pr checks` in chúng là `fail`, nhưng `--json bucket` trả `cancel`.** Đọc cột chữ
rồi kết luận "PR này làm đỏ CI" là chẩn đoán sai chỗ — đúng bài học đã ghi trong memory
`ci-playwright-apt-treo`.

## Cái ĐÃ loại trừ

- **Không phải `playwright install` treo.** Log của `35601320254` (job `106339794992`) cho
  thấy bước cài chạy xong, đi tiếp qua `Build app`, rồi mới bị cắt trong
  `Run Playwright smoke tests` lúc `13:11:10`. Workflow đã có sẵn vòng thử lại 3 lần +
  dọn khoá `apt` cho đúng con cũ — nó không phải con này.
- **Không phải do diff của PHIÊN D/E.** Hình dạng y hệt trên `test` ở SHA `103cd5ea`, có
  TRƯỚC cả hai PR.

## Đề xuất bước đầu (theo thứ tự rẻ → đắt)

1. **Đọc report của Playwright, không đọc log job.** Ba trong bốn job có bước
   `Upload … Playwright report` — tải artifact của run `35601320254` và xem **ca nào là ca
   cuối cùng bắt đầu** trước mốc cắt. Một ca treo và ba job khác cùng treo thường là **một**
   nguyên nhân, không phải bốn.
2. **So thời gian với lượt XANH gần nhất.** Nếu trước đây các job ấy chạy ~12–15 phút thì
   chuyện là **chậm dần**, không phải hỏng đứt: tìm commit làm nó vượt trần. Nếu trước đây
   đã ~19 phút thì trần vốn quá sát và runner chậm hơn một chút là đủ.
   ⚠️ **Nâng `timeout-minutes` là vá TRIỆU CHỨNG.** Chỉ làm sau khi biết (2) trả lời gì —
   cùng bài học với trần thời gian của `vitest.cham-cong.config.ts`.
3. **Chạy đúng một job ở local** với cùng lệnh CI (`ci.yml` bước `Run Playwright smoke
   tests`) và đo thời gian từng spec. Bốn job này đều **dựng Next thật** — nên nghi can đầu
   tiên là `next build` hoặc webserver khởi động chậm, chứ không phải test.
4. Nếu (3) cho thấy một spec treo: ca đó có `page.waitFor…` nào không có trần không.

## Cái ticket này KHÔNG bao gồm

- Nâng trần thời gian để "cho hết đỏ". Xem cảnh báo ở bước 2.
- Gỡ bốn job khỏi CI. Chúng là **phủ trình duyệt duy nhất** của repo; tắt đi là biến một
  vấn đề nhìn thấy được thành một vấn đề không nhìn thấy.

## Vì sao đáng ưu tiên

Bốn job này là chỗ duy nhất có trình duyệt thật. Mọi bộ còn lại (`R7`, `R1`, `CRM`, `FL`,
`finance-db`, unit) chạy ở **tầng dịch vụ** — chúng gọi hàm, không bấm nút. Nghĩa là hôm
nay **không cổng nào bắt được** một lỗi chỉ lộ ra khi người dùng bấm: nút không nối, hộp
thoại không mở, form không gửi. Đúng lớp lỗi mà luật 12 (affordance phải nói thật) sinh ra
để chặn, và nó đang không được chặn.


---

# ĐÃ TÌM RA — cổng chặn brute-force ĐĂNG NHẬP  [21/09/2026]

## Nguyên nhân

`lib/auth.ts:132-133` chặn: **10 lượt/phút theo IP** và **5 lượt/phút theo ĐỊNH DANH**.
Bộ đếm nằm trong **bộ nhớ tiến trình** của server (`rateLimit` fail-soft về memory khi
không có Upstash), nên `resetDb()` KHÔNG xoá được nó.

Bộ E2E qua trình duyệt đăng nhập lại nhiều lần bằng **chung một IP** (localhost) và vài
tài khoản. Vượt trần ⇒ `authorize()` trả `null` ⇒ trang **ở lại `/login`**, **không một
lỗi nào được ném** ⇒ mỗi ca hết 30 giây mới chịu thua. Hàng chục ca × retry ⇒ job chạm
`timeout-minutes` ⇒ bị giết.

⚠️ Đây là dạng hỏng **câm**: không exception, không log, không ca đỏ có tên. Thứ duy nhất
nhìn thấy được là thời gian. Đó là lý do nó sống được lâu.

## Bằng chứng

**Từ CI** (sau khi thêm reporter `["line"]`): bộ A0 chạy tới
`[62/159] tests/e2e/a0/login-identifier.spec.ts:56` lúc 15:25:36 rồi **đứng im** — kẹt
trong chính spec đăng nhập.

**Từ máy** (bản build thật, 3 lượt liên tiếp mỗi cấu hình):

| cấu hình | lượt 1 | lượt 2 | lượt 3 |
|---|---|---|---|
| cổng BẬT · dùng chung email | 5/5 | **3/5** | **3/5** |
| cổng BẬT · mỗi ca một email | 5/5 | 5/5 | 5/5 |
| cổng TẮT · dùng chung email | 5/5 | 5/5 | 5/5 |

## Đã vá thế nào

1. **`tests/e2e/_helpers/auth.ts`** — mỗi lượt `login()` một IP riêng (`10.90.x.y`). Chữa
   vế IP cho MỌI suite mà không sửa spec nào, và **giữ cổng sống**. Đi đúng tiền lệ
   `forgot-password.spec.ts` (cùng một câu chuyện "bộ đếm nằm trong bộ nhớ tiến trình").
2. **`LOGIN_RATELIMIT_DISABLED=1`** cho 4 job E2E trên CI. Vế ĐỊNH DANH không chữa được
   bằng IP; nó chỉ chữa được bằng "mỗi ca một email", mà làm vậy cho ~20 spec đang có là
   một đợt riêng. Cửa thoát này do chính `lib/auth.ts:128` khai ra. **Prod không đổi.**

**Mẫu không cần cửa thoát** đã có: `tests/e2e/a0/thu-tien-theo-con.spec.ts` cho mỗi ca một
email và xanh 3/3 lượt **với cổng BẬT**. Spec mới theo mẫu đó; ngày nào ~20 spec cũ theo
hết thì gỡ dòng env kia.

## Hai bài học về CÁCH ĐO, đắt hơn bản vá

**1 · CI bịt mắt, và đó mới là lỗi gốc.** Reporter `html` + `github` chỉ ghi lúc KẾT THÚC,
nên một lượt treo để lại **đúng 0 dòng** về chỗ nó treo. Không có `["line"]` thì không có
cách nào truy — bốn job treo suốt một ngày và mọi giả thuyết đều chỉ là giả thuyết.

⚠️ Và `if: failure()` → `if: always()` **chưa đủ**: đo được ngày 21/09 — job bị GIẾT thì
bước upload có chạy nhưng **không kịp xong**, run `35617359570` không để lại artifact A0
nào. Thứ thật sự cứu là reporter phát tiến trình, không phải artifact.

**2 · Giàn đo hỏng trông y hệt thứ đang đi tìm.** Bản "tái hiện" đầu ở máy chạy
`next start … | head -10`; ống đóng sau 10 dòng nên **chính máy chủ của tôi** treo — 694s
CPU, mọi request hết giờ 60s. Suýt báo một nguyên nhân bịa. Thứ cứu là đi hỏi Postgres
(`pg_stat_activity` → **0 khoá**) rồi mới quay lại soi cái ống.
