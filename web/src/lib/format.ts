export function shortHash(value: string | null, fallback: string): string {
  return value ? value.slice(0, 7) : fallback;
}
