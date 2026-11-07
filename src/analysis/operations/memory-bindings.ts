import type { CsharpMemoryBindingSelection } from "../../target-model/records/storage/memory-bindings.js";
import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { selectTsonicMemoryFieldBindingFacts, selectTsonicMemoryRecordBindingFacts } from "@tsonic/source-core/facts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpObjectShapeMemberFact } from "../../target-model/types/model.js";
import { csharpRuntimeLocationTargetType, isCsharpEmptyObjectTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../target-model/types/object-shape-members.js";
import { isCsharpRefusal } from "../../representation/index.js";
import { csharpPointerStorageDomainRejection } from "./pointers/storage-domain.js";

type CsharpMemoryBindingRejection = Extract<CsharpMemoryBindingSelection, { readonly kind: "rejected" }>;

export function selectCsharpMemoryBinding(
  input: CsharpPolicyContext, node: Node,
): CsharpMemoryBindingSelection | undefined {
  if (input.sourceFacts === undefined) return undefined;
  const field = selectTsonicMemoryFieldBindingFacts(input.ast, input.sourceFacts, node);
  const record = selectTsonicMemoryRecordBindingFacts(input.ast, input.sourceFacts, node);
  if (field === undefined && record === undefined) return undefined;
  const reject = (code: CsharpMemoryBindingRejection["code"], reason: string): CsharpMemoryBindingSelection =>
    ({ kind: "rejected", code, reason });
  // A rejected memory-binding fact is a Source-form refusal of the source-core extension; it is reported by the
  // fact protocol before C# analysis (request F2-B3) and never re-originated here.
  if (field?.kind === "rejected" || record?.kind === "rejected") return failTargetAnalysisInvariant("tsonic-csharp",
    "A rejected memory-binding fact reached C# analysis; the source-core extension reports it.", node);
  if (field?.kind === "resolved") {
    const operation = field.operation;
    // The bound field's carrier is its published declared slot (R2), never the checker pointee type.
    const pointee = input.types.storage(operation.field.selectedDeclaration);
    if (isCsharpRefusal(pointee)) return reject(pointee.code, pointee.message);
    const type = csharpRuntimeLocationTargetType(pointee);
    const selectedPointer = input.types.value(operation.pointerExpression);
    if (isCsharpRefusal(selectedPointer)) return reject(selectedPointer.code, selectedPointer.message);
    if (!targetTypeRefEquals(type, selectedPointer)) {
      return reject("CSHARP_MEMORY_BINDING_POINTEE_MISMATCH", "The selected location and bound field have different C# pointee carriers.");
    }
    const domain = csharpPointerStorageDomainRejection(input, operation.pointerExpression, pointee);
    if (domain !== undefined) return reject("CSHARP_POINTER_STORAGE_DOMAIN", domain);
    return Object.freeze({ kind: "field", type, expression: operation.pointerExpression });
  }
  if (record?.kind !== "resolved") return failTargetAnalysisInvariant("tsonic-csharp",
    "A record memory binding reached C# analysis without its finalized operation.", node);
  const operation = record.operation;
  // The bound record's carrier is the published value type of the binding operation.
  const type = input.types.value(node);
  if (isCsharpRefusal(type)) return reject(type.code, type.message);
  const shape = isCsharpEmptyObjectTargetType(type) && operation.fields.length === 0
    ? Object.freeze({ targetType: type, members: Object.freeze([]) })
    : input.objectShapes.resolveTarget(type);
  if (shape === undefined || shape.members.length !== operation.fields.length || !targetTypeRefEquals(type, shape.targetType)) {
    return reject("CSHARP_MEMORY_BINDING_RECORD_CARRIER", "The bound record requires one exact complete C# structural carrier.");
  }
  const used = new Set<CsharpObjectShapeMemberFact>();
  const fields: { expression: Node; member: CsharpObjectShapeMemberFact }[] = [];
  for (const entry of operation.fields) {
    const selection = resolveCsharpObjectShapeMemberBySelectedSubject(shape, [entry.binding.field.selectedDeclaration]);
    if (selection.kind !== "resolved" || used.has(selection.member)) {
      return reject("CSHARP_MEMORY_BINDING_MEMBER_STORAGE", "The bound field has no unique selected C# storage member.");
    }
    const member = selection.member;
    if (member.bound !== true || member.memberKind !== "property" || member.optional || member.accessor !== undefined) {
      return reject("CSHARP_MEMORY_BINDING_MEMBER_STORAGE", "The selected record member has no finalized live-location storage.");
    }
    const selectedPointer = input.types.value(entry.binding.pointerExpression);
    if (isCsharpRefusal(selectedPointer)) return reject(selectedPointer.code, selectedPointer.message);
    if (!targetTypeRefEquals(selectedPointer, csharpRuntimeLocationTargetType(member.type))) {
      return reject("CSHARP_MEMORY_BINDING_POINTEE_MISMATCH", "The bound member and supplied location have different C# pointee carriers.");
    }
    const domain = csharpPointerStorageDomainRejection(input, entry.binding.pointerExpression, member.type);
    if (domain !== undefined) return reject("CSHARP_POINTER_STORAGE_DOMAIN", domain);
    used.add(member);
    fields.push(Object.freeze({ expression: entry.expression, member }));
  }
  return Object.freeze({ kind: "record", type, shape, fields: Object.freeze(fields) });
}
