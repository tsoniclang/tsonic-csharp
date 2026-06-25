import type {
  ExtensionObservationContext,
  Node,
  Symbol,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";

export type ArrayUse =
  | "sequential-read"
  | "index-read"
  | "length-read"
  | "dense-mutation"
  | "full-js";

export type LifecycleContext = {
  readonly host: ExtensionObservationContext["host"];
  readonly compiler?: ExtensionObservationContext["compiler"];
};

export type CsharpArrayLifecycleAst = NonNullable<ExtensionObservationContext["compiler"]>["ast"];

export interface ArrayParameterAnalysis {
  readonly parameter: Node;
  readonly name: Node;
  readonly typeNode: Node;
  readonly symbol: Symbol | undefined;
  readonly semanticType: Type | undefined;
  readonly elementType: TargetTypeRef;
  readonly uses: ReadonlySet<ArrayUse>;
}

export interface ArrayReturnAnalysis {
  readonly typeNode: Node;
  readonly elementType: TargetTypeRef;
}
