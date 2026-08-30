"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Phone,
  MessageSquare,
  StickyNote,
  Mail,
  RefreshCw,
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import type { Prisma, LeadStatus } from "@prisma/client";
import { LEAD_STATUS_LABEL } from "@/lib/leads/status";
import { addLeadActivity } from "../../actions";

type Activity = {
  id: string;
  type: string;
  content: string;
  // LD4 — metadata JSON structured theo loại (CALL/MESSAGE/EMAIL/NOTE). Có thể null
  // với hoạt động cũ hoặc auto-gen (STATUS_CHANGE/HANDOVER) → fallback render `content`.
  metadata?: unknown;
  actorName: string;
  createdAt: string; // ISO
};

// LD6 — prop `tasks` GIỮ optional để AGENT-LEAD-DETAIL gỡ dần ở page.tsx (Wave 2).
// KHÔNG xoá model/dữ liệu LeadTask — chỉ ẩn UI ở panel này.
type Task = {
  id: string;
  title: string;
  description: string | null;
  dueAt: string; // ISO
  status: string;
  assignedToName: string | null;
  completedAt: string | null;
};

const ACTIVITY_ICON: Record<string, typeof Phone> = {
  CALL: Phone,
  MESSAGE: MessageSquare,
  NOTE: StickyNote,
  EMAIL: Mail,
  STATUS_CHANGE: RefreshCw,
  HANDOVER: ArrowLeftRight,
};

const ACTIVITY_LABEL: Record<string, string> = {
  CALL: "Gọi điện",
  MESSAGE: "Nhắn tin",
  NOTE: "Ghi chú",
  EMAIL: "Email",
  STATUS_CHANGE: "Đổi trạng thái",
  HANDOVER: "Bàn giao",
};

// LD4 — chỉ 4 loại ghi tay. STATUS_CHANGE/HANDOVER là auto-gen (đổi trạng thái /
// bàn giao) nên KHÔNG cho tạo tay ở form; vẫn hiển thị trong lịch sử.
const QUICK_TYPES = ["CALL", "MESSAGE", "NOTE", "EMAIL"] as const;
type QuickType = (typeof QUICK_TYPES)[number];

const MESSAGE_PLATFORMS = ["SMS", "Zalo", "Messenger"] as const;
type MessagePlatform = (typeof MESSAGE_PLATFORMS)[number];

const inputCls =
  "w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft";

