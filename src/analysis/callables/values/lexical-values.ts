import type { Node } from "@tsonic/tsts";
import type { SourceProgramNavigation } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpCaptureStorage } from "../../../target-model/records/callables/capture-storage.js";
import type { CsharpValueReadClassifications } from "../../../target-model/records/operations/conversions.js";
import type { CsharpSourceEvidenceIndex } from "../../../target-model/records/program/source-evidence.js";
import type { CsharpLexicalValueDeclaration } from "../../../target-model/records/storage/lexical-values.js";
import { getCsharpDelegateSignature } from "../../../target-model/types/carriers/delegates.js";
import { createCsharpLexicalValueRecords } from "../../program/records/storage/lexical-values.js";

export function analyzeCsharpLexicalValues(input: {
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
    const values: CsharpLexicalValueDeclaration[] = [];
    for (const declaration of input.captures.lexicalValueDeclarations.get(statement)) {
      const references = input.navigation.declarationUseSummary(declaration).uses.filter(use => use.kind === "first-class" &&
        input.metadata.compileTimeMetadata.get(use.reference) !== true).map(use => use.reference);
      if (references.length === 0) continue;
      const carrier = input.values.valueRead.get(declaration)?.value;
      if (carrier === undefined || getCsharpDelegateSignature(carrier) === undefined) {
        reject(declaration, "A lexical function requires one exact checked native delegate contract.");
        continue;
      }
      const creation = input.captures.lexicalValueCreation.get(declaration);
      const inlineReference = creation?.kind === "resolved" ? creation.inlineReference : undefined;
      const name = input.captures.lexicalValueName.get(declaration);
      if (inlineReference === undefined && name === undefined) {
        reject(declaration, "A lexical callable owner requires its stable analyzed storage name.");
        continue;
      }
      values.push(Object.freeze({ declaration, carrier, references: Object.freeze(references), storage: inlineReference === undefined
        ? Object.freeze({ kind: "binding", name: name! }) : Object.freeze({ kind: "inline", reference: inlineReference }) }));
    }
    if (values.length !== 0) rows.set(statement, Object.freeze(values));
  }
  return Object.freeze({ records: createCsharpLexicalValueRecords(rows), issues: Object.freeze(issues) });
}
