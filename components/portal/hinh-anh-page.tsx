import { Camera, ImageOff } from "lucide-react";
import type { StudentPhotos } from "@/lib/portal/photos";
import { PageHero } from "@/components/portal/page-header";
import { ChildSwitcher } from "@/components/portal/child-switcher";

const COLORS = ["#F5871E", "#3B82F6", "#22C55E", "#F59E0B", "#8B5CF6", "#EC4899"];
function fmt(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function HinhAnhPageV2({
  kids,
  activeId,
  studentName,
  data,
}: {
  kids: { id: string; name: string }[];
  activeId: string | null;
  studentName: string;
  data: StudentPhotos;
}) {
  let color = 0;
  return (
    <div className="portal-v2 mx-auto w-full max-w-6xl space-y-6">
      <ChildSwitcher kids={kids} activeId={activeId} />

      <PageHero
        icon={Camera}
        title="Hình ảnh lớp theo buổi học"
        subtitle={`${data.total} ảnh từ ${data.groups.length} buổi học của ${studentName}${data.className ? ` · Lớp ${data.className}` : ""}.`}
      />

      {!data.consentGranted ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          <ImageOff className="size-8 text-muted-foreground/60" />
          Cần đồng ý sử dụng hình ảnh của con để xem ảnh lớp. Liên hệ trung tâm hoặc bật đồng ý trong Hồ sơ.
        </div>
      ) : data.groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">Chưa có ảnh lớp nào.</div>
      ) : (
        <div className="space-y-8">
          {data.groups.map((g) => (
            <section key={g.sessionId} className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">{g.order ?? "•"}</span>
                <div>
                  <h2 className="text-sm font-bold text-foreground">{g.title}</h2>
                  <p className="text-xs font-medium text-muted-foreground">Ngày chụp: {fmt(g.dateISO)} · {g.photos.length} ảnh</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                {g.photos.map((p) => {
                  const bg = COLORS[color++ % COLORS.length];
                  return (
                    <div key={p.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                      <div className="grid h-40 place-items-center" style={{ backgroundColor: bg }}>
                        <Camera className="size-8 text-white/70" />
                      </div>
                      <p className="truncate p-3 text-sm font-bold text-foreground">{p.caption ?? "Ảnh lớp"}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
