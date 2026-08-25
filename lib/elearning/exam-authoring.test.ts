// @vitest-environment node
/**
 * EL-14c — dựng đề thi.
 *
 * Ranh giới nháp / đã-kích-hoạt là thứ phải giữ chặt nhất ở đây. Sửa bộ câu hay
 * điểm của một đề đã có người thi làm LỆCH ĐIỂM của mọi lượt đã chấm, im lặng — và
 * điểm đó nằm trong hồ sơ nhân sự.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActionError } from "@/lib/actions/factory";
import {
  taoDeSchema,
  sapXepDeSchema,
  cauHinhTaoDe,
  cauHinhThemCauVaoDe,
  cauHinhGoCauKhoiDe,
  cauHinhSapXepDe,
  cauHinhKichHoatDe,
  cauHinhGanDeVaoBai,
} from "@/lib/elearning/exam-authoring";

const h = vi.hoisted(() => ({
  orgUnitId: vi.fn<(c: string | null) => Promise<string | null>>(async () => "ou1"),
}));
vi.mock("@/lib/org/org-service", () => ({ orgUnitIdForCenter: h.orgUnitId }));

const DE_NEN = {
  title: "An toàn lao động — kiểm tra cuối",
  courseId: "c1",
  durationMin: 30,
  passScore: 8,
  maxAttempts: 3,
  cooldownHours: 24,
};

type Ban = {
  de: unknown;
  bai: unknown;
  khoa: unknown;
  cau: unknown;
  eq: unknown;
  dsCau: { points: number }[];
  dsEq: { id: string }[];
  soCau: number;
  createDe: ReturnType<typeof vi.fn<(a: unknown) => Promise<{ id: string }>>>;
  createEq: ReturnType<typeof vi.fn<(a: unknown) => Promise<{ id: string }>>>;
  updateDe: ReturnType<typeof vi.fn<(a: unknown) => Promise<unknown>>>;
  updateEq: ReturnType<typeof vi.fn<(a: unknown) => Promise<unknown>>>;
  delEq: ReturnType<typeof vi.fn<(a: unknown) => Promise<unknown>>>;
  updateBai: ReturnType<typeof vi.fn<(a: unknown) => Promise<unknown>>>;
};
let b: Ban;

const dbGia = () => {
  const eqApi = {
    findFirst: vi.fn(async () => b.eq),
    // ⚠️ Trả theo ĐÚNG `select` được hỏi. Bản đầu viết
    // `b.dsCau.length ? b.dsCau : b.dsEq` — mock tự rơi về danh sách khác khi
    // danh sách điểm rỗng, tức nó NÓI DỐI đúng ở ca "đề rỗng" mà test đang canh.
    findMany: vi.fn(async (a: { select?: Record<string, unknown> }) =>
      a?.select && "points" in a.select ? b.dsCau : b.dsEq,
    ),
    count: vi.fn(async () => b.soCau),
    create: b.createEq,
    update: b.updateEq,
    delete: b.delEq,
  };
  return {
    trnExam: { findFirst: vi.fn(async () => b.de), create: b.createDe, update: b.updateDe },
    trnQuestion: { findFirst: vi.fn(async () => b.cau) },
    trnLesson: { findFirst: vi.fn(async () => b.bai), update: b.updateBai },
    trnCourse: { findFirst: vi.fn(async () => b.khoa) },
    trnExamQuestion: eqApi,
    $transaction: async (fn: (t: unknown) => Promise<unknown>) =>
      fn({ trnExamQuestion: eqApi }),
  } as never;
};

const actorHO = { userId: "u1", isHoLevel: true, visibleCenterIds: [] } as never;

async function batLoi(p: Promise<unknown>): Promise<ActionError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ActionError) return e;
    throw e;
  }
  throw new Error("phải ném ActionError");
}

const deNhap = { id: "de1", title: "x", isActive: false, passScore: 8, maxScore: 0, _count: { attempts: 0 } };

beforeEach(() => {
  vi.clearAllMocks();
  h.orgUnitId.mockResolvedValue(null);
  b = {
    de: { ...deNhap },
    bai: null,
    khoa: { id: "c1" },
    cau: { id: "q1", defaultPoints: 2, stem: "..." },
    eq: { id: "eq1", orderIndex: 0 },
    dsCau: [],
    dsEq: [{ id: "eq1" }, { id: "eq2" }, { id: "eq3" }],
    soCau: 0,
    createDe: vi.fn(async (_a: unknown) => ({ id: "de-moi" })),
    createEq: vi.fn(async (_a: unknown) => ({ id: "eq-moi" })),
    updateDe: vi.fn(async (_a: unknown) => ({})),
    updateEq: vi.fn(async (_a: unknown) => ({})),
    delEq: vi.fn(async (_a: unknown) => ({})),
    updateBai: vi.fn(async (_a: unknown) => ({})),
  };
});

// ── 1. Neo đề ──────────────────────────────────────────────────────────────

describe("đề gắn ĐÚNG MỘT chỗ", () => {
  it("gắn khoá học ⇒ hợp lệ; gắn bài học ⇒ hợp lệ", () => {
    expect(taoDeSchema.safeParse(DE_NEN).success).toBe(true);
    expect(
      taoDeSchema.safeParse({ ...DE_NEN, courseId: null, lessonId: "l1" }).success,
    ).toBe(true);
  });

  it("🔴 gắn CẢ HAI ⇒ từ chối", () => {
    // Hai cột cùng có giá trị = hai đường tìm đề, và báo cáo sẽ đếm đôi.
    expect(taoDeSchema.safeParse({ ...DE_NEN, lessonId: "l1" }).success).toBe(false);
  });

  it("không gắn chỗ nào ⇒ từ chối", () => {
    expect(taoDeSchema.safeParse({ ...DE_NEN, courseId: null }).success).toBe(false);
  });
});

describe("đề mới sinh ra là NHÁP, tổng điểm chưa có", () => {
  it("`isActive` false và `maxScore` 0", async () => {
    // Đặt sẵn một tổng điểm ở đây là dựng một con số không khớp bộ câu nào, và
    // không gì báo cho tới khi có người thi.
    await cauHinhTaoDe.handler({ db: dbGia(), actor: actorHO, input: DE_NEN } as never);
    const arg = b.createDe.mock.calls[0]![0] as {
      data: { isActive: boolean; maxScore: number; centerId: unknown };
    };
    expect(arg.data.isActive).toBe(false);
    expect(arg.data.maxScore).toBe(0);
    // Người Hội sở soạn đề DÙNG CHUNG.
    expect(arg.data.centerId).toBeNull();
  });
});

// ── 2. Ranh giới nháp / đã kích hoạt ───────────────────────────────────────

describe("🔴 đề ĐÃ KÍCH HOẠT thì đóng băng", () => {
  const daKichHoat = () => {
    b.de = { ...deNhap, isActive: true, maxScore: 10 };
  };

  it("không thêm câu được", async () => {
    daKichHoat();
    const e = await batLoi(
      cauHinhThemCauVaoDe.handler({
        db: dbGia(),
        actor: actorHO,
        input: { examId: "de1", questionId: "q1" },
      } as never),
    );
    expect(e.code).toBe("DE_DA_KICH_HOAT");
    expect(b.createEq).not.toHaveBeenCalled();
  });

  it("không gỡ câu được", async () => {
    daKichHoat();
    const e = await batLoi(
      cauHinhGoCauKhoiDe.handler({
        db: dbGia(),
        actor: actorHO,
        input: { examId: "de1", examQuestionId: "eq1" },
      } as never),
    );
    expect(e.code).toBe("DE_DA_KICH_HOAT");
    expect(b.delEq).not.toHaveBeenCalled();
  });

  it("không sắp xếp lại được", async () => {
    daKichHoat();
    const e = await batLoi(
      cauHinhSapXepDe.handler({
        db: dbGia(),
        actor: actorHO,
        input: { examId: "de1", thuTu: ["eq1"] },
      } as never),
    );
    expect(e.code).toBe("DE_DA_KICH_HOAT");
  });

  it("🔴 khoá theo `isActive`, KHÔNG theo 'đã có người thi chưa'", async () => {
    // Đợi tới lượt thi đầu tiên mới khoá nghĩa là người soạn sửa được đề trong
    // khoảng giữa lúc phát cho người học và lúc người đầu tiên bấm bắt đầu — và
    // hai người cùng khoá làm hai đề khác nhau mà bảng điểm coi như một.
    b.de = { ...deNhap, isActive: true, maxScore: 10, _count: { attempts: 0 } };
    const e = await batLoi(
      cauHinhThemCauVaoDe.handler({
        db: dbGia(),
        actor: actorHO,
        input: { examId: "de1", questionId: "q1" },
      } as never),
    );
    expect(e.code).toBe("DE_DA_KICH_HOAT");
  });

  it("đề NHÁP thì sửa thoải mái", async () => {
    // Vế "đừng chặn nhầm".
    await cauHinhThemCauVaoDe.handler({
      db: dbGia(),
      actor: actorHO,
      input: { examId: "de1", questionId: "q1" },
    } as never);
    expect(b.createEq).toHaveBeenCalledTimes(1);
  });
});

// ── 3. Thêm câu ────────────────────────────────────────────────────────────

describe("thêm câu vào đề", () => {
  it("lấy điểm mặc định của câu khi không nói khác", async () => {
    await cauHinhThemCauVaoDe.handler({
      db: dbGia(),
      actor: actorHO,
      input: { examId: "de1", questionId: "q1" },
    } as never);
    const arg = b.createEq.mock.calls[0]![0] as { data: { points: number } };
    expect(arg.data.points).toBe(2);
  });

  it("điểm nói riêng thì thắng điểm mặc định", async () => {
    // Điểm THẬT dùng để chấm nằm ở `TrnExamQuestion.points` — tách khỏi ngân hàng
    // để sửa câu không làm lệch điểm của lượt đã chấm.
    await cauHinhThemCauVaoDe.handler({
      db: dbGia(),
      actor: actorHO,
      input: { examId: "de1", questionId: "q1", points: 5 },
    } as never);
    const arg = b.createEq.mock.calls[0]![0] as { data: { points: number } };
    expect(arg.data.points).toBe(5);
  });

  it("câu KHÔNG thuộc phạm vi ⇒ NOT_FOUND", async () => {
    // Thêm được câu của cơ sở khác vào đề của mình là mượn đường vòng để đọc kho
    // của họ.
    b.cau = null;
    await batLoi(
      cauHinhThemCauVaoDe.handler({
        db: dbGia(),
        actor: actorHO,
        input: { examId: "de1", questionId: "q-cs2" },
      } as never),
    );
    expect(b.createEq).not.toHaveBeenCalled();
  });

  it("thêm TRÙNG câu ⇒ lỗi tiếng Việt, không phải P2002 thô", async () => {
    b.createEq = vi.fn(async () => {
      const e = new Error("Unique constraint failed on the fields: (`questionId`)") as Error & {
        code?: string;
      };
      e.code = "P2002";
      throw e;
    });
    const e = await batLoi(
      cauHinhThemCauVaoDe.handler({
        db: dbGia(),
        actor: actorHO,
        input: { examId: "de1", questionId: "q1" },
      } as never),
    );
    expect(e.code).toBe("CAU_DA_CO_TRONG_DE");
  });
});

// ── 4. Sắp xếp hai pha ─────────────────────────────────────────────────────

describe("🔴 sắp xếp lại đi bằng HAI PHA", () => {
  it("mọi câu được ghi HAI lần: dải âm rồi số thật", async () => {
    // `@@unique([examId, orderIndex])` làm mọi lượt hoán vị va khoá nếu ghi thẳng:
    // dời câu A về chỗ 0 trong khi câu B còn giữ chỗ 0.
    await cauHinhSapXepDe.handler({
      db: dbGia(),
      actor: actorHO,
      input: { examId: "de1", thuTu: ["eq3", "eq1", "eq2"] },
    } as never);
    expect(b.updateEq).toHaveBeenCalledTimes(6);
    const soPha1 = b.updateEq.mock.calls
      .slice(0, 3)
      .map((c) => (c[0] as { data: { orderIndex: number } }).data.orderIndex);
    expect(soPha1.every((x) => x < 0)).toBe(true);
    const soPha2 = b.updateEq.mock.calls
      .slice(3)
      .map((c) => (c[0] as { data: { orderIndex: number } }).data.orderIndex);
    expect(soPha2).toEqual([0, 1, 2]);
  });

  it("🔴 pha 1 phủ MỌI câu, kể cả câu KHÔNG đổi chỗ", async () => {
    // Bỏ qua câu đứng yên là để nó giữ số cũ và va với một câu vừa được dời tới
    // đúng số đó.
    await cauHinhSapXepDe.handler({
      db: dbGia(),
      actor: actorHO,
      input: { examId: "de1", thuTu: ["eq1", "eq3", "eq2"] },
    } as never);
    const idPha1 = b.updateEq.mock.calls
      .slice(0, 3)
      .map((c) => (c[0] as { where: { id: string } }).where.id);
    expect(new Set(idPha1)).toEqual(new Set(["eq1", "eq3", "eq2"]));
  });

  it("danh sách THIẾU một id ⇒ từ chối, không ghi gì", async () => {
    // Thiếu một id thì câu đó giữ `orderIndex` cũ và va khoá với câu vừa dời tới.
    const e = await batLoi(
      cauHinhSapXepDe.handler({
        db: dbGia(),
        actor: actorHO,
        input: { examId: "de1", thuTu: ["eq1", "eq2"] },
      } as never),
    );
    expect(e.code).toBe("THU_TU_KHONG_KHOP");
    expect(b.updateEq).not.toHaveBeenCalled();
  });

  it("danh sách chứa id LẠ ⇒ từ chối", async () => {
    // Thừa một id nghĩa là đang dời câu của đề khác.
    await batLoi(
      cauHinhSapXepDe.handler({
        db: dbGia(),
        actor: actorHO,
        input: { examId: "de1", thuTu: ["eq1", "eq2", "eq-cua-de-khac"] },
      } as never),
    );
    expect(b.updateEq).not.toHaveBeenCalled();
  });

  it("danh sách rỗng bị Zod chặn", () => {
    expect(sapXepDeSchema.safeParse({ examId: "de1", thuTu: [] }).success).toBe(false);
  });
});

describe("gỡ câu thì DỒN LẠI thứ tự", () => {
  it("gỡ xong ghi lại thứ tự cho liền mạch", async () => {
    // Không dồn thì lần thêm câu sau tính `orderIndex` bằng SỐ LƯỢNG và va khoá
    // duy nhất với một chỗ trống ở giữa.
    await cauHinhGoCauKhoiDe.handler({
      db: dbGia(),
      actor: actorHO,
      input: { examId: "de1", examQuestionId: "eq1" },
    } as never);
    expect(b.delEq).toHaveBeenCalledTimes(1);
    expect(b.updateEq.mock.calls.length).toBeGreaterThan(0);
  });

  it("câu KHÔNG thuộc đề này ⇒ từ chối", async () => {
    // Xoá thẳng theo `examQuestionId` là gỡ được câu khỏi đề bất kỳ.
    b.eq = null;
    await batLoi(
      cauHinhGoCauKhoiDe.handler({
        db: dbGia(),
        actor: actorHO,
        input: { examId: "de1", examQuestionId: "eq-de-khac" },
      } as never),
    );
    expect(b.delEq).not.toHaveBeenCalled();
  });
});

// ── 5. Kích hoạt ───────────────────────────────────────────────────────────

describe("kích hoạt đề", () => {
  const coCau = (diem: number[]) => {
    b.dsCau = diem.map((p) => ({ points: p }));
  };

  it("đóng băng tổng điểm = tổng điểm các câu", async () => {
    // Tính lại lúc chấm là để một câu bị sửa điểm sau đó làm lệch thang của những
    // lượt đã chấm.
    coCau([3, 3, 4]);
    const r = (await cauHinhKichHoatDe.handler({
      db: dbGia(),
      actor: actorHO,
      input: { examId: "de1" },
    } as never)) as { data: { maxScore: number; soCau: number } };
    expect(r.data.maxScore).toBe(10);
    expect(r.data.soCau).toBe(3);
    const arg = b.updateDe.mock.calls[0]![0] as {
      data: { isActive: boolean; maxScore: number };
    };
    expect(arg.data).toEqual({ isActive: true, maxScore: 10 });
  });

  it("🔴 đề RỖNG ⇒ từ chối", async () => {
    // Kích hoạt một đề không câu nào là phát cho người học một bài thi trống, và
    // họ nộp xong được chấm 0 điểm.
    coCau([]);
    const e = await batLoi(
      cauHinhKichHoatDe.handler({
        db: dbGia(),
        actor: actorHO,
        input: { examId: "de1" },
      } as never),
    );
    expect(e.code).toBe("DE_RONG");
    expect(b.updateDe).not.toHaveBeenCalled();
  });

  it("🔴 điểm đạt VƯỢT thang ⇒ từ chối, nói cả hai con số", async () => {
    // `passScore > maxScore` là một đề không ai qua nổi, và người soạn không có
    // cách nào biết trước khi có người trượt.
    coCau([2, 2]);
    const e = await batLoi(
      cauHinhKichHoatDe.handler({
        db: dbGia(),
        actor: actorHO,
        input: { examId: "de1" },
      } as never),
    );
    expect(e.code).toBe("DIEM_DAT_VUOT_THANG");
    expect(e.message).toContain("8");
    expect(e.message).toContain("4");
  });

  it("điểm đạt BẰNG thang ⇒ cho qua", async () => {
    // Đề "phải đúng hết mới đạt" là hợp lệ; chặn nó là chặn nhầm.
    coCau([4, 4]);
    await cauHinhKichHoatDe.handler({
      db: dbGia(),
      actor: actorHO,
      input: { examId: "de1" },
    } as never);
    expect(b.updateDe).toHaveBeenCalledTimes(1);
  });

  it("kích hoạt LẦN HAI ⇒ từ chối", async () => {
    b.de = { ...deNhap, isActive: true, maxScore: 10 };
    const e = await batLoi(
      cauHinhKichHoatDe.handler({
        db: dbGia(),
        actor: actorHO,
        input: { examId: "de1" },
      } as never),
    );
    expect(e.code).toBe("DE_DA_KICH_HOAT");
  });
});

// ── 6. Quyền ───────────────────────────────────────────────────────────────

describe("khoá quyền", () => {
  it("soạn dùng `content:author`, KÍCH HOẠT dùng `content:publish`", () => {
    // Kích hoạt là đưa đề ra dùng thật — quyền xuất bản, không phải quyền soạn.
    for (const c of [cauHinhTaoDe, cauHinhThemCauVaoDe, cauHinhGoCauKhoiDe, cauHinhSapXepDe]) {
      expect(c.permission, c.name).toBe("elearning:content:author");
    }
    expect(cauHinhKichHoatDe.permission).toBe("elearning:content:publish");
  });
});

// ── 7. Gắn đề vào bài kiểm tra ─────────────────────────────────────────────

describe("🔴 gắn đề vào bài — không có đường này thì mở QUIZ là bẫy mới", () => {
  const gan = (input: Record<string, unknown> = {}) =>
    cauHinhGanDeVaoBai.handler({
      db: dbGia(),
      actor: actorHO,
      input: { lessonId: "les1", examId: "de1", ...input },
    } as never);

  beforeEach(() => {
    b.bai = { id: "les1", kind: "QUIZ", examId: null, module: { courseId: "c1" } };
    b.khoa = { id: "c1" };
    b.de = { ...deNhap, isActive: true, maxScore: 10 };
  });

  it("gắn được đề đã kích hoạt", async () => {
    await gan();
    const arg = b.updateBai.mock.calls[0]![0] as { data: { examId: string } };
    expect(arg.data.examId).toBe("de1");
  });

  it("gỡ đề khỏi bài được", async () => {
    await gan({ examId: null });
    const arg = b.updateBai.mock.calls[0]![0] as { data: { examId: null } };
    expect(arg.data.examId).toBeNull();
  });

  it("🔴 đề NHÁP ⇒ từ chối", async () => {
    // Gắn đề nháp là để bài đi ra với người học trên một bộ câu còn sửa được — và
    // đề sửa xong thì điểm người thi trước lệch khỏi thang của người thi sau.
    b.de = { ...deNhap, isActive: false };
    const e = await batLoi(gan());
    expect(e.code).toBe("DE_CHUA_KICH_HOAT");
    expect(b.updateBai).not.toHaveBeenCalled();
  });

  it("bài KHÔNG phải QUIZ ⇒ từ chối", async () => {
    b.bai = { id: "les1", kind: "VIDEO", examId: null, module: { courseId: "c1" } };
    const e = await batLoi(gan());
    expect(e.code).toBe("WRONG_KIND");
  });

  it("bài của cơ sở KHÁC ⇒ NOT_FOUND, không ghi gì", async () => {
    // Cách ly đi qua chuỗi cha: `TrnLesson` không nằm trong `SCOPED_MODELS`, và
    // `scopedDb` không che đường ghi.
    b.khoa = null;
    const e = await batLoi(gan());
    expect(e.code).toBe("NOT_FOUND");
    expect(b.updateBai).not.toHaveBeenCalled();
  });

  it("đề ngoài phạm vi ⇒ NOT_FOUND", async () => {
    b.de = null;
    await batLoi(gan());
    expect(b.updateBai).not.toHaveBeenCalled();
  });
});
