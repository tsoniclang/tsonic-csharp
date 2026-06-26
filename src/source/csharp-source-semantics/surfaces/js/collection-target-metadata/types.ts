import type {
  TargetParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetNamedTypeRef,
} from "../source-library.js";
import type {
  JsSurfaceTargetMemberMetadata,
} from "../target-member-metadata.js";

export type CsharpJsMapTargetTypeRef = CsharpTargetNamedTypeRef & {
  readonly csharpJsSurfaceKind: "map";
};

export type CsharpJsSetTargetTypeRef = CsharpTargetNamedTypeRef & {
  readonly csharpJsSurfaceKind: "set";
};

export interface CsharpJsCollectionTypePolicy {
  readonly sourceNames: readonly string[];
  readonly targetName: "Map" | "Set";
  readonly typeParameterNames: readonly string[];
  readonly createOpenType: () => TargetTypeRef;
  readonly createClosedType: (typeArguments: readonly TargetTypeRef[]) => TargetTypeRef | undefined;
  readonly isTargetType: (type: TargetTypeRef | undefined) => boolean;
  readonly getIterableElementType: (typeArguments: readonly TargetTypeRef[]) => TargetTypeRef | undefined;
  readonly members: readonly CsharpJsCollectionMemberPolicy[];
}

export interface CsharpJsCollectionMemberPolicy {
  readonly sourceName: string;
  readonly members: readonly CsharpJsCollectionMemberShape[];
}

export interface CsharpJsCollectionMemberShape {
  readonly kind: JsSurfaceTargetMemberMetadata["kind"];
  readonly id?: string;
  readonly targetName?: string;
  readonly parameters?: readonly CsharpJsCollectionParameterShape[];
  readonly returnType: CsharpJsCollectionTypeExpression;
}

export interface CsharpJsCollectionParameterShape {
  readonly name: string;
  readonly type: CsharpJsCollectionTypeExpression;
}

export type CsharpJsCollectionTypeExpression =
  | { readonly kind: "declaring" }
  | { readonly kind: "type-argument"; readonly index: number }
  | { readonly kind: "tuple"; readonly elements: readonly CsharpJsCollectionTypeExpression[] }
  | { readonly kind: "enumerable"; readonly element: CsharpJsCollectionTypeExpression }
  | { readonly kind: "nullable"; readonly value: CsharpJsCollectionTypeExpression }
  | { readonly kind: "primitive"; readonly name: "bool" | "int32" }
  | { readonly kind: "void" }
  | { readonly kind: "delegate"; readonly id: "System.Action"; readonly typeArguments: readonly CsharpJsCollectionTypeExpression[] };

export interface CsharpJsCollectionMemberResolutionInput {
  readonly policy: CsharpJsCollectionTypePolicy;
  readonly memberPolicy: CsharpJsCollectionMemberPolicy;
  readonly declaringType: TargetTypeRef;
  readonly typeArguments: readonly TargetTypeRef[];
}

export interface CsharpJsResolvedCollectionParameter {
  readonly parameter: TargetParameter;
}
