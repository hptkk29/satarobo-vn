"use client";

// Form sửa/tạo một mã ca — đoạn ca là bảng nhỏ (thêm/xoá dòng), mọi thứ khác là ô nhập.
import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createShiftTemplateAction, updateShiftTemplateAction, type ShiftTemplateInput } from "../_actions";

type Seg = { start: string; end: string; kind: "WORK" | "PAID_BREAK"; place?: string };

export type TemplateEditorValue = {
  id?: string;
  code: string;
  name: string;
  kind: "TIMED" | "LOCATION_ONLY" | "FLEXIBLE" | "OFF" | "LEAVE";
  segments: Seg[];
  defaultPlace: string;
  attendanceMode: "REQUIRED" | "OPTIONAL" | "NONE";
  dayCredit: number;
  isLeave: boolean;
  nominalMinutes: number | null;
  payMode: "SHIFT" | "ADMIN_HOURS" | "NONE";
  note: string | null;
  isActive: boolean;
  centerId: string | null;
};

const EMPTY: TemplateEditorValue = {
  code: "", name: "", kind: "TIMED", segments: [{ start: "08:00", end: "12:00", kind: "WORK" }], defaultPlace: "HOME",
  attendanceMode: "REQUIRED", dayCredit: 1, isLeave: false, nominalMinutes: null, payMode: "SHIFT", note: null, isActive: true, centerId: null,
};

const PLACES: { value: string; label: string }[] = [
  { value: "HOME", label: "Cơ sở của đơn vị (mặc định)" },
  { value: "ASSIGNED", label: "Theo phân công (HO)" },
  { value: "ANY_CENTER", label: "Bất kỳ cơ sở nào" },
  { value: "OFFSITE", label: "Công tác ngoài" },
  { value: "ANYWHERE", label: "Linh động (không cần đến)" },
];

