import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  hocVienTrenCacDong,
  studentIdChoDon,
  thieuHocVienODong,
} from "./hoc-vien-dong-don";

/**
 * MỘT ĐƠN — NHIỀU CON (15/09/2026).
 *
 * Thứ đang canh là một luật TIỀN: "khoản này của đứa trẻ nào". `Order.studentId` được
 * đọc bởi hoàn tiền, ZNS học phí và cổng phụ huynh, nên một giá trị sai ở đó không ném
 * lỗi — nó chỉ làm cả ba nơi nói sai tên một đứa trẻ.
 */
describe("[HVD] học viên của dòng đơn", () => {
  const A = "hv-a";
  const B = "hv-b";

  it("[HVD-01] một em trên các dòng ⇒ Order.studentId là chính em đó", () => {
    expect(studentIdChoDon([{ studentId: A }, { studentId: A }], null)).toBe(A);
  });

  it("[HVD-02] HAI em ⇒ Order.studentId là null, KHÔNG quy về em đầu tiên", () => {
    // Đây là ca sinh ra cả file. Trả về `A` ở đây là hợp lý về mặt kiểu dữ liệu và
    // sai hoàn toàn về mặt nghiệp vụ: đơn của hai đứa trẻ bị gán cho một đứa.
    expect(studentIdChoDon([{ studentId: A }, { studentId: B }], null)).toBeNull();
  });

  it("[HVD-03] hai em ⇒ KHÔNG nhận giá trị client gửi lên, kể cả khi client khăng khăng", () => {
    // Đường tấn công thật: gọi thẳng server action với `studentId` tự chọn. Cột trên
    // đơn phải suy từ CÁC DÒNG, nên số client gửi bị bỏ qua hoàn toàn.
    expect(studentIdChoDon([{ studentId: A }, { studentId: B }], "hv-nguoi-la")).toBeNull();
  });

  it("[HVD-04] một em trên dòng ⇒ dòng THẮNG giá trị client gửi", () => {
    expect(studentIdChoDon([{ studentId: A }], "hv-nguoi-la")).toBe(A);
  });

  it("[HVD-05] không dòng nào khai ⇒ giữ giá trị gửi lên (đường convert-lead)", () => {
    expect(studentIdChoDon([{ studentId: null }, {}], A)).toBe(A);
    expect(studentIdChoDon([{}], null)).toBeNull();
    // Chuỗi rỗng / khoảng trắng KHÔNG phải là một học viên.
    expect(studentIdChoDon([{}], "   ")).toBeNull();
  });

  it("[HVD-06] đơn MỘT con để trống ô học viên vẫn hợp lệ (khách vãng lai)", () => {
    expect(thieuHocVienODong([{ studentId: null }])).toBe(false);
    expect(thieuHocVienODong([{ studentId: A }, { studentId: A }])).toBe(false);
  });

  it("[HVD-07] đơn HAI con còn dòng trống ⇒ chặn", () => {
    expect(thieuHocVienODong([{ studentId: A }, { studentId: B }, {}])).toBe(true);
  });

  it("[HVD-08] trim + khử trùng — id có khoảng trắng không đẻ ra 'em thứ hai'", () => {
    expect(hocVienTrenCacDong([{ studentId: ` ${A} ` }, { studentId: A }])).toEqual([A]);
    // và vì thế đơn này vẫn là đơn MỘT con:
    expect(studentIdChoDon([{ studentId: ` ${A} ` }, { studentId: A }], null)).toBe(A);
  });
});

/**
 * LƯỚI GHIM MÃ NGUỒN — `createOrderManualAction` phải DÙNG hàm trên, không tự tính.
 *
 * Vì sao cần lưới: mọi ca ở trên vẫn XANH nếu action bỏ quên `studentIdChoDon(...)` và
 * quay lại ghi thẳng `data.studentId` — hàm thuần đúng, còn lời gọi thì biến mất. Đó
 * đúng là lớp bug mà mẫu này sinh ra để chặn (xem CLAUDE.md, mục LƯỚI GHIM MÃ NGUỒN).
 *
 * Đã cấy lại để thấy ĐỎ: đổi `studentId: studentIdCuaDon` về `studentId: data.studentId
 * || null` ⇒ [HVD-09] đỏ; xoá lời gọi `thieuHocVienODong(data.items)` ⇒ [HVD-10] đỏ.
 */
describe("[HVD] lưới ghim: action không được tự tính lại luật này", () => {
  const nguon = readFileSync(
    resolve(process.cwd(), "app/(admin)/admin/orders/_actions.ts"),
    "utf8",
  );

  it("[HVD-09] cột studentId của đơn ghi bằng giá trị SUY RA, không phải data.studentId", () => {
    // Chuỗi hẹp: chính dòng `data` của `order.create`. Không cờ /s.
    expect(nguon).toMatch(/studentId: studentIdCuaDon,/);
    // Và không còn đường ghi thẳng giá trị client gửi vào cột đó.
    expect(nguon).not.toMatch(/studentId: data\.studentId \|\| null,/);
    // `studentIdCuaDon` phải đến TỪ hàm dùng chung, không phải một phép tính chép lại.
    expect(nguon).toMatch(/const studentIdCuaDon = studentIdChoDon\(data\.items, data\.studentId\);/);
  });

  it("[HVD-10] cổng 'đơn nhiều con thì mọi dòng phải khai' có mặt ở SERVER", () => {
    // Form cũng gọi hàm này, nhưng form chạy ở client — cổng thật phải ở action.
    const goi = nguon.match(/thieuHocVienODong\(data\.items\)/g) ?? [];
    expect(goi.length).toBe(1);
  });

  it("[HVD-11] mọi studentId client gửi đều đi qua cổng scope trước khi ghi", () => {
    // Bao gồm CẢ `data.studentId` cấp đơn — trước 15/09/2026 cột đó chưa từng được tra.
    expect(nguon).toMatch(
      /\.\.\.\(data\.studentId\?\.trim\(\) \? \[data\.studentId\.trim\(\)\] : \[\]\)/,
    );
    expect(nguon).toMatch(/where: \{ id: \{ in: hocVienIds \}, deletedAt: null \}/);
  });
});
