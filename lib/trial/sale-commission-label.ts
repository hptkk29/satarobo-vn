// lib/trial/sale-commission-label.ts — nhãn hoa hồng của bảng trải nghiệm site Sale.
//
// ⚠️ FILE NÀY CỐ Ý KHÔNG IMPORT GÌ. Nó được một Client Component đọc lúc chạy
// (`app/(sale)/sale/trial/_components/trial-list.tsx`), nên nếu để chung trong
// `sale-roster.ts` thì cả `scopedDb` + Prisma bị kéo vào gói gửi xuống trình duyệt —
// `import type` cũ được xoá lúc biên dịch nên không có chuyện đó, `import` thật thì có.
// Thêm bất kỳ import server nào vào đây là tái lập đúng cái bẫy ấy.

/**
 * Nhãn hoa hồng đứng cạnh trạng thái "Đã nhập học" ở bảng trải nghiệm site Sale.
 * `null` = con chưa nhập học ⇒ chưa có gì để nói về hoa hồng.
 *
 * ⚠️ VÌ SAO KHÔNG IN "+4%" (hay bất kỳ con số nào)
 *
 * Kế hoạch ghi cột này là "Đã nhập học · +% hoa hồng", đọc tỉ lệ từ cấu hình. Đo
 * lại trước khi vẽ thì ra: hệ thống **chưa từng sinh một dòng hoa hồng nào cho
 * Sale**. Engine 4 tầng (`lib/crm/commission.ts`: QC 1% · Sale Admin 1% · Sale 4% ·
 * QL TT 2%) đủ logic và có test, nhưng `setStatementLines` — đường DUY NHẤT ghi
 * dòng cho 4 tầng đó — không được gọi từ chỗ nào trong sản phẩm, chỉ có test gọi.
 * Bảng kê `/admin/crm/commission` kỳ nào cũng rỗng.
 *
 * (Tầng `TRIAL_TEACHER` ở `lib/crm/trial-teacher-commission.ts` CÓ sinh dòng thật,
 * nhưng đó là 1% cho GIÁO VIÊN dạy buổi thử — nên site GV in được "+1% HH". Nó
 * không phải hoa hồng của tư vấn viên, chép nhãn đó sang đây là nói sai người hưởng.)
 *
 * In "+4%" hay "0đ" đều là nói dối một con số: người xem tin là đã tính rồi và đi
 * hỏi kế toán vì sao chưa nhận tiền. Nên nhãn nói đúng thứ đang có — "chưa tính" —
 * kèm lý do. Ngày nào job chốt kỳ được nối (US-E4-3), test canh gác trong
 * `sale-roster.test.ts` sẽ đỏ và chỉ thẳng về hàm này.
 */
export function nhanHoaHongSale(enrolled: boolean): { nhan: string; lyDo: string } | null {
  if (!enrolled) return null;
  return {
    nhan: "Hoa hồng: chưa tính",
    lyDo:
      "Hệ thống chưa có nơi sinh dòng hoa hồng cho tư vấn viên: engine bốn tầng đã " +
      "viết xong nhưng chưa có màn chốt kỳ nào gọi nó, nên bảng kê hoa hồng kỳ nào " +
      "cũng rỗng. Con số sẽ hiện ở đây khi kế toán chốt được kỳ đầu tiên.",
  };
}
