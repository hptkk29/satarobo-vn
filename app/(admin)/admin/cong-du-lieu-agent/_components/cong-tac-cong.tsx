"use client";

// Công tắc TOÀN CỔNG (spec §5.5). Hai nút KHÔNG đối xứng, đúng như Server Action:
//   · TẮT = phanh khẩn cấp ⇒ ai giữ `manage` HOẶC `approve` cũng bấm được, chỉ cần lý do,
//     KHÔNG đòi mã (người đó có thể đang không cầm điện thoại).
//   · BẬT = mở lại đường vào dữ liệu ⇒ chỉ người giữ `approve`, cần lý do + mã 2FA.
import { StatusPill } from "@/components/admin/ui/status-pill";
import { datCongTacAction } from "../_actions";
import { HopThoaiThaoTac } from "./hop-thoai-thao-tac";

export function CongTacCong({
  dangBat,
  duocTat,
  duocBat,
  chanMa,
}: {
  dangBat: boolean;
  /** `agent_gateway:manage` HOẶC `agent_gateway:approve`. */
  duocTat: boolean;
  /** `agent_gateway:approve`. */
  duocBat: boolean;
  /** Khác null ⇒ không nhập được mã 2FA lúc này (chưa bật / đang tạm khoá). */
  chanMa: string | null;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Công tắc toàn cổng</span>
          <StatusPill tone={dangBat ? "success" : "danger"}>{dangBat ? "Đang bật" : "Đang tắt"}</StatusPill>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {dangBat
            ? "Agent gọi được các công cụ trong phạm vi quyền đã duyệt. Tắt là chặn MỌI lượt gọi ngay lập tức, không cần deploy."
            : "Mọi lượt gọi của agent đang bị từ chối. Quyền cấp và mật khẩu vẫn giữ nguyên — bật lại là dùng tiếp."}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {dangBat && duocTat && (
          <HopThoaiThaoTac
            nhanNut="Tắt ngay"
            bienThe="destructive"
            tieuDe="Tắt toàn bộ cổng dữ liệu agent"
            moTa="Mọi agent bị từ chối ngay ở lượt gọi kế tiếp. Không cần mã xác thực — đây là phanh khẩn cấp."
            canLyDo
            nhanXacNhan="Tắt cổng"
            nguyHiem
            thongBaoXong="Đã tắt cổng dữ liệu agent"
            thucHien={(v) => datCongTacAction({ bat: false, lyDo: v.lyDo })}
          />
        )}
        {!dangBat && duocBat && (
          <HopThoaiThaoTac
            nhanNut="Bật cổng"
            bienThe="default"
            tieuDe="Bật lại cổng dữ liệu agent"
            moTa="Agent được gọi lại các công cụ theo quyền đã duyệt. Cần lý do và mã xác thực 2 lớp của bạn."
            canLyDo
            canMa
            chanVi={chanMa}
            nhanXacNhan="Bật cổng"
            thongBaoXong="Đã bật cổng dữ liệu agent"
            thucHien={(v) => datCongTacAction({ bat: true, lyDo: v.lyDo, maXacThuc: v.ma })}
          />
        )}
      </div>
    </div>
  );
}
