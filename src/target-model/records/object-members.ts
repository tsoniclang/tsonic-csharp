import type { CsharpDelegateSignatureShape, CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../types/model.js";
import type { CsharpNativeMemoryLayout } from "../operations/native-memory.js";
import type { CsharpExplicitImplementationConstraint } from "../types/generic-constraints.js";

export interface CsharpObjectMethodSignature {
  readonly returnType: TargetTypeRef;
  readonly returnPassing: CsharpDelegateSignatureShape["returnPassing"];
  readonly returnsVoid: boolean;
  readonly parameters: readonly { readonly type: TargetTypeRef; readonly passingMode: CsharpDelegateSignatureShape["parameterPassingModes"][number];
    readonly rest: boolean; readonly optional: boolean }[];
}

export type CsharpAuthoredObjectMethodValue =
  | { readonly kind: "fixed" }
  | { readonly kind: "delegate"; readonly type: TargetTypeRef; readonly name: string; readonly valueName: string }
  | { readonly kind: "protocol"; readonly type: TargetTypeRef; readonly interface: TargetTypeRef;
      readonly name: string; readonly valueName: string; readonly invocationName: string; readonly initializedName: string | undefined };

export type CsharpObjectMemberDeclaration =
  | { readonly kind: "authored"; readonly bodyName: string; readonly signature: CsharpObjectMethodSignature;
      readonly value: CsharpAuthoredObjectMethodValue }
  | { readonly kind: "copied"; readonly signature: CsharpObjectMethodSignature; readonly storage: TargetTypeRef;
      readonly invocationName: string; readonly interface: TargetTypeRef; readonly bodyInvocationName: string;
      readonly explicitConstraints: readonly CsharpExplicitImplementationConstraint[] }
  | { readonly kind: "optional-method"; readonly type: TargetTypeRef }
  | { readonly kind: "deferred"; readonly type: TargetTypeRef }
  | { readonly kind: "method"; readonly signature: CsharpObjectMethodSignature; readonly storage: TargetTypeRef }
  | { readonly kind: "accessor"; readonly type: TargetTypeRef; readonly getter: TargetTypeRef; readonly setter: TargetTypeRef | undefined }
  | { readonly kind: "bound"; readonly type: TargetTypeRef; readonly storage: TargetTypeRef }
  | { readonly kind: "native-backing"; readonly type: TargetTypeRef; readonly location: TargetTypeRef; readonly name: string; readonly layout: CsharpNativeMemoryLayout }
  | { readonly kind: "property" | "field"; readonly type: TargetTypeRef; readonly required: boolean };

export interface CsharpObjectMemberEmission {
  readonly member: CsharpObjectShapeMemberFact;
  readonly receiverBound: boolean;
  readonly methodStorage: TargetTypeRef | undefined;
  readonly boundStorage: TargetTypeRef | undefined;
  readonly declaration: CsharpObjectMemberDeclaration;
}

export interface CsharpObjectMemberRecords {
  readonly objectMember: { readonly get: (shape: CsharpObjectShapeFact, member: CsharpObjectShapeMemberFact) => CsharpObjectMemberEmission | undefined };
  readonly objectMemberDeclarations: { readonly get: (shape: CsharpObjectShapeFact) => readonly CsharpObjectMemberEmission[] | undefined };
}
