"use client";

import { useState, useCallback } from "react";
import * as XLSX from "xlsx";
import { useDropzone } from "react-dropzone";
import {
  FileSpreadsheet,
  Download,
  Upload,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export interface ImportResult {
  success: number;
  errors: { row: number; error: string }[];
}

export interface ExcelImporterProps<T> {
  templateUrl: string;
  templateFilename: string;
  parseRow: (row: Record<string, unknown>, rowIndex: number) => T | { error: string };
  onImport: (rows: T[]) => Promise<ImportResult>;
  columnHints: { key: string; label: string; required?: boolean }[];
  title?: string;
}

type Step = "idle" | "preview" | "importing" | "done";

function isErrorRow<T>(row: T | { error: string }): row is { error: string } {
  return typeof row === "object" && row !== null && "error" in row;
}

export function ExcelImporter<T>({
  templateUrl,
  templateFilename,
  parseRow,
  onImport,
  columnHints,
  title = "Import từ Excel",
}: ExcelImporterProps<T>) {
  const [step, setStep] = useState<Step>("idle");
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [parsedRows, setParsedRows] = useState<(T | { error: string })[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [filename, setFilename] = useState("");

  const parseFile = useCallback(
    async (file: File) => {
      try {
        setFilename(file.name);
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        const firstSheetName = wb.SheetNames[0];
        if (!firstSheetName) {
          alert("File Excel không có sheet nào");
          return;
        }
        const sheet = wb.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: null,
        });
        if (rows.length === 0) {
          alert("File Excel rỗng hoặc sai format");
          return;
        }
        if (rows.length > 5000) {
          alert(`File quá lớn (${rows.length} rows). Tối đa 5000.`);
          return;
        }
        setRawRows(rows);
        setParsedRows(rows.map((row, idx) => parseRow(row, idx)));
        setStep("preview");
      } catch (err) {
        alert(`Lỗi đọc file: ${err instanceof Error ? err.message : "Unknown"}`);
      }
    },
    [parseRow],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    multiple: false,
    disabled: step === "importing",
    onDrop: (files) => {
      if (files[0]) parseFile(files[0]);
    },
  });

  const validRows = parsedRows.filter((r): r is T => !isErrorRow(r));
  const errorCount = parsedRows.length - validRows.length;

  const handleImport = async () => {
    setStep("importing");
    try {
      const res = await onImport(validRows);
      setResult(res);
      setStep("done");
    } catch (err) {
      alert(`Import thất bại: ${err instanceof Error ? err.message : "Unknown"}`);
      setStep("preview");
    }
  };

  const reset = () => {
    setStep("idle");
    setRawRows([]);
    setParsedRows([]);
    setResult(null);
    setFilename("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{title}</h3>
        <a
          href={templateUrl}
          download={templateFilename}
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
        >
          <Download className="h-4 w-4" />
          Tải Template
        </a>
      </div>

      {step === "idle" && (
        <div
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
            isDragActive
              ? "border-primary bg-primary/5"
              : "border-gray-300 hover:border-gray-400",
          )}
        >
          <input {...getInputProps()} />
          <FileSpreadsheet className="h-12 w-12 mx-auto text-gray-400 mb-3" />
          <p className="font-medium">Kéo thả file Excel hoặc click để chọn</p>
          <p className="text-xs text-gray-500 mt-1">
            .xlsx / .xls — tối đa 10MB / 5000 rows
          </p>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-3">
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              File: <strong>{filename}</strong> — {rawRows.length} rows | ✅ Hợp lệ:{" "}
              <strong className="text-green-600">{validRows.length}</strong> | ❌ Lỗi:{" "}
              <strong className="text-red-600">{errorCount}</strong>
            </AlertDescription>
          </Alert>
          <div className="border rounded-lg overflow-x-auto max-h-[400px]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-2 py-1 text-left">#</th>
                  {columnHints.map((c) => (
                    <th key={c.key} className="px-2 py-1 text-left">
                      {c.label}
                      {c.required && <span className="text-red-500">*</span>}
                    </th>
                  ))}
                  <th className="px-2 py-1 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {parsedRows.slice(0, 100).map((row, idx) => {
                  const errored = isErrorRow(row);
                  return (
                    <tr key={idx} className={cn("border-t", errored && "bg-red-50")}>
                      <td className="px-2 py-1">{idx + 2}</td>
                      {columnHints.map((c) => (
                        <td key={c.key} className="px-2 py-1 truncate max-w-[200px]">
                          {String(rawRows[idx]?.[c.key] ?? "—")}
                        </td>
                      ))}
                      <td className="px-2 py-1">
                        {errored ? (
                          <span className="text-red-600 text-xs">{row.error}</span>
                        ) : (
                          <span className="text-green-600">✓</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {parsedRows.length > 100 && (
              <p className="p-2 text-xs text-center text-gray-500 bg-gray-50">
                Hiển thị 100/{parsedRows.length} rows. Toàn bộ sẽ được import nếu hợp lệ.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleImport} disabled={validRows.length === 0}>
              <Upload className="h-4 w-4 mr-1" />
              Import {validRows.length} rows
            </Button>
            <Button variant="outline" onClick={reset}>
              Huỷ
            </Button>
          </div>
        </div>
      )}

      {step === "importing" && (
        <div className="border rounded-lg p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-sm">Đang import {validRows.length} rows...</p>
        </div>
      )}

      {step === "done" && result && (
        <div className="space-y-3">
          <Alert className={result.errors.length === 0 ? "border-green-500" : "border-yellow-500"}>
            {result.errors.length === 0 ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-yellow-600" />
            )}
            <AlertDescription>
              ✅ Thành công: <strong>{result.success}</strong>
              {result.errors.length > 0 && (
                <>
                  {" "}
                  | ❌ Lỗi: <strong>{result.errors.length}</strong>
                </>
              )}
            </AlertDescription>
          </Alert>
          {result.errors.length > 0 && (
            <div className="border rounded-lg max-h-[300px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left">Row</th>
                    <th className="px-2 py-1 text-left">Lỗi</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((e, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1">{e.row}</td>
                      <td className="px-2 py-1 text-red-600">{e.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Button onClick={reset}>Import file khác</Button>
        </div>
      )}
    </div>
  );
}
