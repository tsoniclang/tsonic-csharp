import type { AstReader, Node } from "@tsonic/tsts";
import { orderEnumerableOwnStringProperties } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, CsharpObjectShapeProjectionKind, TargetTypeRef } from "../../target-model/types/model.js";
import { isSourceDeclaredNominalShape, isCsharpObjectShapeGeneratedMemberName } from "../../target-model/types/object-shape-projection.js";
import type { CsharpObjectShapePropertyOrderSelection } from "./model.js";

type AuthoredOrder = CsharpObjectShapePropertyOrderSelection | { readonly kind: "empty" };

interface PropertyOrders {
  readonly projections: Readonly<Record<CsharpObjectShapeProjectionKind, AuthoredOrder>>;
  readonly assignmentSource: CsharpObjectShapePropertyOrderSelection;
}

const emptyOrder: CsharpObjectShapePropertyOrderSelection = Object.freeze({
  kind: "resolved", propertyOrder: Object.freeze([]),
});
const emptyOccurrence = Object.freeze({ kind: "empty" as const });
const rejected = (reason: string): CsharpObjectShapePropertyOrderSelection => Object.freeze({ kind: "rejected", reason });
const resolved = (propertyOrder: readonly string[]): CsharpObjectShapePropertyOrderSelection =>
  Object.freeze({ kind: "resolved", propertyOrder: Object.freeze(propertyOrder) });

export function createCsharpObjectShapePropertyOrderIndex(
  ast: AstReader,
  reserveClassification: () => void,
) {
  const emptyLiterals = new WeakSet<Node>();
  const byType = new WeakMap<TargetTypeRef, WeakMap<CsharpObjectShapeFact["members"], PropertyOrders>>();
  let sealed = false;
  const record = (shape: CsharpObjectShapeFact): void => {
    if (sealed) throw new Error("C# own-property order analysis is sealed.");
    const byMembers = byType.get(shape.targetType) ?? new WeakMap<CsharpObjectShapeFact["members"], PropertyOrders>();
    if (byMembers.has(shape.members)) return;
    reserveClassification();
    byMembers.set(shape.members, classifyPropertyOrders(shape, ast));
    byType.set(shape.targetType, byMembers);
  };
  const selection = (shape: CsharpObjectShapeFact): PropertyOrders | undefined => {
    if (!sealed) throw new Error("C# own-property order queries require completed analysis.");
    return byType.get(shape.targetType)?.get(shape.members);
  };
  return Object.freeze({
    record,
    recordEmptyLiteral(node: Node): void {
      if (sealed) throw new Error("C# own-property order analysis is sealed.");
      if (emptyLiterals.has(node) || !ast.is.IsObjectLiteralExpression(node) || ast.properties(node).length !== 0) return;
      reserveClassification();
      emptyLiterals.add(node);
    },
    seal(): void { sealed = true; },
    propertyOrder(shape: CsharpObjectShapeFact, sourceValue: Node | undefined,
      projection: CsharpObjectShapeProjectionKind): CsharpObjectShapePropertyOrderSelection {
      const selected = selection(shape)?.projections[projection];
      if (selected === undefined) return rejected("Object-shape projection has no exact completed own-property order proof.");
      return selected.kind !== "empty" ? selected
        : sourceValue !== undefined && emptyLiterals.has(sourceValue) ? emptyOrder
          : rejected(`Selected '${projection}' operation has no exact authored empty-object occurrence.`);
    },
    assignmentSourceOrder(shape: CsharpObjectShapeFact): CsharpObjectShapePropertyOrderSelection {
      return selection(shape)?.assignmentSource ?? rejected("Object-shape assignment source has no exact completed own-property order proof.");
    },
  });
}

