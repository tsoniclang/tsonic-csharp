import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  getRecordedCsharpPropagatedRuntimeCarrierFact,
} from "../../csharp-facts.js";
import type {
  CsharpPropagatedRuntimeCarrierFact,
} from "../../csharp-facts.js";
import {
  asNodeSubject,
  getNodeField,
} from "../ast-utils.js";
import {
  getRuntimeCarrierSubjectSymbol,
} from "../runtime-carrier-subjects.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../runtime-carrier-context.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "../runtime-carrier-types.js";
import type {
  RuntimeCarrierLifecycleFactsContext,
} from "./context.js";
import {
  setRuntimeCarrierFactIfLocallyAbsent,
} from "./fact-writes.js";

export function propagateCsharpRuntimeCarrierFactFromDeclarationInitializer(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  sourceFile: SourceFile,
  node: Node,
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || !isInitializerRuntimeCarrierDeclaration(compiler.ast, node)) {
    return;
  }
  const initializer = asNodeSubject(getNodeField(node, "Initializer"));
  const name = asNodeSubject(getNodeField(node, "name"));
  const initializerFact = getRecordedCsharpPropagatedRuntimeCarrierFact(lifecycleContext.host.facts, initializer) ??
    getInitializerCarrierFromCheckedType(lifecycleContext, sourceFile, initializer, host);
  if (initializerFact === undefined) {
    return;
  }
  const message = "C# runtime carrier propagated from checked initializer syntax.";
  setRuntimeCarrierFactIfLocallyAbsent(lifecycleContext, node, initializerFact, message);
  if (name !== undefined) {
    setRuntimeCarrierFactIfLocallyAbsent(lifecycleContext, name, initializerFact, message);
    const symbol = getRuntimeCarrierSubjectSymbol(compiler, sourceFile, name);
    setRuntimeCarrierFactIfLocallyAbsent(lifecycleContext, symbol, initializerFact, message);
  }
}

function isInitializerRuntimeCarrierDeclaration(
  ast: NonNullable<RuntimeCarrierLifecycleFactsContext["compiler"]>["ast"],
  node: Node,
): boolean {
  const kind = ast.kindName(node);
  return kind === "KindVariableDeclaration" || kind === "KindPropertyDeclaration";
}

function getInitializerCarrierFromCheckedType(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  sourceFile: SourceFile,
  initializer: Node | undefined,
  host: CsharpRuntimeCarrierSemanticsHost,
): CsharpPropagatedRuntimeCarrierFact | undefined {
  if (initializer === undefined) {
    return undefined;
  }
  const compiler = lifecycleContext.compiler;
  if (
    compiler !== undefined &&
    (
      compiler.ast.is.IsCallExpression(initializer) ||
      compiler.ast.is.IsNewExpression(initializer) ||
      compiler.ast.is.IsAwaitExpression(initializer)
    )
  ) {
    return undefined;
  }
  const type = compiler?.checker.getTypeAtLocation(initializer, { sourceFile });
  const carrier = host.getTargetTypeRefForType(
    type,
    createRuntimeCarrierLifecycleObservationContext(lifecycleContext),
    {
      allowRuntimeCarrier: false,
      sourceFile,
    },
  );
  if (carrier === undefined) {
    return undefined;
  }
  return { carrier };
}
