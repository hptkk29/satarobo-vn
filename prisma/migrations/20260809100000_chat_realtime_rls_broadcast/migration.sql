-- US-02 — RLS cho Supabase Realtime Broadcast (chat realtime, Đợt 0).
--
-- Bối cảnh (docs/chat-realtime/00-dieu-chinh-cho-repo.md mục B):
--   · Repo KHÔNG dùng Supabase Auth — Auth.js v5, User.id là cuid.
--   · Server tự mint JWT HS256 (SUPABASE_JWT_SECRET) với claim `app_user_id`
--     = User.id (cuid). Policy đọc claim này qua auth.jwt() ->> 'app_user_id'.
--   · TUYỆT ĐỐI không dùng auth.uid() — cast cuid → uuid sẽ lỗi.
--
-- Chỉ có policy SELECT (nhận broadcast khi subscribe private channel
-- `conv:{conversationId}`): user phải là participant CÒN HIỆU LỰC
-- (leftAt IS NULL) của đúng conversation đó.
--
-- CỐ Ý KHÔNG tạo policy INSERT nào trên realtime.messages: client không được
-- tự phát tin vào channel (channel.send bị từ chối). Broadcast CHỈ đi từ
-- server bằng service role key (TB3 trong docs/chat-realtime/architecture.md).
--
-- Điều kiện đi kèm (ngoài SQL): "Allow public access" trên Realtime Settings
-- phải TẮT — bật lại là vô hiệu toàn bộ private channel (canary TS-02.5,
-- kiểm bằng scripts/_zztest-chat-us02.ts).

DROP POLICY IF EXISTS "participant_can_receive_conversation_broadcast" ON realtime.messages;

CREATE POLICY "participant_can_receive_conversation_broadcast"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.messages.extension = 'broadcast'
  AND EXISTS (
    SELECT 1
    FROM public."ConversationParticipant" p
    WHERE p."userId" = (SELECT auth.jwt() ->> 'app_user_id')
      AND p."leftAt" IS NULL
      AND 'conv:' || p."conversationId" = (SELECT realtime.topic())
  )
);
