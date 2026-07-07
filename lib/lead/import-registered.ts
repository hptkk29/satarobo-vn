// Task #07 Việc 1 — Import danh sách "khách ĐÃ ĐĂNG KÝ" (file Excel thật của Sale)
// → Lead status REGISTERED + LeadChild per học viên.
//
// Pure — không import xlsx/db, testable bằng Vitest. Route chuyển workbook thành
// AoA (array-of-arrays) rồi gọi parseRegisteredSheets() + planRegisteredImport().
//
// Đặc thù file thật (đã phân tích):
// - 3 sheet theo tháng ("Tháng 52026"…), sheet SAU có thể TÍCH LŨY data sheet trước
//   → dedupe cross-sheet theo (SĐT chuẩn hoá + tên học viên chuẩn hoá) BẮT BUỘC.
// - Header khác nhau giữa sheet (Tháng 5 ở row 2, Tháng 6/7 ở row 1, thêm cột)
//   → detect header row + map theo TÊN cột (chuẩn hoá bỏ dấu), KHÔNG theo index.
// - Data bẩn: SĐT trailing space / thiếu số 0 đầu; học phí lẫn number + chuỗi
//   "4.640.000đ"; mã HV lẫn "CS1.HV0032" (thiếu dấu chấm); ~2000 dòng STT đánh
//   sẵn nhưng trống → bỏ dòng không có tên học viên + SĐT.
//
// Quyết định nghiệp vụ (phiếu #07 — KHÔNG hỏi lại):
// - Câu 34: trùng (theo SĐT chuẩn hoá) → GỘP: giữ record cũ, bổ sung field trống,
//   append ghi chú. Cùng SĐT + cùng tên HV = cùng bản ghi; cùng SĐT + khác tên
//   = 1 PH nhiều con → 1 Lead nhiều LeadChild.
// - Câu 4(1) BGĐ: 1 PH có 1 hoặc nhiều con.
// - Import = Lead REGISTERED, KHÔNG tự tạo Student/Enrollment (convert đi flow
//   convert v2 chính thống). Mã HV cũ + học phí + tình trạng TT → lưu note để
//   Sale đối chiếu khi convert. Học phí giữ NGUYÊN chuỗi gốc (không parse số —
//   data có typo "1.000.0000Đ", không tự "sửa" tiền).
// - CCCD Học viên: KHÔNG import (CLAUDE.md — không lưu giấy tờ tùy thân học viên).
//   CCCD Phụ huynh: lưu vào note có cấu trúc (cần cho xuất hoá đơn — câu 42/32).

import { normalizePhone, isValidPhone } from "./import";

export type CellValue = string | number | boolean | Date | null | undefined;

export interface SheetAoA {
  name: string;
  rows: CellValue[][];
}

export interface SheetRowError {
  sheet: string;
  /** Số dòng Excel (1-based, như hiển thị trong Excel). */
  row: number;
  reason: string;
}

export interface ParsedRegisteredChild {
  fullName: string;
  grade: string | null; // "Lớp 7" — giữ nguyên text → LeadChild.gradeLevel
  courseRaw: string | null; // "Sata 4" — resolve courseId ở planner, giữ raw trong note
  tuitionRaw: string | null; // giữ NGUYÊN chuỗi gốc (kể cả typo)
  paymentStatus: string | null; // "Đã thanh toán"…
  studentCodeOld: string | null; // mã HV cũ đã chuẩn hoá "CS1.HV.0032"
  invoiceRef: string | null;
  bank: string | null;
  invoiceIssued: string | null;
  dateRegistered: string | null; // dd/mm/yyyy
  noteRaw: string | null; // cột Ghi chú
  centerCode: string | null; // CS của dòng này (có thể khác giữa các con)
  sources: { sheet: string; row: number }[];
}

export interface ParsedRegisteredParent {
  phone: string; // đã chuẩn hoá
  parentName: string | null; // nhiều dòng không có tên PH → planner fallback
  parentCccd: string | null; // giữ raw (kể cả text "không xin được thông tin")
  address: string | null;
  salesName: string | null; // tên ngắn ("Liên") — planner fuzzy-map sang User
  source: string | null; // cột Nguồn (chỉ có ở sheet Tháng 6/7)
  centerCode: string | null; // CS đầu tiên thấy được
  extraNotes: string[]; // ghi chú phát sinh khi gộp (vd tên PH khác nhau giữa dòng)
  children: ParsedRegisteredChild[];
}

