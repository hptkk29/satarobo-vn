"use client";

import { useState, useTransition } from "react";
import { ArrowLeftRight, CalendarClock, HandCoins, Plus, Users, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { NoTheoConKetQua } from "@/lib/finance/no-theo-con";
import type { TrangThaiDungHocCuaCon } from "@/lib/finance/dung-hoc-con";
import { QrZoom } from "./qr-zoom";
import { NutDungHoc } from "./dung-hoc-dialog";
import { NutDoiKhoa, type LopChon } from "./doi-khoa-dialog";

import {
  boGanKhoanChoConAction,
  chuyenTienGiuaConAction,
  mienGiamNoAction,
  dongPhieuGopAction,
  ganKhoanChoConAction,
  huyDotChoConAction,
  huyPhieuGopAction,
  tachKhoanChoConAction,
  taoDotChoConAction,
  taoPhieuGopAction,
} from "../_actions";

/**
 * KHỐI "CÔNG NỢ THEO CON" — trang chi tiết đơn [PHIÊN A, 16/09/2026].
 *
 * Chủ dự án chốt: *"Mỗi con 1 dòng: khoá, học phí thực, đã thu, còn nợ, các đợt đang mở.
 * Nút 'Tạo đợt' trên từng con: số tiền + hạn. Không bắt lên lịch cả khoá, không trần số đợt."*
 *
 * ── Vì sao KHÔNG phải một cái bảng ──
 * Bảng buộc mọi con vào cùng một tập cột, nhưng thứ sale cần làm nằm Ở TRONG một con: xem đợt
 * đang mở của bé đó rồi tạo thêm một đợt cho bé đó. Trong bảng thì hành động đó phải chui vào
 * một menu hoặc mở một hộp thoại — tức tách người dùng khỏi con số họ vừa đọc.
 *
 * Nên mỗi con là một KHỐI: hàng số liệu ở trên, đợt của chính bé đó ngay dưới, form tạo đợt mở
 * ra tại chỗ. Không hộp thoại — việc này không cần ngắt mạch cũng không cần bảo vệ tiêu điểm.
 *
 * ── Ràng buộc đã tuân (DESIGN.md) ──
 * · admin = shadcn/ui, KHÔNG Magic UI / Framer Motion (ESLint chặn cứng);
 * · mọi màu qua token ngữ nghĩa `state-*`, không hex rời, không gradient, không viền trái dày;
 * · tiền `tabular-nums` + `text-xl` là trần (số 9 chữ số từng TRÀN thẻ KPI ở `/dashboard`);
 * · `min-w-0` + `truncate` ở mọi ô có tên người — tên tiếng Việt dài là mặc định;
 * · lưới số liệu 2 cột ở 320px, 4 cột từ `sm` — không tràn ngang ở mọi bề rộng;
 * · transition 150ms, không bounce.
 */

const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

const ngay = (d: Date | string | null) =>
  d == null ? "chưa có hạn" : new Date(d).toLocaleDateString("vi-VN");

/** Một ô số. `tone` đi qua token ngữ nghĩa, không mượn màu thương hiệu. */
function O({
  nhan,
  giaTri,
  tone = "neutral",
}: {
  nhan: string;
  giaTri: string;
  tone?: "neutral" | "ok" | "warn" | "danger";
}) {
  const mau =
    tone === "ok"
      ? "text-state-success-ink"
      : tone === "warn"
        ? "text-state-warning-ink"
        : tone === "danger"
          ? "text-state-danger-ink"
          : "text-foreground";
  return (
    <div className="min-w-0">
      <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {nhan}
      </p>
      <p className={`mt-0.5 truncate text-xl font-bold tabular-nums ${mau}`}>{giaTri}</p>
    </div>
  );
}

function FormTaoDot({
  orderId,
  orderItemId,
  toiDa,
  tenCon,
  dong,
}: {
  orderId: string;
  orderItemId: string;
  toiDa: number;
  tenCon: string;
  dong: () => void;
}) {
  const [soTien, setSoTien] = useState("");
  const [han, setHan] = useState("");
  const [dangChay, batDau] = useTransition();

  const gui = () => {
    const n = Number(soTien.replace(/\D/g, ""));
    batDau(async () => {
      const r = await taoDotChoConAction({
        orderId,
        orderItemId,
        soTien: n,
        dueDate: han || null,
      });
      // Câu lỗi do server trả về đã mang TÊN CON và CON SỐ (xem `kiemTaoDot`) — in nguyên văn
      // thay vì thay bằng một câu chung, vì đó mới là thứ sale sửa được ngay.
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(`Đã tạo đợt ${vnd(n)} cho ${tenCon}`);
        dong();
      }
    });
  };

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Số tiền · tối đa {vnd(toiDa)}
          </span>
          <Input
            inputMode="numeric"
            value={soTien}
            onChange={(e) => setSoTien(e.target.value)}
            placeholder="0"
            className="tabular-nums"
            aria-label={`Số tiền đợt thu của ${tenCon}`}
          />
        </label>
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Hạn đóng (không bắt buộc)
          </span>
          <Input
            type="date"
            value={han}
            onChange={(e) => setHan(e.target.value)}
            aria-label={`Hạn đóng đợt thu của ${tenCon}`}
          />
        </label>
        <div className="flex gap-2">
          <Button type="button" onClick={gui} disabled={dangChay || soTien.trim() === ""}>
            {dangChay ? "Đang tạo…" : "Tạo đợt"}
          </Button>
          <Button type="button" variant="ghost" onClick={dong} disabled={dangChay}>
            Huỷ
          </Button>
        </div>
      </div>
    </div>
  );
}

function NutHuyDot({
  orderId,
  paymentRequestId,
  moTa,
}: {
  orderId: string;
  paymentRequestId: string;
  moTa: string;
}) {
  const [dangChay, batDau] = useTransition();
  const [xacNhan, datXacNhan] = useState(false);

  // Xác nhận 2 bấm, theo nếp sẵn có của admin — không mở hộp thoại cho một việc hoàn tác được
  // bằng cách tạo lại đợt.
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={dangChay}
      aria-label={`Huỷ đợt ${moTa}`}
      onClick={() => {
        if (!xacNhan) {
          datXacNhan(true);
          return;
        }
        batDau(async () => {
          const r = await huyDotChoConAction({ orderId, paymentRequestId });
          if (!r.ok) toast.error(r.error);
          else toast.success("Đã huỷ đợt");
          datXacNhan(false);
        });
      }}
      onBlur={() => datXacNhan(false)}
      className="shrink-0 text-muted-foreground transition-colors duration-150 hover:text-state-danger-ink"
    >
      {xacNhan ? (
        <span className="text-xs font-semibold text-state-danger-ink">Bấm lần nữa</span>
      ) : (
        <X className="size-4" aria-hidden />
      )}
    </Button>
  );
}

