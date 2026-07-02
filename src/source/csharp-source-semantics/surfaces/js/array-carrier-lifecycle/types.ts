import type {
  ExtensionObservationContext,
  ExtensionFactSubject,
  Node,
  Symbol,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import type {
  TargetLazySourceAnalysis,
  TargetSourceUseRecord,
} from "@tsonic/target-api";

export type CsharpArrayCarrierRequirement =
  | "sequential-read"
  | "index-read"
  | "length-read"
  | "dense-mutation"
  | "full-js"
  | "unresolved-structural-use";

export type LifecycleContext = {
  readonly host: ExtensionObservationContext["host"];
  readonly compiler?: ExtensionObservationContext["compiler"];
  readonly analysis?: TargetLazySourceAnalysis;
};

export type CsharpArrayLifecycleAst = NonNullable<ExtensionObservationContext["compiler"]>["ast"];

export interface ArrayParameterAnalysis {
  readonly parameter: Node;
  readonly name: Node;
  readonly typeNode: Node;
  readonly symbol: Symbol | undefined;
  readonly semanticType: Type | undefined;
  readonly elementType: TargetTypeRef;
  readonly sourceUses: readonly TargetSourceUseRecord[];
  readonly carrierRequirements: ReadonlySet<CsharpArrayCarrierRequirement>;
}

export interface ArrayReturnAnalysis {
  readonly declaration: Node;
  readonly typeNode?: Node;
  readonly semanticType?: Type;
  readonly sourceReturnSubjects: readonly ExtensionFactSubject[];
  readonly returnExpressions: readonly Node[];
  readonly elementType: TargetTypeRef;
}

export interface ArrayLocalAnalysis {
  readonly declaration: Node;
  readonly name: Node;
  readonly initializer?: Node;
  readonly typeNode?: Node;
  readonly symbol: Symbol | undefined;
  readonly semanticType: Type | undefined;
  readonly elementType: TargetTypeRef;
  readonly sourceUses: readonly TargetSourceUseRecord[];
  readonly carrierRequirements: ReadonlySet<CsharpArrayCarrierRequirement>;
}
