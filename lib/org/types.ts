// lib/org/types.ts — Domain types cho OrgUnit (Doc 15 §2.1, ticket A0-01).
// Lớp domain THUẦN (không phụ thuộc Prisma) để unit-test được mà không cần DB.

export const ORG_UNIT_TYPES = [
  "ROOT",
  "HO",
  "CENTER",
  "CAMPUS",
  "PARTNER",
  "FRANCHISE",
] as const;

export type OrgUnitType = (typeof ORG_UNIT_TYPES)[number];

/** Node tối giản dùng cho các thuật toán cây (pure). DB model map về kiểu này. */
export type OrgUnitNode = {
  id: string;
  code: string;
  type: OrgUnitType;
  parentId: string | null;
  /** Chỉ set cho type CENTER — trỏ tới Center cũ (Phase A). */
  centerId?: string | null;
  isActive?: boolean;
  deletedAt?: Date | null;
};

/** Lỗi nghiệp vụ OrgUnit — code (EN) + message (VI) theo Doc 15 §13.5. */
export class OrgRuleError extends Error {
  readonly code: string;
  readonly field?: string;
  constructor(code: string, message: string, field?: string) {
    super(message);
    this.name = "OrgRuleError";
    this.code = code;
    this.field = field;
  }
}
