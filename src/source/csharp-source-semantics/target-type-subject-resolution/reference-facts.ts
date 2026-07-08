import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  asNodeSubject,
} from "../ast-utils.js";
import type {
  TargetTypeRefResolutionOptions,
} from "../target-member-selection.js";
import {
  getAliasedSymbolIfAvailable,
  getSymbolForDeclarationLookup,
} from "../symbol-utils.js";
import {
  resolveTargetTypeRefFromSubjectFacts,
} from "../target-type-subject-facts.js";

export function resolveTargetTypeRefFromReferenceFacts(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  resolveFactSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
    options: TargetTypeRefResolutionOptions,
  ) => TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  const node = asNodeSubject(subject);
  const ast = context.compiler?.ast;
  const checker = context.compiler?.checker;
  if (node === undefined || ast === undefined || checker === undefined) {
    return undefined;
  }
  const sourceFile = ast.getSourceFile(node);
  const symbol = getSymbolForDeclarationLookup(ast, checker, node, sourceFile);
  for (const referenceSubject of uniqueReferenceSubjects([
    symbol,
    getAliasedSymbolForReference(symbol, context, sourceFile),
  ])) {
    const fact = resolveTargetTypeRefFromSubjectFacts(
      referenceSubject,
      context,
      options,
      resolveFactSubject,
    );
    if (fact !== undefined) {
      return fact;
    }
  }
  return undefined;
}

function getAliasedSymbolForReference(
  symbol: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  sourceFile: ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["ast"]["getSourceFile"]> | undefined,
): ExtensionFactSubject | undefined {
  const checker = context.compiler?.checker;
  if (checker === undefined) {
    return undefined;
  }
  return getAliasedSymbolIfAvailable(checker, symbol, sourceFile);
}

function uniqueReferenceSubjects(subjects: readonly (ExtensionFactSubject | undefined)[]): readonly ExtensionFactSubject[] {
  const seen = new Set<ExtensionFactSubject>();
  const result: ExtensionFactSubject[] = [];
  for (const subject of subjects) {
    if (subject === undefined || seen.has(subject)) {
      continue;
    }
    seen.add(subject);
    result.push(subject);
  }
  return result;
}
