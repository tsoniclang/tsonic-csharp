import type {
  CsharpPlanningContext } from "../context.js";
import {
  AsBindingElement,
  AsBindingPattern,
} from "@tsonic/target-api/source";
import type { Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpStatement,
  CsharpTypeNode,
} from "../../target-ast/roslyn/index.js";
import { runtimeArrayHelperCall } from "../expressions/arrays/helpers.js";
import {
  getArrayBoundaryCoreCarrierForExpression,
} from "../expressions/arrays/boundary-facts.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import type { BindingProjectionPlanner } from "./binding-pattern-contracts.js";
import { csharpTupleExpression } from "../types/csharp-tuples.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import {
  missingCarrierDiagnosticDetail,
  probeCarrierFromResolution,
  resolveRuntimeCarrierForExpression,
} from "../types/runtime-carriers.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import {
  csharpArrayBindingProjectionTarget,
  csharpCollectionUsesJsArraySemantics,
  getCsharpNullableElementTargetType,
  resolveCsharpArrayBindingCarrier,
} from "../../../target-model/types/index.js";
import type {
  CsharpArrayBindingCarrier,
} from "../../../target-model/types/index.js";

export function planArrayBindingPattern(
  patternNode: Node,
  sourceExpression: CsharpExpression,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner | undefined,
  sourceCarrierOverride?: TargetTypeRef,
): readonly CsharpStatement[] {
  const sourceCarrier = sourceCarrierOverride ??
    getArrayBoundaryCoreCarrierForExpression(input, sourceNode, sourceFile) ??
    probeCarrierFromResolution(resolveRuntimeCarrierForExpression(input, sourceNode, sourceFile));
  const bindingCarrier = resolveCsharpArrayBindingCarrier(sourceCarrier);
  if (bindingCarrier === undefined) {
    const resolution = resolveRuntimeCarrierForExpression(input, sourceNode, sourceFile);
    const detail = missingCarrierDiagnosticDetail(resolution, "Runtime carrier fact is missing for the array destructuring source expression.");
    diagnostics.push(unsupportedNodeDiagnostic(patternNode, `Array destructuring requires a finalized provider array or tuple runtime-carrier fact for the source expression. ${detail.reason}`, detail.evidence));
    return [];
  }
  const elements = AsBindingPattern(input.program.source.ast, patternNode)?.Elements?.Nodes ?? [];
  return elements.flatMap((elementNode, index) => {
    if (elementNode === undefined) {
      return [];
    }
    const elementCarrier = csharpArrayBindingProjectionTarget(
      bindingCarrier,
      index,
      false,
    );
    return planArrayBindingElement(elementNode, sourceExpression, index, elementCarrier, bindingCarrier, sourceFile, input, diagnostics, state, planBindingNameFromProjection, planDefaultExpressionWithExpectedType);
  });
}

export type BindingDefaultExpressionPlanner = (
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject?: Node,
  state?: DestructuringPlannerState,
) => CsharpExpression | undefined;

function planArrayBindingElement(
  elementNode: Node,
  sourceExpression: CsharpExpression,
  index: number,
  elementCarrier: TargetTypeRef | undefined,
  sourceCarrier: CsharpArrayBindingCarrier,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner | undefined,
): readonly CsharpStatement[] {
  const element = AsBindingElement(input.program.source.ast, elementNode);
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
      const defaultedElementCarrier =
        getCsharpNullableElementTargetType(elementCarrier);
      if (defaultedElementCarrier !== undefined) {
        const defaultedElementType = csharpTypeFromTargetTypeRef(
          defaultedElementCarrier,
        );
        if (
          defaultedElementType === undefined ||
          planDefaultExpressionWithExpectedType === undefined
        ) {
          diagnostics.push(unsupportedNodeDiagnostic(
            element.Initializer,
            "Tuple destructuring defaults require a renderable non-nullish element type and the active expression planner.",
          ));
          return [];
        }
        const whenNull = planDefaultExpressionWithExpectedType(
          element.Initializer,
          sourceFile,
          input,
          diagnostics,
          defaultedElementType,
          element.Initializer,
          state,
        );
        if (whenNull === undefined) {
          return [];
        }
        return planBindingNameFromProjection(
          name,
          {
            kind: "BinaryExpression",
            left: projected,
            operatorToken: { kind: "QuestionQuestionToken" },
            right: whenNull,
          },
          defaultedElementType,
          elementNode,
          sourceFile,
          input,
          diagnostics,
          state,
          defaultedElementCarrier,
        );
      }
      return planBindingNameFromProjection(name, projected, projectedType, elementNode, sourceFile, input, diagnostics, state, elementCarrier);
    }
    if (planDefaultExpressionWithExpectedType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(element.Initializer, "Array destructuring defaults require the active expression planner before C# emission."));
      return [];
    }
    const defaultedProjection = planArrayBindingDefaultProjection(sourceExpression, index, projected, sourceCarrier, element.Initializer, sourceFile, input, diagnostics, projectedType, state, planDefaultExpressionWithExpectedType);
    if (defaultedProjection === undefined) {
      return [];
    }
    return planBindingNameFromProjection(name, defaultedProjection, projectedType, elementNode, sourceFile, input, diagnostics, state, elementCarrier);
  }
  return planBindingNameFromProjection(name, projected, projectedType, elementNode, sourceFile, input, diagnostics, state, elementCarrier);
}

