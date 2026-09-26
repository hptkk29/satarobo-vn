// Ca [SGP-*] — NÚT GHI "gán học phần vào prod" phải giữ đủ bốn cổng. Thuần, không DB.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ ĐÂY LÀ WORKFLOW DUY NHẤT TRONG ĐỢT NÀY CÓ QUYỀN GHI VÀO PROD.
//
// Hai nút trước (`hoc-phan-prod-chi-doc`, `hoc-phan-dry-run-prod-chi-doc`) cầm chuỗi
// chỉ-đọc, nên sai cùng lắm là báo cáo sai. Nút này cầm `PROD_DIRECT_URL` và chạy
// `seed-curriculum-sata.ts --force` — thứ ghi đè `title` của 309 bài, mà `Lesson.title`
// **không có bản sao nào khác trong hệ thống**.
//
// Bốn cổng, và mỗi cổng canh một cách hỏng khác nhau:
//   1. DUMP đứng TRƯỚC bước ghi        → mất cổng này là mất đường lùi
//   2. dry-run chạy TRƯỚC bước ghi     → mất cổng này là bấm mù
//   3. bước ghi gác bằng CHUỖI XÁC NHẬN→ mất cổng này là một cú bấm nhầm ghi thẳng prod
//   4. NGHIỆM THU sau khi ghi          → mất cổng này thì ghi hụt trông y hệt ghi đủ
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const WORKFLOW = ".github/workflows/hoc-phan-seed-prod-ghi.yml";
const CHUOI = "GAN HOC PHAN THAT VAO PROD";

/**
 * ⚠️ BỎ CHÚ THÍCH TRƯỚC KHI SOI — luật 11, và nó cắn NGAY lượt chạy đầu tiên của chính
 * bộ ca này: header workflow giải thích `--force`, `--relink`, `TONG THAY DOI: 0 bai`, nên
 * 4 ca đỏ vì bắt đúng lời giải thích về thứ chúng đang canh.
 *
 * Đây là lần THỨ BA trong cùng một phiên (26/09/2026) một lưới đọc mã vấp vào chú thích
 * của chính bản vá nó canh. Ghi ra để người sau khỏi mất lượt: **viết lưới đọc mã thì bỏ
 * chú thích là bước ĐẦU TIÊN, không phải bước sửa lỗi.**
 */
