import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpNativeDemandAnalysis } from "../../target-model/records/native-demand.js";
import type { CsharpConversionClassifications, CsharpValueReadClassifications } from "../../target-model/records/conversions.js";
import type { CsharpExpectedTypeClassifications } from "../../target-model/records/expected-types.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpAdmittedIteration } from "../../target-model/records/selection.js";
import type { CsharpArrayLiteralEmission, CsharpArraySpreadEmission, CsharpBorrowedSequenceEmission } from "../../target-model/records/array-literals.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { getCsharpNullableElementTargetType, csharpNullableTargetType } from "../../target-model/types/index.js";
import { csharpCollectionUsesJsArraySemantics, getCsharpArrayLiteralElementTargetType,
  getCsharpArrayLiteralBuilder, getCsharpArrayLiteralConstructionTargetType,
  getCsharpCollectionElementTargetType } from "../../target-model/types/carriers/collections.js";
import { selectCsharpSequenceEmission } from "../../policy/conversions/sequence-emission.js";
import { selectCsharpTypeEmission } from "../../policy/types/resolution/type-emission.js";
import { createCsharpArrayLiteralProducer } from "../program/records/array-literals.js";

export function analyzeCsharpArrayLiterals(input: { readonly source: TargetSourceProgram; readonly demand: CsharpNativeDemandAnalysis;
  readonly conversions: CsharpConversionClassifications; readonly values: CsharpValueReadClassifications;
  readonly expected: CsharpExpectedTypeClassifications; readonly evidence: CsharpSourceEvidenceIndex;
  readonly operations: CsharpTargetOperationClassifications<CsharpAdmittedIteration> }) {
  const producer = createCsharpArrayLiteralProducer();
  const issues: TargetDiagnostic[] = [];
  const { ast } = input.source;
  const refuse = (node: Node, message: string): void => { issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message }); };
  const spread = (expression: Node, carrier: TargetTypeRef, target: TargetTypeRef): CsharpArraySpreadEmission | undefined => {
    const previous = producer.records.arraySpread.get(expression, target);
    if (previous !== undefined) return previous;
    const element = getCsharpCollectionElementTargetType(carrier);
    const carriers = carrier.kind === "tuple" ? carrier.elements : element === undefined ? undefined : [element];
    const elements = carriers?.map(carrier => ({ carrier, conversion: input.conversions.conversion.get(carrier, target, "implicit") }));
    const selected = selectCsharpSequenceEmission(carrier, target, elements);
    if (selected.kind === "rejected") { refuse(expression, selected.reason); return undefined; }
    const value = selected.value;
    producer.spread(expression, target, value);
    return value;
  };
  for (const { use } of input.demand.entries) {
    if ((use.kind !== "constructed" && use.kind !== "value") || !ast.is.IsArrayLiteralExpression(use.expression)) continue;
    const node = use.expression;
    if (producer.records.arrayLiteral.get(node, use.carrier) !== undefined) continue;
    const carrier = getCsharpNullableElementTargetType(use.carrier) ?? use.carrier;
    const sources = ast.elements(node);
    const elision = sources.some(element => element === undefined || ast.kindName(element) === "KindOmittedExpression");
    if (elision) {
      refuse(node, "Sparse array literal elisions require closed JSArray hole construction facts before C# emission; dense array carriers must not compact holes.");
      continue;
    }
    const omitted: TargetTypeRef[] = [];
    let kind: CsharpArrayLiteralEmission["kind"];
    let element: TargetTypeRef | undefined;
    let construction: CsharpArrayLiteralEmission["construction"];
    if (carrier.kind === "tuple") {
      kind = "tuple";
      if (sources.length > carrier.elements.length) { refuse(node, "Tuple literal element count exceeds its exact finalized C# tuple carrier."); continue; }
      if (sources.length < carrier.elements.length) {
        const selected = input.evidence.contextualTuple.get(node);
        if (selected?.kind !== "selected" || selected.elementTypes.length !== carrier.elements.length) {
          refuse(node, "Tuple literal omission requires exact contextual trailing-optional source evidence before C# emission."); continue;
        }
        if (selected.elementTypes.some((type, index) => type === undefined || !targetTypeRefEquals(selected.optionalElementIndexes.includes(index)
          ? csharpNullableTargetType(type) : type, carrier.elements[index]!))) {
          refuse(node, "Contextual tuple element evidence conflicts with its exact finalized C# tuple carrier."); continue;
        }
        for (const index of selected.omittedOptionalElementIndexes) omitted.push(carrier.elements[index]!);
        if (sources.length + omitted.length !== carrier.elements.length) {
          refuse(node, "Contextual tuple omission evidence does not complete the exact finalized C# tuple carrier."); continue;
        }
      }
    } else {
      element = getCsharpArrayLiteralElementTargetType(carrier);
      if (carrier.kind === "array") { kind = "array"; element = carrier.element; }
      else if (element !== undefined && csharpCollectionUsesJsArraySemantics(carrier)) kind = "js";
      else {
        const native = getCsharpArrayLiteralConstructionTargetType(carrier);
        const builder = native === undefined ? undefined : getCsharpArrayLiteralBuilder(native);
        if (element === undefined || native === undefined || builder === undefined || !selectCsharpTypeEmission({ carrier: native })) {
          refuse(node, "Array literal emission requires renderable provider collection element and construction metadata."); continue;
        }
        kind = "collection"; construction = Object.freeze({ carrier: native, builder });
      }
      if (element === undefined || !selectCsharpTypeEmission({ carrier: element })) {
        refuse(node, "Array literal emission requires a renderable provider element carrier type before C# emission."); continue;
      }
    }
    if (!selectCsharpTypeEmission({ carrier })) { refuse(node, "Array literal emission requires renderable provider collection and element carrier types before C# emission."); continue; }
    const contributions: CsharpArrayLiteralEmission["contributions"][number][] = [];
    let nativeSpread = kind === "array";
    for (const [index, source] of sources.entries()) {
      if (source === undefined) continue;
      const isSpread = ast.is.IsSpreadElement(source);
      const expression = isSpread ? ast.as.AsSpreadElement(source)?.Expression : source;
      if (expression === undefined) { refuse(source, "Array spread requires a source expression."); continue; }
      const later = sources.slice(index + 1).filter((node): node is Node => node !== undefined);
      const snapshot = isSpread && later.some(node => {
        const effects = input.source.navigation.expressionEffects(node);
        return effects.invokes || effects.mutates || effects.suspends || effects.mayThrow;
      });
      contributions.push(Object.freeze({ node: source, expression, spread: isSpread, snapshot }));
      if (!isSpread || element === undefined) continue;
      const borrowed = input.operations.borrowedSequence.get(expression);
      if (borrowed !== undefined) {
        const previous = producer.records.borrowedSequenceEmission.get(borrowed, element);
        if (previous !== undefined) {
          nativeSpread &&= previous.inputs.length === 1 && previous.inputs[0]?.kind === "sequence" &&
            !previous.inputs[0].optional && previous.inputs[0].spread.nativeSpread;
          continue;
        }
        const branches: CsharpBorrowedSequenceEmission["inputs"][number][] = [];
        for (const branch of borrowed.inputs) {
          if (branch.kind === "empty") { branches.push(Object.freeze({ kind: "empty" })); continue; }
          const selected = spread(branch.expression, branch.presentCarrier, element);
          if (selected !== undefined) branches.push(Object.freeze({ kind: "sequence", expression: branch.expression,
            carrier: branch.carrier, presentCarrier: branch.presentCarrier, optional: branch.optional, spread: selected }));
        }
        producer.borrowed(borrowed, element, { inputs: Object.freeze(branches) });
        nativeSpread &&= branches.length === 1 && branches[0]?.kind === "sequence" &&
          !branches[0].optional && branches[0].spread.nativeSpread;
      } else {
        const sourceCarrier = input.values.valueRead.get(expression)?.value;
        const selected = sourceCarrier === undefined ? undefined : spread(expression, sourceCarrier, element);
        if (selected === undefined) refuse(source, "Array spread requires its exact selected native value completion.");
        nativeSpread &&= selected?.nativeSpread === true;
      }
    }
    if (element !== undefined && (kind === "collection" || kind === "array" && !nativeSpread)) {
      for (const contribution of contributions) {
        if (!contribution.spread) continue;
        const borrowed = input.operations.borrowedSequence.get(contribution.expression);
        const branches = borrowed === undefined ? [producer.records.arraySpread.get(contribution.expression, element)]
          : producer.records.borrowedSequenceEmission.get(borrowed, element)?.inputs.flatMap(branch =>
            branch.kind === "empty" ? [] : [branch.spread]) ?? [];
        if (branches.some(branch => branch !== undefined && branch.carrier.kind !== "tuple" && branch.lengthMember === undefined))
          refuse(contribution.node, "Native construction requires the finalized source length.");
      }
    }
    producer.literal(node, use.carrier, { kind, carrier, element, construction, omitted: Object.freeze(omitted),
      contributions: Object.freeze(contributions), nativeSpread });
  }
  return Object.freeze({ records: producer.seal(), issues: Object.freeze(issues) });
}
