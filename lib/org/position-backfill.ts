// lib/org/position-backfill.ts — P2 · US-11: hồ sơ nhân sự HIỆN CÓ → Position + Assignment.
//
// PHẦN THUẦN, KHÔNG CHẠM DB. Script `scripts/nen-p2-backfill-position.ts` chỉ là vỏ I/O:
// nạp dữ liệu → gọi `lapKeHoach` → in bản đối chiếu → (nếu `--apply`) ghi.
//
// ⚠️ LUẬT SỐ MỘT: KHÔNG ĐOÁN (AC3). Thiếu đơn vị hoặc thiếu chức danh thì người đó vào
// DANH SÁCH CHỜ XỬ LÝ TAY, không suy từ `department`, không gán tạm vào HO, không lấy cơ
// sở "đông người nhất". Một lần đoán sai ở đây là một người bị neo vào cơ sở không phải
// của họ — và vì Position mang quyền, cái sai đó lặng lẽ thành quyền sai.
//
// ⚠️ MẶC ĐỊNH KHÔNG GẮN VAI cho Position sinh ra. Backfill mà tự gắn vai là backfill PHÁT
// QUYỀN — thứ không được phép xảy ra ngoài tầm mắt người duyệt. Vị trí không vai vẫn đúng
// nghiệp vụ (nó là chỗ ngồi trong sơ đồ tổ chức) và tuyệt đối vô hại: `loadPositionRoleRows`
// duyệt `position.roles`, rỗng thì không sinh hàng quyền nào. Muốn chuyển quyền sang mô
// hình mới thì bật `--gan-vai`, và khi đó vai chỉ lấy từ `UserOrgRole` mà CHÍNH người đó
// ĐANG giữ TẠI CHÍNH đơn vị đó — giao của hai tập, không phải hợp.

/** Một hồ sơ nhân sự đọc từ DB (chỉ các trường backfill cần). */
export type HoSoNhanSu = {
  id: string;
  employeeCode: string;
  fullName: string;
  jobTitle: string | null;
  /** OrgUnit.id — P1 đã ghi kép; null khi hồ sơ chưa gắn đơn vị nào. */
  orgUnitId: string | null;
  /** Center.id — dùng để BẮC CẦU khi `orgUnitId` còn trống (P1 chưa backfill hồ sơ này). */
  centerId: string | null;
  joinedAt: Date | null;
  /** User.id của tài khoản gắn với hồ sơ (null = nhân sự chưa có tài khoản). */
  userId: string | null;
};

/** Vai người đó đang giữ, theo `UserOrgRole` còn hiệu lực. */
export type VaiDangGiu = { userId: string; orgUnitId: string; roleId: string; roleCode: string };

export type LyDoChoTay =
  | "THIEU_DON_VI"
  | "THIEU_CHUC_DANH"
  | "THIEU_TAI_KHOAN"
  | "DON_VI_KHONG_TON_TAI";

export type DongChoTay = {
  employeeCode: string;
  fullName: string;
  lyDo: LyDoChoTay;
  /** Nêu đúng thứ đang thiếu để người xử lý không phải đi dò. */
  chiTiet: string;
};

export type ViTriSeTao = {
  /** Khoá logic — trùng khoá thì dùng lại vị trí, không tạo thêm. */
  khoa: string;
  orgUnitId: string;
  title: string;
  /** RoleDef.id sẽ gắn (rỗng khi không bật `--gan-vai`). */
  roleIds: string[];
  /** Mã nhân sự sẽ ngồi vào vị trí này — để người duyệt đọc được "ai vào đâu". */
  nguoiGiu: string[];
};

export type PhanCongSeTao = {
  employeeCode: string;
  fullName: string;
  userId: string;
  viTriKhoa: string;
  effectiveFrom: Date;
  /** true = `joinedAt` không dùng được nên lấy ngày chạy. Bản đối chiếu phải nói ra. */
  ngayVaoLamKhongDungDuoc: boolean;
};

export type KeHoach = {
  viTri: ViTriSeTao[];
  phanCong: PhanCongSeTao[];
  choXuLyTay: DongChoTay[];
};

/**
 * Mốc chặn `joinedAt` rác. Dữ liệu thật có hồ sơ mang `1970-01-01` (giá trị epoch do
 * import cũ để lại). Dùng nó làm `effectiveFrom` không sai về quyền — phân công vẫn còn
 * hiệu lực — nhưng nó ghi vào sổ tổ chức một sự thật bịa: người đó vào làm năm 1970.
 */
const MOC_NGAY_VAO_LAM_HOP_LE = new Date("1971-01-01T00:00:00.000Z");

