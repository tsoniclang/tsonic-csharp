// The Source view of a source-profile use, built from published facts only (nextgen C-2542, R2, I2, I4).
// Call type arguments come from facts.instantiations.at(use); parameters, result and argument correspondence from
// facts.selections.call(use); value types from facts.values.type. A missing fact is an invariant failure.
import type { AstReader, Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { SourceProgramFacts } from "@tsonic/target-api/source";
import {
  sourceCallSelection,
  sourceInstantiation,
  sourceMemberAccess,
  sourceValueType,
} from "../../../analysis/program/source-facts.js";
import type {
  CsharpSourceProfileCallSource,
  CsharpSourceProfileElementSource,
  CsharpSourceProfilePropertySource,
  CsharpSourceProfileValue,
} from "../../../target-model/records/program/source-profile-inputs.js";

export interface CsharpSourceProfileSourceHost {
  readonly facts: SourceProgramFacts;
  readonly ast: AstReader;
}

/** An input expression with its published value type. A spread element carries its operand's published type. */
export function csharpSourceProfileValue(host: CsharpSourceProfileSourceHost, expression: Node): CsharpSourceProfileValue {
  const operand = host.ast.is.IsSpreadElement(expression) ? host.ast.as.AsSpreadElement(expression)?.Expression : expression;
  if (operand === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A spread argument has no operand.", expression);
  return Object.freeze({ expression, type: sourceValueType(host.facts, operand) });
}

export function csharpSourceProfileCallSource(host: CsharpSourceProfileSourceHost, call: Node): CsharpSourceProfileCallSource {
  const selection = sourceCallSelection(host.facts, call);
  const instantiation = sourceInstantiation(host.facts, call);
  const authored: Node[] = [];
  for (const binding of selection.arguments) if (!authored.includes(binding.argument)) authored.push(binding.argument);
  const explicit = host.ast.typeArguments(call).length > 0;
  return Object.freeze({
    call,
    selection,
    ...(selection.receiver === undefined ? {} : { receiver: csharpSourceProfileValue(host, selection.receiver) }),
    arguments: Object.freeze(authored.map(argument => csharpSourceProfileValue(host, argument))),
    parameters: selection.parameters,
    bindings: selection.arguments,
    typeArguments: Object.freeze((instantiation?.method ?? []).map(argument => Object.freeze({
      binder: argument.declaration, type: argument.type, explicit }))),
  });
}

export function csharpSourceProfilePropertySource(host: CsharpSourceProfileSourceHost, access: Node): CsharpSourceProfilePropertySource {
  const selection = sourceMemberAccess(host.facts, access);
  return Object.freeze({ expression: access, selection,
    receiver: Object.freeze({ expression: selection.receiver, type: selection.receiverType }) });
}

export function csharpSourceProfileElementSource(host: CsharpSourceProfileSourceHost, access: Node): CsharpSourceProfileElementSource {
  const record = host.facts.values.elementAccess(access);
  const argument = host.ast.as.AsElementAccessExpression(access)?.ArgumentExpression;
  if (argument === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An element access has no index expression.", access);
  return Object.freeze({ expression: access, access: record,
    receiver: Object.freeze({ expression: record.receiver, type: record.receiverType }),
    argument: Object.freeze({ expression: argument, type: record.index }) });
}
