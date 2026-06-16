/**
 * R7-05 — Convert v2: guard payment + multi-student + dedupe + consent + mã HV v2.
 * Postgres LOCAL (.env.test). Skeleton theo test plan §8 (RTM AC1..AC6 + rollback).
 *
 * Phần THUẦN (guard / dedupe classify / codegen format) chạy ngay; phần cần seed
 * dữ liệu THẬT (convert end-to-end) để `test.fixme` — bổ sung seed ở bước sau.
 */
import { test, expect } from "@playwright/test";
import { resetDb } from "../_helpers/seed";
import { evaluatePaymentGuard } from "../../../lib/crm/convert-lead-v2";
import {
  classifyParentMatch,
  normalizeName,
  normalizePhone,
  studentMatches,
} from "../../../lib/crm/dedupe";
import {
  formatStudentCodeV2,
  randomStudentCodeBody,
  STUDENT_CODE_V2_CHARSET,
} from "../../../lib/codegen";
import { isConvertV2Enabled } from "../../../lib/flags";

test.describe("[R7-05] Convert v2", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  // ── AC1 / C1-C3 — guard PAYMENT_REQUIRED ──────────────────────────────────
  test("[R7-05-C1] 0 khoản ghi nhận & tổng > 0 → guard FAIL (PAYMENT_REQUIRED)", () => {
    expect(evaluatePaymentGuard({ hasRecordedPayment: false, totalFinalPrice: 5_000_000 }))
      .toEqual({ ok: false });
  });

  test("[R7-05-C2] có khoản ghi nhận → guard PASS (kể cả KT chưa confirm)", () => {
    expect(evaluatePaymentGuard({ hasRecordedPayment: true, totalFinalPrice: 5_000_000 }))
      .toEqual({ ok: true, scholarshipFull: false });
  });

  test("[R7-05-C3] tổng phải-thu = 0 → guard PASS + cờ học bổng toàn phần", () => {
    expect(evaluatePaymentGuard({ hasRecordedPayment: false, totalFinalPrice: 0 }))
      .toEqual({ ok: true, scholarshipFull: true });
  });

  // ── AC3 / C6 — dedupe parent 3 nhánh ──────────────────────────────────────
  test("[R7-05-dedupe] classifyParentMatch: none / reuse / conflict", () => {
    expect(classifyParentMatch(null, null)).toEqual({ kind: "none" });
    expect(classifyParentMatch("u1", null)).toEqual({ kind: "reuse", userId: "u1" });
    expect(classifyParentMatch(null, "u2")).toEqual({ kind: "reuse", userId: "u2" });
    expect(classifyParentMatch("u1", "u1")).toEqual({ kind: "reuse", userId: "u1" });
    expect(classifyParentMatch("uA", "uB")).toEqual({
      kind: "conflict",
      parentAId: "uA",
      parentBId: "uB",
    });
  });

  // ── AC4 / C7 — dedupe student (tên chuẩn hoá + DOB) ───────────────────────
  test("[R7-05-C7] student trùng theo tên chuẩn hoá + DOB", () => {
    expect(normalizeName("  Nguyễn  Văn A ")).toBe("nguyễn văn a");
    expect(normalizePhone("0905.123.456")).toBe("0905123456");
    const dob = new Date("2015-05-01");
    expect(studentMatches({ name: " nguyễn  văn a ", dob }, { name: "Nguyễn Văn A", dob })).toBe(true);
    expect(studentMatches({ name: "Nguyễn Văn A", dob }, { name: "Nguyễn Văn B", dob })).toBe(false);
  });

  // ── AC6 / C9 — mã HV v2 format + charset ──────────────────────────────────
  test("[R7-05-C9] mã v2 đúng format CS-YY-RANDOM + charset không nhập nhằng", () => {
    const body = randomStudentCodeBody(() => 0); // ký tự đầu charset
    expect(body).toHaveLength(6);
    expect([...body].every((ch) => STUDENT_CODE_V2_CHARSET.includes(ch))).toBe(true);
    const code = formatStudentCodeV2("CS1", "AB3K9P", new Date("2026-01-01"));
    expect(code).toBe("CS1-26-AB3K9P");
    // charset không nhập nhằng CHỈ áp cho thân mã ngẫu nhiên — phần CS code (vd "CS1")
    // do người đặt, có thể chứa số. Kiểm I/L/O/0/1 trên body, không trên cả mã.
    expect(body).not.toMatch(/[ILO01]/); // bỏ ký tự dễ nhầm
  });

  test("[R7-05-C11] flag CONVERT_V2_ENABLED đọc từ env (mặc định OFF)", () => {
    const prev = process.env.CONVERT_V2_ENABLED;
    process.env.CONVERT_V2_ENABLED = "true";
    expect(isConvertV2Enabled()).toBe(true);
    process.env.CONVERT_V2_ENABLED = "false";
    expect(isConvertV2Enabled()).toBe(false);
    process.env.CONVERT_V2_ENABLED = prev;
  });

  // ── End-to-end (cần seed Lead REGISTERED + payment + class + discount) ─────
  // TODO(R7-05): seed dữ liệu thật rồi gỡ fixme.
  test.fixme("[R7-05-C4] convert 2 con — lỗi giữa chừng rollback cả 2 (tx)", () => {});
  test.fixme("[R7-05-C5] double-submit + 2 sale song song → 1 bộ record (idempotency)", () => {});
  test.fixme("[R7-05-C6] email∈A & phone∈B → ConvertConflict OPEN + khoá convert", () => {});
  test.fixme("[R7-05-C8] consent per con → StudentConsent + audit actor/time", () => {});
  test.fixme("[R7-05-C10] sửa mã: CENTER_MANAGER chặn / SUPER_ADMIN OK+audit+reason", () => {});
});
