import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpArgument, CsharpExpression } from "../../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../../context.js";
import type { CsharpPlannedArgument, CsharpPlannedValue } from "../../planned-values.js";
import { composeCsharpPlannedValues } from "../../planned-value-composition.js";
import { captureCsharpPlannedValue } from "../../planned-value-composition.js";
import { csharpPlannedValue, csharpPlannedExpressionIsStable } from "../../planned-values.js";
import { unsupportedNodeDiagnostic } from "../../../diagnostics.js";

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
  for (const [index, argument] of arguments_.operands.entries()) {
    if (argument.passing !== undefined && (arguments_.reordered || arguments_.operands.slice(index + 1).some(later => later.prelude.length !== 0 || later.completion.kind !== "value"))) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "Ordered native by-reference arguments require the sealed location capture authority."));
      return undefined;
    }
  }
  const operands = arguments_.reordered ? arguments_.operands.map(argument => {
    if (argument.completion.kind !== "value" || csharpPlannedExpressionIsStable(argument.completion.expression)) return argument;
    const capture = captureCsharpPlannedValue(node, input, diagnostics, argument.completion.carrier);
    return capture === undefined ? undefined : csharpPlannedValue(argument.completion.carrier,
      { kind: "IdentifierName", name: capture.name }, [...argument.prelude, {
        kind: "LocalDeclarationStatement", ...capture, initializer: argument.completion.expression,
      }]);
  }) : arguments_.operands;
  return composeCsharpPlannedValues(node, sourceFile, input, diagnostics,
    [...(receiver === undefined ? [] : [receiver]), ...operands], values => {
      const argumentsValues = receiver === undefined ? values : values.slice(1);
      const selected = arguments_.arguments(argumentsValues);
      return selected === undefined ? undefined : call(receiver === undefined ? undefined : values[0], selected);
    });
}

export function csharpPlannedArgumentSyntax(
  argument: CsharpPlannedArgument,
  expression: CsharpExpression,
): CsharpArgument {
  return { kind: "Argument", expression, ...(argument.passing === undefined ? {} : { passing: argument.passing }) };
}
