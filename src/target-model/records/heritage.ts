import type { Node } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpStructuralInterfaceImplementation } from "../types/model.js";
import type { CsharpSourceCallContract, CsharpSourceCallableContract } from "./source-callable-contract.js";
import type { CsharpCallableParameterAdapter, CsharpCallableValueAdapter } from "./callable-adapters.js";
import type { CsharpDefaultParameterContract } from "./declarations.js";

export interface CsharpStructuralInterfaceMemberEvidence {
  readonly source: CsharpObjectShapeMemberFact;
  readonly destination: CsharpObjectShapeMemberFact;
  readonly openSource: CsharpObjectShapeMemberFact;
  readonly openDestination: CsharpObjectShapeMemberFact;
  readonly declaration?: Node;
  readonly parameterDefaults: readonly boolean[];
}

export interface CsharpStructuralInterfaceEvidence {
  readonly source: CsharpObjectShapeFact;
  readonly destination: CsharpObjectShapeFact;
  readonly members: readonly CsharpStructuralInterfaceMemberEvidence[];
}

export interface CsharpStructuralMethodForwarding {
  readonly contract: Pick<CsharpSourceCallContract, "parameters" | "returnType">;
  readonly implementation: CsharpSourceCallableContract;
  readonly parameterDefaults: readonly (CsharpDefaultParameterContract | undefined)[];
  readonly parameters: readonly CsharpCallableParameterAdapter[];
  readonly result: CsharpCallableValueAdapter;
}

export interface CsharpFinalStructuralInterfaceImplementation extends CsharpStructuralInterfaceImplementation {
  readonly methods: readonly (CsharpStructuralInterfaceImplementation["methods"][number] & {
    readonly forwarding: CsharpStructuralMethodForwarding;
  })[];
}
