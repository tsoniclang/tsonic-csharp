import type { CsharpConversionSelection } from "../../../target-model/conversions/selection.js";
import type { CsharpClosedShapeConversion, CsharpObjectProjectionEmission } from "../../../target-model/records/closed-object-shapes.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpObjectProjectionPolicyInput } from "../../model/closed-object-shapes.js";
import { csharpObjectShapeAssignmentMembers, csharpObjectShapeProjectionMembers, csharpSourcePrimitiveTargetType,
  csharpStringTargetType, csharpTsValueTargetType, getCsharpJsArrayElementTargetType, targetTypeRefEquals } from "../../../target-model/types/index.js";
import { objectShapeStorageMemberName } from "../../../target-model/names/object-members.js";
import { csharpTargetTypeRenderingRejection } from "../model/renderability.js";

type Selection<T> = { readonly kind: "selected"; readonly value: T } | { readonly kind: "rejected"; readonly reason: string };
const rejected = (reason: string): Extract<Selection<never>, { readonly kind: "rejected" }> => ({ kind: "rejected", reason });

export function selectCsharpClosedShapeConversion(selection: CsharpConversionSelection, target: TargetTypeRef): Selection<CsharpClosedShapeConversion> {
  if (csharpTargetTypeRenderingRejection(target) !== undefined) return rejected("Closed object projection result carrier is not renderable.");
  switch (selection.kind) {
    case "identity": return { kind: "selected", value: Object.freeze({ kind: "identity" }) };
    case "empty-record":
      return targetTypeRefEquals(target, selection.target)
        ? { kind: "selected", value: Object.freeze({ kind: "empty-record", target }) }
        : rejected("The empty-record conversion has mismatched carriers.");
    case "implicit": {
      if (selection.proof !== "runtime-union-arm") return { kind: "selected", value: Object.freeze({ kind: "identity" }) };
      const operand = selectCsharpClosedShapeConversion(selection.sourceToArm, selection.armType);
      return operand.kind === "rejected" ? operand : { kind: "selected", value: Object.freeze({
        kind: "runtime-union", target, constructor: `From${selection.armIndex + 1}`, operand: operand.value,
      }) };
    }
    case "js-value-box": return { kind: "selected", value: Object.freeze({ kind: "js-value", target: csharpTsValueTargetType() }) };
    case "ambiguous": case "rejected": return rejected(selection.reason);
    default: return rejected(`Selected conversion '${selection.kind}' requires source-expression evidence unavailable to a generated object projection.`);
  }
}

export function selectCsharpObjectProjection(input: CsharpObjectProjectionPolicyInput): Selection<CsharpObjectProjectionEmission> {
  const { receiver, projection } = input;
  if (csharpTargetTypeRenderingRejection(projection.resultType) !== undefined) return rejected(`Closed object '${projection.kind}' projection has no renderable selected result type.`);
  if (csharpTargetTypeRenderingRejection(receiver.targetType) !== undefined) return rejected("An admitted object projection requires its exact native receiver carrier.");
  const pairs = projection.kind === "assign" ? csharpObjectShapeAssignmentMembers(receiver, projection) : undefined;
  const members = projection.kind === "assign" ? pairs?.map(pair => pair.target) : csharpObjectShapeProjectionMembers(receiver, projection);
  if (members === undefined) return rejected(`Closed object '${projection.kind}' projection does not identify every exact own member once.`);
  switch (projection.kind) {
    case "keys": {
      const element = getCsharpJsArrayElementTargetType(projection.resultType);
      if (element === undefined || !targetTypeRefEquals(element, csharpStringTargetType())) return rejected("Object.keys requires an exact JS string-array result carrier.");
      return { kind: "selected", value: Object.freeze({ kind: "keys", element, keys: Object.freeze(members.map(member => member.sourceName)) }) };
    }
    case "values": case "entries": {
      const element = getCsharpJsArrayElementTargetType(projection.resultType);
      if (element === undefined) return rejected("Object.values requires an exact JS-array result carrier.");
      if (projection.kind === "entries" && (element.kind !== "tuple" || element.elements.length !== 2 || !targetTypeRefEquals(element.elements[0]!, csharpStringTargetType()))) {
        return rejected("Object.entries requires an exact JS array of [string, value] tuples.");
      }
      const target = projection.kind === "entries" && element.kind === "tuple" ? element.elements[1]! : element;
      const emitted: Extract<CsharpObjectProjectionEmission, { readonly kind: "values" | "entries" }>["members"][number][] = [];
      for (const [index, member] of members.entries()) {
        const conversion = input.conversions[index];
        if (conversion === undefined) return rejected("Closed object-shape planning requires a sealed target conversion classification that analysis did not produce.");
        const selected = selectCsharpClosedShapeConversion(conversion.selection, target);
        if (selected.kind === "rejected") return rejected(`Object.${projection.kind} member '${member.sourceName}' is not closed: ${selected.reason}`);
        emitted.push(Object.freeze({ key: member.sourceName, name: objectShapeStorageMemberName(receiver, member), conversion: selected.value }));
      }
      return { kind: "selected", value: Object.freeze({ kind: projection.kind, element, members: Object.freeze(emitted) }) };
    }
    case "has-own":
      return targetTypeRefEquals(projection.resultType, csharpSourcePrimitiveTargetType("bool"))
        ? { kind: "selected", value: Object.freeze({ kind: "has-own", keys: Object.freeze(members.map(member => member.sourceName)) }) }
        : rejected("Object.hasOwn requires an exact boolean result carrier.");
    case "assign": {
      if (!targetTypeRefEquals(projection.resultType, receiver.targetType)) return rejected("Object.assign requires its selected result and target carrier to be identical.");
      if (members.some(member => member.memberKind !== "property" || member.accessor?.setter === false)) return rejected("Object.assign requires exact writable data properties on the target carrier.");
      if (pairs === undefined) return rejected("Object.assign does not carry one exact source-to-target field relation.");
      if (csharpTargetTypeRenderingRejection(projection.sourceShape.targetType) !== undefined) return rejected("Closed object assignment source has no renderable selected carrier.");
      const assignments: Extract<CsharpObjectProjectionEmission, { readonly kind: "assign" }>["assignments"][number][] = [];
      for (const [index, pair] of pairs.entries()) {
        const conversion = input.conversions[index];
        if (conversion === undefined) return rejected("Closed object-shape planning requires a sealed target conversion classification that analysis did not produce.");
        const selected = selectCsharpClosedShapeConversion(conversion.selection, pair.target.type);
        if (selected.kind === "rejected") return rejected(`Object.assign source member '${pair.source.sourceName}' cannot be stored in its exact target member: ${selected.reason}`);
        assignments.push(Object.freeze({ source: objectShapeStorageMemberName(projection.sourceShape, pair.source),
          target: objectShapeStorageMemberName(receiver, pair.target), conversion: selected.value }));
      }
      return { kind: "selected", value: Object.freeze({ kind: "assign", source: projection.sourceShape.targetType, assignments: Object.freeze(assignments) }) };
    }
  }
}
