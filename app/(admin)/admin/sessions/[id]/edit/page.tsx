import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { SessionForm } from "../../_components/session-form";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function EditSessionPage({ params }: Props) {
  const { id } = await params;

  const [session, classes] = await Promise.all([
    db.classSession.findUnique({
      where: { id },
      include: { class: { select: { name: true } } },
    }),
    db.class.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        course: { select: { name: true } },
        center: { select: { name: true } },
      },
      take: 200,
    }),
  ]);

  if (!session) notFound();

  return (
    <div>
      <h1 className="mb-6 text-3xl font-black text-neutral-900">
        Sửa buổi học: <span className="font-bold text-orange-600">{session.class.name}</span>
      </h1>
      <SessionForm
        session={{
          id: session.id,
          classId: session.classId,
          date: session.date,
          topic: session.topic,
          notes: session.notes,
        }}
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
