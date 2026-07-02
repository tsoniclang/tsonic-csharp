import {
  acceptObservation,
  deferObservation,
  rejectObservation,
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  CheckedIterationMappingRequest,
  CheckedOperationMappingResult,
  ExtensionEvidence,
  ExtensionFactSubject,
  ExtensionObservation,
  ExtensionObservationContext,
  Node,
  Symbol,
} from "@tsonic/tsts";
import {
  csharpTargetIterationFactKey,
} from "../../csharp-facts.js";
import type {
  CsharpTargetIterationFact,
  CsharpTargetIterationLowering,
} from "../../csharp-facts.js";
import {
  csharpProviderDiagnostic,
} from "../diagnostics.js";
import {
  targetOperation,
} from "../operations.js";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
  visitAstReaderNodes,
} from "../ast-utils.js";
import {
  asTargetTypeRef,
} from "../../fact-subjects.js";

export interface CsharpIterationOperationRow {
  readonly sourceIterationKind: CheckedIterationMappingRequest["kind"];
  readonly operationId: string;
  readonly iterationKind: CsharpTargetIterationFact["iterationKind"];
  readonly lowering: CsharpTargetIterationLowering;
  readonly elementType?: ExtensionFactSubject;
  readonly evidence: readonly ExtensionEvidence[];
}

export function mapCsharpIterationOperationRows(
  request: CheckedIterationMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedIteration">,
  extensionId: string,
  rows: readonly CsharpIterationOperationRow[],
): ExtensionObservation<CheckedOperationMappingResult> {
  const matching = rows.filter((row) => row.sourceIterationKind === request.kind);
  if (matching.length === 0) {
    void extensionId;
    return deferObservation;
  }
  if (matching.length > 1) {
    return rejectObservation(csharpProviderDiagnostic(
      extensionId,
      "CSHARP_ITERATION_OPERATION_AMBIGUOUS",
      9100174,
      `C# target found ${matching.length} finalized iteration metadata rows for a checked ${request.kind} operation. Provider/surface metadata must select exactly one row before backend emission.`,
      [{
        message: "Ambiguous iteration metadata rows",
        details: {
          sourceIterationKind: request.kind,
          operationIds: matching.map((row) => row.operationId),
          lowerings: matching.map((row) => row.lowering.kind),
        },
      }],
    ));
  }
  const row = matching[0]!;
  const fact = iterationFactFromRow(row);
  context.facts.set(request.statement, csharpTargetIterationFactKey, fact, row.evidence);
  recordIterationBindingCarrier(request, context, row);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(fact.operationId, "iteration", fact.lowering.kind),
  }, row.evidence);
}

export function iterationFactFromRow(row: CsharpIterationOperationRow): CsharpTargetIterationFact {
  return {
    operationId: row.operationId,
    iterationKind: row.iterationKind,
    lowering: row.lowering,
    ...(row.elementType !== undefined ? { elementType: row.elementType } : {}),
    evidence: row.evidence,
  };
}

function recordIterationBindingCarrier(
  request: CheckedIterationMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedIteration">,
  row: CsharpIterationOperationRow,
): void {
  const carrier = asTargetTypeRef(row.elementType);
  const statement = asNodeSubject(request.statement);
  const compiler = context.compiler;
  if (carrier === undefined || statement === undefined || compiler === undefined) {
    return;
  }
  const initializer = asNodeSubject(getNodeField(statement, "Initializer")) ??
    asNodeSubject(getNodeField(statement, "initializer"));
  const names = initializer === undefined ? [] : directIterationBindingIdentifiers(initializer, compiler.ast);
  for (const name of names) {
    context.facts.set(name, runtimeCarrierFactKey, { carrier }, row.evidence);
    const sourceFile = compiler.ast.getSourceFile(name);
    const symbol = compiler.checker.getSymbolAtLocation(name, { sourceFile });
    if (symbol !== undefined) {
      context.facts.set(symbol, runtimeCarrierFactKey, { carrier }, row.evidence);
      recordIterationBindingReferenceCarriers(statement, symbol, carrier, context, row.evidence);
    }
  }
}

function recordIterationBindingReferenceCarriers(
  statement: Node,
  bindingSymbol: Symbol,
  carrier: NonNullable<ReturnType<typeof asTargetTypeRef>>,
  context: ExtensionObservationContext<"operation.mapCheckedIteration">,
  evidence: readonly ExtensionEvidence[],
): void {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return;
  }
  visitAstReaderNodes(compiler.ast, statement, (node) => {
    if (!compiler.ast.is.IsIdentifier(node)) {
      return;
    }
    const sourceFile = compiler.ast.getSourceFile(node);
    const symbol = compiler.checker.getSymbolAtLocation(node, { sourceFile });
    if (symbol === bindingSymbol) {
      context.facts.set(node, runtimeCarrierFactKey, { carrier }, evidence);
    }
  });
}

function directIterationBindingIdentifiers(
  initializer: Node,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
): readonly Node[] {
  if (ast.is.IsIdentifier(initializer)) {
    return [initializer];
  }
  if (ast.is.IsVariableDeclaration(initializer)) {
    const name = asNodeSubject(getNodeField(initializer, "name")) ??
      asNodeSubject(getNodeField(initializer, "Name"));
    return name !== undefined && ast.is.IsIdentifier(name) ? [name] : [];
  }
  if (!ast.is.IsVariableDeclarationList(initializer)) {
    return [];
  }
  const declarations = getNodeList(getNodeField(initializer, "Declarations")).length === 0
    ? getNodeList(getNodeField(initializer, "declarations"))
    : getNodeList(getNodeField(initializer, "Declarations"));
  return declarations
    .flatMap((declaration) => directIterationBindingIdentifiers(declaration, ast));
}
