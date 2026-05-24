import { auth } from "@/lib/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PackageForm } from "../_components/package-form";

function canManageCoursePackages(role: string | undefined) {
  return role === "SUPER_ADMIN" || role === "MANAGER";
}

export default async function NewPackagePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canManageCoursePackages(session.user.role)) {
    redirect("/dashboard?error=unauthorized");
  }

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
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Them Course Package</h1>
      </div>

      <PackageForm />
    </div>
  );
}
