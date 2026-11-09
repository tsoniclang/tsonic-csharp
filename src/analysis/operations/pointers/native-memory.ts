import type { SourceMemoryLayout, SourceTypeBinding } from "@tsonic/target-api/source";
import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpMemoryAnalysisHost, CsharpMemoryOutcome } from "../../../policy/model/memory.js";
import type { CsharpNativeMemoryField, CsharpNativeMemoryLayout } from "../../../target-model/operations/native-memory.js";
import type { CsharpRawLocationSelection } from "../../../target-model/records/native/native-memory.js";
import type { CsharpObjectShapeMemberFact } from "../../../target-model/types/model.js";
import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import { applyCsharpNativeDeclaration } from "../../../target-model/types/native-declaration-operations.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { csharpRuntimeLocationPointee, csharpRuntimeRawPointerTargetType, isCsharpAbsenceTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { represented, sourceOutcome, nativeRepresentationFailure } from "../../../policy/types/source-type-flow/representation-results.js";
import { csharpFixedArrayRepresentationRejection } from "../../../policy/types/collections/fixed-arrays.js";
import { createCsharpMetadataBudget } from "../../../target-model/metadata/immutable.js";
import { selectCsharpMemoryRuntimeDefinition } from "./runtime-definitions.js";
import { sourceMemberOriginsEqual } from "../../objects/shapes/member-origins.js";
import { csharpStructuralObjectShapeIdentity } from "../../../target-model/types/object-shape-identity.js";
import { isCsharpValueTypeTargetType } from "../../../target-model/types/identity.js";

interface PhysicalField {
  readonly identity: string | CsharpObjectShapeMemberFact;
  readonly name: string;
  readonly type: TargetTypeRef;
  readonly declarations: readonly Node[];
  readonly member: CsharpObjectShapeMemberFact | undefined;
}

