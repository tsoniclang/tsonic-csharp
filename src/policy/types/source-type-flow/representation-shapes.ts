import type { Node } from "@tsonic/tsts";
import type { SourceTypeEvidence } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef } from "../../../target-model/types/model.js";
import type { CsharpRepresentationOutcome, CsharpRepresentationView, CsharpRepresentedType } from "../../../target-model/types/representation.js";
import type { CsharpRepresentationHost } from "./representation-host.js";
import { represented, sourceOutcome, nativeRepresentationFailure, representationRequirements } from "./representation-results.js";
import { canonicalCsharpObjectShapeMembers, csharpObjectShapeContractKey } from "../../../target-model/types/object-shape-identity.js";
import { selectCsharpStructuralObjectCarrier } from "../objects/shape-carriers.js";
import { objectShapeMemberTargetName } from "../../identities/source-member-names.js";
import { getCsharpMethodValue } from "../../../target-model/types/method-values.js";
import { csharpCarrierAdmitsSourceAbsence, csharpEmptyObjectTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { getCsharpCallableMembers } from "../../../target-model/types/carriers/delegates.js";
import { representCsharpOptionalStorage } from "./representation-optional.js";

export function representSourceShape(host: CsharpRepresentationHost, view: CsharpRepresentationView,
  evidence: SourceTypeEvidence, site: Node, callable: CsharpRepresentedType | undefined): CsharpRepresentationOutcome<CsharpRepresentedType> {
  const descriptor = evidence.type;
  if (descriptor.kind !== "shape") throw new TypeError("A structural Native shape requires its original Source shape evidence.");
  if ((descriptor.calls.length !== 0 || descriptor.constructs.length !== 0) !== (callable !== undefined)) {
    throw new TypeError("A composite Native shape requires its same full-vector callable contract exactly once.");
  }
  if (descriptor.indexes.length !== 0) {
    if (descriptor.members.length !== 0 || callable !== undefined) return nativeRepresentationFailure(site, "CSHARP_INDEX_MEMBER_STORAGE_UNSUPPORTED",
      "A combined indexed/member shape requires a Native storage owning both complete inventories.");
    const indexes: { readonly key: CsharpRepresentedType; readonly value: CsharpRepresentedType; readonly readonly: boolean }[] = [];
    for (const index of descriptor.indexes) {
      const key = sourceOutcome(host.source.component(evidence, { kind: "index-key", declaration: index.declaration }));
      if (key.kind !== "represented") return key;
      const value = sourceOutcome(host.source.component(evidence, { kind: "index-value", declaration: index.declaration }));
      if (value.kind !== "represented") return value;
      const representedKey = view.represent(key.value, "type-argument", site);
      if (representedKey.kind !== "represented") return representedKey;
      const representedValue = view.represent(value.value, "type-argument", site);
      if (representedValue.kind !== "represented") return representedValue;
      indexes.push({ key: representedKey.value, value: representedValue.value, readonly: index.readonly });
    }
    const first = indexes[0]!;
    if (indexes.some(index => !targetTypeRefEquals(host.typeIdentity, index.key.carrier, first.key.carrier) ||
      !targetTypeRefEquals(host.typeIdentity, index.value.carrier, first.value.carrier) || index.readonly !== first.readonly)) {
      return nativeRepresentationFailure(site, "CSHARP_INDEX_STORAGE_UNSUPPORTED", "Native indexed storage must preserve every original index key, payload and write contract.");
    }
    const carrier = host.indexType(first.key.carrier, first.value.carrier, first.readonly, site);
    return carrier.kind !== "represented" ? carrier : represented(Object.freeze({ kind: "direct", evidence, carrier: carrier.value,
      requirements: representationRequirements(host.typeIdentity, indexes.flatMap(index => [index.key.requirements, index.value.requirements])) }));
  }
  const members: CsharpObjectShapeMemberFact[] = [];
  const children: CsharpRepresentedType[] = callable === undefined ? [] : [callable];
  const names = new Set<string>();
  const physicalNames = new Set(descriptor.members.map(member => objectShapeMemberTargetName(member.name)));
  for (const member of [...descriptor.members].sort((left, right) => left.name.localeCompare(right.name))) {
    if (names.has(member.name)) throw new TypeError("A Source shape requires unique original member keys.");
    names.add(member.name);
    const child = sourceOutcome(host.source.component(evidence, { kind: "member", origin: member.origin }));
    if (child.kind !== "represented") return child;
    const value = view.represent(child.value, "storage", site);
    if (value.kind !== "represented") return value;
    children.push(value.value);
    const declaration = host.memberDeclaration(member.origin, site);
    if (declaration.kind !== "represented") return declaration;
    if (member.origin.kind === "declared" && !declaration.value.declarations.includes(member.origin.declaration)) {
      throw new TypeError("A Native shape member must retain the exact original Source member declaration.");
    }
    const memberContract = getCsharpMethodValue(value.value.carrier)?.contract ?? value.value.carrier;
    const nativeMethods = declaration.value.kind === "method" ? getCsharpCallableMembers(memberContract) : undefined;
    if (declaration.value.kind === "method" && (nativeMethods === undefined || nativeMethods.length === 0)) return nativeRepresentationFailure(site,
      "CSHARP_METHOD_STORAGE_UNSUPPORTED", "The complete Native method contract requires its exact physical member association.");
    const targetName = objectShapeMemberTargetName(member.name);
    const methods = nativeMethods?.map(method => {
      let name = nativeMethods.length === 1 ? targetName : `__tsonic_shape_call_${targetName}_${method.name}`;
      if (nativeMethods.length !== 1) {
        while (physicalNames.has(name)) name = `_${name}`;
        physicalNames.add(name);
      }
      return Object.freeze({ member: Object.freeze({ ...method, name }), value: method });
    });
    const optionalStorage = member.optional && !csharpCarrierAdmitsSourceAbsence(value.value.carrier)
      ? representCsharpOptionalStorage(host, value.value.carrier, site) : undefined;
    if (optionalStorage !== undefined && optionalStorage.kind !== "represented") return optionalStorage;
    const optional = optionalStorage?.value;
    if (optional !== undefined) children.push(Object.freeze({ ...value.value, carrier: optional.carrier, requirements: optional.requirements }));
    const physicalMember = { sourceKey: Object.freeze({ kind: "property" as const, name: member.name }), sourceName: member.name,
      targetName,
      type: declaration.value.kind === "method" ? memberContract : optional?.carrier ?? value.value.carrier,
      optional: member.optional, readonly: member.readonly, origins: Object.freeze([member.origin]),
      sourceDeclarations: declaration.value.declarations,
      sourceSubjects: declaration.value.declarations,
      ...(declaration.value.bound ? { bound: true as const } : {}),
      ...(declaration.value.accessor === undefined ? {} : { accessor: declaration.value.accessor }) };
    if (declaration.value.kind === "method") {
      if (methods === undefined) throw new TypeError("A Native method requires its complete physical member vector.");
      members.push(Object.freeze({ ...physicalMember, memberKind: "method", methods: Object.freeze(methods) }));
    } else members.push(Object.freeze({ ...physicalMember, memberKind: "property" }));
  }
  const requirements = representationRequirements(host.typeIdentity, children.map(value => value.requirements));
  const canonical = Object.freeze(canonicalCsharpObjectShapeMembers(host.typeIdentity, members));
  const contract = host.shapeKind(evidence.component.root) === "contract";
  const interfaces = callable === undefined ? [] : [callable.carrier];
  const physical = canonical.length === 0 && callable === undefined ? csharpEmptyObjectTargetType()
    : selectCsharpStructuralObjectCarrier(host.typeIdentity, canonical, interfaces, requirements, contract, undefined);
  const callableMembers = callable === undefined ? undefined : getCsharpCallableMembers(callable.carrier);
  if (callable !== undefined && (callable.carrier.kind !== "target-named" ||
    (callable.carrier as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind !== "interface" || callableMembers === undefined)) {
    throw new TypeError("A composite Native callable shape requires its real complete interface contract, never a delegate base.");
  }
  const carrier: TargetTypeRef = callableMembers === undefined ? physical : Object.freeze({ ...physical,
    csharpCallableMembers: callableMembers, csharpTypeofRuntimeKind: "function" as const });
  const shape: CsharpObjectShapeFact = Object.freeze({ targetType: carrier, members: canonical,
    ...(interfaces.length === 0 ? {} : { implements: Object.freeze(interfaces) }) });
  const retained = host.retainShape(shape, site);
  if (retained.kind !== "represented") return retained;
  if (csharpObjectShapeContractKey(host.typeIdentity, retained.value) !== csharpObjectShapeContractKey(host.typeIdentity, shape)) {
    throw new TypeError("A retained Native structural shape must preserve its complete canonical physical member contract.");
  }
  return represented(Object.freeze({ kind: "direct", evidence, carrier: retained.value.targetType, requirements }));
}
