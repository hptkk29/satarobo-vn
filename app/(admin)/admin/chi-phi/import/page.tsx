"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ExcelImporter, type ImportResult } from "@/components/admin/ExcelImporter";
import { PageHelp } from "@/components/admin/ui/page-help";

// B-05 — màn import chi phí. Validate THẬT nằm ở server
// (`app/api/admin/import/costs/route.ts` + `lib/finance/cost-import.ts`); phần dưới đây
// chỉ bắt lỗi hình dạng sớm để người dùng khỏi phải upload rồi mới biết.

interface CostImportRow {
  spentDate: string;
  categoryCode: string;
  centerCode: string;
  amount: string;
  vendor: string;
  note: string;
}

function asText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(
      v.getUTCDate(),
    ).padStart(2, "0")}`;
  }
  return String(v).trim();
}

export default function ImportCostsPage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div>
        <Link
          href="/admin/chi-phi"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Quay lại sổ chi phí
        </Link>
        <h1 className="text-2xl font-bold">Import chi phí từ Excel</h1>
      </div>

      <PageHelp>
        <p>
          Mọi dòng import vào trạng thái <strong>Chờ duyệt</strong> — chỉ khoản đã duyệt mới
          lên báo cáo Chi phí / Lợi nhuận / Dòng tiền. Import lại đúng file cũ{" "}
          <strong>không</strong> tạo bản ghi thứ hai.
        </p>
      </PageHelp>

      <ExcelImporter<CostImportRow>
        title="Import chi phí"
        templateUrl="/templates/mau-chi-phi-v2.xlsx"
        templateFilename="mau-chi-phi-v2.xlsx"
        // Khoá chống trùng hiện ngay ở bản xem trước. Cố ý KHỚP với khoá của server
        // (`buildCostDedupeKey`): bỏ qua ghi chú, giữ nhà cung cấp. Lệch nhau thì màn
        // báo trùng một kiểu, server ghi một kiểu — và người dùng mất niềm tin vào cả hai.
        duplicateLabel="khoản chi"
        duplicateKey={(raw) => {
          const parts = [
            asText(raw.spentDate ?? raw["Ngày chi"]),
            asText(raw.categoryCode ?? raw["Mã đầu mục"]).toUpperCase(),
            asText(raw.centerCode ?? raw["Mã cơ sở"]).toUpperCase() || "COMPANY",
            asText(raw.amount ?? raw["Số tiền"]).replace(/[.\s]/g, ""),
            asText(raw.vendor ?? raw["Nhà cung cấp"]).toLowerCase(),
          ];
          return parts[0] && parts[1] && parts[3] ? parts.join("|") : null;
        }}
        columnHints={[
          { key: "spentDate", label: "Ngày chi", required: true },
          { key: "categoryCode", label: "Mã đầu mục", required: true },
          { key: "centerCode", label: "Mã cơ sở (trống = cấp công ty)" },
          { key: "amount", label: "Số tiền", required: true },
          { key: "vendor", label: "Nhà cung cấp" },
          { key: "note", label: "Ghi chú" },
        ]}
        parseRow={(row) => {
          const spentDate = asText(row.spentDate ?? row["Ngày chi"]);
          const categoryCode = asText(row.categoryCode ?? row["Mã đầu mục"]).toUpperCase();
          const amount = asText(row.amount ?? row["Số tiền"]);

          if (!spentDate) return { error: "Thiếu ngày chi" };
          if (!categoryCode) return { error: "Thiếu mã đầu mục" };
          if (!amount) return { error: "Thiếu số tiền" };
          // Ở Việt Nam dấu phẩy là dấu THẬP PHÂN. Nếu bỏ nó đi như bỏ dấu chấm thì
          // "1,5" thành 15 — số sai, im lặng, trông hợp lệ. Bắt ngay ở đây cho gần
          // người nhập; server cũng từ chối lần nữa.
          if (amount.includes(","))
            return { error: `Số tiền "${amount}" có dấu phẩy — ghi số nguyên, vd 1.200.000` };
          if (categoryCode === "ADS")
            return {
              error:
                "Đầu mục ADS do hệ thống tự nạp từ dữ liệu quảng cáo — nhập tay sẽ làm lợi nhuận bị trừ hai lần",
            };

          return {
            spentDate,
            categoryCode,
            centerCode: asText(row.centerCode ?? row["Mã cơ sở"]),
            amount,
            vendor: asText(row.vendor ?? row["Nhà cung cấp"]),
            note: asText(row.note ?? row["Ghi chú"]),
          };
        }}
        onImport={async (rows) => {
          const res = await fetch("/api/admin/import/costs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rows }),
          });
          if (!res.ok) {
            const err = (await res.json().catch(() => ({ error: "Unknown" }))) as {
              error?: string;
            };
            throw new Error(err.error || "Import thất bại");
          }
          const result = (await res.json()) as ImportResult;
          setTimeout(() => router.refresh(), 1000);
          return result;
        }}
      />

      <div className="mt-4 space-y-1 rounded-xl border border-border bg-muted p-4 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground">Lưu ý:</p>
        <ul className="list-inside list-disc space-y-0.5">
          <li>
            Bỏ trống <strong>Mã cơ sở</strong> nghĩa là chi phí <strong>cấp công ty</strong> —
            khoản đó không chia về cơ sở nào, và cần quyền hội sở mới ghi được.
          </li>
          <li>
            <strong>Nhà cung cấp</strong> tham gia chống trùng; <strong>Ghi chú</strong> thì
            không. Hai khoản cùng ngày, cùng đầu mục, cùng số tiền mà bỏ trống nhà cung cấp
            sẽ bị coi là một.
          </li>
          <li>Số tiền là số nguyên VNĐ. Dùng dấu chấm hoặc dấu cách, đừng dùng dấu phẩy.</li>
        </ul>
      </div>
    </div>
  );
}
