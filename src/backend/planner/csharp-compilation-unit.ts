import type {
  CsharpCompilationUnit,
} from "../roslyn/syntax.js";
import type {
  CsharpLanguageDialect,
} from "../../options/csharp-target-options.js";
import {
  applyCsharpLanguageRequiredUnsafeContexts,
} from "./unsafe-marking.js";
import {
  compilationUnitRequiresUnsafe,
} from "./unsafe-requires.js";

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
  const requiresUnsafe = compilationUnitRequiresUnsafe(
    contextualizedUnit,
  );
  const aliases = collectExternAliases(contextualizedUnit);
  return {
    requiresUnsafe,
    unit: aliases.length === 0
      ? contextualizedUnit
      : {
          ...contextualizedUnit,
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
    typeof record.alias === "string"
  ) {
    aliases.add(record.alias);
  }
  for (const field of Object.values(record)) {
    visitCsharpAstValue(field, aliases, seen);
  }
}
