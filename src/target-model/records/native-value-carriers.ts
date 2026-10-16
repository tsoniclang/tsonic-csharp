import type { Node } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../types/model.js";
import type { CsharpSourceField, CsharpSourceStruct } from "./source-markers.js";
import type { CsharpProjectTypeIssue } from "./project-types.js";

export interface CsharpNativeValueField {
  readonly source: CsharpSourceField;
  readonly carrier: TargetTypeRef;
  readonly bound?: {
    readonly owner: CsharpObjectShapeFact;
    readonly member: CsharpObjectShapeMemberFact;
  };
}

export interface CsharpNativeValueDeclaration {
  readonly source: CsharpSourceStruct;
  readonly fields: readonly CsharpNativeValueField[];
}

export interface CsharpNativeValueCarriers {
  readonly issues: readonly CsharpProjectTypeIssue[];
  readonly nativeValueDeclaration: {
    get(declaration: Node): CsharpNativeValueDeclaration | undefined;
  };
}

export interface CsharpObjectMethodSourceCapture {
  readonly declaration: Node;
  readonly reference: Node;
  readonly mutable: boolean;
}

export interface CsharpObjectMethodSource {
  readonly identity: string;
  captures(method: Node): readonly CsharpObjectMethodSourceCapture[] | undefined;
}

export interface CsharpObjectMethodSources {
  get(literal: Node): CsharpObjectMethodSource | undefined;
}
