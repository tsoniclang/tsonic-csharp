import type { CsharpCompilationUnit } from "../roslyn/index.js";
import type { CsharpTypeNode } from "../roslyn/index.js";
import { transformCsharpTargetAst } from "./transformation.js";

export function applyRequiredCsharpUsings(
  unit: CsharpCompilationUnit,
): CsharpCompilationUnit {
  const conflicts = collectUsingNameConflicts(unit);
  const normalizedUnit = conflicts.size === 0
    ? unit
    : transformCsharpTargetAst(unit, (record) =>
        record.kind === "IdentifierName" &&
          typeof record.name === "string" &&
          typeof record.requiredUsingNamespace === "string" &&
          conflicts.has(record.name)
          ? globallyQualifiedType(record)
          : record);
  const namespaces = new Set<string>();
  collectRequiredUsings(
    normalizedUnit,
    namespaces,
    new WeakSet<object>(),
  );
  const usings = [...namespaces]
    .sort((left, right) => left.localeCompare(right, "en"))
    .map((namespace) => ({
      kind: "UsingDirective" as const,
      namespace,
    }));
  return sameUsings(normalizedUnit, usings)
    ? normalizedUnit
    : {
        ...normalizedUnit,
        usings,
      };
}

function collectUsingNameConflicts(
  unit: CsharpCompilationUnit,
): ReadonlySet<string> {
  const declaredNames = new Set<string>();
  const namespacesByName = new Map<string, Set<string>>();
  visit(unit, new WeakSet<object>());
  return new Set([
    ...declaredNames,
    ...[...namespacesByName]
      .filter(([, namespaces]) => namespaces.size > 1)
      .map(([name]) => name),
  ]);

  function visit(value: unknown, seen: WeakSet<object>): void {
    if (value === null || typeof value !== "object" || seen.has(value)) {
      return;
    }
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((element) => visit(element, seen));
      return;
    }
    const record = value as Readonly<Record<string, unknown>>;
    if (
      isTypeDeclaration(record.kind) &&
      typeof record.name === "string"
    ) {
      declaredNames.add(record.name);
    }
    if (Array.isArray(record.typeParameters)) {
      for (const parameter of record.typeParameters) {
        const parameterName = parameter !== null && typeof parameter === "object"
          ? (parameter as Readonly<Record<string, unknown>>).name
          : undefined;
        if (
          typeof parameterName === "string"
        ) {
          declaredNames.add(parameterName);
        }
      }
    }
    if (
      record.kind === "IdentifierName" &&
      typeof record.name === "string" &&
      typeof record.requiredUsingNamespace === "string"
    ) {
      const namespaces = namespacesByName.get(record.name) ?? new Set<string>();
      namespaces.add(record.requiredUsingNamespace);
      namespacesByName.set(record.name, namespaces);
    }
    Object.values(record).forEach((field) => visit(field, seen));
  }
}

function isTypeDeclaration(kind: unknown): boolean {
  return kind === "ClassDeclaration" ||
    kind === "StructDeclaration" ||
    kind === "InterfaceDeclaration" ||
    kind === "EnumDeclaration";
}

function globallyQualifiedType(
  record: Readonly<Record<string, unknown>>,
): CsharpTypeNode {
  const namespace = record.requiredUsingNamespace as string;
  const segments = namespace.split(".");
  let name: CsharpTypeNode = {
    kind: "IdentifierName",
    name: segments[0]!,
  };
  for (const segment of segments.slice(1)) {
    name = {
      kind: "QualifiedName",
      left: name,
      name: segment,
    };
  }
  name = {
    kind: "QualifiedName",
    left: name,
    name: record.name as string,
    ...(Array.isArray(record.typeArguments)
      ? { typeArguments: record.typeArguments as readonly CsharpTypeNode[] }
      : {}),
  };
  return {
    kind: "AliasQualifiedName",
    alias: "global",
    name,
  };
}

function collectRequiredUsings(
  value: unknown,
  namespaces: Set<string>,
  seen: WeakSet<object>,
): void {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((element) => collectRequiredUsings(element, namespaces, seen));
    return;
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (
    record.kind === "IdentifierName" &&
    typeof record.requiredUsingNamespace === "string"
  ) {
    namespaces.add(record.requiredUsingNamespace);
  }
  Object.values(record).forEach((field) =>
    collectRequiredUsings(field, namespaces, seen));
}

function sameUsings(
  unit: CsharpCompilationUnit,
  usings: readonly CsharpCompilationUnit["usings"][number][],
): boolean {
  return unit.usings.length === usings.length &&
    unit.usings.every((using, index) =>
      using.namespace === usings[index]!.namespace);
}
