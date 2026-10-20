import type { CsharpConversionClassifications } from "../../target-model/records/conversions.js";
import type { CsharpObjectShapeClassifications } from "../objects/index.js";
import type { CsharpTypeDefinitions } from "../../target-model/types/source-union-definitions.js";
import type { CsharpPropertyValueProjectionEmission } from "../../target-model/records/property-value-projection.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { isCsharpAbsenceTargetType, isCsharpJsValueTargetType, getCsharpNullableElementTargetType } from "../../target-model/types/index.js";
import { csharpUnionLeaves } from "../../target-model/types/union-relations.js";
import { createCsharpPropertyValueProjectionProducer } from "../program/records/property-value-projection.js";

export function analyzeCsharpPropertyValueProjection(conversions: CsharpConversionClassifications,
  shapes: Pick<CsharpObjectShapeClassifications, "resolveTarget">, definitions: CsharpTypeDefinitions) {
  const producer = createCsharpPropertyValueProjectionProducer();
  const issues: TargetDiagnostic[] = [];
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
        selected = { kind: "object", members };
      }
      producer.publish(node, source, selected);
    }
  }
  return Object.freeze({ records: producer.seal(), issues: Object.freeze(issues) });
}
