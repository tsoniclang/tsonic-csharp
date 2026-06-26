import type {
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
  readonly createMembers: (
    policy: CsharpJsCollectionTypePolicy,
    declaringType: TargetTypeRef,
    typeArguments: readonly TargetTypeRef[],
  ) => readonly JsSurfaceTargetMemberMetadata[];
}
