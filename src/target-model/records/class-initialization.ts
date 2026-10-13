import type { Node } from "@tsonic/tsts";

export interface CsharpClassInitializationIndex {
  readonly requiresClassConstructor: { get(declaration: Node): boolean };
  readonly relocatedClassField: { get(declaration: Node): boolean };
  readonly classInitializationRegion: { get(declaration: Node, isStatic: boolean): readonly Node[] };
}
