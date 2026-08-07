import type {
  TargetArtifactContract,
  TargetArtifactDependency,
} from "@tsonic/target-api";
import type {
  CsharpObjectShapeFact,
  CsharpSourceCallableContract,
  TargetTypeRef,
} from "../../policy/types/index.js";
import {
  canonicalCsharpObjectShapeImplementedTypes,
  canonicalCsharpObjectShapeMembers,
  csharpObjectShapeMemberContractParts,
  targetTypeRefKey,
} from "../../policy/types/index.js";

export type CsharpArtifactFacet =
  | "generated-helper-surface"
  | "object-shape-materialization"
  | "object-shape-serialization"
  | "object-shape-type-surface"
  | "source-file-implementation"
  | "source-file-public-surface"
  | "source-callable-surface"
  | "storage-representation";

export type CsharpArtifactSnapshot =
  | {
      readonly kind: "generated-helper";
      readonly helper: string;
    }
  | {
      readonly kind: "object-shape";
      readonly fact: CsharpObjectShapeFact;
      readonly materialization: "source" | "synthetic";
      readonly jsonSerializable: boolean;
    }
  | {
      readonly kind: "source-callable";
      readonly callable: CsharpSourceCallableContract;
    }
  | {
      readonly kind: "source-file";
      readonly owner: string;
    }
  | {
      readonly kind: "storage";
      readonly targetType?: TargetTypeRef;
      readonly nullableWrittenType?: TargetTypeRef;
      readonly typedLocationIdentity: boolean;
    };

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
    artifact: Object.freeze({
      kind: "object-shape",
      fact,
      materialization,
      jsonSerializable,
    }),
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
    ...canonicalCsharpObjectShapeImplementedTypes(fact.implements ?? []).map((type) =>
      encodeContractParts(["implements", targetTypeRefKey(type)])
    ),
    ...canonicalCsharpObjectShapeMembers(fact.members).map((member) => encodeContractParts([
      "member",
      ...csharpObjectShapeMemberContractParts(member),
    ])),
  ]);
}

export function csharpStorageContractCandidate(
  owner: string,
  targetType: TargetTypeRef | undefined,
  nullableWrittenType: TargetTypeRef | undefined,
  typedLocationIdentity: boolean,
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
          typedLocationIdentity
            ? "typed-location-identity"
            : "ordinary-storage-identity",
        ]),
      }],
    },
    dependencies: Object.freeze([]),
    artifact: Object.freeze({
      kind: "storage",
      ...(targetType === undefined ? {} : { targetType }),
      ...(nullableWrittenType === undefined
        ? {}
        : { nullableWrittenType }),
      typedLocationIdentity,
    }),
  };
}

export function csharpSourceCallableContractCandidate(
  owner: string,
  callable: CsharpSourceCallableContract,
): CsharpArtifactContractCandidate {
  return {
    owner,
    contract: {
      facets: [{
        facet: "source-callable-surface",
        value: encodeContractParts([
          "source-callable",
          ...callable.methodTypeParameterNames.map((name) =>
            encodeContractParts(["type-parameter", name])
          ),
          ...callable.parameters.map((parameter, index) =>
            encodeContractParts([
              "parameter",
              String(index),
              parameter.targetParameter.name,
              targetTypeRefKey(parameter.targetParameter.type),
              parameter.targetParameter.passingMode,
              parameter.targetParameter.optional === true
                ? "optional"
                : "required",
              parameter.targetParameter.paramsArray === true
                ? "params"
                : "ordinary",
            ])
          ),
          encodeContractParts([
            "return",
            targetTypeRefKey(callable.returnType),
          ]),
        ]),
      }],
    },
    dependencies: Object.freeze([]),
    artifact: Object.freeze({
      kind: "source-callable",
      callable,
    }),
  };
}

export function encodeContractParts(parts: readonly string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join("");
}
