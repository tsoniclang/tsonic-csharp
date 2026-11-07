// Physical read selection (nextgen C-2542; K-2664 / C-2550; WP0 A5; BF16 fix-forward C-2524 / C-2525).
//
// The native storage selection (analysis/objects/native-construction-demand.ts, planning `requiredStorageType`, closed
// callable inputs) may give a declaration a physical carrier the logical Source type does not name: struct value
// storage for an all-data object literal, a closed array layout, a closed callable input delegate. A read of that
// declaration must then read the same physical carrier, so the value stays in its storage (no class allocation, no copy
// adapter). This module is the one owner of that read-side choice; representation/values.ts stays the logical mapping.
//
// A read selects the physical carrier only when every proof holds; otherwise the logical carrier stays (never a guess):
// - the occurrence has its own Host outcome, and its principal is exact: an identifier's Host reference target, a
//   declaration or callable value itself, or for an object literal the A5 principal `provenance.principal` whose
//   initializer is this literal (never the solved group, an AST parent or an authored-annotation check);
// - the principal's own outcome is published at the principal and carries the same descriptor as the occurrence;
// - the occurrence and its principal have the same scoped storage carrier;
// - shapes (BF16): the scoped carrier equals the canonical value storage (createCsharpObjectShapeValueStorage) of the
//   shape registered for the logical carrier, so it can never replace a declared class, interface or struct identity or
//   an unrelated registered carrier; the registry holds exactly that canonical shape, and every Host member of the
//   occurrence corresponds to exactly one physical member by Source origin, name, optionality and width;
// - arrays: a declaration's closed layout with the same input domain as the logical carrier;
// - callables: an unannotated principal (Host slot authority) whose closed input contract is the contract of the
//   occurrence, of the principal and of its source callable (directly or through a Host alias flow), with matching
//   closed invocations.
// Inputs are published Host facts and C# planning carriers only; no checker Type is read (I2) and no Source fact is
// changed (the Host outcome of every node stays as published).
import type { AstReader, Node } from "@tsonic/tsts";
import {
  sourceTypeDescriptorMemberOriginsEqual,
  sourceTypeDescriptorsEqual,
  type SourceProgramFacts,
  type SourceTypeDescriptor,
  type SourceTypeOutcome,
} from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpObjectShapePolicy } from "../../target-model/records/objects/object-shapes.js";
import type { SourceCallableSourceContract } from "../../target-model/records/callables/source-callable-contract.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { csharpObjectShapesEqual } from "../../target-model/types/object-shape-equality.js";
import { csharpObjectShapeMemberContractKey } from "../../target-model/types/object-shape-identity.js";
import { createCsharpObjectShapeValueStorage } from "../../policy/types/objects/shape-carriers.js";
import { csharpArrayInputDomainsEqual } from "../../policy/types/collections/array-input-layout.js";
import { csharpCallableValueType, csharpClosedInvocationMatches } from "../../policy/types/callables/value-type.js";

export interface CsharpPhysicalReadHost {
  readonly facts: SourceProgramFacts;
  /** Authored-syntax reader: node kinds only. */
  readonly syntax: AstReader;
  /** The storage carrier the native storage selection chose for a node (current constructions, then the planning iteration). */
  scopedTargetType(node: Node): TargetTypeRef | undefined;
  /** The closed callable input contract of a callable value or its binding (planning iteration). */
  closedInputContract(node: Node): SourceCallableSourceContract | undefined;
  /** The object-shape registry (BF16 canonical shapes). */
  readonly objectShapes: Pick<CsharpObjectShapePolicy, "resolveTarget">;
}

type PublishedOutcome = Exclude<SourceTypeOutcome, { readonly kind: "refused" }>;
type ShapeDescriptor = Extract<SourceTypeDescriptor, { readonly kind: "shape" }>;

/**
 * The physical carrier a read of `node` must use instead of its logical carrier `logical` (the represented Host
 * type of the node), or undefined when the logical carrier stays.
 */
export function selectCsharpPhysicalRead(host: CsharpPhysicalReadHost, node: Node, logical: TargetTypeRef): TargetTypeRef | undefined {
  const { facts } = host;
  if (!facts.values.has(node)) return undefined;
  const outcome = facts.values.type(node);
  if (outcome.kind === "refused" || outcome.provenance.occurrence !== node) return undefined;
  const type = outcome.type;
  if (type.kind !== "shape" && type.kind !== "array" && type.kind !== "callable") return undefined;
  const declaration = physicalPrincipal(host, node, outcome);
  if (declaration === undefined || !facts.values.has(declaration)) return undefined;
  const principal = facts.values.type(declaration);
  if (principal.kind === "refused" || principal.provenance.occurrence !== declaration ||
    !sourceTypeDescriptorsEqual(type, principal.type)) return undefined;
  const selected = host.scopedTargetType(node);
  const storage = host.scopedTargetType(declaration);
  if (selected === undefined || storage === undefined || !targetTypeRefEquals(selected, storage)) return undefined;
  switch (type.kind) {
    case "shape": return physicalShapeRead(host, type, logical, selected);
    case "array": return host.syntax.is.IsVariableDeclaration(declaration) && csharpArrayInputDomainsEqual(logical, selected)
      ? selected : undefined;
    case "callable": return physicalCallableRead(host, node, declaration, logical, selected);
  }
}

