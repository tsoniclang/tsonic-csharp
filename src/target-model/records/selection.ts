import type { CsharpObjectShapeFact, CsharpPropertyKeyIterationPolicy, CsharpStringIterationPolicy, TargetTypeRef } from "../types/model.js";
import type { Node, ResolvedSourceIterationInfo } from "@tsonic/tsts";
import type { CsharpConversionSelection } from "../conversions/selection.js";

export type CsharpResolvedIteration =
  | {
      readonly kind: "resolved";
      readonly iterationKind: "for-await-of";
      readonly source: Extract<
        ResolvedSourceIterationInfo,
        { readonly iterationKind: "for-await-of" }
      >;
      readonly iterableType: TargetTypeRef;
      readonly elementType: TargetTypeRef;
      readonly lowering: {
        readonly kind: "await-foreach" | "await-foreach-sync-adapter";
      } | {
        readonly kind: "string-code-point";
        readonly policy: CsharpStringIterationPolicy;
      };
    }
  | {
      readonly kind: "resolved";
      readonly iterationKind: "for-of";
      readonly source: Extract<
        ResolvedSourceIterationInfo,
        { readonly iterationKind: "for-of" }
      >;
      readonly iterableType: TargetTypeRef;
      readonly elementType: TargetTypeRef;
      readonly lowering: { readonly kind: "foreach" };
    }
  | {
      readonly kind: "resolved";
      readonly iterationKind: "for-of";
      readonly source: Extract<
        ResolvedSourceIterationInfo,
        { readonly iterationKind: "for-of" }
      >;
      readonly iterableType: TargetTypeRef;
      readonly elementType: TargetTypeRef;
      readonly lowering: {
        readonly kind: "string-code-point";
        readonly policy: CsharpStringIterationPolicy;
      };
    }
  | {
      readonly kind: "resolved";
      readonly iterationKind: "for-in";
      readonly source: Extract<
        ResolvedSourceIterationInfo,
        { readonly iterationKind: "for-in" }
      >;
      readonly iterableType: TargetTypeRef;
      readonly elementType: TargetTypeRef;
      readonly lowering: {
        readonly kind: "object-shape-keys";
        readonly objectShape: CsharpObjectShapeFact;
      };
    }
  | {
      readonly kind: "resolved";
      readonly iterationKind: "for-in";
      readonly source: Extract<
        ResolvedSourceIterationInfo,
        { readonly iterationKind: "for-in" }
      >;
      readonly iterableType: TargetTypeRef;
      readonly elementType: TargetTypeRef;
      readonly lowering: Extract<
        CsharpPropertyKeyIterationPolicy,
        { readonly kind: "index" }
      >;
    }
  | {
      readonly kind: "resolved";
      readonly iterationKind: "for-in";
      readonly source: Extract<
        ResolvedSourceIterationInfo,
        { readonly iterationKind: "for-in" }
      >;
      readonly iterableType: TargetTypeRef;
      readonly elementType: TargetTypeRef;
      readonly lowering: Extract<
        CsharpPropertyKeyIterationPolicy,
        { readonly kind: "key-collection" }
      >;
    };

interface CsharpForInKeyBindingData {
  readonly node: Node;
  readonly name: Node;
  readonly declaration: Node;
  readonly storageType: TargetTypeRef;
  readonly conversion: CsharpConversionSelection;
}

export type CsharpForInKeyBinding =
  | CsharpForInKeyBindingData & {
      readonly kind: "declaration";
      readonly declarationKind: "var" | "let" | "const";
    }
  | CsharpForInKeyBindingData & { readonly kind: "assignment" };

export type CsharpAdmittedIteration =
  | Exclude<CsharpResolvedIteration, { readonly iterationKind: "for-in" }>
  | Extract<CsharpResolvedIteration, { readonly iterationKind: "for-in" }> & {
      readonly binding: CsharpForInKeyBinding;
    };
