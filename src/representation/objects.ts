// Native object shapes from Host object facts (G8). Members, optionality, accessors, readonly and owners come from
// SourceObjectFacts; C# decides only the generated storage (BF16 canonical shape factory), member names and
// method-implementation captures.
import type { Node } from "@tsonic/tsts";
import type { SourceObjectMember, SourceTypeDescriptor, SourceTypeDescriptorMember } from "@tsonic/target-api/source";
import { sourceTypeDescriptorMemberOriginsEqual, sourceTypeDescriptorStructure } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../target-model/types/model.js";
import { canonicalCsharpObjectShapeMembers, csharpObjectShapeMemberContractKey } from "../target-model/types/object-shape-identity.js";
import { getCsharpMethodValue } from "../target-model/types/method-values.js";
import { targetTypeRefEquals } from "../target-model/types/equality.js";
import { objectShapeMemberTargetName } from "../policy/identities/source-member-names.js";
import { createStructuralObjectShapeTarget } from "../policy/types/objects/structural-shape-targets.js";
import { csharpRefusal, csharpRepresentationContext, isCsharpRefusal, type CsharpRepresentation, type CsharpRepresentationContext } from "./context.js";
import { representSourceType } from "./descriptors.js";
import { csharpProviderBindingFromResolution } from "../providers/model/relation-resolver.js";
import { csharpTargetTypeFromBinding } from "../policy/types/storage/bindings.js";
import { csharpRecordDictionaryCarrier } from "../target-model/types/carriers/collections.js";
import { representSignatureTypeParameters } from "./callables.js";
import type { RepresentDescriptor } from "./sums.js";
import { authoredTypeDescriptor } from "./declared.js";
import { readCsharpSourceField } from "../source/extension/markers.js";

/** The native shape for a Source object type whose members the Host published (members in Host order). */
export function representObjectShape(
  type: SourceTypeDescriptor,
  members: readonly SourceObjectMember[],
  context: CsharpRepresentationContext,
  represent: RepresentDescriptor,
): CsharpRepresentation {
  const instance = members.filter(member => !member.static);
  // The Host members of a shape, or of a declared type with a definition, are published from that shape's descriptor
  // members; the descriptor carries each member's Host origin (declared, mapped, class-prototype) and literal domain.
  const structure = sourceTypeDescriptorStructure(type);
  const facts = representObjectMembers(instance, context, represent, structure.kind === "shape" ? structure : undefined);
  if (isCsharpRefusal(facts)) return facts;
  const contract = instance.length !== 0 && instance.every(member => !context.syntax.is.IsObjectLiteralExpression(member.owner));
  return retainStructuralShape(facts, contract, instance, context);
}

/** C# member facts for Host object members (instance members, Host order). Shared by generated and project shapes. */
export function representObjectMembers(
  instance: readonly SourceObjectMember[],
  context: CsharpRepresentationContext,
  represent: RepresentDescriptor = descriptor => representSourceType(descriptor, context),
  /**
   * The shape descriptor the Host published the members from: each member's Host origin (BF16 / C-2524) and literal
   * domain (R-A5-1) are read from its descriptor member. Without one, the members carry no origin.
   */
  shape?: Extract<SourceTypeDescriptor, { readonly kind: "shape" }>,
): readonly CsharpObjectShapeMemberFact[] | ReturnType<typeof csharpRefusal> {
  const facts: CsharpObjectShapeMemberFact[] = [];
  const names = new Set<string>();
  for (const member of instance) {
    if (member.key.kind !== "string") return csharpRefusal("CSHARP_SHAPE_MEMBER_KEY",
      `Object member '${member.name}' has a ${member.key.kind} key; generated .NET storage names string keys only.`,
      member.declarations[0] ?? context.occurrence);
    // The member key is the Host key (R3 #14): shape members correspond by it, never by a display name.
    const key = member.key.value;
    if (names.has(key)) return csharpRefusal("CSHARP_SHAPE_MEMBER_KEY",
      `Object member '${member.name}' appears twice in one generated .NET shape.`, member.declarations[0] ?? context.occurrence);
    names.add(key);
    const site = member.declarations[0] ?? context.occurrence;
    // A .NET property is read through its getter; a setter without a getter (object literal, class or interface) has no
    // read carrier. Baseline refused the setter-only class and interface accessor as well (member-declarations.ts).
    if (member.kind === "set") return csharpRefusal("CSHARP_SHAPE_SETTER_ONLY",
      `Setter '${member.name}' has no getter and therefore no exact native read carrier.`, site);
    // A native field marker (field<T>(), memory field bindings) names the member's storage type by its authored type node.
    const field = readCsharpSourceField(context.sourceFacts, member.declarations);
    const represented = represent(field === undefined ? member.type : authoredTypeDescriptor(field.sourceType, context));
    if (isCsharpRefusal(represented)) return represented;
    const method = member.kind === "method";
    const signature = method && member.type.kind === "callable" && member.type.calls.length === 1 ? member.type.calls[0] : undefined;
    if (method && signature === undefined) return csharpRefusal("CSHARP_CALLABLE_OVERLOADS",
      `Method '${member.name}' has several signatures; a generated .NET shape member has one.`, member.declarations[0] ?? context.occurrence);
    const typeParameters = signature === undefined ? Object.freeze([]) : representSignatureTypeParameters(signature, context);
    if (isCsharpRefusal(typeParameters)) return typeParameters;
    const accessor = member.kind === "get" || member.kind === "accessor-pair";
    const bound = context.memoryBindings.hasBoundField(member.declarations);
    if (accessor && bound) return csharpRefusal("CSHARP_SHAPE_BOUND_ACCESSOR",
      `Accessor '${member.name}' cannot also be a bound native field.`, member.declarations[0] ?? context.occurrence);
    const published = shape === undefined ? undefined : descriptorMemberOf(shape, member, site);
    const origin = published?.origin;
    const literals = published?.literals;
    facts.push(Object.freeze({
      sourceKey: Object.freeze({ kind: "property", name: key }),
      sourceName: member.name,
      targetName: objectShapeMemberTargetName(member.name),
      memberKind: method ? "method" : "property",
      type: method ? getCsharpMethodValue(represented)?.contract ?? represented : represented,
      ...(typeParameters.length === 0 ? {} : { typeParameters }),
      ...(bound ? { bound: true as const } : {}),
      ...(accessor ? { accessor: Object.freeze({ getter: true as const, setter: member.kind === "accessor-pair" }) } : {}),
      optional: member.optional,
      readonly: member.readonly || field?.readonly === true,
      ...(origin === undefined ? {} : { origins: Object.freeze([origin]) }),
      ...(literals === undefined ? {} : { literals }),
      sourceDeclarations: Object.freeze([...member.declarations]),
      sourceSubjects: Object.freeze([...member.declarations]),
    }));
  }
  return Object.freeze(facts);
}

