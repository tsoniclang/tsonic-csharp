import type { AstReader, Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpConstructorArgumentEmission, CsharpConstructorEntryEmission } from "../../../target-model/records/constructor-emission.js";
import type { CsharpDeclarationClassifications } from "../../../target-model/records/declarations.js";
import type { CsharpStorageClassifications } from "../../../target-model/records/storage.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpConstructorBaseCall, csharpConstructorRequiresPreparation } from "../../callables/constructor-entry.js";
import { createCsharpConstructorEmissionRecords } from "../../program/records/constructor-emission.js";

export interface CsharpConstructorArgumentEvidence {
  readonly carrier: TargetTypeRef | undefined;
  readonly completion: "value" | "void" | "never";
  readonly passing: "in" | "out" | "ref" | undefined;
  readonly sequenced: boolean;
}

export function analyzeCsharpConstructorEmission(input: {
  readonly ast: AstReader;
  readonly nodes: readonly Node[];
  readonly declarations: CsharpDeclarationClassifications;
  readonly storage: CsharpStorageClassifications;
  readonly captured: (declaration: Node) => boolean;
  readonly admitted: (declaration: Node) => boolean;
  readonly arguments: ReadonlyMap<Node, CsharpConstructorArgumentEvidence>;
}) {
  const entries = new Map<Node, CsharpConstructorEntryEmission>();
  const arguments_ = new Map<Node, CsharpConstructorArgumentEmission>();
  const issues: TargetDiagnostic[] = [];
  for (const node of input.nodes) {
    if (!input.ast.is.IsConstructorDeclaration(node) || !input.admitted(node)) continue;
    const baseCall = csharpConstructorBaseCall(input.ast, node);
    const prepared = csharpConstructorRequiresPreparation(input.ast, node, input.declarations, input.storage, input.captured);
    entries.set(node, Object.freeze({ baseCall, prepared }));
    if (baseCall === undefined) continue;
    for (const argument of input.ast.as.AsCallExpression(baseCall)?.Arguments?.Nodes ?? []) {
      if (argument === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted base call requires dense checked arguments.", node);
      const selected = input.arguments.get(argument);
      if (selected === undefined) failTargetAnalysisInvariant("tsonic-csharp", "Constructor admission requires each argument's exact native sequencing evidence.", argument);
      const helper = selected.sequenced || selected.completion !== "value";
      if (selected.carrier === undefined || selected.completion === "void" || (prepared || helper) && selected.passing !== undefined) {
        issues.push({ source: "tsonic-csharp", category: "error", code: "CSHARP_UNSUPPORTED_AST", sourceNode: prepared ? node : argument,
          message: prepared
            ? "Prepared constructor arguments require exact native value storage; managed references cannot be stored in a value packet."
            : "A sequenced native base argument requires its exact value result and direct parameter storage contract." });
        continue;
      }
      arguments_.set(argument, Object.freeze({ kind: prepared ? "packet" : helper ? "helper" : "direct", carrier: selected.carrier,
        completion: selected.completion, passing: selected.passing }));
    }
  }
  return Object.freeze({ records: createCsharpConstructorEmissionRecords(entries, arguments_), issues: Object.freeze(issues) });
}
