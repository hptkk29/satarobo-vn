/**
 * scripts/do-khung-ca-diem-cham.ts — ĐO cho hai câu hỏi 08/09/2026.
 *
 * CHỈ ĐỌC. Không có chế độ ghi, không tham số nào bật ghi.
 *
 * VIỆC 1 — /cham-cong/khung-ca thiếu gỡ người / thêm hàng loạt / sắp thứ tự:
 *   1. bảng nào giữ quan hệ nhân sự ↔ khối, khoá duy nhất, cột thứ tự;
 *   2. gỡ một người thì bản ghi đã sinh theo khối đó ra sao (ĐO trước, đừng thiết kế trước);
 *   3. kỳ đã chốt có cho sửa khung ca không.
 *
 * VIỆC 2 — /cham-cong/diem-cham, Hội sở chấm cho CS1/CS2 được không:
 *   1. WorkLocation có bao nhiêu điểm, thuộc cơ sở nào;
 *   2. StaffTimeLog.centerId lấy từ đâu (mã đã đọc — đây đo HỆ QUẢ);
 *   3. nhân sự Hội sở là ai, bao nhiêu người;
 *   4. người Hội sở quét ở CS1 thì sao.
 *
 * CHẠY: pnpm tsx scripts/do-khung-ca-diem-cham.ts
 */
import { currentDbHost } from "./_load-env";
import { scriptDb } from "./_script-db";
import { SHIFT_CATALOG } from "../lib/cham-cong/catalog";
import { inQuyen, kiemQuyen } from "./_kiem-quyen";

const db = scriptDb();

function dong(nhan: string, n: number | string) {
  console.log(`  ${nhan.padEnd(52)} ${String(n).padStart(8)}`);
}
function tieuDe(s: string) {
  console.log("");
  console.log(s);
}

