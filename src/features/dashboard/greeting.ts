/**
 * Time-of-day greeting.
 *
 * Rendered on the server, so it reflects the server's clock rather than the
 * viewer's. Accepting `now` keeps it testable.
 */
export function timeOfDayGreeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function greetingFor(name: string | null, now = new Date()): string {
  const greeting = timeOfDayGreeting(now);
  return name ? `${greeting}, ${name}` : greeting;
}
