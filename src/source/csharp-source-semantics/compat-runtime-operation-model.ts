import type {
  TargetMember,
} from "@tsonic/tsts";
import type {
  CsharpTargetMemberOperationFact,
  CsharpTargetOperationArgument,
} from "../csharp-facts.js";
import {
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

function sourceArgumentProjection(argumentCount: number): readonly CsharpTargetOperationArgument[] {
  return Array.from({ length: argumentCount }, (_, index) => ({ kind: "source-argument", index }));
}
