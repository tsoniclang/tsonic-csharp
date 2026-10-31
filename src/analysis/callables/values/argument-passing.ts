import type { Node } from "@tsonic/tsts";
import { isAstNode, type TargetSourceProgram } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpNativeArgumentRequest, CsharpArgumentPassing } from "../../../target-model/records/calls/argument-passing.js";
import type { CsharpSourceEvidenceIndex } from "../../../target-model/records/program/source-evidence.js";
import type { CsharpStorageClassifications } from "../../../target-model/records/storage/storage.js";
import type { CsharpTargetOperationClassifications } from "../../../target-model/records/operations/operations.js";
import type { CsharpElementAdmissionRecords } from "../../../target-model/records/objects/element-admission.js";
import type { CsharpTargetParameter } from "../../../target-model/types/model.js";
import { isCsharpJsValueTargetType, csharpSourcePrimitiveTargetType } from "../../../target-model/types/index.js";
import { csharpConstructorBaseCall } from "../emission/constructor-entry.js";
import { createCsharpArgumentPassingRecords } from "../../program/records/calls/argument-passing.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpSourceArgumentSelection, CsharpSourceArgumentSelectionResult } from "../../../source/extension/arguments.js";
import type { CsharpTargetCallSelection } from "../../../target-model/records/operations/member-selections.js";

export function readCsharpArgumentPassingSource(source: Pick<TargetSourceProgram, "ast">,
  evidence: Pick<CsharpSourceEvidenceIndex, "sourceArgument">, request: CsharpNativeArgumentRequest): CsharpSourceArgumentSelectionResult {
  const selected = evidence.sourceArgument.get(request.node);
  if (selected === undefined) return { kind: "rejected", reason: "C# call planning received an argument without sealed passing evidence." };
  if (selected.kind === "rejected") return selected;
  const argument = selected.argument;
  const mode = argument.passingMode;
  if (mode !== "by-value" && mode !== "byref-writeonly-must-init" && mode !== "byref-readwrite" && mode !== "byref-readonly")
    return { kind: "rejected", reason: `C# argument emission does not support finalized argument-passing mode '${mode}'.` };
  const expected = request.passing ?? "by-value";
  if (mode !== expected) return { kind: "rejected", reason: `Finalized argument-passing fact '${mode}' does not match the selected call parameter mode '${expected}'.` };
  const parameter = request.parameter;
  if (parameter?.csharpValueProjection !== undefined && (parameter.csharpValueProjection !== "properties" || mode !== "by-value" ||
    !isCsharpJsValueTargetType(parameter.type) || !isCsharpJsValueTargetType(request.target)))
    return { kind: "rejected", reason: "Checked property projection requires one exact by-value TsValue parameter." };
  if (parameter?.csharpOutputMayBeNull && (mode === "by-value" || mode === "byref-readonly"))
    return { kind: "rejected", reason: `Selected target parameter '${parameter.name}' declares nullable output on non-writing passing mode '${mode}'.` };
  if (!isAstNode(source.ast, argument.storageExpression))
    return { kind: "rejected", reason: "Argument-passing facts must carry exact source storage expressions before C# argument emission." };
  return selected;
}

export function* readCsharpSelectedWritingArguments(source: Pick<TargetSourceProgram, "ast">,
  evidence: Pick<CsharpSourceEvidenceIndex, "sourceArgument">,
  selected: Extract<CsharpTargetCallSelection, { readonly kind: "resolved" }>): Iterable<CsharpSourceArgumentSelection> {
  const entries = selected.call.arguments.map(argument => ({ expression: selected.source.sourceArguments[argument.sourceArgumentIndex]?.expression,
    parameter: argument.targetParameter }));
  if (selected.source.sourceReceiver !== undefined && selected.call.receiver.kind === "target-parameter") entries.push({ expression: selected.source.sourceReceiver.expression,
    parameter: selected.call.targetMember.parameters[selected.call.receiver.targetParameterIndex]
      ?? failTargetAnalysisInvariant("tsonic-csharp", "A selected native receiver requires its exact target parameter.", selected.source.sourceCallee.expression) });
  for (const entry of entries) {
    if (entry.parameter.passingMode !== "byref-readwrite" && entry.parameter.passingMode !== "byref-writeonly-must-init") continue;
    const expression = entry.expression ?? failTargetAnalysisInvariant("tsonic-csharp", "A selected native argument requires its exact original source expression.", selected.source.sourceCallee.expression);
    const passing = readCsharpArgumentPassingSource(source, evidence, { node: expression, target: entry.parameter.type,
      passing: entry.parameter.passingMode, parameter: entry.parameter });
    if (passing.kind === "rejected") failTargetAnalysisInvariant("tsonic-csharp", passing.reason, expression);
    yield passing.argument;
  }
}

