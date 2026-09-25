// lib/agents/kho.ts — ĐIỂM VÀO DB DUY NHẤT của hạ tầng Cổng dữ liệu agent.
//
// Cổng có hai loại dữ liệu, đi hai đường khác nhau — lẫn hai đường là lỗ:
//
//   1. Bảng CỦA CỔNG (AgentClient, AgentGrant, AgentAccessToken, AgentToolCall, UserTotp…)
//      — cấu hình + nhật ký, không thuộc cơ sở nào. Đi qua file này.
//   2. Dữ liệu NGHIỆP VỤ mà công cụ trả cho agent (cơ sở, lead, hội thoại…) — PHẢI đi qua
//      `scopedDb(actor của user dịch vụ)` mà pipeline đưa vào `ctx.sdb`. Công cụ KHÔNG được
//      import file này; ESLint chặn (`eslint.config.mjs`, khối "Cổng dữ liệu agent").
//
// Vì sao một file riêng thay vì import `@/lib/db` rải rác: để một câu `grep` trả lời được
// "cổng chạm DB trần ở đâu", và để lưới ESLint có một ngoại lệ DUY NHẤT, đọc được.
export { db as khoCong } from "@/lib/db";
