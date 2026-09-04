-- Phụ huynh ĐÃ ĐỌC một thông báo — nền cho badge chuông portal.
--
-- THUẦN THÊM: tạo một bảng mới, KHÔNG đụng cột nào của bảng đang có dữ liệu
-- (luật cứng #4 Nền Hệ thống). Chạy lại nhiều lần không sao nhờ IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS "NotificationRead" (
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRead_pkey" PRIMARY KEY ("notificationId","userId")
);

-- Badge đếm "chưa đọc" theo TỪNG phụ huynh trên mọi lượt mở portal ⇒ phải có index
-- theo userId, không thì mỗi lần tính badge là quét cả bảng.
CREATE INDEX IF NOT EXISTS "NotificationRead_userId_idx" ON "NotificationRead"("userId");
