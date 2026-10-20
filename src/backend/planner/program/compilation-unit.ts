import type {
  CsharpCompilationUnit,
} from "../../target-ast/syntax/index.js";
import {
  applyReadableCsharpStringLiterals,
} from "../../target-ast/normalization/readable-string-literals.js";
import {
  applyRequiredCsharpUsings,
} from "../../target-ast/normalization/required-usings.js";

export interface FinalizedCsharpCompilationUnit {
  readonly unit: CsharpCompilationUnit;
  readonly requiresUnsafe: boolean;
}

export function finalizeCsharpCompilationUnit(
  unit: CsharpCompilationUnit,
  requiresUnsafe: boolean,
): FinalizedCsharpCompilationUnit {
  const normalizedUnit = applyRequiredCsharpUsings(
    applyReadableCsharpStringLiterals(unit),
  );
  const aliases = collectExternAliases(normalizedUnit);
  return {
    requiresUnsafe,
    unit: aliases.length === 0
      ? normalizedUnit
      : {
          ...normalizedUnit,
          externAliases: aliases,
        },
  };
}

function collectExternAliases(value: unknown): readonly string[] {
  const aliases = new Set<string>();
  const seen = new WeakSet<object>();
  visitCsharpAstValue(value, aliases, seen);
  return [...aliases].sort((left, right) => left.localeCompare(right));
}

function visitCsharpAstValue(
  value: unknown,
  aliases: Set<string>,
  seen: WeakSet<object>,
): void {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (const element of value) {
      visitCsharpAstValue(element, aliases, seen);
    }
    return;
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (
    record.kind === "AliasQualifiedName" &&
    typeof record.alias === "string" &&
    record.alias !== "global"
  ) {
    aliases.add(record.alias);
  }
  for (const field of Object.values(record)) {
    visitCsharpAstValue(field, aliases, seen);
  }
}
