import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";

export type CsharpSourceNameResolution =
  | { readonly kind: "resolved"; readonly name: string }
  | { readonly kind: "rejected"; readonly reason: string };

export type CsharpNativeMemberRole =
  | "member" | "implementation" | "storage" | "getter" | "setter" | "bound-storage" | "frozen-storage";

export type CsharpNativeMemberIdentity =
  | { readonly kind: "source"; readonly declaration: Node; readonly role: CsharpNativeMemberRole }
  | { readonly kind: "artifact"; readonly container: string; readonly member: string; readonly role: CsharpNativeMemberRole }
  | { readonly kind: "value"; readonly container: Node; readonly member: string; readonly role: CsharpNativeMemberRole };

export function csharpNativeMemberIdentityParts(
  subject: CsharpNativeMemberIdentity,
): readonly [Node | string, Node | string, CsharpNativeMemberRole] {
  return subject.kind === "source" ? [subject.declaration, subject.declaration, subject.role]
    : [subject.container, subject.member, subject.role];
}

export interface CsharpNativeMemberNames {
  readonly issues: readonly TargetDiagnostic[];
  readonly memberHiding: readonly { readonly subject: CsharpNativeMemberIdentity; readonly hides: boolean }[];
}

export interface CsharpNamePlan {
  readonly reservedNames: readonly string[];
  readonly typeParameterNames: readonly { readonly identity: string; readonly name: string }[];
  readonly generatedMethodTypeParameters: { readonly get: (node: Node) => readonly Node[] | undefined };
  readonly issues: readonly TargetDiagnostic[];
  resolve(nameNode: Node | undefined, selectedDeclaration?: Node): CsharpSourceNameResolution;
}
