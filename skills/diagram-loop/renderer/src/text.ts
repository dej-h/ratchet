export function wordCount(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}
