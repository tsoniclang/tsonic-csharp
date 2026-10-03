import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpNativeLocationSelection } from "../../../analysis/storage/native-locations.js";
import type { CsharpExpression, CsharpStatement } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { CsharpPlannedValue } from "./planned-values.js";
import { csharpPlannedValue } from "./planned-values.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";

type NativeLocation = Extract<CsharpNativeLocationSelection, { readonly kind: "resolved" }>;

export function captureCsharpPlannedLocation(
  node: Node, _sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  planned: CsharpPlannedValue, fact: NativeLocation, suspends: boolean,
): CsharpPlannedValue | undefined {
  if (planned.completion.kind !== "value") return planned.completion.kind === "never" ? planned : undefined;
  const prelude: CsharpStatement[] = [...planned.prelude];
  const temporary = (expression: CsharpExpression): CsharpExpression => {
    const name = input.names.temporaryName("__tsonic_location_input");
    prelude.push({ kind: "LocalDeclarationStatement", name, type: { kind: "IdentifierName", name: "var" }, initializer: expression });
    return { kind: "IdentifierName", name };
  };
  const retain = (syntax: CsharpExpression, selected: NativeLocation): CsharpExpression | undefined => {
    if (syntax.kind === "IdentifierName") return syntax;
    if (syntax.kind === "SimpleMemberAccessExpression") {
      if (selected.nativeCell?.kind === "local") {
        if (syntax.name !== "Value") {
          diagnostics.push(unsupportedNodeDiagnostic(node, "The sealed native cell must render through its exact backing value accessor."));
          return undefined;
        }
        return { ...syntax, receiver: temporary(syntax.receiver) };
      }
      const property = input.program.operations.property(selected.expression)?.selection;
      if (property?.kind === "resolved" && property.receiver.kind === "none" || property?.kind === "source-owned" &&
        property.source.selectedDeclaration !== undefined && input.program.source.ast.hasModifierKind(property.source.selectedDeclaration, "static")) return syntax;
      if (selected.assignment === "unsupported" && selected.receiver === undefined && selected.address === undefined && selected.nativeCell === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "A mutable value-type member requires its sealed native receiver address."));
        return undefined;
      }
      let receiver: CsharpExpression;
      if (selected.receiver === undefined) receiver = temporary(syntax.receiver);
      else {
        const receiverLocation = input.program.storage.nativeLocation(selected.receiver.expression);
        if (receiverLocation?.kind !== "resolved" || receiverLocation.address === undefined) {
          diagnostics.push(unsupportedNodeDiagnostic(node, "A native value receiver requires its finalized physical address."));
          return undefined;
        }
        const preserved = retain(syntax.receiver, receiverLocation);
        if (preserved === undefined) return undefined;
        receiver = preserved;
      }
      return { ...syntax, receiver };
    }
    if (syntax.kind === "ElementAccessExpression") return { ...syntax, receiver: temporary(syntax.receiver), arguments: syntax.arguments.map(temporary) };
    if (syntax.kind === "ParenthesizedExpression") {
      const expression = retain(syntax.expression, selected);
      return expression === undefined ? undefined : { ...syntax, expression };
    }
    if (selected.address === undefined || suspends) {
      diagnostics.push(unsupportedNodeDiagnostic(node, selected.address === undefined
        ? "The finalized native location has no address-preserving syntax recipe."
        : "An opaque native ref-return address cannot be held across asynchronous suspension."));
      return undefined;
    }
    const type = csharpTypeFromTargetTypeRef(selected.storageType, input.scope.typeParameterNames);
    if (type === undefined) return undefined;
    const name = input.names.temporaryName("__tsonic_location_reference");
    prelude.push({ kind: "LocalDeclarationStatement", name, type, initializer: syntax,
      refKind: selected.address.passing === "byref-readonly" ? "ref-readonly" : "ref" });
    return { kind: "IdentifierName", name };
  };
  const expression = retain(planned.completion.expression, fact);
  return expression === undefined ? undefined : csharpPlannedValue(fact.storageType, expression, prelude);
}
