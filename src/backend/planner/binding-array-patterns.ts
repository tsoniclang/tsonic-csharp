import {
  AsBindingElement,
  AsBindingPattern,
} from "./source-ast.js";
import type { Node, SourceFile, TargetTypeRef } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpExpression,
  CsharpStatement,
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import { runtimeArrayHelperCall } from "./array-helpers.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import type { BindingProjectionPlanner } from "./binding-pattern-contracts.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { planExpressionWithExpectedType } from "./expressions.js";
import { getRuntimeCarrierForExpression } from "./runtime-carriers.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";

export function planArrayBindingPattern(
  patternNode: Node,
  sourceExpression: CsharpExpression,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
): readonly CsharpStatement[] {
  const sourceCarrier = getRuntimeCarrierForExpression(input, sourceNode, sourceFile);
  if (sourceCarrier === undefined || (sourceCarrier.kind !== "array" && sourceCarrier.kind !== "tuple")) {
    diagnostics.push(unsupportedNodeDiagnostic(patternNode, "Array destructuring requires a finalized provider array or tuple runtime-carrier fact for the source expression."));
    return [];
  }
  const elements = AsBindingPattern(patternNode)?.Elements?.Nodes ?? [];
  return elements.flatMap((elementNode, index) => {
    if (elementNode === undefined) {
      return [];
    }
    const elementCarrier = sourceCarrier.kind === "array" ? sourceCarrier.element : sourceCarrier.elements[index];
    return planArrayBindingElement(elementNode, sourceExpression, index, elementCarrier, sourceCarrier, sourceFile, input, diagnostics, state, planBindingNameFromProjection);
  });
}

function planArrayBindingElement(
  elementNode: Node,
  sourceExpression: CsharpExpression,
  index: number,
  elementCarrier: TargetTypeRef | undefined,
  sourceCarrier: Extract<TargetTypeRef, { readonly kind: "array" | "tuple" }>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
): readonly CsharpStatement[] {
  const element = AsBindingElement(elementNode);
  if (element === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Array binding pattern element must be a binding element."));
    return [];
  }
  if (element.DotDotDotToken !== undefined) {
    return planArrayRestBindingElement(elementNode, element.name, sourceExpression, index, sourceCarrier, sourceFile, input, diagnostics, state, planBindingNameFromProjection);
  }
  const name = element.name;
  if (name === undefined) {
    return [];
  }
  const projected: CsharpExpression = {
    kind: "ElementAccessExpression",
    receiver: sourceExpression,
    argument: { kind: "LiteralExpression", value: index },
  };
  const projectedType = elementCarrier === undefined ? undefined : csharpTypeFromTargetTypeRef(elementCarrier);
  if (projectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Array destructuring element requires a renderable provider element carrier type before C# emission."));
    return [];
  }
  if (element.Initializer !== undefined && sourceCarrier.kind !== "array") {
    diagnostics.push(unsupportedNodeDiagnostic(element.Initializer, "Tuple destructuring defaults require finalized optional-element facts before C# emission."));
    return [];
  }
  const projectedWithDefault = element.Initializer === undefined
    ? projected
    : planArrayElementDefaultProjection(projected, sourceExpression, index, element.Initializer, projectedType, sourceFile, input, diagnostics);
  return planBindingNameFromProjection(name, projectedWithDefault, projectedType, elementNode, sourceFile, input, diagnostics, state);
}

function planArrayRestBindingElement(
  elementNode: Node,
  name: Node | undefined,
  sourceExpression: CsharpExpression,
  index: number,
  sourceCarrier: Extract<TargetTypeRef, { readonly kind: "array" | "tuple" }>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
): readonly CsharpStatement[] {
  if (sourceCarrier.kind !== "array") {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Tuple rest destructuring requires finalized tuple slice facts before C# emission."));
    return [];
  }
  if (name === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Array rest destructuring requires a target binding name."));
    return [];
  }
  const projectedType = csharpTypeFromTargetTypeRef(sourceCarrier);
  if (projectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Array rest destructuring requires a renderable provider array carrier type before C# emission."));
    return [];
  }
  const projected = runtimeArrayHelperCall("Slice", [
    { kind: "Argument", expression: sourceExpression },
    { kind: "Argument", expression: { kind: "LiteralExpression", value: index } },
  ]);
  return planBindingNameFromProjection(name, projected, projectedType, elementNode, sourceFile, input, diagnostics, state);
}

function planArrayElementDefaultProjection(
  projected: CsharpExpression,
  sourceExpression: CsharpExpression,
  index: number,
  defaultExpression: Node,
  projectedType: CsharpTypeNode,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  return {
    kind: "ConditionalExpression",
    condition: {
      kind: "BinaryExpression",
      left: {
        kind: "SimpleMemberAccessExpression",
        receiver: sourceExpression,
        name: "Length",
      },
      operator: ">",
      right: {
        kind: "LiteralExpression",
        value: index,
      },
    },
    whenTrue: projected,
    whenFalse: planExpressionWithExpectedType(defaultExpression, sourceFile, input, diagnostics, projectedType),
  };
}
