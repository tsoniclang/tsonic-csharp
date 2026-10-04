import type { TargetTypeRef } from "../types/model.js";

export interface CsharpJsValueInvocation {
  readonly runtimeMember: string;
  readonly dispatch: "instance" | "static";
  readonly resultType: TargetTypeRef;
}

export type CsharpJsValueOperationSelection =
  | { readonly kind: "not-js-value" }
  | { readonly kind: "rejected"; readonly reason: string }
  | {
      readonly kind: "resolved";
      readonly runtimeMember: string;
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
