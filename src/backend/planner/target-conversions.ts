import type { TargetOperationFact, Node } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression } from "../roslyn/syntax.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { invalidExpression } from "./invalid-expression.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import {
  getCsharpStaticMemberOperation,
} from "../../source/csharp-operation-tags.js";

type TargetConversion = NonNullable<ReturnType<TargetCompileInput["facts"]["getTargetConversionFact"]>>;

export function applyTargetConversionFact(
  node: Node,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expression: CsharpExpression,
): CsharpExpression {
  const conversion = input.facts.getTargetConversionFact(node);
  if (conversion === undefined || conversion.operation === undefined) {
    return expression;
  }
  return planTargetConversionOperation(node, conversion, expression, diagnostics);
}

function planTargetConversionOperation(
  node: Node,
  conversion: TargetConversion,
  expression: CsharpExpression,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const operation = conversion.operation;
  if (operation === undefined) {
    return expression;
  }
  switch (operation.operationKind) {
    case "method":
      return planTargetConversionMethodCall(node, operation, expression, diagnostics);
    case "constructor":
      return planTargetConversionConstructor(node, conversion, expression, diagnostics);
    default:
      diagnostics.push(unsupportedNodeDiagnostic(node, `Target conversion operation '${operation.operationKind}' is not renderable by the C# backend.`));
      return invalidExpression("unsupported target conversion operation");
  }
}

function planTargetConversionMethodCall(
  node: Node,
  operation: TargetOperationFact,
  expression: CsharpExpression,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const callee = targetConversionStaticMethodCallee(operation, diagnostics, node);
  if (callee === undefined) {
    return invalidExpression("target conversion method");
  }
  return {
    kind: "InvocationExpression",
    callee,
    arguments: [{ kind: "Argument", expression }],
  };
}

function targetConversionStaticMethodCallee(
  operation: TargetOperationFact,
  diagnostics: TargetDiagnostic[],
  node: Node,
): CsharpExpression | undefined {
  const staticMember = getCsharpStaticMemberOperation(operation.targetOperation);
  const declaringTypeRef = staticMember === undefined ? undefined : { kind: "target-named" as const, id: staticMember.declaringTypeId };
  const methodName = staticMember?.memberName;
  const declaringType = declaringTypeRef === undefined ? undefined : csharpTypeFromTargetTypeRef(declaringTypeRef);
  if (declaringType === undefined || methodName === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Target conversion method requires a declaring target type and method name before C# emission."));
    return undefined;
  }
  return {
    kind: "SimpleMemberAccessExpression",
    receiver: declaringType,
    name: methodName,
  };
}

function planTargetConversionConstructor(
  node: Node,
  conversion: TargetConversion,
  expression: CsharpExpression,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const targetTypeRef = conversion.convertedType;
  const targetType = targetTypeRef === undefined ? undefined : csharpTypeFromTargetTypeRef(targetTypeRef);
  if (targetType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Target conversion constructor requires a renderable target type before C# emission."));
    return invalidExpression("target conversion constructor");
  }
  return {
    kind: "ObjectCreationExpression",
    type: targetType,
    arguments: [{ kind: "Argument", expression }],
  };
}
