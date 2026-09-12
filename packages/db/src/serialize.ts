export function money(value: { toString(): string } | null | undefined): string | null {
  return value == null ? null : value.toString();
}
