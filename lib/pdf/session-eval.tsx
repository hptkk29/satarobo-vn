import React from "react";
import path from "path";
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import {
  EVAL_NOTE_FIELDS,
  evalLevelText,
  groupedEvalCriteria,
  type EvalNotes,
} from "@/lib/lms/session-eval-rubric";

const FONT_REGULAR = path.join(process.cwd(), "public/fonts/NotoSans-Regular.ttf");
const FONT_BOLD = path.join(process.cwd(), "public/fonts/NotoSans-Bold.ttf");
Font.register({
  family: "NotoSans",
  fonts: [
    { src: FONT_REGULAR, fontWeight: "normal" },
    { src: FONT_BOLD, fontWeight: "bold" },
  ],
});

const s = StyleSheet.create({
  page: { padding: 36, fontFamily: "NotoSans", fontSize: 10, color: "#222" },
  brand: { fontSize: 16, fontWeight: "bold", color: "#F97316" },
  title: { fontSize: 14, fontWeight: "bold", marginTop: 4 },
  headerBox: {
    marginTop: 10,
    backgroundColor: "#F97316",
    color: "#fff",
    padding: 12,
    borderRadius: 6,
  },
  hLabel: { fontSize: 9, color: "#ffe" },
  hName: { fontSize: 16, fontWeight: "bold", color: "#fff", marginTop: 2 },
  project: { marginTop: 12, fontSize: 11 },
  projectLabel: { fontWeight: "bold", color: "#333" },
  section: { fontSize: 12, fontWeight: "bold", marginTop: 14, marginBottom: 4, color: "#EA580C" },
  noteRow: { marginTop: 6 },
  noteLabel: { fontSize: 10, fontWeight: "bold", color: "#333" },
  notePara: { marginTop: 2, lineHeight: 1.4, color: "#333" },
  group: { fontSize: 11, fontWeight: "bold", marginTop: 10, marginBottom: 2, color: "#333" },
  critRow: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#eee", paddingVertical: 4 },
  critLabel: { width: "34%", fontWeight: "bold" },
  critLevel: { width: "66%", color: "#333" },
  foot: { marginTop: 20, fontSize: 9, color: "#666", textAlign: "right" },
});

export interface SessionEvalPdfData {
  studentName: string;
  courseName: string;
  className: string;
  sessionTopic: string;
  /** "dd/mm/yyyy". */
  dateLabel: string;
  projectName: string | null;
  notes: EvalNotes;
  ratings: Record<string, number>;
  evaluatedByName: string | null;
}

const GROUPS = groupedEvalCriteria();

export function SessionEvalPdf({ data }: { data: SessionEvalPdfData }) {
  const hasNotes = EVAL_NOTE_FIELDS.some((f) => (data.notes[f.key] ?? "").trim().length > 0);
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.brand}>SATA ROBO</Text>
        <Text style={s.title}>PHIẾU NHẬN XÉT BUỔI HỌC</Text>

        <View style={s.headerBox}>
          <Text style={s.hLabel}>
            {data.courseName} · {data.className}
          </Text>
          <Text style={s.hName}>{data.studentName}</Text>
          <Text style={s.hLabel}>
            {data.sessionTopic} ({data.dateLabel})
          </Text>
        </View>

        <Text style={s.project}>
          <Text style={s.projectLabel}>Dự án: </Text>
          {data.projectName ?? "—"}
        </Text>

        <Text style={s.section}>1. Nhận xét của giáo viên</Text>
        {hasNotes ? (
          EVAL_NOTE_FIELDS.map((f) => {
            const v = (data.notes[f.key] ?? "").trim();
            if (!v) return null;
            return (
              <View key={f.key} style={s.noteRow} wrap={false}>
                <Text style={s.noteLabel}>{f.label}</Text>
                <Text style={s.notePara}>{v}</Text>
              </View>
            );
          })
        ) : (
          <Text style={s.notePara}>—</Text>
        )}

        <Text style={s.section}>2. Đánh giá chi tiết năng lực</Text>
        {GROUPS.map(([group, items]) => (
          <View key={group} wrap={false}>
            <Text style={s.group}>{group}</Text>
            {items.map((c) => (
              <View key={c.id} style={s.critRow}>
                <Text style={s.critLabel}>{c.name}</Text>
                <Text style={s.critLevel}>{evalLevelText(c.id, data.ratings[c.id] ?? 3)}</Text>
              </View>
            ))}
          </View>
        ))}

        <Text style={s.foot}>
          Người nhận xét: {data.evaluatedByName ?? "—"} · Ngày: {data.dateLabel}
        </Text>
      </Page>
    </Document>
  );
}
