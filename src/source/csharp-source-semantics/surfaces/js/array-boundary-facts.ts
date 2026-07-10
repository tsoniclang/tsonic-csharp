import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  runtimeCarrierFactKey,
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import {
  csharpSourceReturnCarrierFactKey,
  csharpArrayBoundaryFactKey,
} from "../../../csharp-facts.js";
import {
  asNodeSubject,
  getNodeField,
} from "../../ast-utils.js";

export function getCsharpArrayBoundaryCoreCarrier(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  return subject === undefined
    ? undefined
    : (context.factResolver.resolve(subject, csharpArrayBoundaryFactKey) ??
      context.facts.get(subject, csharpArrayBoundaryFactKey))?.coreCarrierType;
}

export function getCsharpArrayBoundaryCoreCarrierForReference(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  sourceFile?: SourceFile,
): TargetTypeRef | undefined {
  const direct = getCsharpArrayBoundaryCoreCarrier(subject, context);
  if (direct !== undefined) {
    return direct;
  }
  const subjectNode = asNodeSubject(subject);
  const compiler = context.compiler;
  if (subjectNode === undefined || compiler === undefined) {
    return undefined;
  }
  const subjectSourceFile = sourceFile ?? compiler.ast.getSourceFile(subjectNode);
  if (subjectSourceFile === undefined) {
    return undefined;
  }
  const symbols = [
    compiler.checker.getSymbolAtLocation(subjectNode, { sourceFile: subjectSourceFile }),
    getResolvedSymbol(subjectNode, subjectSourceFile, context),
  ];
  for (const symbol of symbols) {
    const symbolCarrier = getCsharpArrayBoundaryCoreCarrier(symbol, context);
    if (symbolCarrier !== undefined) {
      return symbolCarrier;
    }
    for (const declaration of compiler.checker.getSymbolDeclarations(symbol)) {
      if (declaration === undefined) {
        continue;
      }
      const declarationCarrier = getCsharpArrayBoundaryCoreCarrier(declaration, context) ??
        getCsharpArrayBoundaryCoreCarrier(asNodeSubject(getNodeField(declaration, "name")), context) ??
        getCsharpArrayBoundaryCoreCarrier(asNodeSubject(getNodeField(declaration, "Name")), context) ??
        getCsharpArrayBoundaryCoreCarrier(asNodeSubject(getNodeField(declaration, "type")), context) ??
        getCsharpArrayBoundaryCoreCarrier(asNodeSubject(getNodeField(declaration, "Type")), context) ??
        getInitializerSourceReturnCarrier(declaration, context) ??
        getInitializerRuntimeCarrier(declaration, context);
      if (declarationCarrier !== undefined) {
        return declarationCarrier;
      }
    }
  }
  return undefined;
}

function getInitializerSourceReturnCarrier(
  declaration: Node,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const initializer = asNodeSubject(getNodeField(declaration, "Initializer"));
  if (initializer === undefined) {
    return undefined;
  }
  const selectedSignature = context.facts.get(initializer, selectedTargetSignatureFactKey) ??
    context.factResolver.resolve(initializer, selectedTargetSignatureFactKey);
  if (selectedSignature === undefined) {
    return undefined;
  }
  for (const subject of [selectedSignature.sourceDeclaration, selectedSignature.sourceSignature]) {
    const carrier = subject === undefined
      ? undefined
      : (context.facts.get(subject, csharpSourceReturnCarrierFactKey) ??
        context.factResolver.resolve(subject, csharpSourceReturnCarrierFactKey))?.carrier;
    if (carrier !== undefined) {
      return carrier;
    }
  }
  return undefined;
}

function getInitializerRuntimeCarrier(
  declaration: Node,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const initializer = asNodeSubject(getNodeField(declaration, "Initializer"));
  return initializer === undefined
    ? undefined
    : (context.facts.get(initializer, runtimeCarrierFactKey) ??
      context.factResolver.resolve(initializer, runtimeCarrierFactKey))?.carrier;
}

function getResolvedSymbol(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
): ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["checker"]["getResolvedSymbol"]> | undefined {
  return context.compiler?.checker.getResolvedSymbol(node, { sourceFile });
}
