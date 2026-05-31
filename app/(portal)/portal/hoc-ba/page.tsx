import { requireActiveStudent } from "@/lib/portal/session";
import { getStudentTranscript } from "@/lib/transcript/service";
import { TranscriptView } from "@/components/transcript/transcript-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Học bạ | Sata Robo", robots: { index: false } };

export default async function PortalTranscriptPage() {
  const { studentId } = await requireActiveStudent();
  const t = await getStudentTranscript(studentId);

  if (!t) {
    return <p className="text-sm text-neutral-500">Chưa có dữ liệu học bạ.</p>;
  }
  return <TranscriptView t={t} pdfHref="/api/portal/transcript" />;
}
