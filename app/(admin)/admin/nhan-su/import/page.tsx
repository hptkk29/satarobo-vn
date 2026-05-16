"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ExcelImporter, type ImportResult } from "@/components/admin/ExcelImporter";

interface EmployeeImportRow {
  employeeCode: string;
  fullName: string;
  jobTitle: string;
  department: string;
  status?: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string | number | Date;
  gender?: string;
  nationalId?: string;
  contractType?: string;
  centerSlug?: string;
  managerCode?: string;
  joinedAt?: string | number | Date;
  endDate?: string | number | Date;
  address?: string;
  subjects?: string;
  certifications?: string;
  bio?: string;
  emergencyContact?: string;
  notes?: string;
}

const VALID_DEPARTMENTS = new Set([
  "BAN_GIAM_DOC",
  "DAO_TAO",
  "MARKETING",
  "KINH_DOANH",
  "IT",
  "HANH_CHANH_NHAN_SU",
  "KE_TOAN",
  "TUYEN_SINH",
  "GIAO_VU",
  "GIANG_DAY",
]);
const VALID_CONTRACT_TYPES = new Set([
  "FULLTIME",
  "PARTTIME",
  "INTERN",
  "FREELANCE",
  "THU_VIEC",
  "CHINH_THUC_XAC_DINH",
  "CHINH_THUC_KHONG_XAC_DINH",
]);
const VALID_STATUSES = new Set(["ACTIVE", "ON_LEAVE", "RESIGNED", "TERMINATED"]);
const VALID_GENDERS = new Set(["MALE", "FEMALE", "OTHER"]);

function asString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

function looksLikeDate(v: unknown): boolean {
  if (v instanceof Date) return true;
  if (typeof v === "number" && Number.isFinite(v)) return true;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return false;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return true;
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return true;
    if (!Number.isNaN(Date.parse(s))) return true;
  }
  return false;
}

