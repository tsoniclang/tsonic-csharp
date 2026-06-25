import type { Node, SourceFile, TargetTypeRef, Type } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import {
  getTargetTypeRefFromDirectFacts,
} from "./runtime-carrier-direct-facts.js";
import {
  targetTypeRefContainsSourcePrimitive,
} from "../../source/csharp-source-semantics/target-ref-utils.js";
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
  const typeReferenceFact = getTargetTypeRefFromTypeReferenceName(input, sourceNode, sourceFile);
  if (input.ast.kindName(sourceNode) === "KindTypeReference") {
    return getTargetTypeRefFromDirectFacts(input, sourceNode) ??
      input.semantics.getRuntimeCarrierForNode(sourceNode, { sourceFile }) ??
      typeReferenceFact;
  }
  return typeReferenceFact ??
    getTargetTypeRefFromDirectFacts(input, sourceNode) ??
    getTargetTypeRefFromDirectFacts(input, input.semantics.getSymbolAtLocation(sourceNode, { sourceFile })) ??
    getTargetTypeRefFromDirectFacts(input, input.semantics.getResolvedSymbol(sourceNode, { sourceFile })) ??
    input.semantics.getRuntimeCarrierForNode(sourceNode, { sourceFile });
}

function getTargetTypeRefFromTypeReferenceName(
  input: TargetCompileInput,
  sourceNode: Node,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  if (input.ast.kindName(sourceNode) !== "KindTypeReference") {
    return undefined;
  }
  const typeName = asNodeSubject(getNodeField(sourceNode, "TypeName"));
  return typeName === undefined
    ? undefined
    : getTargetTypeRefFromDirectFacts(input, typeName, { includeRuntimeCarrier: false }) ??
      getTargetTypeRefFromDirectFacts(input, input.semantics.getSymbolAtLocation(typeName, { sourceFile }), { includeRuntimeCarrier: false }) ??
      getTargetTypeRefFromDirectFacts(input, input.semantics.getResolvedSymbol(typeName, { sourceFile }), { includeRuntimeCarrier: false });
}

function getNodeField(node: Node, field: string): unknown {
  return Object.getOwnPropertyDescriptor(node, field)?.value;
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
