import {
  KindElementAccessExpression,
  KindIdentifier,
  KindPropertyAccessExpression,
  KindThisKeyword,
  KindTypeReference,
} from "@tsonic/tsts";
import type { Node, SourceFile, TargetTypeRef, Type } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";

export function getRuntimeCarrierForExpression(
  input: TargetCompileInput,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  if (sourceNode === undefined) {
    return undefined;
  }
  const direct = input.facts.getRuntimeCarrierFact(sourceNode)?.carrier;
  if (direct !== undefined) {
    return direct;
  }
  if (isSymbolBearingCarrierSubject(sourceNode)) {
    const symbol = input.checker.getSymbolAtLocation(sourceNode, { sourceFile }) ?? input.checker.getResolvedSymbol(sourceNode, { sourceFile });
    const symbolCarrier = input.facts.getRuntimeCarrierFact(symbol)?.carrier;
    if (symbolCarrier !== undefined) {
      return symbolCarrier;
    }
  }
  const sourceType = input.checker.getTypeAtLocation(sourceNode, { sourceFile });
  return sourceType === undefined ? undefined : getRuntimeCarrierForType(input, sourceType);
}

export function getRuntimeCarrierForType(input: TargetCompileInput, type: Type): TargetTypeRef | undefined {
  return input.facts.getRuntimeCarrierFact(type)?.carrier ??
    input.facts.getRuntimeCarrierFact(type.symbol)?.carrier;
}

function isSymbolBearingCarrierSubject(node: Node): boolean {
  switch (node.Kind) {
    case KindIdentifier:
    case KindPropertyAccessExpression:
    case KindElementAccessExpression:
    case KindTypeReference:
    case KindThisKeyword:
      return true;
    default:
      return false;
  }
}
