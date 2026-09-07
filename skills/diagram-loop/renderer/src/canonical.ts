import {createHash} from "node:crypto";

export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | {[key: string]: CanonicalValue};

function assertFiniteNumber(value: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError("Canonical data cannot contain non-finite numbers");
  }
  return Object.is(value, -0) ? 0 : value;
}

export function canonicalize(value: unknown): CanonicalValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return assertFiniteNumber(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    const normalized: {[key: string]: CanonicalValue} = {};
    for (const key of Object.keys(object).sort()) {
      const item = object[key];
      if (item !== undefined) {
        normalized[key] = canonicalize(item);
      }
    }
    return normalized;
  }
  throw new TypeError(`Unsupported canonical value: ${typeof value}`);
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(canonicalize(value))}\n`;
}

export function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}
