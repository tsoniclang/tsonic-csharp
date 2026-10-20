import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpNativeLocationSelection } from "../../../target-model/records/native-locations.js";
import type { CsharpExpression, CsharpStatement } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { CsharpPlannedValue, CsharpPlannedAddressOperand, CsharpPlannedCapture, CsharpPlannedLocationCapture } from "./planned-values.js";
import { csharpPlannedValue } from "./planned-values.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { captureCsharpPlannedValue } from "./planned-value-composition.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";

type NativeLocation = Extract<CsharpNativeLocationSelection, { readonly kind: "resolved" }>;

export function csharpPlannedAddressOperand(planned: CsharpPlannedValue): CsharpPlannedAddressOperand {
  if (planned.completion.kind !== "value") failCsharpPlannerInvariant("A native address operand requires its admitted value completion.");
  return { expression: planned.completion.expression, address: planned.address, receiverIdentity: planned.receiverIdentity };
}

export function captureCsharpPlannedMemberReceiver(
  node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  receiver: Node, carrier: TargetTypeRef, operand: CsharpPlannedValue, suspends: boolean, writable: boolean,
): CsharpPlannedCapture | CsharpPlannedLocationCapture | undefined {
  if (operand.completion.kind !== "value") return undefined;
  const selected = input.program.records.typeEmission.get(carrier)
    ?? failCsharpPlannerInvariant("An admitted member receiver requires its native storage category.", receiver);
  if (!selected.valueType) return captureCsharpPlannedValue(node, input, diagnostics, carrier);
  const location = input.program.records.nativeLocation.get(receiver);
  if (location?.kind !== "resolved" || location.address === undefined) {
    if (!writable) return captureCsharpPlannedValue(node, input, diagnostics, carrier);
    failCsharpPlannerInvariant("An admitted mutable value-member write requires its native receiver address.", node);
  }
  const retained = captureCsharpPlannedLocation(receiver, sourceFile, input, diagnostics,
    { ...operand, prelude: [] }, location, suspends);
  return retained?.completion.kind !== "value" ? undefined : {
    kind: "native-location", expression: retained.completion.expression, prelude: retained.prelude,
  };
}

export function captureCsharpPlannedLocation(
  node: Node, _sourceFile: SourceFile, input: CsharpPlanningContext, _diagnostics: TargetDiagnostic[],
  planned: CsharpPlannedValue, fact: NativeLocation, suspends: boolean,
): CsharpPlannedValue | undefined {
  if (planned.completion.kind !== "value") return planned.completion.kind === "never" ? planned : undefined;
  const prelude: CsharpStatement[] = [...planned.prelude];
  const temporary = (operand: CsharpPlannedAddressOperand): CsharpExpression => {
    if (operand.receiverIdentity === true) return operand.expression;
    const name = input.names.temporaryName("__tsonic_location_input");
    prelude.push({ kind: "LocalDeclarationStatement", name, type: { kind: "IdentifierName", name: "var" }, initializer: operand.expression });
    return { kind: "IdentifierName", name };
  };
  const retain = (operand: CsharpPlannedAddressOperand, selected: NativeLocation): CsharpExpression => {
    const address = operand.address;
    if (address?.kind === "root") return operand.expression;
    if (address?.kind === "parenthesized") return { kind: "ParenthesizedExpression", expression: retain(address.operand, selected) };
    if (address?.kind === "member") {
      if (address.static) return operand.expression;
      let receiver: CsharpExpression;
      if (selected.receiver === undefined || selected.nativeCell?.kind === "local") receiver = temporary(address.receiver);
      else {
        const location = input.program.records.nativeLocation.get(selected.receiver.expression);
        if (location?.kind !== "resolved" || location.address === undefined)
          failCsharpPlannerInvariant("An admitted native value receiver requires its finalized physical address.", selected.receiver.expression);
        receiver = retain(address.receiver, location);
      }
      return { kind: "SimpleMemberAccessExpression", receiver, name: address.name };
    }
    if (address?.kind === "element") return { kind: "ElementAccessExpression", receiver: temporary(address.receiver),
      arguments: address.arguments.map(expression => temporary({ expression })) };
    if (selected.opaque !== true || selected.address === undefined || suspends)
      failCsharpPlannerInvariant("An admitted native address requires its exact retained operands and non-suspending reference lifetime.", node);
    const type = csharpTypeFromTargetTypeRef(selected.storageType, input.scope.typeParameterNames)
      ?? failCsharpPlannerInvariant("An admitted ref-return address requires its exact native storage type.", node);
    const name = input.names.temporaryName("__tsonic_location_reference");
    prelude.push({ kind: "LocalDeclarationStatement", name, type, initializer: operand.expression,
      refKind: selected.address.passing === "byref-readonly" ? "ref-readonly" : "ref" });
    return { kind: "IdentifierName", name };
  };
  const expression = retain(csharpPlannedAddressOperand(planned), fact);
  return { ...csharpPlannedValue(fact.storageType, expression, prelude), address: { kind: "root" } };
}
