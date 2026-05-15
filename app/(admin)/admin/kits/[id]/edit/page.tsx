import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { KitForm } from "../../_components/kit-form";

interface Props {
  params: Promise<{ id: string }>;
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}

function asStringRecord(v: unknown): Record<string, string> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const result: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string") result[k] = val;
      else if (typeof val === "number" || typeof val === "boolean") result[k] = String(val);
    }
    return result;
  }
  return {};
}

export default async function EditKitPage({ params }: Props) {
  const { id } = await params;
  const kit = await db.zMRoboKit.findUnique({ where: { id } });
  if (!kit) notFound();

  return (
    <div>
      <h1 className="mb-6 text-3xl font-black text-neutral-900">
        Sửa Kit: <span className="font-bold text-orange-600">{kit.title}</span>
      </h1>
      <KitForm
        kit={{
          id: kit.id,
          slug: kit.slug,
          brand: kit.brand,
          series: kit.series,
          code: kit.code,
          title: kit.title,
          subtitle: kit.subtitle,
          shortDescription: kit.shortDescription,
          description: kit.description,
          priceDisplay: kit.priceDisplay,
          isAvailable: kit.isAvailable,
          specs: asStringRecord(kit.specs),
          features: asStringArray(kit.features),
          highlights: asStringArray(kit.highlights),
          mainImage: kit.mainImage,
          galleryImages: kit.galleryImages,
          sourceUrl: kit.sourceUrl,
          displayOrder: kit.displayOrder,
          isPublished: kit.isPublished,
        }}
      />
    </div>
  );
}
