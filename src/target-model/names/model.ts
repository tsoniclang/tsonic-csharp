import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";

export type CsharpSourceNameResolution =
  | { readonly kind: "resolved"; readonly name: string }
  | { readonly kind: "rejected"; readonly reason: string };

export interface CsharpNamePlan {
  readonly reservedNames: readonly string[];
  readonly typeParameterNames: readonly { readonly identity: string; readonly name: string }[];
  readonly generatedMethodTypeParameters: { readonly get: (node: Node) => readonly Node[] | undefined };
  readonly issues: readonly TargetDiagnostic[];
  resolve(nameNode: Node | undefined, selectedDeclaration?: Node): CsharpSourceNameResolution;
}
