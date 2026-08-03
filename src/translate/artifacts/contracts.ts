import type {
  TargetArtifactContract,
  TargetArtifactDependency,
} from "@tsonic/target-api";
import type {
  CsharpObjectShapeFact,
  TargetTypeRef,
} from "../../policy/types/index.js";
import {
  targetTypeRefKey,
} from "../../policy/types/index.js";

export type CsharpArtifactFacet =
  | "generated-helper-surface"
  | "object-shape-materialization"
  | "object-shape-serialization"
  | "object-shape-type-surface"
  | "source-file-implementation"
  | "source-file-public-surface"
  | "storage-representation";

export interface CsharpArtifactContractCandidate {
  readonly owner: string;
  readonly contract: TargetArtifactContract<CsharpArtifactFacet>;
  readonly dependencies: readonly TargetArtifactDependency<CsharpArtifactFacet>[];
}

export function csharpGeneratedHelperContractCandidate(
  helper: string,
): CsharpArtifactContractCandidate {
  return {
    owner: `generated-helper:${helper}`,
    contract: {
      facets: [{
        facet: "generated-helper-surface",
        value: encodeContractParts(["generated-helper", helper]),
      }],
    },
    dependencies: Object.freeze([]),
  };
}

export function csharpObjectShapeContractCandidate(
  owner: string,
  fact: CsharpObjectShapeFact,
  materialization: "source" | "synthetic",
  jsonSerializable: boolean,
  dependencies: readonly string[],
): CsharpArtifactContractCandidate {
  return {
    owner,
    contract: {
      facets: [
        {
          facet: "object-shape-materialization",
          value: materialization,
        },
        {
          facet: "object-shape-serialization",
          value: jsonSerializable ? "json-serializable" : "plain",
        },
        {
          facet: "object-shape-type-surface",
          value: csharpObjectShapeTypeSurface(fact),
        },
      ],
    },
    dependencies: Object.freeze(dependencies.flatMap((dependency) => [
      {
        owner: dependency,
        facet: "object-shape-type-surface" as const,
      },
      ...(jsonSerializable
        ? [{
            owner: dependency,
            facet: "object-shape-serialization" as const,
          }]
        : []),
    ])),
  };
}

export function csharpObjectShapeTypeSurface(
  fact: CsharpObjectShapeFact,
): string {
  return encodeContractParts([
    "object-shape",
    targetTypeRefKey(fact.targetType),
    fact.constructible === undefined
      ? "constructibility-unspecified"
      : fact.constructible
      ? "constructible"
      : "non-constructible",
    ...fact.implements?.map((type) =>
      encodeContractParts(["implements", targetTypeRefKey(type)])
    ) ?? [],
    ...fact.members.map((member) => encodeContractParts([
      "member",
      member.sourceName,
      member.targetName,
      member.memberKind,
      member.optional === true ? "optional" : "required",
      member.readonly === true ? "readonly" : "mutable",
      targetTypeRefKey(member.type),
    ])),
  ]);
}

export function csharpStorageContractCandidate(
  owner: string,
  targetType: TargetTypeRef | undefined,
  nullableWrittenType: TargetTypeRef | undefined,
): CsharpArtifactContractCandidate {
  return {
    owner,
    contract: {
      facets: [{
        facet: "storage-representation",
        value: encodeContractParts([
          "storage",
          targetType === undefined
            ? "source-representation"
            : targetTypeRefKey(targetType),
          nullableWrittenType === undefined
            ? "non-null-output"
            : `nullable-output:${targetTypeRefKey(nullableWrittenType)}`,
        ]),
      }],
    },
    dependencies: Object.freeze([]),
  };
}

export function encodeContractParts(parts: readonly string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join("");
}
