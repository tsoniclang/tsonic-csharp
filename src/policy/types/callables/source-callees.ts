import type { ResolvedSourceCallInfo, SourceFile } from "@tsonic/tsts";
import type { CsharpTypePolicyBaseHost, CsharpTypePolicy } from "../resolution/model.js";
import type { CsharpSourceCalleeSelection } from "../../../target-model/operations/source-callees.js";
import { getCsharpMethodValue } from "../../../target-model/types/method-values.js";
import { getCsharpCallableValueSignature, getCsharpDelegateSignature } from "../../../target-model/types/delegates.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import type { CsharpProjectTypePolicy } from "../project/project-types.js";
import { resolveCsharpStaticMemberReceiver } from "../project/static-members.js";
import { getCsharpRuntimeUnionArms } from "../../../target-model/types/runtime-carriers.js";
import type { CsharpTypeDefinitions } from "../../../target-model/types/source-union-definitions.js";

export interface CsharpSourceCalleeHost {
  readonly ast: CsharpTypePolicyBaseHost["ast"];
  readonly navigation: CsharpTypePolicyBaseHost["navigation"];
  readonly projectTypes: Pick<CsharpProjectTypePolicy, "catalog">;
  readonly types: Pick<CsharpTypePolicy, "resolveSelectedValue">;
  readonly typeDefinitions?: CsharpTypeDefinitions;
}

export function classifyCsharpSourceCallee(
  policy: CsharpSourceCalleeHost,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
): CsharpSourceCalleeSelection {
  const expression = source.sourceCallee.expression;
  const selected = source.sourceCalleeAccess?.selectedDeclaration ?? source.sourceCallee.selectedDeclaration;
  const reference = policy.navigation.sourceReferenceFor(expression);
  const declaration = reference?.declaration ?? source.sourceCalleeAccess?.declaration ?? source.sourceCallee.declaration;
  if (declaration !== undefined && selected !== undefined &&
    policy.ast.is.IsFunctionDeclaration(declaration) && policy.ast.is.IsFunctionDeclaration(selected)) {
    return Object.freeze({ kind: "function", expression, declaration: selected });
  }
  const access = source.sourceCalleeAccess;
  if (access !== undefined && selected === undefined && declaration === undefined) {
    const receiver = policy.types.resolveSelectedValue(access.receiver.expression, access.receiver.type, sourceFile);
    const arms = getCsharpRuntimeUnionArms(receiver, policy.typeDefinitions);
    if (receiver !== undefined && arms !== undefined && arms.length > 1 &&
      arms.every(arm => policy.projectTypes.catalog.definitionForTarget(arm)?.kind === "class")) {
      return Object.freeze({ kind: "union-method", expression: access.expression,
        receiver: Object.freeze({ expression: access.receiver.expression, type: receiver }) });
    }
  }
  const staticReceiver = access === undefined ? undefined : resolveCsharpStaticMemberReceiver(
    policy.ast, policy.navigation, policy.projectTypes.catalog, selected, access.receiver.expression);
  if (staticReceiver !== undefined && declaration !== undefined && selected !== undefined &&
    policy.ast.is.IsMethodDeclaration(declaration) && policy.ast.is.IsMethodDeclaration(selected) && access !== undefined) {
    return Object.freeze({ kind: "method", expression: access.expression, declaration: selected,
      receiver: Object.freeze({ expression: access.receiver.expression, type: staticReceiver }) });
  }
  const type = policy.types.resolveSelectedValue(expression, source.sourceCallee.type, sourceFile);
  const reject = (reason: string): CsharpSourceCalleeSelection => Object.freeze({ kind: "rejected", reason });
  if (selected === undefined || declaration === undefined) {
    if (type === undefined || getCsharpCallableValueSignature(getCsharpNullableElementTargetType(type) ?? type) === undefined) {
      return reject("A source callee requires its exact selected declaration or native callable storage contract.");
    }
  } else if ((getCsharpMethodValue(type) === undefined ||
      policy.ast.is.IsClassDeclaration(policy.ast.parent(declaration))) &&
      (source.sourceCalleeAccess?.kind === "property" || source.sourceCalleeAccess?.kind === "element") &&
      (policy.ast.is.IsMethodDeclaration(declaration) || policy.ast.kindName(declaration) === "KindMethodSignature") &&
      (policy.ast.is.IsMethodDeclaration(selected) || policy.ast.kindName(selected) === "KindMethodSignature")) {
    const access = source.sourceCalleeAccess;
    const receiver = policy.types.resolveSelectedValue(access.receiver.expression, access.receiver.type, sourceFile);
    if (receiver === undefined) return reject("A direct source method requires its exact native receiver contract.");
    return Object.freeze({ kind: "method", expression: access.expression, declaration: selected,
      receiver: Object.freeze({ expression: access.receiver.expression, type: receiver }) });
  }
  if (type === undefined || getCsharpMethodValue(getCsharpNullableElementTargetType(type) ?? type) === undefined &&
      getCsharpDelegateSignature(getCsharpNullableElementTargetType(type) ?? type) === undefined) {
    return reject("A source callable value requires its exact native delegate or method-value storage contract.");
  }
  return Object.freeze({ kind: "value", expression, type });
}