/** Gộp khoảng trắng + trim. Chức danh nhập tay nên "Giáo viên  " và "Giáo viên" là một. */
export function chuanHoaChucDanh(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** Khoá vị trí = đơn vị + chức danh đã chuẩn hoá (phân biệt hoa/thường bỏ qua). */
export function khoaViTri(orgUnitId: string, title: string): string {
  return `${orgUnitId}::${chuanHoaChucDanh(title).toLocaleLowerCase("vi")}`;
}

/**
 * Lập kế hoạch backfill. THUẦN: không đọc DB, không ghi gì, gọi bao nhiêu lần cũng ra
 * cùng một kết quả với cùng đầu vào.
 *
 * @param nhanSu       hồ sơ ĐANG LÀM (caller đã lọc `status`)
 * @param orgUnitIds   tập OrgUnit.id còn sống — để bắt ca hồ sơ trỏ vào đơn vị đã xoá
 * @param centerToOrg  ánh xạ Center.id → OrgUnit.id (cầu `lib/org/center-bridge.ts`)
 * @param vaiDangGiu   vai theo `UserOrgRole` còn hiệu lực (chỉ dùng khi `ganVai`)
 * @param ngayChay     mốc thay cho `joinedAt` khi ngày vào làm không dùng được
 */
export function lapKeHoach(input: {
  nhanSu: HoSoNhanSu[];
  orgUnitIds: Set<string>;
  centerToOrg: Map<string, string>;
  vaiDangGiu?: VaiDangGiu[];
  ganVai?: boolean;
  ngayChay: Date;
}): KeHoach {
  const { nhanSu, orgUnitIds, centerToOrg, ngayChay } = input;
  const vaiTheoNguoiVaDonVi = new Map<string, { roleId: string; roleCode: string }[]>();
  for (const v of input.vaiDangGiu ?? []) {
    const k = `${v.userId}::${v.orgUnitId}`;
    const ds = vaiTheoNguoiVaDonVi.get(k) ?? [];
    if (!ds.some((x) => x.roleId === v.roleId)) ds.push({ roleId: v.roleId, roleCode: v.roleCode });
    vaiTheoNguoiVaDonVi.set(k, ds);
  }

  const viTriTheoKhoa = new Map<string, ViTriSeTao>();
  const phanCong: PhanCongSeTao[] = [];
  const choXuLyTay: DongChoTay[] = [];

  // Sắp theo mã nhân sự: bản đối chiếu phải ổn định giữa hai lần chạy, nếu không người
  // duyệt không so được hai bản với nhau.
  const theoThuTu = [...nhanSu].sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));

  for (const ns of theoThuTu) {
    const title = chuanHoaChucDanh(ns.jobTitle);

    // Đơn vị: ưu tiên orgUnitId (P1 ghi kép), rồi mới bắc cầu qua centerId. KHÔNG suy từ
    // `department` — phòng ban là chiều khác, không phải đơn vị trong cây tổ chức.
    const orgUnitId = ns.orgUnitId ?? (ns.centerId ? centerToOrg.get(ns.centerId) : undefined);

    if (!orgUnitId) {
      choXuLyTay.push({
        employeeCode: ns.employeeCode,
        fullName: ns.fullName,
        lyDo: "THIEU_DON_VI",
        chiTiet: ns.centerId
          ? `centerId "${ns.centerId}" không ánh xạ được sang OrgUnit nào`
          : "hồ sơ không có cơ sở lẫn đơn vị",
      });
      continue;
    }
    if (!orgUnitIds.has(orgUnitId)) {
      choXuLyTay.push({
        employeeCode: ns.employeeCode,
        fullName: ns.fullName,
        lyDo: "DON_VI_KHONG_TON_TAI",
        chiTiet: `orgUnitId "${orgUnitId}" không còn trong cây (đã xoá/đóng)`,
      });
      continue;
    }
    if (title === "") {
      choXuLyTay.push({
        employeeCode: ns.employeeCode,
        fullName: ns.fullName,
        lyDo: "THIEU_CHUC_DANH",
        chiTiet: "jobTitle rỗng — không đoán được tên vị trí",
      });
      continue;
    }

    // Vị trí vẫn được TẠO cho người chưa có tài khoản (chỗ ngồi trong sơ đồ là có thật),
    // nhưng KHÔNG có gì để phân công: `PositionAssignment.userId` trỏ `User`, không trỏ
    // `Employee`. Nên người đó vào danh sách chờ, với đúng lý do là "chưa có tài khoản".
    const khoa = khoaViTri(orgUnitId, title);
    const viTri = viTriTheoKhoa.get(khoa) ?? {
      khoa,
      orgUnitId,
      title,
      roleIds: [] as string[],
      nguoiGiu: [] as string[],
    };
    viTri.nguoiGiu.push(ns.employeeCode);
    viTriTheoKhoa.set(khoa, viTri);

    if (!ns.userId) {
      choXuLyTay.push({
        employeeCode: ns.employeeCode,
        fullName: ns.fullName,
        lyDo: "THIEU_TAI_KHOAN",
        chiTiet: `vị trí "${title}" vẫn được tạo, nhưng chưa có tài khoản để phân công`,
      });
      continue;
    }

    if (input.ganVai) {
      for (const v of vaiTheoNguoiVaDonVi.get(`${ns.userId}::${orgUnitId}`) ?? []) {
        if (!viTri.roleIds.includes(v.roleId)) viTri.roleIds.push(v.roleId);
      }
    }

    const ngayVaoLamKhongDungDuoc =
      ns.joinedAt == null || ns.joinedAt < MOC_NGAY_VAO_LAM_HOP_LE || ns.joinedAt > ngayChay;
    phanCong.push({
      employeeCode: ns.employeeCode,
      fullName: ns.fullName,
      userId: ns.userId,
      viTriKhoa: khoa,
      effectiveFrom: ngayVaoLamKhongDungDuoc ? ngayChay : (ns.joinedAt as Date),
      ngayVaoLamKhongDungDuoc,
    });
  }

  return {
    viTri: [...viTriTheoKhoa.values()].sort((a, b) => a.khoa.localeCompare(b.khoa)),
    phanCong,
    choXuLyTay: choXuLyTay.sort((a, b) => a.employeeCode.localeCompare(b.employeeCode)),
  };
}

