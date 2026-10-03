import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpArgument, CsharpExpression } from "../../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../../context.js";
import type { CsharpPlannedArgument, CsharpPlannedValue } from "../../planned-values.js";
import { composeCsharpPlannedValues } from "../../planned-value-composition.js";
import { captureCsharpPlannedValue } from "../../planned-value-composition.js";
import { csharpPlannedValue, csharpPlannedExpressionIsStable } from "../../planned-values.js";
import { unsupportedNodeDiagnostic } from "../../../diagnostics.js";
import { captureCsharpPlannedLocation } from "../../planned-locations.js";

export interface CsharpPlannedCallArguments {
  readonly operands: readonly CsharpPlannedArgument[];
  readonly reordered?: true;
  arguments(values: readonly CsharpExpression[]): readonly CsharpArgument[] | undefined;
}

export function composeCsharpPlannedCall(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  receiver: CsharpPlannedValue | undefined,
  arguments_: CsharpPlannedCallArguments,
  call: (receiver: CsharpExpression | undefined, arguments_: readonly CsharpArgument[]) => CsharpPlannedValue | undefined,
): CsharpPlannedValue | undefined {
  const operands = arguments_.operands.map((argument, index) => {
    const later = arguments_.operands.slice(index + 1);
    if (argument.passing !== undefined && (arguments_.reordered || later.some(value => value.prelude.length !== 0 || value.completion.kind !== "value"))) {
      if (argument.nativeLocation === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Ordered native by-reference arguments require their sealed physical location authority."));
        return undefined;
      }
      const suspends = later.some(value => value.suspends === true);
      const captured = captureCsharpPlannedLocation(node, sourceFile, input, diagnostics, argument, argument.nativeLocation, suspends);
      if (captured === undefined || captured.completion.kind !== "value") return captured;
      if (suspends) return { ...argument, ...captured };
      const storage = captureCsharpPlannedValue(node, input, diagnostics, argument.nativeLocation.storageType);
      if (storage === undefined) return undefined;
      return { ...argument, ...csharpPlannedValue(argument.nativeLocation.storageType, { kind: "IdentifierName", name: storage.name }, [
        ...captured.prelude, { kind: "LocalDeclarationStatement", ...storage, initializer: captured.completion.expression,
          refKind: argument.passing === "in" ? "ref-readonly" : "ref" },
      ]) };
    }
    if (!arguments_.reordered || argument.completion.kind !== "value" || csharpPlannedExpressionIsStable(argument.completion.expression)) return argument;
    const capture = captureCsharpPlannedValue(node, input, diagnostics, argument.completion.carrier);
    return capture === undefined ? undefined : csharpPlannedValue(argument.completion.carrier,
      { kind: "IdentifierName", name: capture.name }, [...argument.prelude, {
        kind: "LocalDeclarationStatement", ...capture, initializer: argument.completion.expression,
      }]);
  });
  return composeCsharpPlannedValues(node, sourceFile, input, diagnostics,
    [...(receiver === undefined ? [] : [receiver]), ...operands], values => {
      const argumentsValues = receiver === undefined ? values : values.slice(1);
      const selected = arguments_.arguments(argumentsValues);
      return selected === undefined ? undefined : call(receiver === undefined ? undefined : values[0], selected);
    }, (carrier, operand) => "passing" in operand && operand.passing !== undefined && "nativeLocation" in operand &&
      operand.nativeLocation !== undefined && operand.completion.kind === "value"
      ? { kind: "native-location", expression: operand.completion.expression }
      : captureCsharpPlannedValue(node, input, diagnostics, carrier));
}

export function csharpPlannedArgumentSyntax(
  argument: CsharpPlannedArgument,
  expression: CsharpExpression,
): CsharpArgument {
  return { kind: "Argument", expression, ...(argument.passing === undefined ? {} : { passing: argument.passing }) };
}
