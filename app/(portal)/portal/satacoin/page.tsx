import { Coins } from "lucide-react";
import { requireActiveStudent } from "@/lib/portal/session";
import { getBalance, listTransactions } from "@/lib/satacoin/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "SataCoin | Sata Robo", robots: { index: false } };

const TYPE_LABEL: Record<string, string> = {
  EARN: "Thưởng",
  SPEND: "Đổi quà",
  ADJUST: "Điều chỉnh",
  REVERSAL: "Đảo giao dịch",
};

export default async function PortalSataCoinPage() {
  const { studentId } = await requireActiveStudent();
  const [balance, txns] = await Promise.all([getBalance(studentId), listTransactions(studentId, 100)]);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-neutral-900">SataCoin</h1>

      <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <Coins className="h-8 w-8 text-amber-500" />
        <div>
          <div className="text-xs text-amber-700">Số dư hiện tại</div>
          <div className="text-2xl font-bold text-amber-900">{balance} coin</div>
        </div>
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white">
        <div className="border-b px-4 py-2 text-sm font-semibold text-neutral-700">Lịch sử giao dịch</div>
        {txns.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-neutral-400">Chưa có giao dịch.</p>
        ) : (
          <ul className="divide-y text-sm">
            {txns.map((t) => (
              <li key={t.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <div className="font-medium text-neutral-800">{TYPE_LABEL[t.type] ?? t.type}</div>
                  <div className="text-xs text-neutral-400">
                    {t.note ?? t.reason} · {t.createdAt.toISOString().slice(0, 10)}
                  </div>
                </div>
                <span className={`font-semibold ${t.amount >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                  {t.amount >= 0 ? "+" : ""}
                  {t.amount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
