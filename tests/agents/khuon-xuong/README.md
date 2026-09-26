# Bộ khuôn của xưởng skill (AGENT_ADMIN) — bản 1.0, 25/09/2026

Chép NGUYÊN VĂN từ bộ tài liệu CEO gửi (`KET_NOI/`: `schema/`, `mau/`, `cong-cu/kiem-khuon.mjs`).
Đây là HỢP ĐỒNG giữa Cổng dữ liệu agent và xưởng skill — cổng trả đúng khuôn thì skill chạy
trên dữ liệu thật mà không phải sửa.

⚠️ **KHÔNG sửa tay.** Các tệp này do xưởng sinh (`node scripts/sinh-bo-ket-noi.mjs` phía xưởng).
Cần đổi khuôn → báo CEO để xưởng sinh bản mới, rồi chép đè cả thư mục.

Dùng ở:
- `lib/agents/tools/khuon.test.ts` — zod đầu ra của từng công cụ phải nhận được bản mẫu của xưởng.
- `tests/agents/cong-du-lieu.spec.ts` — chạy `cong-cu/kiem-khuon.mjs` trên phản hồi THẬT của cổng.

Tự kiểm bộ mẫu: `node tests/agents/khuon-xuong/cong-cu/kiem-khuon.mjs --mau` → phải ĐẠT 14/14.
