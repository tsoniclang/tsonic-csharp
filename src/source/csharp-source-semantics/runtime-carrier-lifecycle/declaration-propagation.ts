import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservationContext,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
} from "../ast-utils.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../runtime-carrier-context.js";
import {
  getRuntimeCarrierSubjectSymbol,
} from "../runtime-carrier-subjects.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "../runtime-carrier-types.js";
import {
  csharpNullableTargetType,
} from "../target-types.js";
import type {
  RuntimeCarrierFact,
  RuntimeCarrierLifecycleFactsContext,
} from "./context.js";
import {
  setRuntimeCarrierFactIfAbsentOrStronger,
} from "./fact-writes.js";

export function propagateCsharpRuntimeCarrierFactFromDeclarationType(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  sourceFile: SourceFile,
  node: Node,
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || !isTypedRuntimeCarrierDeclaration(compiler.ast, node)) {
    return;
  }
  const typeNode = asNodeSubject(getNodeField(node, "Type"));
  const name = asNodeSubject(getNodeField(node, "name"));
  const resolvedTypeFact = lifecycleContext.host.facts.get(typeNode, runtimeCarrierFactKey) ??
    resolveDeclarationTypeRuntimeCarrierFact(lifecycleContext, typeNode, host);
  if (resolvedTypeFact === undefined) {
    return;
  }
  const typeFact = isOptionalParameterDeclaration(compiler.ast, node)
    ? { carrier: csharpNullableTargetType(resolvedTypeFact.carrier) }
    : resolvedTypeFact;
  const message = "C# runtime carrier propagated from checked declaration type annotation.";
  setRuntimeCarrierFactIfAbsentOrStronger(lifecycleContext, node, typeFact, message);
  if (name !== undefined) {
    setRuntimeCarrierFactIfAbsentOrStronger(lifecycleContext, name, typeFact, message);
    const symbol = getRuntimeCarrierSubjectSymbol(compiler, sourceFile, name);
    if (symbol !== undefined) {
      setRuntimeCarrierFactIfAbsentOrStronger(lifecycleContext, symbol, typeFact, message);
    }
  }
}

export function resolveDeclarationTypeRuntimeCarrierFact(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  typeNode: Node | undefined,
  host: CsharpRuntimeCarrierSemanticsHost,
): RuntimeCarrierFact | undefined {
  if (typeNode === undefined) {
    return undefined;
  }
  const carrier = host.getTargetTypeRefForSubject(
    typeNode,
    createRuntimeCarrierLifecycleObservationContext(lifecycleContext),
    { allowRuntimeCarrier: false },
  );
  if (carrier === undefined) {
    return undefined;
  }
  const fact = { carrier };
  lifecycleContext.host.facts.set(typeNode, runtimeCarrierFactKey, fact, [{ message: "C# declaration runtime carrier resolved from source type annotation semantics." }]);
  return fact;
}

function isOptionalParameterDeclaration(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  return ast.kindName(node) === "KindParameter" &&
    asNodeSubject(getNodeField(node, "QuestionToken")) !== undefined;
}

function isTypedRuntimeCarrierDeclaration(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  switch (ast.kindName(node)) {
    case "KindVariableDeclaration":
    case "KindParameter":
    case "KindPropertyDeclaration":
      return true;
    default:
      return false;
  }
}