/**
 * The descriptor member a Host object member was published from (object-facts objects.ts objectMember): a declared
 * origin names one of the member's declarations; a mapped origin is the member's own key and mapped owner; a
 * class-prototype member is the owner's prototype member of that key. Exactly one must match (I4).
 */
export function descriptorMemberOf(shape: Extract<SourceTypeDescriptor, { readonly kind: "shape" }>, member: SourceObjectMember,
  site: Node): SourceTypeDescriptorMember {
  const matches = shape.members.filter(candidate => {
    const origin = candidate.origin;
    switch (origin.kind) {
      case "declared": return member.declarations.includes(origin.declaration);
      case "mapped": return origin.owner === member.owner && origin.key === member.key;
      case "class-prototype": return origin.owner === member.owner && member.key.kind === "string" && candidate.name === member.key.value;
    }
  });
  if (matches.length !== 1) failTargetAnalysisInvariant("tsonic-csharp",
    "A Host object member must come from exactly one member of its published shape descriptor.", site);
  return matches[0]!;
}

function retainStructuralShape(
  members: readonly CsharpObjectShapeMemberFact[],
  contract: boolean,
  source: readonly SourceObjectMember[],
  context: CsharpRepresentationContext,
): CsharpRepresentation {
  const owners = [...new Set(source.map(member => member.owner).filter(owner =>
    context.facts.navigation.identity.isProjectDeclaration(owner) &&
    (context.syntax.is.IsObjectLiteralExpression(owner) || context.syntax.is.IsTypeLiteralNode(owner))))];
  const literal = owners.length === 1 ? owners[0]! : context.occurrence;
  const implementation = context.syntax.is.IsObjectLiteralExpression(literal) ? representMethodImplementation(members, literal, context) : undefined;
  if (isCsharpRefusal(implementation)) return implementation;
  const targetType = createStructuralObjectShapeTarget(members, undefined, context.typeParameters, contract, implementation);
  const shape = context.shapes.retainShape(Object.freeze({ targetType, members: Object.freeze([...members]),
    ...(implementation === undefined ? {} : { methodImplementation: implementation }) }), literal);
  if (shape === undefined || shape.members.length !== members.length) return csharpRefusal("CSHARP_SHAPE_REGISTRY",
    "The generated .NET shape registry did not retain this member set.", context.occurrence);
  if (members.length === 0) return targetTypeRefEquals(shape.targetType, targetType) ? shape.targetType
    : csharpRefusal("CSHARP_SHAPE_REGISTRY", "The empty object shape was retained as a different .NET type.", context.occurrence);
  if (shape.targetType.kind !== "target-named") return csharpRefusal("CSHARP_SHAPE_REGISTRY",
    "A generated object shape must be a named .NET type.", context.occurrence);
  const carrier: CsharpTargetNamedTypeRef = shape.targetType;
  if (carrier.csharpGeneratedStructuralStorage !== true || (carrier.csharpStructuralContract === true) !== contract) return csharpRefusal(
    "CSHARP_SHAPE_REGISTRY", "The retained shape changed its storage or contract kind.", context.occurrence);
  const retained = canonicalCsharpObjectShapeMembers(shape.members);
  const expected = canonicalCsharpObjectShapeMembers(members);
  return expected.every((member, index) => {
    const actual = retained[index]!;
    return csharpObjectShapeMemberContractKey(actual) === csharpObjectShapeMemberContractKey(member) &&
      (actual.readonly === true) === (member.readonly === true) &&
      (member.origins === undefined || actual.origins?.some(origin => sourceTypeDescriptorMemberOriginsEqual(origin, member.origins![0]!)) === true);
  }) ? shape.targetType : csharpRefusal("CSHARP_SHAPE_REGISTRY", "The retained shape differs from the Host member set.", context.occurrence);
}