export interface ParsedRegistered {
  /** Tổng dòng dữ liệu đã đọc (sau header, mọi sheet — kể cả dòng trống). */
  totalDataRows: number;
  /** Dòng trống bỏ qua (không có tên học viên + SĐT — gồm ~2000 dòng STT đánh sẵn). */
  skippedEmpty: number;
  /** Dòng hợp lệ (đã qua validate, TRƯỚC dedupe cross-sheet). */
  validRows: number;
  /** Dòng lặp cross-sheet đã gộp (cùng SĐT + cùng tên học viên). */
  mergedDuplicateRows: number;
  errors: SheetRowError[];
  parents: ParsedRegisteredParent[];
}

// ─── Chuẩn hoá ──────────────────────────────────────────────────────────────

/** Bỏ dấu tiếng Việt + lowercase + gộp khoảng trắng (so khớp header/tên).
 *  Character class bên dưới = dải combining marks U+0300–U+036F (sau NFD). */
export function normalizeVi(raw: unknown): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** SĐT: normalizePhone chuẩn + vá case Excel lưu number làm mất số 0 đầu. */
export function normalizeRegisteredPhone(raw: unknown): string {
  let s = normalizePhone(raw);
  if (/^[35789][0-9]{8}$/.test(s)) s = "0" + s; // 9 số, mất số 0 đầu (cell kiểu number)
  return s;
}

/** Mã HV cũ: "CS1.HV0032" / "cs1.hv.0032" → "CS1.HV.0032"; format lạ giữ raw. */
export function normalizeStudentCode(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = s.replace(/\s+/g, "").match(/^(CS\d+)\.?(HV)\.?(\d+)$/i);
  if (!m) return s;
  return `${m[1].toUpperCase()}.${m[2].toUpperCase()}.${m[3]}`;
}

/** Cột Cơ sở "CS2: Hoàng Diệu" → "CS2"; fallback từ mã HV "CS1.HV.0031" → "CS1". */
export function extractCenterCode(centerCell: unknown, studentCode: string | null): string | null {
  const fromCell = String(centerCell ?? "").trim().match(/^(CS\d+)/i);
  if (fromCell) return fromCell[1].toUpperCase();
  const fromCode = (studentCode ?? "").match(/^(CS\d+)\./i);
  if (fromCode) return fromCode[1].toUpperCase();
  return null;
}

/** Excel serial / Date / chuỗi → "dd/mm/yyyy" (làm tròn về ngày, tránh lệch TZ). */
export function formatExcelDate(raw: CellValue): string | null {
  const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
  let dayMs: number | null = null;
  if (typeof raw === "number" && raw > 20000 && raw < 80000) {
    dayMs = EXCEL_EPOCH_UTC + Math.round(raw) * 86400000;
  } else if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    dayMs = EXCEL_EPOCH_UTC + Math.round((raw.getTime() - EXCEL_EPOCH_UTC) / 86400000) * 86400000;
  } else if (typeof raw === "string" && raw.trim()) {
    return raw.trim(); // đã là text — giữ nguyên
  }
  if (dayMs === null) return null;
  const d = new Date(dayMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

function cellStr(v: CellValue): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return formatExcelDate(v);
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** Học phí: number → chuỗi số nguyên; chuỗi → giữ NGUYÊN (không parse/sửa tiền). */
function tuitionStr(v: CellValue): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(Math.round(v));
  return cellStr(v);
}

// ─── Header detection + column mapping ──────────────────────────────────────

type ColKey =
  | "date"
  | "studentCode"
  | "studentName"
  | "grade"
  | "phone"
  | "source"
  | "course"
  | "tuition"
  | "center"
  | "paymentStatus"
  | "sales"
  | "note"
  | "invoice"
  | "bank"
  | "parentName"
  | "parentCccd"
  | "address"
  | "invoiceIssued";

