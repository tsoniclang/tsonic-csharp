import type { CsharpPlanningContext } from "../../context.js";
import {
  AsParameterDeclaration,
  HasSourceKind,
  KindArrayBindingPattern,
  KindIdentifier,
  KindObjectBindingPattern,
  sourceParameterIsProperty,
} from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpParameter, CsharpStatement, CsharpTypeNode } from "../../../target-ast/roslyn/index.js";
import {
  allocateSyntheticParameter,
  createDestructuringPlannerState,
  declareCsharpLocalBindingName,
  planParameterBindingPrelude,
} from "../../bindings/index.js";
import { planAttributesForSubject } from "../attributes.js";
import type { DestructuringPlannerState } from "../../bindings/index.js";
import {
  getCsharpTypeForNode,
  invalidCsharpType,
} from "../../types/index.js";
import { csharpTypeFromTargetTypeRefWithObjectShapeDeclarations } from "../../types/target-type-object-shapes.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import { planExpressionWithExpectedType } from "../../expressions/index.js";
import { diagnoseTypeScriptOnlyRuntimeShapeModifiers } from "../modifiers.js";
import { planCsharpRuntimeParameterDefault } from "./defaults.js";
import { consumeCsharpPlannedValue } from "../../statements/statement-output.js";
import {
  planCsharpParameterStorageDeclaration,
} from "../../bindings/typed-location-identities.js";
import type { CsharpEntryBinding } from "../../bindings/binding-patterns.js";
import { planCsharpParameterCapture } from "../../bindings/capture-storage.js";

export interface PlannedParameterList {
  readonly parameters: readonly CsharpParameter[];
  readonly prelude: readonly CsharpStatement[];
  readonly entryBindings: readonly CsharpEntryBinding[];
}

export function planParameters(
  parameterNodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): readonly CsharpParameter[] {
  return planParametersWithPrelude(parameterNodes, sourceFile, input, diagnostics).parameters;
}

