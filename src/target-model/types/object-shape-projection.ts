import { createHash } from "node:crypto";
import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeProjection,
} from "./model.js";
import { targetTypeRefKey } from "./equality.js";
import {
  resolveCsharpObjectShapeMemberBySourceContract,
} from "./object-shape-members.js";

const projectionPrefix = "__tsonicObject";

export function csharpObjectShapeProjectionMethodName(
  projection: CsharpObjectShapeProjection,
): string {
  const operation = projection.kind === "has-own"
    ? "HasOwn"
    : projection.kind === "assign"
    ? "Assign"
    : `${projection.kind[0]!.toUpperCase()}${projection.kind.slice(1)}`;
  const identity = createHash("sha256")
    .update(JSON.stringify([
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
    ]))
    .digest("hex")
    .slice(0, 12);
  return `${projectionPrefix}${operation}_${identity}`;
}

export function csharpObjectShapeProjectionMembers(
  fact: CsharpObjectShapeFact,
  projection: CsharpObjectShapeProjection,
): readonly CsharpObjectShapeFact["members"][number][] | undefined {
  if (projection.kind === "assign") {
    return undefined;
  }
  const stringMembers = fact.members.filter((member) =>
    member.sourceKey.kind === "property"
  );
  if (
    projection.propertyOrder.length !== stringMembers.length ||
    new Set(projection.propertyOrder).size !== projection.propertyOrder.length ||
    new Set(stringMembers.map(member => member.sourceName)).size !== stringMembers.length
  ) {
    return undefined;
  }
  const members = projection.propertyOrder.map((sourceName) => {
    const selected = resolveCsharpObjectShapeMemberBySourceContract(
      fact,
      sourceName,
      "finalized-object-spread-member",
    );
    return selected.kind === "resolved" ? selected.member : undefined;
  });
  return members.some((member) => member === undefined)
    ? undefined
    : members as readonly CsharpObjectShapeFact["members"][number][];
}

export function csharpObjectShapeAssignmentMembers(
  fact: CsharpObjectShapeFact,
  projection: Extract<CsharpObjectShapeProjection, { readonly kind: "assign" }>,
): readonly {
  readonly source: CsharpObjectShapeFact["members"][number];
  readonly target: CsharpObjectShapeFact["members"][number];
}[] | undefined {
  if (
    projection.assignments.length !== projection.propertyOrder.length ||
    new Set(projection.propertyOrder).size !== projection.propertyOrder.length ||
    projection.assignments.some((assignment, index) =>
      assignment.sourceName !== projection.propertyOrder[index]
    )
  ) {
    return undefined;
  }
  const pairs = projection.assignments.map((assignment) => {
    const source = resolveCsharpObjectShapeMemberBySourceContract(
      projection.sourceShape,
      assignment.sourceName,
      "finalized-object-spread-member",
    );
    const target = resolveCsharpObjectShapeMemberBySourceContract(
      fact,
      assignment.targetName,
      "finalized-object-spread-member",
    );
    return source.kind === "resolved" && target.kind === "resolved"
      ? { source: source.member, target: target.member }
      : undefined;
  });
  return pairs.some((pair) => pair === undefined)
    ? undefined
    : pairs as readonly {
        readonly source: CsharpObjectShapeFact["members"][number];
        readonly target: CsharpObjectShapeFact["members"][number];
      }[];
}

export function isSourceDeclaredNominalShape(fact: CsharpObjectShapeFact): boolean {
  return fact.targetType.kind === "target-named" &&
    (fact.targetType as {
      readonly csharpSourceDeclarationKind?: unknown;
    }).csharpSourceDeclarationKind !== undefined;
}

export function isCsharpObjectShapeGeneratedMemberName(name: string): boolean {
  return name.startsWith(projectionPrefix);
}
