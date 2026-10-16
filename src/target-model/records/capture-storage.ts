import type { CsharpObjectShapeFact, TargetTypeRef } from "../types/model.js";
import type { CsharpStorageIssue } from "./storage.js";
import type { SourceLexicalValueCreation } from "@tsonic/target-api/source";
import type { Node } from "@tsonic/tsts";

export type CsharpLambdaCreation =
  | { readonly kind: "discarded"; readonly staticBody: true }
  | { readonly kind: "cached"; readonly staticBody: true }
  | { readonly kind: "quotation"; readonly staticBody: false }
  | { readonly kind: "inline" | "direct" | "fresh"; readonly staticBody: boolean };

export interface CsharpCaptureFrame {
  readonly scope: Node;
  readonly ownership: "activation" | "value";
  readonly shape: CsharpObjectShapeFact;
  readonly bindings: readonly { readonly declaration: Node; readonly fieldName: string; readonly type: TargetTypeRef;
    readonly initialization?: "deferred" }[];
  readonly parents: readonly { readonly frame: CsharpCaptureFrame; readonly fieldName: string }[];
  readonly methods: readonly CsharpFrameClosure[];
  readonly receivers: readonly { readonly owner: Node; readonly references: readonly Node[]; readonly type: TargetTypeRef; readonly fieldName: string }[];
}

export interface CsharpCapturedBinding {
  readonly frame: CsharpCaptureFrame;
  readonly fieldName: string;
}

export interface CsharpCaptureStorage {
  readonly issues: readonly CsharpStorageIssue[];
  readonly frames: readonly CsharpCaptureFrame[];
  readonly lexicalCaptures: readonly {
    readonly owner: Node;
    readonly values: readonly { readonly declaration: Node; readonly type: TargetTypeRef | undefined }[];
    readonly receivers: readonly { readonly owner: Node; readonly type: TargetTypeRef | undefined }[];
  }[];
  readonly captureFrame: { readonly get: (scope: Node) => CsharpCaptureFrame | undefined };
  readonly capturedBinding: { readonly get: (declaration: Node) => CsharpCapturedBinding | undefined };
  readonly physicalStorageType: { readonly get: (declaration: Node, logicalType: TargetTypeRef) => TargetTypeRef };
  readonly captureClosure: { readonly get: (declaration: Node) => { readonly frame: CsharpCaptureFrame; readonly method: CsharpFrameClosure } | undefined };
  readonly namedSelf: { readonly get: (declaration: Node) => CsharpNamedSelfBinding | undefined };
  readonly lambdaCreation: { readonly get: (declaration: Node) => CsharpLambdaCreation };
  readonly helperAccess: { readonly get: (declaration: Node) => boolean };
  readonly captureFrameShape: { readonly get: (type: TargetTypeRef) => CsharpCaptureFrame | undefined };
  readonly lexicalValueDeclarations: { readonly get: (statement: Node) => readonly Node[] };
  readonly lexicalValueCreation: { readonly get: (declaration: Node) => SourceLexicalValueCreation | undefined };
  readonly lexicalValueName: { readonly get: (declaration: Node) => string | undefined };
}

export interface CsharpFrameClosure {
  readonly declaration: Node;
  readonly scope: Node;
  readonly methodName: string;
  readonly type: TargetTypeRef;
  readonly captures: readonly Node[];
  readonly receivers: readonly { readonly owner: Node; readonly references: readonly Node[]; readonly type: TargetTypeRef }[];
}

export interface CsharpNamedSelfBinding {
  readonly declaration: Node;
  readonly calls: readonly Node[];
  readonly values: readonly Node[];
  readonly captures: readonly Node[];
  readonly capturesReceiver: boolean;
}
