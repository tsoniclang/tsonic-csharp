import type {
  ExtensionObservationContext,
  Node,
  RuntimeCarrierFactRequest,
  SourceFile,
  Type,
} from "@tsonic/tsts";
import type {
  CsharpRuntimeCarrierFactSubject,
} from "../csharp-facts.js";
import {
  asNodeSubject,
  isControlFlowLabelIdentifier,
  isSemanticTypeQueryableValueExpressionNode,
  isTypeSyntaxNode,
} from "./ast-utils.js";
import {
  asType,
} from "./target-ref-utils.js";

export function getExactRuntimeCarrierRequestSubjects(
  request: RuntimeCarrierFactRequest,
): readonly CsharpRuntimeCarrierFactSubject[] {
  const type = asType(request.type);
  if (type === undefined) {
    throw new Error("TSTS runtime-carrier request did not contain an exact semantic Type subject.");
  }
  const sourceTypeReference = asNodeSubject(request.sourceTypeReference);
  const subjects: readonly CsharpRuntimeCarrierFactSubject[] = sourceTypeReference === undefined
    ? [type]
    : [sourceTypeReference, type];
  return subjects.length === 2 && subjects[0] === subjects[1]
    ? [subjects[0]!]
    : subjects;
}

export function getRuntimeCarrierSubjectType(
  compiler: NonNullable<ExtensionObservationContext["compiler"]>,
  sourceFile: SourceFile,
  node: Node,
): Type | undefined {
  if (isControlFlowLabelIdentifier(compiler.ast, node)) {
    return undefined;
  }
  if (isRuntimeCarrierTypeSyntaxNode(compiler.ast, node)) {
    return compiler.checker.getTypeFromTypeNode(node, { sourceFile });
  }
  return isSemanticTypeQueryableValueExpressionNode(compiler.ast, node)
    ? compiler.checker.getTypeAtLocation(node, { sourceFile })
    : undefined;
}

export function isRuntimeCarrierTypeSyntaxNode(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  return isTypeSyntaxNode(ast, node);
}
