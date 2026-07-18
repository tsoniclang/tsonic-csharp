import type {
  ExtensionFactSubject,
  ExtensionLifecycleContext,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import {
  contextualTargetTypeFactKey,
  targetConversionFactKey,
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
import {
  isSourceDeclaredStructTargetType,
} from "./source-declaration-facts/target-type.js";
import type {
  CsharpObjectShapeSemanticsHost,
} from "./object-shape-types.js";
import type {
  CsharpRecursiveTargetTypeResolver,
} from "./target-type-syntax-types.js";
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
  resolver?: CsharpRecursiveTargetTypeResolver,
): CsharpObjectShapeFact | undefined {
  const sourceDeclaredStruct = getCsharpSourceStructDeclarationTargetForSubject(subject, context, host);
  if (sourceDeclaredStruct !== undefined) {
    return sourceDeclaredStruct.objectShape;
  }
  const recorded = getRecordedCsharpObjectShapeFactForSubject(subject, context);
  if (subjectIsSourceCoreStructDeclarationPayload(subject, context)) {
    if (recorded !== undefined) {
      recordCsharpObjectShapeFactForSubject(subject, context, recorded);
    }
    return recorded;
  }
  if (recorded !== undefined && isSourceDeclaredStructTargetType(recorded.targetType)) {
    recordCsharpObjectShapeFactForSubject(subject, context, recorded);
    return recorded;
  }
  if (objectLiteralHasSelectedTargetContext(subject, context)) {
    const contextual = deriveCsharpObjectShapeFactForCanonicalSubject(subject, context, host, resolver);
    if (contextual !== undefined) {
      recordCsharpObjectShapeFactForSubject(subject, context, contextual);
      return contextual;
    }
  }
  if (recorded !== undefined) {
    recordCsharpObjectShapeFactForSubject(subject, context, recorded);
    return recorded;
  }
  const derived = deriveCsharpObjectShapeFactForCanonicalSubject(subject, context, host, resolver);
  if (derived === undefined) {
    return undefined;
  }
  recordCsharpObjectShapeFactForSubject(subject, context, derived);
  return derived;
}

function objectLiteralHasSelectedTargetContext(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): boolean {
  const node = asNodeSubject(subject);
  const ast = context.compiler?.ast;
  return node !== undefined &&
    ast?.is.IsObjectLiteralExpression(node) === true &&
    (context.facts.get(node, contextualTargetTypeFactKey) !== undefined ||
      context.factResolver.resolve(node, contextualTargetTypeFactKey) !== undefined ||
      context.facts.get(node, targetConversionFactKey) !== undefined ||
      context.factResolver.resolve(node, targetConversionFactKey) !== undefined);
}

export function recordCsharpObjectShapeFactsBeforeFinalization(
  lifecycleContext: Pick<ExtensionLifecycleContext, "host" | "compiler">,
  host: CsharpObjectShapeSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = {
    observation: "type.resolveRuntimeCarrier",
    phase: "finalization",
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
      if (isObjectShapeFactRecordingCandidate(compiler.ast, node)) {
        getCsharpObjectShapeFactForSubject(node, context, host);
      }
    });
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      recordObjectBindingMemberRuntimeCarriers(lifecycleContext, sourceFile, node, context, host, getCsharpObjectShapeFactForSubject);
    });
  }
}

function isObjectShapeFactRecordingCandidate(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: NonNullable<ReturnType<typeof asNodeSubject>>,
): boolean {
  const kind = ast.kindName(node);
  return kind === "KindObjectLiteralExpression" ||
    kind === "KindTypeLiteral" ||
    kind === "KindInterfaceDeclaration" ||
    kind === "KindTypeAliasDeclaration";
}

function deriveCsharpObjectShapeFactForCanonicalSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
  resolver?: CsharpRecursiveTargetTypeResolver,
): CsharpObjectShapeFact | undefined {
  if (subjectHasSourceDeclaredStructRuntimeCarrier(subject, context)) {
    return undefined;
  }
  if (subjectIsSourceCoreStructDeclarationPayload(subject, context)) {
    return undefined;
  }
  const semanticFact = deriveCsharpObjectShapeFactForSemanticSubject(subject, context, host, resolver);
  if (semanticFact !== undefined) {
    return semanticFact;
  }
  const declarationType = getDeclarationTypeNode(subject, context);
  return deriveCsharpObjectShapeFactForSubject(declarationType ?? asNodeSubject(subject), context, host, resolver);
}
