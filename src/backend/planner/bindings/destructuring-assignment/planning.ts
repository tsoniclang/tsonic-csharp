import {
  AsBinaryExpression,
  AsObjectLiteralExpression,
  AsPropertyAssignment,
  AsShorthandPropertyAssignment,
  AsSpreadAssignment,
  AsSpreadElement,
  HasSourceKind,
  KindArrayLiteralExpression,
  KindBinaryExpression,
  KindEqualsToken,
  KindIdentifier,
  KindObjectLiteralExpression,
  KindOmittedExpression,
  KindPropertyAssignment,
  KindShorthandPropertyAssignment,
  KindSpreadAssignment,
  KindSpreadElement,
  KindStringLiteral,
  Node_Text,
  Node_Expression,
} from "@tsonic/target-api/source";
import {
  csharpArrayBindingProjectionTarget,
  csharpCollectionUsesJsArraySemantics,
  getCsharpNullableElementTargetType,
  resolveCsharpArrayBindingCarrier,
  targetTypeRefEquals,
} from "../../../../policy/types/index.js";
import { allocateDestructuringTemp } from "../binding-state.js";
import { csharpConstructibleTypeFromObjectShapeFact, csharpTypeFromObjectShapeFact, objectShapeStorageMemberName } from "../../objects/index.js";
import { csharpObjectShapeMemberLookupFailureMessage, resolveCsharpObjectShapeMemberBySourceContract } from "../../../../policy/types/index.js";
import { csharpTupleExpression } from "../../types/csharp-tuples.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { getCsharpTypeForExpressionCarrier } from "../binding-patterns.js";
import { getObjectShapeForBindingSource } from "../binding-object-patterns.js";
import { missingCarrierDiagnosticDetail, resolveRuntimeCarrierForExpression } from "../../types/runtime-carriers.js";
import { planObjectShapeDefaultProjection } from "../../objects/object-shape-defaults.js";
import { requireCsharpIdentifier } from "../../../../policy/names/identifiers.js";
import { runtimeArrayHelperCall } from "../../expressions/arrays/helpers.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import type { BindingDefaultExpressionPlanner } from "../binding-array-patterns.js";
import type { CsharpArrayBindingCarrier } from "../../../../policy/types/index.js";
import type { CsharpExpression, CsharpStatement, CsharpTypeNode } from "../../../target-ast/roslyn/index.js";
import type { CsharpObjectShapeFact } from "../../../../policy/types/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import type { DestructuringAssignmentArrayElement, DestructuringAssignmentObjectElement, DestructuringAssignmentPattern, DestructuringAssignmentTarget } from "./entry.js";
import type { DestructuringPlannerState } from "../binding-state.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../../policy/types/index.js";

export function planAssignmentPatternFromExpression(
  pattern: DestructuringAssignmentPattern,
  sourceExpression: CsharpExpression,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  sourceCarrier: TargetTypeRef | undefined,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] {
  if (pattern.kind === "array") {
    return planArrayAssignmentPattern(pattern, sourceExpression, sourceNode, sourceFile, input, diagnostics, state, sourceCarrier, planDefaultExpressionWithExpectedType);
  }
  if (pattern.kind === "object") {
    return planObjectAssignmentPattern(pattern, sourceExpression, sourceNode, sourceFile, input, diagnostics, state, planDefaultExpressionWithExpectedType);
  }
  return [];
}

function planAssignmentTargetFromProjection(
  target: DestructuringAssignmentTarget,
  projected: CsharpExpression,
  projectedType: CsharpTypeNode | undefined,
  projectionNode: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  projectedCarrier: TargetTypeRef | undefined,
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
      ...planAssignmentPatternFromExpression(target.pattern, tempReference, projectionNode, sourceFile, input, diagnostics, state, projectedCarrier, planDefaultExpressionWithExpectedType),
    ];
  }
  diagnostics.push(unsupportedNodeDiagnostic(target.node, "Destructuring assignment target supports source-owned identifiers and nested destructuring patterns only."));
  return [];
}