async function main() {
  console.log(`[do-kc-dc] DB: ${currentDbHost()} · CHỈ ĐỌC`);
  inQuyen(await kiemQuyen(db), false);

  // ══════════════════ VIỆC 1 — KHUNG CA ══════════════════
  const pat = await db.shiftWeeklyPattern.findMany({
    select: {
      userId: true,
      centerId: true,
      section: true,
      weekday: true,
      displayOrder: true,
      effectiveFrom: true,
      effectiveTo: true,
    },
  });

  tieuDe("══ V1.1 — ShiftWeeklyPattern (bảng giữ quan hệ nhân sự ↔ khối) ══");
  dong("Tổng dòng", pat.length);
  dong("Số người khác nhau", new Set(pat.map((p) => p.userId)).size);
  dong(
    "Số cặp (người × cơ sở)",
    new Set(pat.map((p) => `${p.userId}|${p.centerId}`)).size,
  );
  dong(
    "Số mốc effectiveFrom khác nhau (trục KỲ)",
    new Set(pat.map((p) => p.effectiveFrom.toISOString())).size,
  );
  dong(
    "Dòng đã hết hiệu lực (effectiveTo khác null)",
    pat.filter((p) => p.effectiveTo != null).length,
  );

  const theoKhoi = new Map<string, Set<string>>();
  for (const p of pat) {
    const k = `${p.centerId} · ${p.section}`;
    const s = theoKhoi.get(k) ?? new Set<string>();
    s.add(p.userId);
    theoKhoi.set(k, s);
  }
  console.log("  Người theo (cơ sở · khối):");
  for (const [k, s] of [...theoKhoi].sort()) {
    console.log(`    ${k.padEnd(34)} ${String(s.size).padStart(4)} người`);
  }

  // `displayOrder` ĐÃ CÓ, nhưng ở grain (người × cơ sở × THỨ) — một người tối đa 7 dòng,
  // mỗi dòng một thứ tự riêng. Đo xem chúng có mâu thuẫn nhau không.
  const orderTheoNguoi = new Map<string, Set<number>>();
  const khoiTheoNguoi = new Map<string, Set<string>>();
  for (const p of pat) {
    const k = `${p.userId}|${p.centerId}`;
    const s = orderTheoNguoi.get(k) ?? new Set<number>();
    s.add(p.displayOrder);
    orderTheoNguoi.set(k, s);
    const s2 = khoiTheoNguoi.get(k) ?? new Set<string>();
    s2.add(String(p.section));
    khoiTheoNguoi.set(k, s2);
  }
  tieuDe("══ V1.1b — cột thứ tự ĐÃ CÓ (displayOrder) nhưng SAI GRAIN ══");
  dong(
    "Cặp (người × cơ sở) có displayOrder MÂU THUẪN giữa các thứ",
    [...orderTheoNguoi.values()].filter((s) => s.size > 1).length,
  );
  dong(
    "Cặp (người × cơ sở) thuộc NHIỀU khối cùng lúc",
    [...khoiTheoNguoi.values()].filter((s) => s.size > 1).length,
  );
  console.log(
    "  (section KHÔNG nằm trong khoá duy nhất, nên về lý thuyết một người có thể mang",
  );
  console.log(
    "   khối khác nhau ở từng thứ. Hai số trên nói điều đó có xảy ra thật hay không.)",
  );

  // ── V1.2 — gỡ một người khỏi khối thì cái gì mồ côi ──
  const userIds = [...new Set(pat.map((p) => p.userId))];
  const [assignAll, dayAll, logAll, reqAll] = await Promise.all([
    userIds.length
      ? db.shiftAssignment.groupBy({
          by: ["source"],
          where: { userId: { in: userIds } },
          _count: true,
        })
      : [],
    userIds.length
      ? db.staffAttendanceDay.count({ where: { userId: { in: userIds } } })
      : 0,
    userIds.length
      ? db.staffTimeLog.count({ where: { userId: { in: userIds } } })
      : 0,
    userIds.length
      ? db.workRequest.count({ where: { requesterId: { in: userIds } } })
      : 0,
  ]);
  tieuDe("══ V1.2 — dữ liệu ĐÃ SINH của những người đang có trong khung ca ══");
  for (const g of assignAll as { source: string; _count: number }[]) {
    dong(`ShiftAssignment · ${g.source}`, g._count);
  }
  dong("StaffAttendanceDay (dòng chấm công ngày)", dayAll);
  dong("StaffTimeLog (lượt quét)", logAll);
  dong("WorkRequest (đơn từ)", reqAll);
  console.log(
    "  ⚠️ KHÔNG bảng nào có khoá ngoại trỏ về ShiftWeeklyPattern — xoá dòng khung ca",
  );
  console.log(
    "     KHÔNG xoá theo các bản ghi trên. Chúng Ở LẠI và thành dữ liệu không còn khung",
  );
  console.log(
    "     ca giải thích: mồ côi theo nghĩa NGHIỆP VỤ, không phải mồ côi khoá ngoại.",
  );

  // ── V1.3 — kỳ đã chốt ──
  const ky = await db.attendancePeriod.groupBy({
    by: ["status"],
    _count: true,
  });
  tieuDe("══ V1.3 — AttendancePeriod theo trạng thái ══");
  if (ky.length === 0) dong("(chưa có kỳ nào)", 0);
  for (const k of ky as { status: string; _count: number }[])
    dong(k.status, k._count);
  const khoa = (ky as { status: string; _count: number }[]).find(
    (k) => k.status === "LOCKED",
  );
  console.log(
    khoa
      ? `  🔴 Có ${khoa._count} kỳ LOCKED — và generate-db.ts KHÔNG kiểm trạng thái kỳ,`
      : "  Chưa kỳ nào LOCKED — nhưng generate-db.ts vẫn KHÔNG kiểm trạng thái kỳ, nên lỗ",
  );
  console.log(
    khoa
      ? "     nên xếp lại khung ca vẫn ghi đè được vào kỳ đã chốt."
      : "     này mở sẵn cho lần chốt kỳ đầu tiên.",
  );

  // ══════════════════ VIỆC 2 — ĐIỂM CHẤM ══════════════════
  const [wl, centers] = await Promise.all([
    db.workLocation.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        centerId: true,
        isActive: true,
        geofenceEnabled: true,
        orgUnitId: true,
      },
      orderBy: { code: "asc" },
    }),
    db.center.findMany({
      select: { id: true, code: true, name: true, slug: true },
    }),
  ]);
  const tenCoSo = new Map(centers.map((c) => [c.id, c.code ?? c.name]));

  tieuDe("══ V2.1 — WorkLocation (điểm chấm) ══");
  dong("Tổng điểm chấm", wl.length);
  for (const w of wl) {
    const cs = tenCoSo.get(w.centerId) ?? w.centerId;
    const bat = w.isActive ? "BẬT" : "TẮT";
    const gf = w.geofenceEnabled ? "có" : "không";
    console.log(
      `    ${(w.code ?? "-").padEnd(10)} ${bat.padEnd(4)} geofence=${gf.padEnd(5)} cơ sở=${cs.padEnd(12)} ${w.name}`,
    );
  }
  const coSoCoDiem = new Set(
    wl.filter((w) => w.isActive).map((w) => w.centerId),
  );
  console.log("  Cơ sở KHÔNG có điểm chấm đang bật:");
  const thieu = centers.filter((c) => !coSoCoDiem.has(c.id));
  if (thieu.length === 0) console.log("    (không có — mọi cơ sở đều có điểm)");
  for (const c of thieu) {
    console.log(`    ${(c.code ?? "-").padEnd(10)} ${c.name}  [${c.id}]`);
  }

  // ── V2.3 — nhân sự theo cơ sở trực thuộc ──
  const nhanSu = await db.employee.groupBy({
    by: ["centerId"],
    where: { status: "ACTIVE" },
    _count: true,
  });
  tieuDe("══ V2.3 — nhân sự ACTIVE theo cơ sở TRỰC THUỘC ══");
  for (const n of nhanSu as { centerId: string | null; _count: number }[]) {
    const ten = n.centerId
      ? (tenCoSo.get(n.centerId) ?? n.centerId)
      : "(NULL — chưa gán cơ sở)";
    dong(String(ten), n._count);
  }

  // ── V2.3b — DANH SÁCH người chưa gán cơ sở, để mang đi hỏi Nhân sự ──
  //
  // Chỉ dữ liệu NHÂN SỰ NỘI BỘ cần cho việc gán: mã, họ tên, chức danh, bộ phận, ngày
  // vào làm. KHÔNG in điện thoại / email / CCCD / lương — log Actions đọc được, và
  // những trường đó không giúp trả lời "người này thuộc cơ sở nào".
  const chuaGan = await db.employee.findMany({
    where: { status: "ACTIVE", centerId: null },
    select: {
      employeeCode: true,
      fullName: true,
      jobTitle: true,
      department: true,
      joinedAt: true,
    },
    orderBy: [{ department: "asc" }, { fullName: "asc" }],
  });
  tieuDe(`══ V2.3b — ${chuaGan.length} nhân sự ACTIVE CHƯA gán cơ sở ══`);
  if (chuaGan.length > 0) {
    console.log(
      `    ${"MÃ NV".padEnd(12)} ${"BỘ PHẬN".padEnd(16)} ${"VÀO LÀM".padEnd(12)} ${"CHỨC DANH".padEnd(26)} HỌ TÊN`,
    );
    for (const e of chuaGan) {
      const vao = e.joinedAt
        ? e.joinedAt.toISOString().slice(0, 10)
        : "(chưa có)";
      console.log(
        `    ${e.employeeCode.padEnd(12)} ${String(e.department).padEnd(16)} ${vao.padEnd(12)} ${e.jobTitle.padEnd(26)} ${e.fullName}`,
      );
    }
    console.log("");
    console.log(
      "  Gán HÀNG LOẠT được: /admin/nhan-su/import nhận cột `centerSlug`, và",
    );
    console.log(
      "  `employeeCode` là khoá upsert (trùng mã = UPDATE). Giá trị hợp lệ của",
    );
    console.log("  `centerSlug`:");
    for (const c of centers) {
      console.log(`    ${(c.code ?? "-").padEnd(12)} slug=${c.slug}`);
    }
  }

  // ── V3 — NGHỈ VIỆC mà TÀI KHOẢN CÒN SỐNG (08/09/2026) ──────────────────────
  //
  // `updateEmployeeAction` nhận `status` (RESIGNED / TERMINATED) nhưng KHÔNG đụng
  // `User.isActive` và KHÔNG bump `User.tokenVersion`. Repo bump tokenVersion khi ĐỔI
  // VAI và khi CẤP QUYỀN — nhưng không khi nghỉ việc.
  //
  // Hệ quả: người đã nghỉ vẫn đăng nhập được, và JWT cũ (30 ngày) vẫn sống tới hạn.
  const nghiViec = await db.employee.findMany({
    where: { status: { in: ["RESIGNED", "TERMINATED"] } },
    select: {
      employeeCode: true,
      fullName: true,
      status: true,
      endDate: true,
      userAccount: {
        select: {
          id: true,
          email: true,
          isActive: true,
          deletedAt: true,
          tokenVersion: true,
        },
      },
    },
    orderBy: { employeeCode: "asc" },
  });
  const conSong = nghiViec.filter(
    (e) =>
      e.userAccount != null &&
      e.userAccount.isActive &&
      e.userAccount.deletedAt == null,
  );
  tieuDe("══ V3 — Employee ĐÃ NGHỈ mà User CÒN ACTIVE ══");
  dong("Employee RESIGNED / TERMINATED", nghiViec.length);
  dong(
    "… trong đó có tài khoản User",
    nghiViec.filter((e) => e.userAccount != null).length,
  );
  dong("🔴 … tài khoản VẪN ĐANG SỐNG", conSong.length);
  for (const e of conSong) {
    const het = e.endDate ? e.endDate.toISOString().slice(0, 10) : "(chưa có)";
    console.log(
      `    ${e.employeeCode.padEnd(12)} ${String(e.status).padEnd(11)} nghỉ=${het.padEnd(12)} ${e.fullName}`,
    );
  }
  if (conSong.length === 0) {
    console.log(
      "  (không có — nhưng đường ghi vẫn hở: xem chú thích trên, luật 1)",
    );
  }

  // ── V4 — ENDPOINT IMPORT NHÂN SỰ đã từng chạy chưa, có xoá trắng ai không ──
  //
  // `app/api/admin/import/employees/route.ts` dùng `update: base` với TOÀN BỘ trường:
  // cột thiếu trong file → Zod biến `undefined` thành `null` → GHI ĐÈ NULL. Riêng
  // `status` có `.default("ACTIVE")` nên thiếu cột là lật hồ sơ đã nghỉ về đang làm.
  //
  // ⚠️ Endpoint này KHÔNG ghi AuditLog dòng nào (đường sửa từng người thì ghi 9 chỗ).
  // Nên không truy được trực tiếp; phải suy bằng DẤU VẾT:
  //   hồ sơ ĐÃ TỪNG SỬA (`updatedAt > createdAt`) mà KHÔNG có AuditLog nào
  //   ⇒ sửa bởi một đường KHÔNG audit — importer là đường chính thuộc loại đó.
  const nhanSuAll = await db.employee.findMany({
    select: {
      id: true,
      employeeCode: true,
      fullName: true,
      createdAt: true,
      updatedAt: true,
      phone: true,
      email: true,
      joinedAt: true,
      subjects: true,
    },
  });
  const auditNs = await db.auditLog.findMany({
    where: { entityType: "Employee" },
    select: { entityId: true },
  });
  const coAudit = new Set(auditNs.map((a) => a.entityId));
  // 2 giây đệm: `createdAt`/`updatedAt` của cùng lượt tạo có thể lệch vài ms.
  const daSua = nhanSuAll.filter(
    (e) => e.updatedAt.getTime() - e.createdAt.getTime() > 2000,
  );
  const daSuaKhongAudit = daSua.filter((e) => !coAudit.has(e.id));

  tieuDe("══ V4 — dấu vết đường ghi KHÔNG audit (nghi importer) ══");
  dong("Tổng hồ sơ nhân sự", nhanSuAll.length);
  dong("AuditLog entityType=Employee", auditNs.length);
  dong("Hồ sơ ĐÃ TỪNG SỬA (updatedAt > createdAt)", daSua.length);
  dong("🔴 … mà KHÔNG có AuditLog nào", daSuaKhongAudit.length);
  for (const e of daSuaKhongAudit) {
    const trong = [
      e.phone ? null : "phone",
      e.email ? null : "email",
      e.joinedAt ? null : "joinedAt",
      (e.subjects as unknown[])?.length ? null : "subjects",
    ].filter(Boolean);
    console.log(
      `    ${e.employeeCode.padEnd(12)} sửa=${e.updatedAt.toISOString().slice(0, 10)} trống: ${trong.join(", ") || "(không)"}  ${e.fullName}`,
    );
  }
  if (daSuaKhongAudit.length === 0) {
    console.log(
      "  (không hồ sơ nào bị sửa ngoài đường có audit — chưa thấy dấu importer chạy)",
    );
  }

  // ── V5 — XUẤT bảng nhân sự (việc 4b + việc 5) ──────────────────────────────
  //
  // Hai mục đích trong MỘT lượt đọc:
  //   4b — 10 người chưa gán cơ sở, đủ cột importer nhận, để dán vào Excel;
  //   5  — TOÀN BỘ mã NV để đối chiếu với bảng của Nhân sự.
  //
  // ⚠️ CỐ Ý BỎ `nationalId` và `dateOfBirth`: log Actions đọc được, và sau bản vá
  // 7f9e0348 thì cột VẮNG trong file nhập KHÔNG bị ghi đè — nên bỏ hai cột đó khỏi bản
  // xuất không mất gì, mà giữ chúng lại là đưa giấy tờ tuỳ thân vào log CI.
  //
  // ⚠️ `centerSlug` để TRỐNG cho người chưa gán — đó là cột cần điền. Với người đã có
  // cơ sở thì in slug thật để bản xuất tự mô tả đúng hiện trạng.
  const slugTheoId = new Map(centers.map((c) => [c.id, c.slug]));
  const COT_XUAT = [
    "employeeCode",
    "fullName",
    "jobTitle",
    "department",
    "status",
    "centerSlug",
    "phone",
    "email",
    "contractType",
    "joinedAt",
    "endDate",
    "address",
    "subjects",
    "certifications",
    "bio",
    "emergencyContact",
    "notes",
  ] as const;
  const nsXuat = await db.employee.findMany({
    select: {
      employeeCode: true,
      fullName: true,
      jobTitle: true,
      department: true,
      status: true,
      centerId: true,
      phone: true,
      email: true,
      contractType: true,
      joinedAt: true,
      endDate: true,
      address: true,
      subjects: true,
      certifications: true,
      bio: true,
      emergencyContact: true,
      notes: true,
    },
    orderBy: { employeeCode: "asc" },
  });
  /** Dấu phân cách TSV. Viết tường minh — ký tự tab trong chuỗi là thứ vô hình khi đọc. */
  const TAB = String.fromCharCode(9);
  const oNgay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  // Ký tự tab / xuống dòng trong dữ liệu sẽ phá cấu trúc TSV — thay bằng khoảng trắng.
  const KY_TU_PHA_TSV = new RegExp(
    "[" + String.fromCharCode(9, 13, 10) + "]+",
    "g",
  );
  const oChuoi = (v: unknown) =>
    v == null
      ? ""
      : Array.isArray(v)
        ? v.join(", ")
        : String(v).replace(KY_TU_PHA_TSV, " ");
  const hang = (e: (typeof nsXuat)[number]) =>
    [
      e.employeeCode,
      e.fullName,
      e.jobTitle,
      String(e.department),
      String(e.status),
      e.centerId ? (slugTheoId.get(e.centerId) ?? "") : "",
      oChuoi(e.phone),
      oChuoi(e.email),
      oChuoi(e.contractType),
      oNgay(e.joinedAt),
      oNgay(e.endDate),
      oChuoi(e.address),
      oChuoi(e.subjects),
      oChuoi(e.certifications),
      oChuoi(e.bio),
      oChuoi(e.emergencyContact),
      oChuoi(e.notes),
    ].join(TAB);

  tieuDe(
    "══ V5a (việc 4b) — TSV dán thẳng vào Excel: 10 người CHƯA gán cơ sở ══",
  );
  console.log(
    "  (bỏ nationalId + dateOfBirth khỏi bản xuất — cột vắng KHÔNG bị ghi đè)",
  );
  console.log("");
  console.log(COT_XUAT.join(TAB));
  for (const e of nsXuat.filter(
    (x) => x.centerId == null && String(x.status) === "ACTIVE",
  )) {
    console.log(hang(e));
  }

  tieuDe("══ V5b (việc 5) — TOÀN BỘ nhân sự để đối chiếu bảng Nhân sự ══");
  dong("Tổng hồ sơ", nsXuat.length);
  console.log(
    `    ${"MÃ NV".padEnd(12)} ${"TRẠNG THÁI".padEnd(11)} ${"CƠ SỞ".padEnd(24)} ${"BỘ PHẬN".padEnd(16)} ${"CHỨC DANH".padEnd(26)} HỌ TÊN`,
  );
  for (const e of nsXuat) {
    const cs = e.centerId
      ? (slugTheoId.get(e.centerId) ?? e.centerId)
      : "(chưa gán)";
    console.log(
      `    ${e.employeeCode.padEnd(12)} ${String(e.status).padEnd(11)} ${cs.padEnd(24)} ${String(e.department).padEnd(16)} ${e.jobTitle.padEnd(26)} ${e.fullName}`,
    );
  }

  // ── V6 — mốc UNIX 1970 trong joinedAt/endDate: đang hại ở đâu ─────────────
  //
  // `joinedAt = 1970-01-01` là NULL bị ghi thành 0. Phép trừ ngày với 1970 không ném
  // lỗi, chỉ ra số sai — cùng họ với bug so nửa đêm.
  //
  // Nơi ĐAU nhất tìm được khi rà mã: `lib/honors/honor-view.ts:11` tính "số năm gắn bó"
  // bằng `(now - joinedAt) / 30 ngày / 12`, và giá trị đó lên TRANG CÔNG KHAI
  // `/vinh-danh`. Với 1970 thì ra ~57. Chuỗi ưu tiên là
  // `yearsAtTime ?? computeYears(employee.joinedAt) ?? yearsAtCompany`, nên chỉ bản ghi
  // KHÔNG có `yearsAtTime` mới rơi vào nhánh tính.
  const EPOCH = new Date("1970-01-02T00:00:00Z");
  const [epochJoin, epochEnd, honorAll] = await Promise.all([
    db.employee.count({ where: { joinedAt: { lt: EPOCH } } }),
    db.employee.count({ where: { endDate: { lt: EPOCH } } }),
    db.honor.findMany({
      select: {
        id: true,
        yearsAtTime: true,
        employee: {
          select: { employeeCode: true, fullName: true, joinedAt: true },
        },
      },
    }),
  ]);
  const honorHong = honorAll.filter(
    (h) =>
      h.yearsAtTime == null &&
      h.employee?.joinedAt != null &&
      h.employee.joinedAt < EPOCH,
  );
  tieuDe("══ V6 — mốc 1970 (NULL bị ghi thành 0) ══");
  dong("Employee có joinedAt = 1970", epochJoin);
  dong("Employee có endDate = 1970", epochEnd);
  dong("Tổng bản ghi Vinh danh", honorAll.length);
  dong("🔴 Vinh danh sẽ hiện SỐ NĂM SAI trên web công khai", honorHong.length);
  for (const h of honorHong) {
    const nam = Math.floor(
      (Date.now() - (h.employee?.joinedAt?.getTime() ?? 0)) /
        (1000 * 60 * 60 * 24 * 30) /
        12,
    );
    console.log(
      `    ${(h.employee?.employeeCode ?? "-").padEnd(12)} sẽ hiện "${nam} năm gắn bó"  ${h.employee?.fullName ?? ""}`,
    );
  }
  if (honorHong.length === 0) {
    console.log(
      "  (không bản ghi nào rơi vào nhánh tính — hoặc đã có yearsAtTime, hoặc",
    );
    console.log(
      "   chưa vinh danh ai trong nhóm 1970. Đường ghi vẫn hở: luật 1.)",
    );
  }

  // ── V10 — ĐỐI CHIẾU SHIFT_CATALOG (seed) ↔ ShiftTemplate (prod) ───────────
  //
  // Câu của chủ dự án rộng hơn `dayCredit`: "còn giá trị nào khác trên prod đang lệch
  // với seed không?". Đừng soi bằng mắt — so ĐỦ 17 cột mà `seedShiftTemplates` ghi.
  //
  // Vì sao đáng lo dù `seedShiftTemplates` chỉ ghi đè khi `--force`: seed không còn mô tả
  // đúng thực tế, nên bất kỳ ai đọc nó để hiểu hệ thống sẽ hiểu sai — và một lần chạy
  // `--force` là mất mọi chỉnh tay.
  {
    const tren = await db.shiftTemplate.findMany({
      where: { centerId: null },
      select: {
        code: true,
        name: true,
        kind: true,
        segments: true,
        defaultPlace: true,
        attendanceMode: true,
        dayCredit: true,
        isLeave: true,
        nominalMinutes: true,
        payMode: true,
        amStart: true,
        amEnd: true,
        pmStart: true,
        pmEnd: true,
        pmBreakStart: true,
        pmBreakEnd: true,
        note: true,
        displayOrder: true,
      },
    });
    const theoMa = new Map(tren.map((t) => [t.code, t]));
    // ⚠️ `JSON.stringify` NHẠY THỨ TỰ KHOÁ, mà Postgres `jsonb` tự sắp lại khoá theo
    // thứ tự của nó. Bản đầu của bộ so này báo 18/21 mã lệch, trong đó ~9 mã chỉ khác
    // `{start,end,kind}` ↔ `{end,kind,start}` — giá trị y hệt. Chuẩn hoá bằng cách sắp
    // khoá trước khi so, kẻo cổng kêu suốt và không ai đọc nữa (luật 11: một bộ so báo
    // sai thì cũng vô dụng như một bộ so luôn im).
    const sapKhoa = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(sapKhoa)
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.entries(v as Record<string, unknown>)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, x]) => [k, sapKhoa(x)]),
            )
          : v;
    const chuan = (v: unknown) => JSON.stringify(sapKhoa(v ?? null));
    tieuDe("══ V10 — seed SHIFT_CATALOG vs prod ShiftTemplate ══");
    dong("Mã trong seed", SHIFT_CATALOG.length);
    dong("Mã trên prod (dùng chung)", tren.length);
    const thieuTrenProd = SHIFT_CATALOG.filter((e) => !theoMa.has(e.code)).map(
      (e) => e.code,
    );
    const laTrenProd = tren
      .filter((t) => !SHIFT_CATALOG.some((e) => e.code === t.code))
      .map((t) => t.code);
    if (thieuTrenProd.length)
      console.log(`  🔴 seed có, prod KHÔNG: ${thieuTrenProd.join(", ")}`);
    if (laTrenProd.length)
      console.log(`  🔴 prod có, seed KHÔNG: ${laTrenProd.join(", ")}`);

    let soMaLech = 0;
    for (const e of SHIFT_CATALOG) {
      const t = theoMa.get(e.code);
      if (!t) continue;
      const cap: [string, unknown, unknown][] = [
        ["name", e.name, t.name],
        ["kind", e.kind, t.kind],
        ["segments", e.segments, t.segments],
        ["defaultPlace", e.defaultPlace, t.defaultPlace],
        ["attendanceMode", e.attendanceMode, t.attendanceMode],
        ["dayCredit", e.dayCredit, t.dayCredit],
        ["isLeave", e.isLeave, t.isLeave],
        ["nominalMinutes", e.nominalMinutes, t.nominalMinutes],
        ["payMode", e.payMode, t.payMode],
        ["amStart", e.amStart ?? null, t.amStart],
        ["amEnd", e.amEnd ?? null, t.amEnd],
        ["pmStart", e.pmStart ?? null, t.pmStart],
        ["pmEnd", e.pmEnd ?? null, t.pmEnd],
        ["pmBreakStart", e.pmBreakStart ?? null, t.pmBreakStart],
        ["pmBreakEnd", e.pmBreakEnd ?? null, t.pmBreakEnd],
        ["note", e.note ?? null, t.note],
        ["displayOrder", e.displayOrder, t.displayOrder],
      ];
      const lech = cap.filter(([, a, b]) => chuan(a) !== chuan(b));
      if (lech.length === 0) continue;
      soMaLech += 1;
      console.log(`  🔴 ${e.code}`);
      for (const [ten, a, b] of lech) {
        console.log(`       ${ten}`);
        console.log(`         seed: ${chuan(a)}`);
        console.log(`         prod: ${chuan(b)}`);
      }
    }
    dong("Mã LỆCH", soMaLech);
    if (soMaLech === 0) console.log("  ✅ seed và prod khớp trên cả 17 cột");
  }

  // ── V9 — BÁN KÍNH ĐỔI ĐƠN VỊ CÔNG → CA (khảo sát 09/09/2026) ─────────────
  //
  // Ba câu: (a) đường ghi đã có dữ liệu chưa — nếu còn 0 thì đây là cửa sổ đổi mô hình
  // rẻ nhất; (b) kỳ nào đã CHỐT (số của kỳ chốt phải bất biến); (c) 21 mã ca thật trông
  // ra sao, mã nào là HAI BUỔI.
  const [soAssign, soDay, soLog, soVe] = await Promise.all([
    db.shiftAssignment.count(),
    db.staffAttendanceDay.count(),
    db.staffTimeLog.count(),
    db.attendanceTicket.count(),
  ]);
  tieuDe("══ V9.1 — đường ghi chấm công đã có dữ liệu chưa ══");
  dong("ShiftAssignment (ô lưới tháng)", soAssign);
  dong("StaffAttendanceDay (công ngày)", soDay);
  dong("StaffTimeLog (lượt quét)", soLog);
  dong("AttendanceTicket (vé)", soVe);

  const kyDaChot = await db.attendancePeriod.findMany({
    where: { status: "LOCKED" },
    select: {
      periodKey: true,
      centerId: true,
      lockedAt: true,
      standardUnits: true,
      summaryJson: true,
    },
    orderBy: { periodKey: "asc" },
  });
  tieuDe("══ V9.2 — kỳ ĐÃ CHỐT (summaryJson là số đóng băng) ══");
  dong("Số kỳ LOCKED", kyDaChot.length);
  for (const k of kyDaChot) {
    const sj = k.summaryJson as {
      totals?: { units?: number; people?: number };
    } | null;
    console.log(
      `    ${k.periodKey} · ${k.centerId} · chốt ${k.lockedAt?.toISOString().slice(0, 10) ?? "?"}` +
        ` · công chuẩn=${k.standardUnits ?? "—"}` +
        ` · summaryJson: ${sj ? `${sj.totals?.people ?? "?"} người / ${sj.totals?.units ?? "?"} công` : "TRỐNG"}`,
    );
  }

  const maCa = await db.shiftTemplate.findMany({
    select: {
      code: true,
      name: true,
      kind: true,
      dayCredit: true,
      isLeave: true,
      nominalMinutes: true,
      segments: true,
      isActive: true,
      amStart: true,
      amEnd: true,
      pmStart: true,
      pmEnd: true,
      pmBreakStart: true,
      pmBreakEnd: true,
      attendanceMode: true,
      payMode: true,
    },
    orderBy: { code: "asc" },
  });
  tieuDe("══ V9.3 — DANH MỤC MÃ CA: mã nào là HAI BUỔI ══");
  dong("Tổng mã ca", maCa.length);
  dong("… đang bật", maCa.filter((t) => t.isActive).length);
  for (const t of maCa) {
    const segs =
      (t.segments as { start: string; end: string; kind: string }[] | null) ??
      [];
    const lam = segs.filter((x) => x.kind === "WORK");
    // HAI BUỔI = có ≥2 đoạn WORK, hoặc khai đủ cả am* lẫn pm*.
    const haiBuoi = lam.length >= 2 || (!!t.amStart && !!t.pmStart);
    const gio =
      lam.map((x) => `${x.start}-${x.end}`).join(" + ") || "(không đoạn)";
    const nghi = segs
      .filter((x) => x.kind !== "WORK")
      .map((x) => `${x.kind}:${x.start}-${x.end}`)
      .join(" ");
    console.log(
      `    ${haiBuoi ? "🟦2BUỔI" : "      1"} ${t.code.padEnd(6)} ${t.name.slice(0, 22).padEnd(23)}` +
        ` ${t.kind.padEnd(6)} công=${t.dayCredit} ${t.isLeave ? "NGHỈ " : "     "}` +
        `phút=${t.nominalMinutes ?? "—"} | ${gio}${nghi ? ` | nghỉ ${nghi}` : ""}`,
    );
    if (t.amStart || t.pmStart)
      console.log(
        `             cột hiển thị: am ${t.amStart ?? "—"}-${t.amEnd ?? "—"} · pm ${t.pmStart ?? "—"}-${t.pmEnd ?? "—"} · nghỉ giữa ${t.pmBreakStart ?? "—"}-${t.pmBreakEnd ?? "—"}`,
      );
  }

  // Vai KẾ TOÁN: đã có ai được neo chưa (việc 2).
  const vaiKeToan = await db.userOrgRole.findMany({
    where: {
      role: { code: { in: ["HO_ACCOUNTANT", "CENTER_ACCOUNTANT"] } },
      status: "ACTIVE",
    },
    select: { userId: true, orgUnitId: true, role: { select: { code: true } } },
  });
  const dsRoleDef = await db.roleDef.findMany({
    select: { code: true, _count: { select: { permissions: true } } },
    orderBy: { code: "asc" },
  });
  tieuDe("══ V9.4 — vai KẾ TOÁN đã neo cho ai chưa ══");
  dong("UserOrgRole ACTIVE của 2 vai kế toán", vaiKeToan.length);
  for (const v of vaiKeToan)
    console.log(
      `    ${v.role.code} · user=${v.userId} · orgUnit=${v.orgUnitId}`,
    );
  dong("RoleDef trên prod", dsRoleDef.length);
  console.log(
    `    ${dsRoleDef.map((r) => `${r.code}(${r._count.permissions})`).join(" · ")}`,
  );

  // ── V8 — BA CHỖ ĐẾM BUỔI DẠY BỎ SÓT `substituteTeacherId` ─────────────────
  //
  // Ba chỗ đếm "buổi dạy" cùng bỏ sót MỘT cột. Tiền lệ đã sửa đúng nằm ngay cạnh:
  // `cham-cong/cong-day/page.tsx:109` gom cả bốn nguồn
  // (`actualTeacherId`, `substituteTeacherId`, `class.teacherId`, `class.assistantId`).
  //
  //  (1) `bao-cao/hieu-suat-gv/page.tsx:283,302` — `actualTeacherId ?? class.teacherId`
  //  (2) `dashboard/_components/manager-dashboard.tsx:132` — y hệt
  //  (3) `teacher/bang-cong/page.tsx:188-190` — `OR[classId ∈ assignedClassIds,
  //      actualTeacherId = tôi]`, KHÔNG có nhánh dạy thay
  //
  // ĐO TRƯỚC, SỬA SAU. Con số cần: buổi có `substituteTeacherId`, và trong đó bao nhiêu
  // buổi mà người dạy thay KHÁC người sẽ được ba chỗ trên quy công cho.
  const tongBuoi = await db.classSession.count({
    where: { status: { not: "CANCELLED" } },
  });
  const buoiCoDayThay = await db.classSession.findMany({
    where: { substituteTeacherId: { not: null }, status: { not: "CANCELLED" } },
    select: {
      id: true,
      status: true,
      actualTeacherId: true,
      substituteTeacherId: true,
      class: { select: { teacherId: true, assistantId: true } },
    },
  });
  tieuDe("══ V8 — buổi có GV DẠY THAY (ba chỗ đếm đang bỏ sót) ══");
  dong("Buổi (khác CANCELLED)", tongBuoi);
  dong("… có substituteTeacherId", buoiCoDayThay.length);
  if (buoiCoDayThay.length > 0) {
    // Quy công theo CÔNG THỨC của (1) và (2): actualTeacherId ?? class.teacherId.
    const quyNhamNguoi = buoiCoDayThay.filter(
      (b) =>
        (b.actualTeacherId ?? b.class?.teacherId ?? null) !==
        b.substituteTeacherId,
    );
    dong("🔴 … quy công cho NGƯỜI KHÁC người dạy thay", quyNhamNguoi.length);
    const khongAi = buoiCoDayThay.filter(
      (b) => (b.actualTeacherId ?? b.class?.teacherId ?? null) === null,
    );
    dong("🔴 … không quy được cho ai (rơi khỏi báo cáo)", khongAi.length);
    // Chỗ (3): người dạy thay có nằm trong assignedClassIds của lớp đó không? Xấp xỉ
    // bằng "dạy thay KHÁC cả GV chính lẫn trợ giảng của lớp" — khi đó buổi ấy không
    // lọt nhánh nào của `bang-cong`.
    const ngoaiBangCong = buoiCoDayThay.filter(
      (b) =>
        b.substituteTeacherId !== b.class?.teacherId &&
        b.substituteTeacherId !== b.class?.assistantId &&
        b.substituteTeacherId !== b.actualTeacherId,
    );
    dong(
      "🔴 … KHÔNG hiện trên bảng công của người dạy thay",
      ngoaiBangCong.length,
    );
    const theoTrangThai = new Map<string, number>();
    for (const b of buoiCoDayThay)
      theoTrangThai.set(b.status, (theoTrangThai.get(b.status) ?? 0) + 1);
    console.log(
      `  theo trạng thái: ${[...theoTrangThai].map(([k, v]) => `${k}=${v}`).join(" · ")}`,
    );
  } else {
    console.log(
      "  (0 buổi — luật 1: đường ghi vẫn hở, xem `complete-session.tsx`)",
    );
  }

  // ── V7 — LƯỢT IMPORT HỎNG 08/09: audit nói chính xác cột nào bị đổi ───────
  //
  // Sự cố: file 2 cột (employeeCode + centerSlug) cho 9 người đã XOÁ TRẮNG dateOfBirth,
  // joinedAt, endDate. `centerId` gán đúng cả 9.
  //
  // Việc 8 (audit importer) lên prod cùng #229, nên lượt hỏng ĐÃ tự ghi lại
  // `changedFields` + old/new. Đây là bằng chứng trực tiếp thay cho suy luận.
  const auditImport = await db.auditLog.findMany({
    where: { action: { in: ["IMPORT_UPDATE", "IMPORT_CREATE"] } },
    select: {
      action: true,
      entityId: true,
      changedFields: true,
      oldValues: true,
      newValues: true,
      reason: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  tieuDe("══ V7 — audit của lượt IMPORT (bằng chứng trực tiếp) ══");
  dong("Số dòng audit IMPORT_*", auditImport.length);
  if (auditImport.length > 0) {
    // `reason` ghi DANH SÁCH CỘT có trong file — thứ quyết định patch gồm gì.
    console.log(
      `  reason (cột có trong file): ${auditImport[0]?.reason ?? "(trống)"}`,
    );
    const dem = new Map<string, number>();
    for (const a of auditImport) {
      for (const f of (a.changedFields as string[] | null) ?? []) {
        dem.set(f, (dem.get(f) ?? 0) + 1);
      }
    }
    console.log("  Cột bị đổi, và bao nhiêu hồ sơ:");
    for (const [f, n] of [...dem].sort((x, y) => y[1] - x[1])) {
      console.log(`    ${f.padEnd(20)} ${String(n).padStart(3)} hồ sơ`);
    }
    // Gom theo LƯỢT NHẬP (cùng `reason` = cùng file) — 18 dòng nghĩa là >1 lượt,
    // và mỗi lượt có tập cột riêng.
    const theoLuot = new Map<string, typeof auditImport>();
    for (const a of auditImport) {
      const k = a.reason ?? "(trống)";
      const arr = theoLuot.get(k);
      if (arr) arr.push(a);
      else theoLuot.set(k, [a]);
    }
    for (const [reason, rows] of theoLuot) {
      console.log("");
      console.log(`  ── LƯỢT: ${reason}`);
      console.log(
        `     lúc ${rows[0]?.createdAt.toISOString()} · ${rows.length} hồ sơ`,
      );
      const d2 = new Map<string, number>();
      for (const a of rows)
        for (const f of (a.changedFields as string[] | null) ?? [])
          d2.set(f, (d2.get(f) ?? 0) + 1);
      console.log(
        `     cột đổi: ${[...d2].map(([f, n]) => `${f}(${n})`).join(", ")}`,
      );
      // MẤT DỮ LIỆU = có giá trị cũ, giá trị mới là null.
      for (const a of rows) {
        const cu = (a.oldValues ?? {}) as Record<string, unknown>;
        const moi = (a.newValues ?? {}) as Record<string, unknown>;
        const mat = Object.keys(moi).filter(
          (k) => moi[k] === null && cu[k] !== null && cu[k] !== undefined,
        );
        if (mat.length > 0)
          console.log(
            `     ⚠️ ${a.entityId} MẤT: ${mat.map((k) => `${k}=${JSON.stringify(cu[k])}`).join(" · ")}`,
          );
      }
    }
  } else {
    console.log(
      "  ⚠️ KHÔNG có dòng audit nào — nghĩa là lượt import chạy bằng mã CŨ",
    );
    console.log(
      "     (bản vá chưa kịp deploy khi bấm nhập), chứ không phải patch sai.",
    );
  }

  // ── V2.4 — lượt quét thật: nơi quét vs nơi trực thuộc ──
  const logs = await db.staffTimeLog.findMany({
    select: { centerId: true, result: true, flags: true, userId: true },
  });
  tieuDe(
    "══ V2.4 — StaffTimeLog: centerId = NƠI QUÉT (WorkLocation.centerId) ══",
  );
  dong("Tổng lượt quét", logs.length);
  const theoCs = new Map<string, number>();
  for (const l of logs) {
    const k = l.centerId ? (tenCoSo.get(l.centerId) ?? l.centerId) : "(NULL)";
    theoCs.set(k, (theoCs.get(k) ?? 0) + 1);
  }
  for (const [k, v] of [...theoCs].sort()) dong(`  quét tại ${k}`, v);
  const co = (l: { flags: unknown }, f: string) =>
    Array.isArray(l.flags) && (l.flags as string[]).includes(f);
  dong("Cờ SAI_NOI_LAM", logs.filter((l) => co(l, "SAI_NOI_LAM")).length);
  dong(
    "Cờ CHAM_NGOAI_LICH",
    logs.filter((l) => co(l, "CHAM_NGOAI_LICH")).length,
  );
  console.log(
    "  (SAI_NOI_LAM là CỜ, KHÔNG phải từ chối — lượt quét vẫn được ghi, và centerId của",
  );
  console.log("   nó là NƠI QUÉT chứ không phải nơi người đó trực thuộc.)");

  console.log("");
  console.log("[do-kc-dc] Xong. Không ghi gì.");
}

main()
  .catch((e) => {
    console.error("[do-kc-dc] lỗi:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
