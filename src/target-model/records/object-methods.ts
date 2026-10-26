import type { Node } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../types/model.js";
import type { CsharpObjectMemberDeclaration } from "./object-members.js";
import type { CsharpExplicitImplementationConstraint } from "../types/generic-constraints.js";

export interface CsharpObjectCaptureField {
  readonly name: string;
  readonly type: TargetTypeRef;
  readonly declarations: readonly { readonly declaration: Node; readonly member?: string }[];
  readonly frameScope: Node | undefined;
}

export interface CsharpAuthoredObjectMethod {
  readonly declaration: Node;
  readonly name: string;
  readonly handleName: string | undefined;
  readonly bodyInvocation: { readonly interface: TargetTypeRef; readonly name: string;
    readonly explicitConstraints: readonly CsharpExplicitImplementationConstraint[] } | undefined;
  readonly emission: Extract<CsharpObjectMemberDeclaration, { readonly kind: "authored" }>;
}

export interface CsharpObjectMethodRecords {
  readonly objectCaptures: { readonly get: (shape: CsharpObjectShapeFact) => readonly CsharpObjectCaptureField[] | undefined };
  readonly objectMethods: { readonly get: (shape: CsharpObjectShapeFact) => readonly CsharpAuthoredObjectMethod[] | undefined };
}