export function readCsharpSelectedWritingReference(source: Pick<TargetSourceProgram, "ast">,
  evidence: Pick<CsharpSourceEvidenceIndex, "sourceArgument">,
  operations: Pick<CsharpTargetOperationClassifications, "selectedCall" | "selectedConstruction">,
  reference: Node): CsharpSourceArgumentSelection | undefined {
  for (let node = source.ast.parent(reference); node !== undefined; node = source.ast.parent(node)) {
    const selected = operations.selectedCall.get(node)?.target ?? operations.selectedConstruction.get(node)?.target;
    if (selected?.kind === "resolved") for (const passing of readCsharpSelectedWritingArguments(source, evidence, selected)) {
      let storage = passing.storageExpression;
      while (source.ast.is.IsParenthesizedExpression(storage)) storage = source.ast.as.AsParenthesizedExpression(storage)?.Expression
        ?? failTargetAnalysisInvariant("tsonic-csharp", "An existing native argument storage identity requires its parenthesized operand.", storage);
      if (storage === reference) return passing;
    }
    if (source.ast.is.IsBlock(node) || source.ast.is.IsSourceFile(node)) break;
  }
  return undefined;
}

export function analyzeCsharpArgumentPassing(input: { readonly source: TargetSourceProgram; readonly requests: readonly CsharpNativeArgumentRequest[];
  readonly nodes: readonly Node[]; readonly evidence: CsharpSourceEvidenceIndex; readonly storage: CsharpStorageClassifications;
  readonly operations: CsharpTargetOperationClassifications; readonly elements: CsharpElementAdmissionRecords; readonly admitted: (node: Node) => boolean }) {
  const requests = [...input.requests];
  for (const node of input.nodes) {
    if (!input.admitted(node)) continue;
    if (input.source.ast.is.IsConstructorDeclaration(node)) {
      const baseCall = csharpConstructorBaseCall(input.source.ast, node);
      const selected = baseCall === undefined ? undefined : input.operations.selectedCall.get(baseCall);
      for (const [index, argument] of (baseCall === undefined ? [] : input.source.ast.arguments(baseCall)).entries()) {
        if (argument === undefined) continue;
        const target = selected?.sourceArgumentParameterTypes?.[index] ?? input.evidence.nodeTargetType.get(argument);
        const evidence = input.evidence.sourceArgument.get(argument);
        if (target !== undefined && evidence?.kind === "resolved") requests.push({
          node: argument, target, passing: evidence.argument.passingMode, parameter: undefined,
        });
      }
    }
    const call = input.operations.selectedCall.get(node);
    if (call?.form.kind === "type-test") {
      const argument = call.source?.sourceArguments[0]?.expression;
      if (argument !== undefined) requests.push({ node: argument, target: call.form.typeTest.sourceCarrier, passing: "by-value", parameter: undefined });
    }
    const element = input.elements.selectedElement.get(node)?.emission;
    if (element?.kind === "access" && element.indexType !== undefined) requests.push({ node: element.key, target: element.indexType, passing: "by-value", parameter: undefined });
    const deletion = input.operations.elementDeletion.get(node);
    if (deletion?.kind === "resolved") requests.push({ node: deletion.index, target: deletion.keyType, passing: "by-value", parameter: undefined });
    const mutation = input.operations.jsArrayMutation.get(node);
    if (mutation?.kind === "set-length") requests.push({ node: mutation.value, target: csharpSourcePrimitiveTargetType("float64"), passing: "by-value", parameter: undefined });
  }
  const passing = new Map<Node, CsharpArgumentPassing>();
  const projections = new Map<Node, Map<CsharpTargetParameter, boolean>>();
  const issues: TargetDiagnostic[] = [];
  const reported = new Map<Node, Set<string>>();
  const refuse = (node: Node, message: string): void => {
    const messages = reported.get(node) ?? new Set<string>();
    if (messages.has(message)) return;
    messages.add(message); reported.set(node, messages);
    issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message });
  };
  for (const request of requests) {
    const selected = readCsharpArgumentPassingSource(input.source, input.evidence, request);
    if (selected.kind === "rejected") { refuse(request.node, selected.reason); continue; }
    const argument = selected.argument;
    const mode = argument.passingMode;
    const parameter = request.parameter;
    const nativePassing = mode === "by-value" ? undefined : mode === "byref-writeonly-must-init" ? "out" : mode === "byref-readwrite" ? "ref" : "in";
    const location = nativePassing === undefined ? undefined : input.storage.nativeLocation.get(argument.storageExpression);
    if (nativePassing !== undefined && (location?.kind !== "resolved" || location.address === undefined ||
      (nativePassing === "ref" || nativePassing === "out") && location.address.passing !== "byref-readwrite")) {
      refuse(request.node, location?.kind === "rejected" ? location.reason : "Native by-reference argument planning requires its sealed physical address and passing contract."); continue;
    }
    if (!passing.has(request.node)) passing.set(request.node, { expression: argument.storageExpression, mode,
      passing: nativePassing, location: location?.kind === "resolved" ? location : undefined,
      suspends: input.source.navigation.expressionEffects(argument.storageExpression).suspends });
    if (parameter !== undefined) {
      const entries = projections.get(request.node) ?? new Map<CsharpTargetParameter, boolean>();
      entries.set(parameter, parameter.csharpValueProjection === "properties");
      projections.set(request.node, entries);
    }
  }
  return Object.freeze({ records: createCsharpArgumentPassingRecords({ passing, projections }), issues: Object.freeze(issues) });
}
