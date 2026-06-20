import {
  AsBindingElement,
  AsBindingPattern,
  AsParameterDeclaration,
  AsStringLiteral,
  HasSourceKind,
  KindBindingElement,
  KindArrayBindingPattern,
  KindIdentifier,
  KindObjectBindingPattern,
  KindStringLiteral,
  Node_Text,
} from "./source-ast.js";
import type { Node, SourceFile, TargetTypeRef } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression, CsharpObjectInitializerAssignment, CsharpStatement, CsharpTypeNode } from "../roslyn/syntax.js";
import { runtimeArrayHelperCall } from "./array-helpers.js";
import { getCsharpTypeForNode, invalidCsharpType } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { planExpression, planExpressionWithExpectedType } from "./expressions.js";
import { sanitizeIdentifier } from "./identifiers.js";
import { csharpTypeFromObjectShapeFact, objectShapeStorageMemberName } from "./object-shapes.js";
import { getRuntimeCarrierForExpression } from "./runtime-carriers.js";
import { getSemanticOwnership, isSourceOwnedProjectShapeSubject, pushMissingTargetFactDiagnostic } from "./semantic-guards.js";
import { csharpTypeFromTargetTypeRef, targetTypeRefsMatch } from "./target-types.js";
import { getCsharpObjectShapeFactForNode } from "./csharp-fact-queries.js";
import { csharpObjectShapeFactKey } from "../../source/csharp-facts.js";
import type { CsharpObjectShapeFact } from "../../source/csharp-facts.js";

export interface DestructuringPlannerState {
  nextTempIndex: number;
  nextParameterIndex: number;
  nextForOfIndex: number;
  nextForInIndex: number;
  nextCatchIndex: number;
  nextControlLabelIndex: number;
  controlLabels: ControlLabelTarget[];
  currentReturnType?: CsharpTypeNode;
  currentReturnTypeSubject?: Node;
}

export function createDestructuringPlannerState(): DestructuringPlannerState {
  return {
    nextTempIndex: 0,
    nextParameterIndex: 0,
    nextForOfIndex: 0,
    nextForInIndex: 0,
    nextCatchIndex: 0,
    nextControlLabelIndex: 0,
    controlLabels: [],
  };
}

export interface ControlLabelTarget {
  readonly sourceName: string;
  readonly breakLabel: string;
  readonly continueLabel?: string;
}

export function allocateSyntheticParameter(state: DestructuringPlannerState): string {
  const name = `__param${state.nextParameterIndex}`;
  state.nextParameterIndex += 1;
  return name;
}

export function allocateForOfItem(state: DestructuringPlannerState): string {
  const name = `__forOf${state.nextForOfIndex}`;
  state.nextForOfIndex += 1;
  return name;
}

export function allocateForOfLoop(state: DestructuringPlannerState): number {
  const index = state.nextForOfIndex;
  state.nextForOfIndex += 1;
  return index;
}

export function allocateForInIndex(state: DestructuringPlannerState): string {
  const name = `__forInIndex${state.nextForInIndex}`;
  state.nextForInIndex += 1;
  return name;
}

export function allocateCatchValue(state: DestructuringPlannerState): string {
  const name = `__catch${state.nextCatchIndex}`;
  state.nextCatchIndex += 1;
  return name;
}

export function allocateControlLabel(
  state: DestructuringPlannerState,
  sourceName: string,
  purpose: "BreakStatement" | "ContinueStatement",
): string {
  const suffix = purpose === "BreakStatement" ? "break" : "continue";
  const name = `__label${state.nextControlLabelIndex}_${sourceName}_${suffix}`;
  state.nextControlLabelIndex += 1;
  return sanitizeIdentifier(name);
}

export function planVariableBindingStatements(
  bindingName: Node | undefined,
  initializer: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] | undefined {
  if (bindingName === undefined || HasSourceKind(input.ast, bindingName, KindIdentifier)) {
    return undefined;
  }
  if (!HasSourceKind(input.ast, bindingName, KindObjectBindingPattern) && !HasSourceKind(input.ast, bindingName, KindArrayBindingPattern)) {
    diagnostics.push(unsupportedNodeDiagnostic(bindingName, "Variable binding name is outside the current C# planning surface."));
    return [];
  }
  if (initializer === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(bindingName, "Destructuring variable declaration requires an initializer."));
    return [];
  }
  const sourceName = allocateDestructuringTemp(state);
  const sourceExpression: CsharpExpression = { kind: "IdentifierName", name: sourceName };
  const sourceType = getCsharpTypeForExpressionCarrier(initializer, sourceFile, input, diagnostics, bindingName, "Destructuring source expression");
  return [
    {
      kind: "LocalDeclarationStatement",
      name: sourceName,
      type: sourceType,
      initializer: planExpression(initializer, sourceFile, input, diagnostics),
    },
    ...planBindingPatternFromExpression(bindingName, sourceExpression, initializer, sourceFile, input, diagnostics, state),
  ];
}

export function planParameterBindingPrelude(
  bindingName: Node | undefined,
  parameterName: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  if (bindingName === undefined || HasSourceKind(input.ast, bindingName, KindIdentifier)) {
    return [];
  }
  if (!HasSourceKind(input.ast, bindingName, KindObjectBindingPattern) && !HasSourceKind(input.ast, bindingName, KindArrayBindingPattern)) {
    diagnostics.push(unsupportedNodeDiagnostic(bindingName, "Parameter binding name is outside the current C# planning surface."));
    return [];
  }
  const parameter = AsParameterDeclaration(getNodeParent(bindingName));
  return planBindingPatternFromExpression(
    bindingName,
    { kind: "IdentifierName", name: parameterName },
    parameter?.Type,
    sourceFile,
    input,
    diagnostics,
    state,
  );
}