export function planParametersWithPrelude(
  parameterNodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState = createDestructuringPlannerState(),
): PlannedParameterList {
  const parameters: CsharpParameter[] = [];
  const prelude: CsharpStatement[] = [];
  const entryBindings: CsharpEntryBinding[] = [];
  const retainBinding = (binding: CsharpEntryBinding): void => { entryBindings.push(binding); };
  const completeIdentifierEntry = (node: Node, name: string, type: CsharpTypeNode): void => {
    const identity = planCsharpParameterStorageDeclaration(node, input, state, diagnostics);
    if (identity !== undefined) { prelude.push(identity); retainBinding(identity); }
    const capture = planCsharpParameterCapture(node, input, state);
    if (capture !== undefined) prelude.push(capture);
    if (capture === undefined && input.program.storage.nativeBacking(node) === undefined) retainBinding({ name, type });
  };
  let hasDefaultParameter = false;
  for (const parameterNode of parameterNodes) {
    const parameter = AsParameterDeclaration(input.program.source.ast, parameterNode)!;
    const questionToken = input.program.source.ast.questionToken(parameterNode);
    diagnoseTypeScriptOnlyRuntimeShapeModifiers(input.program.source.ast, parameterNode!, "parameter declaration", diagnostics,
      sourceParameterIsProperty(input.program.source.ast, parameterNode!) ? ["public", "private", "protected", "readonly"] : []);
    if (HasSourceKind(input.program.source.ast, parameter.name, KindIdentifier)) {
      const typeSubject = getParameterTypeSubject(parameter);
      const type = getParameterType(parameterNode, sourceFile, input, diagnostics);
      if (input.program.declarations.runtimeDefault(parameterNode!) !== undefined) {
        const sourceName = declareCsharpLocalBindingName(parameter.name, input, diagnostics, state, "Parameter name", "arg");
        const incomingName = allocateSyntheticParameter(state);
        const selected = planCsharpRuntimeParameterDefault(parameterNode!, incomingName, sourceFile, input, diagnostics, state);
        if (selected === undefined) continue;
        parameters.push({ name: incomingName, type: selected.parameterType,
          attributes: planAttributesForSubject(parameterNode, sourceFile, input, diagnostics),
          ...(selected.defaultValue === undefined ? {} : { defaultValue: selected.defaultValue }) });
        prelude.push(...consumeCsharpPlannedValue(selected.value, initializer => [
          { kind: "LocalDeclarationStatement", name: sourceName, type: selected.valueType, initializer }]));
        completeIdentifierEntry(parameterNode!, sourceName, selected.valueType);
        hasDefaultParameter ||= selected.defaultValue !== undefined;
        continue;
      }
      const defaultValue = planParameterDefaultValue(parameter.Initializer, questionToken, sourceFile, input, diagnostics, type, typeSubject, state);
      if (defaultValue !== undefined) {
        hasDefaultParameter = true;
      } else if (hasDefaultParameter && parameter.DotDotDotToken === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(parameterNode!, "Required parameters cannot follow C# optional parameters."));
      }
      const sourceName = declareCsharpLocalBindingName(parameter.name, input, diagnostics, state, "Parameter name", "arg");
      parameters.push({
        name: sourceName,
        type,
        attributes: planAttributesForSubject(parameterNode, sourceFile, input, diagnostics),
        ...(parameter.DotDotDotToken === undefined ? {} : { isParams: true }),
        ...(defaultValue === undefined ? {} : { defaultValue }),
      });
      completeIdentifierEntry(parameterNode!, sourceName, type);
      continue;
    }
    const bindingName = parameter.name;
    if (bindingName !== undefined && (HasSourceKind(input.program.source.ast, bindingName, KindObjectBindingPattern) || HasSourceKind(input.program.source.ast, bindingName, KindArrayBindingPattern))) {
      const typeSubject = getParameterTypeSubject(parameter) ?? bindingName;
      const type = getParameterType(parameterNode, sourceFile, input, diagnostics, invalidCsharpType("destructured parameter type"));
      if (input.program.declarations.runtimeDefault(parameterNode!) !== undefined) {
        const incomingName = allocateSyntheticParameter(state);
        const valueName = allocateSyntheticParameter(state);
        const selected = planCsharpRuntimeParameterDefault(parameterNode!, incomingName, sourceFile, input, diagnostics, state);
        if (selected === undefined) continue;
        parameters.push({ name: incomingName, type: selected.parameterType,
          attributes: planAttributesForSubject(parameterNode, sourceFile, input, diagnostics),
          ...(selected.defaultValue === undefined ? {} : { defaultValue: selected.defaultValue }) });
        prelude.push(...consumeCsharpPlannedValue(selected.value, initializer => [
          { kind: "LocalDeclarationStatement", name: valueName, type: selected.valueType, initializer }]));
        prelude.push(...planParameterBindingPrelude(bindingName, valueName, sourceFile, input, diagnostics, state, retainBinding));
        hasDefaultParameter ||= selected.defaultValue !== undefined;
        continue;
      }
      const defaultValue = planParameterDefaultValue(parameter.Initializer, questionToken, sourceFile, input, diagnostics, type, typeSubject, state);
      if (defaultValue !== undefined) {
        hasDefaultParameter = true;
        diagnostics.push(unsupportedNodeDiagnostic(bindingName, "Destructured parameter defaults require target object-shape lowering before C# emission."));
      } else if (hasDefaultParameter && parameter.DotDotDotToken === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(parameterNode!, "Required parameters cannot follow C# optional parameters."));
      }
      const parameterName = allocateSyntheticParameter(state);
      parameters.push({
        name: parameterName,
        type,
        attributes: planAttributesForSubject(parameterNode, sourceFile, input, diagnostics),
        ...(parameter.DotDotDotToken === undefined ? {} : { isParams: true }),
      });
      prelude.push(...planParameterBindingPrelude(bindingName, parameterName, sourceFile, input, diagnostics, state, retainBinding));
      continue;
    }
    const typeSubject = getParameterTypeSubject(parameter);
    const type = getParameterType(parameterNode, sourceFile, input, diagnostics);
    const defaultValue = planParameterDefaultValue(parameter.Initializer, questionToken, sourceFile, input, diagnostics, type, typeSubject, state);
    if (defaultValue !== undefined) {
      hasDefaultParameter = true;
    } else if (hasDefaultParameter && parameter.DotDotDotToken === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(parameterNode!, "Required parameters cannot follow C# optional parameters."));
    }
    diagnostics.push(unsupportedNodeDiagnostic(parameter.name ?? parameterNode!, "Parameter name is outside the current C# planning surface."));
    const targetName = declareCsharpLocalBindingName(parameter.name, input, diagnostics, state, "Parameter name", "arg");
    parameters.push({
      name: targetName,
      type,
      attributes: planAttributesForSubject(parameterNode, sourceFile, input, diagnostics),
      ...(defaultValue === undefined ? {} : { defaultValue }),
    });
  }
  return {
    parameters,
    prelude,
    entryBindings,
  };
}

function getParameterTypeSubject(parameter: NonNullable<ReturnType<typeof AsParameterDeclaration>>): Node | undefined {
  return parameter.Type ?? parameter.name;
}

function getParameterType(
  parameterNode: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  errorType?: CsharpTypeNode,
): CsharpTypeNode {
  const requiredType = parameterNode === undefined
    ? undefined
    : input.program.storage.requiredType(parameterNode);
  return requiredType === undefined
    ? getCsharpTypeForNode(parameterNode, sourceFile, input, errorType, diagnostics)
    : csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, requiredType, diagnostics, parameterNode)
      ?? invalidCsharpType("required parameter storage type");
}

function planParameterDefaultValue(
  initializer: Node | undefined,
  questionToken: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject: Node | undefined,
  state: DestructuringPlannerState,
): CsharpExpression | undefined {
  if (initializer === undefined && questionToken !== undefined && expectedType.kind !== "InvalidType") {
    return expectedType.kind === "NullableType"
      ? { kind: "LiteralExpression", value: null }
      : { kind: "DefaultExpression", type: expectedType, nullForgiving: true };
  }
  if (initializer === undefined) {
    return undefined;
  }
  const defaultValue = planExpressionWithExpectedType(initializer, sourceFile, input, diagnostics, expectedType, expectedTypeSubject, state);
  if (defaultValue === undefined) {
    return undefined;
  }
  const expression = defaultValue.completion.kind === "value" ? defaultValue.completion.expression : undefined;
  if (defaultValue.prelude.length === 0 && (expression?.kind === "LiteralExpression" || expression?.kind === "CharacterLiteralExpression" ||
    expression?.kind === "IntegerLiteralExpression" || expression?.kind === "NumericLiteralExpression")) {
    return expression;
  }
  diagnostics.push(unsupportedNodeDiagnostic(initializer, "C# parameter defaults require compile-time literal values."));
  return undefined;
}
