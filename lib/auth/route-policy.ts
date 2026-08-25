import type { Role } from "@prisma/client";
import {
  isTeacherSiteEnabled,
  isCommonLoginAtRootEnabled,
  isSaleSiteEnabled,
  isElearningEnabled,
} from "@/lib/flags";

/**
 * Host-based access control — PURE decision layer (no NextRequest dependency).
 *
 * 5 subdomain · 8 role. Quy tắc truy cập theo HOST (tầng 1):
 *  - 7 role staff (mọi role TRỪ PARENT): vào được admin host; CẤM portal host.
 *  - PARENT: vào được portal host; CẤM admin host.
 *  - TEACHER (L5, flag `TEACHER_SITE_ENABLED`): vào được teacher host
 *    (`giaovien.satarobo.vn` — phiếu BGĐ câu 7, 04/07/2026); role khác vào
 *    teacher host bị đá về khu của họ. Flag OFF → teacher host bounce về admin
 *    (GV tiếp tục dùng admin, KHÔNG đổi hành vi hiện tại).
 *  - Sale host (`sale.satarobo.vn`): biểu mẫu tĩnh CÔNG KHAI đã **NGHỈ**
 *    (22/08/2026). Địa chỉ nhập khách duy nhất nay là
 *    `satarobo.vn/nhap-khach-hang` — có đăng nhập, mã NV lấy từ phiên. Host này
 *    chỉ còn đá 307 về đó khi cờ `SALE_SITE_ENABLED` TẮT; cờ BẬT thì nó phục vụ
 *    site Sale (`app/(sale)`) cho Sale THUẦN.
 *  - Chưa login + route bảo vệ: redirect /login GIỮ NGUYÊN host đang đứng.
 *  - Public host: ai cũng vào; route /admin|/portal lọt vào → đá về đúng host.
 *
 * Tầng 2 (feature permission: ai xem lương, ai xoá lead...) nằm ở
 * `lib/auth/permissions.ts` — KHÔNG thuộc phạm vi file này.
 *
 * proxy.ts (middleware) chỉ đọc host/pathname/session rồi gọi `decideRoute()`
 * và thực thi `RouteDecision`. Toàn bộ logic quyết định được test bằng
 * `route-policy.test.ts` (bảng tổ hợp host × role × sessionValid).
 *
 * ⚠️ L5 WIRING CÒN THIẾU (PR proxy riêng, đi cùng ticket DNS/Vercel — KHÔNG làm
 * trong PR này vì proxy.ts đang khoá): (1) `detectHost()` map
 * `giaovien.satarobo.vn` → "teacher"; (2) thêm `teacher: GIAOVIEN_HOST` vào
 * `HOST_BY_KIND`; (3) mở rộng union `RouteDecision.redirectHost.host` thêm
 * "teacher" + rule "TEACHER-only trên admin host (flag ON) → redirectHost
 * teacher". Trước khi wiring, host giaovien rơi vào nhánh `unknown` của proxy —
 * decideRoute chưa nhận hostKind "teacher" từ production.
 */

export type HostKind =
  | "public"
  | "admin"
  | "portal"
  | "teacher"
  | "elearning"
  | "sale"
  | "vercel"
  | "unknown";

/** `null` = chưa login. */
export type MaybeRole = Role | null;

export type RouteDecision =
  | { type: "next" }
  | { type: "rewrite"; path: string }
  | { type: "redirectPath"; path: string; callbackUrl?: string; reason?: string }
  | {
      type: "redirectHost";
      host: "admin" | "portal" | "public" | "teacher" | "elearning";
      path: string;
      status: 307 | 308;
    };

export interface RouteInput {
  hostKind: HostKind;
  pathname: string;
  /** Vai trò CHÍNH; `null` nếu chưa login. */
  role: MaybeRole;
  /** Đợt 3B — tất cả vai trò (union). Trống/bỏ → suy ra từ `role`. */
  roles?: MaybeRole[];
  /** `false` nếu deactivated / tokenVersion mismatch / không có session. */
  sessionValid: boolean;
  /**
   * L5 — flag site giáo viên. Bỏ trống → đọc env `TEACHER_SITE_ENABLED`
   * (mặc định OFF). Test truyền tường minh để không phụ thuộc env.
   */
  teacherSiteEnabled?: boolean;
  /**
   * Đợt B — cờ site Sale riêng. Bỏ trống → đọc env `SALE_SITE_ENABLED`
   * (mặc định OFF → host `sale` giữ nguyên hành vi phục vụ biểu mẫu tĩnh).
   * Test truyền tường minh để không phụ thuộc env.
   */
  saleSiteEnabled?: boolean;
  /**
   * F4 (Q41) — cổng login chung ở public host. Bỏ trống → đọc env
   * `COMMON_LOGIN_AT_ROOT` (mặc định OFF → giữ 308 sang admin). Test truyền tường minh.
   */
  commonLoginAtRoot?: boolean;
  /**
   * EL-01 — cờ khu đào tạo nội bộ. Bỏ trống → đọc env `ELEARNING_ENABLED`
   * (mặc định OFF). Test truyền tường minh để không phụ thuộc env.
   */
  elearningEnabled?: boolean;
}

// ───────────────────────────────────────────────────────────────────────────
// Route classification helpers (single source of truth, shared với proxy.ts)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Top-level route segments dưới `app/(admin)/admin/*` — admin host phục vụ ở
 * root path (không prefix `/admin`). Thêm route admin mới? Thêm segment vào đây.
 */
