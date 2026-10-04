import { sourceClosedCallableArguments } from "@tsonic/target-api/source";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpTargetOperationClassifications } from "../operations/index.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { getCsharpDelegateSignature, getCsharpNullableElementTargetType, targetTypeRefEquals } from "../../policy/types/index.js";
import { csharpFreeTypeParameterIdentities } from "../../target-model/types/generic-references.js";

export function selectCsharpClosedCallableInputs(
  source: TargetSourceProgram,
  policy: CsharpPolicyContext,
  operations: CsharpTargetOperationClassifications,
  expression: Node,
): readonly (TargetTypeRef | undefined)[] | undefined {
  const parameters = policy.ast.parameters(expression);
  if (parameters.some(parameter => parameter === undefined)) return undefined;
  const broad = (parameters as readonly Node[]).map(parameter => {
    const syntax = policy.ast.typeNode(parameter);
    const types = policy.semanticsFor(parameter).types;
    const type = syntax === undefined ? types.expressionType(parameter) : types.authoredType(syntax);
    return type !== undefined && (types.isUnknown(type) || types.isAny(type));
  });
  if (!broad.some(Boolean)) return undefined;
  const arguments_ = sourceClosedCallableArguments(expression, source);
  if (arguments_ === undefined) return undefined;
  let inputs: readonly TargetTypeRef[] | undefined;
  for (const argument of arguments_) {
    const selected = operations.call(argument.call)?.target;
    if (selected?.kind !== "resolved") return undefined;
    const bindings = selected.call.arguments.filter(binding => binding.sourceArgumentIndex === argument.argumentIndex);
    const binding = bindings[0];
    if (binding === undefined || bindings.length !== 1 || binding.sourceForm !== "value") return undefined;
    const type = binding.targetParameter.type;
    const callable = getCsharpDelegateSignature(type) ?? getCsharpDelegateSignature(getCsharpNullableElementTargetType(type));
    if (callable === undefined || callable.parameters.length < parameters.length) return undefined;
    const current = callable.parameters.slice(0, parameters.length);
    if (csharpFreeTypeParameterIdentities(current).size !== 0 ||
      inputs !== undefined && !current.every((type, index) => targetTypeRefEquals(type, inputs![index]!))) return undefined;
    inputs = current;
  }
  return inputs === undefined ? undefined
    : Object.freeze(inputs.map((type, index) => broad[index] ? type : undefined));
}
