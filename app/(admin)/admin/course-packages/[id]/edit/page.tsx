import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PackageForm } from "../../_components/package-form";

interface EditPackagePageProps {
  params: Promise<{ id: string }>;
}

function canManageCoursePackages(role: string | undefined) {
  return role === "SUPER_ADMIN" || role === "MANAGER";
}

export default async function EditPackagePage({ params }: EditPackagePageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canManageCoursePackages(session.user.role)) {
    redirect("/dashboard?error=unauthorized");
  }

  const { id } = await params;
  const pkg = await db.coursePackage.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      code: true,
      name: true,
      shortName: true,
      subtitle: true,
      shortDescription: true,
      description: true,
      ageGroup: true,
      level: true,
      lessons: true,
      duration: true,
      priceOriginal: true,
      priceEarlyBird: true,
      priceMember: true,
      features: true,
      highlights: true,
      curriculum: true,
      badge: true,
      color: true,
      displayOrder: true,
      isPublished: true,
      isFeatured: true,
      thumbnail: true,
      seoTitle: true,
      seoDescription: true,
      parentCourseSlug: true,
      // Phase TD-1 — Detail content
      audienceTag: true,
      audienceDescription: true,
      mission: true,
      outcomesJson: true,
      methodsJson: true,
      conditionsJson: true,
      noteForParents: true,
      faqsJson: true,
    },
  });

  if (!pkg) notFound();

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/course-packages"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
        >
          <ChevronLeft className="h-4 w-4" />
          Quay lai
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Sua: {pkg.name}</h1>
      </div>

      <PackageForm pkg={pkg} />
    </div>
  );
}
