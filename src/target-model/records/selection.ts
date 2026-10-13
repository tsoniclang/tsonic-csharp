import type { CsharpObjectShapeFact, CsharpPropertyKeyIterationPolicy, CsharpStringIterationPolicy, TargetTypeRef } from "../types/model.js";
import type { ResolvedSourceIterationInfo } from "@tsonic/tsts";

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
