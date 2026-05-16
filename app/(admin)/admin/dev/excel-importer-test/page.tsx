"use client";

import { ExcelImporter } from "@/components/admin/ExcelImporter";

interface DemoRow {
  name: string;
  email: string;
  phone: string;
  note: string;
}

export default function ExcelImporterTestPage() {
  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-4">Test ExcelImporter</h1>
      <ExcelImporter<DemoRow>
        templateUrl="/templates/mau-demo.xlsx"
        templateFilename="mau-demo.xlsx"
        columnHints={[
          { key: "name", label: "Tên", required: true },
          { key: "email", label: "Email", required: true },
          { key: "phone", label: "SĐT" },
          { key: "note", label: "Ghi chú" },
        ]}
        parseRow={(row) => {
          if (!row.name || typeof row.name !== "string") return { error: "Thiếu tên" };
          if (!row.email || typeof row.email !== "string") return { error: "Thiếu email" };
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
            return { error: "Email không hợp lệ" };
          }
          return {
            name: row.name,
            email: row.email,
            phone: typeof row.phone === "string" ? row.phone : "",
            note: typeof row.note === "string" ? row.note : "",
          };
        }}
        onImport={async (rows) => {
          console.log("Would import:", rows);
          await new Promise((r) => setTimeout(r, 1000));
          return { success: rows.length, errors: [] };
        }}
      />
    </div>
  );
}
