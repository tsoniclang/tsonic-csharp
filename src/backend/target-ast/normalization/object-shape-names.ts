import type { CsharpCompilationUnit } from "../roslyn/index.js";
import { transformCsharpTargetAst } from "./transformation.js";

export interface CsharpObjectShapeNameCandidate {
  readonly canonicalName: string;
  readonly identity: string;
  readonly preferredStem: string;
}

export function applyCsharpObjectShapeDisplayNames(
  units: readonly CsharpCompilationUnit[],
  candidates: readonly CsharpObjectShapeNameCandidate[],
): readonly CsharpCompilationUnit[] {
  if (candidates.length === 0) {
    return units;
  }
  const candidateIdentities = new Set(
    candidates.map((candidate) => candidate.identity),
  );
  const reservedNames = collectDeclaredTypeNames(units, candidateIdentities);
  const names = selectCsharpObjectShapeDisplayNames(candidates, reservedNames);
  const candidatesByIdentity = new Map(candidates.map((candidate) =>
    [candidate.identity, candidate] as const));
  return units.map((unit) => transformCsharpTargetAst(unit, (record) => {
    if (
      record.kind === "IdentifierName" &&
      typeof record.name === "string" &&
      typeof record.objectShapeIdentity === "string"
    ) {
      const candidate = candidatesByIdentity.get(record.objectShapeIdentity);
      const name = candidate?.canonicalName === record.name
        ? names.get(candidate.canonicalName)
        : undefined;
      return name === undefined ? record : { ...record, name };
    }
    if (
      record.kind === "ClassDeclaration" &&
      typeof record.name === "string" &&
      typeof record.objectShapeIdentity === "string"
    ) {
      const candidate = candidatesByIdentity.get(record.objectShapeIdentity);
      const name = candidate?.canonicalName === record.name
        ? names.get(candidate.canonicalName)
        : undefined;
      return name === undefined ? record : { ...record, name };
    }
    return record;
  }));
}

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
      throw new Error(
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

function collectDeclaredTypeNames(
  units: readonly CsharpCompilationUnit[],
  generatedIdentities: ReadonlySet<string>,
): Set<string> {
  const names = new Set<string>();
  const seen = new WeakSet<object>();
  for (const unit of units) {
    visit(unit);
  }
  return names;

  function visit(value: unknown): void {
    if (value === null || typeof value !== "object" || seen.has(value)) {
      return;
    }
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = value as Readonly<Record<string, unknown>>;
    if (
      (
        record.kind === "ClassDeclaration" ||
        record.kind === "StructDeclaration" ||
        record.kind === "InterfaceDeclaration" ||
        record.kind === "EnumDeclaration"
      ) &&
      typeof record.name === "string" &&
      !(
        record.kind === "ClassDeclaration" &&
        typeof record.objectShapeIdentity === "string" &&
        generatedIdentities.has(record.objectShapeIdentity)
      )
    ) {
      names.add(record.name);
    }
    Object.values(record).forEach(visit);
  }
}