function planArrayAssignmentPattern(
  pattern: Extract<DestructuringAssignmentPattern, { readonly kind: "array" }>,
  sourceExpression: CsharpExpression,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  sourceCarrier: TargetTypeRef | undefined,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] {
  const bindingCarrier = resolveCsharpArrayBindingCarrier(sourceCarrier);
  if (bindingCarrier === undefined) {
    const resolution = resolveRuntimeCarrierForExpression(input, sourceNode, sourceFile);
    const detail = missingCarrierDiagnosticDetail(resolution, "Runtime carrier fact is missing for the array destructuring assignment source expression.");
    diagnostics.push(unsupportedNodeDiagnostic(pattern.sourceNode, `Array destructuring assignment requires a finalized provider array or tuple runtime-carrier fact for the source expression. ${detail.reason}`, detail.evidence));
    return [];
  }
  return pattern.elements.flatMap((element, index) => {
    if (element === undefined) {
      return [];
    }
    return planArrayAssignmentElement(element, sourceExpression, index, bindingCarrier, sourceFile, input, diagnostics, state, planDefaultExpressionWithExpectedType);
  });
}

function planArrayAssignmentElement(
  element: DestructuringAssignmentArrayElement,
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
  const elementCarrier = csharpArrayBindingProjectionTarget(
    sourceCarrier,
    index,
    false,
  );
  const projectedType = elementCarrier === undefined ? undefined : csharpTypeFromTargetTypeRef(elementCarrier);
  if (projectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(element.sourceNode, "Array destructuring assignment element requires a renderable provider element carrier type before C# emission."));
    return [];
  }
  const projected = planArrayAssignmentProjection(sourceExpression, index, sourceCarrier);
  if (element.initializer !== undefined) {
    if (sourceCarrier.kind !== "array") {
      const defaultedElementCarrier =
        getCsharpNullableElementTargetType(elementCarrier);
      if (defaultedElementCarrier !== undefined) {
        const defaultedElementType = csharpTypeFromTargetTypeRef(
          defaultedElementCarrier,
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
        );
        if (whenNull === undefined) {
          return [];
        }
        return planAssignmentTargetFromProjection(
          element.target,
          {
            kind: "BinaryExpression",
            left: projected,
            operatorToken: { kind: "QuestionQuestionToken" },
            right: whenNull,
          },
          defaultedElementType,
          element.sourceNode,
          sourceFile,
          input,
          diagnostics,
          state,
          defaultedElementCarrier,
          planDefaultExpressionWithExpectedType,
        );
      }
      return planAssignmentTargetFromProjection(element.target, projected, projectedType, element.sourceNode, sourceFile, input, diagnostics, state, elementCarrier, planDefaultExpressionWithExpectedType);
    }
    const defaultedProjection = planArrayAssignmentDefaultProjection(sourceExpression, index, projected, sourceCarrier, element.initializer, sourceFile, input, diagnostics, projectedType, state, planDefaultExpressionWithExpectedType);
    if (defaultedProjection === undefined) {
      return [];
    }
    return planAssignmentTargetFromProjection(element.target, defaultedProjection, projectedType, element.sourceNode, sourceFile, input, diagnostics, state, elementCarrier, planDefaultExpressionWithExpectedType);
  }
  return planAssignmentTargetFromProjection(element.target, projected, projectedType, element.sourceNode, sourceFile, input, diagnostics, state, elementCarrier, planDefaultExpressionWithExpectedType);
}

function planArrayAssignmentRestElement(
  element: DestructuringAssignmentArrayElement,
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
  const projectedType = csharpTypeFromTargetTypeRef(sourceCarrier.restCarrier);
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
    sourceCarrier.restCarrier,
    planDefaultExpressionWithExpectedType,
  );
}

function planTupleAssignmentRestElement(
  element: DestructuringAssignmentArrayElement,
  sourceExpression: CsharpExpression,
  index: number,
  sourceCarrier: Extract<CsharpArrayBindingCarrier, { readonly kind: "tuple" }>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] {
  const restElements = sourceCarrier.elements.slice(index);
  const restCarrier = csharpArrayBindingProjectionTarget(
    sourceCarrier,
    index,
    true,
  );
  if (restCarrier?.kind !== "tuple") {
    diagnostics.push(unsupportedNodeDiagnostic(element.sourceNode, "Tuple rest destructuring assignment requires an exact tuple-slice carrier."));
    return [];
  }
  const projectedType = csharpTypeFromTargetTypeRef(restCarrier);
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
    restCarrier,
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
    argument: { kind: "LiteralExpression", value: index },
  };
}

