import type { Node } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact } from "../types/model.js";

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
