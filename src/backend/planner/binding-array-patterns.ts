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
import {
  getArrayBoundaryCoreCarrierForExpression,
} from "./array-boundary-facts.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import type { BindingProjectionPlanner } from "./binding-pattern-contracts.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { getRuntimeCarrierForExpression } from "./runtime-carriers.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import {
  csharpListTargetType,
  getCsharpArrayLiteralElementTargetType,
} from "../../source/csharp-source-semantics/target-types.js";
import {
  getCsharpArrayLengthMember,
  isCsharpJsArrayCarrierTargetType,
} from "../../source/csharp-source-semantics/surfaces/js/array-carriers.js";

type ArrayBindingCarrier =
  | { readonly kind: "array"; readonly carrier: TargetTypeRef; readonly element: TargetTypeRef; readonly lengthMember: string; readonly restSlice: "runtime-array-helper" | "instance-slice" | "js-array-helper"; readonly restCarrier: TargetTypeRef }
  | { readonly kind: "tuple"; readonly elements: readonly TargetTypeRef[] };

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
  const sourceCarrier = sourceCarrierOverride ??
    getArrayBoundaryCoreCarrierForExpression(input, sourceNode, sourceFile) ??
    getRuntimeCarrierForExpression(input, sourceNode, sourceFile);
  const bindingCarrier = arrayBindingCarrier(sourceCarrier);
  if (bindingCarrier === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(patternNode, "Array destructuring requires a finalized provider array or tuple runtime-carrier fact for the source expression."));
    return [];
  }
  const elements = AsBindingPattern(patternNode)?.Elements?.Nodes ?? [];
  return elements.flatMap((elementNode, index) => {
    if (elementNode === undefined) {
      return [];
    }
    const elementCarrier = bindingCarrier.kind === "array" ? bindingCarrier.element : bindingCarrier.elements[index];
    return planArrayBindingElement(elementNode, sourceExpression, index, elementCarrier, bindingCarrier, sourceFile, input, diagnostics, state, planBindingNameFromProjection, planDefaultExpressionWithExpectedType);
  });
}

function arrayBindingCarrier(sourceCarrier: TargetTypeRef | undefined): ArrayBindingCarrier | undefined {
  if (sourceCarrier?.kind === "array") {
    return { kind: "array", carrier: sourceCarrier, element: sourceCarrier.element, lengthMember: "Length", restSlice: "runtime-array-helper", restCarrier: sourceCarrier };
  }
  if (sourceCarrier?.kind === "tuple") {
    return sourceCarrier;
  }
  if (sourceCarrier === undefined) {
    return undefined;
  }
  const element = getCsharpArrayLiteralElementTargetType(sourceCarrier);
  const lengthMember = getCsharpArrayLengthMember(sourceCarrier);
  if (element === undefined || lengthMember === undefined) {
    return undefined;
  }
  return isCsharpJsArrayCarrierTargetType(sourceCarrier)
    ? { kind: "array", carrier: sourceCarrier, element, lengthMember, restSlice: "instance-slice", restCarrier: sourceCarrier }
    : { kind: "array", carrier: sourceCarrier, element, lengthMember, restSlice: "js-array-helper", restCarrier: csharpListTargetType(element) };
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
  sourceCarrier: ArrayBindingCarrier,
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
    const fallback = planArrayBindingDefaultProjection(sourceExpression, index, projected, sourceCarrier, element.Initializer, sourceFile, input, diagnostics, projectedType, state, planDefaultExpressionWithExpectedType);
    return planBindingNameFromProjection(name, fallback, projectedType, elementNode, sourceFile, input, diagnostics, state, elementCarrier);
  }
  return planBindingNameFromProjection(name, projected, projectedType, elementNode, sourceFile, input, diagnostics, state, elementCarrier);
}

function planArrayBindingProjection(
  sourceExpression: CsharpExpression,
  index: number,
  sourceCarrier: ArrayBindingCarrier,
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
  sourceCarrier: Extract<ArrayBindingCarrier, { readonly kind: "array" }>,
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
        name: sourceCarrier.lengthMember,
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
  sourceCarrier: ArrayBindingCarrier,
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
  const projectedType = csharpTypeFromTargetTypeRef(sourceCarrier.restCarrier);
  if (projectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Array rest destructuring requires a renderable provider array carrier type before C# emission."));
    return [];
  }
  const projected = planArrayRestProjection(sourceExpression, index, sourceCarrier);
  return planBindingNameFromProjection(name, projected, projectedType, elementNode, sourceFile, input, diagnostics, state, sourceCarrier.restCarrier);
}

function planArrayRestProjection(
  sourceExpression: CsharpExpression,
  index: number,
  sourceCarrier: Extract<ArrayBindingCarrier, { readonly kind: "array" }>,
): CsharpExpression {
  if (sourceCarrier.restSlice === "instance-slice") {
    return {
      kind: "InvocationExpression",
      callee: {
        kind: "SimpleMemberAccessExpression",
        receiver: sourceExpression,
        name: "slice",
      },
      arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: index } }],
    };
  }
  const argumentsList = [
    { kind: "Argument" as const, expression: sourceExpression },
    { kind: "Argument" as const, expression: { kind: "LiteralExpression" as const, value: index } },
  ];
  return sourceCarrier.restSlice === "js-array-helper"
    ? {
        kind: "InvocationExpression",
        callee: {
          kind: "SimpleMemberAccessExpression",
          receiver: {
            kind: "QualifiedName",
            left: {
              kind: "QualifiedName",
              left: {
                kind: "QualifiedName",
                left: { kind: "IdentifierName", name: "Tsonic" },
                name: "CSharp",
              },
              name: "Js",
            },
            name: "Array",
          },
          name: "slice",
        },
        arguments: argumentsList,
      }
    : runtimeArrayHelperCall("Slice", argumentsList);
}
