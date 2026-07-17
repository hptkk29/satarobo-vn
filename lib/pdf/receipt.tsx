// lib/pdf/receipt.tsx — #15 (câu 26): bản IN phiếu thu (@react-pdf), song song bản
// điện tử ở portal (/portal/hoc-phi). Theo pattern lib/pdf/report-card.tsx. THUẦN
// render — mọi dữ liệu (mã phiếu, cơ sở, tên bé/PH, khoản, ngày, người thu) truyền vào.
// KHÔNG in CCCD phụ huynh trên phiếu (PII — chỉ hiển thị có kiểm soát ở màn kế toán).
import React from "react";
import path from "path";
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import { formatVndPlain } from "@/lib/format/money";

const FONT_REGULAR = path.join(process.cwd(), "public/fonts/NotoSans-Regular.ttf");
const FONT_BOLD = path.join(process.cwd(), "public/fonts/NotoSans-Bold.ttf");
Font.register({
  family: "NotoSans",
  fonts: [
    { src: FONT_REGULAR, fontWeight: "normal" },
    { src: FONT_BOLD, fontWeight: "bold" },
  ],
});

const METHOD_LABEL: Record<string, string> = {
  CASH: "Tiền mặt",
  BANK_TRANSFER: "Chuyển khoản",
  VNPAY: "VNPAY",
  TINGEE: "Tingee",
  COD: "COD",
  auto: "Ghi nhận tự động",
};

export type ReceiptPdfData = {
  receiptCode: string;
  centerName: string;
  centerAddress: string | null;
  issuedAt: string; // dd/mm/yyyy
  studentName: string | null;
  parentName: string | null;
  className: string | null;
  courseName: string | null;
  amount: number;
  method: string;
  paidDate: string; // dd/mm/yyyy
  collectedByName: string | null;
  orderCode: string | null;
};

function vnd(n: number): string {
  return formatVndPlain(n);
}

const s = StyleSheet.create({
  page: { padding: 40, fontFamily: "NotoSans", fontSize: 11, color: "#222" },
  brand: { fontSize: 16, fontWeight: "bold", color: "#F97316" },
  center: { fontSize: 10, color: "#555", marginTop: 2 },
  title: { fontSize: 18, fontWeight: "bold", marginTop: 18, textAlign: "center", color: "#7C3AED" },
  codeLine: { fontSize: 11, marginTop: 4, textAlign: "center", color: "#555" },
  row: { flexDirection: "row", marginTop: 10 },
  label: { width: "35%", color: "#555" },
  value: { width: "65%", fontWeight: "bold" },
  amountBox: {
    marginTop: 18,
    padding: 12,
    backgroundColor: "#faf5ff",
    borderRadius: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  amountLabel: { fontSize: 12, fontWeight: "bold", color: "#7C3AED" },
  amountValue: { fontSize: 16, fontWeight: "bold", color: "#7C3AED" },
  sign: { flexDirection: "row", marginTop: 48, justifyContent: "space-between" },
  signCol: { width: "45%", alignItems: "center" },
  signLabel: { fontSize: 11, fontWeight: "bold" },
  signHint: { fontSize: 9, color: "#888", marginTop: 2 },
  signName: { fontSize: 11, marginTop: 44 },
});

export function ReceiptPdf({ data }: { data: ReceiptPdfData }) {
  const methodLabel = METHOD_LABEL[data.method] ?? data.method;
  return (
    <Document>
      <Page size="A5" orientation="landscape" style={s.page}>
        <Text style={s.brand}>SATA ROBO</Text>
        <Text style={s.center}>
          {data.centerName}
          {data.centerAddress ? ` · ${data.centerAddress}` : ""}
        </Text>

        <Text style={s.title}>PHIẾU THU HỌC PHÍ</Text>
        <Text style={s.codeLine}>
          Số phiếu: {data.receiptCode} · Ngày: {data.issuedAt}
        </Text>

        <View style={s.row}>
          <Text style={s.label}>Học viên</Text>
          <Text style={s.value}>{data.studentName ?? "—"}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Phụ huynh</Text>
          <Text style={s.value}>{data.parentName ?? "—"}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Lớp / Khoá</Text>
          <Text style={s.value}>
            {[data.className, data.courseName].filter(Boolean).join(" · ") || "—"}
          </Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Hình thức</Text>
          <Text style={s.value}>{methodLabel}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Ngày thu</Text>
          <Text style={s.value}>{data.paidDate}</Text>
        </View>
        {data.orderCode ? (
          <View style={s.row}>
            <Text style={s.label}>Đơn hàng</Text>
            <Text style={s.value}>{data.orderCode}</Text>
          </View>
        ) : null}

        <View style={s.amountBox}>
          <Text style={s.amountLabel}>SỐ TIỀN</Text>
          <Text style={s.amountValue}>{vnd(data.amount)}</Text>
        </View>

        <View style={s.sign}>
          <View style={s.signCol}>
            <Text style={s.signLabel}>Người nộp tiền</Text>
            <Text style={s.signHint}>(Ký, ghi rõ họ tên)</Text>
          </View>
          <View style={s.signCol}>
            <Text style={s.signLabel}>Người thu tiền</Text>
            <Text style={s.signHint}>(Ký, ghi rõ họ tên)</Text>
            <Text style={s.signName}>{data.collectedByName ?? ""}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
