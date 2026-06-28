import type { TargetOperationFact, Node } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression } from "../roslyn/syntax.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import {
  csharpStaticMemberExpression,
  getRequiredCsharpTargetConversionOperation,
} from "./csharp-target-operations.js";
import {
  csharpTargetOperationFactKey,
} from "../../source/csharp-facts.js";
import type {
  CsharpTargetOperationFact,
} from "../../source/csharp-facts.js";
import {
  targetTypeRefEquals,
} from "../../source/csharp-source-semantics/target-ref-utils.js";

type TargetConversion = NonNullable<ReturnType<TargetCompileInput["facts"]["getTargetConversionFact"]>>;

export function applyTargetConversionFact(
  node: Node,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expression: CsharpExpression | undefined,
): CsharpExpression | undefined {
  if (expression === undefined) {
    return undefined;
  }
  const conversion = input.facts.getTargetConversionFact(node);
  if (conversion === undefined || conversion.operation === undefined) {
    return expression;
  }
  if (isAlreadyTargetTypedOperation(node, input, conversion)) {
    return expression;
  }
  return planTargetConversionOperation(node, input, conversion, expression, diagnostics);
}

function isAlreadyTargetTypedOperation(
  node: Node,
  input: TargetCompileInput,
  conversion: TargetConversion,
): boolean {
  const operation = input.facts.getFact(node, csharpTargetOperationFactKey);
  if (operation !== undefined && operation.operationId === conversion.operation?.operationId) {
    return true;
  }
  const convertedType = conversion.convertedType;
  if (convertedType === undefined) {
    return false;
  }
  const operationResult = operation?.resultType;
  if (operationResult === undefined) {
    return false;
  }
  if (targetTypeRefEquals(operationResult, convertedType)) {
    return true;
  }
  return false;
}

function planTargetConversionOperation(
  node: Node,
  input: TargetCompileInput,
  conversion: TargetConversion,
  expression: CsharpExpression,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const operation = conversion.operation;
  if (operation === undefined) {
    return expression;
  }
  switch (operation.operationKind) {
    case "method":
      return planTargetConversionMethodCall(node, input, operation, expression, diagnostics);
    case "constructor":
      return planTargetConversionConstructor(node, conversion, expression, diagnostics);
    case "operator":
      return planTargetConversionOperator(node, input, operation, conversion, expression, diagnostics);
    default:
      diagnostics.push(unsupportedNodeDiagnostic(node, `Target conversion operation '${operation.operationKind}' is not renderable by the C# backend.`));
      return undefined;
  }
}

function planTargetConversionMethodCall(
  node: Node,
  input: TargetCompileInput,
  operation: TargetOperationFact,
  expression: CsharpExpression,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const callee = targetConversionStaticMethodCallee(input, operation, diagnostics, node);
  if (callee === undefined) {
    return undefined;
  }
  return {
    kind: "InvocationExpression",
    callee,
    arguments: [{ kind: "Argument", expression }],
  };
}

function targetConversionStaticMethodCallee(
  input: TargetCompileInput,
  operation: TargetOperationFact,
  diagnostics: TargetDiagnostic[],
  node: Node,
): CsharpExpression | undefined {
  const csharpOperation = getRequiredCsharpTargetConversionOperation(input, node, operation, diagnostics, "C# target conversion method emission");
  if (csharpOperation === undefined) {
    return undefined;
  }
  return csharpStaticMemberExpression(csharpOperation, diagnostics, node, "C# target conversion method");
}

function planTargetConversionConstructor(
  node: Node,
  conversion: TargetConversion,
  expression: CsharpExpression,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const targetTypeRef = conversion.convertedType;
  const targetType = targetTypeRef === undefined ? undefined : csharpTypeFromTargetTypeRef(targetTypeRef);
  if (targetType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Target conversion constructor requires a renderable target type before C# emission."));
    return undefined;
  }
  return {
    kind: "ObjectCreationExpression",
    type: targetType,
    arguments: [{ kind: "Argument", expression }],
  };
}

function planTargetConversionOperator(
  node: Node,
  input: TargetCompileInput,
  operation: TargetOperationFact,
  conversion: TargetConversion,
  expression: CsharpExpression,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const csharpOperation = getRequiredCsharpTargetConversionOperation(input, node, operation, diagnostics, "C# target conversion operator emission");
  if (csharpOperation === undefined) {
    return undefined;
  }
  if (csharpOperation.kind !== "cast") {
    if (csharpOperation.kind !== "conversion-operator") {
      diagnostics.push(unsupportedNodeDiagnostic(node, `C# target conversion operator emission requires a finalized C# cast or conversion-operator fact, but provider recorded '${csharpOperation.kind}'.`));
      return undefined;
    }
    if (!isMatchingConversionOperatorFact(csharpOperation, conversion)) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "C# target conversion operator emission received mismatched source or target conversion facts."));
      return undefined;
    }
  }
  const targetType = csharpTypeFromTargetTypeRef(csharpOperation.targetType);
  if (targetType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# target conversion cast requires a renderable target type before C# emission."));
    return undefined;
  }
  return {
    kind: "CastExpression",
    type: targetType,
    expression,
  };
}

function isMatchingConversionOperatorFact(
  csharpOperation: Extract<CsharpTargetOperationFact, { readonly kind: "conversion-operator" }>,
  conversion: TargetConversion,
): boolean {
  return conversion.convertedType !== undefined &&
    targetTypeRefEquals(csharpOperation.targetType, conversion.convertedType);
}
