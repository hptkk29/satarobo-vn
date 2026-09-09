/**
 * .claude/hooks/hooks.test.ts — LƯỚI AN TOÀN PHẢI CÓ TEST CỦA CHÍNH NÓ (luật 14).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO FILE NÀY TỒN TẠI — sự cố 09/09/2026
 *
 * `block-env-add.sh` và `block-destructive.sh` CHẾT suốt nhiều tháng vì HAI lỗi cùng lúc:
 *
 *   1. đọc `cmd="${CLAUDE_COMMAND:-}"` — biến đó KHÔNG TỒN TẠI, nên `cmd` rỗng và không
 *      mẫu nào khớp;
 *   2. chặn bằng `exit 1` — Claude Code chỉ coi **exit 2** là CHẶN; `exit 1` chỉ là "lỗi
 *      không chặn", nên kể cả khi đọc đúng lệnh nó vẫn cho qua.
 *
 * Trong khi CLAUDE.md ghi "Security (ENFORCED by hooks)". Không ai phát hiện vì **không
 * có ca test nào cấy thử một lệnh phải bị chặn**.
 *
 * ⚠️ Đây là test HÀNH VI đúng nghĩa (luật 11): nó CHẠY THẬT cái hook với JSON thật trên
 * stdin và đọc MÃ THOÁT. Grep nội dung file hook không chứng minh được gì — bản cũ chứa
 * đủ mọi mẫu chặn và vẫn không chặn nổi thứ gì.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const GOC = process.cwd();
const HOOKS = join(GOC, ".claude", "hooks");

/**
 * Bỏ chú thích shell trước khi soi văn bản mã.
 *
 * ⚠️ Hai ca dưới đây ĐỎ ngay lần chạy đầu vì chính CHÚ THÍCH giải thích bản vá có nhắc
 * `cmd="${CLAUDE_COMMAND:-}"` và các chữ như FORCE — tức bộ so bắt trúng văn xuôi, không
 * bắt mã. Đây là lần thứ NĂM trong hai ngày cùng cái bẫy đó (luật 11, gạch đầu dòng 2).
 */
function boChuThich(src: string): string {
  return src
    .split(String.fromCharCode(10))
    .filter((l) => !/^\s*#/.test(l))
    .join(String.fromCharCode(10));
}

/** Chạy một hook với chuỗi lệnh giả lập; trả mã thoát + stderr. */
function chay(hook: string, command: string): { ma: number; loi: string } {
  const json = JSON.stringify({ tool_name: "Bash", tool_input: { command } });
  try {
    execFileSync("bash", [join(HOOKS, hook)], {
      input: json,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CLAUDE_PROJECT_DIR: GOC },
    });
    return { ma: 0, loi: "" };
  } catch (e) {
    const err = e as { status?: number; stderr?: string };
    return { ma: err.status ?? -1, loi: String(err.stderr ?? "") };
  }
}

/** 2 = CHẶN theo giao ước PreToolUse của Claude Code. */
const CHAN = 2;

describe("bộ đọc lệnh dùng chung", () => {
  it("lấy đúng `tool_input.command` từ JSON trên STDIN", () => {
    const ra = execFileSync(
      "bash",
      ["-c", `source "${HOOKS}/_doc-lenh.sh"; printf '%s' "$cmd"`],
      {
        input: JSON.stringify({ tool_input: { command: "echo xin chao" } }),
        encoding: "utf8",
      },
    );
    expect(ra).toBe("echo xin chao");
  });

  it("JSON hỏng ⇒ chuỗi rỗng, KHÔNG ném — hook hỏng không được giết lượt gọi", () => {
    const ra = execFileSync(
      "bash",
      ["-c", `source "${HOOKS}/_doc-lenh.sh"; printf '[%s]' "$cmd"`],
      { input: "khong-phai-json", encoding: "utf8" },
    );
    expect(ra).toBe("[]");
  });

  // ⚠️ CA CANH ĐÚNG LỖI CỦA BẢN CŨ. Nếu ai đó quay lại `$CLAUDE_COMMAND` thì ca này đỏ.
  it("KHÔNG hook nào còn đọc `$CLAUDE_COMMAND`", () => {
    const { readFileSync, readdirSync } = require("node:fs") as typeof import("node:fs");
    for (const f of readdirSync(HOOKS).filter((x) => x.endsWith(".sh"))) {
      const src = boChuThich(readFileSync(join(HOOKS, f), "utf8"));
      // Chỉ cấm DÙNG nó làm nguồn; nhắc tên trong chú thích thì được.
      expect(src, `${f} không được lấy lệnh từ $CLAUDE_COMMAND`).not.toMatch(
        /cmd=\s*"?\$\{?CLAUDE_COMMAND/,
      );
    }
  });
});

