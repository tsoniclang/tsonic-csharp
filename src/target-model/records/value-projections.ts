import type { Node } from "@tsonic/tsts";
import type { CsharpArrayBindingCarrier } from "../types/carriers/binding-array-carrier.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../types/model.js";

export type CsharpBindingPatternSource =
  | {
      readonly kind: "array-source";
      readonly sourceCarrier: TargetTypeRef;
      readonly bindingCarrier: CsharpArrayBindingCarrier;
    }
  | { readonly kind: "object-shape-source"; readonly shape: CsharpObjectShapeFact }
  | { readonly kind: "source-owned-source" };

export type CsharpBindingElementProjection =
  | { readonly kind: "array-element"; readonly index: number; readonly elementCarrier?: TargetTypeRef }
  | { readonly kind: "array-rest"; readonly start: number; readonly restCarrier: TargetTypeRef }
  | { readonly kind: "tuple-rest"; readonly start: number; readonly restCarrier: Extract<TargetTypeRef, { readonly kind: "tuple" }> }
  | { readonly kind: "object-shape-member"; readonly member: CsharpObjectShapeMemberFact }
  | {
      readonly kind: "object-shape-rest";
      readonly restShape: CsharpObjectShapeFact;
      readonly members: readonly {
        readonly rest: CsharpObjectShapeMemberFact;
        readonly source: CsharpObjectShapeMemberFact;
      }[];
    }
  | {
      readonly kind: "source-owned-member";
      readonly propertyName: string;
      readonly propertyNameKind: "identifier" | "string-literal";
    };

export interface CsharpBindingProjectionFact {
  readonly source?: CsharpBindingPatternSource;
  readonly element?: CsharpBindingElementProjection;
}

export interface CsharpBindingPatternIssue {
  readonly node: Node;
  readonly code: string;
  readonly message: string;
  readonly evidence: readonly string[];
}

export interface CsharpBindingPatternClassifications {
  readonly bindingPatternProjection: {
    readonly get: (node: Node) => CsharpBindingProjectionFact | undefined;
  };
  readonly issues: readonly CsharpBindingPatternIssue[];
}
