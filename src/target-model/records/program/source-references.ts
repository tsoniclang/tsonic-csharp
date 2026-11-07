import type { Node } from "@tsonic/tsts";
import type { SourceDeclarationTarget } from "@tsonic/target-api/source";
import type { CsharpDelegateSignatureShape, TargetTypeRef } from "../../types/model.js";

export type CsharpIdentifierEmission =
  | { readonly kind: "frame"; readonly declaration: Node }
  | { readonly kind: "class"; readonly declaration: Node; readonly factory: boolean; readonly constructor: CsharpDelegateSignatureShape | undefined }
  | { readonly kind: "absence" }
  | { readonly kind: "provider"; readonly owner: TargetTypeRef; readonly name: string }
  | { readonly kind: "module"; readonly reference: SourceDeclarationTarget }
  | { readonly kind: "type"; readonly reference: SourceDeclarationTarget }
  | { readonly kind: "local"; readonly declaration: Node | undefined; readonly backing: boolean };

export interface CsharpSourceReferenceRecords {
  readonly identifierEmission: { readonly get: (node: Node) => CsharpIdentifierEmission | undefined };
  readonly sourceModuleReference: { readonly get: (node: Node) => SourceDeclarationTarget | undefined };
  readonly sourceReferenceIdentity: { readonly get: (node: Node) => { readonly value: SourceDeclarationTarget | undefined; readonly declaration: SourceDeclarationTarget | undefined } | undefined };
}