export const ADMIN_ROUTE_SEGMENTS: ReadonlySet<string> = new Set<string>([
  // BGĐ 31/07 — nguồn giới thiệu (affiliate).
  "affiliates",
  "assignments",
  "attendance",
  "audit-log",
  "ban-giao-lead",
  "bao-cao",
  "canh-bao-rui-ro",
  "cau-hinh-van-hanh",
  "centers",
  "cham-cong",
  "cham-soc-hv",
  "charts-test",
  "chuyen-lop",
  "class-groups",
  "classes",
  "compliance",
  "cong-no",
  "bien-dong-so-du",
  "convert-conflicts",
  "course-packages",
  "course-prerequisites",
  "courses",
  "crm",
  "curriculums",
  "dashboard",
  // BGĐ 31/07 — màn duyệt đơn GV + hộp thư đề xuất sửa giáo án.
  "de-xuat-giao-an",
  "don-tu",
  "design-system-preview",
  "design-system-preview-v2",
  "documents",
  "email-logs",
  "email-templates",
  "enrollments",
  "evaluations",
  "exams",
  "hoc-bu",
  // US-04 chat — /hoi-thoai/doi-soat (log đối soát thành viên; sau này US-15 tra cứu).
  "hoi-thoai",
  "holidays",
  "hoan-thanh-khoa",
  "hoan-tien",
  "hoc-ba",
  "honors",
  "huong-dan",
  "inventory",
  "jobs",
  "khao-sat",
  "kits",
  "leads",
  // "Lịch tổng" (app/(admin)/admin/lich): mục sidebar + thông báo dạy thay/nhắc chốt
  // buổi đều trỏ tới. Thiếu segment ở đây thì admin host 308 sang public → 404.
  // Site GV cũng có màn `/lich` riêng — không xung đột: nhánh teacher host hỏi
  // `TEACHER_ROUTE_SEGMENTS` trước, xem chú thích ở đó.
  "lich",
  "marketing",
  "media",
  "news",
  "nhan-su",
  // 23/08/2026 — ĐẢO chốt 22/08: biểu mẫu nhập khách DỜI VÀO ADMIN
  // (`app/(admin)/admin/nhap-khach-hang/`). Segment này là thứ cho phép
  // `admin.satarobo.vn/nhap-khach-hang` rewrite vào route group; THIẾU nó thì
  // admin host đá sang public, public đá ngược lại → vòng lặp chuyển hướng.
  "nhap-khach-hang",
  "notifications",
  "orders",
  "otp-logs",
  "parent-feedback",
  "parent-requests",
  "payment-methods",
  "payments",
  "products",
  "questions",
  "r2-test",
  "report-cards",
  "roles",
  "rooms",
  "satacoin",
  "scorm",
  "search",
  "sessions",
  "settings",
  // Sinh nhật học viên (06/08/2026) — thiếu segment ở đây thì route CHẾT dù page tồn tại.
  "sinh-nhat",
  "site-content",
  "students",
  // Trang "Tất cả thông báo" (chuông → Xem tất cả). CỐ Ý KHÔNG có trên sidebar — ràng buộc
  // cốt lõi của PRD notification; nhưng route vẫn phải khai ở đây, nếu không admin host 308
  // sang public rồi 404. Tên "/notifications" đã bị CMS thông báo phụ huynh chiếm.
  "thong-bao",
  "teachers",
  "teaching-materials",
  "tich-hop",
  "tin-nhan",
  // P1 · US-05 AC4 — màn cây tổ chức. Thiếu segment ở đây là proxy 308 link
  // /to-chuc về public rồi 404, dù page tồn tại (đúng tiền lệ /user-groups ở US-03).
  "to-chuc",
  "trial-classes",
  "trials",
  // US-03 (Nền Hệ thống P0) — nhóm người dùng; thiếu segment ở đây thì link
  // /user-groups trên admin host bounce 308 về public → 404 dù page tồn tại.
  "user-groups",
  "users",
]);

/** First path segment, e.g. "/leads/123" → "leads". */
export function firstSegment(p: string): string {
  const parts = p.split("/").filter(Boolean);
  return parts[0] ?? "";
}

export function isAdminRoute(p: string): boolean {
  return ADMIN_ROUTE_SEGMENTS.has(firstSegment(p));
}

// Cụm A1 — trang auth công khai (chưa đăng nhập vẫn vào): login + kích hoạt OTP.
// AUTH-SĐT P6 — thêm quên mật khẩu (cùng tính chất: OTP, chưa login).
// `/dang-xuat` PHẢI công khai: nó tồn tại để dọn cookie của phiên đã chết, mà
// phiên đó theo định nghĩa là không hợp lệ — bắt nó "đăng nhập trước" là dựng lại
// đúng vòng lặp mà nó sinh ra để phá.
const PUBLIC_AUTH_PATHS = new Set<string>([
  "/login",
  "/kich-hoat",
  "/quen-mat-khau",
  "/dang-xuat",
]);
export function isPublicAuthPath(p: string): boolean {
  return PUBLIC_AUTH_PATHS.has(p);
}

/**
 * Trang OTP công khai (`/kich-hoat`, `/quen-mat-khau`) — luật host×role giống hệt
 * nhau: chưa login thì vào được, đã login thì đá về nhà của vai trò.
 * Gom lại một chỗ để thêm màn OTP mới không phải sửa 3 nhánh host rời rạc rồi
 * quên mất một nhánh (mỗi nhánh trước đây chép riêng `pathname === "/kich-hoat"`).
 */
