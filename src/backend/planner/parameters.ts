import {
  AsParameterDeclaration,
  HasSourceKind,
  KindArrayBindingPattern,
  KindIdentifier,
  KindObjectBindingPattern,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression, CsharpParameter, CsharpStatement, CsharpTypeNode } from "../roslyn/syntax.js";
import {
  csharpArrayBoundaryFactKey,
} from "../../source/csharp-facts.js";
import {
  allocateSyntheticParameter,
  createDestructuringPlannerState,
  declareCsharpLocalBindingName,
  planParameterBindingPrelude,
} from "./bindings.js";
import { planAttributesForSubject } from "./attributes.js";
import type { DestructuringPlannerState } from "./bindings.js";
import { getCsharpTypeForNode, invalidCsharpType } from "./csharp-types.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { planExpressionWithExpectedType } from "./expressions.js";
import { diagnoseTypeScriptOnlyRuntimeShapeModifiers } from "./modifiers.js";

export interface PlannedParameterList {
  readonly parameters: readonly CsharpParameter[];
  readonly prelude: readonly CsharpStatement[];
}

export function planParameters(
  parameterNodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpParameter[] {
  return planParametersWithPrelude(parameterNodes, sourceFile, input, diagnostics).parameters;
}

export function planParametersWithPrelude(
  parameterNodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState = createDestructuringPlannerState(),
): PlannedParameterList {
  const parameters: CsharpParameter[] = [];
  const prelude: CsharpStatement[] = [];
  let hasDefaultParameter = false;
  for (const parameterNode of parameterNodes) {
    const parameter = AsParameterDeclaration(parameterNode)!;
    diagnoseTypeScriptOnlyRuntimeShapeModifiers(parameterNode!, "parameter declaration", diagnostics);
    if (HasSourceKind(input.ast, parameter.name, KindIdentifier)) {
      const typeSubject = getParameterTypeSubject(parameter);
      const type = getParameterType(typeSubject, parameterQuestionToken(parameter), sourceFile, input, diagnostics);
      const defaultValue = planParameterDefaultValue(parameter.Initializer, parameterQuestionToken(parameter), sourceFile, input, diagnostics, type, typeSubject, state);
      if (defaultValue !== undefined) {
        hasDefaultParameter = true;
      } else if (hasDefaultParameter && parameter.DotDotDotToken === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(parameterNode!, "Required parameters cannot follow C# optional parameters."));
      }
      const sourceName = declareCsharpLocalBindingName(parameter.name, sourceFile, input, diagnostics, state, "Parameter name", "arg");
      const copyIn = parameter.DotDotDotToken === undefined
        ? planParameterCopyIn(parameterNode!, parameter.name, typeSubject, sourceName, input, diagnostics, state)
        : undefined;
      parameters.push({
        name: copyIn?.parameterName ?? sourceName,
        type,
        attributes: planAttributesForSubject(parameterNode, sourceFile, input, diagnostics),
        ...(parameter.DotDotDotToken === undefined ? {} : { isParams: true }),
        ...(defaultValue === undefined ? {} : { defaultValue }),
      });
      if (copyIn !== undefined) {
        prelude.push(copyIn.statement);
      }
      continue;
    }
    const bindingName = parameter.name;
    if (bindingName !== undefined && (HasSourceKind(input.ast, bindingName, KindObjectBindingPattern) || HasSourceKind(input.ast, bindingName, KindArrayBindingPattern))) {
      const typeSubject = getParameterTypeSubject(parameter) ?? bindingName;
      const type = getParameterType(typeSubject, parameterQuestionToken(parameter), sourceFile, input, diagnostics, invalidCsharpType("destructured parameter type"));
      const defaultValue = planParameterDefaultValue(parameter.Initializer, parameterQuestionToken(parameter), sourceFile, input, diagnostics, type, typeSubject, state);
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
      prelude.push(...planParameterBindingPrelude(bindingName, parameterName, sourceFile, input, diagnostics, state));
      continue;
    }
    const typeSubject = getParameterTypeSubject(parameter);
    const type = getParameterType(typeSubject, parameterQuestionToken(parameter), sourceFile, input, diagnostics);
    const defaultValue = planParameterDefaultValue(parameter.Initializer, parameterQuestionToken(parameter), sourceFile, input, diagnostics, type, typeSubject, state);
    if (defaultValue !== undefined) {
      hasDefaultParameter = true;
    } else if (hasDefaultParameter && parameter.DotDotDotToken === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(parameterNode!, "Required parameters cannot follow C# optional parameters."));
    }
    diagnostics.push(unsupportedNodeDiagnostic(parameter.name ?? parameterNode!, "Parameter name is outside the current C# planning surface."));
    parameters.push({
      name: declareCsharpLocalBindingName(parameter.name, sourceFile, input, diagnostics, state, "Parameter name", "arg"),
      type,
      attributes: planAttributesForSubject(parameterNode, sourceFile, input, diagnostics),
      ...(defaultValue === undefined ? {} : { defaultValue }),
    });
  }
  return { parameters, prelude };
}

function planParameterCopyIn(
  parameterNode: Node,
  nameNode: Node | undefined,
  typeSubject: Node | undefined,
  sourceName: string,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): { readonly parameterName: string; readonly statement: CsharpStatement } | undefined {
  const boundary = input.facts.getFact(typeSubject, csharpArrayBoundaryFactKey) ??
    input.facts.getFact(nameNode, csharpArrayBoundaryFactKey) ??
    input.facts.getFact(parameterNode, csharpArrayBoundaryFactKey);
  if (boundary?.requiresCopyIn !== true) {
    return undefined;
  }
  const carrierType = csharpTypeFromTargetTypeRef(boundary.coreCarrierType);
  if (carrierType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(parameterNode, "Array parameter copy-in requires a renderable finalized core carrier type."));
    return undefined;
  }
  const parameterName = allocateSyntheticParameter(state);
  return {
    parameterName,
    statement: {
      kind: "LocalDeclarationStatement",
      name: sourceName,
      type: carrierType,
      initializer: {
        kind: "ObjectCreationExpression",
        type: carrierType,
        arguments: [{
          kind: "Argument",
          expression: { kind: "IdentifierName", name: parameterName },
        }],
      },
    },
  };
}

function getParameterTypeSubject(parameter: NonNullable<ReturnType<typeof AsParameterDeclaration>>): Node | undefined {
  return parameter.Type ?? parameter.name;
}

function parameterQuestionToken(parameter: NonNullable<ReturnType<typeof AsParameterDeclaration>>): Node | undefined {
  return (parameter as { readonly QuestionToken?: Node }).QuestionToken;
}

function getParameterType(
  typeSubject: Node | undefined,
  questionToken: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  errorType?: CsharpTypeNode,
): CsharpTypeNode {
  const type = getCsharpTypeForNode(typeSubject, sourceFile, input, errorType, diagnostics);
  return questionToken === undefined || type.kind === "NullableType" || type.kind === "InvalidType"
    ? type
    : { kind: "NullableType", inner: type };
}

function planParameterDefaultValue(
  initializer: Node | undefined,
  questionToken: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
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