function planArrayBindingProjection(
  sourceExpression: CsharpExpression,
  index: number,
  sourceCarrier: CsharpArrayBindingCarrier,
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
  sourceCarrier: Extract<CsharpArrayBindingCarrier, { readonly kind: "array" }>,
  initializer: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  projectedType: CsharpTypeNode,
  state: DestructuringPlannerState,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
): CsharpExpression | undefined {
  const whenFalse = planDefaultExpressionWithExpectedType(initializer, sourceFile, input, diagnostics, projectedType, initializer, state);
  if (whenFalse === undefined) {
    return undefined;
  }
  return {
    kind: "ConditionalExpression",
    condition: arrayBindingDefaultPresenceCondition(sourceExpression, index, sourceCarrier),
    whenTrue: projected,
    whenFalse,
  };
}

function arrayBindingDefaultPresenceCondition(
  sourceExpression: CsharpExpression,
  index: number,
  sourceCarrier: Extract<CsharpArrayBindingCarrier, { readonly kind: "array" }>,
): CsharpExpression {
  if (csharpCollectionUsesJsArraySemantics(sourceCarrier.carrier)) {
    return {
      kind: "InvocationExpression",
      callee: {
        kind: "SimpleMemberAccessExpression",
        receiver: sourceExpression,
        name: "hasIndex",
      },
      arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: index } }],
    };
  }
  return {
    kind: "BinaryExpression",
    left: {
      kind: "SimpleMemberAccessExpression",
      receiver: sourceExpression,
      name: sourceCarrier.lengthMember,
    },
    operatorToken: { kind: "GreaterThanToken" },
    right: { kind: "LiteralExpression", value: index },
  };
}

function planArrayRestBindingElement(
  elementNode: Node,
  name: Node | undefined,
  sourceExpression: CsharpExpression,
  index: number,
  sourceCarrier: CsharpArrayBindingCarrier,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
): readonly CsharpStatement[] {
  if (sourceCarrier.kind !== "array") {
    return planTupleRestBindingElement(elementNode, name, sourceExpression, index, sourceCarrier, sourceFile, input, diagnostics, state, planBindingNameFromProjection);
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

function planTupleRestBindingElement(
  elementNode: Node,
  name: Node | undefined,
  sourceExpression: CsharpExpression,
  index: number,
  sourceCarrier: Extract<CsharpArrayBindingCarrier, { readonly kind: "tuple" }>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
): readonly CsharpStatement[] {
  if (name === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Tuple rest destructuring requires a target binding name."));
    return [];
  }
  const restElements = sourceCarrier.elements.slice(index);
  const restCarrier = csharpArrayBindingProjectionTarget(
    sourceCarrier,
    index,
    true,
  );
  if (restCarrier?.kind !== "tuple") {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Tuple rest destructuring requires an exact tuple-slice carrier."));
    return [];
  }
  const projectedType = csharpTypeFromTargetTypeRef(restCarrier);
  if (projectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Tuple rest destructuring requires a renderable provider tuple carrier type before C# emission."));
    return [];
  }
  const projectedElements = restElements.map((_, offset) => ({
      kind: "SimpleMemberAccessExpression" as const,
      receiver: sourceExpression,
      name: `Item${index + offset + 1}`,
    }));
  const projected = csharpTupleExpression(projectedElements, projectedType);
  return planBindingNameFromProjection(name, projected, projectedType, elementNode, sourceFile, input, diagnostics, state, restCarrier);
}

function planArrayRestProjection(
  sourceExpression: CsharpExpression,
  index: number,
  sourceCarrier: Extract<CsharpArrayBindingCarrier, { readonly kind: "array" }>,
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
