import type {
  TargetMember,
} from "@tsonic/tsts";
import type {
  CsharpTargetMemberOperationFact,
  CsharpTargetOperationArgument,
} from "../csharp-facts.js";
import {
  csharpBooleanTargetType,
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
} from "./target-types.js";

export const csharpCompatRuntimeEvidence = Object.freeze([
  { message: "C# compat-runtime operation fact finalized from explicit TypeScript any carrier and compat target mode." },
]);

export const tsValueType = csharpTargetNamedType("Tsonic.CSharp.Js.TsValue", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "TsValue"));

export function compatAnyPropertyReadOperation(propertyName: string): CsharpTargetMemberOperationFact {
  return compatRuntimeMethodOperation(`tsonic.csharp.compat.any.property-read:${propertyName}`, "ReadCompatSlot", [
    { kind: "literal", value: propertyName },
  ]);
}

export function compatAnyPropertyWriteOperation(propertyName: string): CsharpTargetMemberOperationFact {
  return compatRuntimeMethodOperation(`tsonic.csharp.compat.any.property-write:${propertyName}`, "WriteCompatSlot", [
    { kind: "literal", value: propertyName },
    { kind: "source-argument", index: 0 },
  ]);
}

export function compatAnyElementReadOperation(): CsharpTargetMemberOperationFact {
  return compatRuntimeMethodOperation("tsonic.csharp.compat.any.element-read", "ReadCompatElement", [
    { kind: "source-argument", index: 0 },
  ]);
}

export function compatAnyElementWriteOperation(): CsharpTargetMemberOperationFact {
  return compatRuntimeMethodOperation("tsonic.csharp.compat.any.element-write", "WriteCompatElement", [
    { kind: "source-argument", index: 0 },
    { kind: "source-argument", index: 1 },
  ]);
}

export function compatAnyCallOperation(argumentCount: number): CsharpTargetMemberOperationFact {
  return compatRuntimeMethodOperation("tsonic.csharp.compat.any.call", "InvokeCompat", sourceArgumentProjection(argumentCount));
}

export function compatAnyConstructOperation(argumentCount: number): CsharpTargetMemberOperationFact {
  return compatRuntimeMethodOperation("tsonic.csharp.compat.any.construct", "ConstructCompat", sourceArgumentProjection(argumentCount));
}

export function compatAnyBinaryOperatorOperation(operator: string): CsharpTargetMemberOperationFact | undefined {
  const memberName = compatBinaryOperatorRuntimeMember(operator);
  if (memberName === undefined) {
    return undefined;
  }
  const resultType = compatBooleanOperator(operator)
    ? csharpBooleanTargetType()
    : tsValueType;
  return compatRuntimeStaticMethodOperation(`tsonic.csharp.compat.any.operator:${operator}`, memberName, [
    { kind: "source-argument", index: 0 },
    { kind: "literal", value: operator },
    { kind: "source-argument", index: 1 },
  ], resultType);
}

export function compatAnyUnaryOperatorOperation(operator: string): CsharpTargetMemberOperationFact | undefined {
  const memberName = compatUnaryOperatorRuntimeMember(operator);
  if (memberName === undefined) {
    return undefined;
  }
  const resultType = operator === "!"
    ? csharpBooleanTargetType()
    : tsValueType;
  return compatRuntimeStaticMethodOperation(`tsonic.csharp.compat.any.operator:${operator}`, memberName, [
    { kind: "source-argument", index: 0 },
    { kind: "literal", value: operator },
  ], resultType);
}

export function compatAnySelectedTargetMember(operation: CsharpTargetMemberOperationFact): TargetMember {
  return {
    id: operation.operationId,
    sourceName: operation.memberName,
    targetName: operation.memberName,
    kind: operation.memberName === "ConstructCompat" ? "constructor" : "method",
    parameters: [
      {
        name: "arguments",
        type: tsValueType,
        passingMode: "by-value",
        paramsArray: true,
      },
    ],
    returnType: tsValueType,
  };
}

function compatBinaryOperatorRuntimeMember(operator: string): "ApplyCompatBinary" | "ApplyCompatBinaryBoolean" | undefined {
  if (compatBooleanOperator(operator)) {
    return "ApplyCompatBinaryBoolean";
  }
  switch (operator) {
    case "+":
    case "-":
    case "*":
    case "/":
    case "%":
    case "??":
    case "&&":
    case "||":
      return "ApplyCompatBinary";
    default:
      return undefined;
  }
}

function compatBooleanOperator(operator: string): boolean {
  switch (operator) {
    case "==":
    case "!=":
    case "===":
    case "!==":
    case "<":
    case "<=":
    case ">":
    case ">=":
      return true;
    default:
      return false;
  }
}

function compatUnaryOperatorRuntimeMember(operator: string): "ApplyCompatUnary" | "ApplyCompatUnaryBoolean" | undefined {
  switch (operator) {
    case "+":
    case "-":
    case "~":
      return "ApplyCompatUnary";
    case "!":
      return "ApplyCompatUnaryBoolean";
    default:
      return undefined;
  }
}

function compatRuntimeMethodOperation(
  operationId: string,
  memberName: string,
  argumentProjection: readonly CsharpTargetOperationArgument[],
): CsharpTargetMemberOperationFact {
  return {
    kind: "member",
    operationId,
    operationKind: "method",
    memberName,
    declaringType: tsValueType,
    resultType: tsValueType,
    argumentProjection,
  };
}

function compatRuntimeStaticMethodOperation(
  operationId: string,
  memberName: string,
  argumentProjection: readonly CsharpTargetOperationArgument[],
  resultType = tsValueType,
): CsharpTargetMemberOperationFact {
  return {
    kind: "member",
    operationId,
    operationKind: "method",
    memberName,
    static: true,
    declaringType: tsValueType,
    resultType,
    argumentProjection,
  };
}

function sourceArgumentProjection(argumentCount: number): readonly CsharpTargetOperationArgument[] {
  return Array.from({ length: argumentCount }, (_, index) => ({ kind: "source-argument", index }));
}
