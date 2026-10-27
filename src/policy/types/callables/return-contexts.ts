import type { Node } from "@tsonic/tsts";
import { HasSyntacticModifier, ModifierFlagsAsync } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../model/context.js";
import { getCsharpGeneratorProtocol } from "../../../target-model/types/carriers/generators.js";
import { getCsharpLambdaSignature, getCsharpTaskResultTargetType } from "../../../target-model/types/carriers/delegates.js";
import type { CsharpReturnTargetContract } from "../../../target-model/records/program/declarations.js";
import type { CsharpReturnContext } from "../../../target-model/records/calls/return-contexts.js";
import type { SourceCallableSourceContract } from "../../../target-model/records/callables/source-callable-contract.js";
import type { CsharpSourceEvidenceIndex } from "../../../target-model/records/program/source-evidence.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";

export function selectCsharpCallableReturnContext(
  policy: Pick<CsharpPolicyContext, "ast">,
  evidence: Pick<CsharpSourceEvidenceIndex, "generator">,
  callable: SourceCallableSourceContract,
  contextualTarget?: TargetTypeRef,
): CsharpReturnContext | undefined {
  const selectedReturnType = getCsharpLambdaSignature(contextualTarget)?.returnType ?? callable.returnType;
  if (evidence.generator.get(callable.sourceDeclaration) !== undefined) {
    return returnContext(getCsharpGeneratorProtocol(selectedReturnType)?.returnType);
  }
  const async = HasSyntacticModifier(policy.ast, callable.sourceDeclaration, ModifierFlagsAsync);
  return returnContext(async ? getCsharpTaskResultTargetType(selectedReturnType) : selectedReturnType);
}

export function selectCsharpAccessorReturnContext(
  policy: Pick<CsharpPolicyContext, "ast">,
  declaration: Node,
  returnContract: CsharpReturnTargetContract | undefined,
): CsharpReturnContext | undefined {
  return policy.ast.is.IsGetAccessorDeclaration(declaration) && returnContract?.kind === "resolved"
    ? returnContext(returnContract.type) : undefined;
}

function returnContext(target: TargetTypeRef | undefined): CsharpReturnContext | undefined {
  return target === undefined ? undefined : Object.freeze({ target });
}