export function selectCsharpNativeMemoryLayout(host: CsharpMemoryAnalysisHost, root: SourceMemoryLayout,
  bindings: readonly SourceTypeBinding[]): CsharpMemoryOutcome<CsharpNativeMemoryLayout> {
  const completed = new Map<SourceMemoryLayout, CsharpNativeMemoryLayout>();
  const active = new Set<SourceMemoryLayout>();
  const budget = createCsharpMetadataBudget();
  const reject = (layout: SourceMemoryLayout, reason: string) =>
    nativeRepresentationFailure(layout.occurrence, "CSHARP_NATIVE_MEMORY_LAYOUT_NOT_PROVEN", reason);
  function select(layout: SourceMemoryLayout, depth: number): CsharpMemoryOutcome<CsharpNativeMemoryLayout> {
    budget.reserve(1, depth);
    const evidence = sourceOutcome(host.representation.source.substitute(layout.source, bindings));
    if (evidence.kind !== "represented") return evidence;
    const representedType = host.representation.represent(evidence.value, "storage", layout.occurrence);
    if (representedType.kind !== "represented") return representedType;
    const previous = completed.get(layout);
    if (previous !== undefined) return represented(previous);
    if (active.has(layout)) return reject(layout, "A Native memory layout requires finite physical storage.");
    active.add(layout);
    try {
      const carrier = representedType.value.carrier;
      const base = { pointeeType: carrier, size: layout.byteSize, alignment: layout.byteAlignment,
        width: layout.dataLayout.addressWidth, littleEndian: layout.dataLayout.byteOrder === "little" };
      const maximum = (1n << BigInt(base.width)) - 1n;
      if (base.size < 0n || base.size > maximum || base.alignment <= 0n ||
        (base.alignment & (base.alignment - 1n)) !== 0n || layout.stride < base.size || layout.stride % base.alignment !== 0n) {
        return reject(layout, "The finalized layout dimensions must fit their exact Native address ABI.");
      }
      let result: CsharpNativeMemoryLayout;
      if (layout.kind === "array") {
        const reason = csharpFixedArrayRepresentationRejection(layout.extent.length);
        if (reason !== undefined) return reject(layout, reason);
        if (carrier.kind !== "array" || carrier.rank !== undefined) {
          return reject(layout, "Native fixed-array backing requires the exact SZ-array storage carrier.");
        }
        const element = select(layout.element, depth + 1);
        if (element.kind !== "represented") return element;
        if (!targetTypeRefEquals(carrier.element, element.value.pointeeType) ||
          element.value.width !== base.width || element.value.littleEndian !== base.littleEndian ||
          layout.byteSize !== layout.element.stride * layout.extent.length) {
          return reject(layout, "A Native array requires its complete exact element, extent, stride and address ABI.");
        }
        result = Object.freeze({ ...base, kind: "array", length: layout.extent.length.toString(),
          stride: layout.element.stride, element: element.value });
      } else if (carrier.kind === "source-primitive") {
        if (layout.fields.length !== 0 || csharpNativeScalarByteSize(carrier, base.width) !== base.size) {
          return reject(layout, "The scalar layout must have its exact all-bit-pattern Native size and no fields.");
        }
        result = Object.freeze({ ...base, kind: "scalar", fields: Object.freeze([]) });
      } else {
        if (carrier.kind !== "target-named") return reject(layout, "Native record memory requires one exact physical struct carrier.");
        const physical = physicalFields(host, carrier, layout);
        if (physical.kind !== "represented") return physical;
        if (physical.value.length !== layout.fields.length) return reject(layout, "Every actual Native field must occur exactly once in the memory layout.");
        budget.reserve(layout.fields.length);
        const selected = new Map<PhysicalField["identity"], CsharpNativeMemoryField>();
        for (const field of layout.fields) {
          if (field.member.readonly || field.member.optional) return reject(layout, "Native memory fields require their complete mutable Source field contract.");
          const origins = [...field.member.origins, ...field.member.readOrigins, ...field.member.writeOrigins];
          const matches = physical.value.filter(candidate => {
            const member = candidate.member;
            return member === undefined
              ? field.selectedDeclarations.length !== 0 && field.selectedDeclarations.every(declaration => candidate.declarations.includes(declaration))
              : origins.length !== 0 && origins.every(origin => member.origins?.some(original => sourceMemberOriginsEqual(original, origin)) === true);
          });
          if (matches.length !== 1) return reject(layout, "Each selected Source field must retain its exact complete physical declaration association.");
          const member = matches[0]!;
          const child = select(field.layout, depth + 1);
          if (child.kind !== "represented") return child;
          if (selected.has(member.identity) || !targetTypeRefEquals(member.type, child.value.pointeeType) ||
            child.value.width !== base.width || child.value.littleEndian !== base.littleEndian ||
            field.byteAlignment <= 0n || field.byteOffset < 0n || field.byteOffset + child.value.size > base.size ||
            field.byteOffset % field.byteAlignment !== 0n) {
            return reject(layout, "Native field layouts require exact storage types, unique identities and admitted offsets/alignment.");
          }
          selected.set(member.identity, Object.freeze({ name: member.name, offset: field.byteOffset,
            alignment: field.byteAlignment, layout: child.value }));
        }
        const fields = physical.value.map(field => selected.get(field.identity));
        if (fields.some(field => field === undefined)) return reject(layout, "The complete Native field inventory cannot be truncated.");
        result = Object.freeze({ ...base, kind: "record", fields: Object.freeze(fields.map(field => field!)) });
      }
      completed.set(layout, result);
      return represented(result);
    } finally { active.delete(layout); }
  }
  return select(root, 0);
}

