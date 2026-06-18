"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  REPORT_CARD_STATUS_LABEL,
  type ReportCardMetrics,
  type ReportCardStatusValue,
} from "@/lib/lms/report-card-core";
import { SKILL_LABEL, LEVEL_LABEL as SKILL_LEVEL_LABEL } from "@/lib/lms/skills";
import type { RoboticsSkill, SkillLevel } from "@prisma/client";
import { saveReportCardAction, transitionReportCardAction } from "../_actions";

const LEVEL_LABEL: Record<number, string> = {
  1: "1 · Cần cố gắng",
  2: "2 · Đạt",
  3: "3 · Khá",
  4: "4 · Tốt",
};

type ScoreState = { criterionId: string; level: number; note: string };
type PeriodState = { period: string; comment: string };

export function ReportCardEditor(props: {
  enrollmentId: string;
  status: ReportCardStatusValue;
  editable: boolean;
  canManage: boolean;
  canReview: boolean;
  publishedAt: string | null;
  metrics: ReportCardMetrics;
  criteria: { id: string; name: string }[];
  finalComment: string;
  completionStatus: string;
  periodComments: PeriodState[];
  scores: ScoreState[];
}) {
  const [pending, startTransition] = useTransition();
  const [finalComment, setFinalComment] = useState(props.finalComment);
  const [completionStatus, setCompletionStatus] = useState(props.completionStatus);
  const [periods, setPeriods] = useState<PeriodState[]>(props.periodComments);
  const [scores, setScores] = useState<ScoreState[]>(props.scores);
  const [reason, setReason] = useState("");

  const { editable, status, canManage, canReview, metrics } = props;
  const att = metrics.attendance;

  function setScore(criterionId: string, patch: Partial<ScoreState>) {
    setScores((prev) => prev.map((s) => (s.criterionId === criterionId ? { ...s, ...patch } : s)));
  }

  function save() {
    startTransition(async () => {
      const res = await saveReportCardAction({
        enrollmentId: props.enrollmentId,
        finalComment,
        completionStatus,
        periodComments: periods.filter((p) => p.period || p.comment),
        scores: scores.filter((s) => s.level >= 1 && s.level <= 4).map((s) => ({
          criterionId: s.criterionId,
          level: s.level,
          note: s.note,
        })),
      });
      if (res.ok) toast.success("Đã lưu học bạ");
      else toast.error(res.error);
    });
  }

  function transition(to: ReportCardStatusValue, needReason: boolean) {
    if (needReason && !reason.trim()) {
      toast.error("Cần nhập lý do");
      return;
    }
    startTransition(async () => {
      const res = await transitionReportCardAction({ enrollmentId: props.enrollmentId, to, reason });
      if (res.ok) {
        toast.success("Đã cập nhật trạng thái");
        setReason("");
      } else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-5">
      {/* Status + số liệu động */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-700">
          {REPORT_CARD_STATUS_LABEL[status]}
        </span>
        {props.publishedAt ? (
          <span className="text-xs text-neutral-400">
            Phát hành: {new Date(props.publishedAt).toLocaleString("vi-VN")}
          </span>
        ) : null}
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-neutral-700">Số liệu (tự đổ, live)</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Chuyên cần", value: `${att.attended}/${att.total} (${att.rate}%)` },
            { label: "Vắng (chưa bù)", value: att.absent },
            { label: "Đã học bù", value: att.madeUp },
            { label: "Chờ bù", value: att.needMakeup },
            { label: "Bài kiểm tra", value: metrics.exams.count },
            { label: "KT đạt", value: metrics.exams.passed },
            { label: "Điểm TB KT", value: metrics.exams.averageScore ?? "—" },
            ...(metrics.assignments
              ? [
                  {
                    label: "Bài tập (nộp/giao)",
                    value: `${metrics.assignments.submitted}/${metrics.assignments.total}`,
                  },
                  { label: "Bài tập đã chấm", value: metrics.assignments.graded },
                  { label: "Điểm TB bài tập", value: metrics.assignments.averageScore ?? "—" },
                ]
              : []),
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-neutral-200 p-3">
              <div className="text-xs text-neutral-400">{s.label}</div>
              <div className="text-lg font-bold text-neutral-900">{s.value}</div>
            </div>
          ))}
        </div>
        {metrics.skills && metrics.skills.length > 0 ? (
          <div className="mt-3">
            <h3 className="mb-1 text-xs font-semibold text-neutral-500">Kỹ năng robot (mới nhất)</h3>
            <ul className="flex flex-wrap gap-2">
              {metrics.skills.map((sk) => (
                <li
                  key={sk.skill}
                  className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-700"
                >
                  {SKILL_LABEL[sk.skill as RoboticsSkill] ?? sk.skill}:{" "}
                  <span className="font-medium">
                    {SKILL_LEVEL_LABEL[sk.level as SkillLevel] ?? sk.level}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="mt-2 text-xs text-neutral-400">
          Số liệu được đóng băng vào bản phát hành tại thời điểm phát hành.
        </p>
      </section>

      {/* Nhận xét theo giai đoạn */}
      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-700">Nhận xét theo giai đoạn</h2>
          {editable ? (
            <button
              type="button"
              onClick={() => setPeriods((p) => [...p, { period: "", comment: "" }])}
              className="text-xs font-medium text-purple-700"
            >
              + Thêm giai đoạn
            </button>
          ) : null}
        </div>
        {periods.length === 0 ? (
          <p className="text-sm text-neutral-400">Chưa có nhận xét giai đoạn.</p>
        ) : (
          <div className="space-y-2">
            {periods.map((p, i) => (
              <div key={i} className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={p.period}
                  disabled={!editable}
                  placeholder="Giai đoạn (vd Giữa khoá)"
                  onChange={(e) =>
                    setPeriods((prev) => prev.map((x, j) => (j === i ? { ...x, period: e.target.value } : x)))
                  }
                  className="rounded-md border border-neutral-300 px-3 py-2 text-sm sm:w-48"
                />
                <input
                  value={p.comment}
                  disabled={!editable}
                  placeholder="Nhận xét"
                  onChange={(e) =>
                    setPeriods((prev) => prev.map((x, j) => (j === i ? { ...x, comment: e.target.value } : x)))
                  }
                  className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
                {editable ? (
                  <button
                    type="button"
                    onClick={() => setPeriods((prev) => prev.filter((_, j) => j !== i))}
                    className="text-xs text-rose-600"
                  >
                    Xoá
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Chấm năng lực theo tiêu chí */}
      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-neutral-700">Đánh giá năng lực (thang 1–4)</h2>
        {props.criteria.length === 0 ? (
          <p className="text-sm text-neutral-400">Khoá chưa có tiêu chí.</p>
        ) : (
          <div className="space-y-2">
            {props.criteria.map((c) => {
              const sc = scores.find((s) => s.criterionId === c.id);
              return (
                <div key={c.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="sm:w-56 text-sm font-medium text-neutral-700">{c.name}</div>
                  <select
                    value={sc?.level ?? 0}
                    disabled={!editable}
                    onChange={(e) => setScore(c.id, { level: Number(e.target.value) })}
                    className="rounded-md border border-neutral-300 px-3 py-2 text-sm sm:w-44"
                  >
                    <option value={0}>— Chưa chấm —</option>
                    {[1, 2, 3, 4].map((lv) => (
                      <option key={lv} value={lv}>
                        {LEVEL_LABEL[lv]}
                      </option>
                    ))}
                  </select>
                  <input
                    value={sc?.note ?? ""}
                    disabled={!editable}
                    placeholder="Ghi chú (tuỳ chọn)"
                    onChange={(e) => setScore(c.id, { note: e.target.value })}
                    className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Nhận xét tổng kết */}
      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-neutral-700">Tổng kết</h2>
        <label className="mb-1 block text-xs text-neutral-500">Kết quả hoàn thành</label>
        <input
          value={completionStatus}
          disabled={!editable}
          placeholder="vd Hoàn thành tốt"
          onChange={(e) => setCompletionStatus(e.target.value)}
          className="mb-3 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm sm:w-72"
        />
        <label className="mb-1 block text-xs text-neutral-500">Nhận xét tổng kết</label>
        <textarea
          value={finalComment}
          disabled={!editable}
          rows={4}
          onChange={(e) => setFinalComment(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </section>

      {/* Lý do (cho trả lại / thu hồi) */}
      {canReview && (status === "PENDING_REVIEW" || status === "PUBLISHED") ? (
        <div>
          <label className="mb-1 block text-xs text-neutral-500">Lý do (bắt buộc khi trả lại / thu hồi)</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      ) : null}

      {/* Hành động */}
      <div className="flex flex-wrap gap-2">
        {editable ? (
          <button
            type="button"
            disabled={pending}
            onClick={save}
            className="rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Lưu nháp
          </button>
        ) : null}

        {canManage && (status === "DRAFT" || status === "RECALLED") ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => transition("PENDING_REVIEW", false)}
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {status === "RECALLED" ? "Nộp lại để duyệt" : "Nộp duyệt"}
          </button>
        ) : null}

        {canReview && status === "PENDING_REVIEW" ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => transition("PUBLISHED", false)}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Phát hành
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => transition("DRAFT", true)}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50"
            >
              Trả lại (nháp)
            </button>
          </>
        ) : null}

        {canReview && status === "PUBLISHED" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => transition("RECALLED", true)}
            className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Thu hồi
          </button>
        ) : null}
      </div>
    </div>
  );
}
