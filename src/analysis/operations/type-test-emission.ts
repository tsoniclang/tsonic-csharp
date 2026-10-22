import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpClosedTypeTest, CsharpClosedTypeTestPlan } from "../../target-model/operations/type-tests.js";
import type { CsharpClosedTypeTestEmission } from "../../target-model/records/type-tests.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpTypeDefinitions } from "../../target-model/types/source-union-definitions.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { isCsharpJsValueTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { csharpClosedTypeTestMatches } from "./type-tests.js";
import { selectCsharpTypeEmission } from "../../policy/types/resolution/type-emission.js";
import { createCsharpClosedTypeTestProducer } from "../program/records/type-tests.js";

export function analyzeCsharpClosedTypeTests(nodes: readonly Node[], operations: CsharpTargetOperationClassifications, definitions: CsharpTypeDefinitions) {
  const producer = createCsharpClosedTypeTestProducer();
  const issues: TargetDiagnostic[] = [];
  const seen = new Set<CsharpClosedTypeTest>();
  const select = (carrier: TargetTypeRef, test: CsharpClosedTypeTestPlan, target: TargetTypeRef | undefined): CsharpClosedTypeTestEmission => {
    if (test.kind === "constant") return Object.freeze(test);
    if (test.kind === "runtime-array") return Object.freeze({ kind: "runtime-array", dispatch: isCsharpJsValueTargetType(carrier) ? "instance" : "static" });
    if (test.kind === "native" || test.kind === "js-value") {
      if (target === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted native type test requires its exact checked target.");
      return Object.freeze({ kind: test.kind, target });
    }
    if (test.kind === "optional") return Object.freeze({ kind: "optional", element: test.element, test: select(test.element, test.test, target) });
    return Object.freeze({ kind: "union", carrier, arms: Object.freeze(test.arms.map(arm => select(arm.carrier, arm.test, target))) });
  };
  for (const node of nodes) {
    const call = operations.selectedCall.get(node)?.form;
    const fact = call?.kind === "type-test" ? call.typeTest : operations.binaryOperation.get(node)?.instanceTest;
    if (fact === undefined || seen.has(fact)) continue;
    seen.add(fact);
    const target = fact.predicate.kind === "array" ? undefined : fact.predicate.targetCarrier;
    if (!csharpClosedTypeTestMatches(fact, definitions) || target !== undefined && !selectCsharpTypeEmission({ carrier: target })) {
      issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node,
        message: "Nominal type test requires its exact sealed source, constructor and native payload test." }); continue;
    }
    producer.publish(fact, select(fact.sourceCarrier, fact.test, target));
  }
  return Object.freeze({ records: producer.seal(), issues: Object.freeze(issues) });
}
