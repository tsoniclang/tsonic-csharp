import type { Node, SourceFile, TargetTypeRef, Type } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import {
  getTargetTypeRefFromDirectFacts,
} from "./runtime-carrier-direct-facts.js";

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
    input.semantics.getRuntimeCarrierForNode(sourceNode, { sourceFile }) ??
    getTargetTypeRefFromDirectFacts(input, input.semantics.getSymbolAtLocation(sourceNode, { sourceFile })) ??
    getTargetTypeRefFromDirectFacts(input, input.semantics.getResolvedSymbol(sourceNode, { sourceFile }));
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
    : getTargetTypeRefFromDirectFacts(input, type) ??
      getTargetTypeRefFromDirectFacts(input, type.symbol);
}
