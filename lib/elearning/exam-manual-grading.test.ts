// @vitest-environment node
/**
 * EL-14e — chấm tay.
 *
 * Đây là LỐI RA của `PENDING_GRADE`. Hỏng ở đây có hai hướng, và hướng nào cũng đi
 * thẳng vào hồ sơ nhân sự:
 *  · chốt điểm khi chưa chấm đủ ⇒ người học bị trượt vì một câu chưa ai đọc;
 *  · nhận điểm vượt thang ⇒ người trượt thật bỗng "đạt".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActionError } from "@/lib/actions/factory";
import {
  cauHinhChamLuotThi,
  chamLuotThiSchema,
} from "@/lib/elearning/exam-manual-grading";

const h = vi.hoisted(() => ({ ghiXong: vi.fn(async () => undefined) }));
vi.mock("@/lib/elearning/exam-taking", () => ({ ghiXongBaiThi: h.ghiXong }));

type Ban = {
  luot: unknown;
  cacCau: { id: string; points: number; question: { type: string } }[];
  traLoiTruoc: { examQuestionId: string; score: number | null }[];
  traLoiSau: { examQuestionId: string; score: number | null }[];
  ghiDanh: unknown;
  upsert: ReturnType<typeof vi.fn<(a: unknown) => Promise<unknown>>>;
  update: ReturnType<typeof vi.fn<(a: unknown) => Promise<unknown>>>;
};
let b: Ban;

const dbGia = () => {
  let lanDoc = 0;
  const api = {
    trnExamAttempt: { findFirst: vi.fn(async () => b.luot), update: b.update },
    trnExamQuestion: { findMany: vi.fn(async () => b.cacCau) },
    trnExamAnswer: {
      findMany: vi.fn(async () => (lanDoc++ === 0 ? b.traLoiTruoc : b.traLoiSau)),
      upsert: b.upsert,
    },
    trnEnrollment: { findFirst: vi.fn(async () => b.ghiDanh) },
  };
  return {
    ...api,
    $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(api),
  } as never;
};

const actor = { userId: "gv1" } as never;

async function batLoi(p: Promise<unknown>): Promise<ActionError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ActionError) return e;
    throw e;
  }
  throw new Error("phải ném ActionError");
}

const cham = (input: Record<string, unknown> = {}) =>
  cauHinhChamLuotThi.handler({
    db: dbGia(),
    actor,
    input: {
      attemptId: "lt1",
      diem: [{ examQuestionId: "eq2", score: 4 }],
      ...input,
    },
  } as never);

beforeEach(() => {
  vi.clearAllMocks();
  b = {
    luot: {
      id: "lt1",
      examId: "de1",
      userId: "u1",
      enrollmentId: "en1",
      status: "PENDING_GRADE",
      attemptNo: 1,
      exam: { passScore: 6 },
    },
    cacCau: [
      { id: "eq1", points: 4, question: { type: "SINGLE" } },
      { id: "eq2", points: 4, question: { type: "ESSAY" } },
    ],
    traLoiTruoc: [
      { examQuestionId: "eq1", score: 4 },
      { examQuestionId: "eq2", score: null },
    ],
    traLoiSau: [
      { examQuestionId: "eq1", score: 4 },
      { examQuestionId: "eq2", score: 4 },
    ],
    ghiDanh: { courseId: "c1" },
    upsert: vi.fn(async (_a: unknown) => ({})),
    update: vi.fn(async (_a: unknown) => ({})),
  };
});

describe("chấm xong thì CHỐT lượt", () => {
  it("ghi điểm, tính lại tổng, đóng `GRADED`", async () => {
    const r = (await cham()) as { data: { totalScore: number; passed: boolean } };
    expect(r.data.totalScore).toBe(8);
    expect(r.data.passed).toBe(true);
    const arg = b.update.mock.calls[0]![0] as {
      data: { status: string; gradedByUserId: string; passed: boolean };
    };
    expect(arg.data.status).toBe("GRADED");
    // Ghi AI chấm — con số này đi vào hồ sơ nhân sự, phải có tên người.
    expect(arg.data.gradedByUserId).toBe("gv1");
  });

  it("tính lại trên TOÀN BỘ câu, không chỉ phần vừa chấm", async () => {
    // Chỉ cộng phần vừa chấm là bỏ mất điểm câu trắc nghiệm đã chấm máy.
    b.traLoiSau = [
      { examQuestionId: "eq1", score: 4 },
      { examQuestionId: "eq2", score: 1 },
    ];
    const r = (await cham({ diem: [{ examQuestionId: "eq2", score: 1 }] })) as {
      data: { totalScore: number; passed: boolean };
    };
    expect(r.data.totalScore).toBe(5);
    expect(r.data.passed).toBe(false);
  });

  it("ĐẠT ⇒ bài học lên xong, đi CÙNG đường với lượt chấm máy", async () => {
    await cham();
    expect(h.ghiXong).toHaveBeenCalledTimes(1);
  });

  it("KHÔNG đạt ⇒ không ghi bài là xong", async () => {
    b.traLoiSau = [
      { examQuestionId: "eq1", score: 0 },
      { examQuestionId: "eq2", score: 1 },
    ];
    await cham({ diem: [{ examQuestionId: "eq2", score: 1 }] });
    expect(h.ghiXong).not.toHaveBeenCalled();
  });
});

describe("🔴 không chốt khi CHƯA CHẤM ĐỦ", () => {
  it("còn câu chưa cho điểm ⇒ từ chối, nói rõ còn mấy câu", async () => {
    // Chốt sớm là để người học trượt vì một câu chưa ai đọc — và con số đó đi vào
    // hồ sơ nhân sự.
    b.cacCau = [
      { id: "eq1", points: 4, question: { type: "SINGLE" } },
      { id: "eq2", points: 4, question: { type: "ESSAY" } },
      { id: "eq3", points: 4, question: { type: "ESSAY" } },
    ];
    b.traLoiTruoc = [
      { examQuestionId: "eq1", score: 4 },
      { examQuestionId: "eq2", score: null },
      { examQuestionId: "eq3", score: null },
    ];
    const e = await batLoi(cham());
    expect(e.code).toBe("CHUA_CHAM_DU");
    expect(e.message).toContain("1");
    expect(b.update).not.toHaveBeenCalled();
  });

  it("câu người học BỎ TRỐNG vẫn tính 0, không giữ lượt treo mãi", async () => {
    // Không có dòng trả lời nào cho một câu là "bỏ trống", không phải "chưa chấm".
    b.traLoiSau = [{ examQuestionId: "eq1", score: 4 }];
    const r = (await cham()) as { data: { totalScore: number } };
    expect(r.data.totalScore).toBe(4);
  });
});

describe("🔴 không nhận điểm VƯỢT THANG", () => {
  it("điểm lớn hơn điểm câu ⇒ từ chối", async () => {
    // Một lỗi gõ phím đẩy tổng vượt `maxScore`, và người trượt thật bỗng "đạt".
    const e = await batLoi(cham({ diem: [{ examQuestionId: "eq2", score: 99 }] }));
    expect(e.code).toBe("DIEM_VUOT_THANG");
    expect(e.message).toContain("4");
    expect(b.upsert).not.toHaveBeenCalled();
  });

  it("điểm âm bị Zod chặn", () => {
    const r = chamLuotThiSchema.safeParse({
      attemptId: "lt1",
      diem: [{ examQuestionId: "eq2", score: -1 }],
    });
    expect(r.success).toBe(false);
  });

  it("điểm BẰNG thang thì nhận", async () => {
    await cham({ diem: [{ examQuestionId: "eq2", score: 4 }] });
    expect(b.upsert).toHaveBeenCalledTimes(1);
  });
});

describe("🔴 không sửa điểm câu CHẤM MÁY ở đây", () => {
  it("cho điểm một câu trắc nghiệm ⇒ từ chối", async () => {
    // Mở đường ghi đè im lặng lên kết quả máy là để hai lượt cùng đề được chấm bằng
    // hai thang khác nhau.
    const e = await batLoi(cham({ diem: [{ examQuestionId: "eq1", score: 0 }] }));
    expect(e.code).toBe("CAU_DA_CHAM_MAY");
  });

  it("câu ngoài đề ⇒ từ chối", async () => {
    const e = await batLoi(cham({ diem: [{ examQuestionId: "eq-la", score: 1 }] }));
    expect(e.code).toBe("CAU_NGOAI_DE");
  });
});

describe("🔴 chỉ chấm lượt ĐANG CHỜ", () => {
  it("lượt đã GRADED ⇒ từ chối, nói rõ cần đường riêng", async () => {
    // Sửa một con số đã nằm trong hồ sơ nhân sự cần lý do và dấu vết, không phải
    // cùng nút với lần chấm đầu.
    b.luot = { ...(b.luot as object), status: "GRADED" };
    const e = await batLoi(cham());
    expect(e.code).toBe("LUOT_KHONG_CHO_CHAM");
    expect(e.message).toContain("đường riêng");
  });

  it("lượt còn ĐANG LÀM ⇒ từ chối", async () => {
    b.luot = { ...(b.luot as object), status: "IN_PROGRESS" };
    const e = await batLoi(cham());
    expect(e.code).toBe("LUOT_KHONG_CHO_CHAM");
  });

  it("lượt ngoài phạm vi cơ sở ⇒ NOT_FOUND", async () => {
    b.luot = null;
    const e = await batLoi(cham());
    expect(e.code).toBe("NOT_FOUND");
  });
});

describe("audit và quyền", () => {
  it("KHÔNG ghi nhận xét vào audit", async () => {
    // Nhận xét là lời về bài làm của một người; nhật ký audit đọc được rộng hơn màn
    // chấm.
    const r = (await cham({
      feedback: "Bài viết lan man, thiếu bước kiểm tra an toàn",
      diem: [{ examQuestionId: "eq2", score: 4, note: "Thiếu ý 2" }],
    })) as { newValues: Record<string, unknown> };
    const s = JSON.stringify(r.newValues);
    expect(s).not.toContain("lan man");
    expect(s).not.toContain("Thiếu ý 2");
  });

  it("dùng khoá quyền RIÊNG cho chấm bài", () => {
    expect(cauHinhChamLuotThi.permission).toBe("elearning:exam:grade");
  });
});
