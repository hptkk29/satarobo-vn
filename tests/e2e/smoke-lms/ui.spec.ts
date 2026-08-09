import { test, expect } from "@playwright/test";
import { db } from "../../../lib/db";
import { resetDb, seedOrg, seedRoles, seedUser } from "../_helpers/seed";
import { login } from "../_helpers/auth";
import { makeToken } from "../../../lib/portal/active-site-token";

const SECRET = process.env.NEXTAUTH_SECRET ?? "test-secret-smoke";
const ctx: Record<string, string> = {};

test.beforeAll(async () => {
  await resetDb();
  const cs1 = await db.center.create({
    data: { name: "Cơ sở 1", slug: "cs1-uismoke", address: "211 NHT", code: "CS1" },
  });
  await seedOrg(["HO", "CS1", "CS2"]);
  await seedRoles();
  const cs1Org = await db.orgUnit.findFirst({ where: { code: "CS1" }, select: { id: true } });
  const rootOrg = await db.orgUnit.findFirst({ where: { code: "SATAROBO" }, select: { id: true } });
  const teacherRole = await db.roleDef.findUnique({ where: { code: "TEACHER" }, select: { id: true } });
  const saRole = await db.roleDef.findUnique({ where: { code: "SUPER_ADMIN" }, select: { id: true } });
  const parentRole = await db.roleDef.findUnique({ where: { code: "PARENT" }, select: { id: true } });

  const sa = await seedUser({ email: "sa@ui.vn", role: "SUPER_ADMIN", name: "Super" });
  const tA = await seedUser({ email: "ta@ui.vn", role: "TEACHER", name: "GV A", centerId: cs1.id });
  const parent = await seedUser({ email: "ph@ui.vn", role: "PARENT", name: "Phu Huynh" });

  // PH cũng cần UserOrgRole (v2): sendChatMessage đi qua runAction → can() v2 THUẦN
  // (lib/permissions/can.ts fallback canV2, KHÔNG theo cờ RBAC_V2_ENABLED) — thiếu
  // UserOrgRole là chat:send (scope OWN) bị PERMISSION_DENIED dù v1 matrix cho PARENT.
  await db.userOrgRole.createMany({
    data: [
      { userId: tA.id, orgUnitId: cs1Org!.id, roleId: teacherRole!.id, grantedById: sa.id },
      { userId: sa.id, orgUnitId: rootOrg!.id, roleId: saRole!.id, grantedById: sa.id },
      { userId: parent.id, orgUnitId: cs1Org!.id, roleId: parentRole!.id, grantedById: sa.id },
    ],
  });

  const course = await db.course.create({ data: { name: "LTR", slug: "ltr-uismoke" } });
  const classA = await db.class.create({
    data: { name: "Lớp A", courseId: course.id, centerId: cs1.id, teacherId: tA.id },
  });
  const s1 = await db.student.create({
    data: { name: "HV Một", parentUserId: parent.id, centerId: cs1.id },
  });
  const enr = await db.enrollment.create({
    data: { studentId: s1.id, classId: classA.id, courseId: course.id, status: "STUDYING" },
  });
  // D6 (reconcile) — hệ CŨ per-enrollment (ConversationMessage) vẫn seed: bảng còn
  // sống trong repo (Q3 chỉ thay route, không xoá dữ liệu cũ) — vô hại với hệ mới.
  await db.conversationMessage.create({
    data: { enrollmentId: enr.id, authorUserId: parent.id, authorSide: "PARENT", body: "Chào thầy ạ" },
  });

  // Đợt 1 (Q3, docs/chat-realtime/00-dieu-chinh-cho-repo.md) — /admin/tin-nhan +
  // /portal/tin-nhan đã chuyển sang HỆ MỚI Conversation/ConversationParticipant/Message
  // (participant-based: chỉ thấy hội thoại mình là thành viên). Seed nhóm lớp của classA
  // theo đúng chuẩn tests/chat/_helpers/seed-chat.ts: GV = MODERATOR/CLASS_TEACHER,
  // PH = MEMBER/CLASS_STUDENT_PARENT (source DERIVED); SUPER_ADMIN không được sync dẫn
  // xuất tự thêm → vào nhóm bằng bản ghi MANUAL (BR-15, derivedFrom null).
  // UI hiện TÊN LỚP ("Lớp A") làm displayName — listConversationsForUser JOIN Class
  // theo subjectId, không dùng title đã chụp.
  const conv = await db.conversation.create({
    data: {
      type: "CLASS_GROUP",
      subjectType: "CLASS",
      subjectId: classA.id,
      centerId: cs1.id,
      status: "ACTIVE",
      title: classA.name,
    },
    select: { id: true },
  });
  await db.conversationParticipant.createMany({
    data: [
      { conversationId: conv.id, userId: tA.id, role: "MODERATOR", source: "DERIVED", derivedFrom: "CLASS_TEACHER", unreadCount: 1 },
      { conversationId: conv.id, userId: parent.id, role: "MEMBER", source: "DERIVED", derivedFrom: "CLASS_STUDENT_PARENT" },
      { conversationId: conv.id, userId: sa.id, role: "MEMBER", source: "MANUAL", unreadCount: 1 },
    ],
  });
  // Tin mở màn từ PH — giữ đúng bất biến của F-SEND: lastMessageAt bám createdAt của
  // tin cuối, unreadCount+1 cho mọi thành viên TRỪ người gửi (đã set ở createMany trên).
  const seededMsg = await db.message.create({
    data: { conversationId: conv.id, senderId: parent.id, kind: "CHAT", body: "Chào thầy ạ" },
    select: { createdAt: true },
  });
  await db.conversation.update({
    where: { id: conv.id },
    data: { lastMessageAt: seededMsg.createdAt },
  });

  Object.assign(ctx, { sa: "sa@ui.vn", parent: "ph@ui.vn", s1: s1.id });
});