// So khớp EXACT trên tên đã bỏ dấu ("hoc phi" ≠ "hoa don hoc phi").
// ⚠️ CỐ Ý KHÔNG map "cccd hoc vien" — KHÔNG import giấy tờ tùy thân học viên.
const HEADER_MAP: Record<string, ColKey> = {
  "ngay": "date",
  "ma hoc vien": "studentCode",
  "ho va ten hoc vien": "studentName",
  "ten hoc vien": "studentName",
  "lop": "grade",
  "so dien thoai": "phone",
  "sdt": "phone",
  "nguon": "source",
  "khoa hoc dang ky": "course",
  "hoc phi": "tuition",
  "co so": "center",
  "tinh trang": "paymentStatus",
  "sales": "sales",
  "sale": "sales",
  "ghi chu": "note",
  "hoa don hoc phi": "invoice",
  "hoa don dong hoc phi": "invoice",
  "ngan hang": "bank",
  "ten phu huynh": "parentName",
  "cccd phu huynh": "parentCccd",
  "dia chi": "address",
  "da xuat hoa don": "invoiceIssued",
};

const HEADER_SCAN_ROWS = 10;

/** Tìm dòng header (có "số điện thoại" + tên học viên) trong N dòng đầu. */
function findHeader(rows: CellValue[][]): { rowIdx: number; cols: Map<ColKey, number> } | null {
  for (let i = 0; i < Math.min(HEADER_SCAN_ROWS, rows.length); i++) {
    const cols = new Map<ColKey, number>();
    for (let c = 0; c < rows[i].length; c++) {
      const key = HEADER_MAP[normalizeVi(rows[i][c])];
      if (key !== undefined && !cols.has(key)) cols.set(key, c);
    }
    if (cols.has("phone") && cols.has("studentName")) return { rowIdx: i, cols };
  }
  return null;
}

// ─── Parse ──────────────────────────────────────────────────────────────────

