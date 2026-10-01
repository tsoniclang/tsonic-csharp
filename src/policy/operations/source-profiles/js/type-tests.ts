import type { SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../../model/context.js";
import type { ResolvedSourceCallInfo } from "../../members/selection/selection-types.js";
import type { CsharpClosedTypePredicate, CsharpClosedTypeTest } from "../../../../target-model/operations/type-tests.js";
import type { SourceNativeGuard } from "@tsonic/target-api/source";
import { csharpSourceProfileDeclarationIdentity } from "../source-profile-identity.js";
import { selectCsharpClosedTypeTestPlan } from "../../operators/type-tests.js";

export function selectCsharpArrayTypeTest(
  policy: CsharpPolicyContext,
  source: ResolvedSourceCallInfo | undefined,
  sourceFile: SourceFile,
): CsharpClosedTypeTest | undefined {
  const guard = selectCsharpArrayTypeGuard(policy, source, sourceFile);
  if (guard === undefined || source === undefined) return undefined;
  const argument = source.sourceArguments[0]!;
  const sourceCarrier = policy.types.resolveSelectedValue(argument.expression, argument.type, sourceFile);
  const test = sourceCarrier === undefined ? undefined
    : selectCsharpClosedTypeTestPlan(sourceCarrier, guard.predicate, undefined, policy.typeDefinitions);
  return sourceCarrier === undefined || test === undefined ? undefined
    : Object.freeze({ sourceCarrier, predicate: guard.predicate, test });
}

export function selectCsharpArrayTypeGuard(
  policy: Pick<CsharpPolicyContext, "ast" | "semantics" | "sourceFacts">,
  source: ResolvedSourceCallInfo | undefined,
  sourceFile: SourceFile,
): SourceNativeGuard<CsharpClosedTypePredicate> | undefined {
  if (source === undefined) return undefined;
  const semantics = policy.semantics(sourceFile);
  const declaration = semantics.declarations.signatureDeclaration(source.selectedSignature);
  const identity = csharpSourceProfileDeclarationIdentity(policy.ast, semantics, policy.sourceFacts, declaration);
  if (identity?.owner !== "js" || identity.kind !== "member" ||
    identity.declaringName !== "ArrayConstructor" || identity.name !== "isArray") return undefined;
  const argument = source.sourceArguments[0];
  if (source.sourceArguments.length !== 1 || argument === undefined || policy.ast.is.IsSpreadElement(argument.expression)) return undefined;
  const predicate = Object.freeze({ kind: "array" as const });
  return Object.freeze({ sourceOperand: argument.expression, predicate });
}
