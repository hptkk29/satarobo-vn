import React from "react";
import path from "path";
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import { RUBRIC, RUBRIC_MAX, fmtScore } from "@/lib/trial/rubric";

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
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#F97316",
    color: "#fff",
    padding: 12,
    borderRadius: 6,
  },
  hLabel: { fontSize: 9, color: "#ffe" },
  hName: { fontSize: 16, fontWeight: "bold", color: "#fff", marginTop: 2 },
  hScore: { fontSize: 22, fontWeight: "bold", color: "#fff", textAlign: "right" },
  hRank: { fontSize: 10, color: "#fff", textAlign: "right", marginTop: 2 },
  section: { fontSize: 12, fontWeight: "bold", marginTop: 14, marginBottom: 4, color: "#EA580C" },
  critRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#eee",
    paddingVertical: 4,
  },
  critLabel: { width: "48%", fontWeight: "bold" },
  critLevel: { width: "40%", color: "#333" },
  critPts: { width: "12%", textAlign: "right", fontWeight: "bold", color: "#EA580C" },
  subTitle: { fontSize: 11, fontWeight: "bold", marginTop: 12, color: "#333" },
  para: { marginTop: 4, lineHeight: 1.4 },
  foot: { marginTop: 20, fontSize: 9, color: "#666", textAlign: "right" },
});

export interface TrialEvalPdfData {
  studentName: string;
  courseName: string | null;
  trialClassName: string;
  scores: Record<string, number>;
  totalScore: number;
  rank: string;
  generalComment: string | null;
  orientation: string | null;
  evaluatedByName: string | null;
  /** "dd/mm/yyyy". */
  dateLabel: string;
}

export function TrialEvalPdf({ data }: { data: TrialEvalPdfData }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.brand}>SATA ROBO</Text>
        <Text style={s.title}>PHIẾU ĐÁNH GIÁ BUỔI TRẢI NGHIỆM</Text>

        <View style={s.headerBox}>
          <View>
            <Text style={s.hLabel}>
              Học viên Trial{data.courseName ? ` · ${data.courseName}` : ""}
            </Text>
            <Text style={s.hName}>{data.studentName}</Text>
            <Text style={s.hLabel}>{data.trialClassName}</Text>
          </View>
          <View>
            <Text style={s.hScore}>
              {fmtScore(data.totalScore)} / {RUBRIC_MAX}.0
            </Text>
            <Text style={s.hRank}>Tổng điểm · {data.rank}</Text>
          </View>
        </View>

        {RUBRIC.map((sec) => (
          <View key={sec.num} wrap={false}>
            <Text style={s.section}>
              {sec.num}. {sec.title}
            </Text>
            {sec.criteria.map((c) => {
              const pts = data.scores[c.id] ?? 0;
              const lvl = c.levels.find((l) => l.points === pts) ?? c.levels[c.levels.length - 1];
              return (
                <View key={c.id} style={s.critRow}>
                  <Text style={s.critLabel}>{c.label}</Text>
                  <Text style={s.critLevel}>
                    {lvl?.title}
                    {lvl?.desc ? ` — ${lvl.desc}` : ""}
                  </Text>
                  <Text style={s.critPts}>{fmtScore(pts)}</Text>
                </View>
              );
            })}
          </View>
        ))}

        <Text style={s.section}>4. Định hướng của SataRobo</Text>
        {data.generalComment ? (
          <View>
            <Text style={s.subTitle}>Nhận xét chung</Text>
            <Text style={s.para}>{data.generalComment}</Text>
          </View>
        ) : null}
        {data.orientation ? (
          <View>
            <Text style={s.subTitle}>Định hướng</Text>
            <Text style={s.para}>{data.orientation}</Text>
          </View>
        ) : null}

        <Text style={s.foot}>
          Người đánh giá: {data.evaluatedByName ?? "—"} · Ngày: {data.dateLabel}
        </Text>
      </Page>
    </Document>
  );
}
