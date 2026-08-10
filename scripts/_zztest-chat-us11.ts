/**
 * ZZTEST — US-11 Chat Realtime: đính kèm ảnh qua R2 (TS-14, F-FILE, F-DEL).
 *
 *   pnpm tsx scripts/_zztest-chat-us11.ts
 *
 * Kiểm THẬT trên DB dev (quy ước ZZTEST — prefix ZZTEST_CHAT_US11_, cleanup
 * try/finally, chạy lại được; ép DIRECT_URL vì transaction pooler hay lỗi
 * prepared-statement khi script bắn nhiều query):
 *
 *   1. participant hiệu lực xin upload ticket → OK, key đúng khuôn, KHÔNG chứa
 *      tên file người dùng, signed PUT URL ký được.       [cần env R2 → có thể SKIP]
 *   2. `virus.exe` đổi tên `.jpg` (khai image/jpeg)  → 415 UNSUPPORTED_MEDIA_TYPE
 *   3. ảnh 12MB                                     → 413 FILE_TOO_LARGE
 *   4. 6 ảnh trong 1 tin                            → 413 TOO_MANY_FILES
 *   5. heic                                         → 415 "Định dạng chưa hỗ trợ"
 *   6. người KHÔNG phải participant xin read URL của ảnh trong hội thoại đó
 *                                                   → 403 NOT_PARTICIPANT (TS-14.2)
 *   6c. signed GET URL trỏ **bucket riêng của chat**, KHÔNG chứa host công khai
 *      (R2_PUBLIC_URL) và không chứa tên bucket công khai (R2_BUCKET_NAME).
 *   7. soft-delete tin chứa ảnh rồi xin read URL    → 403 MESSAGE_DELETED (TS-14.4)
 *
 * Bước 2–7 KHÔNG chạm R2 (guard chặn trước khi ký) nên luôn chạy được; chỉ bước
 * 1, 6b, 6c cần env R2 — thiếu env thì in SKIP kèm lý do, KHÔNG tính là PASS.
 *
 * ⚠️ Kho ảnh chat dùng bucket RIÊNG `R2_CHAT_BUCKET_NAME` (bucket KHÔNG gắn custom
 * domain). Bucket `R2_BUCKET_NAME` phát công khai qua `R2_PUBLIC_URL`
 * (cdn.satarobo.vn) nên ký signed URL vào đó là vô nghĩa — ghép key sang tên miền
 * CDN là tải được vĩnh viễn, kể cả sau khi tin bị gỡ. Thiếu `R2_CHAT_BUCKET_NAME`
 * ⇒ luồng ảnh trả 503, KHÔNG bao giờ mượn tạm bucket công khai.
 *
 * Máy dev để trống các biến R2 (.env có key nhưng giá trị rỗng) ⇒ các bước đó SKIP.
 * Muốn chạy nốt chúng mà không cần credential thật: presign chỉ là HMAC cục bộ,
 * KHÔNG gọi mạng — nên gán giá trị giả cho 1 lượt chạy là đủ để nghiệm thu khuôn
 * key + `X-Amz-Expires=300`:
 *   R2_ACCOUNT_ID=x R2_ACCESS_KEY_ID=x R2_SECRET_ACCESS_KEY=x \
 *   R2_BUCKET_NAME=satarobo-uploads R2_PUBLIC_URL=https://cdn.satarobo.vn \
 *   R2_CHAT_BUCKET_NAME=satarobo-chat-private pnpm tsx scripts/_zztest-chat-us11.ts
 * (R2_PUBLIC_URL vẫn phải có: `getR2Client()` — hạ tầng dùng chung với media/SCORM —
 * đòi đủ 5 biến cũ để khởi tạo, dù luồng chat không bao giờ dùng public URL.)
 * (upload/tải THẬT lên R2 vẫn phải smoke bằng credential thật — vế [TAY] TS-14.3.)
 */
import "./_load-env";
import { currentDbHost } from "./_load-env";
import { Module } from "node:module";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

