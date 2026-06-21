import type { Node, SourceFile, TargetTypeRef, Type } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import {
  getTargetTypeRefFromDirectFacts,
} from "./runtime-carrier-direct-facts.js";
import {
  asNodeSubject,
} from "../../source/fact-subjects.js";

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
    getTargetTypeRefFromDirectFacts(input, input.semantics.getResolvedSymbol(sourceNode, { sourceFile })) ??
    getTargetTypeRefFromSelectedOperation(input, sourceNode, sourceFile);
}

function getTargetTypeRefFromSelectedOperation(
  input: TargetCompileInput,
  sourceNode: Node,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  const resultType = input.facts.getSelectedTargetOperator(sourceNode)?.resultType ??
    input.facts.getSelectedTargetProperty(sourceNode)?.resultType ??
    input.facts.getSelectedTargetElementAccess(sourceNode)?.resultType ??
    input.facts.getSelectedTargetCall(sourceNode)?.member.returnType;
  const resultNode = asNodeSubject(resultType);
  return resultType === undefined || resultType === sourceNode
    ? undefined
    : getTargetTypeRefFromDirectFacts(input, resultType) ??
      (resultNode === undefined ? undefined : getTargetTypeRefForNode(input, resultNode, sourceFile));
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
