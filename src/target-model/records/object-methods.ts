import type { Node } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../types/model.js";

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
}

export interface CsharpObjectMethodRecords {
  readonly objectCaptures: { readonly get: (shape: CsharpObjectShapeFact) => readonly CsharpObjectCaptureField[] | undefined };
  readonly objectMethods: { readonly get: (shape: CsharpObjectShapeFact) => readonly CsharpAuthoredObjectMethod[] | undefined };
}
