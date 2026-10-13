import type { Node } from "@tsonic/tsts";

export interface CsharpClassInitializationIndex {
  readonly requiresClassConstructor: { readonly get: (declaration: Node) => boolean };
  readonly relocatedClassField: { readonly get: (declaration: Node) => boolean };
  readonly classInitializationRegion: { readonly get: (declaration: Node, isStatic: boolean) => readonly Node[] };
}
