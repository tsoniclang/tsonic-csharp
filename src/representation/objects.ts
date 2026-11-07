// Native object shapes from Host object facts (G8). Members, optionality, accessors, readonly and owners come from
// SourceObjectFacts; C# decides only the generated storage (BF16 canonical shape factory), member names and
// method-implementation captures.
import type { Node } from "@tsonic/tsts";
import type { SourceObjectMember, SourceTypeDescriptor } from "@tsonic/target-api/source";
import { sourceTypeDescriptorMemberOriginsEqual } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../target-model/types/model.js";
import { canonicalCsharpObjectShapeMembers, csharpObjectShapeMemberContractKey } from "../target-model/types/object-shape-identity.js";
import { getCsharpMethodValue } from "../target-model/types/method-values.js";
import { targetTypeRefEquals } from "../target-model/types/equality.js";
import { objectShapeMemberTargetName } from "../policy/identities/source-member-names.js";
import { createStructuralObjectShapeTarget } from "../analysis/objects/shapes/construction.js";
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
  _type: SourceTypeDescriptor,
  members: readonly SourceObjectMember[],
  context: CsharpRepresentationContext,
  represent: RepresentDescriptor,
): CsharpRepresentation {
  const instance = members.filter(member => !member.static);
  const facts = representObjectMembers(instance, context, represent);
  if (isCsharpRefusal(facts)) return facts;
  const contract = instance.length !== 0 && instance.every(member => !context.syntax.is.IsObjectLiteralExpression(member.owner));
  return retainStructuralShape(facts, contract, instance, context);
}

/** C# member facts for Host object members (instance members, Host order). Shared by generated and project shapes. */
export function representObjectMembers(
  instance: readonly SourceObjectMember[],
  context: CsharpRepresentationContext,
  represent: RepresentDescriptor = descriptor => representSourceType(descriptor, context),
): readonly CsharpObjectShapeMemberFact[] | ReturnType<typeof csharpRefusal> {
  const facts: CsharpObjectShapeMemberFact[] = [];
  const names = new Set<string>();
  for (const member of instance) {
    if (member.key.kind !== "string") return csharpRefusal("CSHARP_SHAPE_MEMBER_KEY",
      `Object member '${member.name}' has a ${member.key.kind} key; generated .NET storage names string keys only.`,
      member.declarations[0] ?? context.occurrence);
    if (names.has(member.name)) return csharpRefusal("CSHARP_SHAPE_MEMBER_KEY",
      `Object member '${member.name}' appears twice in one generated .NET shape.`, member.declarations[0] ?? context.occurrence);
    names.add(member.name);
    const site = member.declarations[0] ?? context.occurrence;
    // A generated .NET property is read through its getter; an object-literal setter without a getter has no read carrier.
    if (member.kind === "set" && context.syntax.is.IsObjectLiteralExpression(member.owner)) return csharpRefusal("CSHARP_SHAPE_SETTER_ONLY",
      `Object-literal setter '${member.name}' has no getter and therefore no exact native read carrier.`, site);
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
    const accessor = member.kind === "get" || member.kind === "set" || member.kind === "accessor-pair";
    const bound = context.memoryBindings.hasBoundField(member.declarations);
    if (accessor && bound) return csharpRefusal("CSHARP_SHAPE_BOUND_ACCESSOR",
      `Accessor '${member.name}' cannot also be a bound native field.`, member.declarations[0] ?? context.occurrence);
    const origin = member.declarations[0] === undefined ? undefined : Object.freeze({ kind: "declared" as const, declaration: member.declarations[0] });
    facts.push(Object.freeze({
      sourceKey: Object.freeze({ kind: "property", name: member.name }),
      sourceName: member.name,
      targetName: objectShapeMemberTargetName(member.name),
      memberKind: method ? "method" : "property",
      type: method ? getCsharpMethodValue(represented)?.contract ?? represented : represented,
      ...(typeParameters.length === 0 ? {} : { typeParameters }),
      ...(bound ? { bound: true as const } : {}),
      ...(accessor ? { accessor: Object.freeze({ getter: true as const, setter: member.kind === "accessor-pair" || member.kind === "set" }) } : {}),
      optional: member.optional,
      readonly: member.readonly || field?.readonly === true,
      ...(origin === undefined ? {} : { origins: Object.freeze([origin]) }),
      sourceDeclarations: Object.freeze([...member.declarations]),
      sourceSubjects: Object.freeze([...member.declarations]),
    }));
  }
  return Object.freeze(facts);
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
    const outcome = context.facts.values.type(capture.declaration);
    if (outcome.kind === "refused") return csharpRefusal("CSHARP_OBJECT_METHODS",
      `A captured binding was refused by the Host (${outcome.code}).`, capture.declaration);
    const type = representSourceType(outcome.type, csharpRepresentationContext(context, capture.declaration, "storage"));
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
