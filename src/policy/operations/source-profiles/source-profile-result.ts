import type { CsharpSourceProfileCallPolicyContext } from "./source-profile-policy.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";

export function resolveCsharpSourceProfileGenericResult(
  context: CsharpSourceProfileCallPolicyContext,
  arity: number,
  construct: (arguments_: readonly TargetTypeRef[]) => TargetTypeRef,
): TargetTypeRef | undefined {
  const selected = context.source.sourceSelectedMethodTypeArguments ?? [];
  if (selected.length === 0) return context.host.types.resolveType(context.source.sourceResultType, context.sourceFile);
  if (selected.length !== arity) return undefined;
  const arguments_: TargetTypeRef[] = [];
  for (const argument of selected) {
    const type = context.host.types.resolveSelectedType(argument.explicitTypeNode, argument.selectedType, context.sourceFile);
    if (type === undefined) return undefined;
    arguments_.push(type);
  }
  return construct(Object.freeze(arguments_));
}