/** Object-literal methods with bodies become one generated implementation with captured bindings as fields. */
function representMethodImplementation(
  members: readonly CsharpObjectShapeMemberFact[],
  literal: Node,
  context: CsharpRepresentationContext,
): CsharpObjectShapeFact["methodImplementation"] | ReturnType<typeof csharpRefusal> | undefined {
  const { syntax } = context;
  const methods = [...new Set(members.filter(member => member.memberKind === "method").flatMap(member => (member.sourceDeclarations ?? [])
    .filter(declaration => syntax.is.IsMethodDeclaration(declaration) && syntax.body(declaration) !== undefined &&
      syntax.parent(declaration) === literal)))].sort((left, right) => syntax.pos(left) - syntax.pos(right));
  if (methods.length === 0) return undefined;
  const selected = context.objectMethodSources.get(literal);
  if (selected === undefined) return csharpRefusal("CSHARP_OBJECT_METHODS",
    "Object-literal methods have no generated implementation record.", literal);
  const captures = new Map<Node, NonNullable<ReturnType<typeof selected.captures>>[number]>();
  for (const method of methods) {
    const methodCaptures = selected.captures(method);
    if (methodCaptures === undefined) return csharpRefusal("CSHARP_OBJECT_METHODS",
      "An object-literal method has no capture record.", method);
    for (const capture of methodCaptures) if (!captures.has(capture.declaration)) captures.set(capture.declaration, capture);
  }
  const names = new Set(members.map(member => member.targetName));
  const fields: NonNullable<CsharpObjectShapeFact["methodImplementation"]>["captures"][number][] = [];
  for (const [index, capture] of [...captures.values()].entries()) {
    // K-2670 (R5 / I4): a captured binding's Host value is read through the shared invariant reader. Its refusal was
    // forwarded unchanged before C# analysis; meeting it here is a Host producer defect, never a new C# refusal.
    const outcome = context.facts.values.type(capture.declaration);
    if (outcome.kind === "refused") failTargetAnalysisInvariant("tsonic-csharp",
      `A captured binding's refused Host value (${outcome.code}) reached the C# representation.`, capture.declaration);
    const captured = outcome.type;
    const type = representSourceType(captured, csharpRepresentationContext(context, capture.declaration, "storage"));
    if (isCsharpRefusal(type)) return type;
    if (capture.reference === undefined) return csharpRefusal("CSHARP_OBJECT_METHODS", "A captured binding has no reference.", capture.declaration);
    let fieldName = `__tsonic_capture${index}`;
    while (names.has(fieldName)) fieldName += "_";
    names.add(fieldName);
    fields.push(Object.freeze({ declaration: capture.declaration, reference: capture.reference, fieldName, type,
      mutable: capture.mutable, initialization: context.captureInitialization(capture.declaration) }));
  }
  return Object.freeze({ declaration: literal, identity: selected.identity, methods: Object.freeze(methods), captures: Object.freeze(fields) });
}

/** Shape descriptors with index signatures only: a Dictionary over the one key and value carrier. */
export function representIndexedShape(
  indexes: Extract<SourceTypeDescriptor, { readonly kind: "shape" }>["indexes"],
  context: CsharpRepresentationContext,
  represent: RepresentDescriptor,
): CsharpRepresentation {
  let key: TargetTypeRef | undefined;
  let value: TargetTypeRef | undefined;
  for (const index of indexes) {
    const selectedKey = represent(index.key);
    if (isCsharpRefusal(selectedKey)) return selectedKey;
    const selectedValue = represent(index.value);
    if (isCsharpRefusal(selectedValue)) return selectedValue;
    if (key !== undefined && !targetTypeRefEquals(key, selectedKey) || value !== undefined && !targetTypeRefEquals(value, selectedValue)) {
      return csharpRefusal("CSHARP_INDEX_SIGNATURES", "Index signatures with different .NET key or value types have no one Dictionary carrier.",
        index.declaration);
    }
    key = selectedKey;
    value = selectedValue;
  }
  if (key === undefined || value === undefined) return csharpRefusal("CSHARP_INDEX_SIGNATURES", "An index shape has no index signature.", context.occurrence);
  const dictionary = csharpProviderBindingFromResolution(context.providers.findTargetBindingByMetadataName(
    "System.Collections.Generic.Dictionary`2", "ordinary"));
  const carrier = dictionary === undefined ? undefined : csharpTargetTypeFromBinding(dictionary, [key, value]);
  const record = carrier === undefined ? undefined : csharpRecordDictionaryCarrier(carrier);
  return record ??
    csharpRefusal("CSHARP_INDEX_SIGNATURES", "System.Collections.Generic.Dictionary`2 is not available to this program.", context.occurrence);
}
