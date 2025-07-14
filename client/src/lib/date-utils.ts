export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

export function getDateRange(days: number): { startDate: string; endDate: string } {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  
  return {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate)
  };
}

export function getDayName(date: string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

export function getMonthName(date: string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function isToday(date: string): boolean {
  return date === formatDate(new Date());
}

export function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

export function generateCalendarDays(year: number, month: number): Array<{
  date: string;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}> {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const days = [];
  const today = formatDate(new Date());

  // Previous month days
  const prevMonth = new Date(year, month - 1, 0);
  const prevMonthDays = prevMonth.getDate();
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    const day = prevMonthDays - i;
    const date = formatDate(new Date(year, month - 1, day));
    days.push({
      date,
      day,
      isCurrentMonth: false,
      isToday: date === today
    });
  }

  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const date = formatDate(new Date(year, month, day));
    days.push({
      date,
      day,
      isCurrentMonth: true,
      isToday: date === today
    });
  }

  // Next month days
  const totalCells = 42; // 6 weeks * 7 days
  const remainingCells = totalCells - days.length;
  for (let day = 1; day <= remainingCells; day++) {
    const date = formatDate(new Date(year, month + 1, day));
    days.push({
      date,
      day,
      isCurrentMonth: false,
      isToday: date === today
    });
  }

  return days;
}
