import type {
  Node,
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
  recordCsharpDeclarationReturnRuntimeCarrierFacts,
} from "./return-propagation.js";
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
  const sourceFiles = compiler.getSourceFiles()
    .filter((sourceFile): sourceFile is SourceFile => sourceFile !== undefined && sourceFile.IsDeclarationFile !== true);
  const nodesBySourceFile = sourceFiles.map((sourceFile) => ({
    sourceFile,
    nodes: collectRuntimeCarrierNodes(compiler.ast, sourceFile),
  }));
  for (const { sourceFile, nodes } of nodesBySourceFile) {
    recordRuntimeCarrierTypeSyntaxFacts(lifecycleContext, sourceFile, nodes, targetId, host);
  }
  for (const { sourceFile, nodes } of nodesBySourceFile) {
    propagateRuntimeCarrierDeclarationFacts(lifecycleContext, sourceFile, nodes, host);
  }
  for (const { sourceFile, nodes } of nodesBySourceFile) {
    propagateRuntimeCarrierObjectBindingFacts(lifecycleContext, sourceFile, nodes, host);
  }
  for (const { sourceFile, nodes } of nodesBySourceFile) {
    propagateRuntimeCarrierReferencedFacts(lifecycleContext, sourceFile, nodes);
  }
  for (const { sourceFile, nodes } of nodesBySourceFile) {
    propagateRuntimeCarrierInitializerFacts(lifecycleContext, sourceFile, nodes);
  }
  for (const { sourceFile, nodes } of nodesBySourceFile) {
    recordRuntimeCarrierSyntaxFacts(lifecycleContext, sourceFile, nodes, host);
  }
  for (const { sourceFile, nodes } of nodesBySourceFile) {
    propagateRuntimeCarrierExpectedFacts(lifecycleContext, sourceFile, nodes, host);
  }
  for (const { sourceFile, nodes } of nodesBySourceFile) {
    recordDeclarationReturnRuntimeCarrierFacts(lifecycleContext, sourceFile, nodes, host);
  }
}

function recordRuntimeCarrierTypeSyntaxFacts(
  lifecycleContext: CsharpLifecycleObservationContext,
  sourceFile: SourceFile,
  nodes: readonly Node[],
  targetId: string,
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  for (const node of [...nodes].reverse()) {
    if (isRuntimeCarrierTypeSyntaxNode(compiler.ast, node)) {
      recordCsharpRuntimeCarrierFact(lifecycleContext, sourceFile, node, targetId, host);
    }
  }
}

function propagateRuntimeCarrierDeclarationFacts(
  lifecycleContext: CsharpLifecycleObservationContext,
  sourceFile: SourceFile,
  nodes: readonly Node[],
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  for (const node of [...nodes].reverse()) {
    propagateCsharpRuntimeCarrierFactFromDeclarationType(lifecycleContext, sourceFile, node, host);
  }
}

function propagateRuntimeCarrierObjectBindingFacts(
  lifecycleContext: CsharpLifecycleObservationContext,
  sourceFile: SourceFile,
  nodes: readonly Node[],
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  for (const node of [...nodes].reverse()) {
    propagateCsharpRuntimeCarrierFactFromObjectBindingDeclaration(lifecycleContext, sourceFile, node, host);
  }
}

function recordRuntimeCarrierSyntaxFacts(
  lifecycleContext: CsharpLifecycleObservationContext,
  sourceFile: SourceFile,
  nodes: readonly Node[],
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  for (const node of [...nodes].reverse()) {
    recordCsharpRuntimeCarrierSyntaxFact(lifecycleContext, sourceFile, node, host);
  }
}

function propagateRuntimeCarrierInitializerFacts(
  lifecycleContext: CsharpLifecycleObservationContext,
  sourceFile: SourceFile,
  nodes: readonly Node[],
): void {
  for (const node of [...nodes].reverse()) {
    propagateCsharpRuntimeCarrierFactFromVariableInitializer(lifecycleContext, sourceFile, node);
  }
}

function propagateRuntimeCarrierReferencedFacts(
  lifecycleContext: CsharpLifecycleObservationContext,
  sourceFile: SourceFile,
  nodes: readonly Node[],
): void {
  for (const node of [...nodes].reverse()) {
    propagateCsharpRuntimeCarrierFactFromReferencedSymbol(lifecycleContext, sourceFile, node);
  }
}

function propagateRuntimeCarrierExpectedFacts(
  lifecycleContext: CsharpLifecycleObservationContext,
  sourceFile: SourceFile,
  nodes: readonly Node[],
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  for (const node of nodes) {
    propagateCsharpExpectedRuntimeCarrierFactFromContext(lifecycleContext, sourceFile, node, host);
  }
}

function recordDeclarationReturnRuntimeCarrierFacts(
  lifecycleContext: CsharpLifecycleObservationContext,
  sourceFile: SourceFile,
  nodes: readonly Node[],
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  recordCsharpDeclarationReturnRuntimeCarrierFacts(lifecycleContext, sourceFile, nodes, host);
}
