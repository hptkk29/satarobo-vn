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
  {
    filename: "mau-co-so.xlsx",
    sheetName: "Cơ sở",
    headers: [
      "name",
      "slug",
      "address",
      "ward",
      "district",
      "city",
      "phone",
      "email",
      "googleMapUrl",
      "workingHours",
      "managerName",
      "description",
      "isActive",
      "displayOrder",
    ],
    sampleRows: [
      {
        name: "Sata Robo Chi nhánh Đà Nẵng",
        slug: "danang",
        address: "258 Lê Thanh Nghị",
        ward: "Hòa Cường",
        district: "Hải Châu",
        city: "Đà Nẵng",
        phone: "0818823720",
        email: "danang@satarobo.vn",
        googleMapUrl: "https://maps.app.goo.gl/example",
        workingHours: "T2-T6: 17h-21h, T7-CN: 8h-17h",
        managerName: "Nguyễn Văn A",
        description: "Chi nhánh chính tại Đà Nẵng",
        isActive: 1,
        displayOrder: 1,
      },
      {
        name: "Sata Robo Chi nhánh Hà Nội",
        slug: "hanoi",
        address: "456 Trường Chinh",
        ward: "Phương Liệt",
        district: "Thanh Xuân",
        city: "Hà Nội",
        phone: "0901234567",
        email: "hanoi@satarobo.vn",
        googleMapUrl: "",
        workingHours: "T2-T6: 17h-21h, T7-CN: 8h-17h",
        managerName: "Trần Thị B",
        description: "",
        isActive: 1,
        displayOrder: 2,
      },
    ],
  },
  {
    filename: "mau-phong-hoc.xlsx",
    sheetName: "Phòng học",
    headers: [
      "name",
      "code",
      "centerSlug",
      "capacity",
      "equipment",
      "status",
      "notes",
      "displayOrder",
    ],
    sampleRows: [
      {
        name: "Phòng A1",
        code: "DN-A1",
        centerSlug: "danang",
        capacity: 15,
        equipment: "Robot SR1, Laptop, Máy chiếu",
        status: "ACTIVE",
        notes: "",
        displayOrder: 1,
      },
      {
        name: "Phòng A2",
        code: "DN-A2",
        centerSlug: "danang",
        capacity: 20,
        equipment: "Robot SR2, Bảng tương tác",
        status: "ACTIVE",
        notes: "",
        displayOrder: 2,
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
