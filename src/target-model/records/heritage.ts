import type { Node } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpStructuralInterfaceImplementation, TargetTypeRef } from "../types/model.js";
import type { SourceCallableContract, SourceCallableSourceContract } from "./source-callable-contract.js";
import type { CsharpCallableParameterAdapter, CsharpCallableValueAdapter } from "./callable-adapters.js";
import type { CsharpDefaultParameterContract } from "./declarations.js";

export interface CsharpStructuralInterfaceMemberEvidence {
  readonly source: CsharpObjectShapeMemberFact;
  readonly destination: CsharpObjectShapeMemberFact;
  readonly openSource: CsharpObjectShapeMemberFact;
  readonly openDestination: CsharpObjectShapeMemberFact;
  readonly declaration?: Node;
}

export interface CsharpStructuralInterfaceEvidence {
  readonly sourceNode: Node;
  readonly source: CsharpObjectShapeFact;
  readonly destination: CsharpObjectShapeFact;
  readonly members: readonly CsharpStructuralInterfaceMemberEvidence[];
  /** The source declaration's own declared supertypes, in its own type parameters. */
  readonly declaredSupertypes: readonly TargetTypeRef[];
}

export interface CsharpStructuralMethodForwarding {
  readonly contract: Pick<SourceCallableContract, "nativeParameters" | "returnType">;
  readonly implementation: SourceCallableSourceContract;
  readonly typeArguments: readonly import("../types/model.js").TargetTypeRef[];
  readonly typeParameters: readonly Extract<import("../types/model.js").TargetTypeRef, { readonly kind: "type-parameter" }>[];
  readonly parameterDefaults: readonly (CsharpDefaultParameterContract | undefined)[];
  readonly parameters: readonly CsharpCallableParameterAdapter[];
  readonly result: CsharpCallableValueAdapter;
}

export interface CsharpFinalStructuralInterfaceImplementation extends CsharpStructuralInterfaceImplementation {
  readonly properties: readonly (CsharpStructuralInterfaceImplementation["properties"][number] & {
    readonly read: CsharpCallableValueAdapter;
  })[];
  readonly methods: readonly (CsharpStructuralInterfaceImplementation["methods"][number] & {
    readonly forwarding: CsharpStructuralMethodForwarding;
  })[];
}
