import type { Node } from "@tsonic/tsts";

export type CsharpSourceNameResolution =
  | { readonly kind: "resolved"; readonly name: string }
  | { readonly kind: "rejected"; readonly reason: string };

export interface CsharpNamePlan {
  readonly reservedNames: readonly string[];
  readonly typeParameterNames: readonly { readonly identity: string; readonly name: string }[];
  resolve(nameNode: Node | undefined, selectedDeclaration?: Node): CsharpSourceNameResolution;
}
