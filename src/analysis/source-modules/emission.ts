import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpClassFactory, CsharpClassFactoryIndex } from "../../target-model/records/class-factories.js";
import type { CsharpSourceFileRecords } from "../../target-model/records/source-files.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpAdmittedIteration } from "../../target-model/records/selection.js";
import { createCsharpSourceFileEmissionRecords } from "../program/records/source-file-emission.js";

const moduleStatements = new Set([
  "KindImportDeclaration", "KindTypeAliasDeclaration", "KindExportDeclaration", "KindExportAssignment",
  "KindInterfaceDeclaration", "KindEnumDeclaration", "KindFunctionDeclaration", "KindClassDeclaration",
  "KindVariableStatement", "KindExpressionStatement", "KindIfStatement", "KindWhileStatement", "KindDoStatement",
  "KindForStatement", "KindForOfStatement", "KindReturnStatement", "KindThrowStatement", "KindSwitchStatement",
  "KindTryStatement", "KindDebuggerStatement", "KindLabeledStatement",
]);

export function analyzeCsharpSourceFileEmission(input: {
  readonly source: TargetSourceProgram;
  readonly identities: CsharpSourceFileRecords;
  readonly factories: CsharpClassFactoryIndex;
  readonly evidence: CsharpSourceEvidenceIndex;
  readonly operations: CsharpTargetOperationClassifications<CsharpAdmittedIteration>;
}) {
  const factories = new Map<SourceFile, readonly CsharpClassFactory[]>();
  const issues: TargetDiagnostic[] = [];
  const refuse = (node: Node, message: string): void => {
    issues.push(Object.freeze({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message }));
  };
  for (const file of input.source.sourceFiles) {
    factories.set(file, Object.freeze(input.factories.factories.filter(factory => factory.sourceFile === file)));
    if (file.IsDeclarationFile || input.identities.providerSourceFile.get(file) === true) continue;
    for (const statement of input.source.ast.statements(file)) {
      if (statement === undefined || input.evidence.compileTimeMetadata.get(statement) || input.operations.erasedStatement.get(statement)) continue;
      if (!moduleStatements.has(input.source.ast.kindName(statement))) {
        refuse(statement, "Top-level statement is outside the current C# planning surface.");
        continue;
      }
      if (!input.source.ast.is.IsExportAssignment(statement)) continue;
      const assignment = input.source.ast.as.AsExportAssignment(statement);
      if (assignment?.IsExportEquals) refuse(statement, "Export equals requires finalized TSTS CommonJS module-export facts before C# emission.");
      else if (assignment?.Expression === undefined) refuse(statement, "Default export assignment must have an expression.");
    }
  }
  return Object.freeze({ records: createCsharpSourceFileEmissionRecords(factories), issues: Object.freeze(issues) });
}
