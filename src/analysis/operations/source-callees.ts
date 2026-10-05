import type { Node, ResolvedSourceCallInfo, SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { getCsharpMethodValue } from "../../target-model/types/method-values.js";
import { getCsharpCallableValueSignature, getCsharpDelegateSignature } from "../../target-model/types/delegates.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/nullable.js";

export type CsharpSourceCalleeSelection =
  | { readonly kind: "function"; readonly expression: Node; readonly declaration: Node }
  | { readonly kind: "method"; readonly expression: Node; readonly declaration: Node;
      readonly receiver: { readonly expression: Node; readonly type: TargetTypeRef } }
  | { readonly kind: "value"; readonly expression: Node; readonly type: TargetTypeRef }
  | { readonly kind: "rejected"; readonly reason: string };

export function classifyCsharpSourceCallee(
  policy: CsharpPolicyContext,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
): CsharpSourceCalleeSelection {
  const expression = source.sourceCallee.expression;
  const selected = source.sourceCalleeAccess?.selectedDeclaration ?? source.sourceCallee.selectedDeclaration;
  const reference = policy.navigation.sourceReferenceFor(expression);
  const declaration = reference?.declaration ?? source.sourceCalleeAccess?.declaration ?? source.sourceCallee.declaration;
  const type = policy.types.resolveReadStorage(expression, sourceFile) ?? policy.types.resolveNode(expression, sourceFile);
  const reject = (reason: string): CsharpSourceCalleeSelection => Object.freeze({ kind: "rejected", reason });
  if (selected === undefined || declaration === undefined) {
    if (type === undefined || getCsharpCallableValueSignature(getCsharpNullableElementTargetType(type) ?? type) === undefined) {
      return reject("A source callee requires its exact selected declaration or native callable storage contract.");
    }
  } else if (policy.ast.is.IsFunctionDeclaration(declaration) && policy.ast.is.IsFunctionDeclaration(selected)) {
    return Object.freeze({ kind: "function", expression, declaration: selected });
  } else if (getCsharpMethodValue(type) === undefined && source.sourceCalleeAccess?.kind === "property" &&
      (policy.ast.is.IsMethodDeclaration(declaration) || policy.ast.kindName(declaration) === "KindMethodSignature") &&
      (policy.ast.is.IsMethodDeclaration(selected) || policy.ast.kindName(selected) === "KindMethodSignature")) {
    if (policy.ast.hasModifierKind(selected, "static")) return Object.freeze({ kind: "function", expression, declaration: selected });
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
