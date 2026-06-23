import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = { title: "Khoá dạy | Admin" };
export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "courses:view")) {
    redirect("/dashboard?error=unauthorized");
  }

  // Course là catalog toàn hệ thống (không center-scoped); scopedDb pass-through.
  const sdb = scopedDb(await resolveActor(session.user.id));
  const courses = await sdb.course.findMany({
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      ageRange: true,
      level: true,
      price: true,
      isActive: true,
      _count: { select: { discounts: true } },
    },
  });

  return (
    <div>
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50">
          <BookOpen className="h-5 w-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Khoá dạy (chương trình giảng)</h1>
          <p className="mt-1 text-sm text-gray-500">
            Khoá dạy = đơn vị GIẢNG (chương trình, độ tuổi, trình độ, ưu đãi). Để BÁN/định giá,
            dùng <span className="font-medium">Gói khoá học</span> và liên kết gói tới khoá dạy tại đây.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên khoá</TableHead>
              <TableHead>Độ tuổi</TableHead>
              <TableHead>Trình độ</TableHead>
              <TableHead className="text-right">Giá</TableHead>
              <TableHead className="text-right">Ưu đãi</TableHead>
              <TableHead>Trạng thái</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {courses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-gray-500">
                  Chưa có khoá học nào
                </TableCell>
              </TableRow>
            ) : (
              courses.map((c) => (
                <TableRow key={c.id} className="hover:bg-gray-50/60">
                  <TableCell className="font-medium">
                    <Link href={`/courses/${c.id}`} className="text-blue-600 hover:underline">
                      {c.name}
                    </Link>
                    <div className="text-xs text-gray-400">/{c.slug}</div>
                  </TableCell>
                  <TableCell className="text-sm">{c.ageRange || "—"}</TableCell>
                  <TableCell className="text-sm">{c.level || "—"}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {c.price != null ? `${c.price.toLocaleString("vi-VN")}đ` : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {c._count.discounts}
                  </TableCell>
                  <TableCell>
                    {c.isActive ? (
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                        Hoạt động
                      </Badge>
                    ) : (
                      <Badge className="bg-gray-200 text-gray-700 hover:bg-gray-200">Tắt</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
