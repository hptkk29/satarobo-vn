---
name: no-overengineering
description: Reject premature abstraction. Don't add config systems, plugin patterns, generic helpers, or factory functions until same code repeats 3+ times. Use when tempted to create FormBuilder, ConfigManager, "flexible" abstraction layers.
---

# No over-engineering

## Trigger phrases (red flags)

- "Generic FormBuilder cho tất cả admin forms"
- "ConfigManager để load config từ nhiều nguồn"
- "Plugin system cho honor card variants"
- "Abstract base class cho data table"
- "Flexible enough to support future requirements"

## Rule of 3

3 similar lines is BETTER than premature abstraction. Wait for the 3rd repetition before extracting helper.

## Don't add

- ❌ Config files cho hardcoded values (just inline `const X = ...`).
- ❌ Generic wrappers wrap thư viện có 1 use case.
- ❌ Type-safe builder pattern cho form có 5 fields.
- ❌ Error handling cho impossible cases (trust framework guarantees).
- ❌ Feature flags cho features chưa launch.

## Prisma example

❌ Sai:
```typescript
// Generic repository base
class Repository<T> {
  constructor(private model: PrismaModel<T>) {}
  async findById(id: string) { ... }
  async findMany(filter: Filter<T>) { ... }
}
```

✅ Đúng:
```typescript
// Just use db.thing.findUnique({ where: { id } }) directly.
const thing = await db.thing.findUnique({ where: { id } })
```

## Form example

❌ Sai (premature):
```typescript
<FormBuilder
  fields={[
    { name: 'fullName', type: 'text', required: true },
    { name: 'jobTitle', type: 'text', required: true },
  ]}
  onSubmit={handleSubmit}
/>
```

✅ Đúng (concrete):
```tsx
<form onSubmit={handleSubmit}>
  <label>Họ tên</label>
  <input name="fullName" required />
  <label>Chức danh</label>
  <input name="jobTitle" required />
  <button type="submit">Lưu</button>
</form>
```

→ Nếu sau này có 3 forms identical pattern → extract `<TextField>`. Chưa đến đó.

## When extraction IS OK

- 3+ files repeat same 10+ lines logic.
- Helper improves test surface (unit-testable in isolation).
- Type narrowing requires it (e.g., `getHonorView` để TypeScript flow analysis).
