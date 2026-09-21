# NỢ — 4 job E2E cần trình duyệt hết giờ trên `test`: hiện KHÔNG có phủ trình duyệt

> **Trạng thái: GHI NHẬN, CHƯA ĐIỀU TRA.** Chủ dự án chốt 21/09/2026: mở ticket riêng,
> **không làm trong chuỗi thanh toán**.
>
> Tệp này tồn tại vì một lý do cụ thể: bốn job ấy **luôn hiện đỏ**, nên không ai còn đọc
> chúng — và một cổng không ai đọc thì bằng không có cổng (luật 10, chỉ khác là ở đây nó
> đỏ mãi chứ không đỏ một lần).

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
