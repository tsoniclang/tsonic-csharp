import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetMemberOperationFact,
  CsharpTargetOperationArgument,
} from "../csharp-facts.js";
import {
  csharpBooleanTargetType,
  csharpQualifiedTypeRenderShape,
  csharpStringTargetType,
  csharpTsUnionTargetType,
  csharpTargetNamedType,
} from "./target-types.js";
import {
  targetTypeRefKey,
} from "./target-ref-utils.js";

export const csharpCompatRuntimeEvidence = Object.freeze([
  { message: "C# compat-runtime operation fact finalized from explicit TypeScript any carrier and compat target mode." },
]);

export const tsValueType = csharpTargetNamedType("Tsonic.CSharp.Js.TsValue", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "TsValue"));
export const tsUnionType = csharpTsUnionTargetType();

export function compatAnyPropertyReadOperation(propertyName: string): CsharpTargetMemberOperationFact {
  return compatRuntimeMethodOperation(`tsonic.csharp.compat.any.property-read:${propertyName}`, "ReadCompatSlot", [
    { kind: "literal", value: propertyName },
  ]);
}

export function compatStructuralPropertyReadOperation(
  operationId: string,
  propertyName: string,
  resultType: TargetTypeRef,
): CsharpTargetMemberOperationFact {
  if (resultType.kind === "target-named" && resultType.id === "Tsonic.CSharp.Js.TsValue") {
    return compatRuntimeMethodOperation(operationId, "ReadCompatSlot", [
      { kind: "literal", value: propertyName },
    ]);
  }
  return compatRuntimeMethodOperation(operationId, "ReadCompatSlotAs", [
    { kind: "literal", value: propertyName },
  ], resultType, [resultType]);
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
  if (operator === "typeof") {
    return compatRuntimeTypeofOperation();
  }
  const memberName = compatUnaryOperatorRuntimeMember(operator);
  if (memberName === undefined) {
    return undefined;
  }
  const resultType = compatUnaryOperatorResultType(operator);
  return compatRuntimeStaticMethodOperation(`tsonic.csharp.compat.any.operator:${operator}`, memberName, [
    { kind: "source-argument", index: 0 },
    ...(compatUnaryOperatorRuntimeMemberRequiresOperatorLiteral(memberName) ? [{ kind: "literal" as const, value: operator }] : []),
  ], resultType);
}

export function compatRuntimeTypeofOperation(): CsharpTargetMemberOperationFact {
  return compatRuntimeStaticMethodOperation("tsonic.csharp.compat.operator:typeof", "ApplyCompatTypeof", [
    { kind: "source-argument", index: 0 },
  ], csharpStringTargetType());
}

export function compatAnyTypedBoundaryCastOperation(targetType: TargetTypeRef): CsharpTargetMemberOperationFact {
  return compatRuntimeStaticMethodOperation(
    `tsonic.csharp.compat.any.typed-boundary-cast:${targetTypeRefKey(targetType)}`,
    "CastCompat",
    [{ kind: "source-argument", index: 0 }],
    targetType,
    [targetType],
  );
}

export function compatAnyRuntimeUnionTypedBoundaryCastOperation(
  targetType: TargetTypeRef,
  arms: readonly TargetTypeRef[],
): CsharpTargetMemberOperationFact {
  return compatRuntimeStaticMethodOperation(
    `tsonic.csharp.compat.any.typed-boundary-cast:${targetTypeRefKey(targetType)}`,
    "CastCompat",
    [{ kind: "source-argument", index: 0 }],
    targetType,
    arms,
    tsUnionType,
  );
}

export function compatAnyTypedBoundaryBoxOperation(sourceType: TargetTypeRef): CsharpTargetMemberOperationFact {
  return compatRuntimeStaticMethodOperation(
    `tsonic.csharp.compat.any.typed-boundary-box:${targetTypeRefKey(sourceType)}`,
    "from",
    [{ kind: "source-argument", index: 0 }],
  );
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

function compatUnaryOperatorRuntimeMember(operator: string): "ApplyCompatUnary" | "ApplyCompatUnaryBoolean" | "ApplyCompatTypeof" | "ApplyCompatVoid" | undefined {
  switch (operator) {
    case "+":
    case "-":
    case "~":
      return "ApplyCompatUnary";
    case "!":
      return "ApplyCompatUnaryBoolean";
    case "typeof":
      return "ApplyCompatTypeof";
    case "void":
      return "ApplyCompatVoid";
    default:
      return undefined;
  }
}

function compatUnaryOperatorRuntimeMemberRequiresOperatorLiteral(
  memberName: "ApplyCompatUnary" | "ApplyCompatUnaryBoolean" | "ApplyCompatTypeof" | "ApplyCompatVoid",
): boolean {
  return memberName === "ApplyCompatUnary" || memberName === "ApplyCompatUnaryBoolean";
}

function compatUnaryOperatorResultType(operator: string): TargetTypeRef {
  if (operator === "!") {
    return csharpBooleanTargetType();
  }
  if (operator === "typeof") {
    return csharpStringTargetType();
  }
  return tsValueType;
}

function compatRuntimeMethodOperation(
  operationId: string,
  memberName: string,
  argumentProjection: readonly CsharpTargetOperationArgument[],
  resultType: TargetTypeRef = tsValueType,
  typeArguments: readonly TargetTypeRef[] = [],
): CsharpTargetMemberOperationFact {
  return {
    kind: "member",
    operationId,
    operationKind: "method",
    memberName,
    declaringType: tsValueType,
    resultType,
    ...(typeArguments.length === 0 ? {} : { typeArguments }),
    argumentProjection,
  };
}

function compatRuntimeStaticMethodOperation(
  operationId: string,
  memberName: string,
  argumentProjection: readonly CsharpTargetOperationArgument[],
  resultType: TargetTypeRef = tsValueType,
  typeArguments: readonly TargetTypeRef[] = [],
  declaringType: TargetTypeRef = tsValueType,
): CsharpTargetMemberOperationFact {
  return {
    kind: "member",
    operationId,
    operationKind: "method",
    memberName,
    static: true,
    declaringType,
    resultType,
    ...(typeArguments.length === 0 ? {} : { typeArguments }),
    argumentProjection,
  };
}

function sourceArgumentProjection(argumentCount: number): readonly CsharpTargetOperationArgument[] {
  return Array.from({ length: argumentCount }, (_, index) => ({ kind: "source-argument", index }));
}