const PUBLIC_OTP_PATHS = new Set<string>(["/kich-hoat", "/quen-mat-khau"]);
export function isPublicOtpPath(p: string): boolean {
  return PUBLIC_OTP_PATHS.has(p);
}

export function isInfraPath(p: string): boolean {
  return (
    p.startsWith("/_next/") ||
    p.startsWith("/api/") ||
    // Sentry tunnel (`tunnelRoute: "/monitoring"` trong next.config.ts). KHÔNG
    // phải route admin nên trước đây rơi xuống nhánh cuối của admin host → 308
    // sang public host: báo lỗi của site admin đi sai chỗ, và 308 permanent bị
    // trình duyệt cache vĩnh viễn nên không tự khỏi khi sửa.
    p === "/monitoring" ||
    p.startsWith("/monitoring/") ||
    p === "/favicon.ico" ||
    p === "/robots.txt" ||
    p === "/sitemap.xml" ||
    p === "/manifest.json"
  );
}

export function isPortalPath(p: string): boolean {
  return p === "/portal" || p.startsWith("/portal/");
}

/** EL-01 — path khu đào tạo nội bộ (route group `app/(elearning)/elearning/*`). */
export function isElearningPath(p: string): boolean {
  return p === "/elearning" || p.startsWith("/elearning/");
}

/** L5 — path site giáo viên (route group `app/(teacher)/teacher/*`). */
export function isTeacherPath(p: string): boolean {
  return p === "/teacher" || p.startsWith("/teacher/");
}

/**
 * Segment cấp 1 của site giáo viên (khớp thư mục `app/(teacher)/teacher/*`).
 *
 * VÌ SAO CẦN (sự cố đo 19/08/2026): trên host giaovien, clean URL được rewrite thành
 * `/teacher/<path>` — NHƯNG nhánh "chuẩn hoá path lạc khu" chạy TRƯỚC và nó bounce mọi
 * `isAdminRoute(pathname)` về trang chủ GV. Năm tên trùng segment admin từ trước:
 * `don-tu`, `hoc-ba`, `huong-dan`, `scorm`, `tin-nhan` — nghĩa là giáo viên gõ/bấm clean
 * URL `/hoc-ba` trên site của mình thì bị ném về trang chủ, im lặng, không lỗi. Thêm
 * `lich` (để vá link chết "Lịch tổng" bên admin) là ca thứ sáu.
 *
 * Cách chữa: trên host GV, hỏi "site GV có màn này không" TRƯỚC khi hỏi "đây có phải
 * đường admin không". Danh sách này vì thế phải bám sát thư mục — thêm màn GV mới thì
 * thêm một dòng, không thì clean URL của màn đó tiếp tục bị bounce âm thầm.
 */
export const TEACHER_ROUTE_SEGMENTS: ReadonlySet<string> = new Set<string>([
  "anh-lop",
  "bang-cong",
  "cham-bai",
  "diem-danh",
  "don-tu",
  "hoan-thanh",
  "ho-so",
  "hoc-ba",
  "hoc-vien",
  "huong-dan",
  "kho-bai-tap",
  "lich",
  "lop",
  "nhan-xet",
  "scorm",
  "tai-lieu",
  "thong-bao",
  "tin-nhan",
  "trial",
]);

/** Clean URL trên host giáo viên trỏ tới một màn GV có thật. */
export function isTeacherCleanUrl(p: string): boolean {
  return TEACHER_ROUTE_SEGMENTS.has(firstSegment(p));
}

export function isLegacyAdminPrefixed(p: string): boolean {
  return p === "/admin" || p.startsWith("/admin/");
}

/**
 * Chống open-redirect cross-host: callbackUrl phải là path nội bộ thuần.
 * Loại bỏ `//host`, `http(s)://`, backslash trick, hoặc path không bắt đầu `/`.
 */
export function sanitizeCallbackUrl(p: string): string {
  if (typeof p !== "string" || p.length === 0) return "/";
  if (!p.startsWith("/")) return "/";
  if (p.startsWith("//") || p.startsWith("/\\")) return "/";
  if (p.includes("\\")) return "/";
  const lower = p.toLowerCase();
  if (lower.includes("http://") || lower.includes("https://")) return "/";
  return p;
}

// ───────────────────────────────────────────────────────────────────────────
// Core decision
// ───────────────────────────────────────────────────────────────────────────

const PORTAL_HOME = "/";
const STAFF_HOME = "/dashboard";
const ELEARNING_HOME = "/"; // clean URL trên e-learning host (rewrite → /elearning)
const TEACHER_HOME = "/"; // clean URL trên teacher host (rewrite nội bộ → /teacher)

/**
 * Biểu mẫu nhập khách hàng nội bộ (`app/(admin)/admin/nhap-khach-hang`).
 *
 * 23/08/2026 — ĐỨNG THẬT Ở ADMIN HOST (`admin.satarobo.vn/nhap-khach-hang`),
 * đảo chốt 22/08 vốn để nó ở host public. Lý do đảo: mục sidebar admin trỏ
 * `/nhap-khach-hang`, nên mỗi lần nhập là người dùng bị **văng khỏi khung
 * admin** sang site khác rồi phải bấm quay lại.
 *
 * Hằng số này nay chỉ còn là ĐÍCH ĐẾN: mọi host khác (public / sale / đường
 * tĩnh cũ) đá 307 về đây. Segment `nhap-khach-hang` phải nằm trong
 * `ADMIN_ROUTE_SEGMENTS` — thiếu là đá qua đá lại thành vòng lặp.
 */
