"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveWorkLocationAction } from "../_actions";

export type LocationValue = { id?: string; centerId: string; code: string; name: string; latitude: number | null; longitude: number | null; radiusMeters: number; geofenceEnabled: boolean; isActive: boolean };

export function LocationForm({ initial, centers, onDone }: { initial: LocationValue; centers: { id: string; name: string }[]; onDone: () => void }) {
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  const field = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm";
  function submit() {
    start(async () => {
      const r = await saveWorkLocationAction(v);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Đã lưu điểm chấm công");
      onDone();
      router.refresh();
    });
  }
  return (
    <div className="grid gap-3 rounded-xl border border-border bg-card p-5 sm:grid-cols-3">
      <label className="text-sm">Cơ sở<select className={field} value={v.centerId} onChange={(e) => setV({ ...v, centerId: e.target.value })}>{centers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="text-sm">Mã<input className={field} value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} placeholder="CS1" /></label>
      <label className="text-sm">Tên<input className={field} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Quầy lễ tân CS1" /></label>
      <label className="text-sm">Vĩ độ (lat)<input className={field} value={v.latitude ?? ""} onChange={(e) => setV({ ...v, latitude: e.target.value === "" ? null : Number(e.target.value) })} placeholder="16.0471" /></label>
      <label className="text-sm">Kinh độ (lng)<input className={field} value={v.longitude ?? ""} onChange={(e) => setV({ ...v, longitude: e.target.value === "" ? null : Number(e.target.value) })} placeholder="108.2062" /></label>
      <label className="text-sm">Bán kính (m)<input type="number" min={10} max={2000} className={field} value={v.radiusMeters} onChange={(e) => setV({ ...v, radiusMeters: Number(e.target.value) })} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.geofenceEnabled} onChange={(e) => setV({ ...v, geofenceEnabled: e.target.checked })} /> Bật geofence (chỉ gắn cờ NGOAI_VUNG, không từ chối)</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} /> Đang dùng</label>
      <p className="text-xs text-muted-foreground sm:col-span-3">Lấy toạ độ: mở Google Maps, nhấn giữ vào vị trí quầy, chép hai số (vĩ độ, kinh độ). Nên bật geofence sau khi đã thử quét vài lượt và thấy khoảng cách hợp lý ở bảng công.</p>
      <div className="flex gap-2 sm:col-span-3">
        <Button type="button" onClick={submit} disabled={pending}>{pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Lưu</Button>
        <Button type="button" variant="outline" onClick={onDone}>Đóng</Button>
      </div>
    </div>
  );
}

export function LocationList({ rows, centers, canCreate }: { rows: (LocationValue & { id: string; centerName: string })[]; centers: { id: string; name: string }[]; canCreate: boolean }) {
  const [editing, setEditing] = useState<LocationValue | null>(null);
  return (
    <div className="space-y-4">
      {editing ? (
        <LocationForm initial={editing} centers={centers} onDone={() => setEditing(null)} />
      ) : (
        canCreate && centers.length > 0 && (
          <Button type="button" onClick={() => setEditing({ centerId: centers[0].id, code: "", name: "", latitude: null, longitude: null, radiusMeters: 100, geofenceEnabled: false, isActive: true })}>+ Thêm điểm chấm công</Button>
        )
      )}
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr><th className="px-3 py-2">Cơ sở</th><th className="px-3 py-2">Mã · Tên</th><th className="px-3 py-2">Toạ độ</th><th className="px-3 py-2 text-right">Bán kính</th><th className="px-3 py-2">Geofence</th><th className="px-3 py-2">Trạng thái</th><th /></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border">
              <td className="px-3 py-2">{r.centerName}</td>
              <td className="px-3 py-2"><span className="font-mono">{r.code}</span> · {r.name}</td>
              <td className="px-3 py-2 text-xs">{r.latitude != null && r.longitude != null ? `${r.latitude}, ${r.longitude}` : <span className="text-amber-700">chưa có — đo thực địa rồi nhập</span>}</td>
              <td className="px-3 py-2 text-right">{r.radiusMeters} m</td>
              <td className="px-3 py-2 text-xs">{r.geofenceEnabled ? "Bật" : "Tắt"}</td>
              <td className="px-3 py-2 text-xs">{r.isActive ? "Đang dùng" : "Tắt"}</td>
              <td className="px-3 py-2 text-right"><button type="button" className="text-xs text-primary underline" onClick={() => setEditing(r)}>Sửa</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