function classifyPropertyOrders(fact: CsharpObjectShapeFact, ast: AstReader): PropertyOrders {
  const stringMembers = fact.members.filter(member => member.sourceKey.kind === "property");
  const nominal = isSourceDeclaredNominalShape(fact);
  const reserved = fact.members.some(member => isCsharpObjectShapeGeneratedMemberName(member.targetName));
  const commonReason = nominal
    ? "requires one exact generated structural object carrier; an open nominal source type cannot prove its runtime own-property set."
    : reserved ? "conflicts with a reserved generated object-shape member name." : undefined;
  const authored = commonReason === undefined ? classifyAuthoredOrder(fact, ast) : undefined;
  const enumeration = (projection: "keys" | "values" | "entries"): AuthoredOrder => {
    if (commonReason !== undefined) return rejected(`Selected '${projection}' operation ${commonReason}`);
    return authored?.kind === "rejected" ? rejected(`Selected '${projection}' operation ${authored.reason}`) : authored!;
  };
  const sorted = Object.freeze(stringMembers.map(member => member.sourceName).sort());
  const dataOrder = resolved(sorted);
  const hasOwn = commonReason !== undefined ? rejected(`Selected 'has-own' operation ${commonReason}`)
    : stringMembers.some(member => member.optional === true)
      ? rejected("Selected 'has-own' operation requires exact present-versus-absent storage for every optional property.") : dataOrder;
  const assign = commonReason !== undefined ? rejected(`Selected 'assign' operation ${commonReason}`)
    : stringMembers.some(member => member.optional === true || member.memberKind !== "property" ||
      member.readonly === true || member.accessor !== undefined)
      ? rejected("Selected 'assign' operation requires exact writable, required data-property storage.") : dataOrder;
  const assignmentSource = nominal ? rejected("Selected 'assign' operation requires one exact generated structural source carrier; an open nominal source type cannot prove its runtime own-property set.")
    : reserved ? rejected("Selected 'assign' source conflicts with a reserved generated object-shape member name.")
      : stringMembers.some(member => member.optional === true || member.memberKind !== "property" || member.accessor !== undefined)
        ? rejected("Selected 'assign' source requires exact readable, required data-property storage.") : dataOrder;
  return Object.freeze({ projections: Object.freeze({ keys: enumeration("keys"), values: enumeration("values"),
    entries: enumeration("entries"), "has-own": hasOwn, assign }), assignmentSource });
}

function classifyAuthoredOrder(fact: CsharpObjectShapeFact, ast: AstReader): AuthoredOrder {
  if (fact.members.length === 0) return emptyOccurrence;
  const selected = fact.members.map(member => {
    const declarations = member.sourceDeclarations?.filter(declaration => {
      const owner = ast.parent(declaration);
      return owner !== undefined && ast.is.IsObjectLiteralExpression(owner) && (
        ast.is.IsPropertyAssignment(declaration) || ast.is.IsShorthandPropertyAssignment(declaration) ||
        ast.is.IsMethodDeclaration(declaration) || ast.is.IsGetAccessorDeclaration(declaration) ||
        ast.is.IsSetAccessorDeclaration(declaration));
    }) ?? [];
    const getters = declarations.filter(declaration => ast.is.IsGetAccessorDeclaration(declaration));
    const setters = declarations.filter(declaration => ast.is.IsSetAccessorDeclaration(declaration));
    const expectedDeclarationCount = member.accessor === undefined ? 1 : member.accessor.setter ? 2 : 1;
    if (declarations.length !== expectedDeclarationCount ||
      member.accessor === undefined && (getters.length !== 0 || setters.length !== 0) ||
      member.accessor !== undefined && (getters.length !== 1 || setters.length !== (member.accessor.setter ? 1 : 0))) return undefined;
    const owner = ast.parent(declarations[0]!);
    const ranges = declarations.map(declaration => ast.authoredRange(declaration));
    return owner !== undefined && ast.is.IsObjectLiteralExpression(owner) &&
      declarations.every(declaration => ast.parent(declaration) === owner) && ranges.every(range => range.kind === "authored")
      ? { member, declarations, owner, start: Math.min(...ranges.map(range =>
        range.kind === "authored" ? range.start : Number.MAX_SAFE_INTEGER)) } : undefined;
  });
  if (selected.some(entry => entry === undefined)) {
    return rejected("has a member without one exact authored own-property declaration.");
  }
  const entries = selected as readonly NonNullable<typeof selected[number]>[];
  const owner = entries[0]!.owner;
  const ownerProperties = ast.properties(owner);
  const declarations = new Set(entries.flatMap(entry => entry.declarations));
  if (entries.some(entry => entry.owner !== owner) || new Set(entries.map(entry => entry.start)).size !== entries.length ||
    ownerProperties.length !== declarations.size || ownerProperties.some(property => property === undefined || !declarations.has(property))) {
    return rejected("does not have one unambiguous authored object-literal property order.");
  }
  const authored = [...entries].filter(entry => entry.member.sourceKey.kind === "property")
    .sort((left, right) => left.start - right.start).map(entry => entry.member);
  return resolved(orderEnumerableOwnStringProperties(authored, member => member.sourceName).map(member => member.sourceName));
}
