import type { CsharpConversionClassifications } from "../../target-model/records/operations/conversions.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/objects/object-shapes.js";
import type { CsharpTypeDefinitions } from "../../target-model/types/source-union-definitions.js";
import type { CsharpPropertyValueProjectionEmission } from "../../target-model/records/objects/property-value-projection.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../target-model/types/model.js";
import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpObjectLiteralRecords } from "../../target-model/records/objects/object-literals.js";
import type { CsharpClosedShapeMemberProjection } from "../../target-model/records/objects/closed-object-shapes.js";
import { isCsharpAbsenceTargetType, isCsharpJsValueTargetType, getCsharpNullableElementTargetType } from "../../target-model/types/index.js";
import { csharpObjectShapeMemberContractKey } from "../../target-model/types/object-shape-identity.js";
import { csharpUnionLeaves } from "../../target-model/types/union-relations.js";
import { createCsharpPropertyValueProjectionProducer } from "../program/records/objects/property-value-projection.js";

export function analyzeCsharpPropertyValueProjection(conversions: CsharpConversionClassifications,
  shapes: Pick<CsharpObjectShapeClassifications, "resolveTarget">, definitions: CsharpTypeDefinitions,
  literals: Pick<CsharpObjectLiteralRecords, "objectLiteral">, program: TargetSourceProgram) {
  const producer = createCsharpPropertyValueProjectionProducer();
  const issues: TargetDiagnostic[] = [];
  const literalProjection = (node: Node, source: TargetTypeRef, members: readonly CsharpClosedShapeMemberProjection[]) => {
    if (source.kind !== "target-named" || (source as CsharpTargetNamedTypeRef).csharpGeneratedStructuralStorage !== true) return undefined;
    const shape = shapes.resolveTarget(source);
    if (shape === undefined || shape.methodImplementation !== undefined) return undefined;
    const literal = literals.objectLiteral.get(shape, node);
    if (literal?.kind !== "native" || !literal.initialization.inlineUnique || literal.initialization.deferred.length !== 0 ||
      literal.members.length !== members.length || literal.initialization.slots.length !== members.length) return undefined;
    const projected = new Map(members.map(member => [csharpObjectShapeMemberContractKey(member.member), member]));
    if (projected.size !== members.length) return undefined;
    const values: { readonly initializer: Node; readonly projection: CsharpClosedShapeMemberProjection }[] = [];
    for (const member of literal.members) {
      if (member.kind !== "value" || member.member.memberKind !== "property" || member.member.accessor !== undefined ||
        member.member.bound === true) return undefined;
      const key = csharpObjectShapeMemberContractKey(member.member);
      const projection = projected.get(key);
      if (projection === undefined) return undefined;
      const name = program.ast.name(member.property);
      if (name !== undefined && program.ast.is.IsComputedPropertyName(name)) {
        const expression = program.ast.as.AsComputedPropertyName(name)?.Expression;
        if (expression === undefined) return undefined;
        const effects = program.navigation.expressionEffects(expression);
        if (effects.invokes || effects.mutates || effects.suspends || effects.mayThrow) return undefined;
      }
      values.push(Object.freeze({ initializer: member.initializer, projection }));
      projected.delete(key);
    }
    return projected.size === 0 ? Object.freeze(values) : undefined;
  };
  for (const { node, carrier } of conversions.propertyProjectionRoots) {
    const pending: TargetTypeRef[] = [carrier];
    for (let index = 0; index < pending.length; index++) {
      const source = pending[index]!;
      if (producer.records.propertyValueProjection.get(node, source) !== undefined) continue;
      let selected: CsharpPropertyValueProjectionEmission;
      const present = getCsharpNullableElementTargetType(source);
      const leaves = csharpUnionLeaves(source, definitions);
      if (isCsharpJsValueTargetType(source)) selected = { kind: "identity" };
      else if (isCsharpAbsenceTargetType(source)) selected = { kind: "absence" };
      else if (present !== undefined) { selected = { kind: "optional", present }; pending.push(present); }
      else if (leaves !== undefined && leaves.some(leaf => leaf.path.length !== 0)) {
        selected = { kind: "union", leaves }; pending.push(...leaves.map(leaf => leaf.carrier));
      } else if (shapes.resolveTarget(source) === undefined) selected = { kind: "boxed" };
      else {
        const members = conversions.propertyProjection.get(node, source);
        if (members === undefined) {
          issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node,
            message: "Native property projection requires its sealed selected-parameter member demand." });
          continue;
        }
        selected = { kind: "object", members, literal: literalProjection(node, source, members) };
      }
      producer.publish(node, source, selected);
    }
  }
  return Object.freeze({ records: producer.seal(), issues: Object.freeze(issues) });
}
