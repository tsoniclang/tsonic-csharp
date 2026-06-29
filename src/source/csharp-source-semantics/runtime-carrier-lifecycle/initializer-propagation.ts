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
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../runtime-carrier-context.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "../runtime-carrier-types.js";
import type {
  RuntimeCarrierFact,
  RuntimeCarrierLifecycleFactsContext,
} from "./context.js";
import {
  setRuntimeCarrierFactIfAbsentOrStronger,
} from "./fact-writes.js";

export function propagateCsharpRuntimeCarrierFactFromVariableInitializer(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  sourceFile: SourceFile,
  node: Node,
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || compiler.ast.kindName(node) !== "KindVariableDeclaration") {
    return;
  }
  const initializer = asNodeSubject(getNodeField(node, "Initializer"));
  const name = asNodeSubject(getNodeField(node, "name"));
  const initializerFact = lifecycleContext.host.facts.get(initializer, runtimeCarrierFactKey) ??
    getInitializerCarrierFromCheckedType(lifecycleContext, sourceFile, initializer, host);
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

function getInitializerCarrierFromCheckedType(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  sourceFile: SourceFile,
  initializer: Node | undefined,
  host: CsharpRuntimeCarrierSemanticsHost,
): RuntimeCarrierFact | undefined {
  if (initializer === undefined) {
    return undefined;
  }
  const compiler = lifecycleContext.compiler;
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