function physicalFields(host: CsharpMemoryAnalysisHost, carrier: Extract<TargetTypeRef, { readonly kind: "target-named" }>,
  layout: Extract<SourceMemoryLayout, { readonly kind: "value" }>): CsharpMemoryOutcome<readonly PhysicalField[]> {
  const shape = host.objectShapes.resolveTarget(carrier);
  if (shape !== undefined && csharpStructuralObjectShapeIdentity(carrier) !== undefined) {
    if (!isCsharpValueTypeTargetType(carrier)) return nativeRepresentationFailure(layout.occurrence,
      "CSHARP_NATIVE_MEMORY_LAYOUT_NOT_PROVEN", "Native record memory requires an actual emitted value-type declaration.");
    const declarations = host.objectMembers.objectMemberDeclarations.get(shape);
    if (declarations === undefined) failTargetAnalysisInvariant("tsonic-csharp", "Physical memory requires the completed canonical Native member declarations.", layout.occurrence);
    const fields: PhysicalField[] = [];
    for (const emission of declarations) {
      const declaration = emission.declaration;
      if (declaration.kind !== "field" || emission.member.memberKind !== "property" || emission.member.readonly === true) {
        return nativeRepresentationFailure(layout.occurrence, "CSHARP_NATIVE_MEMORY_LAYOUT_NOT_PROVEN", "Native record memory requires its complete mutable physical field inventory.");
      }
      fields.push(Object.freeze({ identity: emission.member, member: emission.member, name: emission.member.targetName,
        type: declaration.type, declarations: emission.member.sourceDeclarations ?? Object.freeze([]) }));
    }
    return represented(Object.freeze(fields));
  }
  const acquired = host.providers.acquireNativeDeclaration(carrier.id);
  if (acquired.kind === "rejected") return Object.freeze({ kind: "provider-refused", diagnostic: acquired.diagnostic });
  if (acquired.kind === "missing") failTargetAnalysisInvariant("tsonic-csharp", "Native memory requires its complete acquired physical declaration.", layout.occurrence);
  const application = applyCsharpNativeDeclaration(acquired.definition, carrier);
  if (application === undefined || application.definition.kind !== "struct") return nativeRepresentationFailure(layout.occurrence,
    "CSHARP_NATIVE_MEMORY_LAYOUT_NOT_PROVEN", "Native record memory requires its exact constructed struct definition.");
  const fields: PhysicalField[] = [];
  for (const slot of application.members) {
    if (slot.kind !== "slot" || slot.member.static || slot.member.kind !== "field") continue;
    if (slot.storage === undefined || slot.storage.readonly) return nativeRepresentationFailure(layout.occurrence,
      "CSHARP_NATIVE_MEMORY_LAYOUT_NOT_PROVEN", "Native record memory cannot omit readonly or unknown physical field storage.");
    const declarations = new Set<Node>();
    for (const field of layout.fields) for (const declaration of field.selectedDeclarations) {
      const source = host.facts.navigation.providerDeclaration(declaration);
      if (source.kind === "none") continue;
      const relations = host.providers.resolveMember(source.value);
      if (relations.kind === "rejected") return Object.freeze({ kind: "provider-refused", diagnostic: relations.diagnostic });
      if (relations.kind !== "resolved") continue;
      if (relations.relations.some(relation => relation.kind === "member" && relation.targetBinding.id === carrier.id &&
        relation.targetMember.id === slot.member.id)) declarations.add(declaration);
    }
    fields.push(Object.freeze({ identity: slot.member.id, member: undefined, name: slot.member.targetName,
      type: slot.storage.type, declarations: Object.freeze([...declarations]) }));
  }
  return represented(Object.freeze(fields));
}

export function selectCsharpRawLocation(host: CsharpMemoryAnalysisHost, node: Node): CsharpMemoryOutcome<CsharpRawLocationSelection | undefined> {
  const bindings = host.sourceStorage.bindingsForLexicalOwner(node);
  if (bindings.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: bindings });
  if (bindings.kind === "unresolved") return bindings;
  const proof = host.sourceStorage.memory.rawLocation.resolve(node, bindings.bindings);
  if (proof.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: proof });
  if (proof.kind === "unresolved") return proof;
  if (proof.value.kind === "none") return represented(undefined);
  const source = proof.value.value;
  const layout = selectCsharpNativeMemoryLayout(host, source.layout, source.typeBindings);
  if (layout.kind !== "represented") return layout;
  const operand = source.operation.operation === "to-raw" ? source.operation.pointer : source.operation.raw;
  const selected = host.nativeValue(operand.occurrence);
  if (selected.kind !== "represented") return selected;
  const definition = selectCsharpMemoryRuntimeDefinition(host, source.operation.operation === "to-raw" ? "Location" : "RawPointer", node);
  if (definition.kind !== "represented") return definition;
  const present = getCsharpNullableElementTargetType(selected.value) ?? selected.value;
  const physical = source.operation.operation === "to-raw" ? csharpRuntimeLocationPointee(present, definition.value)
    : targetTypeRefEquals(present, csharpRuntimeRawPointerTargetType(definition.value)) ? layout.value.pointeeType : undefined;
  if (!isCsharpAbsenceTargetType(present) && (physical === undefined || !targetTypeRefEquals(physical, layout.value.pointeeType))) {
    return nativeRepresentationFailure(node, "CSHARP_RAW_LOCATION_CARRIER_MISMATCH", "The completed Source raw proof requires the identical actual Native pointee carrier.");
  }
  return represented(Object.freeze({ kind: "raw-location", method: source.operation.operation === "to-raw" ? "ToRaw" : "Reinterpret",
    expression: operand.occurrence, inputType: selected.value, layout: layout.value }));
}

function csharpNativeScalarByteSize(carrier: TargetTypeRef, addressWidth: 32 | 64): bigint | undefined {
  if (carrier.kind !== "source-primitive") return undefined;
  if (carrier.name === "native-int" || carrier.name === "native-uint") return BigInt(addressWidth) / 8n;
  const sizes: Readonly<Partial<Record<string, bigint>>> = { int8: 1n, uint8: 1n, int16: 2n, uint16: 2n,
    int32: 4n, uint32: 4n, int64: 8n, uint64: 8n, int128: 16n, uint128: 16n, float16: 2n, float32: 4n, float64: 8n };
  return sizes[carrier.name];
}
