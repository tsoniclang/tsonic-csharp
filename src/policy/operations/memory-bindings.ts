import type { Node, SourceFile } from "@tsonic/tsts";
import { selectTsonicMemoryFieldBinding, selectTsonicMemoryRecordBinding } from "@tsonic/source-core/facts";
import type { CsharpPolicyContext } from "../model/context.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../target-model/types/model.js";
import { csharpRuntimeLocationTargetType, isCsharpEmptyObjectTargetType } from "../../target-model/types/runtime-carriers.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../target-model/types/object-shape-members.js";
import { readCsharpSourceField } from "../types/resolution/source-markers.js";

export type CsharpMemoryBindingSelection =
  | { readonly kind: "rejected"; readonly reason: string }
  | { readonly kind: "field"; readonly type: TargetTypeRef; readonly expression: Node }
  | { readonly kind: "record"; readonly type: TargetTypeRef; readonly shape: CsharpObjectShapeFact;
      readonly fields: readonly { readonly expression: Node; readonly member: CsharpObjectShapeMemberFact }[] };

export function selectCsharpMemoryBinding(
  input: CsharpPolicyContext, node: Node, file: SourceFile,
): CsharpMemoryBindingSelection | undefined {
  if (input.sourceFacts === undefined) return undefined;
  const field = selectTsonicMemoryFieldBinding(input.ast, input.sourceFacts, node);
  const record = selectTsonicMemoryRecordBinding(input.ast, input.sourceFacts, node);
  if (field === undefined && record === undefined) return undefined;
  const reject = (reason: string): CsharpMemoryBindingSelection => ({ kind: "rejected", reason });
  if (field?.kind === "rejected") return reject(field.reason);
  if (record?.kind === "rejected") return reject(record.reason);
  if (field?.kind === "resolved") {
    const operation = field.operation;
    const typeNode = input.ast.typeNode(operation.field.selectedDeclaration) ??
      readCsharpSourceField(input.sourceFacts, [operation.field.selectedDeclaration])?.sourceType;
    const pointee = input.types.resolveSelectedType(typeNode, operation.pointeeType, file);
    if (pointee === undefined) return reject("The bound field has no exact C# value carrier.");
    const type = csharpRuntimeLocationTargetType(pointee);
    const selectedPointer = input.types.resolveNode(operation.pointerExpression, file);
    if (selectedPointer === undefined || !targetTypeRefEquals(type, selectedPointer)) {
      return reject("The selected location and bound field have different C# pointee carriers.");
    }
    return Object.freeze({ kind: "field", type, expression: operation.pointerExpression });
  }
  if (record?.kind !== "resolved") return reject("The record binding has no finalized operation.");
  const operation = record.operation;
  const type = input.types.resolveSelectedType(operation.layout.explicitTypeNode, operation.sourceType, file);
  const shape = type !== undefined && isCsharpEmptyObjectTargetType(type) && operation.fields.length === 0
    ? Object.freeze({ targetType: type, members: Object.freeze([]) })
    : input.objectShapes.resolveType(operation.sourceType, file, operation.layout.explicitTypeNode);
  if (type === undefined || shape === undefined || shape.members.length !== operation.fields.length ||
    !targetTypeRefEquals(type, shape.targetType)) return reject("The bound record requires one exact complete C# structural carrier.");
  const used = new Set<CsharpObjectShapeMemberFact>();
  const fields: { expression: Node; member: CsharpObjectShapeMemberFact }[] = [];
  for (const entry of operation.fields) {
    const selection = resolveCsharpObjectShapeMemberBySelectedSubject(shape,
      [entry.binding.field.selectedDeclaration, entry.binding.field.selectedSymbol]);
    if (selection.kind !== "resolved" || used.has(selection.member)) return reject("The bound field has no unique selected C# storage member.");
    const member = selection.member;
    if (member.bound !== true || member.memberKind !== "property" || member.optional || member.accessor !== undefined) {
      return reject("The selected record member has no finalized live-location storage.");
    }
    const selectedPointer = input.types.resolveNode(entry.expression, file);
    if (selectedPointer === undefined || !targetTypeRefEquals(selectedPointer, csharpRuntimeLocationTargetType(member.type))) {
      return reject("The bound member and supplied location have different C# pointee carriers.");
    }
    used.add(member);
    fields.push(Object.freeze({ expression: entry.expression, member }));
  }
  return Object.freeze({ kind: "record", type, shape, fields: Object.freeze(fields) });
}
