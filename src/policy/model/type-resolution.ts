import type { Node, SourceFile } from "@tsonic/tsts";
import type { SourceApplication, SourceArgumentPlace, SourceDeclaredSlot, SourceMemberOrigin, SourceMemberUse, SourceMemberUseArm,
  SourceOperation, SourcePresence, SourceProgramFacts, SourceSignatureIdentity, SourceTypeEvidence, SourceTypeParameter } from "@tsonic/target-api/source";
import type { CsharpRepresentationOutcome, CsharpRepresentationView, CsharpRepresentedType } from "../../target-model/types/representation.js";
import type { CsharpRepresentedTypeParameter } from "../../target-model/types/generic-constraints.js";
import type { CsharpNativeCallableMember, CsharpObjectShapeFact, CsharpObjectShapeMemberFact,
  TargetTypeRef } from "../../target-model/types/model.js";

export interface CsharpSourceRepresentationQueries {
  readonly facts: SourceProgramFacts;
  readonly representation: CsharpRepresentationView;
}

export interface CsharpRepresentedArgument {
  readonly source: SourceArgumentPlace;
  readonly value: CsharpRepresentedType;
  readonly destination: CsharpRepresentedType;
}

export interface CsharpRepresentedApplication {
  readonly source: SourceApplication;
  readonly callee: { readonly occurrence: Node; readonly value: CsharpRepresentedType };
  readonly sourceArguments: readonly {
    readonly source: SourceApplication["sourceArguments"][number];
    readonly value: CsharpRepresentedType;
  }[];
  readonly classBindings: readonly { readonly declaration: Node; readonly value: CsharpRepresentedType }[];
  readonly signatureBindings: readonly { readonly declaration: Node; readonly value: CsharpRepresentedType }[];
  readonly receiver:
    | Extract<SourceApplication["receiver"], { readonly kind: "none" | "type" }>
    | { readonly kind: "value"; readonly occurrence: Node; readonly value: CsharpRepresentedType };
  readonly arguments: readonly CsharpRepresentedArgument[];
  readonly result: CsharpRepresentedType;
}

export interface CsharpRepresentedDeclaredSlot {
  readonly source: SourceDeclaredSlot;
  readonly value: CsharpRepresentedType;
}

export interface CsharpRepresentedMemberUseArm {
  readonly source: SourceMemberUseArm;
  readonly receiver: CsharpRepresentedType;
  readonly members: readonly { readonly origin: SourceMemberOrigin; readonly value: CsharpRepresentedType }[];
  readonly read: CsharpRepresentedType | undefined;
  readonly write: CsharpRepresentedType | undefined;
  readonly destination: CsharpRepresentedType | undefined;
  readonly key: CsharpRepresentedType | undefined;
}

export interface CsharpRepresentedMemberUse {
  readonly source: SourceMemberUse;
  readonly receiver: CsharpRepresentedType;
  readonly arms: readonly CsharpRepresentedMemberUseArm[];
  readonly read: CsharpRepresentedType | undefined;
  readonly write: CsharpRepresentedType | undefined;
}

export interface CsharpRepresentedStorage {
  readonly source: Extract<
    Extract<ReturnType<SourceProgramFacts["protocols"]["storage"]>, { readonly kind: "resolved" }>["value"],
    { readonly kind: "present" }
  >["value"];
  readonly value: CsharpRepresentedType;
}

export interface CsharpObjectShapeRegistry {
  retainShape(shape: CsharpObjectShapeFact, site: Node): CsharpRepresentationOutcome<CsharpObjectShapeFact>;
  resolveTarget(carrier: TargetTypeRef | undefined): CsharpObjectShapeFact | undefined;
  resolveNode(node: Node, sourceFile?: SourceFile): CsharpRepresentationOutcome<SourcePresence<CsharpObjectShapeFact>>;
  resolveEvidence(evidence: SourceTypeEvidence, carrier: TargetTypeRef, site: Node): CsharpRepresentationOutcome<SourcePresence<CsharpObjectShapeFact>>;
  resolveMember(evidence: SourceTypeEvidence, carrier: TargetTypeRef, origin: SourceMemberOrigin, site: Node): CsharpRepresentationOutcome<SourcePresence<CsharpObjectShapeMemberFact>>;
  knownShapes(): readonly CsharpObjectShapeFact[];
  retainConstructionSource(node: Node, shape: CsharpObjectShapeFact): CsharpRepresentationOutcome<CsharpObjectShapeFact>;
  resolveObjectLiteralTargetShape(expected: CsharpObjectShapeFact | undefined, literal: Node, sourceFile?: SourceFile): CsharpRepresentationOutcome<SourcePresence<CsharpObjectShapeFact>>;
  resolveCopyShape(shape: CsharpObjectShapeFact, site: Node, source?: CsharpObjectShapeFact): CsharpRepresentationOutcome<CsharpObjectShapeFact>;
  resolveNativeParameter(declaration: Node, parameter: Node, carrier: TargetTypeRef): CsharpRepresentationOutcome<TargetTypeRef>;
  resolveNativeReturn(declaration: Node, carrier: TargetTypeRef, observed: readonly TargetTypeRef[]): CsharpRepresentationOutcome<TargetTypeRef>;
}

export interface CsharpSelectedCallableMember extends CsharpNativeCallableMember {
  readonly owner: TargetTypeRef;
}

export interface CsharpNativeCallableQueries {
  member(carrier: TargetTypeRef, source: SourceSignatureIdentity): CsharpSelectedCallableMember | undefined;
}

export interface CsharpTypeQueries extends CsharpSourceRepresentationQueries {
  value(occurrence: Node): CsharpRepresentationOutcome<CsharpRepresentedType>;
  declaredSlot(declaration: Node): CsharpRepresentationOutcome<CsharpRepresentedDeclaredSlot>;
  storage(occurrence: Node): CsharpRepresentationOutcome<SourcePresence<CsharpRepresentedStorage>>;
  callableReturn(signature: SourceSignatureIdentity, site: Node): CsharpRepresentationOutcome<CsharpRepresentedType>;
  application(occurrence: Node): CsharpRepresentationOutcome<CsharpRepresentedApplication>;
  memberUse(occurrence: Node): CsharpRepresentationOutcome<CsharpRepresentedMemberUse>;
  operation(occurrence: Node): CsharpRepresentationOutcome<SourceOperation>;
  parameter(original: SourceTypeParameter, site: Node): CsharpRepresentationOutcome<CsharpRepresentedTypeParameter>;
}
