import type { Node } from "@tsonic/tsts";
import type { CsharpSourceNameResolution } from "../names/model.js";

export interface CsharpNameInventory {
  readonly reservedNames: readonly string[];
  readonly typeParameterNames: readonly { readonly identity: string; readonly name: string }[];
}

export interface CsharpSourceNameRecords {
  readonly sourceName: { readonly get: (node: Node | undefined, selectedDeclaration?: Node) => CsharpSourceNameResolution };
  readonly nameInventory: { readonly get: () => CsharpNameInventory };
  readonly generatedMethodTypeParameters: { readonly get: (node: Node) => readonly Node[] | undefined };
}
