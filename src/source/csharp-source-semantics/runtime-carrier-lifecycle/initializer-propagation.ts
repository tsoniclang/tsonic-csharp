import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
} from "../ast-utils.js";
import {
  getRuntimeCarrierSubjectSymbol,
} from "../runtime-carrier-subjects.js";
import type {
  RuntimeCarrierLifecycleFactsContext,
} from "./context.js";
import {
  setRuntimeCarrierFactIfAbsentOrStronger,
} from "./fact-writes.js";

export function propagateCsharpRuntimeCarrierFactFromVariableInitializer(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  sourceFile: SourceFile,
  node: Node,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || compiler.ast.kindName(node) !== "KindVariableDeclaration") {
    return;
  }
  const initializer = asNodeSubject(getNodeField(node, "Initializer"));
  const name = asNodeSubject(getNodeField(node, "name"));
  const initializerFact = lifecycleContext.host.facts.get(initializer, runtimeCarrierFactKey);
  if (initializerFact === undefined) {
    return;
  }
  const message = "C# runtime carrier propagated from checked initializer syntax.";
  setRuntimeCarrierFactIfAbsentOrStronger(lifecycleContext, node, initializerFact, message);
  if (name !== undefined) {
    setRuntimeCarrierFactIfAbsentOrStronger(lifecycleContext, name, initializerFact, message);
    const symbol = getRuntimeCarrierSubjectSymbol(compiler, sourceFile, name);
    setRuntimeCarrierFactIfAbsentOrStronger(lifecycleContext, symbol, initializerFact, message);
  }
}
