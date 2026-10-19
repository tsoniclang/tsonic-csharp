import type { Node } from "@tsonic/tsts";

export type CsharpMemberVisibility = "public" | "private" | "protected" | "internal";
export type CsharpMemberModifier = CsharpMemberVisibility | "static";
export type CsharpDispatchModifier = "override" | "virtual" | "abstract";
export type CsharpCallableModifier = CsharpDispatchModifier | "async";

export interface CsharpMemberModifierSelection {
  readonly member: readonly CsharpMemberModifier[];
  readonly implementation: readonly CsharpMemberModifier[];
  readonly method: readonly CsharpCallableModifier[] | undefined;
  readonly property: readonly CsharpDispatchModifier[] | undefined;
}

export interface CsharpDeclarationModifierRecords {
  readonly memberModifiers: { readonly get: (subject: Node) => CsharpMemberModifierSelection | undefined };
}
