import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CurriculumForm } from "../../_components/curriculum-form";
import { LessonList } from "../../_components/lesson-list";
import { can } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditCurriculumPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "curriculum:edit")) {
    redirect("/dashboard?error=unauthorized");
  }

  const { id } = await params;

  const [curriculum, courses] = await Promise.all([
    db.curriculum.findUnique({
      where: { id },
      include: {
        course: { select: { name: true } },
        lessons: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            curriculumId: true,
            order: true,
            title: true,
            description: true,
            content: true,
            duration: true,
            objectives: true,
            materials: true,
            notes: true,
            teacherGuide: true,
            expectedOutput: true,
            homeworkDefault: true,
            assessmentCriteria: true,
          },
        },
      },
    }),
    db.course.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!curriculum) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/curriculums"
          className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
        </Link>
        <h1 className="text-2xl font-bold text-neutral-900">
          {curriculum.name}{" "}
          <span className="text-neutral-400">v{curriculum.version}</span>
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Khoá học: <strong>{curriculum.course.name}</strong>
        </p>
      </div>

      <CurriculumForm
        courses={courses}
        curriculum={{
          id: curriculum.id,
          courseId: curriculum.courseId,
          name: curriculum.name,
          version: curriculum.version,
          description: curriculum.description,
          isActive: curriculum.isActive,
          status: curriculum.status,
        }}
      />

      <LessonList
        curriculumId={curriculum.id}
        initialLessons={curriculum.lessons.map((l) => ({
          id: l.id,
          curriculumId: l.curriculumId,
          order: l.order,
          title: l.title,
          description: l.description,
          content: l.content,
          duration: l.duration,
          objectives: l.objectives,
          materials: l.materials,
          notes: l.notes,
          teacherGuide: l.teacherGuide,
          expectedOutput: l.expectedOutput,
          homeworkDefault: l.homeworkDefault,
          assessmentCriteria: l.assessmentCriteria,
        }))}
      />
    </div>
  );
}
