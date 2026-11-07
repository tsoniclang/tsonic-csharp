import type { CsharpObjectShapeFact, CsharpPropertyKeyIterationPolicy, CsharpStringIterationPolicy, CsharpTargetMember, TargetTypeRef } from "../../types/model.js";
import type { Node } from "@tsonic/tsts";
import type { SourceIterationSelection } from "@tsonic/target-api/source";
import type { CsharpConversionSelection } from "../../conversions/selection.js";

export type CsharpForInKeyBinding = {
  readonly node: Node;
  readonly name: Node;
  readonly declaration: Node;
  readonly storageType: TargetTypeRef;
  readonly conversion: CsharpConversionSelection;
} & (
  | { readonly kind: "assignment" }
  | { readonly kind: "declaration"; readonly declarationKind: "var" | "let" | "const" }
);

export type CsharpForOfBinding = {
  readonly node: Node;
  readonly declaration: Node;
  readonly storageType: TargetTypeRef;
  readonly conversion: CsharpConversionSelection;
} & (
  | { readonly kind: "assignment"; readonly name: Node }
  | { readonly kind: "declaration"; readonly name: Node;
      readonly declarationKind: "var" | "let" | "const" | "using" | "await using" }
  | { readonly kind: "pattern"; readonly pattern: Node;
      readonly declarationKind: "var" | "let" | "const" | "using" | "await using" }
);

export type CsharpAdmittedIteration =
  | (Exclude<CsharpResolvedIteration, { readonly iterationKind: "for-in" }> & {
      readonly binding: CsharpForOfBinding;
    })
  | (Extract<CsharpResolvedIteration, { readonly iterationKind: "for-in" }> & {
      readonly binding: CsharpForInKeyBinding;
    });

/**
 * The Source side of a loop iteration. for-of / for-await-of carry the Host iteration selection
 * (facts.selections.iteration); for-in has none: its key type is the key binding's storage.
 */
export type CsharpLoopIterationSource =
  | { readonly kind: "for-of" | "for-await-of"; readonly statement: Node; readonly selection: SourceIterationSelection }
  | { readonly kind: "for-in"; readonly statement: Node };

export type CsharpResolvedIteration =
  | {
      readonly kind: "resolved";
      readonly iterationKind: "for-await-of";
      readonly source: Exclude<CsharpLoopIterationSource, { readonly kind: "for-in" }>;
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
      readonly source: Exclude<CsharpLoopIterationSource, { readonly kind: "for-in" }>;
      readonly iterableType: TargetTypeRef;
      readonly elementType: TargetTypeRef;
      readonly lowering: { readonly kind: "foreach" } | {
        readonly kind: "indexed";
        readonly lengthMemberName: string;
        readonly member: CsharpTargetMember;
      };
    }
  | {
      readonly kind: "resolved";
      readonly iterationKind: "for-of";
      readonly source: Exclude<CsharpLoopIterationSource, { readonly kind: "for-in" }>;
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
      readonly source: Extract<CsharpLoopIterationSource, { readonly kind: "for-in" }>;
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
      readonly source: Extract<CsharpLoopIterationSource, { readonly kind: "for-in" }>;
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
      readonly source: Extract<CsharpLoopIterationSource, { readonly kind: "for-in" }>;
      readonly iterableType: TargetTypeRef;
      readonly elementType: TargetTypeRef;
      readonly lowering: Extract<
        CsharpPropertyKeyIterationPolicy,
        { readonly kind: "key-collection" }
      >;
    };
