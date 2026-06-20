import {
  AsBindingElement,
  AsBindingPattern,
  AsParameterDeclaration,
  AsStringLiteral,
  KindBindingElement,
  KindArrayBindingPattern,
  KindIdentifier,
  KindObjectBindingPattern,
  KindStringLiteral,
  Node_Text,
} from "@tsonic/tsts";
import type { Node, ObjectShapeFact, SourceFile, TargetTypeRef } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression, CsharpStatement, CsharpTypeNode } from "../ast/csharp-ast.js";
import { getCsharpTypeForNode, predefined } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { planExpression } from "./expressions.js";
import { sanitizeIdentifier } from "./identifiers.js";
import { csharpTypeFromObjectShapeFact, objectShapeStorageMemberName } from "./object-shapes.js";
import { getRuntimeCarrierForExpression } from "./runtime-carriers.js";
import { getSemanticOwnership, isSourceOwnedProjectShapeSubject, pushMissingTargetFactDiagnostic } from "./semantic-guards.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";

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
  purpose: "break" | "continue",
): string {
  const name = `__label${state.nextControlLabelIndex}_${sourceName}_${purpose}`;
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
  if (bindingName === undefined || bindingName.Kind === KindIdentifier) {
    return undefined;
  }
  if (bindingName.Kind !== KindObjectBindingPattern && bindingName.Kind !== KindArrayBindingPattern) {
    diagnostics.push(unsupportedNodeDiagnostic(bindingName, "Variable binding name is outside the current C# planning surface."));
    return [];
  }
  if (initializer === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(bindingName, "Destructuring variable declaration requires an initializer."));
    return [];
  }
  const sourceName = allocateDestructuringTemp(state);
  const sourceExpression: CsharpExpression = { kind: "identifier", name: sourceName };
  return [
    {
      kind: "local",
      name: sourceName,
      type: predefined("var"),
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
  if (bindingName === undefined || bindingName.Kind === KindIdentifier) {
    return [];
  }
  if (bindingName.Kind !== KindObjectBindingPattern && bindingName.Kind !== KindArrayBindingPattern) {
    diagnostics.push(unsupportedNodeDiagnostic(bindingName, "Parameter binding name is outside the current C# planning surface."));
    return [];
  }
  const parameter = AsParameterDeclaration(getNodeParent(bindingName));
  return planBindingPatternFromExpression(
    bindingName,
    { kind: "identifier", name: parameterName },
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
  if (patternNode.Kind === KindArrayBindingPattern) {
    return planArrayBindingPattern(patternNode, sourceExpression, sourceNode, sourceFile, input, diagnostics, state);
  }
  if (patternNode.Kind === KindObjectBindingPattern) {
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
    return planArrayBindingElement(elementNode, sourceExpression, index, elementCarrier, sourceFile, input, diagnostics, state);
  });
}

function planArrayBindingElement(
  elementNode: Node,
  sourceExpression: CsharpExpression,
  index: number,
  elementCarrier: TargetTypeRef | undefined,
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
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Array rest destructuring requires finalized provider slice/copy semantics before C# emission."));
    return [];
  }
  if (element.Initializer !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(element.Initializer, "Destructuring defaults require finalized undefined/default-value semantics before C# emission."));
    return [];
  }
  const name = element.name;
  if (name === undefined) {
    return [];
  }
  const projected: CsharpExpression = {
    kind: "element",
    receiver: sourceExpression,
    argument: { kind: "literal", value: index },
  };
  const projectedType = elementCarrier === undefined ? undefined : csharpTypeFromTargetTypeRef(elementCarrier);
  if (projectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Array destructuring element requires a renderable provider element carrier type before C# emission."));
    return [];
  }
  return planBindingNameFromProjection(name, projected, projectedType, elementNode, sourceFile, input, diagnostics, state);
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
  objectShape: ObjectShapeFact,
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
  objectShape: ObjectShapeFact,
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
  const sourceName = getObjectShapeBindingPropertySourceName(elementNode, diagnostics);
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
    kind: "member",
    receiver: sourceExpression,
    name: objectShapeStorageMemberName(objectShape, member),
  };
  return planBindingNameFromProjection(name, projected, projectedType, elementNode, sourceFile, input, diagnostics, state);
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
  const propertyName = getDirectSourcePropertyName(elementNode, diagnostics);
  if (propertyName === undefined) {
    return [];
  }
  const projected: CsharpExpression = {
    kind: "member",
    receiver: sourceExpression,
    name: propertyName,
  };
  return planBindingNameFromProjection(name, projected, undefined, elementNode, sourceFile, input, diagnostics, state);
}

function getObjectShapeForBindingSource(
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): ObjectShapeFact | undefined {
  if (sourceNode === undefined) {
    return undefined;
  }
  const direct = input.facts.getObjectShapeFact(sourceNode);
  if (direct !== undefined) {
    return direct;
  }
  return input.semantics.getObjectShapeForNode(sourceNode, { sourceFile });
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
  if (name.Kind === KindIdentifier) {
    return [{
      kind: "local",
      name: sanitizeIdentifier(Node_Text(name)),
      type: projectedType ?? getCsharpTypeForNode(name, sourceFile, input, predefined("var"), diagnostics),
      initializer: projected,
    }];
  }
  if (name.Kind === KindObjectBindingPattern || name.Kind === KindArrayBindingPattern) {
    const nestedName = allocateDestructuringTemp(state);
    const nestedSource: CsharpExpression = { kind: "identifier", name: nestedName };
    return [
      {
        kind: "local",
        name: nestedName,
        type: projectedType ?? predefined("var"),
        initializer: projected,
      },
      ...planBindingPatternFromExpression(name, nestedSource, projectionNode, sourceFile, input, diagnostics, state),
    ];
  }
  diagnostics.push(unsupportedNodeDiagnostic(name, "Destructuring target binding name is outside the current C# planning surface."));
  return [];
}

function getDirectSourcePropertyName(
  elementNode: Node,
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
  if (propertyName.Kind !== KindIdentifier) {
    if (propertyName.Kind === KindStringLiteral) {
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
  if (propertyName.Kind !== KindIdentifier && propertyName.Kind !== KindStringLiteral) {
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
  if (sourceNode?.Kind !== KindBindingElement) {
    return false;
  }
  return isSourceOwnedProjectShapeSubject(sourceNode, sourceFile, input);
}

function getNodeParent(node: Node): Node | undefined {
  return (node as { readonly Parent?: Node }).Parent;
}
