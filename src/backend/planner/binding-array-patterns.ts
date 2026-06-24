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
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner | undefined,
  sourceCarrierOverride?: TargetTypeRef,
): readonly CsharpStatement[] {
  const sourceCarrier = sourceCarrierOverride ?? getRuntimeCarrierForExpression(input, sourceNode, sourceFile);
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
    return planArrayBindingElement(elementNode, sourceExpression, index, elementCarrier, sourceCarrier, sourceFile, input, diagnostics, state, planBindingNameFromProjection, planDefaultExpressionWithExpectedType);
  });
}

export type BindingDefaultExpressionPlanner = (
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject?: Node,
  state?: DestructuringPlannerState,
) => CsharpExpression;

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
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner | undefined,
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
  const projected = planArrayBindingProjection(sourceExpression, index, sourceCarrier);
  const projectedType = elementCarrier === undefined ? undefined : csharpTypeFromTargetTypeRef(elementCarrier);
  if (projectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Array destructuring element requires a renderable provider element carrier type before C# emission."));
    return [];
  }
  if (element.Initializer !== undefined) {
    if (sourceCarrier.kind !== "array") {
      diagnostics.push(unsupportedNodeDiagnostic(element.Initializer, "Tuple destructuring defaults require finalized tuple optional-element facts before C# emission."));
      return [];
    }
    if (planDefaultExpressionWithExpectedType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(element.Initializer, "Array destructuring defaults require the active expression planner before C# emission."));
      return [];
    }
    const fallback = planArrayBindingDefaultProjection(sourceExpression, index, projected, element.Initializer, sourceFile, input, diagnostics, projectedType, state, planDefaultExpressionWithExpectedType);
    return planBindingNameFromProjection(name, fallback, projectedType, elementNode, sourceFile, input, diagnostics, state, elementCarrier);
  }
  return planBindingNameFromProjection(name, projected, projectedType, elementNode, sourceFile, input, diagnostics, state, elementCarrier);
}

function planArrayBindingProjection(
  sourceExpression: CsharpExpression,
  index: number,
  sourceCarrier: Extract<TargetTypeRef, { readonly kind: "array" | "tuple" }>,
): CsharpExpression {
  if (sourceCarrier.kind === "tuple") {
    return {
      kind: "SimpleMemberAccessExpression",
      receiver: sourceExpression,
      name: `Item${index + 1}`,
    };
  }
  return {
    kind: "ElementAccessExpression",
    receiver: sourceExpression,
    argument: { kind: "LiteralExpression", value: index },
  };
}

function planArrayBindingDefaultProjection(
  sourceExpression: CsharpExpression,
  index: number,
  projected: CsharpExpression,
  initializer: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  projectedType: CsharpTypeNode,
  state: DestructuringPlannerState,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
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
      operatorToken: { kind: "GreaterThanToken" },
      right: { kind: "LiteralExpression", value: index },
    },
    whenTrue: projected,
    whenFalse: planDefaultExpressionWithExpectedType(initializer, sourceFile, input, diagnostics, projectedType, initializer, state),
  };
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
  return planBindingNameFromProjection(name, projected, projectedType, elementNode, sourceFile, input, diagnostics, state, sourceCarrier);
}