export function parseRegisteredSheets(sheets: SheetAoA[]): ParsedRegistered {
  const errors: SheetRowError[] = [];
  let totalDataRows = 0;
  let skippedEmpty = 0;
  let validRows = 0;
  let mergedDuplicateRows = 0;

  // key = phone → parent; key = phone|normName(child) → child (dedupe cross-sheet)
  const parents = new Map<string, ParsedRegisteredParent>();
  const childByKey = new Map<string, ParsedRegisteredChild>();

  for (const sheet of sheets) {
    const header = findHeader(sheet.rows);
    if (!header) {
      errors.push({
        sheet: sheet.name,
        row: 0,
        reason: "Không tìm thấy dòng tiêu đề (cần cột 'Số điện thoại' + 'Họ và Tên học viên')",
      });
      continue;
    }
    const { rowIdx, cols } = header;
    const col = (row: CellValue[], key: ColKey): CellValue => {
      const idx = cols.get(key);
      return idx === undefined ? null : row[idx];
    };

    for (let i = rowIdx + 1; i < sheet.rows.length; i++) {
      const row = sheet.rows[i];
      const excelRow = i + 1; // 1-based như Excel
      totalDataRows++;

      const studentName = cellStr(col(row, "studentName"));
      const phoneCell = col(row, "phone");
      const phone = normalizeRegisteredPhone(phoneCell);

      // Dòng trống (kể cả dòng STT đánh số sẵn): không tên + không SĐT → bỏ qua.
      if (!studentName && !phone) {
        skippedEmpty++;
        continue;
      }
      if (!studentName) {
        errors.push({ sheet: sheet.name, row: excelRow, reason: "Thiếu tên học viên" });
        continue;
      }
      if (!phone) {
        errors.push({ sheet: sheet.name, row: excelRow, reason: "Thiếu số điện thoại" });
        continue;
      }
      if (!isValidPhone(phone)) {
        errors.push({
          sheet: sheet.name,
          row: excelRow,
          reason: `SĐT không hợp lệ: "${String(phoneCell ?? "").trim()}"`,
        });
        continue;
      }
      validRows++;

      const studentCodeOld = normalizeStudentCode(col(row, "studentCode"));
      const centerCode = extractCenterCode(col(row, "center"), studentCodeOld);
      const childData: Omit<ParsedRegisteredChild, "sources"> = {
        fullName: studentName,
        grade: cellStr(col(row, "grade")),
        courseRaw: cellStr(col(row, "course")),
        tuitionRaw: tuitionStr(col(row, "tuition")),
        paymentStatus: cellStr(col(row, "paymentStatus")),
        studentCodeOld,
        invoiceRef: cellStr(col(row, "invoice")),
        bank: cellStr(col(row, "bank")),
        invoiceIssued: cellStr(col(row, "invoiceIssued")),
        dateRegistered: formatExcelDate(col(row, "date")),
        noteRaw: cellStr(col(row, "note")),
        centerCode,
      };
      const rowParent = {
        parentName: cellStr(col(row, "parentName")),
        parentCccd: cellStr(col(row, "parentCccd")),
        address: cellStr(col(row, "address")),
        salesName: cellStr(col(row, "sales")),
        source: cellStr(col(row, "source")),
        centerCode,
      };

      // Gộp theo SĐT → 1 PH; theo SĐT + tên HV (chuẩn hoá) → 1 con.
      let parent = parents.get(phone);
      if (!parent) {
        parent = {
          phone,
          parentName: rowParent.parentName,
          parentCccd: rowParent.parentCccd,
          address: rowParent.address,
          salesName: rowParent.salesName,
          source: rowParent.source,
          centerCode: rowParent.centerCode,
          extraNotes: [],
          children: [],
        };
        parents.set(phone, parent);
      } else {
        // Câu 34: giữ giá trị cũ, bổ sung field trống; tên PH khác → ghi chú.
        if (!parent.parentName) parent.parentName = rowParent.parentName;
        else if (
          rowParent.parentName &&
          normalizeVi(rowParent.parentName) !== normalizeVi(parent.parentName)
        ) {
          const note = `Tên PH khác trong file: ${rowParent.parentName}`;
          if (!parent.extraNotes.includes(note)) parent.extraNotes.push(note);
        }
        if (!parent.parentCccd) parent.parentCccd = rowParent.parentCccd;
        if (!parent.address) parent.address = rowParent.address;
        if (!parent.salesName) parent.salesName = rowParent.salesName;
        if (!parent.source) parent.source = rowParent.source;
        if (!parent.centerCode) parent.centerCode = rowParent.centerCode;
      }

      const childKey = `${phone}|${normalizeVi(studentName)}`;
      const existingChild = childByKey.get(childKey);
      if (!existingChild) {
        const child: ParsedRegisteredChild = {
          ...childData,
          sources: [{ sheet: sheet.name, row: excelRow }],
        };
        childByKey.set(childKey, child);
        parent.children.push(child);
      } else {
        // Dòng lặp cross-sheet (sheet sau tích lũy sheet trước) → gộp, đắp field trống.
        mergedDuplicateRows++;
        existingChild.sources.push({ sheet: sheet.name, row: excelRow });
        for (const k of [
          "grade",
          "courseRaw",
          "tuitionRaw",
          "paymentStatus",
          "studentCodeOld",
          "invoiceRef",
          "bank",
          "invoiceIssued",
          "dateRegistered",
          "noteRaw",
          "centerCode",
        ] as const) {
          if (existingChild[k] === null && childData[k] !== null) {
            existingChild[k] = childData[k];
          }
        }
      }
    }
  }

  return {
    totalDataRows,
    skippedEmpty,
    validRows,
    mergedDuplicateRows,
    errors,
    parents: [...parents.values()],
  };
}

// ─── Fuzzy map Sales (tên ngắn "Liên"/"Nhật Hạ") → User ─────────────────────

export interface SalesUser {
  id: string;
  name: string | null;
  /** role chính + roles[] (union) — dùng tie-break khi tên ngắn khớp nhiều user. */
  roles: string[];
}

/** Role "bán hàng được" — tie-break khi tên ngắn mơ hồ (Sale thật có thể là CM). */
const SALES_CAPABLE_ROLES = new Set(["SALES_CSM", "CENTER_MANAGER"]);

