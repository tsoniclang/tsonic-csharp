import type { Node, Type } from "@tsonic/tsts";
import type { CsharpMemberReceiverProjection } from "./operations.js";

export interface CsharpSelectedReceiverEvidence {
  readonly expression: Node;
  readonly type: Type;
  readonly valueDeclaration?: Node;
}

export type CsharpMemberReceiverEmission = { readonly kind: "value" } | { readonly kind: "type"; readonly reference: Node };
export interface CsharpNativeMethodCallee {
  readonly receiver: CsharpSelectedReceiverEvidence;
  readonly projection: CsharpMemberReceiverProjection | undefined;
  readonly key: Node | undefined;
  readonly suspends: boolean;
}
export interface CsharpMemberReceiverRecords {
  readonly memberReceiver: { readonly get: (node: Node, declaration: Node | undefined) => CsharpMemberReceiverEmission | undefined };
  readonly nativeFunctionCallee: { readonly get: (node: Node) => "identifier" | "module" | undefined };
  readonly nativeMethodCallee: { readonly get: (node: Node) => CsharpNativeMethodCallee | undefined };
}
