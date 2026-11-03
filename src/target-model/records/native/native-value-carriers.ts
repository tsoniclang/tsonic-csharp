import type { Node, Type, TypePropertyInfo } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../types/model.js";
import type { CsharpSourceField, CsharpSourceStruct } from "../program/source-markers.js";
import type { CsharpProjectTypeIssue } from "../types/project-types.js";

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

export interface CsharpDeclaredObjectReceiverSource {
  readonly self: { readonly kind: "object-occurrence"; readonly declaration: Node; readonly identity: string };
  readonly queries: SourceFileSemantics;
  readonly type: Type;
  readonly members: readonly TypePropertyInfo[];
  readonly methods: readonly Node[];
}

export interface CsharpObjectMethodSource {
  readonly identity: string;
  readonly declaredReceiver: CsharpDeclaredObjectReceiverSource | undefined;
  captures(method: Node): readonly CsharpObjectMethodSourceCapture[] | undefined;
}

export interface CsharpObjectMethodSources {
  get(literal: Node): CsharpObjectMethodSource | undefined;
}