/**
 * FORM TÁCH MỘT KHOẢN CHO NHIỀU BÉ [20/09/2026].
 *
 * Ca thật: `ORD-260918-000001` — một khoản 9.530.000đ cho hai bé. Trước bản này màn hình chỉ
 * có câu "chưa hỗ trợ".
 *
 * ── Vì sao có Ô ĐẾM NGƯỢC, và vì sao nút khoá khi chưa khớp ──
 * Luật là Σ **đúng bằng** số tiền khoản. Đo trên chính đơn pilot: hai nửa học phí là
 * 4.488.000 + 5.016.000 = 9.504.000, mà khoản là 9.530.000 ⇒ **lệch 26.000đ**. Người nhập
 * hai con số "đúng" ấy rồi bấm sẽ ăn một câu từ chối mà không hiểu vì sao — nên phần còn
 * thiếu / còn thừa phải hiện NGAY khi họ gõ, và nút khoá cho tới khi khớp. Câu từ chối của
 * server vẫn là thẩm quyền cuối, nhưng nó không nên là nơi người ta học luật.
 *
 * ── "tối đa" lấy từ `conCoTheNhan`, KHÔNG phải `conNo` ──
 * Trần của cổng là tập RỘNG (trừ cả tiền chờ xác nhận). Ô "Còn nợ" phía trên in trục A. Hai
 * số lệch nhau khi bé đã có tiền chờ duyệt — nên form phải in ĐÚNG con số mà cổng dùng, kẻo
 * màn nói một đằng cổng chặn một nẻo (bài học của cổng tạo đợt).
 */