const INTAKE_PATH = "/nhap-khach-hang";

/** Đường dẫn cũ của biểu mẫu tĩnh — nay chỉ còn để đá về địa chỉ mới. */
const RETIRED_SALE_PATHS: ReadonlySet<string> = new Set([
  "/sale/nhap-lieu.html",
  "/sale/thank-you.html",
  "/thank-you",
  "/thank-you/",
]);

export function isIntakePath(p: string): boolean {
  return p === INTAKE_PATH || p === `${INTAKE_PATH}/`;
}

/**
 * Quyết định routing thuần tuý cho 3 host thật (public/admin/portal).
 * `vercel`/`unknown` (localhost, preview) → `next`: proxy.ts xử lý riêng
 * (canonicalize production / dev passthrough).
 */
export function decideRoute(input: RouteInput): RouteDecision {
  const { hostKind, pathname, role, sessionValid } = input;

  // `/dang-xuat` phục vụ ở MỌI host, MỌI vai trò, không điều kiện — đặt trước hết
  // thảy. Nó là đường dọn cookie cho phiên đã chết (xem app/(auth)/dang-xuat);
  // để bất kỳ luật host×role nào chạm vào là mở lại vòng lặp redirect vô tận mà
  // nó sinh ra để phá.
  if (pathname === "/dang-xuat") return { type: "next" };

  // Đợt 3B — vai trò hữu hiệu (union). Trống roles → suy từ role chính.
  const effectiveRoles: MaybeRole[] =
    input.roles && input.roles.length > 0
      ? input.roles
      : role !== null
        ? [role]
        : [];
  const hasAnyRole = effectiveRoles.length > 0;

  // Logged-in = có vai trò HỢP LỆ. tokenVersion mismatch / deactivated → !authed.
  const authed = hasAnyRole && sessionValid;
  // isParent = CHỈ gồm PARENT (PARENT không kiêm nhân viên). isStaff = có ≥1 role
  // nhân viên (≠ PARENT) → ưu tiên host admin nếu lỡ trộn (defensive).
  const isStaff = authed && effectiveRoles.some((r) => r !== null && r !== "PARENT");
  const isParent = authed && !isStaff && effectiveRoles.includes("PARENT");
  // L5 — có role TEACHER (kể cả kiêm nhiệm) → được vào teacher host khi flag ON.
  const isTeacher = authed && effectiveRoles.includes("TEACHER");
  // L6 — GV THUẦN: role nhân sự DUY NHẤT là TEACHER (không kiêm CM/Sale/HR...). GV thuần
  // trên admin host (flag ON) → chuyển sang site GV riêng; GV kiêm vai trò admin vẫn ở admin.
  const isTeacherOnly =
    isTeacher &&
    effectiveRoles.filter((r) => r !== null && r !== "PARENT").every((r) => r === "TEACHER");
  const teacherSiteOn = input.teacherSiteEnabled ?? isTeacherSiteEnabled();
  // Đợt B — Sale THUẦN: vai nhân sự DUY NHẤT là SALES_CSM. Kiêm nhiệm (QLCS kiêm
  // Sale…) KHÔNG bị nhốt trong site hẹp — nhốt là họ mất toàn bộ quyền quản lý.
  // Soi chiếu `isTeacherOnly` ở trên, cùng lý do (QĐ-3, 16/07/2026).
  const isSaleOnly =
    authed &&
    effectiveRoles.includes("SALES_CSM") &&
    effectiveRoles.filter((r) => r !== null && r !== "PARENT").every((r) => r === "SALES_CSM");
  const saleSiteOn = input.saleSiteEnabled ?? isSaleSiteEnabled();
  const elearningOn = input.elearningEnabled ?? isElearningEnabled();
  const loginAtRoot = input.commonLoginAtRoot ?? isCommonLoginAtRootEnabled();

  // Chỉ gắn reason khi đã từng có session nhưng bị vô hiệu (deactivated),
  // KHÔNG gắn cho khách ẩn danh (chưa login).
  const invalidReason: string | undefined =
    hasAnyRole && !sessionValid ? "session-invalidated" : undefined;

  // ── Public host ────────────────────────────────────────────────────────
  // Ai cũng vào (kể cả chưa login). Route admin/portal lọt vào → đá đúng host.
  if (hostKind === "public") {
    if (isPortalPath(pathname)) {
      return { type: "redirectHost", host: "portal", path: "/", status: 308 };
    }
    if (isLegacyAdminPrefixed(pathname)) {
      const cleanPath = pathname.replace(/^\/admin/, "") || STAFF_HOME;
      return { type: "redirectHost", host: "admin", path: cleanPath, status: 308 };
    }
    if (pathname === "/login") {
      // F4 (Q41) — cổng login chung: khi bật, /login ĐỨNG THẬT ở satarobo.vn.
      if (loginAtRoot) {
        if (!authed) return { type: "next" }; // chưa login → form login tại public host
        // Đã login mà mở /login → đưa về đúng host của họ (không hiện form).
        if (isParent) {
          return { type: "redirectHost", host: "portal", path: PORTAL_HOME, status: 307 };
        }
        if (isTeacherOnly && teacherSiteOn) {
          return { type: "redirectHost", host: "teacher", path: TEACHER_HOME, status: 307 };
        }
        return { type: "redirectHost", host: "admin", path: STAFF_HOME, status: 307 };
      }
      // Mặc định (OFF) — dồn login về admin host. Dùng 307 (temporary) chứ KHÔNG 308:
      // /login phụ thuộc trạng thái flag, 308 permanent sẽ bị browser/CDN cache vĩnh
      // viễn → khi bật COMMON_LOGIN_AT_ROOT (F4) sau này client cũ vẫn auto-đá sang
      // admin/login, F4 không có hiệu lực. 307 không cache nên chuyển đổi sạch.
      return { type: "redirectHost", host: "admin", path: pathname, status: 307 };
    }
    // Biểu mẫu nhập khách nay Ở ADMIN (23/08/2026). Địa chỉ public cũ giữ sống
    // CHỈ để đá sang: marketing/sale đã lưu dấu trang, và `RedirectURL` của
    // webform MISA còn trỏ về đây — 404 thì người nhập không biết đi đâu.
    //
    // Đá VÔ ĐIỀU KIỆN, không gác đăng nhập/quyền tại đây nữa: một địa chỉ chỉ
    // nên có MỘT nơi quyết định ai vào được. Chưa đăng nhập hay là PARENT thì
    // nhánh admin host bên dưới xử đúng như mọi trang admin khác.
    //
    // 307 chứ KHÔNG 308: đây là quyết định vận hành, có thể đảo. 308 bị trình
    // duyệt nhớ vĩnh viễn nên đảo xong máy khách cũ vẫn đá sang chỗ mới — đúng
    // vết xe `/login` đã ghi ở chính nhánh này.
    if (isIntakePath(pathname)) {
      return { type: "redirectHost", host: "admin", path: INTAKE_PATH, status: 307 };
    }
    if (isAdminRoute(pathname)) {
      return { type: "redirectHost", host: "admin", path: pathname, status: 308 };
    }
    return { type: "next" };
  }

  // ── Portal host (hocvien) ───────────────────────────────────────────────
  // Chỉ PARENT. Clean URL (/lich-hoc...) rewrite nội bộ → /portal/*.
  if (hostKind === "portal") {
    if (isInfraPath(pathname)) return { type: "next" };

    if (pathname === "/login") {
      if (isParent) return { type: "redirectPath", path: PORTAL_HOME };
      if (isStaff) {
        return { type: "redirectHost", host: "admin", path: STAFF_HOME, status: 307 };
      }
      return { type: "next" }; // chưa login → form login
    }

    // Trang OTP công khai (kích hoạt / quên mật khẩu) — chưa login vẫn vào.
    if (isPublicOtpPath(pathname)) {
      if (isParent) return { type: "redirectPath", path: PORTAL_HOME };
      return { type: "next" };
    }

    if (!authed) {
      return {
        type: "redirectPath",
        path: "/login",
        callbackUrl: sanitizeCallbackUrl(pathname),
        reason: invalidReason,
      };
    }

    // Staff lạc vào portal → đẩy về admin host.
    if (isStaff) {
      return { type: "redirectHost", host: "admin", path: STAFF_HOME, status: 307 };
    }

    // PARENT: chuẩn hoá landing admin-ish (vd callbackUrl mặc định /dashboard)
    // về portal home, rồi rewrite clean URL → /portal/*.
    // `isAdminRoute` nay đã phủ cả `/nhap-khach-hang` (segment khai từ 23/08).
    if (isAdminRoute(pathname)) {
      return { type: "redirectPath", path: PORTAL_HOME };
    }
    if (isPortalPath(pathname)) return { type: "next" };
    if (pathname === "/") return { type: "rewrite", path: "/portal" };
    return { type: "rewrite", path: "/portal" + pathname };
  }

  // ── Teacher host (giaovien.satarobo.vn) — L5, phiếu BGĐ câu 7 (04/07/2026) ─
  // 2-phase qua flag TEACHER_SITE_ENABLED. Chỉ TEACHER (kể cả đa vai trò kiêm
  // TEACHER); role khác đá về khu của họ. Clean URL rewrite nội bộ → /teacher/*.
  // ── E-learning host (e-learning.satarobo.vn) ─ EL-01 ───────────────────
  // Khá chính xác khuôn teacher ở trên, TRỪ **một khác biệt duy nhất**: điều kiện
  // vào là "**không phải PARENT-thuần**" chứ không phải một vai cụ thể — QĐ-7 chuối
  // EMP = mọi vai staff. Nhân sự nào cũng phải học, nên gắn cổng vào một vai là sai
  // nghệ vụ và sẽ phải sửa lại mỗi lần thêm vai mới.
  //
  // ⚠️ Cổng này quyết theo enum `Role` v1 (`MaybeRole`), KHÔNG theo `RoleDef`. Vai
  // `AUD` (kiểm soát, sẽ tạo ở EL-02) là một `RoleDef` **không có enum v1 tương ứng**
  // ⇒ tự nó KHÔNG qua được cổng này. Người giữ AUD phải đồng thời có một `Role` v1
  // staff bất kỳ. Đây là hành vi ĐÚNG CHỦ ĐÍCH (fail-closed), có case test khoá lại.
  //
  // Đường thứ hai của cổng vào — "không có hồ sơ nhân sự thì không vào" (QĐ-CDA-10) —
  // nằm ở **layout RSC** của route group, KHÔNG ở đây: hàm này thuần tuý và không chạm DB
  // (middleware chỉ thấy JWT). Xem EL-01 PR2.
  if (hostKind === "elearning") {
    if (isInfraPath(pathname)) return { type: "next" };

    // Cờ OFF (pha 1): khu chưa mở — bậy về khu của người dùng, **0 byte** HTML
    // e-learning được phục vụ. Giống hệt teacher-OFF.
    if (!elearningOn) {
      if (isParent) {
        return { type: "redirectHost", host: "portal", path: "/", status: 307 };
      }
      return { type: "redirectHost", host: "admin", path: STAFF_HOME, status: 307 };
    }

    if (pathname === "/login") {
      if (isStaff) return { type: "redirectPath", path: ELEARNING_HOME };
      if (isParent) {
        return { type: "redirectHost", host: "portal", path: "/", status: 307 };
      }
      return { type: "next" }; // chưa login → form login
    }

    // Trang OTP công khai (kích hoạt / quên mật khẩu) — chưa login vẫn vào.
    if (isPublicOtpPath(pathname)) {
      if (isStaff) return { type: "redirectPath", path: ELEARNING_HOME };
      if (isParent) {
        return { type: "redirectHost", host: "portal", path: "/", status: 307 };
      }
      return { type: "next" };
    }

    // Trang đổi mật khẩu bắt buộc — phục vụ tại chỗ, KHÔNG rewrite.
    if (pathname === "/doi-mat-khau") {
      if (!authed) {
        return { type: "redirectPath", path: "/login", reason: invalidReason };
      }
      return { type: "next" };
    }

    if (!authed) {
      return {
        type: "redirectPath",
        path: "/login",
        callbackUrl: sanitizeCallbackUrl(pathname),
        reason: invalidReason,
      };
    }

    // PARENT-thuần → về portal. Đào tạo nội bộ không dành cho phụ huynh.
    if (!isStaff) {
      return { type: "redirectHost", host: "portal", path: "/", status: 307 };
    }

    // Staff: chuẩn hoá path lạc khu rồi rewrite clean URL → /elearning/*.
    //
    // ⚠️ Thứ tự hỏi giống nhánh teacher và cũng có chủ đích: hỏi "đã là path e-learning
    // chưa" TRƯỚC, rồi mới hỏi "có phải đường admin không". Khu này sẽ có những tên
    // trùng với admin (`bao-cao`, `huong-dan`, `cai-dat`…); hỏi ngược thì clean URL của
    // đúng những màn đó bị ném về trang chủ — không lỗi, không dấu vết.
    if (isElearningPath(pathname)) return { type: "next" };
    if (pathname === "/") return { type: "rewrite", path: "/elearning" };
    if (
      isAdminRoute(pathname) ||
      isPortalPath(pathname) ||
      isTeacherPath(pathname) ||
      isLegacyAdminPrefixed(pathname)
    ) {
      return { type: "redirectPath", path: ELEARNING_HOME };
    }
    return { type: "rewrite", path: "/elearning" + pathname };
  }

  if (hostKind === "teacher") {
    if (isInfraPath(pathname)) return { type: "next" };

    // Flag OFF (phase 1): site GV chưa mở — GIỮ hành vi hiện tại (GV làm việc
    // trên admin). KHÔNG serve site GV, KHÔNG đá GV khỏi admin.
    if (!teacherSiteOn) {
      if (isParent) {
        return { type: "redirectHost", host: "portal", path: "/", status: 307 };
      }
      return { type: "redirectHost", host: "admin", path: STAFF_HOME, status: 307 };
    }

    if (pathname === "/login") {
      if (isTeacher) return { type: "redirectPath", path: TEACHER_HOME };
      if (isStaff) {
        return { type: "redirectHost", host: "admin", path: STAFF_HOME, status: 307 };
      }
      if (isParent) {
        return { type: "redirectHost", host: "portal", path: "/", status: 307 };
      }
      return { type: "next" }; // chưa login → form login
    }

    // Trang OTP công khai (kích hoạt / quên mật khẩu) — chưa login vẫn vào.
    if (isPublicOtpPath(pathname)) {
      if (isTeacher) return { type: "redirectPath", path: TEACHER_HOME };
      if (isStaff) {
        return { type: "redirectHost", host: "admin", path: STAFF_HOME, status: 307 };
      }
      if (isParent) {
        return { type: "redirectHost", host: "portal", path: "/", status: 307 };
      }
      return { type: "next" };
    }

    // BGĐ 31/07 — trang đổi MK bắt buộc (app/(auth)/doi-mat-khau): cần login,
    // phục vụ tại chỗ (KHÔNG rewrite /teacher/*) — layout các khu redirect về đây
    // khi User.mustChangePassword bật.
    if (pathname === "/doi-mat-khau") {
      if (!authed) {
        return { type: "redirectPath", path: "/login", reason: invalidReason };
      }
      return { type: "next" };
    }

    if (!authed) {
      return {
        type: "redirectPath",
        path: "/login",
        callbackUrl: sanitizeCallbackUrl(pathname),
        reason: invalidReason,
      };
    }

    // Đã login nhưng KHÔNG có role TEACHER → về đúng khu của họ.
    if (!isTeacher) {
      if (isStaff) {
        return { type: "redirectHost", host: "admin", path: STAFF_HOME, status: 307 };
      }
      return { type: "redirectHost", host: "portal", path: "/", status: 307 };
    }

    // TEACHER: chuẩn hoá path lạc khu (vd callbackUrl mặc định /dashboard,
    // /portal/*, legacy /admin/*) về teacher home, rồi rewrite clean URL.
    //
    // ⚠️ THỨ TỰ HỎI LÀ CÓ CHỦ ĐÍCH, đừng đảo lại: hỏi "site GV có màn này không" TRƯỚC
    // rồi mới hỏi "đây có phải đường admin không". Sáu tên trùng nhau ở hai site
    // (`don-tu`, `hoc-ba`, `huong-dan`, `scorm`, `tin-nhan`, `lich`); hỏi ngược thì clean URL của
    // đúng những màn đó bị ném về trang chủ GV — không lỗi, không dấu vết, người dùng chỉ
    // thấy "bấm vào không đi đâu". `/admin/*` và `/portal/*` không trùng tên nên vẫn bounce.
    if (isTeacherPath(pathname)) return { type: "next" };
    if (pathname === "/") return { type: "rewrite", path: "/teacher" };
    if (isTeacherCleanUrl(pathname)) return { type: "rewrite", path: "/teacher" + pathname };
    if (
      isAdminRoute(pathname) ||
      isPortalPath(pathname) ||
      isLegacyAdminPrefixed(pathname)
    ) {
      return { type: "redirectPath", path: TEACHER_HOME };
    }
    return { type: "rewrite", path: "/teacher" + pathname };
  }

  // ── Sale host (sale.satarobo.vn) — form nhập liệu Sale → MISA AMIS CRM ───
  // Biểu mẫu tĩnh công khai + trang cảm ơn đã XOÁ (22/08/2026). Mấy đường dẫn
  // cũ giữ lại trong RETIRED_SALE_PATHS chỉ để đá về địa chỉ mới, KHÔNG phải
  // vì còn trang nào ở đó — quảng cáo/QR cũ và RedirectURL cũ của MISA vẫn có
  // thể trỏ vào, 404 thì người nhập không biết đi đâu.
  if (hostKind === "sale") {
    if (isInfraPath(pathname)) return { type: "next" };

    // ✅ 23/08/2026 — site Sale ĐÃ CÓ biểu mẫu của riêng nó tại
    // `/sale/nhap-khach-hang`, nên đường trần `/nhap-khach-hang` trên host này
    // đá NỘI BỘ sang đó thay vì ném người dùng sang host admin.
    //
    // Trước đó nhánh này 307 sang admin — tư vấn viên muốn nhập một khách là bị
    // đá khỏi site của mình rồi phải bấm quay lại. Hai bản dùng CHUNG
    // `loadIntakeCenterOptions()` + `<QuickLeadForm>` + `quickLeadSubmit`, không
    // nhân bản logic, nên không có chuyện hai biểu mẫu trôi lệch nhau.
    //
    // Vẫn phải bắt ở đây: thiếu nó thì `/nhap-khach-hang` rơi vào luật rewrite
    // chung → `/sale/nhap-khach-hang` — vô tình đúng đích, nhưng bằng đường
    // rewrite nên thanh địa chỉ giữ URL cũ và mục điều hướng không sáng đúng chỗ.
    if (isIntakePath(pathname)) {
      return { type: "redirectPath", path: `/sale${INTAKE_PATH}` };
    }

    // ⛔ 22/08/2026 — BIỂU MẪU TĨNH CÔNG KHAI ĐÃ NGHỈ.
    // Hai file `public/sale/*.html` đã xoá; địa chỉ mới là
    // `satarobo.vn/nhap-khach-hang` (có đăng nhập). Mọi đường cũ — kể cả
    // `/thank-you` mà `RedirectURL` của MISA còn trỏ tới — đá về địa chỉ mới.
    //
    // 307 chứ KHÔNG 308: đây là quyết định vận hành (khoá biểu mẫu ẩn danh), có
    // thể phải đảo lại. 308 permanent bị trình duyệt/CDN nhớ vĩnh viễn nên đảo
    // xong máy khách cũ vẫn đá sang trang mới — đúng vết xe `/login` đã ghi ở
    // nhánh public host.
    if (RETIRED_SALE_PATHS.has(pathname)) {
      return { type: "redirectHost", host: "admin", path: INTAKE_PATH, status: 307 };
    }

    // ── Cờ TẮT (mặc định): host này không còn gì để phục vụ ──────────────
    // Trước đây nó phục vụ 2 file tĩnh. Nay biểu mẫu đã dời đi ⇒ mọi đường về
    // địa chỉ mới, thay vì trả trang trắng hay 404.
    if (!saleSiteOn) {
      return { type: "redirectHost", host: "admin", path: INTAKE_PATH, status: 307 };
    }

    // ── Cờ BẬT: site Sale có đăng nhập ───────────────────────────────────
    // ⚠️ KHÔNG có luật "mọi /sale/* đi thẳng": route group `app/(sale)/sale/`
    // sinh ra `/sale/leads`, `/sale/trial`… — luật rộng kiểu đó (di sản thời còn
    // 2 file tĩnh cùng tiền tố) là mở toang toàn bộ trang app cho người chưa
    // đăng nhập.

    // Đứng TRƯỚC cổng auth, nếu không là vòng lặp chuyển hướng vô tận —
    // repo đã dính đúng lỗi này với `/dang-xuat`.
    if (pathname === "/login") {
      if (isSaleOnly) return { type: "redirectPath", path: "/" };
      if (isStaff) {
        return { type: "redirectHost", host: "admin", path: STAFF_HOME, status: 307 };
      }
      if (isParent) {
        return { type: "redirectHost", host: "portal", path: "/", status: 307 };
      }
      return { type: "next" }; // chưa login → form login
    }

    // Trang OTP công khai (kích hoạt / quên mật khẩu) — chưa login vẫn vào.
    if (isPublicOtpPath(pathname)) {
      if (isSaleOnly) return { type: "redirectPath", path: "/" };
      if (isStaff) {
        return { type: "redirectHost", host: "admin", path: STAFF_HOME, status: 307 };
      }
      if (isParent) {
        return { type: "redirectHost", host: "portal", path: "/", status: 307 };
      }
      return { type: "next" };
    }

    // Trang đổi mật khẩu bắt buộc — cần login, phục vụ tại chỗ (không rewrite).
    if (pathname === "/doi-mat-khau") {
      if (!authed) {
        return { type: "redirectPath", path: "/login", reason: invalidReason };
      }
      return { type: "next" };
    }

    if (!authed) {
      return {
        type: "redirectPath",
        path: "/login",
        callbackUrl: sanitizeCallbackUrl(pathname),
        reason: invalidReason,
      };
    }

    // Đã login nhưng không phải Sale thuần → về đúng khu của họ.
    if (!isSaleOnly) {
      if (isStaff) {
        return { type: "redirectHost", host: "admin", path: STAFF_HOME, status: 307 };
      }
      return { type: "redirectHost", host: "portal", path: "/", status: 307 };
    }

    // Sale thuần: clean URL → rewrite vào route group.
    if (pathname === "/sale" || pathname.startsWith("/sale/")) return { type: "next" };
    if (pathname === "/") return { type: "rewrite", path: "/sale" };
    return { type: "rewrite", path: "/sale" + pathname };
  }

  // ── Admin host (admin.satarobo.vn) — clean URLs, internal rewrite ────────
  if (hostKind === "admin") {
    if (isInfraPath(pathname)) return { type: "next" };

    // Portal segment lọt sang admin → đẩy về portal host.
    if (isPortalPath(pathname)) {
      return { type: "redirectHost", host: "portal", path: "/", status: 308 };
    }

    // Legacy /admin/X URLs (bookmark cũ) → strip prefix, giữ host.
    if (isLegacyAdminPrefixed(pathname)) {
      const cleanPath = pathname.replace(/^\/admin/, "") || STAFF_HOME;
      return { type: "redirectPath", path: cleanPath };
    }

    // L6 (flag TEACHER_SITE_ENABLED ON): GV THUẦN → site GV riêng (giaovien).
    // Flag OFF → KHÔNG đụng (GV vẫn làm việc trên admin — 2-phase). GV kiêm vai trò
    // admin (CM...) KHÔNG bị đá (isTeacherOnly=false). infra path đã `next` ở trên.
    if (teacherSiteOn && isTeacherOnly) {
      return { type: "redirectHost", host: "teacher", path: "/", status: 307 };
    }

    if (pathname === "/") {
      if (!authed) {
        return { type: "redirectPath", path: "/login", reason: invalidReason };
      }
      if (isParent) {
        return { type: "redirectHost", host: "portal", path: "/", status: 307 };
      }
      return { type: "redirectPath", path: STAFF_HOME };
    }

    if (pathname === "/login") {
      if (isStaff) return { type: "redirectPath", path: STAFF_HOME };
      if (isParent) {
        return { type: "redirectHost", host: "portal", path: "/", status: 307 };
      }
      return { type: "next" }; // chưa login → form login
    }

    // Trang OTP công khai (kích hoạt / quên mật khẩu) — chưa login vẫn vào.
    if (isPublicOtpPath(pathname)) {
      if (isStaff) return { type: "redirectPath", path: STAFF_HOME };
      if (isParent) return { type: "redirectHost", host: "portal", path: "/", status: 307 };
      return { type: "next" };
    }

    // BGĐ 31/07 — trang đổi MK bắt buộc: cần login, phục vụ tại admin host.
    if (pathname === "/doi-mat-khau") {
      if (!authed) {
        return { type: "redirectPath", path: "/login", reason: invalidReason };
      }
      if (isParent) {
        return { type: "redirectHost", host: "portal", path: "/", status: 307 };
      }
      return { type: "next" };
    }

    if (isAdminRoute(pathname)) {
      if (!authed) {
        return {
          type: "redirectPath",
          path: "/login",
          callbackUrl: sanitizeCallbackUrl(pathname),
          reason: invalidReason,
        };
      }
      // PARENT lọt vào admin route → đá về portal host (FIX lỗ hổng đã biết).
      if (isParent) {
        return { type: "redirectHost", host: "portal", path: "/", status: 307 };
      }
      return { type: "rewrite", path: "/admin" + pathname };
    }

    // Non-admin path trên admin host → bounce public host.
    return { type: "redirectHost", host: "public", path: pathname, status: 308 };
  }

  // ── vercel / unknown (localhost, preview) → proxy.ts xử lý riêng ─────────
  return { type: "next" };
}
