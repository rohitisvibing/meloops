import { generateKeyBetween } from "fractional-indexing";

/**
 * Position key for an item moved to `toIndex` within `keys` (sorted ascending, excluding the moved item).
 * Only the moved row needs to be written.
 */
export function keyForIndex(keys: readonly string[], toIndex: number): string {
  const before = toIndex > 0 ? keys[toIndex - 1] : null;
  const after = toIndex < keys.length ? keys[toIndex] : null;
  return generateKeyBetween(before ?? null, after ?? null);
}

export function keyAtEnd(keys: readonly string[]): string {
  return generateKeyBetween(keys.length ? keys[keys.length - 1] : null, null);
}