// LD4 — narrow JSON metadata an toàn (object thuần, không phải array/primitive).
function asMetaObj(m: unknown): Record<string, unknown> | null {
  return m && typeof m === "object" && !Array.isArray(m)
    ? (m as Record<string, unknown>)
    : null;
}
function metaStr(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

// LD4 — render chi tiết theo metadata structured; null → để caller fallback `content`.
function ActivityBody({ activity }: { activity: Activity }) {
  const meta = asMetaObj(activity.metadata);
  if (meta) {
    if (activity.type === "CALL") {
      const caller = metaStr(meta.caller);
      const dur = meta.durationMin;
      const head = [
        caller && `Người gọi: ${caller}`,
        dur != null && dur !== "" && `Thời lượng: ${metaStr(dur)} phút`,
      ].filter(Boolean);
      return (
        <div className="mt-0.5 text-sm text-foreground">
          {head.length > 0 && <p className="text-xs text-muted-foreground">{head.join(" · ")}</p>}
          <p className="whitespace-pre-line">{metaStr(meta.notes)}</p>
        </div>
      );
    }
    if (activity.type === "MESSAGE") {
      return (
        <p className="mt-0.5 text-sm text-foreground">
          {metaStr(meta.platform) && (
            <span className="mr-1 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
              {metaStr(meta.platform)}
            </span>
          )}
          <span className="whitespace-pre-line">{metaStr(meta.content)}</span>
        </p>
      );
    }
    if (activity.type === "EMAIL") {
      const recipient = metaStr(meta.recipient);
      const subject = metaStr(meta.subject);
      return (
        <div className="mt-0.5 text-sm text-foreground">
          {(recipient || subject) && (
            <p className="text-xs text-muted-foreground">
              {recipient && <>Đến: {recipient}</>}
              {recipient && subject && " · "}
              {subject && <>Tiêu đề: {subject}</>}
            </p>
          )}
          <p className="whitespace-pre-line">{metaStr(meta.body)}</p>
        </div>
      );
    }
    if (activity.type === "STATUS_CHANGE") {
      // Dòng CŨ trên PROD đã ghi sẵn chuỗi `MOI → DA_LIEN_HE` vào `content`. Không
      // sửa hồi tố được dữ liệu, nhưng `metadata` có `from`/`to` nên dịch được LÚC
      // ĐỌC — người dùng thấy tiếng Việt kể cả với dòng ghi trước ngày vá.
      const tu = metaStr(meta.from);
      const den = metaStr(meta.to);
      if (tu || den) {
        const nhan = (m: string) => LEAD_STATUS_LABEL[m as LeadStatus] ?? m;
        return (
          <p className="mt-0.5 text-sm text-foreground">
            {tu ? nhan(tu) : "—"} <span className="text-muted-foreground">→</span> {den ? nhan(den) : "—"}
            {meta.auto === true && (
              <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                tự động
              </span>
            )}
          </p>
        );
      }
    }
    if (activity.type === "NOTE" && metaStr(meta.text)) {
      return (
        <p className="mt-0.5 whitespace-pre-line text-sm text-foreground">{metaStr(meta.text)}</p>
      );
    }
  }
  // Fallback: hoạt động cũ / auto-gen → render chuỗi content.
  return (
    <p className="mt-0.5 whitespace-pre-line text-sm text-foreground">{activity.content}</p>
  );
}

function fmtDateTime(iso: string): string {
  // timeZone cố định → SSR (server UTC) và client (TZ trình duyệt) ra CÙNG chuỗi,
  // tránh React #418 (text mismatch khi hydrate). BUG-R7-008.
  return new Date(iso).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LeadActivityPanel({
  leadId,
  activities,
}: {
  leadId: string;
  activities: Activity[];
  // LD6 — nhận nhưng KHÔNG dùng (optional). Để page.tsx ngừng truyền ở Wave 2.
  tasks?: Task[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // LD4 — loại hoạt động đang chọn + state riêng từng loại.
  const [actType, setActType] = useState<QuickType>("CALL");

  // CALL: người gọi + thời lượng + ghi chú
  const [callCaller, setCallCaller] = useState("");
  const [callDuration, setCallDuration] = useState("");
  const [callNotes, setCallNotes] = useState("");
  // MESSAGE: nền tảng + nội dung
  const [msgPlatform, setMsgPlatform] = useState<MessagePlatform>("Zalo");
  const [msgContent, setMsgContent] = useState("");
  // EMAIL: người nhận + tiêu đề + nội dung
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  // NOTE: textarea
  const [noteContent, setNoteContent] = useState("");

  // LD5 — lịch sử mặc định đóng (chỉ render khi mở).
  // 30/08 — MỞ SẴN (chủ dự án chốt). Khối này nay đứng ngay cạnh hồ sơ khách, và
  // thứ người trực lead cần thấy đầu tiên là "đã ai gọi chưa, gọi lúc nào" — đóng lại
  // thì phải bấm thêm một lần cho mọi lượt mở lead.
  const [historyOpen, setHistoryOpen] = useState(true);

  function resetForm() {
    setCallCaller("");
    setCallDuration("");
    setCallNotes("");
    setMsgContent("");
    setEmailTo("");
    setEmailSubject("");
    setEmailBody("");
    setNoteContent("");
  }

  // LD4 — gộp các trường riêng từng loại thành `content` để lưu.
  // Phối hợp SPINE: addLeadActivity hiện chỉ nhận { leadId, type, content }; khi
  // SPINE mở thêm tham số `metadata` (JSON) thì truyền object structured xuống đây.
  function buildContent(): string | null {
    if (actType === "CALL") {
      const notes = callNotes.trim();
      if (!notes) return null;
      const head: string[] = [];
      if (callCaller.trim()) head.push(`Người gọi: ${callCaller.trim()}`);
      if (callDuration.trim()) head.push(`Thời lượng: ${callDuration.trim()} phút`);
      return head.length ? `${head.join(" · ")}\n${notes}` : notes;
    }
    if (actType === "MESSAGE") {
      const c = msgContent.trim();
      if (!c) return null;
      return `[${msgPlatform}] ${c}`;
    }
    if (actType === "EMAIL") {
      const body = emailBody.trim();
      if (!body) return null;
      const head: string[] = [];
      if (emailTo.trim()) head.push(`Đến: ${emailTo.trim()}`);
      if (emailSubject.trim()) head.push(`Tiêu đề: ${emailSubject.trim()}`);
      return head.length ? `${head.join("\n")}\n${body}` : body;
    }
    // NOTE
    return noteContent.trim() || null;
  }

  // LD4 — metadata structured theo từng loại, lưu vào LeadActivity.metadata (JSON)
  // song song với `content` (chuỗi đọc cho timeline). Trả null khi thiếu nội dung
  // bắt buộc — đồng bộ với buildContent() để không ghi metadata "rỗng".
  function buildMetadata(): Prisma.InputJsonValue | null {
    if (actType === "CALL") {
      const notes = callNotes.trim();
      if (!notes) return null;
      const dur = callDuration.trim();
      const durationMin = dur && Number.isFinite(Number(dur)) ? Number(dur) : null;
      return { caller: callCaller.trim() || null, durationMin, notes };
    }
    if (actType === "MESSAGE") {
      const content = msgContent.trim();
      if (!content) return null;
      return { platform: msgPlatform, content };
    }
    if (actType === "EMAIL") {
      const body = emailBody.trim();
      if (!body) return null;
      return {
        recipient: emailTo.trim() || null,
        subject: emailSubject.trim() || null,
        body,
      };
    }
    // NOTE
    const text = noteContent.trim();
    if (!text) return null;
    return { text };
  }

  function submitActivity() {
    const content = buildContent();
    if (!content) {
      toast.error("Nhập nội dung hoạt động");
      return;
    }
    const metadata = buildMetadata();
    startTransition(async () => {
      const res = await addLeadActivity({ leadId, type: actType, content, metadata });
      if (res.ok) {
        resetForm();
        toast.success("Đã ghi hoạt động");
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi");
      }
    });
  }

  return (
    // LD6 — bỏ cột "Việc cần làm" → bố cục 1 cột (trước đây lg:grid-cols-3).
    <div className="space-y-4">
      {/* LD4 — Ghi nhanh hoạt động theo từng loại */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-bold text-foreground">Ghi nhanh hoạt động</h3>
        <div className="flex flex-wrap gap-2">
          {QUICK_TYPES.map((t) => {
            const Icon = ACTIVITY_ICON[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => setActType(t)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${ actType === t ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground hover:bg-muted" }`}
              >
                <Icon size={14} /> {ACTIVITY_LABEL[t]}
              </button>
            );
          })}
        </div>

        {/* Trường nhập khác nhau theo loại */}
        <div className="mt-3 space-y-2">
          {actType === "CALL" && (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={callCaller}
                  onChange={(e) => setCallCaller(e.target.value)}
                  placeholder="Người gọi"
                  className={inputCls}
                />
                <input
                  type="number"
                  min={0}
                  value={callDuration}
                  onChange={(e) => setCallDuration(e.target.value)}
                  placeholder="Thời lượng (phút)"
                  className={inputCls}
                />
              </div>
              <textarea
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                rows={2}
                placeholder="Nội dung trao đổi..."
                className={inputCls}
              />
            </>
          )}

          {actType === "MESSAGE" && (
            <>
              <select
                value={msgPlatform}
                onChange={(e) => setMsgPlatform(e.target.value as MessagePlatform)}
                className={inputCls}
                aria-label="Nền tảng nhắn tin"
              >
                {MESSAGE_PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <textarea
                value={msgContent}
                onChange={(e) => setMsgContent(e.target.value)}
                rows={2}
                placeholder="Nội dung tin nhắn..."
                className={inputCls}
              />
            </>
          )}

          {actType === "EMAIL" && (
            <>
              <input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="Người nhận (email)"
                className={inputCls}
              />
              <input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Tiêu đề"
                className={inputCls}
              />
              <textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                rows={3}
                placeholder="Nội dung email..."
                className={inputCls}
              />
            </>
          )}

          {actType === "NOTE" && (
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              rows={2}
              placeholder="Ghi chú..."
              className={inputCls}
            />
          )}
        </div>

        <button
          type="button"
          onClick={submitActivity}
          disabled={isPending}
          className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary-dark disabled:opacity-60"
        >
          Ghi hoạt động
        </button>
      </div>

      {/* LD5 — Lịch sử thành nút bấm mở/đóng (mặc định đóng) */}
      <div className="rounded-xl border border-border bg-card p-4">
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          aria-expanded={historyOpen}
          className="flex w-full items-center justify-between gap-2 text-left text-sm font-bold text-foreground"
        >
          <span>Lịch sử tương tác của Lead ({activities.length})</span>
          {historyOpen ? (
            <ChevronDown size={16} className="flex-shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight size={16} className="flex-shrink-0 text-muted-foreground" />
          )}
        </button>

        {historyOpen &&
          (activities.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Chưa có hoạt động nào.</p>
          ) : (
            <ol className="mt-3 space-y-3">
              {activities.map((a) => {
                const Icon = ACTIVITY_ICON[a.type] ?? StickyNote;
                return (
                  <li key={a.id} className="flex gap-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Icon size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-xs font-bold text-foreground">
                          {ACTIVITY_LABEL[a.type] ?? a.type}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {a.actorName} · {fmtDateTime(a.createdAt)}
                        </span>
                      </div>
                      <ActivityBody activity={a} />
                    </div>
                  </li>
                );
              })}
            </ol>
          ))}
      </div>
    </div>
  );
}