function boChuThichYaml(src: string): string {
  return src
    .split(/\r?\n/)
    .map((d) => (/^\s*#/.test(d) ? "" : d))
    .join("\n");
}

// Giữ nguyên SỐ DÒNG (chú thích thay bằng dòng rỗng) — các ca dưới so THỨ TỰ giữa các
// bước, nên thay đổi số dòng không sai, nhưng giữ nguyên thì log đỏ chỉ đúng dòng thật.
const wf = boChuThichYaml(readFileSync(resolve(process.cwd(), WORKFLOW), "utf8"));

/** Số thứ tự dòng của lần khớp đầu tiên; `-1` khi không có. */
function dong(mau: RegExp): number {
  const ds = wf.split(/\r?\n/);
  return ds.findIndex((d) => mau.test(d));
}

describe("[SGP-01] DUMP đứng TRƯỚC bước ghi — đường lùi phải có trước", () => {
  it("có bước dump, và nó nằm TRƯỚC bước chạy seed", () => {
    const d = dong(/tsx scripts\/dump-giao-trinh-truoc-seed\.ts/);
    const g = dong(/tsx prisma\/seed-curriculum-sata\.ts/);
    expect(d, "không thấy bước dump").toBeGreaterThan(-1);
    expect(g, "không thấy bước ghi").toBeGreaterThan(-1);
    // ⚠️ Thứ tự là CẢ CÁI LUẬT. Dump sau khi ghi là dump chính bản đã bị ghi đè — tức
    // một tệp trông như đường lùi nhưng không lùi được gì.
    expect(d, "DUMP phải đứng TRƯỚC bước ghi").toBeLessThan(g);
  });

  it("artifact dump BẮT BUỘC có, không `warn` cho qua", () => {
    // `if-no-files-found: warn` ở đây nghĩa là: dump hỏng thì lượt chạy vẫn xanh và vẫn
    // ghi tiếp. Phải là `error`.
    const khoi = wf.slice(wf.indexOf("dump-truoc-seed"), wf.indexOf("dump-truoc-seed") + 400);
    expect(khoi).toMatch(/if-no-files-found:\s*error/);
  });
});

describe("[SGP-02] dry-run chạy TRƯỚC bước ghi", () => {
  it("có bước dry-run, và nó nằm TRƯỚC bước ghi", () => {
    const r = dong(/tsx scripts\/dry-run-hoc-phan\.ts/);
    const g = dong(/tsx prisma\/seed-curriculum-sata\.ts/);
    expect(r).toBeGreaterThan(-1);
    expect(r, "dry-run phải đứng TRƯỚC bước ghi").toBeLessThan(g);
  });
});

describe("[SGP-03] bước GHI gác bằng chuỗi xác nhận", () => {
  it("bước chạy seed có `if: inputs.confirm == '<chuỗi>'`", () => {
    const ds = wf.split(/\r?\n/);
    const g = ds.findIndex((d) => /tsx prisma\/seed-curriculum-sata\.ts/.test(d));
    // Cổng phải nằm trong chính bước ấy — nhìn ngược lên tối đa 4 dòng.
    const quanh = ds.slice(Math.max(0, g - 4), g + 1).join("\n");
    expect(quanh, "bước ghi KHÔNG có cổng chuỗi xác nhận").toContain(
      `inputs.confirm == '${CHUOI}'`,
    );
  });

  it("KHÔNG có `--relink` — bán kính nổ khác hẳn", () => {
    // `--relink` ghi đè `ClassSessionPlan.customTitle` và `ClassSession.lessonId` của các
    // lớp ĐANG CHẠY. Không ai yêu cầu, và nó không nằm trong thứ dry-run đã in ra.
    expect(wf).not.toMatch(/--relink/);
  });

  it("dùng đúng `--force`, và chỉ ở bước đã gác", () => {
    // Không `--force` thì seed bỏ qua cả 9 khoá (cổng `isPlaceholderTitle`) — tức nút
    // này sẽ không làm gì, mà vẫn báo xanh.
    //
    // ⚠️ Đếm trên LỆNH CHẠY, không trên cả tệp: tên bước cũng nhắc `(--force)` cho người
    // đọc log biết bước ấy làm gì, và cấm nhắc tên là cấm luôn lời giải thích — đúng bẫy
    // mà `[BCD-03]` đã ghi lại.
    const lenh = wf.split(/\r?\n/).filter((d) => /pnpm exec/.test(d));
    expect(lenh.filter((d) => d.includes("--force"))).toHaveLength(1);
    expect(lenh.find((d) => d.includes("seed-curriculum-sata.ts"))).toContain("--force");
  });
});

describe("[SGP-04] NGHIỆM THU sau khi ghi", () => {
  it("chạy lại dry-run SAU bước ghi và đòi `TONG THAY DOI: 0 bai`", () => {
    const g = dong(/tsx prisma\/seed-curriculum-sata\.ts/);
    const n = dong(/TONG THAY DOI: 0 bai/);
    expect(n, "không thấy bước nghiệm thu").toBeGreaterThan(-1);
    expect(n, "nghiệm thu phải đứng SAU bước ghi").toBeGreaterThan(g);
  });

  it("nghiệm thu ĐỎ thì lượt chạy phải ĐỎ", () => {
    // ⚠️ `grep -q ... || { ...; exit 1; }` — thiếu `exit 1` là cổng im lặng khi hỏng, thứ
    // mà `docs/luat-doc-so-va-ket-luan.md` gọi là tệ hơn không có cổng.
    const i = wf.indexOf("TONG THAY DOI: 0 bai");
    expect(wf.slice(i, i + 300)).toMatch(/exit 1/);
  });

  it("KHÔNG đặt lệnh kiểm sau dấu ống trần", () => {
    // `pnpm … | grep` trả mã thoát của `grep`, nên hạ tầng chết cũng thành "xanh".
    // Workflow này dùng `tee` rồi `grep` trên TỆP — đúng cách.
    expect(wf).toMatch(/tee \/tmp\/sau\.txt/);
    expect(wf).not.toMatch(/dry-run-hoc-phan\.ts \| grep/);
  });
});

describe("[SGP-05] khoá chung với mọi workflow chạm prod", () => {
  it("chỉ `workflow_dispatch`, chỉ nhánh `main`", () => {
    expect(wf).toMatch(/on:\s*\n\s*workflow_dispatch:/);
    expect(wf).not.toMatch(/\n\s*(push|pull_request|schedule):/);
    expect(wf).toMatch(/if: github\.ref == 'refs\/heads\/main'/);
  });

  it("KHÔNG đụng chuỗi chỉ-đọc — nút này GHI, dùng chuỗi đầy quyền", () => {
    // ⚠️ Ngược với `[BHP-03]`/`[DRH-03]`: ở đó chuỗi đầy quyền là lỗi; ở đây chuỗi
    // chỉ-đọc mới là lỗi, vì bước ghi sẽ chết giữa chừng — sau khi dump, trước khi xong.
    expect(wf).toContain("secrets.PROD_DIRECT_URL");
    expect(wf).not.toMatch(/PROD_DATABASE_URL_RO/);
  });

  it("không bước nào chạy migration hay deploy", () => {
    expect(wf).not.toMatch(/migrate deploy|migrate dev|db push/);
  });
});
