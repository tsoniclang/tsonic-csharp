import {
  AsBindingElement,
  AsBindingPattern,
  AsStringLiteral,
  HasSourceKind,
  KindBindingElement,
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
import { getCsharpObjectShapeFactForNode } from "./csharp-fact-queries.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { sanitizeIdentifier } from "./identifiers.js";
import { csharpTypeFromObjectShapeFact, objectShapeStorageMemberName } from "./object-shapes.js";
import { getSemanticOwnership, isSourceOwnedProjectShapeSubject, pushMissingTargetFactDiagnostic } from "./semantic-guards.js";
import { csharpTypeFromTargetTypeRef, targetTypeRefsMatch } from "./target-types.js";
import type { CsharpObjectShapeFact } from "../../source/csharp-facts.js";

export function planObjectBindingPattern(
  patternNode: Node,
  sourceExpression: CsharpExpression,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
): readonly CsharpStatement[] {
  const objectShape = getObjectShapeForBindingSource(sourceNode, sourceFile, input);
  if (objectShape !== undefined) {
    csharpTypeFromObjectShapeFact(input, objectShape, diagnostics, patternNode);
    return planObjectShapeBindingPattern(patternNode, sourceExpression, objectShape, sourceFile, input, diagnostics, state, planBindingNameFromProjection);
  }
  const ownership = getSemanticOwnership(sourceNode, sourceFile, input);
  const sourceOwnedBindingElement = isSourceOwnedBindingElement(sourceNode, sourceFile, input);
  if (!sourceOwnedBindingElement && (ownership.requiresTargetFact || !ownership.sourceOwned)) {
    pushMissingTargetFactDiagnostic(diagnostics, patternNode, "Object destructuring requires a source-owned declaration or finalized provider object-shape facts before C# emission.", ownership);
    return [];
  }
  const elements = AsBindingPattern(patternNode)?.Elements?.Nodes ?? [];
  return elements.flatMap((elementNode) => {
    if (elementNode === undefined) {
      return [];
    }
    return planObjectBindingElement(elementNode, sourceExpression, sourceFile, input, diagnostics, state, planBindingNameFromProjection);
  });
}

export function getObjectShapeForBindingSource(
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): CsharpObjectShapeFact | undefined {
  return getCsharpObjectShapeFactForNode(sourceNode, sourceFile, input);
}

function planObjectShapeBindingPattern(
  patternNode: Node,
  sourceExpression: CsharpExpression,
  objectShape: CsharpObjectShapeFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
): readonly CsharpStatement[] {
  const elements = AsBindingPattern(patternNode)?.Elements?.Nodes ?? [];
  return elements.flatMap((elementNode) => {
    if (elementNode === undefined) {
      return [];
    }
    return planObjectShapeBindingElement(elementNode, sourceExpression, objectShape, sourceFile, input, diagnostics, state, planBindingNameFromProjection);
  });
}

function planObjectShapeBindingElement(
  elementNode: Node,
  sourceExpression: CsharpExpression,
  objectShape: CsharpObjectShapeFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
): readonly CsharpStatement[] {
  const element = AsBindingElement(elementNode);
  if (element === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Object binding pattern element must be a binding element."));
    return [];
  }
  if (element.DotDotDotToken !== undefined) {
    return planObjectShapeRestBindingElement(elementNode, sourceExpression, objectShape, sourceFile, input, diagnostics, state, planBindingNameFromProjection);
  }
  if (element.Initializer !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(element.Initializer, "Destructuring defaults require finalized undefined/default-value semantics before C# emission."));
    return [];
  }
  const name = element.name;
  if (name === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Object binding element must have a target binding name."));
    return [];
  }
  const sourceName = getObjectShapeBindingPropertySourceName(elementNode, input, diagnostics);
  const member = sourceName === undefined
    ? undefined
    : objectShape.members.find((candidate) => candidate.sourceName === sourceName);
  if (member === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Object destructuring property must match a finalized provider object-shape member."));
    return [];
  }
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
  return planBindingNameFromProjection(name, projected, projectedType, elementNode, sourceFile, input, diagnostics, state);
}

function planObjectShapeRestBindingElement(
  elementNode: Node,
  sourceExpression: CsharpExpression,
  sourceShape: CsharpObjectShapeFact,
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
  const assignments = restShape.members.map((restMember): CsharpObjectInitializerAssignment | undefined => {
    const sourceMember = sourceShape.members.find((member) => member.sourceName === restMember.sourceName);
    if (sourceMember === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(elementNode, `Object rest destructuring source shape does not provide rest member '${restMember.sourceName}'.`));
      return undefined;
    }
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
  }, restType, elementNode, sourceFile, input, diagnostics, state);
}

function planObjectBindingElement(
  elementNode: Node,
  sourceExpression: CsharpExpression,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
): readonly CsharpStatement[] {
  const element = AsBindingElement(elementNode);
  if (element === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Object binding pattern element must be a binding element."));
    return [];
  }
  if (element.DotDotDotToken !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Object rest destructuring requires finalized provider object-spread semantics before C# emission."));
    return [];
  }
  if (element.Initializer !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(element.Initializer, "Destructuring defaults require finalized undefined/default-value semantics before C# emission."));
    return [];
  }
  const name = element.name;
  if (name === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Object binding element must have a target binding name."));
    return [];
  }
  const propertyName = getDirectSourcePropertyName(elementNode, input, diagnostics);
  if (propertyName === undefined) {
    return [];
  }
  const projected: CsharpExpression = {
    kind: "SimpleMemberAccessExpression",
    receiver: sourceExpression,
    name: propertyName,
  };
  return planBindingNameFromProjection(name, projected, undefined, elementNode, sourceFile, input, diagnostics, state);
}

function getDirectSourcePropertyName(
  elementNode: Node,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): string | undefined {
  const element = AsBindingElement(elementNode);
  if (element === undefined) {
    return undefined;
  }
  const propertyName = element.PropertyName ?? element.name;
  if (propertyName === undefined) {
    return undefined;
  }
  if (!HasSourceKind(input.ast, propertyName, KindIdentifier)) {
    if (HasSourceKind(input.ast, propertyName, KindStringLiteral)) {
      const text = AsStringLiteral(propertyName)?.Text;
      if (text !== undefined && sanitizeIdentifier(text) === text) {
        return text;
      }
    }
    diagnostics.push(unsupportedNodeDiagnostic(propertyName, "Object destructuring from source-owned declarations supports only identifier property names until provider object-shape facts supply target member names."));
    return undefined;
  }
  return sanitizeIdentifier(Node_Text(propertyName));
}

function getObjectShapeBindingPropertySourceName(
  elementNode: Node,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
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
    diagnostics.push(unsupportedNodeDiagnostic(propertyName, "Object destructuring from object-shape facts supports only identifier or string-literal property names."));
    return undefined;
  }
  return Node_Text(propertyName);
}

function isSourceOwnedBindingElement(
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): boolean {
  if (!HasSourceKind(input.ast, sourceNode, KindBindingElement)) {
    return false;
  }
  return isSourceOwnedProjectShapeSubject(sourceNode, sourceFile, input);
}
