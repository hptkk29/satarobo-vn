"use client";

// Nút XỬ LÝ cho một giao dịch còn nằm trong hàng chờ đối soát (UNMATCHED).
//
// Hai việc kế toán thực sự làm khi nhìn một dòng tiền lạ:
//   1. "Tiền này của đơn nào" → tìm đơn rồi GÁN.
//   2. "Tiền này không phải học phí" → BỎ QUA, kèm lý do.
// Không có việc thứ ba. Cố ý KHÔNG có nút "xoá" — tiền đã về tài khoản thì sổ phải
// giữ dòng đó mãi, chỉ được đổi nhãn.
//
// ⚠️ Mọi quyết định về tiền nằm ở server (`../_actions`). Component này chỉ thu
// thập ý định của người dùng rồi hiển thị kết quả — kể cả việc ai được bấm cũng do
// server kiểm lại, prop `canManage` chỉ để khỏi vẽ nút vô nghĩa.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { timDonDeGan, ganGiaoDichVaoDon, boQuaGiaoDich, type DonUngVien } from "../_actions";

const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n);

export function XuLyGiaoDich({
  bankTransactionId,
  amount,
  /** Nội dung CK — dùng làm từ khoá tìm sẵn, đỡ phải gõ lại. */
  goiY,
}: {
  bankTransactionId: string;
  amount: number;
  goiY: string | null;
}) {
  const router = useRouter();
  const [mo, setMo] = useState<"gan" | "boqua" | null>(null);
  const [tuKhoa, setTuKhoa] = useState("");
  const [ketQuaTim, setKetQuaTim] = useState<DonUngVien[] | null>(null);
  const [lyDo, setLyDo] = useState("");
  const [dangChay, batDau] = useTransition();

  function timKiem(q: string) {
    if (q.trim().length < 2) {
      setKetQuaTim(null);
      return;
    }
    batDau(async () => {
      setKetQuaTim(await timDonDeGan(q));
    });
  }

  function gan(don: DonUngVien) {
    batDau(async () => {
      const res = await ganGiaoDichVaoDon(bankTransactionId, don.id);
      if (res.ok) {
        toast.success(res.message);
        setMo(null);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function boQua() {
    batDau(async () => {
      const res = await boQuaGiaoDich(bankTransactionId, lyDo);
      if (res.ok) {
        toast.success(res.message);
        setMo(null);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  if (!mo) {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => {
            setMo("gan");
            // Nội dung CK là manh mối sẵn có tốt nhất — đổ vào ô tìm và tìm luôn.
            const seed = (goiY ?? "").trim();
            setTuKhoa(seed);
            if (seed) timKiem(seed);
          }}
          className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
        >
          Gán vào đơn
        </button>
        <button
          type="button"
          onClick={() => setMo("boqua")}
          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          Không phải học phí
        </button>
      </div>
    );
  }

  if (mo === "boqua") {
    return (
      <div className="w-[260px] space-y-2 rounded-md border border-border bg-card p-2">
        <label className="block text-xs font-semibold text-foreground">
          Lý do bỏ qua <span className="text-state-danger-ink">*</span>
        </label>
        <textarea
          value={lyDo}
          onChange={(e) => setLyDo(e.target.value)}
          rows={2}
          placeholder="vd: tiền nhà, hoàn ứng, khách chuyển nhầm…"
          className="w-full rounded border border-border px-2 py-1 text-xs focus:border-primary focus:outline-none"
        />
        <p className="text-[11px] leading-snug text-muted-foreground">
          Giao dịch ra khỏi hàng chờ nhưng vẫn nằm nguyên trong sổ. Lý do bắt buộc để
          sau này còn tra lại được.
        </p>
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={dangChay || !lyDo.trim()}
            onClick={boQua}
            className="rounded bg-state-warning-ink px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            {dangChay ? "Đang lưu…" : "Xác nhận bỏ qua"}
          </button>
          <button
            type="button"
            onClick={() => setMo(null)}
            className="rounded border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            Huỷ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[340px] space-y-2 rounded-md border border-border bg-card p-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">
          Rót {fmt(amount)}đ vào đơn nào?
        </span>
        <button
          type="button"
          onClick={() => setMo(null)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Đóng
        </button>
      </div>

      <input
        value={tuKhoa}
        onChange={(e) => {
          setTuKhoa(e.target.value);
          timKiem(e.target.value);
        }}
        placeholder="Mã đơn / SĐT phụ huynh / tên con…"
        className="w-full rounded border border-border px-2 py-1 text-xs focus:border-primary focus:outline-none"
      />

      {dangChay && <p className="text-[11px] text-muted-foreground">Đang tìm…</p>}

      {!dangChay && ketQuaTim !== null && ketQuaTim.length === 0 && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          Không có đơn nào đang chờ thu khớp từ khoá này. Thử SĐT phụ huynh, hoặc tên con.
        </p>
      )}

      {ketQuaTim && ketQuaTim.length > 0 && (
        <ul className="max-h-56 space-y-1 overflow-y-auto">
          {ketQuaTim.map((d) => {
            // Số tiền không phải khoá đối khớp, nhưng lệch nhiều thì đáng để người
            // bấm nhìn thấy trước khi bấm — đây là lớp phòng vệ cuối bằng mắt người.
            const khop = d.conThieu === amount;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  disabled={dangChay}
                  onClick={() => gan(d)}
                  className="w-full rounded border border-border px-2 py-1.5 text-left text-xs hover:border-primary hover:bg-muted disabled:opacity-50"
                >
                  <span className="font-mono font-semibold text-foreground">{d.code}</span>
                  {d.studentName && <span className="text-foreground"> · {d.studentName}</span>}
                  {d.customerPhone && (
                    <span className="text-muted-foreground"> · {d.customerPhone}</span>
                  )}
                  <div className="mt-0.5 text-muted-foreground">
                    {d.courseName && <span>{d.courseName} · </span>}
                    còn thiếu{" "}
                    <b className={`tabular-nums ${khop ? "text-state-success-ink" : "text-state-warning-ink"}`}>
                      {fmt(d.conThieu)}đ
                    </b>
                    {khop ? " (khớp đúng số tiền)" : " (lệch số tiền — kiểm lại)"}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
