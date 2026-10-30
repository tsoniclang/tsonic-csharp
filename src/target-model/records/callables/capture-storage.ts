import type { CsharpObjectShapeFact, TargetTypeRef } from "../../types/model.js";
import type { CsharpStorageIssue } from "../storage/storage.js";
import type { Node } from "@tsonic/tsts";

export interface CsharpOriginalCapturedPlace {
  readonly declaration: Node;
  readonly scope: Node;
  readonly type: TargetTypeRef;
  readonly references: readonly Node[];
  readonly mutable: boolean;
  readonly initialization: "initialized" | "deferred";
}

export interface CsharpNativeClosureCapture {
  readonly owner: Node;
  readonly type: TargetTypeRef;
  readonly values: readonly CsharpOriginalCapturedPlace[];
  readonly receivers: readonly { readonly owner: Node; readonly references: readonly Node[]; readonly type: TargetTypeRef }[];
}

export interface CsharpCaptureProtocol {
  readonly kind: "class" | "method" | "quantified";
  readonly declaration: Node;
}

export interface CsharpCaptureFrame {
  readonly scope: Node;
  readonly protocols: readonly CsharpCaptureProtocol[];
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

export interface CsharpConstructorCaptureProtocol {
  readonly declaration: Node;
  readonly owner: Node;
  readonly scope: Node;
  readonly places: readonly CsharpOriginalCapturedPlace[];
  readonly frame: CsharpCaptureFrame;
}

export interface CsharpCaptureStorage {
  readonly issues: readonly CsharpStorageIssue[];
  readonly frames: readonly CsharpCaptureFrame[];
  readonly lexicalCaptures: readonly CsharpNativeClosureCapture[];
  readonly capturedPlace: { readonly get: (declaration: Node) => CsharpOriginalCapturedPlace | undefined };
  readonly constructorCapture: { readonly get: (constructor: Node) => CsharpConstructorCaptureProtocol | undefined };
  readonly captureFrame: { readonly get: (scope: Node) => CsharpCaptureFrame | undefined };
  readonly capturedBinding: { readonly get: (declaration: Node) => CsharpCapturedBinding | undefined };
  readonly physicalStorageType: { readonly get: (declaration: Node, logicalType: TargetTypeRef) => TargetTypeRef };
  readonly captureClosure: { readonly get: (declaration: Node) => CsharpCaptureClosure | undefined };
  readonly namedSelf: { readonly get: (declaration: Node) => CsharpNamedSelfBinding | undefined };
  readonly helperAccess: { readonly get: (declaration: Node) => boolean };
  readonly captureFrameShape: { readonly get: (type: TargetTypeRef) => CsharpCaptureFrame | undefined };
  readonly lexicalValueDeclarations: { readonly get: (statement: Node) => readonly Node[] };
}

export interface CsharpFrameClosure {
  readonly declaration: Node;
  readonly scope: Node;
  readonly methodName: string;
  readonly type: TargetTypeRef;
  readonly captures: readonly Node[];
  readonly receivers: readonly { readonly owner: Node; readonly references: readonly Node[]; readonly type: TargetTypeRef }[];
}

export interface CsharpCaptureClosure {
  readonly frame: CsharpCaptureFrame;
  readonly method: CsharpFrameClosure;
}

export interface CsharpNamedSelfBinding {
  readonly declaration: Node;
  readonly calls: readonly Node[];
  readonly values: readonly Node[];
  readonly captures: readonly Node[];
  readonly capturesReceiver: boolean;
}

export interface CsharpCaptureStoragePublication {
  readonly issues: readonly CsharpStorageIssue[];
  readonly frames: readonly CsharpCaptureFrame[];
  readonly lexicalCaptures: CsharpCaptureStorage["lexicalCaptures"];
  readonly byScope: ReadonlyMap<Node, CsharpCaptureFrame>;
  readonly byBinding: ReadonlyMap<Node, CsharpCapturedBinding>;
  readonly byClosure: ReadonlyMap<Node, CsharpCaptureClosure>;
  readonly byShape: ReadonlyMap<string, CsharpCaptureFrame>;
  readonly physicalTypes: Pick<WeakMap<Node, TargetTypeRef | null>, "get">;
  readonly namedSelfBindings: ReadonlyMap<Node, CsharpNamedSelfBinding>;
  readonly helperMembers: ReadonlySet<Node>;
  readonly lexicalDeclarations: ReadonlySet<Node>;
  readonly constructorCaptures: ReadonlyMap<Node, CsharpConstructorCaptureProtocol>;
}
