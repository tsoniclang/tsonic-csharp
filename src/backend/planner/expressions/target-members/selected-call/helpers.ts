import { csharpTypeFromTargetTypeRef } from "../../../types/target-types.js";
import { failCsharpPlannerInvariant } from "../../../diagnostics.js";
import type { CsharpArgument, CsharpExpression, CsharpTypeNode } from "../../../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../../../context.js";
import type { TargetTypeRef } from "../../../../../target-model/types/model.js";
import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";

export function applyCalleeTypeArguments(typeParameterNames: ReadonlyMap<string, string> | undefined, callee: CsharpExpression,
  typeArguments: readonly TargetTypeRef[], node: Node, diagnostics: TargetDiagnostic[]): CsharpExpression {
  while (callee.kind === "ParenthesizedExpression") callee = callee.expression;
  const rendered = renderCsharpTargetTypeArguments(typeParameterNames, typeArguments, node, diagnostics);
  if (rendered.length === 0) return callee;
  switch (callee.kind) {
    case "IdentifierName": case "QualifiedName": case "SimpleMemberAccessExpression": case "ConditionalAccessExpression":
      return { ...callee, typeArguments: [...(callee.typeArguments ?? []), ...rendered] };
    default: return failCsharpPlannerInvariant("An admitted generic source call requires its exact type-argument-bearing callee syntax.", node);
  }
}

export function renderCsharpTargetTypeArguments(typeParameterNames: ReadonlyMap<string, string> | undefined,
  typeArguments: readonly TargetTypeRef[], node: Node, _diagnostics: TargetDiagnostic[]): readonly CsharpTypeNode[] {
  return typeArguments.map(carrier => csharpTypeFromTargetTypeRef(carrier, typeParameterNames) ??
    failCsharpPlannerInvariant("An admitted call requires its exact renderable native type arguments.", node));
}

export function sourceCallIsOptional(input: CsharpPlanningContext, node: Node): boolean {
  const selected = input.program.records.callOptional.get(node);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted target call requires its exact native optional-receiver plan.", node);
  return selected.optional && (selected.receiver === undefined || !input.scope.presentOptionalValues?.has(selected.receiver));
}

export function translateArrayCreationCall(node: Node, arguments_: readonly CsharpArgument[], input: CsharpPlanningContext): CsharpExpression {
  const selected = input.program.records.arrayCreationCall.get(node);
  if (selected === undefined || arguments_.length !== 1) failCsharpPlannerInvariant("An admitted array creation requires its selected element and one length operand.", node);
  const elementType = csharpTypeFromTargetTypeRef(selected, input.scope.typeParameterNames) ??
    failCsharpPlannerInvariant("An admitted array creation requires its native element type.", node);
  return { kind: "ArrayCreationExpression", elementType, size: arguments_[0]!.expression, elements: [] };
}
