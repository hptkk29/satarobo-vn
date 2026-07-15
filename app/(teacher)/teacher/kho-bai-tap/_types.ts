// app/(teacher)/teacher/kho-bai-tap/_types.ts — plain data server → client (Kho bài tập).
import type { AssignmentKind, QuestionType } from "@prisma/client";

export interface KhoChoice {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface KhoQuestion {
  id: string;
  type: QuestionType; // MULTIPLE_CHOICE | ESSAY (GV chỉ soạn 2 loại này)
  text: string;
  points: number | null;
  /** Đáp án mẫu cho câu tự luận (ESSAY); null với trắc nghiệm. */
  correctAnswer: string | null;
  choices: KhoChoice[];
}

export interface KhoTemplate {
  id: string;
  title: string;
  description: string;
  instructions: string | null;
  kind: AssignmentKind; // HOMEWORK = "Bài tập" · CLASSWORK = "Kiểm tra"
  totalPoints: number;
  questionCount: number;
  /** Đã format "dd/MM/yyyy" (giờ VN) — string để truyền xuống client an toàn. */
  createdAt: string;
  questions: KhoQuestion[];
}
