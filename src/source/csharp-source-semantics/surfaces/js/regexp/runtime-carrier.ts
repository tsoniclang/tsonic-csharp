import type {
  ExtensionFactSubject,
  ExtensionLifecycleContext,
  ExtensionObservation,
  ExtensionObservationContext,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  SourceFile,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  acceptObservation,
  deferObservation,
} from "@tsonic/tsts";
import {
  getRecordedCsharpRuntimeCarrierFact,
} from "../../../../csharp-facts.js";
import {
  getNodeField,
  isCsharpUserSourceFile,
  visitAstReaderNodes,
} from "../../../ast-utils.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../../../runtime-carriers.js";
import {
  setRuntimeCarrierFactIfUnresolved,
} from "../../../runtime-carrier-fact-writes.js";
import {
  getSymbolForDeclarationLookup,
} from "../../../symbol-utils.js";
import {
  asNodeSubject,
  asType,
} from "../source-library.js";
import {
  isSourceStandardLibraryRegExpType,
} from "../../../source-type-classification.js";
import {
  recordCsharpJsRegExpLiteralFact,
} from "./literal-facts.js";
import {
  csharpJsRegExpTargetType,
  isCsharpJsRegExpRuntimeCarrier,
} from "./target-type.js";

export function mapCsharpJsRegExpRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
): ExtensionObservation<RuntimeCarrierFactResult> {
  for (const subject of [request.type, request.sourceTypeReference, request.sourceSymbol]) {
    recordCsharpJsRegExpLiteralFact(subject, context);
  }
  const carrier = [request.type, request.sourceTypeReference, request.sourceSymbol]
    .map((subject) => getCsharpJsRegExpRuntimeCarrierForSubject(subject, context))
    .find((candidate) => candidate !== undefined);
  return carrier === undefined
    ? deferObservation
    : acceptObservation<RuntimeCarrierFactResult>({
        carrier,
      }, [{ message: "C# JS surface runtime carrier mapped from checked JavaScript library type." }]);
}

export function recordCsharpJsRegExpRuntimeCarrierFactsBeforeFinalization(
  lifecycleContext: Pick<ExtensionLifecycleContext, "host" | "compiler">,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  for (const sourceFile of compiler.getSourceFiles()) {
    if (!isCsharpUserSourceFile(sourceFile, compiler.ast)) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      if (compiler.ast.is.IsRegularExpressionLiteral(node) !== true) {
        return;
      }
      recordCsharpJsRegExpLiteralFact(node, context);
      setRuntimeCarrierFactIfUnresolved(lifecycleContext, node, {
        carrier: csharpJsRegExpTargetType(),
      }, [{ message: "C# JS surface RegExp literal runtime carrier recorded from source syntax." }]);
      recordCsharpJsRegExpBindingCarrierFact(node, sourceFile, context);
    });
  }
}

function recordCsharpJsRegExpBindingCarrierFact(
  literal: ExtensionFactSubject,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
): void {
  const node = asNodeSubject(literal);
  const compiler = context.compiler;
  if (node === undefined || compiler === undefined) {
    return;
  }
  const declaration = compiler.ast.parent(node);
  if (
    declaration === undefined ||
    compiler.ast.kindName(declaration) !== "KindVariableDeclaration" ||
    asNodeSubject(getNodeField(declaration, "Initializer")) !== node
  ) {
    return;
  }
  const name = asNodeSubject(getNodeField(declaration, "name"));
  const fact = { carrier: csharpJsRegExpTargetType() };
  const evidence = [{ message: "C# JS surface RegExp literal runtime carrier propagated to checked variable binding." }];
  setRuntimeCarrierFactIfUnresolved(context, name, fact, evidence);
  const symbol = name === undefined
    ? undefined
    : getSymbolForDeclarationLookup(compiler.ast, compiler.checker, name, sourceFile);
  setRuntimeCarrierFactIfUnresolved(context, symbol, fact, evidence);
}

export function getCsharpJsRegExpRuntimeCarrierForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const node = asNodeSubject(subject);
  const ast = context.compiler?.ast;
  if (node !== undefined && ast?.is.IsRegularExpressionLiteral(node) === true) {
    return csharpJsRegExpTargetType();
  }
  const direct = getRecordedCsharpRuntimeCarrierFact(context.facts, subject)?.carrier;
  if (isCsharpJsRegExpRuntimeCarrier(direct)) {
    return direct;
  }
  const directType = asType(subject);
  if (directType !== undefined) {
    return getCsharpJsRegExpRuntimeCarrierForType(directType, context);
  }
  return undefined;
}

export function getCsharpJsRegExpRuntimeCarrierForType(
  type: Type | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  return type !== undefined && isSourceStandardLibraryRegExpType(type, context)
    ? csharpJsRegExpTargetType()
    : undefined;
}
