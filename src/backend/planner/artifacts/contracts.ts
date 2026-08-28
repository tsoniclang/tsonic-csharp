import type {
  TargetArtifactContract,
  TargetArtifactDependency,
} from "@tsonic/target-api/artifacts";
import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeCapability,
  CsharpObjectShapeProjection,
} from "../../../target-model/types/index.js";
import {
  canonicalCsharpObjectShapeImplementedTypes,
  canonicalCsharpObjectShapeMembers,
  csharpObjectShapeMemberContractParts,
  targetTypeRefKey,
} from "../../../target-model/types/index.js";

export type CsharpArtifactFacet =
  | "generated-helper-surface"
  | "object-shape-behavior"
  | "object-shape-materialization"
  | "object-shape-type-surface"
  | "source-file-implementation"
  | "source-file-public-surface";

export type CsharpArtifactSnapshot =
  | {
      readonly kind: "generated-helper";
      readonly helper: string;
    }
  | {
      readonly kind: "object-shape";
      readonly fact: CsharpObjectShapeFact;
      readonly materialization: "source" | "synthetic";
      readonly capabilities: readonly CsharpObjectShapeCapability[];
      readonly projections: readonly CsharpObjectShapeProjection[];
      readonly receiverBoundMethodKeys: readonly string[];
    }
  | {
      readonly kind: "source-file";
      readonly owner: string;
    }
  ;

export interface CsharpArtifactContractCandidate {
  readonly owner: string;
  readonly contract: TargetArtifactContract<CsharpArtifactFacet>;
  readonly dependencies: readonly TargetArtifactDependency<CsharpArtifactFacet>[];
  readonly artifact: CsharpArtifactSnapshot;
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
    artifact: Object.freeze({
      kind: "generated-helper",
      helper,
    }),
  };
}

export function csharpObjectShapeContractCandidate(
  owner: string,
  fact: CsharpObjectShapeFact,
  materialization: "source" | "synthetic",
  capabilities: ReadonlySet<CsharpObjectShapeCapability> | readonly CsharpObjectShapeCapability[],
  projections: readonly CsharpObjectShapeProjection[],
  receiverBoundMethodKeys: ReadonlySet<string> | readonly string[],
  dependencies: readonly string[],
): CsharpArtifactContractCandidate {
  const canonicalCapabilities = Object.freeze(
    [...capabilities].sort(),
  );
  const canonicalProjections = Object.freeze(
    [...projections].sort((left, right) =>
      objectShapeProjectionKey(left).localeCompare(objectShapeProjectionKey(right))
    ),
  );
  const canonicalReceiverBoundMethodKeys = Object.freeze(
    [...receiverBoundMethodKeys].sort(),
  );
  return {
    owner,
    contract: {
      facets: [
        {
          facet: "object-shape-behavior",
          value: encodeContractParts([
            "object-shape-behavior",
            ...canonicalCapabilities,
            ...canonicalProjections.map((projection) =>
              encodeContractParts([
                "projection",
                ...objectShapeProjectionContractParts(projection),
              ])
            ),
          ]),
        },
        {
          facet: "object-shape-materialization",
          value: materialization,
        },
        {
          facet: "object-shape-type-surface",
          value: csharpObjectShapeTypeSurface(
            fact,
            canonicalReceiverBoundMethodKeys,
          ),
        },
      ],
    },
    dependencies: Object.freeze(dependencies.flatMap((dependency) => [
      {
        owner: dependency,
        facet: "object-shape-type-surface" as const,
      },
      ...(canonicalCapabilities.length > 0 || canonicalProjections.length > 0
        ? [{
            owner: dependency,
            facet: "object-shape-behavior" as const,
          }]
        : []),
    ])),
    artifact: Object.freeze({
      kind: "object-shape",
      fact,
      materialization,
      capabilities: canonicalCapabilities,
      projections: canonicalProjections,
      receiverBoundMethodKeys: canonicalReceiverBoundMethodKeys,
    }),
  };
}

export function objectShapeProjectionKey(
  projection: CsharpObjectShapeProjection,
): string {
  return encodeContractParts(objectShapeProjectionContractParts(projection));
}

function objectShapeProjectionContractParts(
  projection: CsharpObjectShapeProjection,
): readonly string[] {
  return [
    projection.kind,
    targetTypeRefKey(projection.resultType),
    ...projection.propertyOrder,
    ...(projection.kind === "assign"
      ? [
          targetTypeRefKey(projection.sourceShape.targetType),
          ...projection.assignments.flatMap((assignment) => [
            assignment.sourceName,
            assignment.targetName,
          ]),
        ]
      : []),
  ];
}

export function csharpObjectShapeTypeSurface(
  fact: CsharpObjectShapeFact,
  receiverBoundMethodKeys: readonly string[] = [],
): string {
  return encodeContractParts([
    "object-shape",
    targetTypeRefKey(fact.targetType),
    fact.constructible === undefined
      ? "constructibility-unspecified"
      : fact.constructible
      ? "constructible"
      : "non-constructible",
    ...canonicalCsharpObjectShapeImplementedTypes(fact.implements ?? []).map((type) =>
      encodeContractParts(["implements", targetTypeRefKey(type)])
    ),
    ...canonicalCsharpObjectShapeMembers(fact.members).map((member) => encodeContractParts([
      "member",
      ...csharpObjectShapeMemberContractParts(member),
    ])),
    ...[...receiverBoundMethodKeys].sort().map((memberKey) =>
      encodeContractParts(["receiver-bound-method", memberKey])
    ),
  ]);
}

export function encodeContractParts(parts: readonly string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join("");
}
