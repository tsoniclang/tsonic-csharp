import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../types/model.js";
import type { CsharpNativeMemoryLayout } from "../operations/native-memory.js";

export interface CsharpObjectMethodSignature {
  readonly returnType: TargetTypeRef;
  readonly returnsVoid: boolean;
  readonly parameters: readonly { readonly type: TargetTypeRef; readonly rest: boolean; readonly optional: boolean }[];
}

export type CsharpObjectMemberDeclaration =
  | { readonly kind: "authored" }
  | { readonly kind: "copied"; readonly signature: CsharpObjectMethodSignature; readonly storage: TargetTypeRef }
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
