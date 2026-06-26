import type {
  ExtensionObservation,
  ExtensionObservationContext,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  Node,
  SourceFile,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  acceptObservation,
  deferObservation,
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  visitAstReaderNodes,
} from "../../../ast-utils.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../../../runtime-carriers.js";
import {
  getSymbolDeclarations,
} from "../../../symbol-utils.js";
import {
  asType,
} from "../source-library.js";
import {
  getSourceLibraryDeclarationName,
} from "../../../source-library.js";
import {
  isSourceStandardLibraryDateType,
} from "../../../source-type-classification.js";
import {
  csharpJsDateTargetType,
} from "./target-type.js";

export function mapCsharpJsDateRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
): ExtensionObservation<RuntimeCarrierFactResult> {
  const carrier = getCsharpJsDateRuntimeCarrierForType(asType(request.type), context);
  return carrier === undefined
    ? deferObservation
    : acceptObservation<RuntimeCarrierFactResult>({
        carrier,
      }, [{ message: "C# JS surface Date runtime carrier mapped from checked JavaScript library type." }]);
}

export function getCsharpJsDateRuntimeCarrierForType(
  type: Type | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  return type !== undefined && isSourceStandardLibraryDateType(type, context)
    ? csharpJsDateTargetType()
    : undefined;
}

export function recordCsharpJsDateRuntimeCarrierFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      if (compiler.ast.is.IsNewExpression(node) !== true || lifecycleContext.host.facts.get(node, runtimeCarrierFactKey) !== undefined) {
        return;
      }
      if (!isCheckedSourceLibraryDateConstruction(node, sourceFile, context)) {
        return;
      }
      lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, {
        carrier: csharpJsDateTargetType(),
      }, [{ message: "C# JS surface Date constructor runtime carrier recorded from checked TypeScript Date construction." }]);
    });
  }
}

function isCheckedSourceLibraryDateConstruction(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
): boolean {
  const compiler = context.compiler;
  const expression = asNodeSubject(getNodeField(node, "Expression"));
  if (compiler === undefined || expression === undefined) {
    return false;
  }
  const symbol = compiler.checker.getSymbolAtLocation(expression, { sourceFile }) ??
    compiler.checker.getResolvedSymbol(expression, { sourceFile });
  return getSymbolDeclarations(symbol).some((declaration) =>
    getSourceLibraryDeclarationName(declaration, context) === "Date");
}
