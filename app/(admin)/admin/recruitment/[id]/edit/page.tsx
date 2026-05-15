import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { RecruitmentForm } from "../../_components/recruitment-form";

interface Props {
  params: Promise<{ id: string }>;
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}

export default async function EditRecruitmentPage({ params }: Props) {
  const { id } = await params;
  const position = await db.recruitment.findUnique({ where: { id } });
  if (!position) notFound();

  return (
    <div>
      <h1 className="mb-6 text-3xl font-black text-neutral-900">
        Sửa vị trí: <span className="font-bold text-orange-600">{position.title}</span>
      </h1>
      <RecruitmentForm
        position={{
          id: position.id,
          slug: position.slug,
          title: position.title,
          department: position.department,
          location: position.location,
          workingHours: position.workingHours,
          salaryRange: position.salaryRange,
          jobType: position.jobType,
          experienceLevel: position.experienceLevel,
          summary: position.summary,
          responsibilities: asStringArray(position.responsibilities),
          requirements: asStringArray(position.requirements),
          benefits: asStringArray(position.benefits),
          contactEmail: position.contactEmail,
          contactPhone: position.contactPhone,
          isPublished: position.isPublished,
          isFeatured: position.isFeatured,
          displayOrder: position.displayOrder,
        }}
      />
    </div>
  );
}
