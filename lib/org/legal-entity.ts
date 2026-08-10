// lib/org/legal-entity.ts — Nền Hệ thống P1 · US-06: pháp nhân TÁCH khỏi đơn vị vận hành.
//
// VÌ SAO TÁCH (BA §2.3): học phí thu ở cơ sở nhượng quyền thuộc pháp nhân CỦA HỌ, không
// phải doanh thu của SataRobo. Nếu doanh thu chỉ gắn `orgUnitId` thì ngày ký hợp đồng
// franchise đầu tiên là phải sửa bảng. Đây là ranh giới PHÁP LÝ, không phải tuỳ chọn hiển thị.
//
// Quan hệ: 1 LegalEntity ↔ N OrgUnit; 1 OrgUnit ↔ ĐÚNG 1 LegalEntity (FK trên OrgUnit).

import { Prisma, type LegalEntity } from "@prisma/client";
import { db } from "@/lib/db";
import { isOrgUnitActiveAt } from "./status";
import { OrgRuleError, type OrgUnitNode, type OrgUnitType } from "./types";

/** MST Việt Nam: 10 số, hoặc 10 số + "-" + 3 số (đơn vị phụ thuộc). */
export const TAX_CODE_RE = /^\d{10}(-\d{3})?$/;

export type CreateLegalEntityInput = {
  taxCode: string;
  legalName: string;
  address?: string | null;
  isPrimary?: boolean;
};

export type UpdateLegalEntityInput = Partial<{
  taxCode: string;
  legalName: string;
  address: string | null;
  isPrimary: boolean;
  isActive: boolean;
}>;

export function validateTaxCode(raw: string): string {
  const code = (raw ?? "").trim();
  if (code.length === 0) {
    throw new OrgRuleError("LEGAL_TAXCODE_REQUIRED", "Mã số thuế không được để trống.", "taxCode");
  }
  if (!TAX_CODE_RE.test(code)) {
    throw new OrgRuleError(
      "LEGAL_TAXCODE_INVALID",
      "Mã số thuế phải là 10 chữ số, hoặc 10 chữ số + '-' + 3 chữ số (đơn vị phụ thuộc).",
      "taxCode",
    );
  }
  return code;
}

function requireLegalName(raw: string): string {
  const n = (raw ?? "").trim();
  if (n.length === 0) {
    throw new OrgRuleError("LEGAL_NAME_REQUIRED", "Tên pháp nhân không được để trống.", "legalName");
  }
  return n;
}

/**
 * AC2 — pháp nhân gốc `isPrimary` DUY NHẤT.
 * DB đã có partial unique index chặn cứng (migration 20260811030000); hàm này hạ cờ pháp
 * nhân gốc cũ TRONG CÙNG transaction để thao tác "đặt cái mới làm gốc" không đâm vào index.
 */
async function demoteOtherPrimaries(
  tx: Prisma.TransactionClient,
  keepId: string | null,
): Promise<void> {
  await tx.legalEntity.updateMany({
    where: { isPrimary: true, deletedAt: null, ...(keepId ? { id: { not: keepId } } : {}) },
    data: { isPrimary: false },
  });
}