// ⚠️ `server-only` là package "sentinel" của Next — KHÔNG resolve được trong tiến
// trình `tsx`, nên mọi module mở đầu bằng `import "server-only"` chết ngay dòng đầu.
// Tiền lệ trong repo là CHÉP LẠI logic sang script (backfill-payment-requests.ts,
// _zztest-chat-us02.ts) — ở đây KHÔNG chép, vì bản chép không chứng minh được gì về
// code chạy thật. Thay vào đó trỏ `server-only` sang đúng stub rỗng mà vitest đang
// dùng, rồi import THẲNG lib/chat/attachments.
const SERVER_ONLY_STUB = path.resolve(__dirname, "../tests/stubs/server-only.ts");
const M = Module as unknown as {
  _resolveFilename: (request: string, ...rest: unknown[]) => string;
};
const originalResolve = M._resolveFilename;
M._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === "server-only" || request === "client-only") return SERVER_ONLY_STUB;
  return originalResolve.call(this, request, ...rest);
};

// ⚠️ lib/chat/attachments import `@/lib/db` (singleton đọc DATABASE_URL lúc khởi
// tạo) — ép đi DIRECT_URL (session pooler) TRƯỚC rồi mới dynamic-import, tránh lỗi
// prepared-statement của transaction pooler. (Static import bị hoist chạy trước.)
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;
const attachmentsModule = import("../lib/chat/attachments");

const db = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const P = "ZZTEST_CHAT_US11_";
const SLUG = "zztest-chat-us11";
const EMAIL = (x: string) => `${SLUG}-${x}@example.com`;

let pass = true;
let skipped = 0;

function report(label: string, ok: boolean, detail: string) {
  pass = pass && ok;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
}
function skip(label: string, reason: string) {
  skipped += 1;
  console.log(`SKIP  ${label} — ${reason}`);
}

// ── magic bytes thật (giống bộ unit test) ───────────────────────────────────
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
/** PE/DOS header — file thực thi Windows. */
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00]);
/** `....ftypheic` — HEIC hợp lệ về cấu trúc, vẫn phải bị từ chối (AC5). */
const HEIC = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
]);
const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");

type FileIn = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  headBase64: string;
};
const jpegFile = (over: Partial<FileIn> = {}): FileIn => ({
  fileName: "anh buoi hoc.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 250_000,
  headBase64: b64(JPEG),
  ...over,
});

/** Bắt lỗi ChatAttachmentError → {code,status,message}; thành công → null. */
async function expectError(
  fn: () => Promise<unknown>,
): Promise<{ code?: string; status?: number; message: string } | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    const err = e as { code?: string; status?: number; message?: string };
    return { code: err.code, status: err.status, message: err.message ?? String(e) };
  }
}

/** Xoá mọi record ZZTEST của script này (kể cả rác lần chạy trước) — idempotent. */
async function cleanup(): Promise<void> {
  const convs = await db.conversation.findMany({
    where: { title: { startsWith: P } },
    select: { id: true },
  });
  const convIds = convs.map((c) => c.id);
  if (convIds.length > 0) {
    const msgs = await db.message.findMany({
      where: { conversationId: { in: convIds } },
      select: { id: true },
    });
    const msgIds = msgs.map((m) => m.id);
    if (msgIds.length > 0) {
      await db.messageAttachment.deleteMany({ where: { messageId: { in: msgIds } } });
      await db.message.deleteMany({ where: { id: { in: msgIds } } });
    }
    await db.conversationParticipant.deleteMany({
      where: { conversationId: { in: convIds } },
    });
    await db.conversation.deleteMany({ where: { id: { in: convIds } } });
  }
  await db.user.deleteMany({ where: { email: { startsWith: `${SLUG}-` } } });
}

