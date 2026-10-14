import {
  HasSourceKind,
  KindIdentifier,
  Node_Text,
} from "@tsonic/target-api/source";
import { allocateDestructuringTemp } from "../binding-state.js";
import { csharpConstructibleTypeFromObjectShapeFact, csharpTypeFromObjectShapeFact, objectShapeStorageMemberName } from "../../objects/index.js";
import { csharpTupleExpression } from "../../types/csharp-tuples.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { getCsharpTypeForExpressionCarrier } from "../binding-patterns.js";
import { planObjectShapeDefaultProjection } from "../../objects/object-shape-defaults.js";
import { planCsharpBindingDefaultValue } from "../optional-values.js";
import { consumeCsharpPlannedValue } from "../../statements/statement-output.js";
import { requireCsharpIdentifier } from "../../../../target-model/names/identifiers.js";
import { runtimeArrayHelperCall } from "../../expressions/arrays/helpers.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import { bindingElementProjection, bindingPatternSource, missingBindingPatternProjectionMessage } from "../binding-array-patterns.js";
import type { BindingDefaultExpressionPlanner } from "../binding-array-patterns.js";
import type { CsharpArrayBindingCarrier } from "../../../../target-model/types/index.js";
import type { CsharpExpression, CsharpStatement, CsharpTypeNode } from "../../../target-ast/syntax/index.js";
import type { CsharpObjectShapeFact } from "../../../../target-model/types/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import type {
  CsharpDestructuringAssignmentArrayElement,
  CsharpDestructuringAssignmentObjectElement,
  CsharpDestructuringAssignmentPattern,
  CsharpDestructuringAssignmentTarget,
} from "../../../../target-model/records/value-projections.js";
import type { DestructuringPlannerState } from "../binding-state.js";
import type { SourceFile, Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { planArrayDefaultProjection } from "../array-defaults.js";

export function planAssignmentPatternFromExpression(
  pattern: CsharpDestructuringAssignmentPattern,
  sourceExpression: CsharpExpression,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] {
  if (pattern.kind === "array") {
    return planArrayAssignmentPattern(pattern, sourceExpression, sourceFile, input, diagnostics, state, planDefaultExpressionWithExpectedType);
  }
  return planObjectAssignmentPattern(pattern, sourceExpression, sourceFile, input, diagnostics, state, planDefaultExpressionWithExpectedType);
}

function planAssignmentTargetFromProjection(
  target: CsharpDestructuringAssignmentTarget,
  projected: CsharpExpression,
  projectedType: CsharpTypeNode | undefined,
  projectionNode: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] {
  if (target.kind === "node" && hasDestructuringAssignmentKind(target.node, input, KindIdentifier)) {
    return [{
      kind: "ExpressionStatement",
      expression: {
        kind: "AssignmentExpression",
        left: { kind: "IdentifierName", name: requireCsharpIdentifier(Node_Text(input.program.source.ast, target.node), diagnostics, "Destructuring assignment target") },
        operatorToken: { kind: "EqualsToken" },
        right: projected,
      },
    }];
  }
  if (target.kind === "pattern") {
    const tempName = allocateDestructuringTemp(state);
    const tempType = projectedType ?? getCsharpTypeForExpressionCarrier(projectionNode ?? target.pattern.sourceNode, sourceFile, input, diagnostics, target.pattern.sourceNode, "Nested destructuring assignment source");
    const tempReference: CsharpExpression = { kind: "IdentifierName", name: tempName };
    return [
      {
        kind: "LocalDeclarationStatement",
        name: tempName,
        type: tempType,
        initializer: projected,
      },
      ...planAssignmentPatternFromExpression(target.pattern, tempReference, sourceFile, input, diagnostics, state, planDefaultExpressionWithExpectedType),
    ];
  }
  diagnostics.push(unsupportedNodeDiagnostic(target.node, missingBindingPatternProjectionMessage));
  return [];
}

function planArrayAssignmentPattern(
  pattern: Extract<CsharpDestructuringAssignmentPattern, { readonly kind: "array" }>,
  sourceExpression: CsharpExpression,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] {
  const source = bindingPatternSource(pattern.sourceNode, "array-source", input, diagnostics);
  if (source === undefined) {
    return [];
  }
  const bindingCarrier = source.bindingCarrier;
  return pattern.elements.flatMap((element, index) => {
    if (element === undefined) {
      return [];
    }
    return planArrayAssignmentElement(element, sourceExpression, index, bindingCarrier, sourceFile, input, diagnostics, state, planDefaultExpressionWithExpectedType);
  });
}

function planArrayAssignmentElement(
  element: CsharpDestructuringAssignmentArrayElement,
  sourceExpression: CsharpExpression,
  index: number,
  sourceCarrier: CsharpArrayBindingCarrier,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] {
  if (element.rest) {
    return planArrayAssignmentRestElement(element, sourceExpression, index, sourceCarrier, sourceFile, input, diagnostics, state, planDefaultExpressionWithExpectedType);
  }
  const projection = bindingElementProjection(element.sourceNode, "array-element", input, diagnostics);
  if (projection === undefined) {
    return [];
  }
  const elementCarrier = projection.elementCarrier;
  const projectedType = elementCarrier === undefined ? undefined : csharpTypeFromTargetTypeRef(elementCarrier, input.scope.typeParameterNames);
  if (projectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(element.sourceNode, "Array destructuring assignment element requires a renderable provider element carrier type before C# emission."));
    return [];
  }
  const projected = planArrayAssignmentProjection(sourceExpression, index, sourceCarrier);
  if (element.initializer !== undefined) {
    if (sourceCarrier.kind !== "array") {
      const tupleDefault = projection.tupleDefault;
      if (tupleDefault === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(element.sourceNode, missingBindingPatternProjectionMessage));
        return [];
      }
      if (tupleDefault.kind === "planned") {
        const defaultedElementCarrier = tupleDefault.carrier;
        const defaultedElementType = csharpTypeFromTargetTypeRef(
          defaultedElementCarrier, input.scope.typeParameterNames,
        );
        if (defaultedElementType === undefined) {
          diagnostics.push(unsupportedNodeDiagnostic(
            element.initializer,
            "Tuple destructuring assignment defaults require a renderable non-nullish element type.",
          ));
          return [];
        }
        const whenNull = planDefaultExpressionWithExpectedType(
          element.initializer,
          sourceFile,
          input,
          diagnostics,
          defaultedElementType,
          element.initializer,
          state,
          defaultedElementCarrier,
        );
        if (whenNull === undefined) {
          return [];
        }
        const defaulted = planCsharpBindingDefaultValue(element.initializer, sourceFile, input, diagnostics,
          projected, elementCarrier!, whenNull, defaultedElementCarrier, state);
        return defaulted === undefined ? [] : consumeCsharpPlannedValue(defaulted, expression => planAssignmentTargetFromProjection(
          element.target, expression,
          defaultedElementType,
          element.sourceNode,
          sourceFile,
          input,
          diagnostics,
          state,
          planDefaultExpressionWithExpectedType,
        ));
      }
      return planAssignmentTargetFromProjection(element.target, projected, projectedType, element.sourceNode, sourceFile, input, diagnostics, state, planDefaultExpressionWithExpectedType);
    }
    const defaultedProjection = planArrayDefaultProjection(sourceExpression, index, projected, sourceCarrier, element.initializer, sourceFile, input, diagnostics, state, planDefaultExpressionWithExpectedType);
    if (defaultedProjection === undefined) {
      return [];
    }
    return consumeCsharpPlannedValue(defaultedProjection.value, expression =>
      planAssignmentTargetFromProjection(element.target, expression, defaultedProjection.type, element.sourceNode, sourceFile, input, diagnostics, state, planDefaultExpressionWithExpectedType));
  }
  return planAssignmentTargetFromProjection(element.target, projected, projectedType, element.sourceNode, sourceFile, input, diagnostics, state, planDefaultExpressionWithExpectedType);
}

