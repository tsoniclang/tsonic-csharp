import {
  AsBindingElement,
  AsBindingPattern,
  AsNumericLiteral,
  AsStringLiteral,
  KindArrayBindingPattern,
  KindBindingElement,
  KindIdentifier,
  KindNumericLiteral,
  KindObjectBindingPattern,
  KindOmittedExpression,
  KindStringLiteral,
} from "@tsonic/tsts";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression, CsharpStatement, CsharpTypeNode } from "../ast/csharp-ast.js";
import { getCsharpTypeForNode, predefined } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { planExpression } from "./expressions.js";
import { sanitizeIdentifier } from "./identifiers.js";
import { planIdentifierName } from "./names.js";

export interface DestructuringPlannerState {
  nextTempIndex: number;
  nextParameterIndex: number;
  nextForOfIndex: number;
  nextForInIndex: number;
  nextCatchIndex: number;
  nextControlLabelIndex: number;
  controlLabels: ControlLabelTarget[];
  currentReturnType?: CsharpTypeNode;
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
    ...planBindingPatternFromExpression(bindingName, sourceExpression, sourceFile, input, diagnostics, state),
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
  return planBindingPatternFromExpression(
    bindingName,
    { kind: "identifier", name: parameterName },
    sourceFile,
    input,
    diagnostics,
    state,
  );
}

export function planBindingPatternFromExpression(
  patternNode: Node,
  sourceExpression: CsharpExpression,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  const pattern = AsBindingPattern(patternNode)!;
  const statements: CsharpStatement[] = [];
  const elements = pattern.Elements?.Nodes ?? [];
  for (let index = 0; index < elements.length; index++) {
    const elementNode = elements[index];
    if (elementNode === undefined || elementNode.Kind === KindOmittedExpression) {
      continue;
    }
    if (elementNode.Kind !== KindBindingElement) {
      diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Binding pattern element is outside the current C# planning surface."));
      continue;
    }
    const element = AsBindingElement(elementNode)!;
    if (patternNode.Kind === KindArrayBindingPattern &&
      element.name === undefined &&
      element.PropertyName === undefined &&
      element.DotDotDotToken === undefined &&
      element.Initializer === undefined) {
      continue;
    }
    if (element.DotDotDotToken !== undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Rest binding requires target collection/object remainder semantics."));
      continue;
    }
    if (element.Initializer !== undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Default binding initializers require undefined-aware target lowering."));
      continue;
    }
    const elementSource = patternNode.Kind === KindArrayBindingPattern
      ? {
          kind: "element" as const,
          receiver: sourceExpression,
          argument: { kind: "literal" as const, value: index },
        }
      : planObjectBindingElementSource(elementNode, sourceExpression, diagnostics);
    if (elementSource === undefined) {
      continue;
    }
    const name = element.name;
    if (name?.Kind === KindObjectBindingPattern || name?.Kind === KindArrayBindingPattern) {
      const nestedSourceName = allocateDestructuringTemp(state);
      statements.push({
        kind: "local",
        name: nestedSourceName,
        type: predefined("var"),
        initializer: elementSource,
      });
      statements.push(...planBindingPatternFromExpression(
        name,
        { kind: "identifier", name: nestedSourceName },
        sourceFile,
        input,
        diagnostics,
        state,
      ));
      continue;
    }
    if (name?.Kind !== KindIdentifier) {
      diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Destructured binding target must be an identifier or nested binding pattern."));
      continue;
    }
    statements.push({
      kind: "local",
      name: planIdentifierName(name, "binding", diagnostics, "Destructured binding name"),
      type: getCsharpTypeForNode(name, sourceFile, input, predefined("var"), diagnostics),
      initializer: elementSource,
    });
  }
  return statements;
}

function planObjectBindingElementSource(
  elementNode: Node,
  sourceExpression: CsharpExpression,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const element = AsBindingElement(elementNode)!;
  const property = element.PropertyName ?? element.name;
  switch (property?.Kind) {
    case KindIdentifier:
      return {
        kind: "member",
        receiver: sourceExpression,
        name: sanitizeIdentifier(planIdentifierName(property, "property", diagnostics, "Destructured property name")),
      };
    case KindStringLiteral: {
      const propertyName = AsStringLiteral(property)!.Text;
      if (!isDirectMemberName(propertyName)) {
        diagnostics.push(unsupportedNodeDiagnostic(elementNode, "String-literal object destructuring keys require target object-shape facts unless the key is a direct target member name."));
        return undefined;
      }
      return {
        kind: "member",
        receiver: sourceExpression,
        name: sanitizeIdentifier(propertyName),
      };
    }
    case KindNumericLiteral:
      return {
        kind: "element",
        receiver: sourceExpression,
        argument: { kind: "literal", value: Number(AsNumericLiteral(property)!.Text) },
      };
    default:
      diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Object destructuring property names require identifier, numeric, or direct string-literal keys before C# emission."));
      return undefined;
  }
}

function allocateDestructuringTemp(state: DestructuringPlannerState): string {
  const name = `__destructure${state.nextTempIndex}`;
  state.nextTempIndex += 1;
  return name;
}

function isDirectMemberName(value: string): boolean {
  return sanitizeIdentifier(value) === value;
}