async function seed() {
  // Tuần tự — pooler Supabase hay lỗi prepared-statement khi bắn song song.
  const ph1 = await db.user.create({
    data: { email: EMAIL("ph1"), name: `${P}PH Một`, role: "PARENT", roles: ["PARENT"] },
  });
  const ph3 = await db.user.create({
    data: { email: EMAIL("ph3"), name: `${P}PH Ba`, role: "PARENT", roles: ["PARENT"] },
  });
  const conv = await db.conversation.create({
    data: { type: "CLASS_GROUP", status: "ACTIVE", title: `${P}LopA` },
  });
  await db.conversationParticipant.create({
    data: { conversationId: conv.id, userId: ph1.id, role: "MEMBER", source: "MANUAL" },
  });
  // ph3 CỐ Ý không phải participant (TS-14.2).
  const msg = await db.message.create({
    data: { conversationId: conv.id, senderId: ph1.id, kind: "CHAT", body: `${P}tin có ảnh` },
  });
  const att = await db.messageAttachment.create({
    data: {
      messageId: msg.id,
      storagePath: `chat-attachments/${conv.id}/2026-08/zztest-us11-fake.jpg`,
      fileName: "anh buoi hoc.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 250_000,
    },
  });
  return { ph1, ph3, conv, msg, att };
}

