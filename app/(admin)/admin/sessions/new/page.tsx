import { db } from "@/lib/db";
import { SessionForm } from "../_components/session-form";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ classId?: string }>;
}

export default async function NewSessionPage({ searchParams }: Props) {
  const sp = await searchParams;
  const classes = await db.class.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      course: { select: { name: true } },
      center: { select: { name: true } },
    },
    take: 200,
  });

  return (
    <div>
      <h1 className="mb-6 text-3xl font-black text-neutral-900">Thêm buổi học</h1>
      <SessionForm
        defaultClassId={sp.classId}
        classes={classes.map((c) => ({
          id: c.id,
          name: c.name,
          courseName: c.course.name,
          centerName: c.center?.name ?? null,
        }))}
      />
    </div>
  );
}