describe("block-env-add.sh — chặn `git add .env*`", () => {
  it("CHẶN `git add .env`", () => {
    const r = chay("block-env-add.sh", "git add .env");
    expect(r.ma, "phải là 2 (CHẶN); 1 chỉ là lỗi không chặn").toBe(CHAN);
    expect(r.loi).toContain("BLOCKED");
  });

  it("CHẶN `git add .env.local` và `.env.production`", () => {
    for (const f of [".env.local", ".env.production"]) {
      expect(chay("block-env-add.sh", `git add ${f}`).ma, f).toBe(CHAN);
    }
  });

  it("CHO QUA `.env.example` — file duy nhất được vào repo", () => {
    expect(chay("block-env-add.sh", "git add .env.example").ma).toBe(0);
  });

  it("CHO QUA lệnh không phải `git add`", () => {
    expect(chay("block-env-add.sh", "cat .env").ma).toBe(0);
    expect(chay("block-env-add.sh", "ls -la").ma).toBe(0);
  });
});

describe("block-destructive.sh — chặn lệnh phá dữ liệu", () => {
  // Danh sách này là HỢP ĐỒNG: đổi mẫu chặn thì phải đổi ở đây, và người đọc thấy ngay
  // mình sắp bị chặn cái gì.
  const PHAI_CHAN: [string, string][] = [
    ["rm -rf /", "rm -rf /"],
    ["rm -rf ~", "rm -rf ~/du-lieu"],
    ["đẩy ép lên main", "git push --force origin main"],
    ["reset --hard", "git reset --hard HEAD~3"],
    ["clean -fd", "git clean -fd"],
    ["DROP TABLE", 'psql -c "DROP TABLE Employee"'],
    ["DROP DATABASE", 'psql -c "DROP DATABASE satarobo"'],
    ["TRUNCATE TABLE", 'psql -c "TRUNCATE TABLE Lead"'],
    [
      "migrate diff shadow trỏ DB xa",
      'pnpm exec prisma migrate diff --shadow-database-url "postgresql://u:p@aws-1.pooler.supabase.com:5432/postgres" --from-migrations prisma/migrations',
    ],
    [
      "db push --force-reset không marker local",
      "pnpm exec prisma db push --force-reset",
    ],
    ["migrate reset không marker local", "pnpm exec prisma migrate reset --force"],
  ];

  it.each(PHAI_CHAN)("CHẶN: %s", (_ten, lenh) => {
    const r = chay("block-destructive.sh", lenh);
    expect(r.ma, `"${lenh}" phải bị chặn (exit 2)`).toBe(CHAN);
    expect(r.loi).toContain("BLOCKED");
  });

  const PHAI_CHO_QUA: [string, string][] = [
    ["lệnh thường", "pnpm typecheck"],
    ["xoá một file cụ thể", "rm -f duong/dan/tam.txt"],
    ["đẩy thường", "git push origin HEAD"],
    [
      "migrate reset TRÊN DB LOCAL",
      "DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/satarobo_test' pnpm prisma migrate reset --force --skip-seed",
    ],
    [
      "migrate diff shadow trỏ LOCAL",
      'pnpm exec prisma migrate diff --shadow-database-url "postgresql://postgres:postgres@127.0.0.1:5432/shadow" --from-migrations prisma/migrations',
    ],
  ];

  it.each(PHAI_CHO_QUA)("CHO QUA: %s", (_ten, lenh) => {
    expect(chay("block-destructive.sh", lenh).ma, lenh).toBe(0);
  });
});

