import type { Node } from "@tsonic/tsts";
import type { CsharpArrayBindingCarrier } from "../types/carriers/binding-array-carrier.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../types/model.js";
import type { CsharpConversionSelection } from "../conversions/selection.js";

export type CsharpBindingPatternSource =
  | {
      readonly kind: "array-source";
      readonly sourceCarrier: TargetTypeRef;
      readonly bindingCarrier: CsharpArrayBindingCarrier;
    }
  | { readonly kind: "object-shape-source"; readonly shape: CsharpObjectShapeFact }
  | { readonly kind: "source-owned-source" };

export type CsharpTupleDefaultUse =
  | { readonly kind: "planned"; readonly carrier: TargetTypeRef }
  | { readonly kind: "unused" };

export type CsharpBindingElementProjection =
  | {
      readonly kind: "array-element";
      readonly index: number;
      readonly elementCarrier?: TargetTypeRef;
      readonly tupleDefault?: CsharpTupleDefaultUse;
    }
  | { readonly kind: "array-rest"; readonly start: number; readonly restCarrier: TargetTypeRef }
  | { readonly kind: "tuple-rest"; readonly start: number; readonly restCarrier: Extract<TargetTypeRef, { readonly kind: "tuple" }> }
  | { readonly kind: "object-shape-member"; readonly member: CsharpObjectShapeMemberFact }
  | { readonly kind: "object-shape-absence"; readonly carrier: TargetTypeRef }
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

export type CsharpDestructuringAssignmentPattern =
  | {
      readonly kind: "array";
      readonly sourceNode: Node;
      readonly elements: readonly (CsharpDestructuringAssignmentArrayElement | undefined)[];
    }
  | {
      readonly kind: "object";
      readonly sourceNode: Node;
      readonly elements: readonly CsharpDestructuringAssignmentObjectElement[];
    };

export type CsharpDestructuringAssignmentTarget =
  | { readonly kind: "node"; readonly node: Node }
  | { readonly kind: "pattern"; readonly pattern: CsharpDestructuringAssignmentPattern };

export interface CsharpDestructuringAssignmentArrayElement {
  readonly kind: "array-element";
  readonly sourceNode: Node;
  readonly target: CsharpDestructuringAssignmentTarget;
  readonly initializer?: Node;
  readonly rest: boolean;
}

export type CsharpDestructuringAssignmentObjectElement =
  | {
      readonly kind: "object-property";
      readonly sourceNode: Node;
      readonly propertyName?: Node;
      readonly target: CsharpDestructuringAssignmentTarget;
      readonly initializer?: Node;
    }
  | {
      readonly kind: "object-rest";
      readonly sourceNode: Node;
      readonly target: CsharpDestructuringAssignmentTarget;
    };

export interface CsharpBindingProjectionFact {
  readonly source?: CsharpBindingPatternSource;
  readonly element?: CsharpBindingElementProjection;
  readonly assignmentPattern?: CsharpDestructuringAssignmentPattern;
  readonly defaultValue?: CsharpDefaultValueContract;
  readonly binding?: {
    readonly node: Node;
    readonly source: TargetTypeRef;
    readonly target: TargetTypeRef;
    readonly conversion: CsharpConversionSelection;
  };
}

export interface CsharpDefaultValueContract {
  readonly kind: "value" | "absence" | "coalesce" | "guarded";
  readonly source: TargetTypeRef;
  readonly storage: TargetTypeRef;
  readonly present: TargetTypeRef;
  readonly guardType: TargetTypeRef;
  readonly target: TargetTypeRef;
  readonly normalize: boolean;
  readonly optional: boolean;
  readonly retainStorage: boolean;
  readonly presence: boolean;
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
}
