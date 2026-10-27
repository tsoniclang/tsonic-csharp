import type { AstReader, Node } from "@tsonic/tsts";
import { isSourceCallableBodyBoundary } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpSourceEvidenceIndex } from "../../../target-model/records/source-evidence.js";
import type { CsharpGeneratorFact, CsharpYieldFact } from "../../../target-model/records/generators.js";
import { csharpAsyncEnumerableTargetType, csharpEnumerableTargetType, csharpIteratorResultTargetType,
  getCsharpGeneratorProtocol, targetTypeRefEquals } from "../../../target-model/types/index.js";
import { csharpTargetTypeRenderingRejection } from "../../../policy/types/model/renderability.js";
import { createCsharpGeneratorRecords } from "../../program/records/generators.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../../program/records/required-records.js";

export function analyzeCsharpGenerators(input: {
  readonly ast: AstReader; readonly nodes: readonly Node[]; readonly evidence: CsharpSourceEvidenceIndex;
  readonly admitted: (node: Node) => boolean; readonly erased: (node: Node) => boolean;
  readonly required: CsharpRequiredRecord[];
}) {
  const generators = new Map<Node, CsharpGeneratorFact>();
  const yields = new Map<Node, CsharpYieldFact>();
  const issues: TargetDiagnostic[] = [];
  const refuse = (node: Node, code: string, message: string): void => {
    issues.push(Object.freeze({ code, category: "error", source: "tsonic-csharp", sourceNode: node, message }));
  };
  for (const node of input.nodes) {
    if (!input.admitted(node) || !generatorSyntax(input.ast, node)) continue;
    const source = input.evidence.generator.get(node);
    if (source === undefined) {
      refuse(node, "CSHARP_GENERATOR_EVIDENCE_NOT_PROVEN", "TSTS did not retain exact checked generator protocol evidence for this declaration.");
      continue;
    }
    const carrier = input.evidence.generatorTargetType.get(node);
    const protocol = getCsharpGeneratorProtocol(carrier);
    if (carrier === undefined || protocol === undefined || protocol.kind !== source.generatorKind) {
      refuse(node, "CSHARP_GENERATOR_PROTOCOL_NOT_CLOSED", "The exact checked generator yield, return, and next types do not reconcile with one closed C# generator runtime carrier.");
      continue;
    }
    const iteratorCarrier = protocol.kind === "sync" ? csharpEnumerableTargetType(protocol.yieldType) : csharpAsyncEnumerableTargetType(protocol.yieldType);
    if ([carrier, protocol.yieldType, protocol.returnType, iteratorCarrier].some(type => csharpTargetTypeRenderingRejection(type) !== undefined)) {
      refuse(node, "CSHARP_GENERATOR_PROTOCOL_NOT_RENDERABLE", "The exact checked generator protocol contains a type that has no closed C# source representation.");
      continue;
    }
    let hasExplicitReturn = false;
    let unsupportedYield = false;
    const body = input.ast.body(node);
    const pending = body === undefined ? [] : [body];
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (input.erased(current) || current !== body && isSourceCallableBodyBoundary(input.ast, current)) continue;
      if (input.ast.is.IsReturnStatement(current) && !returnInsideFinally(input.ast, current, node)) hasExplicitReturn = true;
      if (!unsupportedYield && input.ast.is.IsYieldExpression(current) && input.evidence.yield.get(current)?.generator.declaration === node) {
        const reason = yieldRegionRejection(input.ast, current, node);
        if (reason !== undefined) {
          refuse(current, "CSHARP_UNSUPPORTED_GENERATOR_SUSPENSION_REGION", reason);
          unsupportedYield = true;
        }
      }
      const children = input.ast.children(current);
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index];
        if (child !== undefined) pending.push(child);
      }
    }
    generators.set(node, Object.freeze({ ...protocol, resultCarrier: carrier, iteratorCarrier, hasExplicitReturn }));
    requireCsharpRecord(input.required, { family: "generator", subject: node, construct: input.ast.kindName(node), producer: "analyzeCsharpGenerators" });
  }
  for (const node of input.nodes) {
    if (input.erased(node) || !input.ast.is.IsYieldExpression(node)) continue;
    const source = input.evidence.yield.get(node);
    const declaration = source?.generator.declaration;
    const outer = declaration === undefined ? undefined : generators.get(declaration);
    if (source === undefined || declaration === undefined || outer === undefined) {
      if (input.admitted(node)) refuse(node, "CSHARP_YIELD_EVIDENCE_NOT_PROVEN", "Yield emission requires exact TSTS evidence owned by the active generator declaration.");
      continue;
    }
    if (source.yieldKind !== "delegate") yields.set(node, Object.freeze({ kind: "value", generatorDeclaration: declaration, operand: source.operand?.expression }));
    else {
      if (source.operand === undefined || source.delegation === undefined) {
        refuse(node, "CSHARP_YIELD_DELEGATION_EVIDENCE_NOT_PROVEN", "Delegated yield requires exact TSTS operand and iterator-selection evidence.");
        continue;
      }
      const carrier = input.evidence.yieldTargetType.get(node);
      const protocol = getCsharpGeneratorProtocol(carrier);
      if (carrier === undefined || protocol === undefined || !targetTypeRefEquals(outer.yieldType, protocol.yieldType) ||
        !targetTypeRefEquals(outer.nextType, protocol.nextType) || outer.kind === "sync" && protocol.kind !== "sync") {
        refuse(node, "CSHARP_YIELD_DELEGATION_PROTOCOL_NOT_CLOSED", "The exact delegated iterator evidence does not reconcile with one closed native generator protocol.");
        continue;
      }
      if (source.delegation.kind !== "synchronous-iterator-protocol" && source.delegation.kind !== "asynchronous-iterator-protocol" &&
        source.delegation.kind !== "synchronous-iterator-adapted-to-async") {
        refuse(node, "CSHARP_YIELD_DELEGATION_MECHANISM_UNSUPPORTED", "The exact delegated iteration mechanism is not a selected generator protocol.");
        continue;
      }
      const resultCarrier = csharpIteratorResultTargetType(protocol);
      if (csharpTargetTypeRenderingRejection(carrier) !== undefined || csharpTargetTypeRenderingRejection(resultCarrier) !== undefined) {
        refuse(node, "CSHARP_YIELD_DELEGATION_PROTOCOL_NOT_RENDERABLE", "The exact delegated generator protocol has no closed C# source representation.");
        continue;
      }
      yields.set(node, Object.freeze({ kind: "delegate", generatorDeclaration: declaration, operand: source.operand.expression,
        delegatedCarrier: carrier, protocol, resultCarrier }));
    }
    requireCsharpRecord(input.required, { family: "yield", subject: node, construct: input.ast.kindName(node), producer: "analyzeCsharpGenerators" });
  }
  return Object.freeze({ records: createCsharpGeneratorRecords(generators, yields), issues: Object.freeze(issues) });
}