describe("chan-commit-khi-do.sh — chặn commit khi đỏ", () => {
  it("lệnh không phải commit ⇒ cho qua NGAY, không chạy typecheck", () => {
    // Nếu nó chạy typecheck cho mọi lệnh thì mỗi lượt gọi Bash tốn 40 giây.
    const t = Date.now();
    expect(chay("chan-commit-khi-do.sh", "ls -la").ma).toBe(0);
    expect(Date.now() - t, "phải trả về gần như tức thì").toBeLessThan(5_000);
  });

  it("nhận ra `git commit` nằm GIỮA một chuỗi lệnh", () => {
    // Đúng hình dạng đã lọt hôm 09/09: `... && git commit ...`.
    const src = require("node:fs").readFileSync(
      join(HOOKS, "chan-commit-khi-do.sh"),
      "utf8",
    ) as string;
    expect(src).toContain("[;&|[:space:]])git[[:space:]]");
  });

  // ⚠️ LỖ ĐO ĐƯỢC 09/09/2026 ở lượt commit THẬT, không ca nào phía trên bắt được nó.
  //
  // `PreToolUse` chạy TRƯỚC chuỗi lệnh. Một lượt vừa stage vừa commit thì lúc hook soi,
  // tệp chưa vào index ⇒ nó kiểm cây SẠCH, cho qua, và commit lọt nguyên. Đo thật: cấy
  // một lỗi typecheck rồi gọi hai kiểu — gộp thì LỌT, tách hai lượt thì BỊ CHẶN.
  //
  // Đây đúng là luật 14 áp cho chính lưới vừa dựng: ca test của nó xanh 27/27 mà cổng
  // vẫn có một cửa mở, vì mọi ca đều cho hook ăn chuỗi lệnh CHỈ CÓ commit.
  it("CHẶN lượt vừa stage vừa commit — hook soi cây TRƯỚC khi stage", () => {
    const r = chay("chan-commit-khi-do.sh", `git add lib/a.ts && git commit -m "x"`);
    expect(r.ma, "hình dạng gộp phải bị chặn và bảo tách").toBe(CHAN);
    expect(r.loi).toContain("vừa stage vừa commit");
  });

  it("hiểu `-a`/`-am`: không stage thì phải so với HEAD, không phải index", () => {
    // `git commit -am "x"` không stage gì cả. Bản cũ đọc `--cached` ⇒ danh sách RỖNG
    // ⇒ `exit 0` sớm, bỏ luôn bước test. Chỉ typecheck còn sót lại canh.
    const src = boChuThich(
      require("node:fs").readFileSync(
        join(HOOKS, "chan-commit-khi-do.sh"),
        "utf8",
      ) as string,
    );
    expect(src, "phải có nhánh so với HEAD cho commit -a").toContain(
      "--diff-filter=ACMR HEAD",
    );
  });

  it("KHÔNG có đường vượt bằng biến môi trường", () => {
    // Đường vượt mà chính người bị chặn bật được thì cơ chế lại thành luật.
    const src = boChuThich(
      require("node:fs").readFileSync(
        join(HOOKS, "chan-commit-khi-do.sh"),
        "utf8",
      ) as string,
    );
    // Soi MÃ: một đường vượt là đọc một biến môi trường rồi `exit 0`.
    expect(src).not.toMatch(/\$\{?(SKIP|BYPASS|FORCE|NO_CHECK)/i);
  });
});

describe("settings.json cắm đủ ba hook", () => {
  it("cả ba đều được khai trong PreToolUse", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const p = join(GOC, ".claude", "settings.json");
    expect(existsSync(p)).toBe(true);
    const src = readFileSync(p, "utf8");
    for (const h of [
      "block-env-add.sh",
      "block-destructive.sh",
      "chan-commit-khi-do.sh",
    ]) {
      expect(src, `${h} phải được cắm, viết ra mà không cắm thì cũng như chết`).toContain(h);
    }
  });
});
