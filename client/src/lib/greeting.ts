/**
 * Time-of-day salutation, from the device clock.
 *
 * Local time deliberately — the customer's own morning is the one that
 * matters, not the server's. Boundaries follow ordinary English usage:
 * afternoon starts at noon, evening at 5pm.
 */
export function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function currentGreeting(now: Date = new Date()): string {
  return greetingForHour(now.getHours());
}
