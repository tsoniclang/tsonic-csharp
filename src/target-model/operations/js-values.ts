import type { TargetTypeRef } from "../types/model.js";

export type CsharpJsValueRuntimeMember =
  | "CreateDynamicObject"
  | "ReadDynamicSlot" | "ReadDynamicSlotOptional" | "WriteDynamicSlot"
  | "ReadDynamicElement" | "ReadDynamicElementOptional" | "WriteDynamicElement"
  | "InvokeDynamic" | "InvokeDynamicOptional" | "InvokeDynamicSlot" | "InvokeDynamicElement"
  | "InvokeDynamicWithThis" | "ConstructDynamic"
  | "Add" | "Subtract" | "Multiply" | "Divide" | "Remainder"
  | "Equal" | "NotEqual" | "StrictEqual" | "StrictNotEqual"
  | "LessThan" | "LessThanOrEqual" | "GreaterThan" | "GreaterThanOrEqual"
  | "And" | "Or" | "Coalesce"
  | "Positive" | "Negate" | "BitwiseNot" | "LogicalNot"
  | "ApplyDynamicVoid" | "ApplyDynamicTypeof" | "ToDynamicBoolean" | "isUndefined";

export interface CsharpJsValueInvocation {
  readonly runtimeMember: CsharpJsValueRuntimeMember;
  readonly dispatch: "instance" | "static";
  readonly resultType: TargetTypeRef;
}

export type CsharpJsValueOperationSelection =
  | { readonly kind: "not-js-value" }
  | { readonly kind: "rejected"; readonly reason: string }
  | {
      readonly kind: "resolved";
      readonly runtimeMember: CsharpJsValueRuntimeMember;
      readonly dispatch: "instance" | "static";
      readonly resultType: TargetTypeRef;
      readonly shortCircuit?: {
        readonly condition: CsharpJsValueInvocation;
        readonly whenTrue: "left" | "right";
      };
      readonly presentOperation?: CsharpJsValueInvocation;
      readonly receiverReadOperation?: CsharpJsValueInvocation;
    };

export type CsharpJsValueReceiverOperation =
  | "property-read"
  | "property-write"
  | "element-read"
  | "element-write"
  | "construct";

export type CsharpJsValueCallKind =
  | "direct"
  | "property"
  | "element";
