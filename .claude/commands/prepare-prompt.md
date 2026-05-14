---
description: Convert user's raw request thành structured phase prompt (Sata Robo format)
---

# /prepare-prompt

Khi user paste ý tưởng/spec phase rỗng, convert thành prompt structured để chạy được.

## Template

```markdown
# Prompt 4.X — <Feature Name>

> **Project:** satarobo-vn
> **Phase:** 4.X
> **Time estimate:** <best-guess>
> **Risk level:** 🟢 LOW | 🟡 MED | 🔴 HIGH
> **Prerequisites:** <previous phases>

## 🎯 MỤC TIÊU

<1-2 paragraphs about what we build and why>

## 📦 SCOPE — N NHIỆM VỤ

1. ...
2. ...
N. Verify + acceptance criteria

## 1️⃣ Schema/data changes (nếu có)

<Prisma model snippets>

## 2️⃣ Code changes

<File-by-file plan>

## 3️⃣ UI

<Components needed, screenshots/wireframes if user provides>

## ✅ ACCEPTANCE CRITERIA

- [ ] pnpm typecheck PASS
- [ ] pnpm lint PASS
- [ ] pnpm build PASS
- [ ] Smoke test for user (specific URLs)

## 🚫 KHÔNG LÀM TRONG PHASE NÀY

- ❌ ...
- ❌ ...

## 📝 GIT COMMIT MESSAGE
\`\`\`
feat(<scope>): <summary>

<bullets>
\`\`\`
```

## Steps

1. **Đọc CLAUDE.md** + relevant `.claude/rules/*.md` để biết constraints.
2. **Ask user** các điểm thiếu rõ:
   - Schema fields nếu chưa cho.
   - UI mockup nếu page lạ.
   - Performance budget nếu khác default.
3. **Identify risk**:
   - DB schema change → 🔴 HIGH (cần 2-phase migration pattern, xem `prisma-db.md`).
   - New page only → 🟢 LOW.
   - Auth/RBAC change → 🔴 HIGH.
4. **Output prompt** format trên, paste để user review/edit.

## Anti-patterns

- ❌ Giả định fields/routes user không nói rõ.
- ❌ Skip acceptance criteria.
- ❌ Quên risk level + prerequisites.
