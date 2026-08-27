import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { requireLiveSession } from "@/lib/auth/live-session";
import {
  checkPermission,
  checkPermissionDetail,
  canViewLeadPii,
} from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { maskLeadPiiFields } from "@/lib/lead/pii";
import { writeAudit } from "@/lib/audit/audit-log";
import { getAuditActor } from "@/lib/audit/log";
import { exportWatermark } from "@/lib/export/watermark";
import {
  LEAD_EXPORT_BATCH_SIZE,
  LEAD_EXPORT_MAX_ROWS,
  buildLeadExportWhere,
  buildLeadExportSheet,
  buildLeadExportInfoSheet,
  leadExportFileName,
  leadExportTruncationWarning,
  type LeadExportLead,
} from "@/lib/leads/lead-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * G-03 — xuất Excel DANH SÁCH LEAD.
 *
 * ┌─ Bốn thứ đường này phải làm đúng, xếp theo mức thiệt hại nếu làm sai ────────────┐
 * │ 1. QUYỀN A-03 — đòi ĐỦ HAI: `leads:view-all` (xem được danh sách) VÀ             │
 * │    `leads:export` (mang dữ liệu ra ngoài). 🔴 Là AND, KHÔNG được THAY THẾ vế đầu: │
 * │    người mang vai neo tại HO nhưng không có `leads:*` nào sẽ rơi vào nhánh        │
 * │    `isHoLevel` của `lib/db-scope.ts` ⇒ `"ALL"` ⇒ xuất lead TOÀN HỆ THỐNG.         │
 * │    Trước G-03 chỉ có vế đầu, tức ai xem được danh sách là tải được tệp.           │
 * │ 2. CHE PII Ở SERVER. Mọi dòng đi qua `maskLeadPiiFields` TRƯỚC khi vào tệp, và ô  │
 * │    tìm KHÔNG quét cột SĐT khi người xuất thiếu `leads:view-pii` — nếu không, gõ   │
 * │    một số vào ô tìm rồi đọc số dòng trả về là đủ xác nhận "số này của ai".        │
 * │ 3. KHÔNG CẮT CÂM. Đếm trước, đọc theo lô, và chạm trần thì NÓI RA trong tệp còn   │
 * │    thiếu bao nhiêu khách. Bản CSV cũ cắt ở 5000 dòng không một lời nào.           │
 * │ 4. GHI VẾT. Xuất dữ liệu khách là hành vi phải truy được: ai xuất, lọc gì, bao    │
 * │    nhiêu dòng, có bị cắt không, bản che hay bản đầy đủ — vào `AuditLog` +         │
 * │    watermark trong tệp, ghi TRƯỚC khi tệp rời máy chủ.                            │
 * └────────────────────────────────────────────────────────────────────────────────┘
 *
 * Định dạng `.xlsx` (quyết định B12 ngày 24/08/2026), dựng bằng SheetJS đã có sẵn
 * trong kho — không thêm thư viện.
 */
