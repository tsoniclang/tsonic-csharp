import type { Node, SourceFile, TargetTypeRef, Type } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import {
  getTargetTypeRefFromDirectFacts,
} from "./runtime-carrier-direct-facts.js";
import {
  targetTypeRefContainsSourcePrimitive,
} from "../../source/csharp-source-semantics/target-ref-utils.js";

export function getRuntimeCarrierForExpression(
  input: TargetCompileInput,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  return getTargetTypeRefForNode(input, sourceNode, sourceFile);
}

export function getTargetTypeRefForNode(
  input: TargetCompileInput,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  if (sourceNode === undefined) {
    return undefined;
  }
  return getTargetTypeRefFromDirectFacts(input, sourceNode) ??
    getTargetTypeRefFromDirectFacts(input, input.semantics.getSymbolAtLocation(sourceNode, { sourceFile })) ??
    getTargetTypeRefFromDirectFacts(input, input.semantics.getResolvedSymbol(sourceNode, { sourceFile })) ??
    input.semantics.getRuntimeCarrierForNode(sourceNode, { sourceFile });
}

export function getTargetTypeRefForType(
  input: TargetCompileInput,
  type: Type | undefined,
  sourceFile: SourceFile,
  seen: ReadonlySet<Type> = new Set(),
): TargetTypeRef | undefined {
  void sourceFile;
  void seen;
  return type === undefined
    ? undefined
    : getTargetTypeRefFromSemanticTypeFacts(input, type) ??
      getTargetTypeRefFromSemanticTypeFacts(input, type.symbol);
}

function getTargetTypeRefFromSemanticTypeFacts(
  input: TargetCompileInput,
  subject: Type | Type["symbol"] | undefined,
): TargetTypeRef | undefined {
  const fact = getTargetTypeRefFromDirectFacts(input, subject);
  return fact === undefined || targetTypeRefContainsSourcePrimitive(fact)
    ? undefined
    : fact;
}