function planArrayAssignmentDefaultProjection(
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
    condition: arrayAssignmentDefaultPresenceCondition(sourceExpression, index, sourceCarrier),
    whenTrue: projected,
    whenFalse,
  };
}

function arrayAssignmentDefaultPresenceCondition(
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
  pattern: Extract<DestructuringAssignmentPattern, { readonly kind: "object" }>,
  sourceExpression: CsharpExpression,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] {
  const objectShape = getObjectShapeForBindingSource(sourceNode, sourceFile, input);
  if (objectShape === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(pattern.sourceNode, "Object destructuring assignment requires finalized provider object-shape facts before C# emission."));
    return [];
  }
  csharpTypeFromObjectShapeFact(input, objectShape, diagnostics, pattern.sourceNode);
  const extractedSourceNames = collectObjectAssignmentExtractedSourceNames(pattern.elements, input);
  return pattern.elements.flatMap((element) =>
    planObjectAssignmentElement(element, sourceExpression, objectShape, extractedSourceNames, sourceFile, input, diagnostics, state, planDefaultExpressionWithExpectedType)
  );
}

function planObjectAssignmentElement(
  element: DestructuringAssignmentObjectElement,
  sourceExpression: CsharpExpression,
  objectShape: CsharpObjectShapeFact,
  extractedSourceNames: ReadonlySet<string>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] {
  if (element.kind === "object-rest") {
    return planObjectAssignmentRestElement(element, sourceExpression, objectShape, extractedSourceNames, sourceFile, input, diagnostics, state, planDefaultExpressionWithExpectedType);
  }
  const sourceName = getObjectAssignmentPropertySourceName(element, input, diagnostics);
  if (sourceName === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(element.sourceNode, "Object destructuring assignment property must match a finalized provider object-shape member."));
    return [];
  }
  const memberLookup = resolveCsharpObjectShapeMemberBySourceContract(
    objectShape,
    sourceName,
    "checked-object-binding-property",
  );
  if (memberLookup.kind !== "resolved") {
    diagnostics.push(unsupportedNodeDiagnostic(element.sourceNode, csharpObjectShapeMemberLookupFailureMessage(memberLookup, "Object destructuring assignment property")));
    return [];
  }
  const member = memberLookup.member;
  const projectedType = csharpTypeFromTargetTypeRef(member.type);
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
    return planAssignmentTargetFromProjection(element.target, projected, projectedType, element.sourceNode, sourceFile, input, diagnostics, state, member.type, planDefaultExpressionWithExpectedType);
  }
  const defaultedProjection = planObjectShapeDefaultProjection(projected, member, element.initializer, sourceFile, input, diagnostics, state, planDefaultExpressionWithExpectedType);
  if (defaultedProjection === undefined) {
    return [];
  }
  return planAssignmentTargetFromProjection(element.target, defaultedProjection.expression, defaultedProjection.type, element.sourceNode, sourceFile, input, diagnostics, state, defaultedProjection.carrier, planDefaultExpressionWithExpectedType);
}

