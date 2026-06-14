// lib/settings — R6-A: tham số vận hành động (SystemSetting).
// Dùng: `import { getSetting } from "@/lib/settings"` rồi `await getSetting("student.nearEndThreshold")`.
export * from "./registry";
export { getSetting, setSetting, invalidateSettingCache } from "./get-setting";
