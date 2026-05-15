// Rolling deadline: ngày 5, 10, 15, 20, 25 mỗi tháng. Sau ngày 25 → cuối tháng.

export interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
  expired: boolean;
}

export function getNextDeadline(): Date {
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth();
  const year = now.getFullYear();
  const milestones = [5, 10, 15, 20, 25];

  for (const milestone of milestones) {
    if (day <= milestone) {
      return new Date(year, month, milestone, 23, 59, 59);
    }
  }
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, lastDayOfMonth, 23, 59, 59);
}

export function formatDeadline(deadline: Date): string {
  const dd = String(deadline.getDate()).padStart(2, "0");
  const mm = String(deadline.getMonth() + 1).padStart(2, "0");
  const yyyy = deadline.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function getTimeRemaining(deadline: Date): TimeRemaining {
  const now = new Date();
  const diff = deadline.getTime() - now.getTime();

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0, expired: true };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  return { days, hours, minutes, seconds, total: diff, expired: false };
}
