// lib/pdf/trial-eval.tsx — PHIẾU ĐÁNH GIÁ & ĐỊNH HƯỚNG PHÁT TRIỂN NĂNG LỰC (buổi trải nghiệm).
//
// Bám đúng bản thiết kế giấy trung tâm đang phát cho phụ huynh: nền kem, header logo +
// gạch cam, hộp tiêu đề, lưới thông tin 2×2, bảng tiêu chí có cột nhóm màu cam, hộp
// định hướng, khối ký tên. Nội dung lấy nguyên từ rubric 8.0 (lib/trial/rubric.ts) —
// mỗi tiêu chí in đủ 3 mức, mức được chọn tô cam như phiếu tick tay.
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Svg,
  Defs,
  LinearGradient,
  Stop,
  Rect,
} from "@react-pdf/renderer";
import { RUBRIC, RUBRIC_MAX, fmtScore } from "@/lib/trial/rubric";
import { BRAND, BRAND_TAGLINE, logoSrc } from "@/lib/pdf/brand";

const s = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: "NotoSans",
    fontSize: 9.5,
    color: BRAND.text,
    backgroundColor: BRAND.cream,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 3,
    borderBottomColor: BRAND.orange,
    paddingBottom: 8,
    marginBottom: 10,
  },
  logo: { width: 82 },
  tagline: {
    flex: 1,
    textAlign: "center",
    fontSize: 8,
    fontWeight: "bold",
    color: BRAND.orange,
    letterSpacing: 0.6,
  },

  titleBox: {
    backgroundColor: BRAND.box,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 8,
    alignItems: "center",
  },
  titleText: {
    fontSize: 12.5,
    fontWeight: "bold",
    color: BRAND.purple,
    textTransform: "uppercase",
    textAlign: "center",
  },
  titleSub: { fontSize: 8.5, color: "#555555", marginTop: 2 },

  infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  infoCell: {
    width: "48.7%",
    borderWidth: 1,
    borderColor: BRAND.line,
    backgroundColor: "#FFFFFF",
    borderRadius: 5,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  infoLabel: {
    fontSize: 7,
    color: BRAND.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  infoValue: { fontSize: 10, fontWeight: "bold", color: BRAND.textStrong },

  scoreBand: {
    position: "relative",
    borderRadius: 8,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  scoreLabel: { fontSize: 8, color: "#E9DFF6", letterSpacing: 0.6, textTransform: "uppercase" },
  scoreValue: { fontSize: 18, fontWeight: "bold", color: "#FFFFFF", marginTop: 2 },
  pill: {
    backgroundColor: BRAND.orange,
    borderRadius: 30,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  pillText: { fontSize: 10, fontWeight: "bold", color: "#FFFFFF" },

  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: BRAND.purple,
    textTransform: "uppercase",
    borderBottomWidth: 2,
    borderBottomColor: BRAND.lineSoft,
    paddingBottom: 4,
    marginTop: 8,
    marginBottom: 5,
  },

  evalGrid: {
    borderWidth: 1,
    borderColor: BRAND.line,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  evalRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BRAND.lineSoft },
  evalRowLast: { borderBottomWidth: 0 },
  evalGroupCell: {
    width: "23%",
    backgroundColor: BRAND.cell,
    borderRightWidth: 1,
    borderRightColor: BRAND.lineSoft,
    paddingVertical: 8,
    paddingHorizontal: 9,
    justifyContent: "center",
  },
  evalGroupNum: { fontSize: 7, color: BRAND.textMuted, marginBottom: 2 },
  evalGroupText: { fontSize: 9.5, fontWeight: "bold", color: BRAND.orange },
  evalContent: { width: "77%", paddingVertical: 5, paddingHorizontal: 9 },

  crit: { marginBottom: 4 },
  critLast: { marginBottom: 0 },
  critHead: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  critLabel: { flex: 1, fontSize: 9, fontWeight: "bold", color: BRAND.textStrong },
  critPts: { fontSize: 9, fontWeight: "bold", color: BRAND.orange },
  optRow: { flexDirection: "row", gap: 6 },
  opt: { flexDirection: "row", width: "31.5%" },
  circle: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.2, marginRight: 4, marginTop: 1.2 },
  optBody: { flex: 1 },
  optText: { fontSize: 7.8, lineHeight: 1.2 },
  critDesc: { fontSize: 7.2, color: BRAND.textMuted, marginTop: 1.5, lineHeight: 1.2 },

  recBox: {
    borderWidth: 1,
    borderColor: BRAND.line,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 9,
  },
  recLabel: { fontSize: 9, fontWeight: "bold", color: BRAND.purple, marginBottom: 3 },
  recPara: { fontSize: 9.5, lineHeight: 1.4 },
  recDivider: { marginTop: 6 },
  bulletRow: { flexDirection: "row", marginTop: 2 },
  bulletDot: { width: 10, fontSize: 9.5, color: BRAND.orange },
  bulletText: { flex: 1, fontSize: 9.5, lineHeight: 1.4 },

  foot: { marginTop: 8, textAlign: "right", fontSize: 8.5, color: BRAND.textMuted },
  footName: { fontWeight: "bold", color: BRAND.purple },
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

/** Nền chuyển sắc tím — @react-pdf không hiểu CSS linear-gradient, phải vẽ bằng Svg. */
function GradientBg() {
  return (
    <Svg
      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <Defs>
        <LinearGradient id="trialBand" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={BRAND.purple} />
          <Stop offset="1" stopColor={BRAND.purpleLight} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="100" fill="url(#trialBand)" />
    </Svg>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoCell}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

/** Tách "Định hướng" (nhiều dòng, có thể đã có "•" sẵn) thành các gạch đầu dòng. */
function bulletLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.trim().replace(/^[•\-*]\s*/, ""))
    .filter(Boolean);
}

export function TrialEvalPdf({ data }: { data: TrialEvalPdfData }) {
  const orientationLines = data.orientation ? bulletLines(data.orientation) : [];

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Image src={logoSrc()} style={s.logo} />
          <Text style={s.tagline}>{BRAND_TAGLINE}</Text>
        </View>

        <View style={s.titleBox}>
          <Text style={s.titleText}>Phiếu đánh giá &amp; định hướng phát triển năng lực</Text>
          <Text style={s.titleSub}>Kết quả buổi học trải nghiệm</Text>
        </View>

        <View style={s.infoGrid}>
          <InfoCell label="Họ và tên học sinh" value={data.studentName} />
          <InfoCell label="Khoá học quan tâm" value={data.courseName ?? "—"} />
          <InfoCell label="Lớp trải nghiệm" value={data.trialClassName} />
          <InfoCell label="Ngày đánh giá" value={data.dateLabel} />
        </View>

        <View style={s.scoreBand}>
          <GradientBg />
          <View>
            <Text style={s.scoreLabel}>Tổng điểm đánh giá</Text>
            <Text style={s.scoreValue}>
              {fmtScore(data.totalScore)} / {RUBRIC_MAX}.0
            </Text>
          </View>
          <View style={s.pill}>
            <Text style={s.pillText}>Xếp loại: {data.rank}</Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>1. Đánh giá năng lực chi tiết</Text>
        <View style={s.evalGrid}>
          {RUBRIC.map((sec, secIdx) => (
            <View
              key={sec.num}
              style={secIdx === RUBRIC.length - 1 ? [s.evalRow, s.evalRowLast] : s.evalRow}
              wrap={false}
            >
              <View style={s.evalGroupCell}>
                <Text style={s.evalGroupNum}>Nhóm {sec.num}</Text>
                <Text style={s.evalGroupText}>{sec.title}</Text>
              </View>
              <View style={s.evalContent}>
                {sec.criteria.map((c, critIdx) => {
                  const pts = data.scores[c.id] ?? 0;
                  const picked =
                    c.levels.find((l) => l.points === pts) ?? c.levels[c.levels.length - 1];
                  return (
                    <View
                      key={c.id}
                      style={critIdx === sec.criteria.length - 1 ? [s.crit, s.critLast] : s.crit}
                    >
                      <View style={s.critHead}>
                        <Text style={s.critLabel}>{c.label}</Text>
                        <Text style={s.critPts}>{fmtScore(pts)} đ</Text>
                      </View>
                      <View style={s.optRow}>
                        {c.levels.map((l) => {
                          const on = l === picked;
                          return (
                            <View key={l.title} style={s.opt}>
                              <View
                                style={[
                                  s.circle,
                                  {
                                    borderColor: on ? BRAND.orange : BRAND.purple,
                                    backgroundColor: on ? BRAND.orange : "#FFFFFF",
                                  },
                                ]}
                              />
                              {/* Mô tả nằm TRONG ô mức được chọn — để riêng một dòng
                                  full-width thì nó luôn nằm dưới cột 1, gây hiểu nhầm
                                  là đang mô tả mức đầu tiên. */}
                              <View style={s.optBody}>
                                <Text
                                  style={[
                                    s.optText,
                                    on
                                      ? { color: BRAND.textStrong, fontWeight: "bold" }
                                      : { color: BRAND.textMuted },
                                  ]}
                                >
                                  {l.title}
                                </Text>
                                {on && l.desc ? <Text style={s.critDesc}>{l.desc}</Text> : null}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </View>

        <Text style={s.sectionTitle}>2. Nhận xét &amp; lộ trình đề xuất từ trung tâm</Text>
        <View style={s.recBox}>
          {data.generalComment ? (
            <View>
              <Text style={s.recLabel}>Nhận xét chung</Text>
              <Text style={s.recPara}>{data.generalComment}</Text>
            </View>
          ) : null}
          {orientationLines.length > 0 ? (
            <View style={data.generalComment ? s.recDivider : undefined}>
              <Text style={s.recLabel}>Định hướng</Text>
              {orientationLines.map((line, i) => (
                <View key={i} style={s.bulletRow}>
                  <Text style={s.bulletDot}>•</Text>
                  <Text style={s.bulletText}>{line}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {!data.generalComment && orientationLines.length === 0 ? (
            <Text style={s.recPara}>—</Text>
          ) : null}
        </View>

        <Text style={s.foot}>
          Người đánh giá: <Text style={s.footName}>{data.evaluatedByName ?? "—"}</Text>
        </Text>
      </Page>
    </Document>
  );
}
