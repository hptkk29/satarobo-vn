// lib/agents/quan-tri/cong-tac.ts — công tắc toàn cổng (spec §5.5), hiệu lực NGAY, không deploy.
//
// ĐƯỜNG GHI DUY NHẤT của công tắc. Khoá cố ý KHÔNG nằm trong registry cấu hình chung, nên
// `setGlobalSetting`/màn Cấu hình vận hành không ghi được nó (rà bảo mật 25/09, AG-01) —
// bật cổng phải qua Server Action của màn Cổng dữ liệu agent (người duyệt + mã 2FA).
// Audit có lý do. Hiệu lực "ngay" đến từ việc cổng đọc khoá này THẲNG DB mỗi lượt.
import { khoCong } from "../kho";
import { KHOA_CONG_TAC } from "../gateway/cau-hinh";
import { ghiAudit, type NguoiThaoTac } from "./chung";

export async function datCongTac(nguoi: NguoiThaoTac, input: { bat: boolean; lyDo: string }): Promise<void> {
  await khoCong.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key: KHOA_CONG_TAC },
      create: { key: KHOA_CONG_TAC, valueJson: input.bat, updatedById: nguoi.userId, updatedByName: nguoi.ten },
      update: { valueJson: input.bat, updatedById: nguoi.userId, updatedByName: nguoi.ten },
    });
    await ghiAudit(tx, nguoi, {
      entityType: "SystemSetting",
      entityId: KHOA_CONG_TAC,
      action: input.bat ? "GATEWAY_ON" : "GATEWAY_OFF",
      newValues: { bat: input.bat },
      lyDo: input.lyDo,
    });
  });
}