function planObjectAssignmentRestElement(
  element: Extract<DestructuringAssignmentObjectElement, { readonly kind: "object-rest" }>,
  sourceExpression: CsharpExpression,
  sourceShape: CsharpObjectShapeFact,
  extractedSourceNames: ReadonlySet<string>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] {
  if (element.target.kind !== "node" || !HasSourceKind(input.program.source.ast, element.target.node, KindIdentifier)) {
    diagnostics.push(unsupportedNodeDiagnostic(element.sourceNode, "Object rest destructuring assignment requires an identifier assignment target."));
    return [];
  }
  const restShape = getObjectShapeForBindingSource(element.target.node, sourceFile, input);
  if (restShape === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(element.sourceNode, "Object rest destructuring assignment requires finalized provider object-shape facts for the rest target."));
    return [];
  }
  const restType = csharpConstructibleTypeFromObjectShapeFact(
    input,
    restShape,
    diagnostics,
    element.sourceNode,
  );
  if (restType === undefined) {
    return [];
  }
  for (const sourceName of extractedSourceNames) {
    const staleRestMember = resolveCsharpObjectShapeMemberBySourceContract(
      restShape,
      sourceName,
      "finalized-object-rest-member",
    );
    if (staleRestMember.kind === "resolved") {
      diagnostics.push(unsupportedNodeDiagnostic(element.sourceNode, `Object rest destructuring assignment rest shape must exclude explicitly extracted member '${staleRestMember.member.sourceName}'.`));
      return [];
    }
  }
  const assignments = restShape.members.map((restMember) => {
    const sourceMemberLookup = resolveCsharpObjectShapeMemberBySourceContract(
      sourceShape,
      restMember.sourceName,
      "finalized-object-rest-member",
    );
    if (sourceMemberLookup.kind !== "resolved") {
      diagnostics.push(unsupportedNodeDiagnostic(element.sourceNode, csharpObjectShapeMemberLookupFailureMessage(sourceMemberLookup, "Object rest destructuring assignment source shape")));
      return undefined;
    }
    const sourceMember = sourceMemberLookup.member;
    if (!targetTypeRefEquals(sourceMember.type, restMember.type)) {
      diagnostics.push(unsupportedNodeDiagnostic(element.sourceNode, `Object rest destructuring assignment member '${restMember.sourceName}' requires matching finalized source and rest member carriers.`));
      return undefined;
    }
    return {
      kind: "AssignmentExpression" as const,
      name: objectShapeStorageMemberName(restShape, restMember),
      expression: {
        kind: "SimpleMemberAccessExpression" as const,
        receiver: sourceExpression,
        name: objectShapeStorageMemberName(sourceShape, sourceMember),
      },
    };
  });
  if (assignments.some((assignment) => assignment === undefined)) {
    return [];
  }
  return planAssignmentTargetFromProjection(element.target, {
    kind: "ObjectCreationExpression",
    type: restType,
    assignments: assignments.filter((assignment) => assignment !== undefined),
  }, restType, element.sourceNode, sourceFile, input, diagnostics, state, restShape.targetType, planDefaultExpressionWithExpectedType);
}

function collectObjectAssignmentExtractedSourceNames(
  elements: readonly DestructuringAssignmentObjectElement[],
  input: CsharpPlanningContext,
): ReadonlySet<string> {
  const sourceNames = new Set<string>();
  for (const element of elements) {
    if (element.kind === "object-rest") {
      continue;
    }
    const sourceName = getObjectAssignmentPropertySourceName(element, input);
    if (sourceName !== undefined) {
      sourceNames.add(sourceName);
    }
  }
  return sourceNames;
}

function getObjectAssignmentPropertySourceName(
  element: Extract<DestructuringAssignmentObjectElement, { readonly kind: "object-property" }>,
  input: CsharpPlanningContext,
  diagnostics?: TargetDiagnostic[],
): string | undefined {
  const propertyName = element.propertyName ?? (element.target.kind === "node" ? element.target.node : undefined);
  if (propertyName === undefined) {
    return undefined;
  }
  if (!HasSourceKind(input.program.source.ast, propertyName, KindIdentifier) && !HasSourceKind(input.program.source.ast, propertyName, KindStringLiteral)) {
    diagnostics?.push(unsupportedNodeDiagnostic(propertyName, "Object destructuring assignment from object-shape facts supports only identifier or string-literal property names."));
    return undefined;
  }
  return Node_Text(input.program.source.ast, propertyName);
}

export function destructuringAssignmentPattern(
  node: Node,
  input: CsharpPlanningContext,
): DestructuringAssignmentPattern | undefined {
  if (hasDestructuringAssignmentKind(node, input, KindArrayLiteralExpression)) {
    return {
      kind: "array",
      sourceNode: node,
      elements: (node as { readonly Elements?: { readonly Nodes?: readonly (Node | undefined)[] } }).Elements?.Nodes?.map((element) =>
        element === undefined ? undefined : destructuringAssignmentArrayElement(element, input)
      ) ?? [],
    };
  }
  if (hasDestructuringAssignmentKind(node, input, KindObjectLiteralExpression)) {
    return {
      kind: "object",
      sourceNode: node,
      elements: AsObjectLiteralExpression(input.program.source.ast, node)?.Properties?.Nodes?.flatMap((property) => {
        const element = property === undefined ? undefined : destructuringAssignmentObjectElement(property, input);
        return element === undefined ? [] : [element];
      }) ?? [],
    };
  }
  return undefined;
}

