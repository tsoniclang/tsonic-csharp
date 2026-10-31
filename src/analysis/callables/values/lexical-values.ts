import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceProgramNavigation } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpCaptureStorage } from "../../../target-model/records/callables/capture-storage.js";
import type { CsharpValueReadClassifications } from "../../../target-model/records/operations/conversions.js";
import type { CsharpSourceEvidenceIndex } from "../../../target-model/records/program/source-evidence.js";
import type { CsharpLexicalValueDeclaration } from "../../../target-model/records/storage/lexical-values.js";
import { getCsharpCallableValueSignature } from "../../../target-model/types/carriers/delegates.js";
import { createCsharpLexicalValueRecords } from "../../program/records/storage/lexical-values.js";

export function analyzeCsharpLexicalValues(input: {
  readonly ast: AstReader;
  readonly nodes: readonly Node[];
  readonly navigation: SourceProgramNavigation;
  readonly captures: CsharpCaptureStorage;
  readonly values: CsharpValueReadClassifications;
  readonly metadata: CsharpSourceEvidenceIndex;
}) {
  const issues: TargetDiagnostic[] = [];
  const rows = new Map<Node, readonly CsharpLexicalValueDeclaration[]>();
  const reject = (node: Node, message: string): void => {
    issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message });
  };
  for (const statement of input.nodes) {
    for (const declaration of input.captures.lexicalValueDeclarations.get(statement)) {
      const uses = input.navigation.declarationUseSummary(declaration).uses.filter(use => use.kind === "first-class" &&
        input.metadata.compileTimeMetadata.get(use.reference) !== true);
      const references = uses.map(use => use.reference);
      if (references.length === 0) continue;
      const scope = input.ast.parent(declaration);
      if (scope === undefined || !input.ast.is.IsBlock(scope)) continue;
      const anchors = references.flatMap(reference => lift(reference, scope, new Set()));
      const repeated = references.some(reference => {
        for (let owner = input.ast.parent(reference); owner !== undefined && owner !== scope; owner = input.ast.parent(owner)) {
          if (loop(owner)) return true;
        }
        return false;
      });
      if (references.length === 1 && !uses[0]!.captured && !repeated) continue;
      const first = anchors[0];
      if (first === undefined) continue;
      let block: Node | undefined;
      for (let owner = input.ast.parent(first); owner !== undefined; owner = input.ast.parent(owner)) {
        const candidate = owner;
        if (input.ast.is.IsBlock(candidate) && anchors.every(anchor => within(anchor, candidate))) { block = candidate; break; }
        if (owner === scope) break;
      }
      if (block === undefined) { reject(declaration, "A retained native function requires one checked lexical value activation."); continue; }
      const points = new Set(anchors.map(anchor => {
        let point = anchor;
        while (input.ast.parent(point) !== block) {
          const parent = input.ast.parent(point);
          if (parent === undefined) break;
          point = parent;
        }
        return point;
      }));
      const at = input.ast.statements(block).find(statement => statement !== undefined && points.has(statement));
      if (at === undefined) { reject(declaration, "A retained native function requires its original activation statement."); continue; }
      const carrier = input.values.valueRead.get(declaration)?.value;
      if (carrier === undefined || getCsharpCallableValueSignature(carrier) === undefined) {
        reject(declaration, "A lexical function requires one exact checked native delegate contract.");
        continue;
      }
      rows.set(at, Object.freeze([...(rows.get(at) ?? []), Object.freeze({ declaration, carrier, references: Object.freeze(references) })]));
    }
  }
  return Object.freeze({ records: createCsharpLexicalValueRecords(rows), issues: Object.freeze(issues) });

  function loop(node: Node): boolean {
    return input.ast.is.IsForStatement(node) || input.ast.is.IsForOfStatement(node) || input.ast.is.IsForInStatement(node) ||
      input.ast.is.IsWhileStatement(node) || input.ast.is.IsDoStatement(node);
  }

  function within(node: Node, scope: Node): boolean {
    for (let current: Node | undefined = node; current !== undefined; current = input.ast.parent(current)) if (current === scope) return true;
    return false;
  }

  function lift(reference: Node, scope: Node, seen: ReadonlySet<Node>): readonly Node[] {
    let anchor = reference;
    for (let current: Node | undefined = reference; current !== undefined && current !== scope; current = input.ast.parent(current)) {
      if (input.ast.is.IsFunctionDeclaration(current)) {
        if (seen.has(current)) return [];
        const next = new Set([...seen, current]);
        return input.navigation.declarationUseSummary(current).uses.filter(use => use.kind !== "type-only" &&
          !within(use.reference, current)).flatMap(use => lift(use.reference, scope, next));
      }
      if (input.ast.is.IsArrowFunction(current) || input.ast.is.IsFunctionExpression(current) || loop(current)) anchor = current;
    }
    return within(anchor, scope) ? [anchor] : [];
  }
}
