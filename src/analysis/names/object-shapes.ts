import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeNameCandidate } from "../objects/display-names.js";

export function selectCsharpObjectShapeDisplayNames(
  candidates: readonly CsharpObjectShapeNameCandidate[],
  reservedNames: ReadonlySet<string> = new Set(),
): ReadonlyMap<string, string> {
  const unique = new Map<string, CsharpObjectShapeNameCandidate>();
  for (const candidate of candidates) {
    const previous = unique.get(candidate.canonicalName);
    if (
      previous !== undefined &&
      (
        previous.identity !== candidate.identity ||
        previous.preferredStem !== candidate.preferredStem
      )
    ) {
      failTargetAnalysisInvariant("tsonic-csharp",
        `Canonical C# object-shape name '${candidate.canonicalName}' has contradictory display identities.`,
      );
    }
    unique.set(candidate.canonicalName, candidate);
  }
  const ordered = [...unique.values()].sort((left, right) =>
    left.identity.localeCompare(right.identity, "en") ||
    left.preferredStem.localeCompare(right.preferredStem, "en") ||
    left.canonicalName.localeCompare(right.canonicalName, "en"));
  const assigned = new Set(reservedNames);
  const result = new Map<string, string>();
  for (const candidate of ordered) {
    const base = `${sanitizeStem(candidate.preferredStem)}Shape`;
    let length = Math.min(12, candidate.identity.length);
    let name = candidateName(base, candidate.identity, length);
    while (
      length < candidate.identity.length &&
      (
        assigned.has(name) ||
        ordered.some((other) =>
          other !== candidate &&
          `${sanitizeStem(other.preferredStem)}Shape` === base &&
          other.identity.slice(0, length) === candidate.identity.slice(0, length))
      )
    ) {
      length += 1;
      name = candidateName(base, candidate.identity, length);
    }
    if (assigned.has(name)) {
      let suffix = 2;
      while (assigned.has(`${name}_${suffix}`)) {
        suffix += 1;
      }
      name = `${name}_${suffix}`;
    }
    assigned.add(name);
    result.set(candidate.canonicalName, name);
  }
  return result;
}

function candidateName(base: string, identity: string, length: number): string {
  return `${base}_${identity.slice(0, length)}`;
}

function sanitizeStem(value: string): string {
  const sanitized = value
    .replace(/^@/u, "")
    .replace(/[^A-Za-z0-9_]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
  if (sanitized.length === 0) {
    return "Object";
  }
  return /^[A-Za-z_]/u.test(sanitized)
    ? sanitized
    : `Type_${sanitized}`;
}


