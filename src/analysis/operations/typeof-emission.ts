import type { AstReader, Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/operations/conversions.js";
import type { CsharpClassFactoryIndex } from "../../target-model/records/objects/class-factories.js";
import type { CsharpTypeDefinitions } from "../../target-model/types/source-union-definitions.js";
import type { CsharpTypeofOperationEmission } from "../../target-model/records/operations/typeof-emission.js";
import { getCsharpClassFactory } from "../../target-model/types/carriers/class-factories.js";
import { sourceOperatorFromKindName } from "../../target-model/syntax/operators.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { selectCsharpTypeEmission } from "../../policy/types/resolution/type-emission.js";
import { createCsharpTypeofEmissionProducer } from "../program/records/operations/typeof-emission.js";

export function analyzeCsharpTypeofEmission(input: { readonly ast: AstReader; readonly nodes: readonly Node[];
  readonly admitted: (node: Node) => boolean; readonly operations: CsharpTargetOperationClassifications;
  readonly values: CsharpValueReadClassifications; readonly factories: CsharpClassFactoryIndex; readonly definitions: CsharpTypeDefinitions }) {
  const producer = createCsharpTypeofEmissionProducer();
  const issues: TargetDiagnostic[] = [];
  const refuse = (node: Node, code: `CSHARP_${string}`, message: string): void => { issues.push({ code, category: "error", source: "tsonic-csharp", sourceNode: node, message }); };
  for (const node of input.nodes) {
    if (!input.admitted(node)) continue;
    const binary = input.operations.binaryOperation.get(node);
    const operator = input.ast.is.IsBinaryExpression(node) ? sourceOperatorFromKindName(input.ast.operatorKindName(node)) : undefined;
    if (operator === "instanceof") {
      const syntax = input.ast.as.AsBinaryExpression(node);
      const left = syntax?.Left;
      const right = syntax?.Right;
      if (left === undefined || right === undefined) failTargetAnalysisInvariant("tsonic-csharp", "Checked instanceof expression is missing an exact operand.", node);
      const factory = getCsharpClassFactory(binary?.instanceFactory);
      if (factory !== undefined && binary?.instanceFactory !== undefined) {
        const selected = input.factories.classFactory.get(factory.declaration);
        if (selected === undefined || !selectCsharpTypeEmission({ carrier: binary.instanceFactory })) {
          refuse(node, "CSHARP_LOCAL_CLASS_IDENTITY_TEST", "A local class identity test requires its sealed per-evaluation environment."); continue;
        }
        producer.predicate(node, { kind: "factory", left, right, carrier: binary.instanceFactory, method: factory.instanceTestMethodName });
      } else {
        const fact = binary?.instanceTest;
        const source = input.values.valueRead.get(left)?.value;
        if (fact === undefined || source === undefined || !targetTypeRefEquals(source, fact.sourceCarrier)) {
          refuse(node, "CSHARP_NOMINAL_TYPE_TEST_NOT_PROVEN", "Nominal type test requires its exact sealed source, constructor and native payload test."); continue;
        }
        producer.predicate(node, { kind: "native", left, fact });
      }
      continue;
    }
    const comparison = binary?.typeofComparison;
    const isTypeof = input.ast.is.IsTypeOfExpression(node);
    if (!isTypeof && comparison === undefined) continue;
    const operand = isTypeof ? input.ast.as.AsTypeOfExpression(node)?.Expression : comparison!.operand;
    const selected = operand === undefined ? undefined : input.operations.jsTypeof.get(operand);
    if (operand === undefined || selected === undefined) failTargetAnalysisInvariant("tsonic-csharp", isTypeof
      ? "C# planning received a typeof expression without a sealed operation classification."
      : "C# planning received a typeof comparison without a sealed operation classification.", node);
    if (selected.kind === "rejected") { refuse(node, selected.code, selected.reason); continue; }
    // One decision (K-2665): an opaque JS-value operand is typed at run time by its dynamic typeof operation, and its
    // comparison was classified dynamic by the same selection (selectCsharpTypeofSelection).
    if (comparison !== undefined && (comparison.selection.kind === "dynamic") !== (selected.kind === "resolved")) {
      failTargetAnalysisInvariant("tsonic-csharp",
        "A typeof comparison is dynamic exactly when its operand has the dynamic JS-value typeof operation.", node);
    }
    let operation: CsharpTypeofOperationEmission;
    if (selected.kind === "resolved") operation = Object.freeze({ kind: "js-value", operation: selected });
    else if (comparison?.selection.kind === "rejected") { refuse(node, comparison.selection.code, comparison.selection.reason); continue; }
    else if (comparison?.selection.kind === "constant") operation = Object.freeze({ kind: "constant", value: comparison.selection.value });
    else {
      const carrier = input.values.valueRead.get(operand)?.value;
      const category = comparison?.selection.kind === "runtime-category-test" ? comparison.selection.category : input.operations.typeofRuntimeKind.get(operand);
      // The category is the one selected from the Host typeof record (selectCsharpTypeofSelection); it is not re-derived
      // here. A closed operand without a selected category was refused there (CSHARP_TYPEOF_RUNTIME_KIND_NOT_PROVEN).
      if (carrier === undefined || category === undefined ||
        comparison?.selection.kind === "runtime-category-test" && !targetTypeRefEquals(carrier, comparison.selection.sourceCarrier)) {
        refuse(node, "CSHARP_TYPEOF_RUNTIME_KIND_NOT_PROVEN", isTypeof ? "C# typeof translation requires one exact statically proven target runtime kind."
          : "The selected typeof comparison must retain its exact native carrier and closed category contract."); continue;
      }
      operation = Object.freeze({ kind: "category", carrier, category });
    }
    producer.category(node, { operand, operation, comparison: comparison === undefined ? undefined
      : Object.freeze({ runtimeKind: comparison.runtimeKind, negated: operator === "!==" || operator === "!=" }) });
  }
  return Object.freeze({ records: producer.seal(), issues: Object.freeze(issues) });
}
