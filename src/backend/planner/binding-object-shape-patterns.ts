import {
  AsBindingElement,
  AsBindingPattern,
  HasSourceKind,
  KindIdentifier,
  KindStringLiteral,
  Node_Text,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpExpression,
  CsharpObjectInitializerAssignment,
  CsharpStatement,
} from "../roslyn/syntax.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import type { BindingProjectionPlanner } from "./binding-pattern-contracts.js";
import type { BindingDefaultExpressionPlanner } from "./binding-array-patterns.js";
import { getCsharpObjectShapeFactForNode } from "./csharp-fact-queries.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { csharpTypeFromObjectShapeFact, objectShapeStorageMemberName } from "./object-shapes.js";
import { csharpTypeFromTargetTypeRef, targetTypeRefsMatch } from "./target-types.js";
import type { CsharpObjectShapeFact } from "../../source/csharp-facts.js";
import {
  getCsharpNullableElementTargetType,
  isCsharpValueTypeTargetType,
} from "../../source/csharp-source-semantics/target-types.js";
import {
  csharpObjectShapeMemberLookupFailureMessage,
  resolveCsharpObjectShapeMemberByFinalizedSourceName,
} from "../../source/csharp-facts.js";

export function planObjectShapeBindingPattern(
  patternNode: Node,
  sourceExpression: CsharpExpression,
  objectShape: CsharpObjectShapeFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
  planDefaultExpressionWithExpectedType?: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] {
  const elements = AsBindingPattern(patternNode)?.Elements?.Nodes ?? [];
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
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
  planDefaultExpressionWithExpectedType?: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] {
  const element = AsBindingElement(elementNode);
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
  const memberLookup = resolveCsharpObjectShapeMemberByFinalizedSourceName(objectShape, sourceName, "checked-object-binding-property");
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
  const defaultedProjection = planObjectShapeBindingDefaultProjection(projected, member, element.Initializer, sourceFile, input, diagnostics, state, planDefaultExpressionWithExpectedType);
  if (defaultedProjection === undefined) {
    return [];
  }
  return planBindingNameFromProjection(name, defaultedProjection.expression, defaultedProjection.type, elementNode, sourceFile, input, diagnostics, state, defaultedProjection.carrier);
}

function planObjectShapeBindingDefaultProjection(
  projected: CsharpExpression,
  member: CsharpObjectShapeFact["members"][number],
  initializer: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner | undefined,
): { readonly expression: CsharpExpression; readonly type: NonNullable<ReturnType<typeof csharpTypeFromTargetTypeRef>>; readonly carrier: NonNullable<CsharpObjectShapeFact["members"][number]["type"]> } | undefined {
  if (planDefaultExpressionWithExpectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(initializer, "Object destructuring defaults require the active expression planner before C# emission."));
    return undefined;
  }
  const defaultCarrier = getCsharpNullableElementTargetType(member.type) ?? member.type;
  const nullableSourceCarrier = getCsharpNullableElementTargetType(member.type);
  if (member.optional === true && nullableSourceCarrier === undefined && isCsharpValueTypeTargetType(member.type)) {
    diagnostics.push(unsupportedNodeDiagnostic(initializer, `Object-shape member '${member.sourceName}' default requires optional value-type members to carry a nullable target carrier before C# emission.`));
    return undefined;
  }
  const defaultType = csharpTypeFromTargetTypeRef(defaultCarrier);
  if (defaultType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(initializer, `Object-shape member '${member.sourceName}' default requires a renderable finalized target carrier before C# emission.`));
    return undefined;
  }
  const whenFalse = planDefaultExpressionWithExpectedType(initializer, sourceFile, input, diagnostics, defaultType, initializer, state);
  if (whenFalse === undefined) {
    return undefined;
  }
  return {
    expression: nullableSourceCarrier === undefined && member.optional !== true
      ? projected
      : {
          kind: "BinaryExpression",
          left: projected,
          operatorToken: { kind: "QuestionQuestionToken" },
          right: whenFalse,
        },
    type: defaultType,
    carrier: defaultCarrier,
  };
}

function planObjectShapeRestBindingElement(
  elementNode: Node,
  sourceExpression: CsharpExpression,
  sourceShape: CsharpObjectShapeFact,
  explicitlyExtractedSourceNames: ReadonlySet<string>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
): readonly CsharpStatement[] {
  const element = AsBindingElement(elementNode);
  const name = element?.name;
  if (name === undefined || !HasSourceKind(input.ast, name, KindIdentifier)) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Object rest destructuring requires an identifier binding name."));
    return [];
  }
  const restShape = getCsharpObjectShapeFactForNode(name, sourceFile, input);
  if (restShape === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Object rest destructuring requires finalized provider object-shape facts for the rest binding."));
    return [];
  }
  const restType = csharpTypeFromObjectShapeFact(input, restShape, diagnostics, elementNode);
  if (restType === undefined) {
    return [];
  }
  for (const sourceName of explicitlyExtractedSourceNames) {
    const staleRestMember = resolveCsharpObjectShapeMemberByFinalizedSourceName(restShape, sourceName, "finalized-object-rest-member");
    if (staleRestMember.kind === "resolved") {
      diagnostics.push(unsupportedNodeDiagnostic(elementNode, `Object rest destructuring rest shape must exclude explicitly extracted member '${staleRestMember.member.sourceName}'.`));
      return [];
    }
  }
  const assignments = restShape.members.map((restMember): CsharpObjectInitializerAssignment | undefined => {
    const sourceMemberLookup = resolveCsharpObjectShapeMemberByFinalizedSourceName(sourceShape, restMember.sourceName, "finalized-object-rest-member");
    if (sourceMemberLookup.kind !== "resolved") {
      diagnostics.push(unsupportedNodeDiagnostic(elementNode, csharpObjectShapeMemberLookupFailureMessage(sourceMemberLookup, "Object rest destructuring source shape")));
      return undefined;
    }
    const sourceMember = sourceMemberLookup.member;
    if (!targetTypeRefsMatch(sourceMember.type, restMember.type)) {
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
  input: TargetCompileInput,
): ReadonlySet<string> {
  const sourceNames = new Set<string>();
  for (const elementNode of elements) {
    if (elementNode === undefined) {
      continue;
    }
    const element = AsBindingElement(elementNode);
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
  input: TargetCompileInput,
  diagnostics?: TargetDiagnostic[],
): string | undefined {
  const element = AsBindingElement(elementNode);
  if (element === undefined) {
    return undefined;
  }
  const propertyName = element.PropertyName ?? element.name;
  if (propertyName === undefined) {
    return undefined;
  }
  if (!HasSourceKind(input.ast, propertyName, KindIdentifier) && !HasSourceKind(input.ast, propertyName, KindStringLiteral)) {
    diagnostics?.push(unsupportedNodeDiagnostic(propertyName, "Object destructuring from object-shape facts supports only identifier or string-literal property names."));
    return undefined;
  }
  return Node_Text(propertyName);
}
