import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpResolvedBinaryOperation } from "../../target-model/records/operator-selection.js";
import type { CsharpBinaryEmission, CsharpNativeBinaryEmission } from "../../target-model/records/binary-emission.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpNativeDemandAnalysis } from "../../target-model/records/native-demand.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage.js";
import type { CsharpNativeConstantRecords } from "../../target-model/records/native-constants.js";
import type { CsharpOptionalLocalPlan } from "../storage/optional-locals.js";
import { csharpSourcePrimitiveTargetType } from "../../target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { sourceOperatorFromKindName } from "../../target-model/syntax/operators.js";
import { csharpNativeAssignmentTokens, csharpNativeBinaryTokens } from "../../target-model/syntax/native-binary.js";
import { createCsharpBinaryEmissionRecords } from "../program/records/binary-emission.js";

export function analyzeCsharpBinaryEmission(input: { readonly source: TargetSourceProgram; readonly nodes: readonly Node[];
  readonly operations: CsharpTargetOperationClassifications; readonly demand: CsharpNativeDemandAnalysis;
  readonly optionalLocals: Pick<CsharpOptionalLocalPlan, "get">;
  readonly storage: CsharpStorageClassifications; readonly constants: CsharpNativeConstantRecords; readonly admitted: (node: Node) => boolean }) {
  const forms = new Map<Node, CsharpBinaryEmission>();
  const native = new Map<Node, Map<CsharpResolvedBinaryOperation, CsharpNativeBinaryEmission>>();
  const issues: TargetDiagnostic[] = [];
  const reported = new Map<Node, Set<string>>();
  const refuse = (node: Node, message: string): void => {
    const messages = reported.get(node) ?? new Set<string>();
    if (messages.has(message)) return;
    messages.add(message); reported.set(node, messages);
    issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message });
  };
  const { ast } = input.source;
  const addNative = (node: Node, selection: CsharpResolvedBinaryOperation): void => {
    const entries = native.get(node) ?? new Map<CsharpResolvedBinaryOperation, CsharpNativeBinaryEmission>();
    if (entries.has(selection)) return;
    const operation = selection.targetOperation;
    if ((operation.kind === "bigint-call" || operation.kind === "closed-value-coalesce") && operation.assignment && operation.location === "unsupported") {
      refuse(node, "Read-modify-write requires a binding or an exact native reference-receiver location and hygienic evaluation scope."); return;
    }
    const operator = operation.kind === "operator" || operation.kind === "generic-numeric" ? operation.operator : undefined;
    const syntax = operator === undefined ? undefined : Object.prototype.hasOwnProperty.call(csharpNativeAssignmentTokens, operator) ? "assignment"
      : Object.prototype.hasOwnProperty.call(csharpNativeBinaryTokens, operator) ? "binary" : undefined;
    if (operator !== undefined && syntax === undefined) { refuse(node, `Selected C# operator '${operator}' has no target AST token.`); return; }
    let storage = selection.left;
    while (ast.is.IsParenthesizedExpression(storage)) storage = ast.as.AsParenthesizedExpression(storage)?.Expression
      ?? failTargetAnalysisInvariant("tsonic-csharp", "A checked assignment location requires its parenthesized source operand.", storage);
    const location = input.storage.nativeLocation.get(storage);
    const left = input.demand.nativeUse.expression(selection.left)?.use;
    const right = input.demand.nativeUse.expression(selection.right)?.use;
    if (operator === "??=" && (left === undefined || left.kind === "erased"))
      failTargetAnalysisInvariant("tsonic-csharp", "An admitted coalescing assignment requires its native storage-use carrier.", node);
    const boolean = csharpSourcePrimitiveTargetType("bool");
    const other = operation.kind === "nullish-test" && operation.operand === "left" ? selection.right : selection.left;
    const otherCarrier = operation.kind === "nullish-test" && operation.operand === "left" ? selection.rightType : selection.leftType;
    const rightSuspends = input.source.navigation.expressionEffects(selection.right).suspends;
    if (syntax === "assignment" && (location?.kind !== "resolved" || !location.writable)) {
      refuse(node, location?.kind === "rejected" ? location.reason : "A sequenced native assignment requires its sealed writable physical location."); return;
    }
    if (syntax === "assignment" && rightSuspends && location?.kind === "resolved" && location.opaque === true) {
      refuse(node, "An opaque native ref-return address cannot be held across asynchronous suspension."); return;
    }
    entries.set(selection, { selection, syntax, storage, location: location?.kind === "resolved" ? location : undefined, rightSuspends,
      narrowedCoalescing: operator === "??=" && left !== undefined && left.kind !== "erased" && !targetTypeRefEquals(selection.resultType, left.carrier),
      nativeBoolean: left !== undefined && left.kind !== "erased" && right !== undefined && right.kind !== "erased" &&
        targetTypeRefEquals(left.carrier, boolean) && targetTypeRefEquals(right.carrier, boolean) && targetTypeRefEquals(selection.resultType, boolean),
      retainOther: input.constants.nativeAbsence.get(other, otherCarrier) !== true });
    native.set(node, entries);
  };
  // The nullish choices of a borrowed spread sequence are planned as the borrowed sequence's own input choice (as the
  // array-literal planner selects it), never as binary operations.
  const borrowedControls = new Set<Node>();
  for (const node of input.nodes) {
    const borrowed = input.operations.borrowedSequence.get(node);
    const single = borrowed?.inputs.length === 1 && borrowed.inputs[0]?.kind === "sequence" && !borrowed.inputs[0].optional;
    if (borrowed !== undefined && !single) for (const control of borrowed.controlNodes) borrowedControls.add(control);
  }
  for (const node of input.nodes) {
    if (!input.admitted(node) || !ast.is.IsBinaryExpression(node) || borrowedControls.has(node)) continue;
    const optionalLocal = input.optionalLocals.get(node);
    if (optionalLocal !== undefined && optionalLocal.kind !== "declaration") continue;
    const form = input.operations.operatorForm.get(node);
    if (form === "destructuring-assignment") continue;
    if (form === "js-array-mutation" || form === "type-test" || form === "typeof-comparison") {
      forms.set(node, { kind: form });
      // A typed-element compound assignment (words[0] += value) plans its calculation as the selected binary operation.
      const mutation = form === "js-array-mutation" ? input.operations.jsArrayMutation.get(node) : undefined;
      if (mutation?.kind === "set-typed-element" && mutation.calculation !== undefined) addNative(node, mutation.calculation);
      continue;
    }
    const syntax = ast.as.AsBinaryExpression(node);
    const left = syntax?.Left;
    const right = syntax?.Right;
    const selected = input.operations.binaryOperation.get(node);
    if (selected === undefined || left === undefined || right === undefined) { refuse(node, "C# planning received a binary expression without a sealed target classification."); continue; }
    const operator = sourceOperatorFromKindName(ast.operatorKindName(node));
    if (form === "js-value-operation" && operator !== "=") {
      if (selected.jsValue.kind === "rejected") { refuse(node, selected.jsValue.reason); continue; }
      if (selected.jsValue.kind === "resolved") { forms.set(node, { kind: "js-value", left, right, invocation: selected.jsValue }); continue; }
    }
    if (form === "js-value-write") {
      // The AST reader's views do not check the node kind, so the property branch is selected by kind.
      const property = ast.is.IsPropertyAccessExpression(left) ? ast.as.AsPropertyAccessExpression(left) : undefined;
      if (property?.Expression !== undefined) {
        const write = selected.propertyWrite;
        if (write?.kind !== "resolved") { refuse(left, write?.kind === "rejected" ? write.reason : "The exact JS-value object-shape property has no closed write operation."); continue; }
        const name = property.name === undefined ? undefined : ast.text(property.name);
        if (name === undefined) { refuse(node, "A JS-value property write requires an exact receiver, property name, and value."); continue; }
        forms.set(node, { kind: "property-write", receiver: property.Expression, name, value: right, invocation: write }); continue;
      }
      const element = ast.as.AsElementAccessExpression(left);
      const write = selected.elementWrite;
      if (element?.Expression === undefined || element.ArgumentExpression === undefined || write?.kind !== "resolved") {
        refuse(node, write?.kind === "rejected" ? write.reason : "A JS-value element write requires an exact receiver, key, and value."); continue;
      }
      forms.set(node, { kind: "element-write", receiver: element.Expression, key: element.ArgumentExpression, value: right, invocation: write }); continue;
    }
    // A discarded expression whose presence alone is observed is planned from its native discarded-presence plan, and an
    // expression whose evaluation never completes is planned as its operand effects up to the first operand that never
    // completes; neither renders the selected binary operation.
    const use = input.demand.nativeUse.expression(node)?.use;
    if (use !== undefined && use.kind !== "erased" && (use.discardedPresence !== undefined || use.completion.kind === "never")) continue;
    if (selected.target.kind === "rejected") { refuse(node, selected.target.reason); continue; }
    addNative(node, selected.target);
    forms.set(node, { kind: "native", selection: selected.target });
  }
  for (const { use } of input.demand.entries) if (use.kind !== "erased" && use.binary !== undefined) addNative(use.expression, use.binary);
  // An ordered switch plans each case test as its selected comparison at the case clause.
  for (const node of input.nodes) {
    const selected = input.operations.switchStatement.get(node);
    if (selected?.kind !== "ordered" || !input.admitted(node)) continue;
    for (const clause of selected.clauses) if (clause.comparison !== undefined) addNative(clause.node, clause.comparison);
  }
  return Object.freeze({ records: createCsharpBinaryEmissionRecords(forms, native), issues: Object.freeze(issues) });
}
