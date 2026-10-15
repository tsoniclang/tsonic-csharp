import type { CsharpPlanningContext } from "../context.js";
import {
  AsBindingElement,
  AsBindingPattern,
  HasSourceKind,
  KindIdentifier,
} from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpObjectInitializerAssignment,
  CsharpStatement,
} from "../../target-ast/syntax/index.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import type { BindingProjectionPlanner } from "./binding-pattern-contracts.js";
import { bindingElementProjection } from "./binding-array-patterns.js";
import type { BindingDefaultExpressionPlanner } from "./binding-array-patterns.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { planObjectShapeDefaultProjection } from "../objects/object-shape-defaults.js";
import {
  csharpConstructibleTypeFromObjectShapeFact,
  objectShapeStorageMemberName,
} from "../objects/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import type { CsharpObjectShapeFact } from "../../../target-model/types/index.js";
import { consumeCsharpPlannedValue } from "../statements/statement-output.js";

export function planObjectShapeBindingPattern(
  patternNode: Node,
  sourceExpression: CsharpExpression,
  objectShape: CsharpObjectShapeFact,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
  planDefaultExpressionWithExpectedType?: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] {
  const elements = AsBindingPattern(input.program.source.ast, patternNode)?.Elements?.Nodes ?? [];
  return elements.flatMap((elementNode) => {
    if (elementNode === undefined) {
      return [];
    }
    return planObjectShapeBindingElement(elementNode, sourceExpression, objectShape, sourceFile, input, diagnostics, state, planBindingNameFromProjection, planDefaultExpressionWithExpectedType);
  });
}

function planObjectShapeBindingElement(
  elementNode: Node,
  sourceExpression: CsharpExpression,
  objectShape: CsharpObjectShapeFact,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
  planDefaultExpressionWithExpectedType?: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] {
  const element = AsBindingElement(input.program.source.ast, elementNode);
  if (element === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Object binding pattern element must be a binding element."));
    return [];
  }
  if (element.DotDotDotToken !== undefined) {
    return planObjectShapeRestBindingElement(elementNode, sourceExpression, objectShape, sourceFile, input, diagnostics, state, planBindingNameFromProjection);
  }
  const name = element.name;
  if (name === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Object binding element must have a target binding name."));
    return [];
  }
  const projection = bindingElementProjection(elementNode, "object-shape-member", input, diagnostics);
  if (projection === undefined) {
    return [];
  }
  const member = projection.member;
  const projectedType = csharpTypeFromTargetTypeRef(member.type, input.scope.typeParameterNames);
  if (projectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, `Object-shape member '${member.sourceName}' must carry a renderable target type before C# emission.`));
    return [];
  }
  const projected: CsharpExpression = {
    kind: "SimpleMemberAccessExpression",
    receiver: sourceExpression,
    name: member.targetName,
  };
  if (element.Initializer === undefined) {
    return planBindingNameFromProjection(name, projected, projectedType, elementNode, sourceFile, input, diagnostics, state);
  }
  const defaultedProjection = planObjectShapeDefaultProjection(projected, member, element.Initializer, sourceFile, input, diagnostics, state, planDefaultExpressionWithExpectedType);
  if (defaultedProjection === undefined) {
    return [];
  }
  return consumeCsharpPlannedValue(defaultedProjection.value, expression =>
    planBindingNameFromProjection(name, expression, defaultedProjection.type, elementNode, sourceFile, input, diagnostics, state));
}

function planObjectShapeRestBindingElement(
  elementNode: Node,
  sourceExpression: CsharpExpression,
  sourceShape: CsharpObjectShapeFact,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
): readonly CsharpStatement[] {
  const element = AsBindingElement(input.program.source.ast, elementNode);
  const name = element?.name;
  if (name === undefined || !HasSourceKind(input.program.source.ast, name, KindIdentifier)) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Object rest destructuring requires an identifier binding name."));
    return [];
  }
  const projection = bindingElementProjection(elementNode, "object-shape-rest", input, diagnostics);
  if (projection === undefined) {
    return [];
  }
  const restShape = projection.restShape;
  const restType = csharpConstructibleTypeFromObjectShapeFact(
    input,
    restShape,
    diagnostics,
    elementNode,
  );
  if (restType === undefined) {
    return [];
  }
  const assignments = projection.members.map(({ rest: restMember, source: sourceMember }): CsharpObjectInitializerAssignment | undefined => {
    if (sourceMember.memberKind === "method") {
      const required = input.artifacts.requireObjectShapeCapability(undefined, sourceShape.targetType,
        sourceFile, "method-values", "object-shape");
      if (required.kind === "rejected") {
        diagnostics.push(unsupportedNodeDiagnostic(elementNode, required.reason));
        return undefined;
      }
    }
    return {
      kind: "AssignmentExpression",
      name: objectShapeStorageMemberName(restShape, restMember),
      expression: {
        kind: "SimpleMemberAccessExpression",
        receiver: sourceExpression,
        name: objectShapeStorageMemberName(sourceShape, sourceMember),
      } satisfies CsharpExpression,
    };
  });
  if (assignments.some((assignment) => assignment === undefined)) {
    return [];
  }
  return planBindingNameFromProjection(name, {
    kind: "ObjectCreationExpression",
    type: restType,
    assignments: assignments as readonly CsharpObjectInitializerAssignment[],
  }, restType, elementNode, sourceFile, input, diagnostics, state);
}
