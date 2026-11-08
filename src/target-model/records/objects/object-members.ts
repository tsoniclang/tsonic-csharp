import type { TargetTypeRef, CsharpExplicitImplementationConstraint } from "../../types/native-type-data.js";
import type { CsharpDelegateSignatureShape, CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpObjectShapeMethod } from "../../types/model.js";
import type { CsharpNativeMemoryLayout } from "../../operations/native-memory.js";

export interface CsharpObjectMethodSignature {
  readonly receiver: CsharpDelegateSignatureShape["receiver"];
  readonly returnType: TargetTypeRef;
  readonly returnPassing: CsharpDelegateSignatureShape["returnPassing"];
  readonly returnsVoid: boolean;
  readonly parameters: readonly { readonly type: TargetTypeRef; readonly passingMode: CsharpDelegateSignatureShape["parameterPassingModes"][number];
    readonly rest: boolean; readonly optional: boolean }[];
}

export interface CsharpObjectMethodEmission extends CsharpObjectShapeMethod {
  readonly signature: CsharpObjectMethodSignature;
  readonly explicitConstraints: readonly CsharpExplicitImplementationConstraint[];
}

export type CsharpAuthoredObjectMethodValue =
  | { readonly kind: "fixed" }
  | { readonly kind: "stored"; readonly type: TargetTypeRef; readonly name: string; readonly valueName: string };

export type CsharpObjectMemberDeclaration =
  | { readonly kind: "authored"; readonly bodyName: string; readonly methods: readonly CsharpObjectMethodEmission[];
      readonly value: CsharpAuthoredObjectMethodValue }
  | { readonly kind: "copied"; readonly methods: readonly CsharpObjectMethodEmission[]; readonly storage: TargetTypeRef }
  | { readonly kind: "optional-method"; readonly type: TargetTypeRef; readonly methods: readonly CsharpObjectMethodEmission[] }
  | { readonly kind: "deferred"; readonly type: TargetTypeRef }
  | { readonly kind: "method"; readonly methods: readonly CsharpObjectMethodEmission[]; readonly storage: TargetTypeRef }
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
