import type { CsharpPlanningContext } from "../context.js";
import {
  AsBindingElement,
  AsBindingPattern,
  HasSourceKind,
  KindIdentifier,
  KindStringLiteral,
  Node_Text,
} from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpObjectInitializerAssignment,
  CsharpStatement,
} from "../../target-ast/roslyn/index.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import type { BindingProjectionPlanner } from "./binding-pattern-contracts.js";
import type { BindingDefaultExpressionPlanner } from "./binding-array-patterns.js";
import { getCsharpObjectShapeFactForNode } from "../objects/fact-queries.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { planObjectShapeDefaultProjection } from "../objects/object-shape-defaults.js";
import {
  csharpConstructibleTypeFromObjectShapeFact,
  objectShapeStorageMemberName,
} from "../objects/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import {
  targetTypeRefEquals,
} from "../../../target-model/types/index.js";
import type { CsharpObjectShapeFact } from "../../../target-model/types/index.js";
import {
  csharpObjectShapeMemberLookupFailureMessage,
  resolveCsharpObjectShapeMemberBySourceContract,
  resolveCsharpObjectShapeMemberBySourceKey,
} from "../../../target-model/types/index.js";

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
  const explicitlyExtractedSourceNames = collectObjectShapeExtractedSourceNames(elements, input);
  return elements.flatMap((elementNode) => {
    if (elementNode === undefined) {
      return [];
    }
    return planObjectShapeBindingElement(elementNode, sourceExpression, objectShape, explicitlyExtractedSourceNames, sourceFile, input, diagnostics, state, planBindingNameFromProjection, planDefaultExpressionWithExpectedType);
  });
}

function planObjectShapeBindingElement(
  elementNode: Node,
  sourceExpression: CsharpExpression,
  objectShape: CsharpObjectShapeFact,
  explicitlyExtractedSourceNames: ReadonlySet<string>,
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
    return planObjectShapeRestBindingElement(elementNode, sourceExpression, objectShape, explicitlyExtractedSourceNames, sourceFile, input, diagnostics, state, planBindingNameFromProjection);
  }
  const name = element.name;
  if (name === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Object binding element must have a target binding name."));
    return [];
  }
  const sourceName = getObjectShapeBindingPropertySourceName(elementNode, input, diagnostics);
  if (sourceName === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Object destructuring property must match a finalized provider object-shape member."));
    return [];
  }
  const memberLookup = resolveCsharpObjectShapeMemberBySourceContract(
    objectShape,
    sourceName,
    "checked-object-binding-property",
  );
  if (memberLookup.kind !== "resolved") {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, csharpObjectShapeMemberLookupFailureMessage(memberLookup, "Object destructuring property")));
    return [];
  }
  const member = memberLookup.member;
  const projectedType = csharpTypeFromTargetTypeRef(member.type);
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
    return planBindingNameFromProjection(name, projected, projectedType, elementNode, sourceFile, input, diagnostics, state, member.type);
  }
  const defaultedProjection = planObjectShapeDefaultProjection(projected, member, element.Initializer, sourceFile, input, diagnostics, state, planDefaultExpressionWithExpectedType);
  if (defaultedProjection === undefined) {
    return [];
  }
  return planBindingNameFromProjection(name, defaultedProjection.expression, defaultedProjection.type, elementNode, sourceFile, input, diagnostics, state, defaultedProjection.carrier);
}

function planObjectShapeRestBindingElement(
  elementNode: Node,
  sourceExpression: CsharpExpression,
  sourceShape: CsharpObjectShapeFact,
  explicitlyExtractedSourceNames: ReadonlySet<string>,
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
  const restShape = getCsharpObjectShapeFactForNode(name, sourceFile, input);
  if (restShape === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Object rest destructuring requires finalized provider object-shape facts for the rest binding."));
    return [];
  }
  const restType = csharpConstructibleTypeFromObjectShapeFact(
    input,
    restShape,
    diagnostics,
    elementNode,
  );
  if (restType === undefined) {
    return [];
  }
  for (const sourceName of explicitlyExtractedSourceNames) {
    const staleRestMember = resolveCsharpObjectShapeMemberBySourceContract(
      restShape,
      sourceName,
      "finalized-object-rest-member",
    );
    if (staleRestMember.kind === "resolved") {
      diagnostics.push(unsupportedNodeDiagnostic(elementNode, `Object rest destructuring rest shape must exclude explicitly extracted member '${staleRestMember.member.sourceName}'.`));
      return [];
    }
  }
  const assignments = restShape.members.map((restMember): CsharpObjectInitializerAssignment | undefined => {
    const sourceMemberLookup = resolveCsharpObjectShapeMemberBySourceKey(
      sourceShape,
      restMember.sourceKey,
      "finalized-object-rest-member",
    );
    if (sourceMemberLookup.kind !== "resolved") {
      diagnostics.push(unsupportedNodeDiagnostic(elementNode, csharpObjectShapeMemberLookupFailureMessage(sourceMemberLookup, "Object rest destructuring source shape")));
      return undefined;
    }
    const sourceMember = sourceMemberLookup.member;
    if (!targetTypeRefEquals(sourceMember.type, restMember.type)) {
      diagnostics.push(unsupportedNodeDiagnostic(elementNode, `Object rest destructuring member '${restMember.sourceName}' requires matching finalized source and rest member carriers.`));
      return undefined;
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
  }, restType, elementNode, sourceFile, input, diagnostics, state, restShape.targetType);
}

function collectObjectShapeExtractedSourceNames(
  elements: readonly (Node | undefined)[],
  input: CsharpPlanningContext,
): ReadonlySet<string> {
  const sourceNames = new Set<string>();
  for (const elementNode of elements) {
    if (elementNode === undefined) {
      continue;
    }
    const element = AsBindingElement(input.program.source.ast, elementNode);
    if (element === undefined || element.DotDotDotToken !== undefined) {
      continue;
    }
    const sourceName = getObjectShapeBindingPropertySourceName(elementNode, input);
    if (sourceName !== undefined) {
      sourceNames.add(sourceName);
    }
  }
  return sourceNames;
}

function getObjectShapeBindingPropertySourceName(
  elementNode: Node,
  input: CsharpPlanningContext,
  diagnostics?: TargetDiagnostic[],
): string | undefined {
  const element = AsBindingElement(input.program.source.ast, elementNode);
  if (element === undefined) {
    return undefined;
  }
  const propertyName = element.PropertyName ?? element.name;
  if (propertyName === undefined) {
    return undefined;
  }
  if (!HasSourceKind(input.program.source.ast, propertyName, KindIdentifier) && !HasSourceKind(input.program.source.ast, propertyName, KindStringLiteral)) {
    diagnostics?.push(unsupportedNodeDiagnostic(propertyName, "Object destructuring from object-shape facts supports only identifier or string-literal property names."));
    return undefined;
  }
  return Node_Text(input.program.source.ast, propertyName);
}