function FormTachKhoan({
  orderId,
  paymentId,
  soTienKhoan,
  con,
  dong,
}: {
  orderId: string;
  paymentId: string;
  soTienKhoan: number;
  con: NoTheoConKetQua["con"];
  dong: () => void;
}) {
  const [oTien, datOTien] = useState<Record<string, string>>({});
  const [dangChay, batDau] = useTransition();

  const so = (id: string) => Number((oTien[id] ?? "").replace(/\D/g, "")) || 0;
  const daChia = con.reduce((s, c) => s + so(c.orderItemId), 0);
  const conLai = soTienKhoan - daChia;
  const soBeDaNhap = con.filter((c) => so(c.orderItemId) > 0).length;
  const khop = conLai === 0 && soBeDaNhap >= 2;

  const gui = () => {
    batDau(async () => {
      const r = await tachKhoanChoConAction({
        orderId,
        paymentId,
        phan: con
          .map((c) => ({ orderItemId: c.orderItemId, soTien: so(c.orderItemId) }))
          .filter((p) => p.soTien > 0),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Đã tách ${vnd(r.soTien)} cho ${r.tenCon.filter(Boolean).join(" · ")}`);
      dong();
    });
  };

  return (
    <div className="mt-2 rounded-lg border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">
        Chia <b className="tabular-nums text-foreground">{vnd(soTienKhoan)}</b> cho từng bé.
        Tổng phải <b>đúng bằng</b> số này.
      </p>

      <div className="mt-2 space-y-2">
        {con.map((c) => (
          <label key={c.orderItemId} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <span className="min-w-0 flex-1 truncate text-sm">
              {c.ten}
              <span className="ml-2 text-xs text-muted-foreground">
                tối đa {vnd(c.conCoTheNhan)}
              </span>
            </span>
            <Input
              inputMode="numeric"
              className="h-9 tabular-nums sm:w-44"
              placeholder="0"
              value={oTien[c.orderItemId] ?? ""}
              onChange={(e) =>
                datOTien((cu) => ({ ...cu, [c.orderItemId]: e.target.value }))
              }
              aria-label={`Số tiền tách cho ${c.ten}`}
            />
          </label>
        ))}
      </div>

      {/* Ô đếm ngược — thứ duy nhất trên màn này nói cho người nhập biết họ còn thiếu bao nhiêu. */}
      <p className="mt-2 text-xs">
        Đã chia <b className="tabular-nums">{vnd(daChia)}</b>
        {conLai === 0 ? (
          <span className="ml-2 font-semibold text-state-success-ink">· khớp</span>
        ) : conLai > 0 ? (
          <span className="ml-2 font-semibold text-state-danger-ink">
            · còn THIẾU {vnd(conLai)}
          </span>
        ) : (
          <span className="ml-2 font-semibold text-state-danger-ink">
            · chia THỪA {vnd(-conLai)}
          </span>
        )}
      </p>
      {conLai === 0 && soBeDaNhap < 2 && (
        <p className="mt-1 text-xs text-state-warning-ink">
          Tách là chia cho từ hai bé trở lên — một bé thì dùng “Gắn cho bé…”.
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" disabled={dangChay || !khop} onClick={gui}>
          {dangChay ? "Đang tách…" : "Tách"}
        </Button>
        <Button size="sm" variant="ghost" disabled={dangChay} onClick={dong}>
          Thôi
        </Button>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Tách rồi thì <b>không gộp lại được</b>. Sửa nhầm: kế toán bỏ gắn từng phần rồi gắn
        hoặc tách lại.
      </p>
    </div>
  );
}

/**
 * G1 · US-22 — MIỄN GIẢM một phần nợ của một bé [22/09/2026].
 *
 * ⚠️ Mở TẠI CHỖ, không hộp thoại: người bấm cần nhìn con số "còn nợ" của bé ngay lúc gõ, và
 * trần của ô nhập CHÍNH LÀ con số ấy.
 *
 * ⚠️ Nút chỉ vẽ khi bé CÒN NỢ. Miễn giảm cho một bé hết nợ (hoặc đang đóng thừa) là thao tác
 * mà máy chủ luôn từ chối — vẽ nút ở đó là lời hứa suông (luật 12).
 */
function FormMienGiam({
  orderId,
  con,
  dong,
}: {
  orderId: string;
  con: NoTheoConKetQua["con"][number];
  dong: () => void;
}) {
  const [oTien, datOTien] = useState("");
  const [lyDo, datLyDo] = useState("");
  const [dangChay, batDau] = useTransition();

  const soTien = Number((oTien || "").replace(/\D/g, "")) || 0;
  const toiDa = Math.max(0, con.conNo);
  const hopLe = soTien > 0 && soTien <= toiDa && !!lyDo.trim();

  const gui = () => {
    batDau(async () => {
      const r = await mienGiamNoAction({
        orderId,
        orderItemId: con.orderItemId,
        soTien,
        lyDo: lyDo.trim(),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        `Đã miễn ${vnd(r.soTien)} cho ${r.tenCon}` +
          (r.soDotDaDoi > 0 ? ` — ${r.soDotDaDoi} đợt được tạo lại` : ""),
      );
      dong();
    });
  };

  return (
    <div className="mt-3 rounded-lg border border-state-warning-soft bg-state-warning-soft/20 p-3">
      <p className="text-xs text-muted-foreground">
        Miễn một phần nợ của <b className="text-foreground">{con.ten}</b>. Đây là tiền
        {" "}<b className="text-foreground">KHÔNG BAO GIỜ về</b> — không có bước duyệt nào phía
        sau và không hoàn tác được. Tối đa {vnd(toiDa)} (đúng phần bé còn nợ).
      </p>

      <div className="mt-2 space-y-2">
        <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <span className="min-w-0 flex-1 text-sm">Số tiền miễn</span>
          <Input
            inputMode="numeric"
            className="tabular-nums sm:w-56"
            placeholder="0"
            value={oTien}
            onChange={(e) => datOTien(e.target.value)}
            aria-label={`Số tiền miễn giảm cho ${con.ten}`}
          />
        </label>
        <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <span className="min-w-0 flex-1 text-sm">Lý do *</span>
          <Input
            className="sm:w-56"
            placeholder="VD: hoàn cảnh gia đình, QLCS duyệt"
            value={lyDo}
            onChange={(e) => datLyDo(e.target.value)}
            aria-label="Lý do miễn giảm"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={!hopLe || dangChay} onClick={gui}>
          Miễn giảm
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={dangChay} onClick={dong}>
          Huỷ
        </Button>
      </div>
    </div>
  );
}

/**
 * F1 — CHUYỂN TIỀN từ bé này sang bé khác CÙNG ĐƠN [22/09/2026].
 *
 * ⚠️ Mở TẠI CHỖ, không hộp thoại — cùng lối với "Tạo đợt" và "Tách khoản": người bấm cần
 * nhìn thấy con số "đã thu" và "còn nợ" của cả hai bé ngay lúc gõ. Chỉ "Dừng học" mới
 * dùng hộp thoại, vì nó không hoàn tác được.
 */
function FormChuyenTien({
  orderId,
  cho,
  con,
  dong,
}: {
  orderId: string;
  cho: NoTheoConKetQua["con"][number];
  con: NoTheoConKetQua["con"];
  dong: () => void;
}) {
  const conLai = con.filter((c) => c.orderItemId !== cho.orderItemId);
  const [den, datDen] = useState(conLai[0]?.orderItemId ?? "");
  const [oTien, datOTien] = useState("");
  const [lyDo, datLyDo] = useState("");
  const [dangChay, batDau] = useTransition();

  const beNhan = conLai.find((c) => c.orderItemId === den);
  const soTien = Number((oTien || "").replace(/\D/g, "")) || 0;
  // Gợi ý = nhỏ hơn giữa hai trần. CHỈ là gợi ý — cổng thật nằm ở máy chủ.
  const toiDa = beNhan ? Math.min(Math.max(0, cho.daThu), Math.max(0, beNhan.conNo)) : 0;
  const hopLe = soTien > 0 && soTien <= toiDa && !!lyDo.trim() && !!beNhan;

  const gui = () => {
    batDau(async () => {
      const r = await chuyenTienGiuaConAction({
        orderId,
        tuOrderItemId: cho.orderItemId,
        denOrderItemId: den,
        soTien,
        lyDo: lyDo.trim(),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Đã chuyển ${vnd(r.soTien)} từ ${r.tenCho} sang ${r.tenNhan}`);
      dong();
    });
  };

  return (
    <div className="mt-3 rounded-lg border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">
        Chuyển phần <b className="text-foreground">kế toán ĐÃ XÁC NHẬN</b> của {cho.ten}
        {" "}sang một bé khác cùng đơn. Tối đa {vnd(Math.max(0, cho.daThu))} (phần đã xác nhận
        của {cho.ten}), và không vượt phần còn nợ của bé nhận.
      </p>

      <div className="mt-2 space-y-2">
        <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <span className="min-w-0 flex-1 text-sm">Chuyển sang</span>
          <select
            aria-label="Chọn bé nhận tiền"
            className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-sm sm:w-56"
            value={den}
            onChange={(e) => datDen(e.target.value)}
          >
            {conLai.map((c) => (
              <option key={c.orderItemId} value={c.orderItemId}>
                {c.ten} — còn nợ {vnd(Math.max(0, c.conNo))}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <span className="min-w-0 flex-1 text-sm">
            Số tiền
            <span className="ml-2 text-xs text-muted-foreground">tối đa {vnd(toiDa)}</span>
          </span>
          <Input
            inputMode="numeric"
            className="tabular-nums sm:w-56"
            placeholder="0"
            value={oTien}
            onChange={(e) => datOTien(e.target.value)}
            aria-label={`Số tiền chuyển từ ${cho.ten}`}
          />
        </label>

        <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <span className="min-w-0 flex-1 text-sm">Lý do *</span>
          <Input
            className="sm:w-56"
            placeholder="VD: gắn nhầm bé lúc đối soát"
            value={lyDo}
            onChange={(e) => datLyDo(e.target.value)}
            aria-label="Lý do chuyển tiền"
          />
        </label>
      </div>

      {/* Nút bị vô hiệu thì phải NÓI VÌ SAO (luật 12) — nếu không, người vận hành đọc nó
          như hệ thống hỏng và đi tìm nhầm chỗ. Ca thật: mọi bé còn lại đều hết nợ. */}
      {toiDa <= 0 && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-500">
          {beNhan
            ? `${beNhan.ten} không còn nợ đồng nào — chuyển sang là làm bé đó đóng thừa.`
            : "Đơn không còn bé nào khác để nhận."}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={!hopLe || dangChay} onClick={gui}>
          Chuyển
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={dangChay} onClick={dong}>
          Huỷ
        </Button>
      </div>
    </div>
  );
}

/**
 * KHỐI "KHOẢN ĐÃ THU CHƯA GẮN CON" — đường B [18/09/2026].
 *
 * ⚠️ Trước bản này chỗ đây là một dòng chữ tĩnh *"Gắn ở màn Thanh toán"* — và câu ấy KHÔNG
 * ĐÚNG với đơn nhiều con: màn biến động số dư chỉ thao tác trên `BankTransaction` đang
 * `UNMATCHED`, còn 4 khoản của `ORD-260917-000001` là `Payment` nhập tay, không có giao dịch
 * nào phía sau. Người đọc dòng ấy sẽ đi sang màn kia và không tìm thấy gì.
 * Affordance phải nói thật (luật 12) — nên nút nằm ở đây, ngay cạnh con số.
 *
 * ⚠️ **[ĐẢO 20/09/2026]** Câu "chưa tách được một khoản cho hai bé" ĐÃ HẾT ĐÚNG — nút
 * "Tách cho nhiều bé…" nằm ngay cạnh "Gắn cho bé…". Giữ lại vế còn đúng: MỘT lần bấm "Gắn"
 * vẫn cho đúng MỘT bé; muốn chia thì bấm nút kia.
 */
function KhoiKhoanChoGan({
  orderId,
  khoan,
  con,
  duocGan,
}: {
  orderId: string;
  khoan: NoTheoConKetQua["khoanDaVeChiTiet"];
  con: NoTheoConKetQua["con"];
  duocGan: boolean;
}) {
  const [dangChon, datDangChon] = useState<string | null>(null);
  const [beDaChon, datBeDaChon] = useState<string>("");
  /** Khoản nào đang mở form TÁCH. Rời với `dangChon` — hai việc, hai form, không chồng nhau. */
  const [dangTach, datDangTach] = useState<string | null>(null);
  const [dangChay, batDau] = useTransition();

  if (khoan.length === 0) return null;
  const tong = khoan.reduce((s, k) => s + k.amount, 0);

  const gan = (paymentId: string) => {
    if (!beDaChon) {
      toast.error("Chọn bé trước đã");
      return;
    }
    batDau(async () => {
      const r = await ganKhoanChoConAction({ orderId, paymentId, orderItemId: beDaChon });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Đã gắn ${vnd(r.soTien)} cho ${r.tenCon}`);
      datDangChon(null);
      datBeDaChon("");
    });
  };

  return (
    <div className="mb-4 rounded-lg border border-state-warning-ink/25 bg-state-warning-soft p-3">
      <p className="text-sm text-state-warning-ink">
        Có <b className="tabular-nums">{vnd(tong)}</b> đã vào đơn nhưng{" "}
        <b>chưa gắn cho con nào</b> — công nợ từng con chưa trừ khoản này.
      </p>

      <ul className="mt-2 space-y-2">
        {khoan.map((k) => {
          const moChon = dangChon === k.id;
          return (
            <li key={k.id} className="rounded-md bg-background/70 px-3 py-2">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <span className="min-w-0 text-sm">
                  <b className="tabular-nums">{vnd(k.amount)}</b>
                  {k.trangThaiKeToan !== "CONFIRMED" && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      kế toán chưa xác nhận
                    </span>
                  )}
                </span>
                {duocGan && !moChon && dangTach !== k.id && (
                  <span className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" onClick={() => datDangChon(k.id)}>
                      Gắn cho bé…
                    </Button>
                    {/* Chỉ mời TÁCH khi đơn có từ hai bé — một bé thì tách vô nghĩa và cổng
                        sẽ từ chối. Đừng vẽ nút rồi để cổng nói không (luật 12). */}
                    {con.length >= 2 && (
                      <Button size="sm" variant="outline" onClick={() => datDangTach(k.id)}>
                        Tách cho nhiều bé…
                      </Button>
                    )}
                  </span>
                )}
              </div>

              {moChon && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {/* `select` thuần chứ không phải shadcn `Select`: danh sách chỉ 2-3 bé và
                      `SelectValue` của base-ui hiện GIÁ TRỊ THÔ chứ không tra nhãn — một bẫy
                      đã ghi trong sổ repo. */}
                  <select
                    aria-label="Chọn bé để gắn khoản này"
                    className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                    value={beDaChon}
                    onChange={(e) => datBeDaChon(e.target.value)}
                  >
                    <option value="">— chọn bé —</option>
                    {con.map((c) => (
                      <option key={c.orderItemId} value={c.orderItemId}>
                        {c.ten}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" disabled={dangChay} onClick={() => gan(k.id)}>
                    Gắn
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={dangChay}
                    onClick={() => {
                      datDangChon(null);
                      datBeDaChon("");
                    }}
                  >
                    Thôi
                  </Button>
                </div>
              )}

              {dangTach === k.id && (
                <FormTachKhoan
                  orderId={orderId}
                  paymentId={k.id}
                  soTienKhoan={k.amount}
                  con={con}
                  dong={() => datDangTach(null)}
                />
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-xs text-state-warning-ink/80">
        Một lần bấm <b>“Gắn cho bé…”</b> cho đúng một bé. Phụ huynh chuyển một lần cho nhiều
        con thì bấm <b>“Tách cho nhiều bé…”</b> — tổng các phần phải đúng bằng số tiền khoản,
        và <b>tách rồi không gộp lại được</b>.
      </p>
    </div>
  );
}

/**
 * Các khoản ĐÃ gắn cho một bé, kèm nút bỏ gắn (kế toán).
 *
 * Bỏ gắn BẮT BUỘC ghi lý do — đây là đường sửa quyết định của người khác, nên nó phải để lại
 * câu trả lời cho "vì sao". Ô lý do mở TẠI CHỖ, không hộp thoại: cùng lối với form tạo đợt
 * ngay dưới, và việc này không cần ngắt mạch người dùng.
 */
function KhoanCuaCon({
  orderId,
  khoan,
  duocBoGan,
}: {
  orderId: string;
  khoan: NoTheoConKetQua["khoanDaVeChiTiet"];
  duocBoGan: boolean;
}) {
  const [dangMo, datDangMo] = useState<string | null>(null);
  const [lyDo, datLyDo] = useState("");
  const [dangChay, batDau] = useTransition();

  if (khoan.length === 0) return null;

  const boGan = (paymentId: string) => {
    if (!lyDo.trim()) {
      toast.error("Ghi lý do bỏ gắn");
      return;
    }
    batDau(async () => {
      const r = await boGanKhoanChoConAction({ orderId, paymentId, lyDo });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Đã bỏ gắn ${vnd(r.soTien)}`);
      datDangMo(null);
      datLyDo("");
    });
  };

  return (
    <ul className="mt-2 space-y-1">
      {khoan.map((k) => (
        <li key={k.id} className="rounded-md bg-muted/40 px-2 py-1.5 text-xs">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="min-w-0 text-muted-foreground">
              Khoản <b className="tabular-nums text-foreground">{vnd(k.amount)}</b>
              {k.trangThaiKeToan !== "CONFIRMED" && " · kế toán chưa xác nhận"}
            </span>
            {/* Bút toán ĐẢO (số âm) không phải khoản để bỏ gắn — bỏ gắn nó là đưa một dòng
                đối ứng ra khỏi bé trong khi dòng nó đối ứng vẫn ở đó. Ẩn nút thay vì để cổng
                từ chối sau khi bấm (luật 12). */}
            {duocBoGan && k.loaiButToan === "PAYMENT" && dangMo !== k.id && (
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 transition-colors duration-150 hover:text-state-danger-ink hover:underline"
                onClick={() => datDangMo(k.id)}
              >
                Bỏ gắn bé
              </button>
            )}
          </div>
          {dangMo === k.id && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Input
                className="h-8 min-w-0 flex-1 text-xs"
                placeholder="Lý do bỏ gắn (bắt buộc)"
                value={lyDo}
                onChange={(e) => datLyDo(e.target.value)}
              />
              <Button size="sm" variant="destructive" disabled={dangChay} onClick={() => boGan(k.id)}>
                Bỏ gắn
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={dangChay}
                onClick={() => {
                  datDangMo(null);
                  datLyDo("");
                }}
              >
                Thôi
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Phiếu gộp đang mở của đơn — bộ số màn hình cần, đã dựng sẵn ở SERVER.
 *
 * ⚠️ `qrUrl` và `noiDungCk` dựng ở server chứ không ở đây, vì cả hai đều cần tài khoản nhận
 * tiền của cơ sở (`resolveOrderPaymentConfig`) và cần biết người xem có `orders:view-pii`
 * không. Dựng ở client là hoặc lộ SĐT cho người không có quyền, hoặc nhúng một chuỗi ĐÃ CHE
 * vào ảnh QR — và QR mang chuỗi che thì tiền không về được.
 */
export type PhieuGopView = {
  billId: string;
  ma: string;
  tongTien: number;
  /** Σ đã rót vào các đợt của phiếu. > 0 ⇒ chỉ ĐÓNG được, không huỷ được. */
  daNhan: number;
  dong: { ten: string; soTien: number }[];
  /** `null` khi cơ sở chưa khai tài khoản, hoặc người xem thiếu `orders:view-pii`. */
  qrUrl: string | null;
  /** Nội dung chuyển khoản — bản HIỂN THỊ (có thể đã che SĐT). */
  noiDungCk: string;
};

/**
 * KHỐI PHIẾU GỘP ĐANG MỞ — mã, tổng, từng dòng, QR, và hai nút kết thúc.
 *
 * ── Vì sao MÃ in to và tách ký tự ──
 * Sale đọc mã này cho phụ huynh QUA ĐIỆN THOẠI. Bảng chữ đã loại 9 ký tự nhìn giống nhau
 * (`O0I1LB8S5`), nhưng một chuỗi 5 ký tự dính liền vẫn khó đọc từng tiếng. `tracking-[0.3em]`
 * + `font-mono` làm mỗi ký tự đứng riêng — đọc được mà không phải đánh vần.
 *
 * ── Vì sao in CẢ nội dung chuyển khoản ──
 * Không phải phụ huynh nào cũng quét được QR (điện thoại cũ, app ngân hàng không có camera).
 * Khi đó họ gõ tay, và thứ họ cần là ĐÚNG chuỗi mà máy đối khớp sẽ đọc — không phải một câu
 * mô tả. Đây cũng là lý do chuỗi này lấy từ cùng một nguồn với ảnh QR.
 */
function KhoiPhieuGop({
  orderId,
  phieu,
  duocHuy,
  duocDong,
}: {
  orderId: string;
  phieu: PhieuGopView;
  duocHuy: boolean;
  duocDong: boolean;
}) {
  const [lyDo, datLyDo] = useState("");
  const [dangMo, datDangMo] = useState<"HUY" | "DONG" | null>(null);
  const [dangChay, batDau] = useTransition();

  const ketThuc = (kieu: "HUY" | "DONG") => {
    if (!lyDo.trim()) {
      toast.error("Ghi lý do");
      return;
    }
    batDau(async () => {
      const r =
        kieu === "HUY"
          ? await huyPhieuGopAction({ orderId, billId: phieu.billId, lyDo })
          : await dongPhieuGopAction({ orderId, billId: phieu.billId, lyDo });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(kieu === "HUY" ? "Đã huỷ phiếu" : "Đã đóng phiếu");
      datDangMo(null);
      datLyDo("");
    });
  };

  return (
    <div className="mb-4 rounded-lg border border-primary/25 bg-primary/5 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Phiếu thu gộp · đang chờ tiền
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tracking-[0.3em] text-foreground">
            {phieu.ma}
          </p>
          <p className="mt-1 text-sm">
            Tổng <b className="tabular-nums">{vnd(phieu.tongTien)}</b>
            {phieu.daNhan > 0 && (
              <span className="ml-2 text-state-warning-ink">
                · đã nhận {vnd(phieu.daNhan)} từ đường khác
              </span>
            )}
          </p>
          <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            {phieu.dong.map((d, i) => (
              <li key={`${d.ten}-${i}`} className="min-w-0 truncate">
                {d.ten} · <span className="tabular-nums">{vnd(d.soTien)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 break-all text-xs text-muted-foreground">
            Nội dung CK: <code className="text-foreground">{phieu.noiDungCk}</code>
          </p>
        </div>

        {phieu.qrUrl ? (
          // Dùng lại `QrZoom` của màn đơn — bấm để phóng to + chép nội dung CK. Viết một thẻ
          // `img` riêng ở đây là đẻ ra cái QR thứ hai mà người dùng không phóng to được, cho
          // đúng cùng một việc.
          <QrZoom
            src={phieu.qrUrl}
            alt={`Mã QR phiếu gộp ${phieu.ma}`}
            title={`Phiếu ${phieu.ma}: ${vnd(phieu.tongTien)}`}
            transferContent={phieu.noiDungCk}
            className="h-40 w-40 shrink-0"
          />
        ) : (
          // Trạng thái rỗng NÓI VÌ SAO. Một ô trống không lý do là affordance nói dối theo
          // chiều ngược lại — người dùng tưởng QR đang tải.
          <p className="shrink-0 text-xs text-muted-foreground sm:w-40">
            Chưa dựng được QR — cơ sở chưa khai tài khoản nhận tiền, hoặc bạn không có quyền xem
            thông tin liên hệ.
          </p>
        )}
      </div>

      {(duocHuy || duocDong) && (
        <div className="mt-3 border-t border-primary/20 pt-3">
          {dangMo === null ? (
            <div className="flex flex-wrap gap-2">
              {/* Hai nút, và chỉ MỘT trong hai dùng được tuỳ phiếu đã nhận tiền chưa. Hiện cả
                  hai rồi để cổng từ chối là bắt người dùng đoán; ẩn đúng cái không dùng được
                  thì màn hình tự nói luật. */}
              {duocHuy && phieu.daNhan === 0 && (
                <Button size="sm" variant="outline" onClick={() => datDangMo("HUY")}>
                  Huỷ phiếu
                </Button>
              )}
              {duocDong && phieu.daNhan > 0 && (
                <Button size="sm" variant="outline" onClick={() => datDangMo("DONG")}>
                  Đóng phiếu
                </Button>
              )}
              {phieu.daNhan > 0 && !duocDong && (
                <p className="text-xs text-muted-foreground">
                  Phiếu đã nhận tiền — chỉ kế toán đóng được.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="h-8 min-w-0 flex-1 text-xs"
                placeholder={dangMo === "HUY" ? "Lý do huỷ (bắt buộc)" : "Lý do đóng (bắt buộc)"}
                value={lyDo}
                onChange={(e) => datLyDo(e.target.value)}
              />
              <Button
                size="sm"
                variant="destructive"
                disabled={dangChay}
                onClick={() => ketThuc(dangMo)}
              >
                {dangMo === "HUY" ? "Huỷ phiếu" : "Đóng phiếu"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={dangChay}
                onClick={() => {
                  datDangMo(null);
                  datLyDo("");
                }}
              >
                Thôi
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * THANH "IN QR" — hiện khi sale đã tick ít nhất một đợt.
 *
 * ⚠️ Nút in ĐÚNG số tiền sắp đòi ngay trên mặt nút. Một nút "In QR" trần trụi buộc người bấm
 * tự cộng nhẩm các ô vừa tick, và cộng nhẩm sai thì tờ QR đòi sai — mà lúc đó phụ huynh là
 * người phát hiện ra.
 */
function ThanhInQr({
  orderId,
  chon,
  tong,
  xoaChon,
}: {
  orderId: string;
  chon: string[];
  tong: number;
  xoaChon: () => void;
}) {
  const [dangChay, batDau] = useTransition();
  if (chon.length === 0) return null;

  const gui = () => {
    batDau(async () => {
      const r = await taoPhieuGopAction({ orderId, paymentRequestIds: chon });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Đã phát phiếu ${r.ma} — ${vnd(r.tongTien)}`);
      xoaChon();
    });
  };

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 p-3">
      <p className="min-w-0 text-sm">
        Đã chọn <b>{chon.length}</b> đợt · tổng{" "}
        <b className="tabular-nums">{vnd(tong)}</b>
      </p>
      <div className="flex gap-2">
        <Button size="sm" disabled={dangChay} onClick={gui}>
          {dangChay ? "Đang phát…" : `In QR ${vnd(tong)}`}
        </Button>
        <Button size="sm" variant="ghost" disabled={dangChay} onClick={xoaChon}>
          Bỏ chọn
        </Button>
      </div>
    </div>
  );
}

export function CongNoTheoCon({
  orderId,
  so,
  duocSua,
  duocGan,
  duocBoGan,
  dungHoc,
  baoLuu,
  themCon = null,
  lopDoiKhoa = [],
  phieu = null,
}: {
  orderId: string;
  so: NoTheoConKetQua;
  /** Người xem có quyền tạo/huỷ đợt không. Ẩn nút KHÔNG phải kiểm quyền — action tự kiểm. */
  duocSua: boolean;
  /** `payments:record` — gắn một khoản đã thu cho một bé (đường B) + phát/huỷ phiếu gộp. */
  duocGan: boolean;
  /** `payments:manage` — bỏ gắn, đóng phiếu đã nhận tiền. Kế toán. */
  duocBoGan: boolean;
  /**
   * PHIÊN D — trạng thái dừng học + tình hình hoàn tiền của TỪNG dòng, khoá theo
   * `orderItemId`. Dựng ở server bằng `docTrangThaiDungHoc`.
   *
   * ⚠️ Dòng thiếu khoá trong map này được coi là CÒN HỌC. Mặc định fail-safe theo hướng
   * "chưa dừng": hiện nhầm một bé đã dừng thành còn học thì người ta thấy ngay và bấm lại;
   * hiện nhầm chiều ngược lại là giấu mất nút của một bé đang học.
   */
  dungHoc?: Record<string, TrangThaiDungHocCuaCon>;
  /**
   * F2 — con nào ĐANG BẢO LƯU, khoá theo `orderItemId`. Dựng ở server bằng
   * `docBaoLuuCuaDon` (`lib/finance/bao-luu-tien.ts`).
   *
   * ⚠️ Chỉ để HIỂN THỊ. Màn này KHÔNG có nút bảo lưu, và đó là chủ đích: cửa bảo lưu ở
   * màn học viên (`/students/<id>/edit`) vì bảo lưu là việc học vụ (dừng lịch học, dừng
   * giao bài) mà tiền chỉ đi theo. Thêm nút thứ hai ở đây là hai cửa cho một trạng thái.
   */
  baoLuu?: Record<string, { reserveId: string; startedAt: Date | string; expectedEndAt: Date | string | null; soNgayDaDoiHan: number | null }>;
  /**
   * F3 — nút "Thêm con vào đơn…" (hộp thoại riêng, dựng ở trang vì nó cần danh sách khoá học).
   *
   * ⚠️ Nhận sẵn phần tử chứ không nhận `khoa[]` rồi tự vẽ: khối này là client component và
   * danh sách khoá học là một câu tra DB. Đẩy câu tra xuống client là một lượt đi về nữa cho
   * một danh sách hầu như không đổi.
   */
  themCon?: React.ReactNode;
  /**
   * F4 — lớp chọn được khi đổi khoá. Rỗng ⇒ KHÔNG vẽ nút (luật 12: nút dẫn thẳng tới một
   * danh sách trống là lời hứa suông).
   */
  lopDoiKhoa?: LopChon[];
  /** Phiếu gộp ĐANG MỞ của đơn, `null` khi chưa phát. Dựng ở server — xem `PhieuGopView`. */
  phieu?: PhieuGopView | null;
}) {
  const [dangMoForm, datDangMoForm] = useState<string | null>(null);
  /** F1 — bé nào đang mở form chuyển tiền. Một lúc chỉ một. */
  const [dangMoChuyen, datDangMoChuyen] = useState<string | null>(null);
  /** G1 — bé nào đang mở form miễn giảm. Một lúc một. */
  const [dangMoMien, datDangMoMien] = useState<string | null>(null);
  /**
   * Các đợt sale đang tick để gộp thành MỘT phiếu.
   *
   * ⚠️ State nằm ở ĐÂY chứ không trong từng khối con: một phiếu gộp trải trên NHIỀU con, nên
   * lựa chọn phải sống ở chỗ nhìn thấy cả hai. Đặt trong khối con là mỗi bé một rổ riêng và
   * không bao giờ gộp được — đúng thứ tính năng này sinh ra để làm.
   */
  const [chon, datChon] = useState<string[]>([]);
  const coPhieu = phieu != null;
  // Đang có phiếu OPEN thì KHÔNG cho tick tiếp: B7 (một đơn một phiếu) do DB gác, và một ô
  // tick dẫn tới câu từ chối là affordance nói dối.
  const choPhepChon = duocGan && !coPhieu;
  const tongChon = so.con
    .flatMap((c) => c.dotDangMo)
    .filter((d) => chon.includes(d.id))
    .reduce((s, d) => s + Math.max(0, d.amountDue - d.daRot), 0);

  if (so.con.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
          <Users className="size-4 text-muted-foreground" aria-hidden />
          Công nợ theo con
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Đơn này chưa có dòng hàng nào, nên chưa tách được công nợ theo từng con.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="cong-no-theo-con-title"
      className="rounded-xl border border-border bg-card p-5"
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="cong-no-theo-con-title"
          className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground"
        >
          <Users className="size-4 text-muted-foreground" aria-hidden />
          Công nợ theo con
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-muted-foreground">
            Tổng{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {vnd(so.tongPhaiThu)}
            </span>{" "}
            · còn nợ{" "}
            <span className="font-semibold tabular-nums text-state-danger-ink">
              {vnd(so.tongConNo)}
            </span>
          </p>
          {/* F3 — "Thêm con vào đơn…" đặt ở ĐẦU khối, cạnh con số tổng: nó là thao tác trên
              CẢ ĐƠN (đổi tổng đơn, có thể đổi ưu đãi của mọi bé), không phải thao tác của
              một dòng. Đặt nó dưới một bé cụ thể là nói sai phạm vi của nó. */}
          {duocSua && themCon}
        </div>
      </div>

      {/* Tiền đã vào đơn mà chưa gắn con nào. KHÔNG cộng vào "đã thu" của bất kỳ bé nào —
          cộng vào là tổng đơn trông đúng trong khi từng con vẫn sai.

          ⚠️ Lọc từ `khoanDaVeChiTiet` (tập RỘNG) chứ KHÔNG dùng `so.chuaGanCon > 0` như bản
          cũ: `chuaGanCon` chỉ cộng trục A, nên với 4 khoản `PENDING` của
          `ORD-260917-000001` nó ra 0 và cả khối này BIẾN MẤT — tiền có thật mà màn hình câm.
          Đo được 18/09, không phải phòng xa. */}
      {/* PHIÊN C — phiếu gộp. Đặt TRÊN khối "khoản chờ gắn" có chủ đích: phiếu là việc SẮP
          làm (đang chờ tiền), còn khoản chờ gắn là việc ĐÃ RỒI cần dọn. Thứ tự đọc của màn
          hình nên theo thứ tự đó. */}
      {phieu && (
        <KhoiPhieuGop
          orderId={orderId}
          phieu={phieu}
          duocHuy={duocGan}
          duocDong={duocBoGan}
        />
      )}
      {choPhepChon && (
        <ThanhInQr
          orderId={orderId}
          chon={chon}
          tong={tongChon}
          xoaChon={() => datChon([])}
        />
      )}

      {/* ⚠️ Lọc thêm HAI vế kể từ phép TÁCH [20/09/2026]. Tách để lại dòng gốc + một bút
          toán đảo, CẢ HAI mang `orderItemId = NULL`; không lọc thì khối này liệt kê một dòng
          `+9.530.000` và một dòng `−9.530.000`, mỗi dòng một nút "Gắn cho bé…" — tổng in ra
          đúng (0đ) mà danh sách thì vô nghĩa, và bấm vào đâu cũng sai.

          · `loaiButToan === "PAYMENT"` — bút toán đảo không phải tiền để gắn;
          · `!daDao`                    — dòng đã bị đảo thì phần tiền của nó nay nằm ở n dòng
                                          mới, gắn nó lần nữa là gắn một khoản đã tiêu.

          Hai trường này KHÔNG đụng vào phép cộng nào (xem `KhoanDaVe`) — chúng chỉ quyết
          định màn hình mời bấm cái gì. */}
      <KhoiKhoanChoGan
        orderId={orderId}
        khoan={so.khoanDaVeChiTiet.filter(
          (k) => k.orderItemId == null && k.loaiButToan === "PAYMENT" && !k.daDao,
        )}
        con={so.con}
        duocGan={duocGan}
      />

      <ul className="space-y-3">
        {so.con.map((c) => {
          const conLaiTaoDot = c.conNo - c.tongDotDangMo;
          const moForm = dangMoForm === c.orderItemId;
          const tt = dungHoc?.[c.orderItemId];
          const bl = baoLuu?.[c.orderItemId];
          const moChuyen = dangMoChuyen === c.orderItemId;
          const moMien = dangMoMien === c.orderItemId;
          return (
            <li
              key={c.orderItemId}
              className="rounded-xl border border-border bg-background p-4"
            >
              <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                  {c.ten}
                </p>
                {c.khoa && (
                  <span className="shrink-0 truncate text-xs text-muted-foreground">{c.khoa}</span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                {/* Nhãn phải NÓI THẬT (luật 12): sau khi dừng, con số này là giá trị quyết
                    toán chứ không còn là học phí của khoá. Giữ nguyên chữ "Học phí" là một
                    cái nhãn nói dối, và nó nói dối đúng về tiền. */}
                <O nhan={tt?.daDung ? "Phải trả (quyết toán)" : "Học phí"} giaTri={vnd(c.phaiThu)} />
                <O nhan="Đã thu" giaTri={vnd(c.daThu)} tone="ok" />
                <O
                  nhan="Chờ xác nhận"
                  giaTri={vnd(c.choXacNhan)}
                  tone={c.choXacNhan > 0 ? "warn" : "neutral"}
                />
                <O
                  nhan="Còn nợ"
                  giaTri={vnd(c.conNo)}
                  tone={c.conNo > 0 ? "danger" : "ok"}
                />
              </div>

              {/* F2 · US-18 — bé ĐANG BẢO LƯU. Phải nói ra ở đây, cạnh con số, vì hạn các
                  đợt của bé vừa bị dời: một cái hạn 22/11 không lời giải thích đọc như
                  người nhập sai ngày. Và bé bảo lưu KHÔNG bị báo quá hạn — nói luôn, kẻo
                  kế toán đi tìm xem vì sao nó biến khỏi danh sách đối soát. */}
              {bl && (
                <div className="mt-3 rounded-lg border border-state-warning-soft bg-state-warning-soft/40 p-3 text-xs">
                  <p className="font-medium text-foreground">
                    Đang bảo lưu
                    {` từ ${new Date(bl.startedAt).toLocaleDateString("vi-VN")}`}
                    {bl.expectedEndAt
                      ? ` · dự kiến học lại ${new Date(bl.expectedEndAt).toLocaleDateString("vi-VN")}`
                      : " · CHƯA khai ngày học lại"}
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    {bl.soNgayDaDoiHan != null && bl.soNgayDaDoiHan > 0
                      ? `Hạn các đợt chưa tới hạn đã dời ${bl.soNgayDaDoiHan} ngày.`
                      : bl.expectedEndAt
                        // Có ngày học lại mà không đợt nào dời: hoặc đợt đều đã quá hạn từ
                        // trước (không dời — đúng luật), hoặc phép dời chưa chạy được. Hai
                        // ca khác nhau nên câu chữ không được khẳng định ca nào.
                        ? "Chưa có đợt nào được dời hạn (đợt đã quá hạn từ trước thì không dời)."
                        : "Không khai ngày học lại thì không dời được hạn đợt nào."}
                    {" "}Trong thời gian bảo lưu, đợt của bé không bị tính quá hạn.
                  </p>
                </div>
              )}

              {/* PHIÊN D — bé ĐÃ DỪNG: nói rõ quyết toán ra số nào, và khoản dư đang nằm
                  ở đâu. Đặt NGAY DƯỚI hàng số liệu vì "Học phí" của bé vừa đổi nghĩa (nó là
                  giá trị quyết toán, không còn là học phí gốc) — không giải thích ngay cạnh
                  thì con số ấy đọc như một lỗi. */}
              {tt?.daDung && (
                <div className="mt-3 rounded-lg bg-muted/40 p-3 text-xs">
                  <p className="font-medium text-foreground">
                    Đã dừng học
                    {tt.stoppedAt && ` ${new Date(tt.stoppedAt).toLocaleDateString("vi-VN")}`}
                    {tt.stopReason === "TRUNG_TAM_HUY" && " · trung tâm huỷ, không thu phí"}
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    Dùng <b className="tabular-nums text-foreground">{tt.usedSessions ?? 0}</b>
                    {tt.committedSessions != null && `/${tt.committedSessions}`} buổi
                    {tt.stopUnitPrice != null && tt.stopUnitPrice > 0 && (
                      <> · đơn giá {vnd(tt.stopUnitPrice)}/buổi</>
                    )}
                    {tt.lastSessionDate && (
                      <> · buổi cuối {new Date(tt.lastSessionDate).toLocaleDateString("vi-VN")}</>
                    )}
                  </p>
                  {tt.stopNote && (
                    <p className="mt-1 text-muted-foreground">Ghi chú: {tt.stopNote}</p>
                  )}
                  {tt.choHoan > 0 && (
                    <p className="mt-1.5 text-state-warning-ink">
                      Chờ kế toán hoàn: <b className="tabular-nums">{vnd(tt.choHoan)}</b>
                    </p>
                  )}
                  {/* Kế toán TỪ CHỐI yêu cầu hoàn mà bé vẫn còn dư ⇒ khoản đó quay về "chưa
                      ai xử". Không nói ra thì nó hiện như "đóng thừa" vô cớ, và không ai đi
                      tìm — đúng cái chết câm chủ dự án cấm. */}
                  {tt.choHoan === 0 && c.conNo < 0 && (
                    <p className="mt-1.5 text-state-danger-ink">
                      Dư <b className="tabular-nums">{vnd(-c.conNo)}</b> CHƯA xử lý
                      {tt.coHoanBiTuChoi && " (kế toán đã từ chối yêu cầu hoàn)"} — chọn lại:
                      chuyển sang bé khác hoặc tạo yêu cầu hoàn mới.
                    </p>
                  )}
                </div>
              )}

              {/* Khoản ĐÃ gắn cho chính bé này — chỗ duy nhất bỏ gắn được. Đặt ngay dưới
                  hàng số liệu của bé, vì người bỏ gắn cần thấy "đã thu" của bé đổi theo. */}
              <KhoanCuaCon
                orderId={orderId}
                khoan={so.khoanDaVeChiTiet.filter((k) => k.orderItemId === c.orderItemId)}
                duocBoGan={duocBoGan}
              />

              {c.dotDangMo.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
                  {c.dotDangMo.map((d) => (
                    <li
                      key={d.id}
                      className="flex min-w-0 items-center justify-between gap-2 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {choPhepChon ? (
                          // `input` thuần, không shadcn `Checkbox` (repo chưa có primitive đó,
                          // và thêm một primitive chỉ để tick vài dòng là thêm một thứ phải
                          // nuôi). `accent-*` cho màu theo token, `size-4` cho vùng bấm đủ to
                          // ở 320px.
                          <input
                            type="checkbox"
                            className="size-4 shrink-0 accent-primary"
                            checked={chon.includes(d.id)}
                            onChange={(e) =>
                              datChon((cu) =>
                                e.target.checked ? [...cu, d.id] : cu.filter((x) => x !== d.id),
                              )
                            }
                            aria-label={`Gộp đợt ${vnd(d.amountDue)} của ${c.ten} vào phiếu QR`}
                          />
                        ) : (
                          <CalendarClock
                            className="size-3.5 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                        )}
                        <span className="truncate">
                          <b className="tabular-nums">{vnd(d.amountDue)}</b>
                          <span className="text-muted-foreground">
                            {" "}
                            · hạn {ngay(d.dueDate)}
                            {d.daRot > 0 && ` · đã nhận ${vnd(d.daRot)}`}
                          </span>
                        </span>
                      </span>
                      {duocSua && d.daRot === 0 && (
                        <NutHuyDot
                          orderId={orderId}
                          paymentRequestId={d.id}
                          moTa={`${vnd(d.amountDue)} của ${c.ten}`}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* Bé đã dừng thì KHÔNG còn nút "Dừng học" và KHÔNG tạo đợt mới được —
                  phần còn nợ (nếu học lố) vẫn tạo đợt được như thường, nên cổng nằm ở
                  `conLaiTaoDot` chứ không ở đây. */}
              {/* F1 — chuyển tiền sang bé khác. Chỉ vẽ khi CÓ bé khác và bé này CÓ tiền
                  đã xác nhận để chuyển: một nút dẫn thẳng tới câu từ chối là lời hứa suông
                  (luật 12). */}
              {/* G1 · US-22 — MIỄN GIẢM. Chỉ vẽ khi bé CÒN NỢ: máy chủ luôn từ chối miễn cho
                  bé hết nợ hoặc đang đóng thừa, nên nút ở đó là lời hứa suông (luật 12).
                  Quyền: `orders:manage` (QLCS + kế toán Hội sở) — sale KHÔNG có, và action
                  tự từ chối chứ không chỉ ẩn nút. */}
              {duocSua && c.conNo > 0 && (
                moMien ? (
                  <FormMienGiam orderId={orderId} con={c} dong={() => datDangMoMien(null)} />
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => datDangMoMien(c.orderItemId)}
                  >
                    <HandCoins className="size-4" aria-hidden />
                    Miễn giảm nợ…
                  </Button>
                )
              )}

              {duocBoGan && so.con.length >= 2 && c.daThu > 0 && (
                moChuyen ? (
                  <FormChuyenTien
                    orderId={orderId}
                    cho={c}
                    con={so.con}
                    dong={() => datDangMoChuyen(null)}
                  />
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => datDangMoChuyen(c.orderItemId)}
                  >
                    <ArrowLeftRight className="size-4" aria-hidden />
                    Chuyển tiền sang bé khác
                  </Button>
                )
              )}

              {duocSua && !tt?.daDung && (
                <NutDungHoc orderId={orderId} orderItemId={c.orderItemId} tenCon={c.ten} />
              )}

              {/* F4 — đổi khoá / đổi lớp. Cạnh "Dừng học" vì cùng họ: cả hai kết thúc khoá
                  hiện tại của bé. Khác nhau ở chỗ đổi khoá thì bé HỌC TIẾP, nên tiền dư đi
                  theo chứ không ra khỏi nhà. Bé đã dừng thì không còn gì để đổi. */}
              {duocSua && !tt?.daDung && lopDoiKhoa.length > 0 && (
                <NutDoiKhoa
                  orderId={orderId}
                  orderItemId={c.orderItemId}
                  tenCon={c.ten}
                  lop={lopDoiKhoa}
                />
              )}

              {duocSua &&
                (moForm ? (
                  <FormTaoDot
                    orderId={orderId}
                    orderItemId={c.orderItemId}
                    toiDa={conLaiTaoDot}
                    tenCon={c.ten}
                    dong={() => datDangMoForm(null)}
                  />
                ) : conLaiTaoDot > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => datDangMoForm(c.orderItemId)}
                  >
                    <Plus className="size-4" aria-hidden />
                    Tạo đợt cho {c.ten}
                  </Button>
                ) : (
                  // Trạng thái rỗng NÓI VÌ SAO, không chỉ ẩn nút: nút biến mất không lý do là
                  // affordance nói dối theo chiều ngược lại.
                  <p className="mt-3 text-xs text-muted-foreground">
                    {c.conNo <= 0
                      ? "Đã thu đủ — không cần tạo đợt."
                      : `Các đợt đang mở đã phủ hết ${vnd(c.conNo)} còn nợ.`}
                  </p>
                ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
