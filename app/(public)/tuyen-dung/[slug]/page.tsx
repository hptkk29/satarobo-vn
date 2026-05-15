import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ChevronRight,
  ArrowLeft,
  MapPin,
  Clock,
  Briefcase,
  DollarSign,
  Phone,
  Mail,
} from "lucide-react";
import { db } from "@/lib/db";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";

export const revalidate = 60;

const BASE_URL = "https://satarobo.vn";

export async function generateStaticParams() {
  const jobs = await db.recruitment
    .findMany({ where: { isPublished: true }, select: { slug: true } })
    .catch(() => []);
  return jobs.map((j) => ({ slug: j.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const job = await db.recruitment.findUnique({ where: { slug } }).catch(() => null);
  if (!job || !job.isPublished) return {};

  return {
    title: `${job.title} | Tuyển dụng Sata Robo`,
    description: job.summary.slice(0, 160),
    alternates: { canonical: `${BASE_URL}/tuyen-dung/${slug}` },
    openGraph: {
      title: `${job.title} — Tuyển dụng Sata Robo`,
      description: job.summary.slice(0, 160),
      type: "article",
      url: `${BASE_URL}/tuyen-dung/${slug}`,
    },
  };
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const job = await db.recruitment.findUnique({ where: { slug } }).catch(() => null);
  if (!job || !job.isPublished) notFound();

  const responsibilities = asStringArray(job.responsibilities);
  const requirements = asStringArray(job.requirements);
  const benefits = asStringArray(job.benefits);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: "Trang chủ", url: "/" },
              { name: "Tuyển dụng", url: "/tuyen-dung" },
              { name: job.title, url: `/tuyen-dung/${slug}` },
            ]),
          ),
        }}
      />

      <div className="bg-white border-b border-neutral-200 py-3">
        <div className="container mx-auto px-4 max-w-5xl">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-neutral-500">
            <Link href="/" className="hover:text-orange-600 transition-colors">
              Trang chủ
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link href="/tuyen-dung" className="hover:text-orange-600 transition-colors">
              Tuyển dụng
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-neutral-800 font-medium line-clamp-1">{job.title}</span>
          </nav>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-5xl py-10">
        <Link
          href="/tuyen-dung"
          className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-orange-600 transition mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại danh sách
        </Link>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <header className="bg-white rounded-2xl border border-neutral-200 p-6">
              <div className="text-xs font-bold uppercase tracking-wider text-purple-600 mb-2">
                {job.department}
              </div>
              <h1 className="text-2xl md:text-3xl font-black text-neutral-900 mb-3">
                {job.title}
              </h1>
              <p className="text-neutral-700 leading-relaxed">{job.summary}</p>

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <MetaRow icon={MapPin} label="Địa điểm" value={job.location} />
                <MetaRow icon={Briefcase} label="Hình thức" value={job.jobType} />
                {job.workingHours && (
                  <MetaRow icon={Clock} label="Giờ làm việc" value={job.workingHours} />
                )}
                {job.salaryRange && (
                  <MetaRow icon={DollarSign} label="Mức lương" value={job.salaryRange} />
                )}
                {job.experienceLevel && (
                  <MetaRow icon={Briefcase} label="Kinh nghiệm" value={job.experienceLevel} />
                )}
              </div>
            </header>

            {responsibilities.length > 0 && (
              <JobSection title="Trách nhiệm chính" items={responsibilities} color="orange" />
            )}
            {requirements.length > 0 && (
              <JobSection title="Yêu cầu công việc" items={requirements} color="purple" />
            )}
            {benefits.length > 0 && (
              <JobSection title="Quyền lợi" items={benefits} color="green" />
            )}
          </div>

          <aside className="lg:col-span-1">
            <div className="bg-gradient-to-br from-orange-50 to-purple-50 rounded-2xl border-2 border-orange-200 p-6 sticky top-24">
              <h3 className="font-bold text-lg text-neutral-900 mb-3">Ứng tuyển ngay</h3>
              <p className="text-sm text-neutral-700 mb-5">
                Gửi CV qua email hoặc liên hệ trực tiếp HR Sata Robo
              </p>
              <a
                href={`mailto:${job.contactEmail}?subject=${encodeURIComponent(
                  `Ứng tuyển: ${job.title}`,
                )}`}
                className="block w-full text-center bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-3 rounded-xl transition-colors mb-3"
              >
                Gửi CV qua Email
              </a>
              <a
                href={`tel:${job.contactPhone.replace(/\D/g, "")}`}
                className="block w-full text-center bg-white border-2 border-purple-300 text-purple-700 hover:bg-purple-50 font-bold px-4 py-3 rounded-xl transition-colors"
              >
                Gọi HR Sata Robo
              </a>

              <div className="mt-6 pt-6 border-t border-orange-200 space-y-2 text-sm">
                <p className="flex items-center gap-2 text-neutral-700">
                  <Mail className="w-4 h-4 text-orange-500 shrink-0" />
                  <a href={`mailto:${job.contactEmail}`} className="hover:text-orange-600 break-all">
                    {job.contactEmail}
                  </a>
                </p>
                <p className="flex items-center gap-2 text-neutral-700">
                  <Phone className="w-4 h-4 text-orange-500 shrink-0" />
                  <a
                    href={`tel:${job.contactPhone.replace(/\D/g, "")}`}
                    className="hover:text-orange-600"
                  >
                    {job.contactPhone}
                  </a>
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

function MetaRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 text-neutral-700">
      <Icon className="w-4 h-4 mt-0.5 shrink-0 text-orange-500" />
      <div>
        <div className="text-xs text-neutral-500">{label}</div>
        <div className="font-semibold">{value}</div>
      </div>
    </div>
  );
}

const SECTION_COLOR: Record<"orange" | "purple" | "green", string> = {
  orange: "border-orange-200 bg-orange-50/40",
  purple: "border-purple-200 bg-purple-50/40",
  green: "border-green-200 bg-green-50/40",
};

function JobSection({
  title,
  items,
  color,
}: {
  title: string;
  items: string[];
  color: "orange" | "purple" | "green";
}) {
  return (
    <section className={`rounded-2xl border-2 ${SECTION_COLOR[color]} p-6`}>
      <h2 className="text-xl font-bold text-neutral-900 mb-4">{title}</h2>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-neutral-700">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-orange-500 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
