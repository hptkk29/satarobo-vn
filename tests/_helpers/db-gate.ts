// tests/_helpers/db-gate.ts — MỘT cổng duy nhất quyết định "bộ test có được đụng
// Postgres thật không".
//
// ─────────────────────────────────────────────────────────────────────────────
// Vì sao có file này (04/09/2026) — sự cố mất DB
//
// `pnpm test:unit` gom cả các bộ chạm DB (`tests/chat`, `tests/nen`,
// `tests/lead-intake`, `tests/elearning`, `tests/inbox`, `tests/goi-dien`). Chúng gọi
// `resetDb()` — TRUNCATE **mọi bảng** trong schema `public` với CASCADE. Cổng cũ chỉ
// hỏi "URL có trỏ localhost / có tên satarobo_test không", mà DB làm việc hằng ngày ở
// máy dev ĐÚNG LÀ `127.0.0.1/satarobo_test` ⇒ mỗi lần chạy `pnpm test:unit` là xoá
// sạch dữ liệu đang xem. Đã xảy ra thật: 250 học viên · 100 lớp · 609 buổi · 12 tài
// khoản `uat.*` bay hết, đăng nhập báo "sai tài khoản mật khẩu".
//
// Chốt của chủ dự án: **`pnpm test` không được gọi resetDb, không được truncate.**
//
// Nay phải CÓ CHỦ ĐÍCH: đặt `ALLOW_DB_RESET=1`. Cờ đó chỉ được bật ở
// `vitest.db.config.ts` — cấu hình mà các script `test:*-db` (CI gọi đúng chúng) dùng.
// Chạy `pnpm test:unit` trần thì các bộ này SKIP, không phải đỏ: chúng vốn đã thiết kế
// để skip khi vắng Postgres, nay skip thêm khi vắng cờ.
//
// ⚠️ Cổng địa chỉ CŨ vẫn giữ nguyên bên cạnh (localhost / satarobo_test / ci_test).
// Nó chặn trỏ nhầm Supabase; cờ mới chặn "đúng địa chỉ nhưng SAI LÚC". Bỏ vế nào cũng
// mở lại một trong hai đường mất dữ liệu.
// ─────────────────────────────────────────────────────────────────────────────

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

/** URL ĐÃ CHE mật khẩu — dùng in lý do bỏ qua, không bao giờ in URL trần. */
export const DB_URL_CHE = DB_URL.replace(/:[^:@]*@/, ":***@") || "trống";

/** URL có trỏ Postgres test cục bộ không (chặn Supabase prod/dev). */
export const HAS_LOCAL_DB =
  /(@|\/\/)(localhost|127\.0\.0\.1)[:/]/.test(DB_URL) ||
  /satarobo_test|ci_test/.test(DB_URL);

/**
 * Người chạy ĐÃ nói rõ "được phép xoá DB này". Chỉ `vitest.db.config.ts` bật.
 * Không có cờ ⇒ mọi bộ chạm DB skip, và `resetDb()` từ chối chạy.
 */
export const DB_RESET_ALLOWED = process.env.ALLOW_DB_RESET === "1";

/** Cửa hậu nghiệm thu tay trên DB từ xa — giữ nguyên hành vi cũ. */
export const ALLOW_REMOTE =
  DB_URL !== "" && process.env.CHAT_DB_TEST_ALLOW_REMOTE === "1";

/** Điều kiện DUY NHẤT để một bộ test được chạy trên Postgres thật. */
export const RUN_DB_TESTS = (HAS_LOCAL_DB || ALLOW_REMOTE) && DB_RESET_ALLOWED;

/** Câu giải thích in ra khi bộ test bị bỏ qua — để người chạy biết cách bật. */
export const LY_DO_BO_QUA = !HAS_LOCAL_DB && !ALLOW_REMOTE
  ? "DATABASE_URL không trỏ Postgres test cục bộ."
  : "Thiếu ALLOW_DB_RESET=1 — chạy `pnpm test:chat-db` (hoặc test:nen-db / test:lead-intake / test:elearning-db / test:inbox-db) thay vì `pnpm test:unit`.";
