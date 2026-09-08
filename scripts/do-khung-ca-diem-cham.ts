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
