import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpTargetParameter } from "../../target-model/types/model.js";
import type { CsharpProviderArgumentMapping, CsharpSelectedTargetCall } from "../../target-model/records/members.js";
import type { ResolvedSourceCallInfo } from "../../target-model/records/source-calls.js";
import type { CsharpCallArgumentForm, CsharpCallArgumentEmission, CsharpTargetArgumentOperand, CsharpTargetArgumentsEmission } from "../../target-model/records/target-arguments.js";
import type { CsharpSourceCallEmissionRecords } from "../../target-model/records/source-call-emission.js";
import type { CsharpNativeDemandAnalysis } from "../../target-model/records/native-demand.js";
import { csharpTargetParameterValueType, getCsharpDelegateSignature, csharpArgumentVectorCallbackResultMatches, getCsharpJsArrayElementTargetType } from "../../target-model/types/index.js";
import { selectCsharpTypeEmission } from "../../policy/types/type-emission.js";
import { csharpPositionalArgumentsAreRepresentable } from "../../policy/operations/call-arguments.js";
import { createCsharpTargetArgumentProducer } from "../program/records/target-arguments.js";
import type { CsharpNativeArgumentRequest } from "../../target-model/records/argument-passing.js";

export function analyzeCsharpTargetArguments(input: { readonly ast: AstReader; readonly nodes: readonly Node[];
  readonly operations: CsharpTargetOperationClassifications; readonly sources: CsharpSourceCallEmissionRecords;
  readonly demand: CsharpNativeDemandAnalysis; readonly admitted: (node: Node) => boolean }) {
  const producer = createCsharpTargetArgumentProducer();
  const issues: TargetDiagnostic[] = [];
  const requests: CsharpNativeArgumentRequest[] = [];
  const refuse = (node: Node, message: string): void => { issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message }); };
  const argument = (expression: Node, parameter: CsharpTargetParameter, form: CsharpCallArgumentForm, mapping: CsharpProviderArgumentMapping | undefined): void => {
    if (producer.records.callArgumentEmission.get(expression, parameter, form, mapping) !== undefined) return;
    if (form === "spread-element") { refuse(expression, "Tuple-expanded call arguments require an explicit target tuple expansion plan."); return; }
    if (form === "spread-sequence" && !parameter.paramsArray) { refuse(expression, "Sequence-spread call arguments require an exact related C# params parameter."); return; }
    let value: CsharpCallArgumentEmission;
    if (parameter.csharpSourceArgumentAdapter !== undefined) {
      const adapter = parameter.csharpSourceArgumentAdapter;
      if (adapter.kind !== "ecmascript-argument-vector-callback" || form !== "value" || parameter.passingMode !== "by-value") {
        refuse(expression, "The selected ECMAScript callback adapter requires one ordinary by-value source argument."); return;
      }
      const use = input.demand.nativeUse.expression(expression)?.use;
      const source = use === undefined || use.kind === "erased" || use.completion.kind !== "value" ? undefined : use.completion.type;
      const sourceSignature = getCsharpDelegateSignature(source);
      const targetSignature = getCsharpDelegateSignature(parameter.type);
      const vector = targetSignature?.parameters[0];
      if (source === undefined || sourceSignature === undefined || targetSignature === undefined || targetSignature.parameters.length !== 1 || vector === undefined ||
        !csharpArgumentVectorCallbackResultMatches(sourceSignature.returnType, targetSignature.returnType) || sourceSignature.restParameterIndex !== undefined && sourceSignature.restParameterIndex !== sourceSignature.parameters.length - 1) {
        refuse(expression, "The selected ECMAScript callback adapter has no exact source-callable and target argument-vector contract."); return;
      }
      if (!selectCsharpTypeEmission({ carrier: source }) || !selectCsharpTypeEmission({ carrier: vector })) {
        refuse(expression, "The selected ECMAScript callback adapter contains an unrenderable callable or argument-vector type."); return;
      }
      const parameters: Extract<CsharpCallArgumentEmission, { readonly kind: "argument-vector" }>["parameters"][number][] = [];
      for (const [index, carrier] of sourceSignature.parameters.entries()) {
        const rest = sourceSignature.restParameterIndex === index;
        const type = rest ? getCsharpJsArrayElementTargetType(carrier) : carrier;
        if (type === undefined || !selectCsharpTypeEmission({ carrier: type })) {
          refuse(expression, rest ? "An ECMAScript callback rest parameter requires an exact JS-array element representation." : `ECMAScript callback parameter ${index} has no renderable target representation.`); return;
        }
        parameters.push(Object.freeze({ type, rest }));
      }
      value = { kind: "argument-vector", source, target: parameter.type, vector, parameters: Object.freeze(parameters) };
    } else {
      const target = csharpTargetParameterValueType(parameter, form);
      if (!selectCsharpTypeEmission({ carrier: target })) { refuse(expression, `Selected target parameter '${parameter.name}' has no renderable C# type.`); return; }
      if (mapping?.kind === "by-value" && (mapping.conversion.kind === "provider-argument-adapter" || mapping.conversion.kind === "lifted-provider-argument-adapter" || mapping.conversion.kind === "checked-native-integer")) {
        if (form !== "value" || parameter.passingMode !== "by-value") { refuse(expression, `Exact provider argument conversion '${mapping.conversion.kind}' requires an ordinary by-value source argument.`); return; }
        value = { kind: "convert", read: "expression", source: mapping.sourceType, target: mapping.targetType, conversion: mapping.conversion };
      } else if (mapping?.kind === "by-value" && mapping.conversion.kind === "delegate-adapter" && mapping.conversion.strategy !== "native-binding") {
        if (!selectCsharpTypeEmission({ carrier: mapping.sourceType })) { refuse(expression, "Exact provider delegate adaptation requires a renderable source callable carrier."); return; }
        value = { kind: "convert", read: "argument", source: mapping.sourceType, target: mapping.targetType, conversion: mapping.conversion };
      } else value = { kind: "plain", target };
    }
    if (value.kind === "plain") requests.push({ node: expression, target: value.target, passing: parameter.passingMode, parameter });
    else if (value.kind === "argument-vector" || value.read === "argument") requests.push({ node: expression, target: value.source, passing: "by-value", parameter: undefined });
    producer.argument(expression, parameter, form, mapping, value);
  };
  const call = (node: Node, source: ResolvedSourceCallInfo, selection: CsharpSelectedTargetCall): void => {
    const operands: { readonly operand: CsharpTargetArgumentOperand; readonly parameter: number; readonly order: number; readonly sequence: boolean }[] = [];
    if (selection.receiver.kind === "target-parameter") {
      const receiver = source.sourceReceiver?.expression;
      const parameter = selection.targetMember.parameters[selection.receiver.targetParameterIndex];
      if (receiver === undefined || parameter === undefined) { refuse(node, "Selected first-argument target receiver has no exact source receiver or target parameter."); return; }
      argument(receiver, parameter, "value", undefined);
      operands.push({ operand: { kind: "argument", expression: receiver, parameter, form: "value", mapping: undefined }, parameter: selection.receiver.targetParameterIndex, order: -1, sequence: false });
    }
    const sequences = new Map(selection.sequenceArguments?.map(sequence => [sequence.sourceArgumentIndex, sequence]));
    const planned = new Set<number>();
    if (sequences.size !== (selection.sequenceArguments?.length ?? 0)) { refuse(node, "A selected native argument sequence requires one exact source binding."); return; }
    for (const entry of selection.arguments) {
      const expression = source.sourceArguments[entry.sourceArgumentIndex]?.expression;
      if (expression === undefined) { refuse(node, `Selected target argument ${entry.effectiveArgumentIndex} has no exact checker-owned source expression.`); return; }
      const sequence = sequences.get(entry.sourceArgumentIndex);
      if (sequence !== undefined) {
        if (planned.has(sequence.sourceArgumentIndex)) continue;
        if (input.ast.as.AsSpreadElement(expression)?.Expression !== sequence.expression || sequence.targetParameterIndex !== entry.targetParameterIndex) {
          refuse(node, "A selected native argument sequence requires its exact source operand and parameter."); return;
        }
        planned.add(sequence.sourceArgumentIndex);
        operands.push({ operand: { kind: "sequence", sequence }, parameter: sequence.targetParameterIndex, order: sequence.sourceArgumentIndex, sequence: true });
      } else {
        const mapping = selection.origin === "provider" ? selection.argumentMappings.find(mapping => mapping.effectiveArgumentIndex === entry.effectiveArgumentIndex) : undefined;
        argument(expression, entry.targetParameter, entry.sourceForm, mapping);
        operands.push({ operand: { kind: "argument", expression, parameter: entry.targetParameter, form: entry.sourceForm, mapping },
          parameter: entry.targetParameterIndex, order: entry.sourceArgumentIndex, sequence: false });
      }
    }
    operands.sort((left, right) => left.order - right.order);
    const ordered = operands.map((entry, index) => ({ ...entry, index })).sort((left, right) => left.parameter - right.parameter || left.order - right.order);
    if (!csharpPositionalArgumentsAreRepresentable({ indexes: ordered.map(entry => entry.parameter), parameters: selection.targetMember.parameters })) {
      refuse(node, "Selected target argument relation requires a target argument reorder or omission that cannot be represented positionally."); return;
    }
    const groups: CsharpTargetArgumentsEmission["groups"][number][] = [];
    for (let index = 0; index < ordered.length;) {
      const first = ordered[index]!;
      const group = [first];
      index += 1;
      while (index < ordered.length && ordered[index]!.parameter === first.parameter) { group.push(ordered[index]!); index += 1; }
      if (!group.some(entry => entry.sequence)) for (const entry of group) groups.push(Object.freeze({ collect: false, arguments: Object.freeze([{ index: entry.index, spread: false }]) }));
      else groups.push(Object.freeze({ collect: group.length !== 1, arguments: Object.freeze(group.map(entry => Object.freeze({ index: entry.index, spread: entry.sequence }))) }));
    }
    producer.call(node, { operands: Object.freeze(operands.map(entry => Object.freeze(entry.operand))), groups: Object.freeze(groups), reordered: ordered.some((entry, index) => entry.index !== index) });
  };
  for (const node of input.nodes) {
    if (!input.admitted(node)) continue;
    const selected = input.operations.selectedCall.get(node)?.target ?? input.operations.selectedConstruction.get(node)?.target;
    if (selected?.kind === "resolved") call(node, selected.source, selected.call);
    const source = input.sources.sourceArgumentsEmission.get(node);
    if (source !== undefined) for (const entry of source.arguments) argument(entry.node, entry.parameter, entry.form, undefined);
  }
  return Object.freeze({ records: producer.seal(), requests: Object.freeze(requests), issues: Object.freeze(issues) });
}