export default function ImportEmployeesPage() {
  const router = useRouter();

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div>
        <Link
          href="/admin/nhan-su"
          className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
        </Link>
        <h1 className="text-2xl font-bold">Import Nhân viên từ Excel</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Mã nhân viên (<code>employeeCode</code>) là khoá upsert — trùng mã sẽ UPDATE,
          mã mới sẽ CREATE.
        </p>
      </div>

      <ExcelImporter<EmployeeImportRow>
        title="Import Nhân viên"
        templateUrl="/templates/mau-nhan-vien.xlsx"
        templateFilename="mau-nhan-vien.xlsx"
        columnHints={[
          { key: "employeeCode", label: "Mã NV", required: true },
          { key: "fullName", label: "Họ tên", required: true },
          { key: "jobTitle", label: "Chức danh", required: true },
          { key: "department", label: "Phòng ban", required: true },
          { key: "status", label: "Trạng thái" },
          { key: "phone", label: "SĐT" },
          { key: "email", label: "Email" },
          { key: "dateOfBirth", label: "Ngày sinh" },
          { key: "gender", label: "Giới tính" },
          { key: "nationalId", label: "CCCD" },
          { key: "contractType", label: "Loại HĐ" },
          { key: "centerSlug", label: "Slug cơ sở" },
          { key: "managerCode", label: "Mã quản lý" },
          { key: "joinedAt", label: "Ngày vào làm" },
          { key: "endDate", label: "Ngày kết thúc HĐ" },
          { key: "address", label: "Địa chỉ" },
          { key: "subjects", label: "Môn dạy (,)" },
          { key: "certifications", label: "Chứng chỉ (,)" },
          { key: "bio", label: "Giới thiệu" },
          { key: "emergencyContact", label: "LH khẩn cấp" },
          { key: "notes", label: "Ghi chú" },
        ]}
        parseRow={(row) => {
          const employeeCode = asString(row.employeeCode);
          const fullName = asString(row.fullName);
          const jobTitle = asString(row.jobTitle);
          const department = asString(row.department);

          if (!employeeCode) return { error: "Thiếu mã nhân viên (employeeCode)" };
          if (!/^[A-Za-z0-9.-]+$/.test(employeeCode)) {
            return { error: "Mã NV chỉ chứa chữ, số, dấu chấm/gạch" };
          }
          if (!fullName) return { error: "Thiếu họ tên" };
          if (!jobTitle) return { error: "Thiếu chức danh" };
          if (!department) return { error: "Thiếu phòng ban" };
          if (!VALID_DEPARTMENTS.has(department)) {
            return { error: `Phòng ban không hợp lệ: ${department}` };
          }

          const status = asString(row.status);
          if (status && !VALID_STATUSES.has(status)) {
            return { error: `Trạng thái không hợp lệ: ${status}` };
          }
          const gender = asString(row.gender);
          if (gender && !VALID_GENDERS.has(gender)) {
            return { error: `Giới tính phải là MALE/FEMALE/OTHER` };
          }
          const contractType = asString(row.contractType);
          if (contractType && !VALID_CONTRACT_TYPES.has(contractType)) {
            return { error: `Loại HĐ không hợp lệ: ${contractType}` };
          }
          if (row.dateOfBirth && !looksLikeDate(row.dateOfBirth)) {
            return { error: "Ngày sinh phải dạng YYYY-MM-DD" };
          }
          if (row.joinedAt && !looksLikeDate(row.joinedAt)) {
            return { error: "Ngày vào làm phải dạng YYYY-MM-DD" };
          }
          if (row.endDate && !looksLikeDate(row.endDate)) {
            return { error: "Ngày kết thúc HĐ phải dạng YYYY-MM-DD" };
          }
          const email = asString(row.email);
          if (email && email.trim() !== "") {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
              return { error: "Email không hợp lệ" };
            }
          }

          return {
            employeeCode,
            fullName,
            jobTitle,
            department,
            status,
            phone: asString(row.phone),
            email,
            dateOfBirth: row.dateOfBirth as string | number | Date | undefined,
            gender,
            nationalId: asString(row.nationalId),
            contractType,
            centerSlug: asString(row.centerSlug),
            managerCode: asString(row.managerCode),
            joinedAt: row.joinedAt as string | number | Date | undefined,
            endDate: row.endDate as string | number | Date | undefined,
            address: asString(row.address),
            subjects: asString(row.subjects),
            certifications: asString(row.certifications),
            bio: asString(row.bio),
            emergencyContact: asString(row.emergencyContact),
            notes: asString(row.notes),
          };
        }}
        onImport={async (rows) => {
          const res = await fetch("/api/admin/import/employees", {
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

      <div className="text-sm text-neutral-500 mt-4 space-y-1 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        <p className="font-semibold text-neutral-700">Lưu ý:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>
            <code>employeeCode</code> bắt buộc, là khoá upsert. Trùng = UPDATE; mới = CREATE.
          </li>
          <li>
            <code>department</code> bắt buộc — một trong các enum: BAN_GIAM_DOC / DAO_TAO /
            MARKETING / KINH_DOANH / IT / HANH_CHANH_NHAN_SU / KE_TOAN / TUYEN_SINH / GIAO_VU /
            GIANG_DAY.
          </li>
          <li>
            <code>contractType</code> nếu có: FULLTIME / PARTTIME / INTERN / FREELANCE /
            THU_VIEC / CHINH_THUC_XAC_DINH / CHINH_THUC_KHONG_XAC_DINH.
          </li>
          <li>
            <code>centerSlug</code> rỗng = nhân viên không gắn cơ sở cụ thể. Sai slug → row bị bỏ qua.
          </li>
          <li>
            <code>managerCode</code> là <code>employeeCode</code> của người quản lý trực tiếp.
            Phải đã tồn tại trong DB (có thể import từ file khác trước).
          </li>
          <li>
            <code>subjects</code> / <code>certifications</code>: phân tách bằng dấu phẩy. VD:{" "}
            <code>Robotics, RoboSim</code>.
          </li>
          <li>Avatar KHÔNG import — upload qua admin form sau.</li>
        </ul>
      </div>
    </div>
  );
}
