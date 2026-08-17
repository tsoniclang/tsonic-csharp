import { createHash } from "node:crypto";
import type {
  AstReader,
  Node,
} from "@tsonic/tsts";
import {
  orderEnumerableOwnStringProperties,
} from "@tsonic/target-api";
import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeProjectionKind,
  CsharpObjectShapeProjection,
  TargetTypeRef,
} from "./definitions.js";
import { targetTypeRefKey } from "./equality.js";

const projectionPrefix = "__tsonicObject";

export function csharpObjectShapeProjectionMethodName(
  projection: CsharpObjectShapeProjectionKind,
  resultType: TargetTypeRef,
  propertyOrder: readonly string[],
): string {
  const operation = projection === "has-own"
    ? "HasOwn"
    : `${projection[0]!.toUpperCase()}${projection.slice(1)}`;
  const identity = createHash("sha256")
    .update(JSON.stringify([
      projection,
      targetTypeRefKey(resultType),
      ...propertyOrder,
    ]))
    .digest("hex")
    .slice(0, 12);
  return `${projectionPrefix}${operation}_${identity}`;
}

export type CsharpObjectShapePropertyOrderSelection =
  | { readonly kind: "resolved"; readonly propertyOrder: readonly string[] }
  | { readonly kind: "rejected"; readonly reason: string };

export function selectCsharpObjectShapePropertyOrder(
  fact: CsharpObjectShapeFact,
  sourceValue: Node | undefined,
  projection: CsharpObjectShapeProjectionKind,
  ast: AstReader,
): CsharpObjectShapePropertyOrderSelection {
  if (isSourceDeclaredNominalShape(fact)) {
    return rejected(
      `Selected '${projection}' operation requires one exact generated structural object carrier; an open nominal source type cannot prove its runtime own-property set.`,
    );
  }
  if (fact.members.some((member) =>
    isCsharpObjectShapeGeneratedMemberName(member.targetName)
  )) {
    return rejected(
      `Selected '${projection}' operation conflicts with a reserved generated object-shape member name.`,
    );
  }
  if (projection === "has-own") {
    if (fact.members.some((member) => member.optional === true)) {
      return rejected(
        "Selected 'has-own' operation requires exact present-versus-absent storage for every optional property.",
      );
    }
    return {
      kind: "resolved",
      propertyOrder: Object.freeze(
        fact.members.map((member) => member.sourceName).sort(),
      ),
    };
  }
  if (fact.members.length === 0) {
    return sourceValue !== undefined && ast.is.IsObjectLiteralExpression(sourceValue) &&
        ast.properties(sourceValue).length === 0
      ? { kind: "resolved", propertyOrder: Object.freeze([]) }
      : rejected(
          `Selected '${projection}' operation has no exact authored empty-object occurrence.`,
        );
  }
  const selected = fact.members.map((member) => {
    const declarations = member.sourceDeclarations?.filter((declaration) => {
      const owner = ast.parent(declaration);
      return owner !== undefined && ast.is.IsObjectLiteralExpression(owner) && (
        ast.is.IsPropertyAssignment(declaration) ||
        ast.is.IsShorthandPropertyAssignment(declaration) ||
        ast.is.IsMethodDeclaration(declaration) ||
        ast.is.IsGetAccessorDeclaration(declaration) ||
        ast.is.IsSetAccessorDeclaration(declaration)
      );
    }) ?? [];
    const getters = declarations.filter((declaration) =>
      ast.is.IsGetAccessorDeclaration(declaration)
    );
    const setters = declarations.filter((declaration) =>
      ast.is.IsSetAccessorDeclaration(declaration)
    );
    const expectedDeclarationCount = member.accessor === undefined
      ? 1
      : member.accessor.setter
        ? 2
        : 1;
    if (declarations.length !== expectedDeclarationCount ||
      (member.accessor === undefined && (getters.length !== 0 || setters.length !== 0)) ||
      (member.accessor !== undefined && (
        getters.length !== 1 || setters.length !== (member.accessor.setter ? 1 : 0)
      ))) {
      return undefined;
    }
    const owner = ast.parent(declarations[0]!);
    const ranges = declarations.map((declaration) => ast.authoredRange(declaration));
    return owner !== undefined && ast.is.IsObjectLiteralExpression(owner) &&
        declarations.every((declaration) => ast.parent(declaration) === owner) &&
        ranges.every((range) => range.kind === "authored")
      ? {
          member,
          declarations,
          owner,
          start: Math.min(...ranges.map((range) =>
            range.kind === "authored" ? range.start : Number.MAX_SAFE_INTEGER)),
        }
      : undefined;
  });
  if (selected.some((entry) => entry === undefined)) {
    return rejected(
      `Selected '${projection}' operation has a member without one exact authored own-property declaration.`,
    );
  }
  const entries = selected as readonly NonNullable<typeof selected[number]>[];
  const owner = entries[0]!.owner;
  const ownerProperties = ast.properties(owner);
  const declarations = new Set(entries.flatMap((entry) => entry.declarations));
  if (
    entries.some((entry) => entry.owner !== owner) ||
    new Set(entries.map((entry) => entry.start)).size !== entries.length ||
    ownerProperties.length !== declarations.size ||
    ownerProperties.some((property) =>
      property === undefined || !declarations.has(property)
    )
  ) {
    return rejected(
      `Selected '${projection}' operation does not have one unambiguous authored object-literal property order.`,
    );
  }
  const authored = [...entries]
    .sort((left, right) => left.start - right.start)
    .map((entry) => entry.member);
  return {
    kind: "resolved",
    propertyOrder: Object.freeze(
      orderEnumerableOwnStringProperties(
        authored,
        (member) => member.sourceName,
      ).map((member) => member.sourceName),
    ),
  };
}

export function csharpObjectShapeProjectionMembers(
  fact: CsharpObjectShapeFact,
  projection: CsharpObjectShapeProjection,
): readonly CsharpObjectShapeFact["members"][number][] | undefined {
  if (
    projection.propertyOrder.length !== fact.members.length ||
    new Set(projection.propertyOrder).size !== projection.propertyOrder.length
  ) {
    return undefined;
  }
  const members = projection.propertyOrder.map((sourceName) => {
    const matches = fact.members.filter((member) =>
      member.sourceName === sourceName
    );
    return matches.length === 1 ? matches[0] : undefined;
  });
  return members.some((member) => member === undefined)
    ? undefined
    : members as readonly CsharpObjectShapeFact["members"][number][];
}

function isSourceDeclaredNominalShape(fact: CsharpObjectShapeFact): boolean {
  return fact.targetType.kind === "target-named" &&
    (fact.targetType as {
      readonly csharpSourceDeclarationKind?: unknown;
    }).csharpSourceDeclarationKind !== undefined;
}

function rejected(reason: string): CsharpObjectShapePropertyOrderSelection {
  return { kind: "rejected", reason };
}

export function isCsharpObjectShapeGeneratedMemberName(name: string): boolean {
  return name.startsWith(projectionPrefix);
}