/**
 * Khớp khi tên ngắn = ĐUÔI tên đầy đủ (bỏ dấu): "Liên" ↔ "Nguyễn Thị Liên",
 * "Nhật Hạ" ↔ "Trần Nhật Hạ". Nhận khi khớp DUY NHẤT 1 user; nếu mơ hồ thì
 * thu hẹp về user có role bán hàng (SALES_CSM/CENTER_MANAGER) — vẫn mơ hồ /
 * không khớp → null (giữ tên trong note theo phiếu).
 */
export function matchSalesUser(salesName: string, users: SalesUser[]): SalesUser | null {
  const target = normalizeVi(salesName);
  if (!target) return null;
  const targetWords = target.split(" ");
  const matches = users.filter((u) => {
    const words = normalizeVi(u.name ?? "").split(" ").filter(Boolean);
    if (words.length === 0) return false;
    if (words.join(" ") === target) return true;
    if (words.length < targetWords.length) return false;
    return words.slice(-targetWords.length).join(" ") === target;
  });
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const salesOnly = matches.filter((u) => u.roles.some((r) => SALES_CAPABLE_ROLES.has(r)));
    if (salesOnly.length === 1) return salesOnly[0];
  }
  return null;
}

// ─── Course key map — khớp "Sata 4" (file) với "Sata4 — Bứt Phá Giới Hạn"/slug "sata4" (DB) ──

/** Key nén: bỏ dấu + bỏ mọi ký tự không phải chữ/số ("Sata 4" & "sata4" → "sata4"). */
export function compactKey(raw: unknown): string {
  return normalizeVi(raw).replace(/[^a-z0-9]/g, "");
}

/** Map tên/slug khoá (cả dạng chuẩn hoá lẫn dạng nén) → Course.id. */
export function buildCourseKeyMap(
  courses: { id: string; name: string; slug: string | null }[],
): Map<string, string> {
  const map = new Map<string, string>();
  const add = (key: string, id: string) => {
    if (key && !map.has(key)) map.set(key, id);
  };
  for (const c of courses) {
    add(normalizeVi(c.name), c.id);
    if (c.slug) add(normalizeVi(c.slug), c.id);
  }
  for (const c of courses) {
    add(compactKey(c.name), c.id);
    if (c.slug) add(compactKey(c.slug), c.id);
  }
  return map;
}

// ─── Plan (pure) — quyết định create/merge, KHÔNG đụng DB ───────────────────

export interface ExistingLeadChild {
  id: string;
  fullName: string;
  gradeLevel: string | null;
  note: string | null;
  interestedCourseId: string | null;
  interestedCenterId: string | null;
}

export interface ExistingLead {
  id: string;
  parentName: string;
  phone: string;
  status: string;
  note: string | null;
  centerId: string | null;
  orgUnitId: string | null;
  courseId: string | null;
  assignedToId: string | null;
  children: ExistingLeadChild[];
}

export interface PlanContext {
  /** Center.code ("CS1") → Center.id */
  centerByCode: Map<string, string>;
  /** OrgUnit.code → OrgUnit.id (dual-write 2-phase như route import leads sự kiện) */
  orgUnitByCode: Map<string, string>;
  /** tên/slug khoá (normalizeVi) → Course.id */
  courseByKey: Map<string, string>;
  salesUsers: SalesUser[];
  /** SĐT chuẩn hoá → lead đang có trong CRM (deletedAt null) */
  existingByPhone: Map<string, ExistingLead>;
}

export interface ChildCreatePlan {
  fullName: string;
  gradeLevel: string | null;
  interestedCourseId: string | null;
  interestedCenterId: string | null;
  note: string;
}

export interface LeadCreatePlan {
  phone: string;
  parentName: string;
  centerId: string | null;
  orgUnitId: string | null;
  courseId: string | null;
  assignedToId: string | null;
  source: string;
  note: string;
  children: ChildCreatePlan[];
}

export interface LeadMergePlan {
  leadId: string;
  phone: string;
  parentName: string; // tên hiển thị (record cũ)
  /** Field trống trên record cũ được đắp (câu 34 — không ghi đè giá trị cũ). */
  set: Partial<{
    centerId: string;
    orgUnitId: string;
    courseId: string;
    assignedToId: string;
    status: "REGISTERED";
  }>;
  noteAppend: string | null; // null nếu note import đã có sẵn (idempotent)
  newChildren: ChildCreatePlan[];
  childUpdates: {
    childId: string;
    set: Partial<{ gradeLevel: string; interestedCourseId: string; interestedCenterId: string }>;
    noteAppend: string | null;
  }[];
  /** false = không có gì thay đổi (re-import cùng file) → bỏ qua, không ghi. */
  changed: boolean;
}

