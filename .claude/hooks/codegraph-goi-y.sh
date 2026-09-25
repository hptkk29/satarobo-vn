#!/usr/bin/env bash
# UserPromptSubmit — CodeGraph gợi ý symbol khớp với câu hỏi trước mỗi lượt.
# Máy chưa cài codegraph thì im lặng bỏ qua: hook này nằm trong repo nên chạy trên MỌI máy
# clone về, và một lỗi hiện ra ở mỗi lượt hỏi là thứ người ta học cách phớt lờ.
command -v codegraph >/dev/null 2>&1 || exit 0
exec codegraph prompt-hook
