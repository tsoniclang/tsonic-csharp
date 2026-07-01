import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  Node,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  nodeHasModifierKind,
} from "../ast-utils.js";
import {
  getBinaryOperatorText,
} from "../operator-syntax.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "../runtime-carrier-types.js";
import {
  resolveDeclarationTypeRuntimeCarrierFact,
} from "./declaration-propagation.js";
import {
  getCsharpTaskResultTargetType,
} from "../target-types.js";
import type {
  RuntimeCarrierLifecycleFactsContext,
} from "./context.js";
import {
  setRuntimeCarrierFactIfAbsent,
} from "./fact-writes.js";

export function propagateCsharpExpectedRuntimeCarrierFactFromContext(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  sourceFile: SourceFile,
  node: Node,
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const ast = compiler.ast;
  const kind = ast.kindName(node);
  if (kind === "KindReturnStatement") {
    const expression = asNodeSubject(getNodeField(node, "Expression"));
    const returnFact = getEnclosingReturnRuntimeCarrierFact(lifecycleContext, sourceFile, node, host);
    setRuntimeCarrierFactIfAbsent(lifecycleContext, expression, returnFact, "C# expected runtime carrier propagated from source return type.");
    return;
  }
  if (kind === "KindVariableDeclaration" || kind === "KindPropertyDeclaration") {
    const initializer = asNodeSubject(getNodeField(node, "Initializer"));
    const declarationFact = lifecycleContext.host.facts.get(node, runtimeCarrierFactKey) ??
      lifecycleContext.host.facts.get(asNodeSubject(getNodeField(node, "Type")), runtimeCarrierFactKey);
    setRuntimeCarrierFactIfAbsent(lifecycleContext, initializer, declarationFact, "C# expected runtime carrier propagated from source declaration type.");
    return;
  }
  if (ast.is.IsBinaryExpression(node) && getBinaryOperatorText(ast, node) === "=") {
    const leftFact = lifecycleContext.host.facts.get(asNodeSubject(getNodeField(node, "Left")), runtimeCarrierFactKey);
    setRuntimeCarrierFactIfAbsent(lifecycleContext, asNodeSubject(getNodeField(node, "Right")), leftFact, "C# expected runtime carrier propagated from assignment target.");
    return;
  }
  const nodeFact = lifecycleContext.host.facts.get(node, runtimeCarrierFactKey);
  if (nodeFact === undefined) {
    return;
  }
  if (kind === "KindConditionalExpression") {
    setRuntimeCarrierFactIfAbsent(lifecycleContext, asNodeSubject(getNodeField(node, "WhenTrue")), nodeFact, "C# expected runtime carrier propagated into conditional true branch.");
    setRuntimeCarrierFactIfAbsent(lifecycleContext, asNodeSubject(getNodeField(node, "WhenFalse")), nodeFact, "C# expected runtime carrier propagated into conditional false branch.");
    return;
  }
  if (kind === "KindParenthesizedExpression" || kind === "KindAsExpression" || kind === "KindSatisfiesExpression" || kind === "KindNonNullExpression" || kind === "KindTypeAssertionExpression") {
    setRuntimeCarrierFactIfAbsent(lifecycleContext, asNodeSubject(getNodeField(node, "Expression")), nodeFact, "C# expected runtime carrier propagated through transparent expression syntax.");
    return;
  }
  if (!ast.is.IsBinaryExpression(node)) {
    return;
  }
  const operator = getBinaryOperatorText(ast, node);
  if (operator === "??") {
    setRuntimeCarrierFactIfAbsent(lifecycleContext, asNodeSubject(getNodeField(node, "Right")), nodeFact, "C# expected runtime carrier propagated into nullish alternative expression.");
  }
}

function getEnclosingReturnRuntimeCarrierFact(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  sourceFile: SourceFile,
  returnStatement: Node,
  host: CsharpRuntimeCarrierSemanticsHost,
): { readonly carrier: TargetTypeRef } | undefined {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  let current = compiler.ast.parent(returnStatement);
  while (current !== undefined) {
    const kind = compiler.ast.kindName(current);
    if (
      kind === "KindFunctionDeclaration" ||
      kind === "KindMethodDeclaration" ||
      kind === "KindFunctionExpression" ||
      kind === "KindArrowFunction" ||
      kind === "KindGetAccessor"
    ) {
      const typeNode = asNodeSubject(getNodeField(current, "Type"));
      const declarationReturnFact = lifecycleContext.host.facts.get(typeNode, runtimeCarrierFactKey) ??
        resolveDeclarationTypeRuntimeCarrierFact(lifecycleContext, typeNode, host);
      if (!nodeHasModifierKind(compiler.ast, current, "KindAsyncKeyword")) {
        return declarationReturnFact;
      }
      const asyncResultCarrier = getCsharpTaskResultTargetType(declarationReturnFact?.carrier);
      return asyncResultCarrier === undefined ? undefined : { carrier: asyncResultCarrier };
    }
    current = compiler.ast.parent(current);
  }
  void sourceFile;
  return undefined;
}