export interface RegisteredImportPlan {
  creates: LeadCreatePlan[];
  merges: LeadMergePlan[];
  unmatchedSales: string[]; // tên Sales không khớp User (giữ trong note)
  unmatchedCourses: string[]; // tên khoá không khớp Course (giữ trong note)
  unmatchedCenters: string[]; // mã CS không khớp Center
}

export const IMPORT_NOTE_MARKER = "[Import ĐK Excel]";

/** Note có cấu trúc cho Lead (PII PH cần cho xuất hoá đơn — CCCD PH, địa chỉ). */
function buildLeadNote(p: ParsedRegisteredParent): string {
  const parts: string[] = [];
  if (p.salesName) parts.push(`Sales: ${p.salesName}`);
  if (p.source) parts.push(`Nguồn: ${p.source}`);
  if (p.parentCccd) parts.push(`CCCD PH: ${p.parentCccd}`);
  if (p.address) parts.push(`Địa chỉ: ${p.address}`);
  for (const n of p.extraNotes) parts.push(n);
  return `${IMPORT_NOTE_MARKER} ${parts.join(" · ") || "Không có thông tin thêm"}`;
}

/** Note có cấu trúc cho LeadChild (mã HV cũ + học phí + tình trạng TT để đối chiếu khi convert). */
function buildChildNote(c: ParsedRegisteredChild): string {
  const parts: string[] = [];
  if (c.studentCodeOld) parts.push(`Mã HV cũ: ${c.studentCodeOld}`);
  if (c.dateRegistered) parts.push(`Ngày ĐK: ${c.dateRegistered}`);
  if (c.courseRaw) parts.push(`Khoá ĐK: ${c.courseRaw}`);
  if (c.tuitionRaw) parts.push(`Học phí: ${c.tuitionRaw}`);
  if (c.paymentStatus) parts.push(`Tình trạng TT: ${c.paymentStatus}`);
  if (c.invoiceRef) parts.push(`Hoá đơn: ${c.invoiceRef}`);
  if (c.bank) parts.push(`Ngân hàng: ${c.bank}`);
  if (c.invoiceIssued) parts.push(`Đã xuất HĐ: ${c.invoiceIssued}`);
  if (c.noteRaw) parts.push(`Ghi chú: ${c.noteRaw}`);
  return `${IMPORT_NOTE_MARKER} ${parts.join(" · ") || "Không có thông tin thêm"}`;
}

/** Trạng thái KHÔNG nâng lên REGISTERED khi gộp (đã ngang/hơn hoặc là bản trùng). */
const NO_UPGRADE_STATUSES = new Set(["REGISTERED", "ENROLLED", "DUPLICATE"]);