async function main() {
  console.log(`DB host: ${currentDbHost()}`);
  const {
    createChatUploadTicket,
    getChatAttachmentReadUrl,
    isChatStorageConfigured,
    CHAT_IMAGE_RULES,
  } = await attachmentsModule;
  const r2Ready = isChatStorageConfigured();
  if (!r2Ready) {
    const chatBucket = (process.env.R2_CHAT_BUCKET_NAME ?? "").trim();
    const publicBucket = (process.env.R2_BUCKET_NAME ?? "").trim();
    const why =
      chatBucket === ""
        ? "R2_CHAT_BUCKET_NAME chưa đặt (bucket RIÊNG cho ảnh chat)"
        : chatBucket === publicBucket
          ? "R2_CHAT_BUCKET_NAME đang trỏ vào bucket CÔNG KHAI R2_BUCKET_NAME — bị từ chối"
          : "thiếu credential R2 (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)";
    console.log(
      `⚠️  Kho ảnh chat chưa cấu hình: ${why} → các bước cần KÝ URL sẽ SKIP, không tính PASS.`,
    );
  }

  try {
    await cleanup(); // dọn rác lần chạy trước (nếu có)
    const s = await seed();

    // ── 1. Participant hiệu lực xin upload ticket ─────────────────────────
    if (!r2Ready) {
      skip(
        "1. participant xin upload ticket",
        "kho ảnh chat chưa cấu hình (R2_CHAT_BUCKET_NAME) → không ký được PUT URL",
      );
    } else {
      const r = await createChatUploadTicket({
        conversationId: s.conv.id,
        userId: s.ph1.id,
        files: [jpegFile()],
      });
      const t = r.tickets[0]!;
      const keyOk = new RegExp(
        `^chat-attachments/${s.conv.id}/\\d{4}-\\d{2}/[0-9a-f-]{36}\\.jpg$`,
      ).test(t.storagePath);
      const noUserName = !t.storagePath.includes("anh") && !t.storagePath.includes("buoi");
      const urlOk =
        t.uploadUrl.startsWith("https://") &&
        t.uploadUrl.includes(encodeURIComponent(t.storagePath).replace(/%2F/g, "/"));
      report(
        "1. participant xin upload ticket → OK",
        keyOk && noUserName && urlOk && t.fileName === "anh buoi hoc.jpg",
        `key=${t.storagePath} (khuôn đúng=${keyOk}, không lộ tên file=${noUserName}), ` +
          `fileName giữ nguyên=${t.fileName === "anh buoi hoc.jpg"}, PUT URL ký được=${urlOk}, ` +
          `TTL=${t.expiresIn}s`,
      );
    }

    // ── 2. virus.exe đổi tên .jpg → 415 ───────────────────────────────────
    const e2 = await expectError(() =>
      createChatUploadTicket({
        conversationId: s.conv.id,
        userId: s.ph1.id,
        files: [jpegFile({ fileName: "virus.jpg", headBase64: b64(EXE) })],
      }),
    );
    report(
      "2. virus.exe đổi tên .jpg → 415 (magic bytes chặn, AC1)",
      e2?.code === "UNSUPPORTED_MEDIA_TYPE" && e2?.status === 415,
      `code=${e2?.code} status=${e2?.status} · "${e2?.message}"`,
    );

    // ── 3. ảnh 12MB → 413 ─────────────────────────────────────────────────
    const e3 = await expectError(() =>
      createChatUploadTicket({
        conversationId: s.conv.id,
        userId: s.ph1.id,
        files: [jpegFile({ sizeBytes: 12 * 1024 * 1024 })],
      }),
    );
    report(
      "3. ảnh 12MB → 413 FILE_TOO_LARGE",
      e3?.code === "FILE_TOO_LARGE" &&
        e3?.status === 413 &&
        CHAT_IMAGE_RULES.maxSizeBytes === 10 * 1024 * 1024,
      `code=${e3?.code} status=${e3?.status} · "${e3?.message}"`,
    );

    // ── 4. 6 ảnh/tin → 413 ────────────────────────────────────────────────
    const e4 = await expectError(() =>
      createChatUploadTicket({
        conversationId: s.conv.id,
        userId: s.ph1.id,
        files: Array.from({ length: 6 }, (_, i) => jpegFile({ fileName: `anh-${i}.jpg` })),
      }),
    );
    report(
      "4. 6 ảnh/tin → 413 TOO_MANY_FILES",
      e4?.code === "TOO_MANY_FILES" &&
        e4?.status === 413 &&
        CHAT_IMAGE_RULES.maxFilesPerMessage === 5,
      `code=${e4?.code} status=${e4?.status} · "${e4?.message}"`,
    );

    // ── 5. heic → "Định dạng chưa hỗ trợ" (AC5) ───────────────────────────
    const e5 = await expectError(() =>
      createChatUploadTicket({
        conversationId: s.conv.id,
        userId: s.ph1.id,
        files: [
          jpegFile({
            fileName: "IMG_0001.heic",
            mimeType: "image/heic",
            headBase64: b64(HEIC),
          }),
        ],
      }),
    );
    report(
      "5. heic → 415 đúng thông điệp 'Định dạng chưa hỗ trợ' (AC5)",
      e5?.code === "UNSUPPORTED_MEDIA_TYPE" &&
        e5?.status === 415 &&
        (e5?.message ?? "").includes("Định dạng chưa hỗ trợ"),
      `code=${e5?.code} status=${e5?.status} · "${e5?.message}"`,
    );

    // ── 6. người ngoài xin read URL → NOT_PARTICIPANT (TS-14.2) ───────────
    const e6 = await expectError(() => getChatAttachmentReadUrl(s.att.id, s.ph3.id));
    report(
      "6. ph3 (không phải thành viên) xin read URL → 403 NOT_PARTICIPANT (TS-14.2)",
      e6?.code === "NOT_PARTICIPANT" && e6?.status === 403,
      `code=${e6?.code} status=${e6?.status} · "${e6?.message}"`,
    );

    // Đối chứng: ph1 (thành viên) xin CÙNG ảnh đó → phải ký được (chứng minh 403
    // ở trên là do QUYỀN, không phải do ảnh hỏng/env thiếu).
    if (!r2Ready) {
      skip("6b. đối chứng ph1 (thành viên) ký được GET URL", "kho ảnh chat chưa cấu hình");
      skip("6c. GET URL không chứa host công khai", "kho ảnh chat chưa cấu hình");
    } else {
      const ok6 = await getChatAttachmentReadUrl(s.att.id, s.ph1.id);
      report(
        "6b. đối chứng: ph1 (thành viên) ký được GET URL hạn 5 phút (AC2)",
        ok6.url.startsWith("https://") &&
          ok6.expiresIn === 300 &&
          CHAT_IMAGE_RULES.readUrlTtlSeconds === 300 &&
          /X-Amz-Expires=300/.test(ok6.url),
        `expiresIn=${ok6.expiresIn}s, URL có X-Amz-Expires=300 → ${/X-Amz-Expires=300/.test(ok6.url)}`,
      );

      // ── 6c. URL ký PHẢI trỏ bucket riêng, KHÔNG dính bucket/host công khai ──
      // Nếu ảnh nằm ở bucket có cdn.satarobo.vn thì chữ ký + hạn 5 phút vô nghĩa:
      // người nhận chỉ cần ghép https://cdn.satarobo.vn/<key> là có bản vĩnh viễn,
      // tải được cả sau khi tin bị gỡ (phá flows.md:51-52,63 + US-12 AC5).
      const chatBucket = (process.env.R2_CHAT_BUCKET_NAME ?? "").trim();
      const publicBucket = (process.env.R2_BUCKET_NAME ?? "").trim();
      const publicHost = (process.env.R2_PUBLIC_URL ?? "")
        .replace(/^https?:\/\//i, "")
        .replace(/\/$/, "")
        .trim();
      const hitsChatBucket = chatBucket.length > 0 && ok6.url.includes(chatBucket);
      const noPublicBucket = publicBucket.length === 0 || !ok6.url.includes(publicBucket);
      const noPublicHost = publicHost.length === 0 || !ok6.url.includes(publicHost);
      report(
        "6c. GET URL trỏ bucket RIÊNG của chat, không chứa bucket/host công khai",
        hitsChatBucket && noPublicBucket && noPublicHost && chatBucket !== publicBucket,
        `bucket chat=${chatBucket || "(trống)"} có trong URL=${hitsChatBucket}, ` +
          `không dính bucket công khai '${publicBucket || "(trống)"}'=${noPublicBucket}, ` +
          `không dính host công khai '${publicHost || "(trống)"}'=${noPublicHost}`,
      );
    }

    // ── 7. soft-delete tin chứa ảnh → MESSAGE_DELETED (TS-14.4 / F-DEL) ───
    await db.message.update({
      where: { id: s.msg.id },
      data: {
        deletedAt: new Date(),
        deletedById: s.ph1.id,
        deletedReason: `${P}thu hồi`,
      },
    });
    const e7 = await expectError(() => getChatAttachmentReadUrl(s.att.id, s.ph1.id));
    report(
      "7. tin chứa ảnh đã gỡ → 403 MESSAGE_DELETED (TS-14.4, F-DEL)",
      e7?.code === "MESSAGE_DELETED" && e7?.status === 403,
      `code=${e7?.code} status=${e7?.status} · "${e7?.message}"`,
    );

    // 7b: gỡ tin KHÔNG biến 403-quyền thành 403-đã-gỡ (người ngoài vẫn NOT_PARTICIPANT).
    const e7b = await expectError(() => getChatAttachmentReadUrl(s.att.id, s.ph3.id));
    report(
      "7b. người ngoài hỏi ảnh của tin đã gỡ → vẫn NOT_PARTICIPANT (kiểm quyền trước)",
      e7b?.code === "NOT_PARTICIPANT",
      `code=${e7b?.code} status=${e7b?.status}`,
    );

    // 7c: tin đã gỡ vẫn CẤM ký kể cả khi hội thoại còn ACTIVE — và participant đã
    // rời nhóm cũng không xin được ảnh cũ.
    await db.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: s.conv.id, userId: s.ph1.id } },
      data: { leftAt: new Date() },
    });
    const e7c = await expectError(() => getChatAttachmentReadUrl(s.att.id, s.ph1.id));
    report(
      "7c. thành viên đã rời nhóm (leftAt) → 403 NOT_PARTICIPANT",
      e7c?.code === "NOT_PARTICIPANT",
      `code=${e7c?.code} status=${e7c?.status}`,
    );
  } finally {
    await cleanup();
    const left = await db.conversation.count({ where: { title: { startsWith: P } } });
    const leftUsers = await db.user.count({ where: { email: { startsWith: `${SLUG}-` } } });
    report("CLEANUP", left === 0 && leftUsers === 0, `còn sót ${left} hội thoại / ${leftUsers} user`);
    await db.$disconnect();
  }

  console.log(
    pass
      ? `\n=> TẤT CẢ PASS${skipped > 0 ? ` (${skipped} bước SKIP vì thiếu env R2 — CHƯA nghiệm thu được vế ký URL)` : ""}`
      : "\n=> CÓ FAIL",
  );
  process.exitCode = pass ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