export function TemplateEditor({
  initial,
  centers,
  canGlobal,
  onDone,
}: {
  initial?: TemplateEditorValue;
  centers: { id: string; code: string; name: string }[];
  canGlobal: boolean;
  onDone: () => void;
}) {
  const [v, setV] = useState<TemplateEditorValue>(initial ?? { ...EMPTY, centerId: canGlobal ? null : (centers[0]?.id ?? null) });
  const [pending, start] = useTransition();
  const set = <K extends keyof TemplateEditorValue>(k: K, val: TemplateEditorValue[K]) => setV((s) => ({ ...s, [k]: val }));
  const setSeg = (i: number, patch: Partial<Seg>) => setV((s) => ({ ...s, segments: s.segments.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const placeOptions = [...PLACES, ...centers.map((c) => ({ value: `CENTER:${c.code}`, label: `Tại ${c.name}` }))];

  function submit() {
    const input: ShiftTemplateInput = {
      ...v,
      segments: v.kind === "TIMED" ? v.segments : [],
      dayCredit: v.kind === "OFF" || v.kind === "LEAVE" ? 0 : v.dayCredit,
      isLeave: v.kind === "LEAVE",
      attendanceMode: v.kind === "OFF" || v.kind === "LEAVE" ? "NONE" : v.attendanceMode,
      nominalMinutes: v.nominalMinutes === null || Number.isNaN(v.nominalMinutes) ? null : v.nominalMinutes,
    };
    start(async () => {
      const r = v.id ? await updateShiftTemplateAction(v.id, input) : await createShiftTemplateAction(input);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(v.id ? "Đã cập nhật mã ca" : "Đã tạo mã ca");
      onDone();
    });
  }

  const field = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm";
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">Mã<input className={field} value={v.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="VD: CG" maxLength={8} /></label>
        <label className="text-sm sm:col-span-2">Tên<input className={field} value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="VD: Ca gãy" /></label>
        <label className="text-sm">Loại
          <select className={field} value={v.kind} onChange={(e) => set("kind", e.target.value as TemplateEditorValue["kind"])}>
            <option value="TIMED">Có giờ</option>
            <option value="LOCATION_ONLY">Chỉ nơi làm, không giờ (D1/D2)</option>
            <option value="FLEXIBLE">Linh động (LD)</option>
            <option value="OFF">Nghỉ (X)</option>
            <option value="LEAVE">Nghỉ phép (P)</option>
          </select>
        </label>
        <label className="text-sm">Nơi làm mặc định
          <select className={field} value={v.defaultPlace} onChange={(e) => set("defaultPlace", e.target.value)}>
            {placeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="text-sm">Phạm vi
          <select className={field} value={v.centerId ?? ""} onChange={(e) => set("centerId", e.target.value || null)}>
            {canGlobal && <option value="">Dùng chung mọi cơ sở</option>}
            {centers.map((c) => <option key={c.id} value={c.id}>Riêng {c.name}</option>)}
          </select>
        </label>
        {v.kind !== "OFF" && v.kind !== "LEAVE" && (
          <>
            <label className="text-sm">Chế độ chấm
              <select className={field} value={v.attendanceMode} onChange={(e) => set("attendanceMode", e.target.value as TemplateEditorValue["attendanceMode"])}>
                <option value="REQUIRED">Phải quét QR</option>
                <option value="OPTIONAL">Quét thì ghi giờ, không quét vẫn có công</option>
                <option value="NONE">Không chấm</option>
              </select>
            </label>
            <label className="text-sm">Số công / ngày<input type="number" step="0.5" min={0} max={3} className={field} value={v.dayCredit} onChange={(e) => set("dayCredit", Number(e.target.value))} /></label>
            <label className="text-sm">Cách trả công
              <select className={field} value={v.payMode} onChange={(e) => set("payMode", e.target.value as TemplateEditorValue["payMode"])}>
                <option value="SHIFT">Theo ca</option>
                <option value="ADMIN_HOURS">Giờ hành chính</option>
                <option value="NONE">Không</option>
              </select>
            </label>
            {v.kind !== "TIMED" && (
              <label className="text-sm">Giờ kế hoạch (phút, để trống = 0)<input type="number" min={0} className={field} value={v.nominalMinutes ?? ""} onChange={(e) => set("nominalMinutes", e.target.value === "" ? null : Number(e.target.value))} /></label>
            )}
          </>
        )}
      </div>

      {v.kind === "TIMED" && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium">Đoạn ca (giờ VN, không qua đêm; nghỉ giữa giờ TÍNH công kẹp giữa 2 đoạn làm việc)</span>
            <Button type="button" variant="outline" size="sm" onClick={() => set("segments", [...v.segments, { start: "13:30", end: "17:30", kind: "WORK" }])}><Plus className="h-4 w-4" /> Thêm đoạn</Button>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1 pr-2">Bắt đầu</th><th className="py-1 pr-2">Kết thúc</th><th className="py-1 pr-2">Loại</th><th className="py-1 pr-2">Nơi (trống = mặc định)</th><th /></tr></thead>
            <tbody>
              {v.segments.map((s, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2"><input type="time" className={field} value={s.start} onChange={(e) => setSeg(i, { start: e.target.value })} /></td>
                  <td className="py-1 pr-2"><input type="time" className={field} value={s.end} onChange={(e) => setSeg(i, { end: e.target.value })} /></td>
                  <td className="py-1 pr-2"><select className={field} value={s.kind} onChange={(e) => setSeg(i, { kind: e.target.value as Seg["kind"] })}><option value="WORK">Làm việc</option><option value="PAID_BREAK">Nghỉ giữa giờ (tính công)</option></select></td>
                  <td className="py-1 pr-2"><select className={field} value={s.place ?? ""} onChange={(e) => setSeg(i, { place: e.target.value || undefined })}><option value="">— mặc định —</option>{placeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></td>
                  <td className="py-1"><button type="button" className="text-destructive" onClick={() => set("segments", v.segments.filter((_, j) => j !== i))} aria-label="Xoá đoạn"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <label className="block text-sm">Ghi chú<input className={field} value={v.note ?? ""} onChange={(e) => set("note", e.target.value || null)} placeholder="VD: Nghỉ giữa giờ 16:30–17:00, tính vào giờ làm" /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Đang dùng</label>
      <div className="flex gap-2">
        <Button type="button" onClick={submit} disabled={pending}>{pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{v.id ? "Lưu" : "Tạo mã ca"}</Button>
        <Button type="button" variant="outline" onClick={onDone}>Đóng</Button>
      </div>
    </div>
  );
}