function destructuringAssignmentArrayElement(
  node: Node,
  input: CsharpPlanningContext,
): DestructuringAssignmentArrayElement | undefined {
  if (hasDestructuringAssignmentKind(node, input, KindOmittedExpression)) {
    return undefined;
  }
  if (hasDestructuringAssignmentKind(node, input, KindSpreadElement)) {
    const spread = AsSpreadElement(input.program.source.ast, node);
    const target = Node_Expression(input.program.source.ast, node) ?? spread?.Expression;
    return target === undefined ? undefined : {
      kind: "array-element",
      sourceNode: node,
      target: destructuringAssignmentTarget(target, input),
      rest: true,
    };
  }
  const defaulted = destructuringAssignmentDefaultTarget(node, input);
  if (defaulted !== undefined) {
    return {
      kind: "array-element",
      sourceNode: node,
      target: defaulted.target,
      initializer: defaulted.initializer,
      rest: false,
    };
  }
  return {
    kind: "array-element",
    sourceNode: node,
    target: destructuringAssignmentTarget(node, input),
    rest: false,
  };
}

function destructuringAssignmentObjectElement(
  node: Node,
  input: CsharpPlanningContext,
): DestructuringAssignmentObjectElement | undefined {
  if (hasDestructuringAssignmentKind(node, input, KindSpreadAssignment)) {
    const spread = AsSpreadAssignment(input.program.source.ast, node);
    return spread?.Expression === undefined ? undefined : {
      kind: "object-rest",
      sourceNode: node,
      target: destructuringAssignmentTarget(spread.Expression, input),
    };
  }
  if (hasDestructuringAssignmentKind(node, input, KindShorthandPropertyAssignment)) {
    const shorthand = AsShorthandPropertyAssignment(input.program.source.ast, node);
    const defaultInitializer = shorthand?.ObjectAssignmentInitializer;
    return shorthand?.name === undefined ? undefined : {
      kind: "object-property",
      sourceNode: node,
      target: destructuringAssignmentTarget(shorthand.name, input),
      ...(defaultInitializer === undefined ? {} : { initializer: defaultInitializer }),
    };
  }
  if (hasDestructuringAssignmentKind(node, input, KindPropertyAssignment)) {
    const property = AsPropertyAssignment(input.program.source.ast, node);
    const target = property?.Initializer;
    const defaulted = target === undefined ? undefined : destructuringAssignmentDefaultTarget(target, input);
    const assignmentTarget = defaulted?.target ?? (target === undefined ? undefined : destructuringAssignmentTarget(target, input));
    return assignmentTarget === undefined ? undefined : {
      kind: "object-property",
      sourceNode: node,
      propertyName: property?.name,
      target: assignmentTarget,
      ...(defaulted?.initializer === undefined ? {} : { initializer: defaulted.initializer }),
    };
  }
  return undefined;
}

function destructuringAssignmentTarget(
  node: Node,
  input: CsharpPlanningContext,
): DestructuringAssignmentTarget {
  const pattern = destructuringAssignmentPattern(node, input);
  return pattern === undefined
    ? { kind: "node", node }
    : { kind: "pattern", pattern };
}

function destructuringAssignmentDefaultTarget(
  node: Node,
  input: CsharpPlanningContext,
): { readonly target: DestructuringAssignmentTarget; readonly initializer: Node } | undefined {
  if (!hasDestructuringAssignmentKind(node, input, KindBinaryExpression)) {
    return undefined;
  }
  const expression = AsBinaryExpression(input.program.source.ast, node);
  if (input.program.source.ast.operatorKindName(node) !== KindEqualsToken || expression?.Left === undefined || expression.Right === undefined) {
    return undefined;
  }
  return {
    target: destructuringAssignmentTarget(expression.Left, input),
    initializer: expression.Right,
  };
}

function hasDestructuringAssignmentKind(
  node: Node | undefined,
  input: CsharpPlanningContext,
  expected: string,
): boolean {
  return HasSourceKind(input.program.source.ast, node, expected);
}
