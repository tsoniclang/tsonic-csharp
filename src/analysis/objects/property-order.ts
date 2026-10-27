import type { CsharpObjectShapePropertyOrders, CsharpObjectShapeAuthoredOrder } from "../../target-model/records/objects/object-shapes.js";
import type { AstReader, Node } from "@tsonic/tsts";
import { orderEnumerableOwnStringProperties } from "@tsonic/target-api/source";

import type { CsharpObjectShapeFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../target-model/types/model.js";
import { isSourceDeclaredNominalShape } from "../../target-model/types/object-shape-projection.js";

import { inferCsharpTargetTypeParameterBindings, substituteTargetTypeParameters } from "../../policy/types/resolution/substitution.js";
import { csharpFreeTypeParameterIdentities } from "../../target-model/types/generic-references.js";
import type { CsharpObjectShapePropertyOrderSelection } from "../../target-model/records/objects/object-shapes.js";

const emptyOccurrence = Object.freeze({ kind: "empty" as const });
const rejected = (reason: string): CsharpObjectShapePropertyOrderSelection => Object.freeze({ kind: "rejected", reason });
const resolved = (propertyOrder: readonly string[]): CsharpObjectShapePropertyOrderSelection =>
  Object.freeze({ kind: "resolved", propertyOrder: Object.freeze(propertyOrder) });

function isInterfaceShape(fact: CsharpObjectShapeFact): boolean {
  return fact.targetType.kind === "target-named" &&
    ((fact.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true ||
      (fact.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "interface");
}

export function csharpNativeInstantiationCanMatch(
  target: TargetTypeRef, source: TargetTypeRef,
  nativeAccepts: (source: TargetTypeRef, target: TargetTypeRef) => boolean,
): boolean | undefined {
  if (nativeAccepts(source, target)) return true;
  const sourceParameters = csharpFreeTypeParameterIdentities([source]);
  const targetParameters = csharpFreeTypeParameterIdentities([target]);
  if (sourceParameters.size !== 0) {
    const bindings = inferCsharpTargetTypeParameterBindings(source, target, sourceParameters);
    if (bindings !== undefined && nativeAccepts(substituteTargetTypeParameters(source, bindings), target)) return true;
  }
  if (targetParameters.size !== 0) {
    const bindings = inferCsharpTargetTypeParameterBindings(target, source, targetParameters);
    if (bindings !== undefined && nativeAccepts(source, substituteTargetTypeParameters(target, bindings))) return true;
  }
  return sourceParameters.size === 0 && targetParameters.size === 0 ? false : undefined;
}

function hasExactNativeOwnStorage(fact: CsharpObjectShapeFact): boolean {
  if (fact.targetType.kind !== "target-named") return false;
  const type = fact.targetType as CsharpTargetNamedTypeRef;
  return type.csharpGeneratedStructuralStorage === true && type.csharpRender?.kind === "named" && type.csharpStructuralContract !== true &&
    type.csharpSourceDeclarationKind === undefined && type.csharpJsValueCarrier !== true;
}

export function analyzeCsharpObjectShapePropertyOrders(fact: CsharpObjectShapeFact, ast: AstReader,
  implementations: readonly CsharpObjectShapeFact[] | undefined): CsharpObjectShapePropertyOrders {
  const stringMembers = fact.members.filter(member => member.sourceKey.kind === "property");
  const nominal = isSourceDeclaredNominalShape(fact);
  const exactOwnSet = !isInterfaceShape(fact) ? hasExactNativeOwnStorage(fact)
    : implementations !== undefined && implementations.length !== 0 && implementations.every(implementation => {
      const members = implementation.members.filter(member => member.sourceKey.kind === "property");
      return hasExactNativeOwnStorage(implementation) && members.length === stringMembers.length &&
        members.every(member => member.optional !== true && stringMembers.some(expected =>
          expected.sourceName === member.sourceName && expected.sourceKey.kind === "property"));
    });
  const commonReason = nominal
    ? "requires one exact generated structural object carrier; an open nominal source type cannot prove its runtime own-property set."
    : isInterfaceShape(fact) && !exactOwnSet
      ? "requires an exact own-property set for every admitted native implementation; a structural view alone is insufficient." : undefined;
  const authored = commonReason === undefined ? classifyCsharpObjectShapeAuthoredOrder(fact, ast, exactOwnSet) : undefined;
  const enumeration = (projection: "keys" | "values" | "entries"): CsharpObjectShapeAuthoredOrder => {
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
  const assignmentSource = commonReason !== undefined ? rejected(`Selected 'assign' source ${commonReason}`)
    : stringMembers.some(member => member.optional === true || member.memberKind !== "property" || member.accessor !== undefined)
      ? rejected("Selected 'assign' source requires exact readable, required data-property storage.") : dataOrder;
  return Object.freeze({ projections: Object.freeze({ keys: enumeration("keys"), values: enumeration("values"),
    entries: enumeration("entries"), "has-own": hasOwn, assign }), assignmentSource });
}

function classifyCsharpObjectShapeAuthoredOrder(fact: CsharpObjectShapeFact, ast: AstReader, exactOwnSet: boolean): CsharpObjectShapeAuthoredOrder {
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
    const declared = fact.members.every(member => {
      if (member.memberKind !== "property" || member.optional === true || member.sourceDeclarations?.length !== 1) return false;
      const declaration = member.sourceDeclarations[0]!;
      const owner = ast.parent(declaration);
      return owner !== undefined && !ast.is.IsObjectLiteralExpression(owner) && ast.is.IsPropertySignatureDeclaration(declaration);
    });
    if (declared && exactOwnSet) {
      const names = fact.members.filter(member => member.sourceKey.kind === "property").map(member => member.sourceName);
      const forward = orderEnumerableOwnStringProperties(names, name => name);
      const reverse = orderEnumerableOwnStringProperties([...names].reverse(), name => name);
      if (new Set(names).size === names.length && forward.every((name, index) => name === reverse[index])) return resolved(forward);
    }
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

import { createCsharpObjectShapePropertyOrderProducer } from "../program/records/objects/property-order.js";

export function createCsharpObjectShapePropertyOrderIndex(
  ast: AstReader,
  reserveClassification: () => void,
  completedNativeShapes: () => Iterable<CsharpObjectShapeFact>,
  nativeImplementationAccepts: (source: TargetTypeRef, target: TargetTypeRef) => boolean,
) {
  if (typeof completedNativeShapes !== "function") {
    throw new TypeError("C# own-property analysis requires its completed native shape input.");
  }
  if (typeof nativeImplementationAccepts !== "function") {
    throw new TypeError("C# own-property analysis requires its canonical native implementation relation.");
  }
  const producer = createCsharpObjectShapePropertyOrderProducer();
  let implementations: ReadonlyMap<string, readonly { readonly shape: CsharpObjectShapeFact; readonly contract: TargetTypeRef }[]> | undefined;
  return Object.freeze({
    record(shape: CsharpObjectShapeFact): void {
      if (producer.contains(shape)) return;
      reserveClassification();
      if (implementations === undefined) {
        const selected = new Map<string, { readonly shape: CsharpObjectShapeFact; readonly contract: TargetTypeRef }[]>();
        const seen = new Set<CsharpObjectShapeFact>();
        const pending = [...completedNativeShapes()];
        for (const candidate of pending) {
          if (seen.has(candidate)) continue;
          reserveClassification();
          seen.add(candidate);
          if (candidate.declarationTemplate !== undefined) pending.push(candidate.declarationTemplate);
          if (isInterfaceShape(candidate)) continue;
          for (const implemented of candidate.implements ?? []) {
            reserveClassification();
            if (implemented.kind !== "target-named") continue;
            const values = selected.get(implemented.id) ?? [];
            values.push({ shape: candidate, contract: implemented });
            selected.set(implemented.id, values);
          }
        }
        implementations = selected;
      }
      const native: CsharpObjectShapeFact[] = [];
      let complete = true;
      for (const implementation of shape.targetType.kind === "target-named" ? implementations.get(shape.targetType.id) ?? [] : []) {
        reserveClassification();
        const match = csharpNativeInstantiationCanMatch(shape.targetType, implementation.contract, nativeImplementationAccepts);
        if (match === undefined) complete = false;
        else if (match) native.push(implementation.shape);
      }
      producer.record(shape, analyzeCsharpObjectShapePropertyOrders(shape, ast, complete ? native : undefined));
    },
    recordOccurrence: producer.recordOccurrence,
    recordEmptyLiteral(node: Node): void {
      if (producer.hasEmptyLiteral(node) || !ast.is.IsObjectLiteralExpression(node) || ast.properties(node).length !== 0) return;
      reserveClassification();
      producer.recordEmptyLiteral(node);
    },
    seal: producer.seal,
    propertyOrder: producer.propertyOrder,
    assignmentSourceOrder: producer.assignmentSourceOrder,
  });
}
