import type { CsharpPlanningContext } from "../context.js";
import {
  AsParameterDeclaration,
  HasSourceKind,
  KindArrayBindingPattern,
  KindIdentifier,
  KindObjectBindingPattern,
} from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpParameter, CsharpStatement, CsharpTypeNode } from "../../target-ast/roslyn/index.js";
import type {
  CsharpSourceCallableParameterContract,
  CsharpTargetParameter,
  TargetTypeRef,
} from "../../../policy/types/index.js";
import {
  csharpNullableTargetType,
} from "../../../policy/types/index.js";
import {
  allocateSyntheticParameter,
  createDestructuringPlannerState,
  declareCsharpLocalBindingName,
  planParameterBindingPrelude,
} from "./index.js";
import { planAttributesForSubject } from "../declarations/attributes.js";
import type { DestructuringPlannerState } from "./index.js";
import {
  getCsharpTypeForNode,
  invalidCsharpType,
  nullableCsharpType,
} from "../types/index.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { planExpressionWithExpectedType } from "../expressions/index.js";
import { diagnoseTypeScriptOnlyRuntimeShapeModifiers } from "../declarations/modifiers.js";
import {
  planCsharpTypedLocationIdentityDeclaration,
} from "./typed-location-identities.js";

export interface PlannedParameterList {
  readonly parameters: readonly CsharpParameter[];
  readonly prelude: readonly CsharpStatement[];
  readonly targetParameters?: readonly CsharpSourceCallableParameterContract[];
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
  const targetParameters: CsharpSourceCallableParameterContract[] = [];
  const prelude: CsharpStatement[] = [];
  let targetParametersClosed = true;
  let hasDefaultParameter = false;
  for (const parameterNode of parameterNodes) {
    const parameter = AsParameterDeclaration(input.program.source.ast, parameterNode)!;
    const questionToken = input.program.source.ast.questionToken(parameterNode);
    diagnoseTypeScriptOnlyRuntimeShapeModifiers(input.program.source.ast, parameterNode!, "parameter declaration", diagnostics);
    if (HasSourceKind(input.program.source.ast, parameter.name, KindIdentifier)) {
      const typeSubject = getParameterTypeSubject(parameter);
      const type = getParameterType(typeSubject, questionToken, sourceFile, input, diagnostics);
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
      const targetParameter = getTargetParameter(
        parameterNode!,
        sourceName,
        typeSubject,
        questionToken,
        parameter.DotDotDotToken !== undefined,
        defaultValue !== undefined,
        sourceFile,
        input,
      );
      if (targetParameter === undefined) {
        targetParametersClosed = false;
      } else {
        targetParameters.push(targetParameter);
      }
      const locationIdentity = planCsharpTypedLocationIdentityDeclaration(
        parameterNode!,
        input,
        state,
      );
      if (locationIdentity !== undefined) {
        prelude.push(locationIdentity);
      }
      continue;
    }
      const bindingName = parameter.name;
    if (bindingName !== undefined && (HasSourceKind(input.program.source.ast, bindingName, KindObjectBindingPattern) || HasSourceKind(input.program.source.ast, bindingName, KindArrayBindingPattern))) {
      const typeSubject = getParameterTypeSubject(parameter) ?? bindingName;
      const type = getParameterType(typeSubject, questionToken, sourceFile, input, diagnostics, invalidCsharpType("destructured parameter type"));
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
      const targetParameter = getTargetParameter(
        parameterNode!,
        parameterName,
        typeSubject,
        questionToken,
        parameter.DotDotDotToken !== undefined,
        defaultValue !== undefined,
        sourceFile,
        input,
      );
      if (targetParameter === undefined) {
        targetParametersClosed = false;
      } else {
        targetParameters.push(targetParameter);
      }
      prelude.push(...planParameterBindingPrelude(bindingName, parameterName, sourceFile, input, diagnostics, state));
      continue;
    }
    const typeSubject = getParameterTypeSubject(parameter);
    const type = getParameterType(typeSubject, questionToken, sourceFile, input, diagnostics);
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
    const targetParameter = getTargetParameter(
      parameterNode!,
      targetName,
      typeSubject,
      questionToken,
      parameter.DotDotDotToken !== undefined,
      defaultValue !== undefined,
      sourceFile,
      input,
    );
    if (targetParameter === undefined) {
      targetParametersClosed = false;
    } else {
      targetParameters.push(targetParameter);
    }
  }
  return {
    parameters,
    prelude,
    ...(targetParametersClosed && targetParameters.length === parameters.length
      ? { targetParameters: Object.freeze(targetParameters) }
      : {}),
  };
}

function getTargetParameter(
  sourceParameter: Node,
  name: string,
  typeSubject: Node | undefined,
  questionToken: Node | undefined,
  rest: boolean,
  hasDefault: boolean,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
): CsharpSourceCallableParameterContract | undefined {
  const selectedType = input.types.policy.resolveNode(typeSubject, sourceFile);
  if (selectedType === undefined) {
    return undefined;
  }
  const targetType: TargetTypeRef = questionToken === undefined
    ? selectedType
    : csharpNullableTargetType(selectedType);
  const targetParameter: CsharpTargetParameter = Object.freeze({
    name,
    type: targetType,
    passingMode: "by-value",
    ...(questionToken !== undefined || hasDefault ? { optional: true } : {}),
    ...(rest ? { paramsArray: true } : {}),
  });
  return Object.freeze({
    sourceParameter,
    targetParameter,
  });
}

function getParameterTypeSubject(parameter: NonNullable<ReturnType<typeof AsParameterDeclaration>>): Node | undefined {
  return parameter.Type ?? parameter.name;
}

function getParameterType(
  typeSubject: Node | undefined,
  questionToken: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  errorType?: CsharpTypeNode,
): CsharpTypeNode {
  const type = getCsharpTypeForNode(typeSubject, sourceFile, input, errorType, diagnostics);
  return questionToken === undefined ? type : nullableCsharpType(type);
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
    return { kind: "LiteralExpression", value: null };
  }
  if (initializer === undefined) {
    return undefined;
  }
  const defaultValue = planExpressionWithExpectedType(initializer, sourceFile, input, diagnostics, expectedType, expectedTypeSubject, state);
  if (defaultValue === undefined) {
    return undefined;
  }
  if (defaultValue.kind === "LiteralExpression" || defaultValue.kind === "CharacterLiteralExpression") {
    return defaultValue;
  }
  diagnostics.push(unsupportedNodeDiagnostic(initializer, "C# parameter defaults require compile-time literal values."));
  return undefined;
}