function planArrayAssignmentRestElement(
  element: CsharpDestructuringAssignmentArrayElement,
  sourceExpression: CsharpExpression,
  index: number,
  sourceCarrier: CsharpArrayBindingCarrier,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] {
  if (sourceCarrier.kind !== "array") {
    return planTupleAssignmentRestElement(element, sourceExpression, index, sourceCarrier, sourceFile, input, diagnostics, state, planDefaultExpressionWithExpectedType);
  }
  const projection = bindingElementProjection(element.sourceNode, "array-rest", input, diagnostics);
  if (projection === undefined) {
    return [];
  }
  const projectedType = csharpTypeFromTargetTypeRef(projection.restCarrier, input.scope.typeParameterNames);
  if (projectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(element.sourceNode, "Array rest destructuring assignment requires a renderable provider array carrier type before C# emission."));
    return [];
  }
  return planAssignmentTargetFromProjection(
    element.target,
    planArrayRestAssignmentProjection(sourceExpression, index, sourceCarrier),
    projectedType,
    element.sourceNode,
    sourceFile,
    input,
    diagnostics,
    state,
    planDefaultExpressionWithExpectedType,
  );
}

function planTupleAssignmentRestElement(
  element: CsharpDestructuringAssignmentArrayElement,
  sourceExpression: CsharpExpression,
  index: number,
  sourceCarrier: Extract<CsharpArrayBindingCarrier, { readonly kind: "tuple" }>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] {
  const projection = bindingElementProjection(element.sourceNode, "tuple-rest", input, diagnostics);
  if (projection === undefined) {
    return [];
  }
  const restElements = sourceCarrier.elements.slice(index);
  const projectedType = csharpTypeFromTargetTypeRef(projection.restCarrier, input.scope.typeParameterNames);
  if (projectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(element.sourceNode, "Tuple rest destructuring assignment requires a renderable provider tuple carrier type before C# emission."));
    return [];
  }
  const projectedElements = restElements.map((_, offset) => ({
      kind: "SimpleMemberAccessExpression" as const,
      receiver: sourceExpression,
      name: `Item${index + offset + 1}`,
    }));
  const projected = csharpTupleExpression(projectedElements, projectedType);
  return planAssignmentTargetFromProjection(
    element.target,
    projected,
    projectedType,
    element.sourceNode,
    sourceFile,
    input,
    diagnostics,
    state,
    planDefaultExpressionWithExpectedType,
  );
}