export async function createLegalEntity(input: CreateLegalEntityInput): Promise<LegalEntity> {
  const taxCode = validateTaxCode(input.taxCode);
  const legalName = requireLegalName(input.legalName);

  try {
    return await db.$transaction(async (tx) => {
      // Hạ cờ pháp nhân gốc CŨ TRƯỚC khi tạo cái mới. Làm ngược lại thì INSERT đâm thẳng
      // vào partial unique index `LegalEntity_isPrimary_unique` và Prisma ném P2002 —
      // vốn đang được dịch thành "trùng mã số thuế", tức báo sai hẳn nguyên nhân.
      if (input.isPrimary) await demoteOtherPrimaries(tx, null);
      return tx.legalEntity.create({
        data: {
          taxCode,
          legalName,
          address: input.address ?? null,
          isPrimary: input.isPrimary ?? false,
        },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new OrgRuleError(
        "LEGAL_TAXCODE_CONFLICT",
        `Mã số thuế "${taxCode}" đã tồn tại.`,
        "taxCode",
      );
    }
    throw e;
  }
}

export async function getLegalEntity(id: string): Promise<LegalEntity | null> {
  const row = await db.legalEntity.findUnique({ where: { id } });
  return row && row.deletedAt == null ? row : null;
}

export async function listLegalEntities(
  opts: { includeDeleted?: boolean } = {},
): Promise<LegalEntity[]> {
  return db.legalEntity.findMany({
    where: opts.includeDeleted ? {} : { deletedAt: null },
    orderBy: [{ isPrimary: "desc" }, { legalName: "asc" }],
  });
}

export async function updateLegalEntity(
  id: string,
  input: UpdateLegalEntityInput,
): Promise<LegalEntity> {
  const self = await getLegalEntity(id);
  if (!self) throw new OrgRuleError("LEGAL_NOT_FOUND", "Không tìm thấy pháp nhân.", "id");

  const data: Prisma.LegalEntityUpdateInput = {};
  if (input.taxCode !== undefined) data.taxCode = validateTaxCode(input.taxCode);
  if (input.legalName !== undefined) data.legalName = requireLegalName(input.legalName);
  if (input.address !== undefined) data.address = input.address;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.isPrimary !== undefined) data.isPrimary = input.isPrimary;

  try {
    return await db.$transaction(async (tx) => {
      // Hạ cờ pháp nhân gốc CŨ TRƯỚC khi nâng cái mới — ngược lại là đâm partial unique index.
      if (input.isPrimary === true) await demoteOtherPrimaries(tx, id);
      return tx.legalEntity.update({ where: { id }, data });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new OrgRuleError("LEGAL_TAXCODE_CONFLICT", "Mã số thuế đã tồn tại.", "taxCode");
    }
    throw e;
  }
}

/**
 * AC3 — KHÔNG xoá được pháp nhân còn đơn vị ACTIVE trỏ vào; lỗi kèm DANH SÁCH đơn vị chặn
 * (TS-06 đòi đúng điều đó: "từ chối kèm danh sách đơn vị chặn").
 *
 * "ACTIVE" ở đây đi qua `isOrgUnitActiveAt` — MỘT định nghĩa duy nhất (lib/org/status.ts),
 * chứ không tự viết lại điều kiện. Đơn vị đã CLOSED/xoá mềm không chặn.
 */
export async function softDeleteLegalEntity(id: string): Promise<LegalEntity> {
  const self = await getLegalEntity(id);
  if (!self) throw new OrgRuleError("LEGAL_NOT_FOUND", "Không tìm thấy pháp nhân.", "id");

  const rows = await db.orgUnit.findMany({
    where: { legalEntityId: id },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      parentId: true,
      isActive: true,
      deletedAt: true,
      status: true,
      effectiveFrom: true,
      effectiveTo: true,
    },
  });

  const now = new Date();
  const blocking = rows.filter((r) =>
    isOrgUnitActiveAt(
      {
        id: r.id,
        code: r.code,
        type: r.type as OrgUnitType,
        parentId: r.parentId,
        isActive: r.isActive,
        deletedAt: r.deletedAt,
        status: r.status,
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
      } satisfies OrgUnitNode,
      now,
    ),
  );

  if (blocking.length > 0) {
    throw new OrgRuleError(
      "LEGAL_HAS_ACTIVE_ORG_UNITS",
      `Không thể xoá pháp nhân: còn ${blocking.length} đơn vị đang hoạt động trỏ vào — ` +
        blocking.map((b) => `${b.code} (${b.name})`).join(", "),
      "id",
    );
  }

  return db.legalEntity.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
}
