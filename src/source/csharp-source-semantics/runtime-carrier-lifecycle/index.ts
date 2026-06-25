import type {
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpLifecycleObservationContext,
} from "../runtime-carrier-context.js";
import {
  isRuntimeCarrierTypeSyntaxNode,
} from "../runtime-carrier-subjects.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "../runtime-carrier-types.js";
import {
  collectRuntimeCarrierNodes,
} from "./collect-nodes.js";
import {
  propagateCsharpRuntimeCarrierFactFromDeclarationType,
} from "./declaration-propagation.js";
import {
  propagateCsharpExpectedRuntimeCarrierFactFromContext,
} from "./expected-context-propagation.js";
import {
  propagateCsharpRuntimeCarrierFactFromVariableInitializer,
} from "./initializer-propagation.js";
import {
  recordCsharpRuntimeCarrierFact,
} from "./lifecycle-recording.js";
import {
  propagateCsharpRuntimeCarrierFactFromObjectBindingDeclaration,
} from "./object-binding-propagation.js";
import {
  propagateCsharpRuntimeCarrierFactFromReferencedSymbol,
} from "./referenced-propagation.js";
import {
  recordCsharpRuntimeCarrierSyntaxFact,
} from "./syntax-facts.js";

export function recordCsharpRuntimeCarrierFactsBeforeFinalization(
  lifecycleContext: CsharpLifecycleObservationContext,
  targetId: string,
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    recordRuntimeCarrierFactsForSourceFile(lifecycleContext, sourceFile, targetId, host);
  }
}

function recordRuntimeCarrierFactsForSourceFile(
  lifecycleContext: CsharpLifecycleObservationContext,
  sourceFile: SourceFile,
  targetId: string,
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const nodes = collectRuntimeCarrierNodes(compiler.ast, sourceFile);
  for (const node of [...nodes].reverse()) {
    if (isRuntimeCarrierTypeSyntaxNode(compiler.ast, node)) {
      recordCsharpRuntimeCarrierFact(lifecycleContext, sourceFile, node, targetId, host);
    }
  }
  for (const node of [...nodes].reverse()) {
    propagateCsharpRuntimeCarrierFactFromDeclarationType(lifecycleContext, sourceFile, node, host);
  }
  for (const node of [...nodes].reverse()) {
    propagateCsharpRuntimeCarrierFactFromObjectBindingDeclaration(lifecycleContext, sourceFile, node, host);
  }
  for (const node of [...nodes].reverse()) {
    recordCsharpRuntimeCarrierSyntaxFact(lifecycleContext, sourceFile, node, host);
  }
  for (const node of [...nodes].reverse()) {
    propagateCsharpRuntimeCarrierFactFromVariableInitializer(lifecycleContext, sourceFile, node);
  }
  for (const node of [...nodes].reverse()) {
    propagateCsharpRuntimeCarrierFactFromReferencedSymbol(lifecycleContext, sourceFile, node);
  }
  for (const node of nodes) {
    propagateCsharpExpectedRuntimeCarrierFactFromContext(lifecycleContext, sourceFile, node, host);
  }
}