test("admin: hộp thư tin nhắn render + có thread; compliance render", async ({ page }) => {
  await login(page, { email: ctx.sa });

  await page.goto("/admin/tin-nhan");
  await expect(page.getByRole("heading", { name: "Tin nhắn" })).toBeVisible();
  // Hệ MỚI: cột trái là danh sách hội thoại mình là thành viên — nhóm lớp hiện TÊN LỚP
  // (không còn "HV Một" per-enrollment như hệ cũ). Mở thread → thấy tin PH đã seed.
  // (Link href="/tin-nhan?c=..." — localhost rewrite /X → /admin/X qua proxy.ts.)
  await page.getByRole("link", { name: /Lớp A/ }).click();
  // "Chào thầy ạ" xuất hiện ở cả preview trong danh sách lẫn bong bóng thread → first().
  await expect(page.getByText("Chào thầy ạ").first()).toBeVisible();

  await page.goto("/admin/compliance");
  await expect(page.getByRole("heading", { name: /Tuân thủ dữ liệu/ })).toBeVisible();

  // P6 — dashboard báo cáo (Recharts) render. bao-cao/lms cũ đã tách → hieu-suat-gv.
  await page.goto("/admin/bao-cao/hieu-suat-gv");
  await expect(page.getByRole("heading", { name: /Báo cáo hiệu suất giáo viên/ })).toBeVisible();

  // Calendar admin render.
  await page.goto("/admin/lich");
  await expect(page.getByRole("heading", { name: "Lịch dạy" })).toBeVisible();
});

test("portal: PH xem hộp thư + gửi tin mới", async ({ page, context }) => {
  await login(page, { email: ctx.parent });
  await context.addCookies([
    { name: "portal_active_site", value: makeToken(ctx.s1, SECRET), domain: "localhost", path: "/" },
  ]);

  await page.goto("/portal/tin-nhan");
  await expect(page.getByRole("heading", { name: "Tin nhắn" })).toBeVisible();
  // Hệ MỚI (US-08): mỗi dòng là MỘT hội thoại — nhóm lớp hiện TÊN LỚP, không còn link
  // "HV Một" per-enrollment. Mở nhóm lớp của con → thấy tin đã seed.
  await page.getByRole("link", { name: /Lớp A/ }).click();
  await expect(page.getByText("Chào thầy ạ")).toBeVisible();

  // Gửi tin mới — composer hệ mới (message-composer.tsx): ô "Nhập tin nhắn…" + nút "Gửi".
  // Smoke KHÔNG có SUPABASE_* nên realtime degrade (banner lỗi kênh là bình thường);
  // tin hiện nhờ bong bóng optimistic + merge kết quả sendChatMessageAction — không chờ
  // broadcast.
  await page.getByPlaceholder(/Nhập tin nhắn/).fill("Cảm ơn thầy");
  await page.getByRole("button", { name: "Gửi" }).click();
  await expect(page.getByText("Cảm ơn thầy").first()).toBeVisible({ timeout: 15_000 });
  // Chờ server ACK ("Đang gửi…" biến mất, không rơi sang "Gửi lại") rồi reload —
  // chứng minh tin ĐÃ vào DB qua Server Action, không phải chỉ optimistic trên RAM.
  await expect(page.getByText("Đang gửi")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Gửi lại" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Cảm ơn thầy")).toBeVisible({ timeout: 15_000 });

  // Calendar portal render.
  await page.goto("/portal/lich");
  await expect(page.getByRole("heading", { name: "Lịch học" })).toBeVisible();
});
