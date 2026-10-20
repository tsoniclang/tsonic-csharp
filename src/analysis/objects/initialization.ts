import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpObjectInitialization, CsharpObjectLiteralMemberEmission } from "../../target-model/records/object-literals.js";
import type { CsharpObjectCaptureField } from "../../target-model/records/object-methods.js";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { getCsharpGenericOptionalParts } from "../../target-model/types/projections.js";
import { csharpCarrierAdmitsSourceAbsence } from "../../target-model/types/carriers/runtime-carriers.js";
import { objectShapeStorageMemberName } from "../../target-model/names/object-members.js";

export function analyzeCsharpObjectInitialization(node: Node, shape: CsharpObjectShapeFact,
  members: readonly CsharpObjectLiteralMemberEmission[], captures: readonly CsharpObjectCaptureField[],
  never: (expression: Node) => boolean): { readonly value: CsharpObjectInitialization; readonly issues: readonly TargetDiagnostic[] } {
  const slots = new Map<string, { readonly name: string; readonly carrier: TargetTypeRef; readonly initializeAbsence: boolean; definite: boolean }>();
  const issues: TargetDiagnostic[] = [];
  let inlineUnique = true;
  let exits = false;
  const append = (name: string, carrier: TargetTypeRef, optional: boolean): void => {
    const existing = slots.get(name);
    if (existing !== undefined) {
      inlineUnique = false;
      if (!targetTypeRefEquals(existing.carrier, carrier)) issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error",
        source: "tsonic-csharp", sourceNode: node, message: "Native object construction requires one exact storage carrier for every initialized member." });
      if (!optional) existing.definite = true;
      return;
    }
    const initializeAbsence = optional && (getCsharpGenericOptionalParts(carrier) !== undefined || csharpCarrierAdmitsSourceAbsence(carrier));
    slots.set(name, { name, carrier, initializeAbsence, definite: !optional || initializeAbsence });
  };
  if (shape.methodImplementation?.declaration === node) for (const capture of captures) append(capture.name, capture.type, false);
  for (const member of members) {
    switch (member.kind) {
      case "authored": break;
      case "method": case "accessor": append(member.callable.storageName, member.callable.storage, false); break;
      case "value": append(objectShapeStorageMemberName(shape, member.member), member.member.type, false);
        exits ||= never(member.initializer); break;
      case "spread":
        inlineUnique &&= member.presence.kind === "required" && member.fields.length === 1;
        for (const field of member.fields) append(field.target, field.carrier, member.presence.kind === "optional");
        exits ||= never(member.expression); break;
    }
  }
  if (!exits && [...slots.values()].some(slot => !slot.definite)) issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error",
    source: "tsonic-csharp", sourceNode: node, message: "Native object construction requires a definite value for every required storage member." });
  return { value: Object.freeze({ inlineUnique, slots: Object.freeze([...slots.values()].map(({ name, carrier, initializeAbsence }) =>
    Object.freeze({ name, carrier, initializeAbsence }))) }), issues: Object.freeze(issues) };
}