export function planBindingPatternFromExpression(
  patternNode: Node,
  sourceExpression: CsharpExpression,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  if (HasSourceKind(input.ast, patternNode, KindArrayBindingPattern)) {
    return planArrayBindingPattern(patternNode, sourceExpression, sourceNode, sourceFile, input, diagnostics, state);
  }
  if (HasSourceKind(input.ast, patternNode, KindObjectBindingPattern)) {
    return planObjectBindingPattern(patternNode, sourceExpression, sourceNode, sourceFile, input, diagnostics, state);
  }
  diagnostics.push(unsupportedNodeDiagnostic(patternNode, "Binding pattern is outside the current C# planning surface."));
  return [];
}

function allocateDestructuringTemp(state: DestructuringPlannerState): string {
  const name = `__destructure${state.nextTempIndex}`;
  state.nextTempIndex += 1;
  return name;
}

function planArrayBindingPattern(
  patternNode: Node,
  sourceExpression: CsharpExpression,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
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
    return planArrayBindingElement(elementNode, sourceExpression, index, elementCarrier, sourceCarrier, sourceFile, input, diagnostics, state);
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
): readonly CsharpStatement[] {
  const element = AsBindingElement(elementNode);
  if (element === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Array binding pattern element must be a binding element."));
    return [];
  }
  if (element.DotDotDotToken !== undefined) {
    return planArrayRestBindingElement(elementNode, element.name, sourceExpression, index, sourceCarrier, sourceFile, input, diagnostics, state);
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

function planObjectBindingPattern(
  patternNode: Node,
  sourceExpression: CsharpExpression,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  const objectShape = getObjectShapeForBindingSource(sourceNode, sourceFile, input);
  if (objectShape !== undefined) {
    csharpTypeFromObjectShapeFact(input, objectShape, diagnostics, patternNode);
    return planObjectShapeBindingPattern(patternNode, sourceExpression, objectShape, sourceFile, input, diagnostics, state);
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
    return planObjectBindingElement(elementNode, sourceExpression, sourceFile, input, diagnostics, state);
  });
}

function planObjectShapeBindingPattern(
  patternNode: Node,
  sourceExpression: CsharpExpression,
  objectShape: CsharpObjectShapeFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  const elements = AsBindingPattern(patternNode)?.Elements?.Nodes ?? [];
  return elements.flatMap((elementNode) => {
    if (elementNode === undefined) {
      return [];
    }
    return planObjectShapeBindingElement(elementNode, sourceExpression, objectShape, sourceFile, input, diagnostics, state);
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
): readonly CsharpStatement[] {
  const element = AsBindingElement(elementNode);
  if (element === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Object binding pattern element must be a binding element."));
    return [];
  }
  if (element.DotDotDotToken !== undefined) {
    return planObjectShapeRestBindingElement(elementNode, sourceExpression, objectShape, sourceFile, input, diagnostics, state);
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
): readonly CsharpStatement[] {
  const element = AsBindingElement(elementNode);
  const name = element?.name;
  if (name === undefined || !HasSourceKind(input.ast, name, KindIdentifier)) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Object rest destructuring requires an identifier binding name."));
    return [];
  }
  const restShape = input.facts.getFact(name, csharpObjectShapeFactKey);
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

function getObjectShapeForBindingSource(
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): CsharpObjectShapeFact | undefined {
  return getCsharpObjectShapeFactForNode(sourceNode, sourceFile, input);
}

function planBindingNameFromProjection(
  name: Node,
  projected: CsharpExpression,
  projectedType: CsharpTypeNode | undefined,
  projectionNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  if (HasSourceKind(input.ast, name, KindIdentifier)) {
    return [{
      kind: "LocalDeclarationStatement",
      name: sanitizeIdentifier(Node_Text(name)),
      type: projectedType ?? getCsharpTypeForNode(name, sourceFile, input, invalidCsharpType("missing destructured binding type"), diagnostics),
      initializer: projected,
    }];
  }
  if (HasSourceKind(input.ast, name, KindObjectBindingPattern) || HasSourceKind(input.ast, name, KindArrayBindingPattern)) {
    const nestedName = allocateDestructuringTemp(state);
    const nestedSource: CsharpExpression = { kind: "IdentifierName", name: nestedName };
    const nestedType = projectedType ?? getCsharpTypeForNode(projectionNode ?? name, sourceFile, input, invalidCsharpType("missing nested destructuring source type"), diagnostics);
    return [
      {
        kind: "LocalDeclarationStatement",
        name: nestedName,
        type: nestedType,
        initializer: projected,
      },
      ...planBindingPatternFromExpression(name, nestedSource, projectionNode, sourceFile, input, diagnostics, state),
    ];
  }
  diagnostics.push(unsupportedNodeDiagnostic(name, "Destructuring target binding name is outside the current C# planning surface."));
  return [];
}

function getCsharpTypeForExpressionCarrier(
  expression: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  diagnosticNode: Node,
  description: string,
): CsharpTypeNode {
  const carrier = getRuntimeCarrierForExpression(input, expression, sourceFile);
  const type = carrier === undefined ? undefined : csharpTypeFromTargetTypeRef(carrier);
  if (type !== undefined) {
    return type;
  }
  const objectShape = getObjectShapeForBindingSource(expression, sourceFile, input);
  if (objectShape !== undefined) {
    const objectShapeType = csharpTypeFromObjectShapeFact(input, objectShape, diagnostics, diagnosticNode);
    if (objectShapeType !== undefined) {
      return objectShapeType;
    }
  }
  diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, `${description} requires a finalized runtime carrier fact before C# emission.`));
  return invalidCsharpType("missing destructuring source carrier");
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

function getNodeParent(node: Node): Node | undefined {
  return (node as { readonly Parent?: Node }).Parent;
}
