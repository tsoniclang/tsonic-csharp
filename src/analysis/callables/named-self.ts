import type { CsharpNamedSelfBinding } from "../../target-model/records/capture-storage.js";
import type { Node } from "@tsonic/tsts";
import type { SourceLexicalCaptureSelection, TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpStorageIssue } from "../../target-model/records/storage.js";

export function selectCsharpNamedSelfBinding(
  source: TargetSourceProgram,
  declaration: Node,
  lexical: SourceLexicalCaptureSelection,
  evidence: Pick<CsharpSourceEvidenceIndex, "compileTimeMetadata">,
  issues: CsharpStorageIssue[],
): CsharpNamedSelfBinding | undefined {
  if (!source.ast.is.IsFunctionExpression(declaration) || source.ast.name(declaration) === undefined ||
    lexical.selfReferences.length === 0) return undefined;
  const uses = new Map(source.navigation.declarationUses(declaration).map(use => [use.reference, use]));
  const calls: Node[] = [];
  const values: Node[] = [];
  for (const reference of lexical.selfReferences) {
    if (evidence.compileTimeMetadata.get(reference)) continue;
    const use = uses.get(reference);
    if (use === undefined || use.kind === "source-linkage" || use.kind === "type-only" || use.role === "write") {
      issues.push({ node: reference, code: "CSHARP_NAMED_SELF_NOT_CLOSED",
        message: "A named function-expression self reference requires its exact immutable checked use." });
      return undefined;
    }
    (use.kind === "direct-call" && use.role === "call-target" ? calls : values).push(reference);
  }
  if (calls.length === 0 && values.length === 0) return undefined;
  return Object.freeze({ declaration, calls: Object.freeze(calls), values: Object.freeze(values),
    captures: Object.freeze(lexical.captures.filter(capture => !evidence.compileTimeMetadata.get(capture.declaration))
      .map(capture => capture.declaration)),
    capturesReceiver: lexical.receivers.length > 0,
  });
}
