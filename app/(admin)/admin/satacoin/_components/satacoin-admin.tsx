"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createRule, toggleRule, grantCoins, reverseCoinTx } from "../_actions";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";

const TX_TYPE_LABEL: Record<string, string> = {
  EARN: "Cộng coin",
  SPEND: "Trừ coin",
  ADJUST: "Điều chỉnh",
};
// reason là mã tự do — dịch mã phổ biến, còn lại giữ nguyên.
const TX_REASON_LABEL: Record<string, string> = {
  ATTENDANCE: "Điểm danh",
  REDEEM_GIFT: "Đổi quà",
  MANUAL: "Thủ công",
  ADJUSTMENT: "Điều chỉnh",
  REVERSAL: "Hoàn tác",
};

type Rule = { id: string; code: string; label: string; amount: number; isActive: boolean };
type Student = { id: string; name: string; studentCode: string | null };
type Txn = {
  id: string;
  amount: number;
  type: string;
  reason: string;
  createdAt: string;
  studentId: string;
  studentName: string;
  isReversal: boolean;
  alreadyReversed: boolean;
};

/**
 * ⚠️ CỐ Ý KHÔNG dùng `<MoneyInput>` (ô tiền có chấm phân cách nghìn) cho hai ô
 * "Số coin" / "Số coin (âm = trừ)" bên dưới — đã cân nhắc ở vòng rà 20/08, đừng
 * lật lại.
 *
 * Yêu cầu của chủ dự án là "thêm dấu chấm cho SỐ TIỀN". SataCoin là ĐIỂM THƯỞNG
 * nội bộ, KHÔNG phải VNĐ: giá trị thực tế là hàng đơn vị tới hàng chục (rule mặc
 * định +5 coin), nên dấu chấm phân cách nghìn không bao giờ xuất hiện — thêm vào
 * chỉ đổi kiểu ô nhập mà không đổi thứ gì người dùng thấy, đồng thời làm ô này
 * TRÔNG NHƯ ô tiền — rồi người sau gõ "5.000" tưởng là năm nghìn đồng trong khi hệ
 * thống ghi 5000 coin vào sổ cái thưởng. (`MoneyInput` có `allowNegative` nên vẫn
 * nhận được số âm; vấn đề không nằm ở đó mà ở việc gắn nhãn "tiền" cho thứ không
 * phải tiền.)
 *
 * `<input type="number">` là đúng ngữ nghĩa cho một con số đếm được, có dấu.
 */
export function SataCoinAdmin({
  rules,
  students,
  recentTxns,
}: {
  rules: Rule[];
  students: Student[];
  recentTxns: Txn[];
}) {
  const [pending, start] = useTransition();

  // Rule form
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [ruleAmount, setRuleAmount] = useState("5");

  // Grant form
  const [studentId, setStudentId] = useState("");
  const [grantAmount, setGrantAmount] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  function addRule() {
    start(async () => {
      const res = await createRule({ code, label, amount: ruleAmount });
      if (res.ok) {
        toast.success("Đã tạo rule");
        setCode("");
        setLabel("");
        setRuleAmount("5");
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  function grant() {
    if (!studentId || !grantAmount || !reason.trim()) {
      toast.error("Nhập học viên, số coin và lý do");
      return;
    }
    start(async () => {
      const res = await grantCoins({ studentId, amount: grantAmount, reason, note });
      if (res.ok) {
        toast.success("Đã ghi giao dịch");
        setGrantAmount("");
        setReason("");
        setNote("");
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  function reverse(t: Txn) {
    start(async () => {
      const res = await reverseCoinTx(t.id, t.studentId);
      if (res.ok) toast.success("Đã đảo giao dịch");
      else toast.error(res.error ?? "Lỗi");
    });
  }

  return (
    <div className="space-y-6">
      {/* Rules */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Quy tắc thưởng</h2>
        <div className="grid gap-2 sm:grid-cols-4">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="MÃ (ATTENDANCE)" className="rounded-md border border-border px-3 py-2 text-sm" />
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Tên rule" className="rounded-md border border-border px-3 py-2 text-sm" />
          <input value={ruleAmount} onChange={(e) => setRuleAmount(e.target.value)} type="number" placeholder="Số coin" className="rounded-md border border-border px-3 py-2 text-sm" />
          <button onClick={addRule} disabled={pending} className="rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Thêm rule
          </button>
        </div>
        <ul className="mt-3 divide-y text-sm">
          {rules.length === 0 ? (
            <li className="py-2 text-muted-foreground">Chưa có rule.</li>
          ) : (
            rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <span>
                  <span className="font-mono text-xs text-muted-foreground">{r.code}</span> · {r.label} ·{" "}
                  <span className="font-semibold text-state-success-ink">+{r.amount}</span>
                </span>
                <button onClick={() => start(async () => void (await toggleRule(r.id)))} className={`rounded px-2 py-0.5 text-xs ${r.isActive ? "bg-state-success-soft text-state-success-ink" : "bg-muted text-muted-foreground"}`}>
                  {r.isActive ? "Đang bật" : "Đã tắt"}
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      {/* Grant */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Cấp / điều chỉnh coin</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="rounded-md border border-border px-3 py-2 text-sm">
            <option value="">— Học viên —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.studentCode ? ` (${s.studentCode})` : ""}
              </option>
            ))}
          </select>
          <input value={grantAmount} onChange={(e) => setGrantAmount(e.target.value)} type="number" placeholder="Số coin (âm = trừ)" className="rounded-md border border-border px-3 py-2 text-sm" />
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do (mã/ghi chú ngắn)" className="rounded-md border border-border px-3 py-2 text-sm" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú (tuỳ chọn)" className="rounded-md border border-border px-3 py-2 text-sm" />
        </div>
        <button onClick={grant} disabled={pending} className="mt-3 rounded-md bg-primary-dark px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          Ghi giao dịch
        </button>
      </section>

      {/* Ledger */}
      <section className="rounded-xl border border-border bg-card">
        <div className="border-b px-4 py-2 text-sm font-semibold text-foreground">Sổ cái gần đây</div>
        <PhanTrangBang cuonNgang>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Học viên</th>
                <th className="px-4 py-2">Loại</th>
                <th className="px-4 py-2">Lý do</th>
                <th className="px-4 py-2 text-right">Coin</th>
                <th className="px-4 py-2">Ngày</th>
                <th className="px-4 py-2">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {recentTxns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    Chưa có giao dịch.
                  </td>
                </tr>
              ) : (
                recentTxns.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="px-4 py-2 font-medium">{t.studentName}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{TX_TYPE_LABEL[t.type] ?? t.type}</td>
                    <td className="px-4 py-2 text-muted-foreground">{TX_REASON_LABEL[t.reason] ?? t.reason}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${t.amount >= 0 ? "text-state-success-ink" : "text-state-danger-ink"}`}>
                      {t.amount >= 0 ? "+" : ""}
                      {t.amount}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{t.createdAt}</td>
                    <td className="px-4 py-2">
                      {!t.isReversal && !t.alreadyReversed ? (
                        <button onClick={() => reverse(t)} disabled={pending} className="rounded bg-state-danger-soft px-2 py-0.5 text-xs text-state-danger-ink disabled:opacity-50">
                          Đảo
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t.alreadyReversed ? "đã đảo" : "—"}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </PhanTrangBang>
      </section>
    </div>
  );
}
