import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef, CsharpObjectShapeFact } from "../../target-model/types/model.js";
import type { CsharpObjectShapeDemand } from "../../target-model/records/object-shape-demand.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/conversions.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage.js";
import { targetTypeRefKey } from "../../target-model/types/equality.js";
import { getCsharpNullableElementTargetType, isCsharpRuntimeUnionTargetType, isCsharpEmptyObjectTargetType, isCsharpJsValueObjectShapeTargetType } from "../../target-model/types/index.js";
import { getCsharpMethodValue } from "../../target-model/types/method-values.js";
import { createCsharpTypeEmissionProducer } from "../program/records/type-emission.js";
import { selectCsharpTypeEmission } from "../../policy/types/type-emission.js";
import { selectCsharpTypeUnsafeContext } from "../../policy/safety/native-types.js";
import { getCsharpGenericOptionalParts } from "../../target-model/types/projections.js";
import { csharpCarrierAdmitsSourceAbsence, isCsharpJsValueTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { csharpCollectionElementRead } from "../../target-model/types/carriers/collection-reads.js";
import { getCsharpIndexableLengthMemberName } from "../../target-model/types/carriers/collections.js";

export function analyzeCsharpTypeEmission(input: { readonly ast: AstReader; readonly nodes: readonly Node[];
  readonly languageDialect: import("../../target-model/configuration/model.js").CsharpLanguageDialect;
  readonly extraTypes: readonly TargetTypeRef[];
  readonly evidence: CsharpSourceEvidenceIndex; readonly values: CsharpValueReadClassifications;
  readonly storage: CsharpStorageClassifications; readonly shapes: CsharpObjectShapeDemand; readonly admitted: (node: Node) => boolean }) {
  const producer = createCsharpTypeEmissionProducer();
  const issues: TargetDiagnostic[] = [];
  const pending = [...input.evidence.targetTypes, ...input.extraTypes];
  const admissions = new Map<string, boolean>();
  const validate = (carrier: TargetTypeRef, node: Node): void => {
    const key = targetTypeRefKey(carrier);
    let valid = admissions.get(key);
    if (valid === undefined) { valid = selectCsharpTypeEmission({ carrier }); admissions.set(key, valid); }
    if (!valid) issues.push({ code: carrier.kind === "opaque" ? "CSHARP_OPAQUE_TARGET_TYPE_UNSUPPORTED" : "CSHARP_UNSUPPORTED_AST",
      category: "error", source: "tsonic-csharp", sourceNode: node, message: carrier.kind === "opaque"
        ? `Opaque target type '${carrier.id}' has no renderable C# source representation.`
        : `C# type policy resolved '${carrier.kind}', but that target type has no renderable C# syntax.` });
  };
  for (const node of input.nodes) {
    const carrier = input.values.valueRead.get(node)?.value;
    const storage = input.storage.storageType.get(node);
    if (carrier !== undefined) { pending.push(carrier); if (input.admitted(node)) validate(carrier, node); }
    if (storage !== undefined) pending.push(storage);
    const parent = input.ast.parent(node);
    const constraints = input.evidence.typeParameterConstraints.get(node);
    if (parent !== undefined && input.admitted(parent) && constraints?.kind === "resolved")
      for (const constraint of constraints.constraints) if (constraint.kind === "type") { pending.push(constraint.type); validate(constraint.type, node); }
  }
  const children = (carrier: TargetTypeRef): readonly TargetTypeRef[] => {
    const method = getCsharpMethodValue(carrier);
    if (method !== undefined) return [method.owner];
    switch (carrier.kind) {
      case "target-named": return carrier.typeArguments ?? [];
      case "array": return [carrier.element];
      case "tuple": return carrier.elements;
      case "pointer": return [carrier.pointee];
      case "function-pointer": return [...carrier.args, carrier.result];
      case "source-primitive": case "type-parameter": case "opaque": return [];
    }
  };
  for (const fact of Object.values(input.shapes.targetShapes)) pending.push(fact.targetType,
    ...fact.members.map(member => member.methodStorageType ?? member.type), ...fact.implements ?? []);
  const seen = new Set<string>();
  for (let index = 0; index < pending.length; index++) {
    const root = pending[index]!;
    const key = targetTypeRefKey(root);
    if (seen.has(key)) continue;
    seen.add(key);
    const shapes = new Set<CsharpObjectShapeFact>();
    const payloads = new Set<CsharpObjectShapeFact>();
    const visited = new Set<TargetTypeRef>();
    const shape = (fact: CsharpObjectShapeFact, payload: boolean): void => {
      if (isCsharpJsValueObjectShapeTargetType(fact.targetType) || isCsharpEmptyObjectTargetType(fact.targetType)) return;
      shapes.add(fact);
      if (!payload || payloads.has(fact)) return;
      payloads.add(fact);
      for (const member of fact.members) visit(member.methodStorageType ?? member.type);
      for (const inherited of fact.implements ?? []) visit(inherited);
    };
    const visit = (carrier: TargetTypeRef): void => {
      if (visited.has(carrier)) return;
      visited.add(carrier);
      const method = getCsharpMethodValue(carrier);
      if (method !== undefined) { visit(method.owner); return; }
      const fact = input.shapes.targetShapes[targetTypeRefKey(getCsharpNullableElementTargetType(carrier) ?? carrier)];
      if (fact !== undefined) shape(fact, false);
      if (isCsharpRuntimeUnionTargetType(carrier)) for (const payload of carrier.csharpRuntimeUnionObjectShapes ?? [])
        if (payload !== undefined) { shape(payload, true); visit(payload.targetType); }
      for (const child of children(carrier)) visit(child);
    };
    visit(root);
    const optional = getCsharpGenericOptionalParts(root);
    if (optional !== undefined) pending.push(optional.element, optional.operations);
    const collectionRead = csharpCollectionElementRead(root);
    if (collectionRead?.kind === "method" && collectionRead.member.declaringType !== undefined) pending.push(collectionRead.member.declaringType);
    producer.publish(root, { objectShapes: Object.freeze([...shapes]),
      collectionRead: collectionRead?.kind === "invalid" ? undefined : collectionRead,
      collectionLength: getCsharpIndexableLengthMemberName(root),
      optionalStorage: optional === undefined ? Object.freeze({ kind: "native", present: getCsharpNullableElementTargetType(root) ?? root,
        absence: csharpCarrierAdmitsSourceAbsence(root), jsValue: isCsharpJsValueTargetType(root) })
        : Object.freeze({ kind: "generic", present: optional.element, operations: optional.operations }),
      unsafeContext: input.languageDialect === "csharp14" && selectCsharpTypeUnsafeContext(root) });
    pending.push(...visited);
  }
  return Object.freeze({ records: producer.seal(), issues: Object.freeze(issues) });
}
