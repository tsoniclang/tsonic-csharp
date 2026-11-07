import type { AstReader } from "@tsonic/tsts";
import type { SourceCallSelection, SourceProgramFacts } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";
import type { CsharpTypeQueries } from "../../../policy/model/type-resolution.js";
import type { CsharpRefusal, CsharpRepresentation } from "../../../representation/index.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpSourceCalleeSelection } from "../../../target-model/operations/source-callees.js";
import { getCsharpMethodValue } from "../../../target-model/types/method-values.js";
import { getCsharpCallableValueSignature, getCsharpDelegateSignature } from "../../../target-model/types/carriers/delegates.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import type { CsharpProjectTypePolicy } from "../../../target-model/records/types/project-types.js";
import { resolveCsharpStaticMemberReceiver } from "../../../policy/types/project/static-members.js";
import { getCsharpRuntimeUnionArms } from "../../../target-model/types/carriers/runtime-carriers.js";
import type { CsharpTypeDefinitions } from "../../../target-model/types/source-union-definitions.js";

export interface CsharpSourceCalleeHost {
  readonly moduleCallables: CsharpPolicyContext["moduleCallables"];
  readonly ast: AstReader;
  readonly facts: SourceProgramFacts;
  readonly projectTypes: Pick<CsharpProjectTypePolicy, "catalog">;
  readonly types: Pick<CsharpTypeQueries, "value" | "readStorage">;
  readonly typeDefinitions?: CsharpTypeDefinitions;
}

/** The native callee form of a selected call, from the Host call selection (facts.selections.call) and represented values. */
export function classifyCsharpSourceCallee(
  policy: CsharpSourceCalleeHost,
  source: SourceCallSelection,
): CsharpSourceCalleeSelection {
  // A representation CsharpRefusal met on the way travels with the rejection, so it is reported as it is (D1 §1.4).
  const reject = (reason: string, sourceContract: "required" | "not-applicable"): CsharpSourceCalleeSelection =>
    Object.freeze({ kind: "rejected", reason, sourceContract, ...(refusal === undefined ? {} : { refusal }) });
  let refusal: CsharpRefusal | undefined;
  const represented = (value: CsharpRepresentation): TargetTypeRef | undefined => {
    if (value.kind !== "csharp-refused") return value;
    refusal ??= value;
    return undefined;
  };
  const expression = source.callee;
  const selected = source.declaration;
  const memberAccess = policy.ast.is.IsPropertyAccessExpression(expression) || policy.ast.is.IsElementAccessExpression(expression);
  const accessed = !memberAccess ? undefined : policy.ast.is.IsPropertyAccessExpression(expression)
    ? policy.facts.selections.memberAccess(expression)?.selected : policy.facts.values.elementAccess(expression).selected;
  const accessDeclaration = accessed?.kind === "member" ? ("declarations" in accessed ? accessed.declarations[0] : accessed.declaration) : undefined;
  const reference = policy.facts.navigation.identity.target(expression);
  const declaration = reference?.declaration ?? accessDeclaration;
  const receiverExpression = memberAccess ? source.receiver : undefined;
  const moduleCallable = declaration === undefined ? undefined : policy.moduleCallables.get(declaration)?.callable;
  if (declaration !== undefined && selected !== undefined &&
    (policy.ast.is.IsFunctionDeclaration(declaration) && policy.ast.is.IsFunctionDeclaration(selected) ||
      moduleCallable !== undefined && (selected === declaration || selected === moduleCallable))) {
    if (!policy.facts.navigation.identity.isProjectDeclaration(selected)) return Object.freeze({ kind: "rejected",
      reason: "The exact selected source callee is external to the project and has no C# target relation.",
      sourceContract: "not-applicable" });
    return Object.freeze({ kind: "function", expression, declaration: moduleCallable ?? selected });
  }
  if (declaration !== undefined && declaration === selected && policy.ast.kindName(declaration) === "KindFunctionExpression" &&
    policy.ast.name(declaration) !== undefined && policy.facts.navigation.scopes.enclosing(expression, "callable-body") === declaration &&
    policy.facts.navigation.identity.isProjectDeclaration(declaration)) {
    return Object.freeze({ kind: "function", expression, declaration });
  }
  if (receiverExpression !== undefined && selected === undefined && declaration === undefined) {
    const receiver = represented(policy.types.value(receiverExpression));
    const arms = getCsharpRuntimeUnionArms(receiver, policy.typeDefinitions);
    if (receiver !== undefined && arms !== undefined && arms.length > 1 &&
      arms.every(arm => policy.projectTypes.catalog.definitionForTarget(arm)?.kind === "class")) {
      return Object.freeze({ kind: "union-method", expression,
        receiver: Object.freeze({ expression: receiverExpression, type: receiver }) });
    }
  }
  const staticReceiver = receiverExpression === undefined ? undefined : resolveCsharpStaticMemberReceiver(
    policy.ast, policy.facts, policy.projectTypes.catalog, selected, receiverExpression);
  if (staticReceiver !== undefined && declaration !== undefined && selected !== undefined &&
    policy.ast.is.IsMethodDeclaration(declaration) && policy.ast.is.IsMethodDeclaration(selected) && receiverExpression !== undefined) {
    return Object.freeze({ kind: "method", expression, declaration: selected,
      receiver: Object.freeze({ expression: receiverExpression, type: staticReceiver }) });
  }
  const type = represented(receiverExpression === undefined ? policy.types.value(expression) : policy.types.readStorage(expression));
  if (selected === undefined || declaration === undefined) {
    if (type === undefined || getCsharpCallableValueSignature(getCsharpNullableElementTargetType(type) ?? type) === undefined) {
      return reject("A source callee requires its exact selected declaration or native callable storage contract.", "required");
    }
  } else {
    const nominalMethod = policy.ast.is.IsClassDeclaration(policy.ast.parent(declaration));
    const liftedReceiver = source.optionalChain && source.receiver !== undefined &&
      policy.ast.is.IsCallExpression(source.use) && policy.ast.as.AsCallExpression(source.use)?.QuestionDotToken === undefined &&
      nominalMethod && policy.ast.questionToken(declaration) === undefined && policy.ast.questionToken(selected) === undefined;
    const methodDeclaration = policy.ast.is.IsMethodDeclaration(declaration) || policy.ast.kindName(declaration) === "KindMethodSignature";
    const selectedMethod = policy.ast.is.IsMethodDeclaration(selected) || policy.ast.kindName(selected) === "KindMethodSignature";
    if ((getCsharpNullableElementTargetType(type) === undefined || liftedReceiver) &&
      (getCsharpMethodValue(type) === undefined || nominalMethod) &&
      receiverExpression !== undefined && methodDeclaration && selectedMethod) {
      const receiver = represented(policy.types.value(receiverExpression));
      if (receiver === undefined) return reject("A direct source method requires its exact native receiver contract.",
        policy.facts.navigation.identity.isProjectDeclaration(declaration) || policy.facts.navigation.identity.isProjectDeclaration(selected)
          ? "required" : "not-applicable");
      return Object.freeze({ kind: "method", expression, declaration: selected,
        receiver: Object.freeze({ expression: receiverExpression, type: receiver }) });
    }
  }
  if (type === undefined || getCsharpMethodValue(getCsharpNullableElementTargetType(type) ?? type) === undefined &&
      getCsharpDelegateSignature(getCsharpNullableElementTargetType(type) ?? type) === undefined) {
    return reject("A source callable value requires its exact native delegate or method-value storage contract.", "required");
  }
  return Object.freeze({ kind: "value", expression, type });
}
