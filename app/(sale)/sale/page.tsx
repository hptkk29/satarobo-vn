// app/(sale)/sale/page.tsx — Đợt B: trang chủ site Sale.
//
// Bản vỏ. Nội dung thật ("Bảng việc hôm nay" hướng theo SLA, danh sách khách của
// tôi, trang trải nghiệm) là các đợt sau — xem `satarobo-sale/plan/25`.
//
// Trang này tồn tại để cờ `SALE_SITE_ENABLED` có thể bật lên và **nhìn thấy được**:
// khung + cổng đăng nhập + cách ly vai chạy đúng, trước khi đổ tính năng vào.
export const dynamic = "force-dynamic";

export const metadata = { title: "Bảng việc hôm nay | Tư vấn tuyển sinh" };

export default function SaleHomePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Bảng việc hôm nay</h1>
      <p className="mt-2 text-muted-foreground">
        Khu làm việc của tư vấn viên tuyển sinh. Các màn hình đang được đưa vào
        lần lượt.
      </p>

      <div className="mt-6 rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Sắp có</h2>
        {/* Danh sách này phải trừ dần khi màn được dựng. Để nguyên tên một màn
            ĐÃ CÓ là nói dối người dùng về trạng thái sản phẩm — "Lớp trải
            nghiệm" từng nằm ở đây suốt trong khi nó đã chạy được. */}
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Khách của tôi — danh sách, chi tiết, ghi hoạt động</li>
          <li>Chốt đơn — tạo đơn, ghi nhận thanh toán, ghi danh</li>
          <li>Hoa hồng của tôi</li>
        </ul>
      </div>
    </div>
  );
}
