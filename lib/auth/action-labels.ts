// Vietnamese labels cho Action strings dạng "<resource>:<verb>".
// Dùng cho UI per-user permission grants — convert raw action sang
// label tiếng Việt + category để group hiển thị.

const RESOURCE_LABELS: Record<string, string> = {
  employees: "Nhân sự",
  users: "Tài khoản",
  classes: "Lớp học",
  students: "Học viên",
  leads: "Khách hàng tiềm năng",
  honors: "Vinh danh",
  news: "Tin tức",
  blog: "Blog",
  recruitment: "Tuyển dụng",
  jobs: "Tin tuyển dụng",
  centers: "Cơ sở",
  enrollments: "Đăng ký lớp",
  sessions: "Buổi học",
  attendance: "Điểm danh",
  curriculum: "Giáo trình",
  curriculums: "Giáo trình",
  courses: "Khoá học",
  exams: "Đề thi",
  questions: "Câu hỏi đề thi",
  rooms: "Phòng học",
  kits: "Học cụ",
  inventory: "Kho",
  documents: "Tài liệu",
  marketing: "Marketing",
  "site-content": "Nội dung trang web",
  "course-packages": "Gói khoá học",
  holidays: "Ngày nghỉ",
  assignments: "Bài tập",
  payroll: "Bảng lương",
  "audit-logs": "Audit logs",
  settings: "Cài đặt",
  roles: "Vai trò",
  // Phase 5.6 — Financial
  payments: "Phương thức thanh toán",
  orders: "Đơn hàng",
  // Phase 5.7 — Vouchers
  vouchers: "Mã khuyến mãi",
};

const VERB_LABELS: Record<string, string> = {
  "view-all": "Xem tất cả",
  "view-own": "Xem của mình",
  "view-public": "Xem (công khai)",
  "view-salary": "Xem lương",
  "view-personal": "Xem thông tin cá nhân",
  "view-financial": "Xem tài chính",
  "view-own-class": "Xem lớp của mình",
  create: "Tạo mới",
  edit: "Chỉnh sửa",
  delete: "Xoá",
  manage: "Quản lý toàn quyền",
  settings: "Cấu hình",
  import: "Nhập file",
  export: "Xuất file",
  approve: "Phê duyệt",
  publish: "Xuất bản",
  archive: "Lưu trữ",
  assign: "Phân công",
  transfer: "Chuyển lớp",
  cancel: "Huỷ",
  upload: "Upload",
  movement: "Nhập/Xuất",
  audit: "Kiểm kho",
  mark: "Đánh dấu",
  view: "Xem",
  author: "Soạn",
  grade: "Chấm điểm",
};

export function getActionMeta(action: string): {
  label: string;
  category: string;
  rawVerb: string;
} {
  const [resource, ...verbParts] = action.split(":");
  const verb = verbParts.join(":");

  const category = RESOURCE_LABELS[resource] ?? resource;
  const label = VERB_LABELS[verb] ?? verb;

  return { label, category, rawVerb: verb };
}

/**
 * Group actions theo category (resource) — sort tiếng Việt theo locale "vi".
 * Trả về Map insertion-ordered (sorted) → iterate ổn định.
 */
export function groupActionsByCategory(
  actions: readonly string[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const action of actions) {
    const { category } = getActionMeta(action);
    if (!map.has(category)) map.set(category, []);
    map.get(category)!.push(action);
  }
  const sorted = new Map<string, string[]>();
  for (const cat of [...map.keys()].sort((a, b) => a.localeCompare(b, "vi"))) {
    sorted.set(cat, map.get(cat)!.sort());
  }
  return sorted;
}