function generatorSyntax(ast: AstReader, node: Node): boolean {
  return (ast.is.IsFunctionDeclaration(node) || ast.is.IsFunctionExpression(node) || ast.is.IsMethodDeclaration(node)) &&
    ast.children(node).some(child => child !== undefined && ast.kindName(child) === "KindAsteriskToken");
}

function returnInsideFinally(ast: AstReader, node: Node, declaration: Node): boolean {
  for (let current = ast.parent(node); current !== undefined && current !== declaration; current = ast.parent(current)) {
    const parent = ast.parent(current);
    if (parent !== undefined && ast.as.AsTryStatement(parent)?.FinallyBlock === current) return true;
  }
  return false;
}

function yieldRegionRejection(ast: AstReader, node: Node, declaration: Node): string | undefined {
  for (let current = ast.parent(node); current !== undefined && current !== declaration; current = ast.parent(current)) {
    if (ast.is.IsCatchClause(current)) return "C# native iterators cannot suspend from a catch clause.";
    const parent = ast.parent(current);
    const statement = parent === undefined ? undefined : ast.as.AsTryStatement(parent);
    if (statement?.FinallyBlock === current) return "C# native iterators cannot suspend from a finally clause.";
    if (statement?.TryBlock === current && statement.CatchClause !== undefined)
      return "C# native iterators cannot suspend from a try block that has a catch clause.";
  }
  return undefined;
}