const NHAN_LY_DO: Record<LyDoChoTay, string> = {
  THIEU_DON_VI: "Thiếu đơn vị",
  THIEU_CHUC_DANH: "Thiếu chức danh",
  THIEU_TAI_KHOAN: "Chưa có tài khoản",
  DON_VI_KHONG_TON_TAI: "Đơn vị không còn",
};

/**
 * Bản đối chiếu Markdown (AC2) — thứ Dev đọc và duyệt TAY trước khi cho ghi.
 *
 * Liệt kê TỪNG NGƯỜI chứ không chỉ số tổng: "sinh 20 vị trí, 34 phân công" là con số
 * không duyệt được. Người duyệt cần thấy tên mình biết nằm ở đơn vị mình biết.
 */
export function inBanDoiChieu(
  keHoach: KeHoach,
  ctx: { tenDonVi: Map<string, string>; tenVai?: Map<string, string>; ganVai: boolean },
): string {
  const donVi = (id: string) => ctx.tenDonVi.get(id) ?? id;
  const d = <T,>(xs: T[]) => xs.length;
  const out: string[] = [];

  out.push("# Đối chiếu backfill nhân sự → Vị trí + Phân công (US-11)");
  out.push("");
  out.push(
    `- Vị trí sẽ có: **${d(keHoach.viTri)}** · Phân công sẽ tạo: **${d(keHoach.phanCong)}** · Chờ xử lý tay: **${d(keHoach.choXuLyTay)}**`,
  );
  out.push(
    ctx.ganVai
      ? "- Bộ vai: **CÓ gắn** — lấy từ `UserOrgRole` mà chính người đó đang giữ tại chính đơn vị đó."
      : "- Bộ vai: **KHÔNG gắn** (mặc định). Vị trí sinh ra không mang quyền nào; gán vai sau ở màn quản trị.",
  );
  out.push("");

  out.push("## 1. Vị trí");
  out.push("");
  out.push("| Đơn vị | Chức danh | Bộ vai | Người giữ |");
  out.push("|---|---|---|---|");
  for (const v of keHoach.viTri) {
    const vai =
      v.roleIds.length === 0
        ? "—"
        : v.roleIds.map((id) => ctx.tenVai?.get(id) ?? id).join(", ");
    out.push(`| ${donVi(v.orgUnitId)} | ${v.title} | ${vai} | ${v.nguoiGiu.join(", ")} |`);
  }
  out.push("");

  out.push("## 2. Phân công (PRIMARY)");
  out.push("");
  out.push("| Mã NS | Họ tên | Vị trí | Hiệu lực từ | Ghi chú |");
  out.push("|---|---|---|---|---|");
  for (const p of keHoach.phanCong) {
    const v = keHoach.viTri.find((x) => x.khoa === p.viTriKhoa);
    out.push(
      `| ${p.employeeCode} | ${p.fullName} | ${v ? `${v.title} @ ${donVi(v.orgUnitId)}` : p.viTriKhoa} | ${p.effectiveFrom.toISOString().slice(0, 10)} | ${p.ngayVaoLamKhongDungDuoc ? "⚠️ ngày vào làm trống/không hợp lệ → lấy ngày chạy" : ""} |`,
    );
  }
  out.push("");

  out.push("## 3. Chờ xử lý tay — KHÔNG đoán (AC3)");
  out.push("");
  if (keHoach.choXuLyTay.length === 0) {
    out.push("_Không có._");
  } else {
    out.push("| Mã NS | Họ tên | Lý do | Chi tiết |");
    out.push("|---|---|---|---|");
    for (const c of keHoach.choXuLyTay) {
      out.push(`| ${c.employeeCode} | ${c.fullName} | ${NHAN_LY_DO[c.lyDo]} | ${c.chiTiet} |`);
    }
  }
  out.push("");
  return out.join("\n");
}
