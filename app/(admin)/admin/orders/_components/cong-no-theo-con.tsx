"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Plus, Users, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { NoTheoConKetQua } from "@/lib/finance/no-theo-con";

import {
  boGanKhoanChoConAction,
  ganKhoanChoConAction,
  huyDotChoConAction,
  taoDotChoConAction,
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
 * KHỐI "KHOẢN ĐÃ THU CHƯA GẮN CON" — đường B [18/09/2026].
 *
 * ⚠️ Trước bản này chỗ đây là một dòng chữ tĩnh *"Gắn ở màn Thanh toán"* — và câu ấy KHÔNG
 * ĐÚNG với đơn nhiều con: màn biến động số dư chỉ thao tác trên `BankTransaction` đang
 * `UNMATCHED`, còn 4 khoản của `ORD-260917-000001` là `Payment` nhập tay, không có giao dịch
 * nào phía sau. Người đọc dòng ấy sẽ đi sang màn kia và không tìm thấy gì.
 * Affordance phải nói thật (luật 12) — nên nút nằm ở đây, ngay cạnh con số.
 *
 * GIỚI HẠN in thẳng trên màn: một khoản gắn cho ĐÚNG MỘT bé, chưa tách được một khoản cho
 * hai bé. Nói trước khi người dùng bấm, đừng để họ phát hiện sau.
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
                {duocGan && !moChon && (
                  <Button size="sm" variant="outline" onClick={() => datDangChon(k.id)}>
                    Gắn cho bé…
                  </Button>
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
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-xs text-state-warning-ink/80">
        Một khoản gắn cho <b>đúng một bé</b>. Chia một khoản cho hai bé thì{" "}
        <b>chưa hỗ trợ</b> — báo lại để xử lý riêng.
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
            {duocBoGan && dangMo !== k.id && (
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

export function CongNoTheoCon({
  orderId,
  so,
  duocSua,
  duocGan,
  duocBoGan,
}: {
  orderId: string;
  so: NoTheoConKetQua;
  /** Người xem có quyền tạo/huỷ đợt không. Ẩn nút KHÔNG phải kiểm quyền — action tự kiểm. */
  duocSua: boolean;
  /** `payments:record` — gắn một khoản đã thu cho một bé (đường B). */
  duocGan: boolean;
  /** `payments:manage` — bỏ gắn. Kế toán. */
  duocBoGan: boolean;
}) {
  const [dangMoForm, datDangMoForm] = useState<string | null>(null);

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
      </div>

      {/* Tiền đã vào đơn mà chưa gắn con nào. KHÔNG cộng vào "đã thu" của bất kỳ bé nào —
          cộng vào là tổng đơn trông đúng trong khi từng con vẫn sai.

          ⚠️ Lọc từ `khoanDaVeChiTiet` (tập RỘNG) chứ KHÔNG dùng `so.chuaGanCon > 0` như bản
          cũ: `chuaGanCon` chỉ cộng trục A, nên với 4 khoản `PENDING` của
          `ORD-260917-000001` nó ra 0 và cả khối này BIẾN MẤT — tiền có thật mà màn hình câm.
          Đo được 18/09, không phải phòng xa. */}
      <KhoiKhoanChoGan
        orderId={orderId}
        khoan={so.khoanDaVeChiTiet.filter((k) => k.orderItemId == null)}
        con={so.con}
        duocGan={duocGan}
      />

      <ul className="space-y-3">
        {so.con.map((c) => {
          const conLaiTaoDot = c.conNo - c.tongDotDangMo;
          const moForm = dangMoForm === c.orderItemId;
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
                <O nhan="Học phí" giaTri={vnd(c.phaiThu)} />
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
                        <CalendarClock
                          className="size-3.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
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
