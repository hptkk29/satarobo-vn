// R7-05 — unit cho phần THUẦN của convert v2 (guard, dedupe, codegen). DB-touching
// (convertLeadV2 transaction) để cho e2e/integration.
import { describe, it, expect } from "vitest";
import { evaluatePaymentGuard } from "@/lib/crm/convert-lead-v2";
import { normalizeName, classifyParentMatch, studentMatches } from "@/lib/crm/dedupe";
import {
  randomStudentCodeBody,
  formatStudentCodeV2,
  STUDENT_CODE_V2_CHARSET,
} from "@/lib/codegen";

describe("[R7-05] evaluatePaymentGuard (AC1/C1/C3 + BUG-005)", () => {
  it("có khoản KT XÁC NHẬN (CONFIRMED) → pass (không scholarship)", () => {
    expect(evaluatePaymentGuard({ hasConfirmedPayment: true, totalFinalPrice: 9_000_000 })).toEqual({
      ok: true,
      scholarshipFull: false,
    });
  });
  it("0 khoản + finalPrice=0 → pass + scholarshipFull (audit)", () => {
    expect(evaluatePaymentGuard({ hasConfirmedPayment: false, totalFinalPrice: 0 })).toEqual({
      ok: true,
      scholarshipFull: true,
    });
  });
  it("0 khoản CONFIRMED + finalPrice>0 → PAYMENT_REQUIRED", () => {
    expect(evaluatePaymentGuard({ hasConfirmedPayment: false, totalFinalPrice: 9_000_000 }).ok).toBe(false);
  });
});

describe("[R7-05] dedupe parent 3 nhánh (AC3/C6)", () => {
  it("không khớp → none", () => {
    expect(classifyParentMatch(null, null)).toEqual({ kind: "none" });
  });
  it("cả 2 khớp cùng hồ sơ → reuse", () => {
    expect(classifyParentMatch("u1", "u1")).toEqual({ kind: "reuse", userId: "u1" });
  });
  it("chỉ 1 khớp → reuse", () => {
    expect(classifyParentMatch("u1", null)).toEqual({ kind: "reuse", userId: "u1" });
    expect(classifyParentMatch(null, "u2")).toEqual({ kind: "reuse", userId: "u2" });
  });
  it("email∈A & phone∈B khác nhau → conflict", () => {
    expect(classifyParentMatch("uA", "uB")).toEqual({ kind: "conflict", parentAId: "uA", parentBId: "uB" });
  });
});

describe("[R7-05] normalize + student match (AC4/C7)", () => {
  it("normalizeName: trim + gộp space + casefold", () => {
    expect(normalizeName("  Nguyễn   Văn  A ")).toBe("nguyễn văn a");
  });
  it("studentMatches: cùng tên chuẩn hoá + DOB → true", () => {
    const dob = new Date("2016-05-10");
    expect(studentMatches({ name: " nguyễn  văn a ", dob }, { name: "Nguyễn Văn A", dob })).toBe(true);
  });
  it("studentMatches: khác DOB → false", () => {
    expect(
      studentMatches(
        { name: "A", dob: new Date("2016-05-10") },
        { name: "A", dob: new Date("2017-05-10") },
      ),
    ).toBe(false);
  });
});

describe("[R7-05] genStudentCodeV2 format/charset (AC6/C9)", () => {
  it("body 6 ký tự thuộc charset không nhập nhằng (không I/L/O/0/1)", () => {
    const body = randomStudentCodeBody(() => 0.5);
    expect(body).toHaveLength(6);
    expect([...body].every((c) => STUDENT_CODE_V2_CHARSET.includes(c))).toBe(true);
    expect(/[ILO01]/.test(STUDENT_CODE_V2_CHARSET)).toBe(false);
  });
  it("format CS1-YY-XXXXXX", () => {
    const code = formatStudentCodeV2("CS1", "AB3K9P", new Date("2026-01-01"));
    expect(code).toBe("CS1-26-AB3K9P");
  });
});
