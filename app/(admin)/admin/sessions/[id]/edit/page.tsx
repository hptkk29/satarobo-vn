import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { SessionForm } from "../../_components/session-form";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function EditSessionPage({ params }: Props) {
  const { id } = await params;

  const [session, classes, lessons] = await Promise.all([
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
        courseId: true,
        course: { select: { name: true } },
        center: { select: { name: true } },
      },
      take: 200,
    }),
    db.lesson.findMany({
      where: { curriculum: { isActive: true } },
      orderBy: [{ curriculumId: "asc" }, { order: "asc" }],
      select: {
        id: true,
        order: true,
        title: true,
        curriculum: { select: { name: true, courseId: true } },
      },
      take: 1000,
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
          lessonId: session.lessonId,
          lessonNotes: session.lessonNotes,
        }}
        classes={classes.map((c) => ({
          id: c.id,
          name: c.name,
          courseId: c.courseId,
          courseName: c.course.name,
          centerName: c.center?.name ?? null,
        }))}
        lessons={lessons.map((l) => ({
          id: l.id,
          order: l.order,
          title: l.title,
          curriculumName: l.curriculum.name,
          courseId: l.curriculum.courseId,
        }))}
      />
    </div>
  );
}