export function planRegisteredImport(
  parsed: ParsedRegistered,
  ctx: PlanContext,
): RegisteredImportPlan {
  const creates: LeadCreatePlan[] = [];
  const merges: LeadMergePlan[] = [];
  const unmatchedSales = new Set<string>();
  const unmatchedCourses = new Set<string>();
  const unmatchedCenters = new Set<string>();

  const resolveCourse = (raw: string | null): string | null => {
    if (!raw) return null;
    // Thử dạng chuẩn hoá trước, rồi dạng nén ("Sata 4" ↔ slug "sata4").
    const id = ctx.courseByKey.get(normalizeVi(raw)) ?? ctx.courseByKey.get(compactKey(raw)) ?? null;
    if (!id) unmatchedCourses.add(raw);
    return id;
  };
  const resolveCenter = (code: string | null): { centerId: string | null; orgUnitId: string | null } => {
    if (!code) return { centerId: null, orgUnitId: null };
    const centerId = ctx.centerByCode.get(code) ?? null;
    const orgUnitId = ctx.orgUnitByCode.get(code) ?? null;
    if (!centerId && !orgUnitId) unmatchedCenters.add(code);
    return { centerId, orgUnitId };
  };

  for (const p of parsed.parents) {
    const { centerId, orgUnitId } = resolveCenter(p.centerCode);
    const salesUser = p.salesName ? matchSalesUser(p.salesName, ctx.salesUsers) : null;
    if (p.salesName && !salesUser) unmatchedSales.add(p.salesName);

    const childPlans: ChildCreatePlan[] = p.children.map((c) => {
      const courseId = resolveCourse(c.courseRaw);
      const childCenter = resolveCenter(c.centerCode);
      return {
        fullName: c.fullName,
        gradeLevel: c.grade,
        interestedCourseId: courseId,
        interestedCenterId: childCenter.centerId,
        note: buildChildNote(c),
      };
    });
    // Lead.courseId chỉ set khi TẤT CẢ con cùng 1 khoá match được (tránh gán sai).
    const distinctCourseIds = new Set(
      childPlans.map((c) => c.interestedCourseId).filter((x): x is string => x !== null),
    );
    const leadCourseId = distinctCourseIds.size === 1 ? [...distinctCourseIds][0] : null;
    const leadNote = buildLeadNote(p);

    const existing = ctx.existingByPhone.get(p.phone);
    if (!existing) {
      creates.push({
        phone: p.phone,
        // Nhiều dòng thật không có tên PH → fallback theo tên con (đánh dấu rõ để Sale bổ sung).
        parentName: p.parentName ?? `PH của ${p.children[0]?.fullName ?? p.phone} (chưa rõ tên)`,
        centerId,
        orgUnitId,
        courseId: leadCourseId,
        assignedToId: salesUser?.id ?? null,
        source: p.source ?? "Import Excel ĐK",
        note: leadNote,
        children: childPlans,
      });
      continue;
    }

    // ── GỘP với lead đã có (câu 34): giữ record cũ, đắp field trống, append note.
    const set: LeadMergePlan["set"] = {};
    if (!existing.centerId && centerId) set.centerId = centerId;
    if (!existing.orgUnitId && orgUnitId) set.orgUnitId = orgUnitId;
    if (!existing.courseId && leadCourseId) set.courseId = leadCourseId;
    if (!existing.assignedToId && salesUser) set.assignedToId = salesUser.id;
    if (!NO_UPGRADE_STATUSES.has(existing.status)) set.status = "REGISTERED";

    const noteAppend = existing.note?.includes(leadNote) ? null : leadNote;

    const existingChildByName = new Map(
      existing.children.map((c) => [normalizeVi(c.fullName), c]),
    );
    const newChildren: ChildCreatePlan[] = [];
    const childUpdates: LeadMergePlan["childUpdates"] = [];
    for (let i = 0; i < p.children.length; i++) {
      const plan = childPlans[i];
      const match = existingChildByName.get(normalizeVi(plan.fullName));
      if (!match) {
        newChildren.push(plan);
        continue;
      }
      const cset: (typeof childUpdates)[number]["set"] = {};
      if (!match.gradeLevel && plan.gradeLevel) cset.gradeLevel = plan.gradeLevel;
      if (!match.interestedCourseId && plan.interestedCourseId)
        cset.interestedCourseId = plan.interestedCourseId;
      if (!match.interestedCenterId && plan.interestedCenterId)
        cset.interestedCenterId = plan.interestedCenterId;
      const cNoteAppend = match.note?.includes(plan.note) ? null : plan.note;
      if (Object.keys(cset).length > 0 || cNoteAppend) {
        childUpdates.push({ childId: match.id, set: cset, noteAppend: cNoteAppend });
      }
    }

    const changed =
      Object.keys(set).length > 0 ||
      noteAppend !== null ||
      newChildren.length > 0 ||
      childUpdates.length > 0;

    merges.push({
      leadId: existing.id,
      phone: p.phone,
      parentName: existing.parentName,
      set,
      noteAppend,
      newChildren,
      childUpdates,
      changed,
    });
  }

  return {
    creates,
    merges,
    unmatchedSales: [...unmatchedSales],
    unmatchedCourses: [...unmatchedCourses],
    unmatchedCenters: [...unmatchedCenters],
  };
}
