import type {
  CsharpCompilationUnit,
} from "../../target-ast/roslyn/index.js";
import type {
  CsharpLanguageDialect,
} from "../../../target-model/configuration/model.js";
import {
  applyCsharpLanguageRequiredUnsafeContexts,
} from "../safety/unsafe-marking.js";
import {
  compilationUnitRequiresUnsafe,
} from "../safety/unsafe-requires.js";
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
  dialect: CsharpLanguageDialect,
): FinalizedCsharpCompilationUnit {
  const contextualizedUnit = applyCsharpLanguageRequiredUnsafeContexts(
    unit,
    dialect,
  );
  const normalizedUnit = applyRequiredCsharpUsings(
    applyReadableCsharpStringLiterals(contextualizedUnit),
  );
  const requiresUnsafe = compilationUnitRequiresUnsafe(
    normalizedUnit,
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
