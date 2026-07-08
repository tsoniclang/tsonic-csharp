import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
} from "../csharp-facts.js";
import {
  asNodeSubject,
  visitAstReaderNodes,
} from "./ast-utils.js";
import {
  getDeclarationTypeNode,
} from "./symbol-utils.js";
import {
  deriveCsharpObjectShapeFactForSemanticSubject,
} from "./object-shape-semantic-facts.js";
import {
  deriveCsharpObjectShapeFactForSubject,
} from "./object-shape-type-literal-facts.js";
import {
  getRecordedCsharpObjectShapeFactForSubject,
  subjectHasSourceDeclaredStructRuntimeCarrier,
  subjectIsSourceCoreStructDeclarationPayload,
} from "./object-shape-recorded-facts.js";
import {
  getCsharpSourceStructDeclarationTargetForSubject,
} from "./source-declaration-facts.js";
import type {
  CsharpObjectShapeSemanticsHost,
} from "./object-shape-types.js";
import {
  recordObjectBindingMemberRuntimeCarriers,
} from "./object-shape-facts/binding-carriers.js";
import {
  recordCsharpObjectShapeFactForSubject,
} from "./object-shape-facts/recording.js";

export {
  getTargetTypeRefForSyntaxNode,
  recordCsharpTypeParameterConstraintFactsBeforeFinalization,
} from "./object-shape-syntax-facts.js";
export type {
  CsharpObjectShapeSemanticsHost,
} from "./object-shape-types.js";
export {
  getRecordedCsharpObjectShapeFactForSubject,
} from "./object-shape-recorded-facts.js";
export {
  getSemanticTypeDeclarationShape,
} from "./object-shape-semantic-facts.js";

export function getCsharpObjectShapeFactForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
): CsharpObjectShapeFact | undefined {
  const sourceDeclaredStruct = getCsharpSourceStructDeclarationTargetForSubject(subject, context, host);
  if (sourceDeclaredStruct !== undefined) {
    return sourceDeclaredStruct.objectShape;
  }
  const recorded = getRecordedCsharpObjectShapeFactForSubject(subject, context);
  if (recorded !== undefined) {
    return recorded;
  }
  const derived = safeDeriveCsharpObjectShapeFactForCanonicalSubject(subject, context, host);
  if (derived === undefined) {
    return undefined;
  }
  recordCsharpObjectShapeFactForSubject(subject, context, derived);
  return derived;
}

export function recordCsharpObjectShapeFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  host: CsharpObjectShapeSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = {
    observation: "type.resolveRuntimeCarrier",
    extensionId: "",
    host: lifecycleContext.host,
    facts: lifecycleContext.host.facts,
    factResolver: lifecycleContext.host.factResolver,
    diagnostics: lifecycleContext.host.diagnostics,
    compiler,
  } satisfies ExtensionObservationContext;
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      getCsharpObjectShapeFactForSubject(node, context, host);
    });
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      recordObjectBindingMemberRuntimeCarriers(lifecycleContext, sourceFile, node, context, host, getCsharpObjectShapeFactForSubject);
    });
  }
}

function safeDeriveCsharpObjectShapeFactForCanonicalSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
): CsharpObjectShapeFact | undefined {
  return deriveCsharpObjectShapeFactForCanonicalSubject(subject, context, host);
}

function deriveCsharpObjectShapeFactForCanonicalSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
): CsharpObjectShapeFact | undefined {
  if (subjectHasSourceDeclaredStructRuntimeCarrier(subject, context)) {
    return undefined;
  }
  if (subjectIsSourceCoreStructDeclarationPayload(subject, context)) {
    return undefined;
  }
  const semanticFact = deriveCsharpObjectShapeFactForSemanticSubject(subject, context, host);
  if (semanticFact !== undefined) {
    return semanticFact;
  }
  const declarationType = getDeclarationTypeNode(subject, context);
  return deriveCsharpObjectShapeFactForSubject(declarationType ?? asNodeSubject(subject), context, host);
}