function planArrayAssignmentProjection(
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
    arguments: [{ kind: "LiteralExpression", value: index }],
  };
}

function planArrayRestAssignmentProjection(
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

function planObjectAssignmentPattern(
  pattern: Extract<CsharpDestructuringAssignmentPattern, { readonly kind: "object" }>,
  sourceExpression: CsharpExpression,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] {
  const source = bindingPatternSource(pattern.sourceNode, "object-shape-source", input, diagnostics);
  if (source === undefined) {
    return [];
  }
  const objectShape = source.shape;
  csharpTypeFromObjectShapeFact(input, objectShape, diagnostics, pattern.sourceNode);
  return pattern.elements.flatMap((element) =>
    planObjectAssignmentElement(element, sourceExpression, objectShape, sourceFile, input, diagnostics, state, planDefaultExpressionWithExpectedType)
  );
}

function planObjectAssignmentElement(
  element: CsharpDestructuringAssignmentObjectElement,
  sourceExpression: CsharpExpression,
  objectShape: CsharpObjectShapeFact,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] {
  if (element.kind === "object-rest") {
    return planObjectAssignmentRestElement(element, sourceExpression, objectShape, sourceFile, input, diagnostics, state, planDefaultExpressionWithExpectedType);
  }
  const projection = bindingElementProjection(element.sourceNode, "object-shape-member", input, diagnostics);
  if (projection === undefined) {
    return [];
  }
  const member = projection.member;
  const projectedType = csharpTypeFromTargetTypeRef(member.type, input.scope.typeParameterNames);
  if (projectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(element.sourceNode, `Object-shape member '${member.sourceName}' must carry a renderable target type before C# emission.`));
    return [];
  }
  const projected: CsharpExpression = {
    kind: "SimpleMemberAccessExpression",
    receiver: sourceExpression,
    name: member.targetName,
  };
  if (element.initializer === undefined) {
    return planAssignmentTargetFromProjection(element.target, projected, projectedType, element.sourceNode, sourceFile, input, diagnostics, state, planDefaultExpressionWithExpectedType);
  }
  const defaultedProjection = planObjectShapeDefaultProjection(projected, member, element.initializer, sourceFile, input, diagnostics, state, planDefaultExpressionWithExpectedType);
  if (defaultedProjection === undefined) {
    return [];
  }
  return consumeCsharpPlannedValue(defaultedProjection.value, expression =>
    planAssignmentTargetFromProjection(element.target, expression, defaultedProjection.type, element.sourceNode, sourceFile, input, diagnostics, state, planDefaultExpressionWithExpectedType));
}

function planObjectAssignmentRestElement(
  element: Extract<CsharpDestructuringAssignmentObjectElement, { readonly kind: "object-rest" }>,
  sourceExpression: CsharpExpression,
  sourceShape: CsharpObjectShapeFact,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] {
  const projection = bindingElementProjection(element.sourceNode, "object-shape-rest", input, diagnostics);
  if (projection === undefined) {
    return [];
  }
  const restShape = projection.restShape;
  const restType = csharpConstructibleTypeFromObjectShapeFact(
    input,
    restShape,
    diagnostics,
    element.sourceNode,
  );
  if (restType === undefined) {
    return [];
  }
  const assignments = projection.members.map(({ rest, source }) => ({
    kind: "AssignmentExpression" as const,
    name: objectShapeStorageMemberName(restShape, rest),
    expression: {
      kind: "SimpleMemberAccessExpression" as const,
      receiver: sourceExpression,
      name: objectShapeStorageMemberName(sourceShape, source),
    },
  }));
  return planAssignmentTargetFromProjection(element.target, {
    kind: "ObjectCreationExpression",
    type: restType,
    assignments,
  }, restType, element.sourceNode, sourceFile, input, diagnostics, state, planDefaultExpressionWithExpectedType);
}

function hasDestructuringAssignmentKind(
  node: Node | undefined,
  input: CsharpPlanningContext,
  expected: string,
): boolean {
  return HasSourceKind(input.program.source.ast, node, expected);
}
