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
  return input.semantics.getRuntimeCarrierForNode(sourceNode, { sourceFile }) ??
    getTargetTypeRefFromDirectFacts(input, sourceNode) ??
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

function targetTypeRefContainsSourcePrimitive(type: TargetTypeRef): boolean {
  switch (type.kind) {
    case "source-primitive":
      return true;
    case "array":
      return targetTypeRefContainsSourcePrimitive(type.element);
    case "tuple":
      return type.elements.some(targetTypeRefContainsSourcePrimitive);
    case "target-named":
      return (type.typeArguments ?? []).some(targetTypeRefContainsSourcePrimitive);
    case "pointer":
      return targetTypeRefContainsSourcePrimitive(type.pointee);
    case "function-pointer":
      return type.args.some(targetTypeRefContainsSourcePrimitive) ||
        targetTypeRefContainsSourcePrimitive(type.result);
    case "associated-type":
      return targetTypeRefContainsSourcePrimitive(type.owner);
    case "type-parameter":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return false;
  }
}
