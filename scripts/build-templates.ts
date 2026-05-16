import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

interface Template {
  filename: string;
  sheetName: string;
  headers: string[];
  sampleRows: Record<string, string | number>[];
}

const TEMPLATES: Template[] = [
  {
    filename: "mau-demo.xlsx",
    sheetName: "Demo",
    headers: ["name", "email", "phone", "note"],
    sampleRows: [
      {
        name: "Nguyễn Văn A",
        email: "a@example.com",
        phone: "0901234567",
        note: "Demo 1",
      },
      {
        name: "Trần Thị B",
        email: "b@example.com",
        phone: "0907654321",
        note: "Demo 2",
      },
    ],
  },
];

const outDir = path.join(process.cwd(), "public", "templates");
fs.mkdirSync(outDir, { recursive: true });

for (const tpl of TEMPLATES) {
  const ws = XLSX.utils.json_to_sheet(tpl.sampleRows, { header: tpl.headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tpl.sheetName);
  const filepath = path.join(outDir, tpl.filename);
  XLSX.writeFile(wb, filepath);
  console.log(`✅ ${filepath}`);
}
