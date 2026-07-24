import Link from "next/link";
import { redirect } from "next/navigation";
import { Search as SearchIcon, Users, GraduationCap, Newspaper } from "lucide-react";
import { auth } from "@/lib/auth";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import { checkPermission } from "@/lib/auth/check-permission";
import { canViewLeadPii } from "@/lib/auth/check-permission";
import { maskLeadPiiFields } from "@/lib/lead/pii";
import { LEAD_STATUS_LABEL } from "@/lib/leads/status";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tìm kiếm | Admin" };

// Tìm kiếm nhanh toàn cục từ ô "Tìm leads, học viên, blog..." trên thanh trên cùng.
// Gộp 3 nhóm (Lead / Học viên / Tin tức) — mỗi nhóm gate riêng theo quyền, dữ liệu qua
// scopedDb (cách ly cơ sở) và mask PII lead cho actor thiếu leads:view-pii.
const RESULT_LIMIT = 6;
const MIN_LENGTH = 2;

type SP = { q?: string };

export default async function GlobalSearchPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const doSearch = q.length >= MIN_LENGTH;

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const [canLeadsAll, canLeadsOwn, canStudents, canNews] = await Promise.all([
    checkPermission("leads:view-all"),
    checkPermission("leads:view-own"),
    checkPermission("students:view-all"),
    checkPermission("news:view"),
  ]);
  const canLeads = canLeadsAll || canLeadsOwn;
  const scopeToSelf = !canLeadsAll && canLeadsOwn;
  const canViewPii = await canViewLeadPii();

  const [leads, students, news] = doSearch
    ? await Promise.all([
        canLeads
          ? sdb.lead.findMany({
              where: {
                deletedAt: null,
                // Sale chỉ view-own → giới hạn lead của mình / dùng chung team (bọc AND để
                // không đè key OR của search bên dưới). Cách ly cơ sở do scopedDb lo.
                ...(scopeToSelf
                  ? {
                      AND: [
                        {
                          OR: [
                            { assignedToId: session.user.id },
                            { isSharedWithTeam: true },
                          ],
                        },
                      ],
                    }
                  : {}),
                OR: [
                  { parentName: { contains: q, mode: "insensitive" } },
                  { phone: { contains: q } },
                  { childName: { contains: q, mode: "insensitive" } },
                ],
              },
              select: {
                id: true,
                parentName: true,
                phone: true,
                childName: true,
                status: true,
              },
              orderBy: { createdAt: "desc" },
              take: RESULT_LIMIT,
            })
          : Promise.resolve([]),
        canStudents
          ? sdb.student.findMany({
              where: {
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { studentCode: { contains: q, mode: "insensitive" } },
                  { parentName: { contains: q, mode: "insensitive" } },
                  { parentPhone: { contains: q } },
                  { phone: { contains: q } },
                ],
              },
              select: { id: true, name: true, studentCode: true, parentName: true },
              orderBy: { createdAt: "desc" },
              take: RESULT_LIMIT,
            })
          : Promise.resolve([]),
        canNews
          ? sdb.news.findMany({
              where: { title: { contains: q, mode: "insensitive" } },
              select: { id: true, slug: true, title: true, isPublished: true, category: true },
              orderBy: { updatedAt: "desc" },
              take: RESULT_LIMIT,
            })
          : Promise.resolve([]),
      ])
    : [[], [], []];

  const maskedLeads = leads.map((l) => maskLeadPiiFields(l, canViewPii));
  const totalResults = maskedLeads.length + students.length + news.length;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Kết quả tìm kiếm</h1>
        {doSearch ? (
          <p className="mt-1 text-sm text-gray-500">
            {totalResults > 0
              ? `${totalResults} kết quả cho “${q}”`
              : `Không tìm thấy kết quả cho “${q}”`}
          </p>
        ) : (
          <p className="mt-1 text-sm text-gray-500">
            Nhập ít nhất {MIN_LENGTH} ký tự để tìm lead, học viên hoặc tin tức.
          </p>
        )}
      </div>

      {/* Ô tìm lại ngay trên trang kết quả (GET → /search?q=). */}
      <form method="GET" action="/search" className="relative mb-6">
        <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          name="q"
          defaultValue={q}
          autoFocus
          placeholder="Tìm leads, học viên, blog..."
          className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
        />
      </form>

      {doSearch && totalResults > 0 && (
        <div className="space-y-6">
          {maskedLeads.length > 0 && (
            <Section
              icon={<Users className="h-4 w-4" />}
              title="Lead"
              moreHref={`/leads?q=${encodeURIComponent(q)}`}
            >
              {maskedLeads.map((l) => (
                <Link
                  key={l.id}
                  href={`/leads/${l.id}`}
                  className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50"
                >
                  <span className="text-sm font-medium text-gray-900">
                    {l.parentName ?? "(chưa có tên)"}
                    {l.childName ? (
                      <span className="text-gray-500"> · {l.childName}</span>
                    ) : null}
                  </span>
                  <span className="text-xs text-gray-500">
                    {l.phone ?? ""} · {LEAD_STATUS_LABEL[l.status] ?? l.status}
                  </span>
                </Link>
              ))}
            </Section>
          )}

          {students.length > 0 && (
            <Section
              icon={<GraduationCap className="h-4 w-4" />}
              title="Học viên"
              moreHref={`/students?q=${encodeURIComponent(q)}`}
            >
              {students.map((s) => (
                <Link
                  key={s.id}
                  href={`/students/${s.id}`}
                  className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50"
                >
                  <span className="text-sm font-medium text-gray-900">{s.name}</span>
                  <span className="text-xs text-gray-500">
                    {s.studentCode ?? ""}
                    {s.parentName ? ` · PH: ${s.parentName}` : ""}
                  </span>
                </Link>
              ))}
            </Section>
          )}

          {news.length > 0 && (
            <Section
              icon={<Newspaper className="h-4 w-4" />}
              title="Tin tức"
              moreHref="/news"
            >
              {/* Bài đã đăng → mở bài public (mọi role có news:view đọc được);
                  bản nháp → trang sửa (route /news/{id} không tồn tại). */}
              {news.map((n) => (
                <Link
                  key={n.id}
                  href={n.isPublished ? `/tin-tuc/${n.slug}` : `/news/${n.id}/edit`}
                  target={n.isPublished ? "_blank" : undefined}
                  className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50"
                >
                  <span className="text-sm font-medium text-gray-900">{n.title}</span>
                  <span className="text-xs text-gray-500">
                    {n.category ? `${n.category} · ` : ""}
                    {n.isPublished ? "Đã đăng" : "Nháp"}
                  </span>
                </Link>
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  moreHref,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  moreHref: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
          {icon}
          {title}
        </h2>
        <Link href={moreHref} className="text-xs font-medium text-orange-600 hover:underline">
          Xem tất cả →
        </Link>
      </div>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}
