import { jsRegExpSourceProfileIdentity } from "@tsonic/js-source-profile";
import type { Node } from "@tsonic/tsts";
import { csharpSourceProfileDeclarationIdentity } from "../../../policy/identities/selected-source.js";

export function csharpRegExpReceiverHasNativeExecution(
  receiver: Node,
  context: { readonly host: import("../../../policy/model/provider-calls.js").CsharpProviderCallSelectionHost; readonly sourceFile: import("@tsonic/tsts").SourceFile },
): boolean {
  const { ast, navigation } = context.host;
  let origin = receiver;
  while (ast.is.IsParenthesizedExpression(origin)) {
    const inner = ast.as.AsParenthesizedExpression(origin)?.Expression;
    if (inner === undefined) return false;
    origin = inner;
  }
  if (ast.is.IsIdentifier(origin)) {
    const declaration = navigation.sourceReferenceFor(origin)?.declaration;
    const initializer = declaration === undefined || !ast.is.IsVariableDeclaration(declaration)
      ? undefined : ast.as.AsVariableDeclaration(declaration)?.Initializer;
    if (initializer === undefined || navigation.declarationUseSummary(declaration!).bindingWritten) return false;
    const flow = navigation.expressionValueFlow(initializer);
    if (flow.escapes || flow.hasUnclassifiedUse || flow.memberWritten || flow.bindingAliased) return false;
    origin = initializer;
  }
  if (ast.kindName(origin) === "KindRegularExpressionLiteral") return true;
  if (!ast.is.IsNewExpression(origin)) return false;
  const semantics = context.host.semantics(ast.getSourceFile(origin) ?? context.sourceFile);
  const selected = semantics.operations.call(origin);
  const identity = selected === undefined ? undefined : csharpSourceProfileDeclarationIdentity(
    ast, semantics, context.host.sourceFacts,
    semantics.declarations.signatureDeclaration(selected.selectedSignature),
  );
  return identity?.owner === "js" && identity.kind === "construct" &&
    identity.declaringName === jsRegExpSourceProfileIdentity.owners.regExpConstructor;
}
