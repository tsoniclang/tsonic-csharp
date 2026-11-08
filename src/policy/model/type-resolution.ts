import type { Node } from "@tsonic/tsts";
import type { SourceApplication, SourceArgumentPlace, SourceDeclaredSlot, SourceMemberOrigin, SourceMemberUse, SourceMemberUseArm,
  SourceOperation, SourcePresence, SourceProgramFacts, SourceSignatureIdentity, SourceTypeParameter } from "@tsonic/target-api/source";
import type { CsharpRepresentationOutcome, CsharpRepresentationView, CsharpRepresentedType,
  CsharpRepresentedTypeParameter } from "../../target-model/types/representation.js";

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