export async function GET(req: NextRequest) {
  const session = await requireLiveSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Chưa đăng nhập" }, { status: 401 });
  }

  // A-03 — hai cửa. Thông báo nói rõ thiếu cửa nào để quản trị viên biết phải cấp gì,
  // thay vì một chữ "Forbidden" rồi cả hai bên ngồi đoán.
  if (!(await checkPermission("leads:view-all"))) {
    return NextResponse.json(
      { ok: false, error: "Không có quyền xem danh sách lead (leads:view-all)" },
      { status: 403 },
    );
  }
  if (!(await checkPermission("leads:export"))) {
    return NextResponse.json(
      { ok: false, error: "Không có quyền xuất dữ liệu lead (leads:export)" },
      { status: 403 },
    );
  }

  const { searchParams } = req.nextUrl;
  const arg = (k: string) => searchParams.get(k)?.trim() || undefined;

  const statusParam = arg("status");
  const q = arg("q");
  const centerId = arg("centerId");
  const assignedToId = arg("assignedToId");
  const source = arg("source");
  const dateFrom = arg("dateFrom");
  const dateTo = arg("dateTo");

  // NỢ #11 (search-oracle) — chỉ cho tìm theo SĐT khi actor thấy được SĐT thật. Quản
  // lý cơ sở CÓ `leads:export` nhưng KHÔNG có `leads:view-pii` (gỡ 22/08/2026), nên
  // đây không phải nhánh lý thuyết: đó chính là người bấm nút này hằng ngày.
  const [canViewPii, piiDetail] = await Promise.all([
    canViewLeadPii(),
    checkPermissionDetail("leads:view-pii"),
  ]);
  const canSearchPhone = canViewPii && !piiDetail.fieldMask.includes("phone");

  const where = buildLeadExportWhere({
    status: statusParam,
    q,
    centerId,
    assignedToId,
    source,
    dateFrom,
    dateTo,
    canSearchPhone,
  });

  // #11 T2 — export CÁCH LY CƠ SỞ: Lead ∈ SCOPED_MODELS → sdb.lead tự chèn
  // `centerId IN visible` (QLCS@CS1 không xuất được lead CS2; SUPER_ADMIN/HO = ALL).
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  // Đếm TRƯỚC khi đọc: không có con số này thì không thể nói "tệp thiếu bao nhiêu
  // khách", và cảnh báo "có thể bị cắt" chung chung thì người dùng bỏ qua.
  const totalMatching = await sdb.lead.count({ where });

  // Đọc theo LÔ bằng con trỏ. Một `findMany` 20.000 dòng giữ cả tập trong bộ nhớ
  // Postgres lẫn Node cùng lúc — trên hàm serverless đó là đường chết bộ nhớ.
  // `orderBy` phải có `id` làm khoá phá hoà: `createdAt` KHÔNG duy nhất, và con trỏ
  // trên thứ tự không xác định sẽ bỏ sót/lặp dòng ở ranh giới lô mà không báo gì.
  const leads: LeadExportLead[] = [];
  let cursorId: string | undefined;
  while (leads.length < LEAD_EXPORT_MAX_ROWS) {
    const take = Math.min(LEAD_EXPORT_BATCH_SIZE, LEAD_EXPORT_MAX_ROWS - leads.length);
    const batch = await sdb.lead.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: {
        id: true,
        parentName: true,
        phone: true,
        email: true,
        childName: true,
        childAge: true,
        status: true,
        source: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        note: true,
        createdAt: true,
        center: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
    });
    if (batch.length === 0) break;
    // Che NGAY tại đây: không giữ bản thô nào trong mảng sẽ đi vào tệp.
    for (const l of batch) leads.push(maskLeadPiiFields(l, canViewPii));
    cursorId = batch[batch.length - 1]!.id;
    if (batch.length < take) break;
  }

  // Tên cơ sở / tên sale cho sheet thông tin (bộ lọc trên URL là id, người đọc tệp
  // không tra id được). Center/User không thuộc SCOPED_MODELS → sdb = db ở đây.
  const [centerRow, saleRow] = await Promise.all([
    centerId
      ? sdb.center.findUnique({ where: { id: centerId }, select: { name: true } })
      : Promise.resolve(null),
    assignedToId
      ? sdb.user.findUnique({ where: { id: assignedToId }, select: { name: true } })
      : Promise.resolve(null),
  ]);

  const now = new Date();
  const { actorId, actorName } = getAuditActor(session);
  const watermark = exportWatermark(actorName, actorId, leads.length, now);
  const truncationWarning = leadExportTruncationWarning(totalMatching, leads.length);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(buildLeadExportSheet({ leads, totalMatching })),
    "Danh sach lead",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(
      buildLeadExportInfoSheet({
        totalMatching,
        exported: leads.length,
        filters: {
          status: statusParam as never,
          q,
          centerName: centerRow?.name ?? centerId,
          assignedToName: saleRow?.name ?? assignedToId,
          source,
          dateFrom,
          dateTo,
          canSearchPhoneApplied: canSearchPhone,
        },
        canViewPii,
        watermark,
      }),
    ),
    "Thong tin xuat",
  );

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  // Ghi vết TRƯỚC khi trả tệp: nhật ký hỏng thì lượt xuất này không được đi tiếp. Một
  // lượt mang danh sách khách ra ngoài mà không có dấu vết là thứ không chấp nhận
  // được — khác hẳn các chỗ audit "việc phụ" khác trong kho.
  await writeAudit({
    actor: { id: actorId, name: actorName },
    module: "leads",
    entityType: "Lead",
    entityId: "export",
    action: "EXPORT",
    // Lọc đúng một cơ sở ⇒ neo nhật ký vào cơ sở đó để quản lý cơ sở soi được lượt
    // xuất của người mình quản. Không lọc cơ sở thì để trống — gán bừa một cơ sở là
    // nói dối về phạm vi của lượt xuất.
    orgUnitId: centerId ?? null,
    newValues: {
      spec: "G-03",
      format: "xlsx",
      status: statusParam ?? "ALL",
      q: q ?? null,
      centerId: centerId ?? null,
      assignedToId: assignedToId ?? null,
      source: source ?? null,
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      // `count` giữ nguyên tên cũ để truy vấn nhật ký cũ không gãy.
      count: leads.length,
      totalMatching,
      truncated: truncationWarning !== null,
      missingRows: Math.max(0, totalMatching - leads.length),
      piiMasked: !canViewPii,
      phoneSearchApplied: canSearchPhone,
    },
  });

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${leadExportFileName(now)}"`,
      // Tệp chứa dữ liệu khách hàng — không để proxy/trình duyệt giữ lại bản sao.
      "Cache-Control": "no-store",
    },
  });
}