/**
 * The principal whose storage authorizes a physical read: an identifier's Host reference target; a variable
 * declaration, arrow or function expression itself; an object literal's A5 principal declaration (the literal must
 * be that principal's initializer, and never its own principal).
 */
function physicalPrincipal(host: CsharpPhysicalReadHost, node: Node, outcome: PublishedOutcome): Node | undefined {
  const { syntax, facts } = host;
  if (syntax.is.IsIdentifier(node)) return facts.navigation.identity.target(node)?.declaration;
  if (syntax.is.IsVariableDeclaration(node) || syntax.is.IsArrowFunction(node) || syntax.is.IsFunctionExpression(node)) return node;
  if (outcome.type.kind !== "shape" || !syntax.is.IsObjectLiteralExpression(node)) return undefined;
  const association = outcome.provenance.principal;
  return association === undefined || association.initializer !== node || association.declaration === node
    ? undefined : association.declaration;
}

/** BF16: the scoped carrier is the canonical value storage of the logical carrier's registered shape, and nothing else. */
function physicalShapeRead(
  host: CsharpPhysicalReadHost,
  descriptor: ShapeDescriptor,
  logical: TargetTypeRef,
  selected: TargetTypeRef,
): TargetTypeRef | undefined {
  const represented = host.objectShapes.resolveTarget(logical);
  const canonical = represented === undefined ? undefined : createCsharpObjectShapeValueStorage(represented);
  if (canonical === undefined || !targetTypeRefEquals(canonical.targetType, selected)) return undefined;
  const registered = host.objectShapes.resolveTarget(selected);
  if (registered === undefined || !targetTypeRefEquals(registered.targetType, selected) ||
    !csharpObjectShapesEqual(registered, canonical)) return undefined;
  return physicalMembersCorrespond(descriptor, registered, canonical) ? selected : undefined;
}

/**
 * Every Host member of the occurrence has exactly one registered physical member with its Source origin, name and
 * optionality, at the width of the canonical member with that origin; no physical member is left over.
 */
function physicalMembersCorrespond(
  descriptor: ShapeDescriptor,
  registered: CsharpObjectShapeFact,
  canonical: CsharpObjectShapeFact,
): boolean {
  if (registered.members.length !== descriptor.members.length) return false;
  return descriptor.members.every(member => {
    const withOrigin = (shape: CsharpObjectShapeFact) => shape.members.filter(candidate =>
      candidate.origins?.some(origin => sourceTypeDescriptorMemberOriginsEqual(origin, member.origin)) === true);
    const physical = withOrigin(registered);
    const expected = withOrigin(canonical);
    return physical.length === 1 && expected.length === 1 && physical[0]!.sourceName === member.name &&
      (physical[0]!.optional === true) === member.optional &&
      (physical[0]!.readonly === true) === (expected[0]!.readonly === true) &&
      csharpObjectShapeMemberContractKey(physical[0]!) === csharpObjectShapeMemberContractKey(expected[0]!);
  });
}

/** A closed callable input delegate shared by the occurrence, its unannotated principal and its source callable. */
function physicalCallableRead(
  host: CsharpPhysicalReadHost,
  node: Node,
  declaration: Node,
  logical: TargetTypeRef,
  selected: TargetTypeRef,
): TargetTypeRef | undefined {
  const { facts, syntax } = host;
  if (syntax.is.IsVariableDeclaration(declaration)) {
    const slot = facts.values.slot(declaration);
    if (slot.kind !== "slot" || slot.authority === "declared") return undefined;
  }
  const contract = host.closedInputContract(node);
  if (contract === undefined || host.closedInputContract(declaration) !== contract ||
    host.closedInputContract(contract.sourceDeclaration) !== contract) return undefined;
  const aliases = (expression: Node): readonly Node[] => facts.navigation.expressions.valueFlow(expression).aliasDeclarations;
  if (contract.sourceDeclaration !== declaration && !aliases(contract.sourceDeclaration).includes(declaration) &&
    !facts.navigation.uses.uses(contract.sourceDeclaration).some(use => aliases(use.reference).includes(declaration))) return undefined;
  const native = csharpCallableValueType(contract);
  return native !== undefined && csharpClosedInvocationMatches(native, selected) &&
    csharpClosedInvocationMatches(logical, selected) ? selected : undefined;
}
