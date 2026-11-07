import type { SourceFile } from "@tsonic/tsts";
import type { TargetSourceProgramFacts } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpClassFactory, CsharpClassFactoryIndex } from "../../target-model/records/objects/class-factories.js";
import type { CsharpSourceFileRecords } from "../../target-model/records/program/source-files.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpAdmittedIteration } from "../../target-model/records/operations/selection.js";
import { createCsharpSourceFileEmissionRecords } from "../program/records/program/source-file-emission.js";

const moduleStatements = new Set([
  "KindImportDeclaration", "KindTypeAliasDeclaration", "KindExportDeclaration", "KindExportAssignment",
  "KindInterfaceDeclaration", "KindEnumDeclaration", "KindFunctionDeclaration", "KindClassDeclaration",
  "KindVariableStatement", "KindExpressionStatement", "KindIfStatement", "KindWhileStatement", "KindDoStatement",
  "KindForStatement", "KindForOfStatement", "KindReturnStatement", "KindThrowStatement", "KindSwitchStatement",
  "KindTryStatement", "KindDebuggerStatement", "KindLabeledStatement",
]);

export function analyzeCsharpSourceFileEmission(input: {
  readonly source: TargetSourceProgramFacts;
  readonly identities: CsharpSourceFileRecords;
  readonly factories: CsharpClassFactoryIndex;
  readonly evidence: CsharpSourceEvidenceIndex;
  readonly operations: CsharpTargetOperationClassifications<CsharpAdmittedIteration>;
}) {
  const factories = new Map<SourceFile, readonly CsharpClassFactory[]>();
  const issues: TargetDiagnostic[] = [];
  const ast = input.source.syntax;
  for (const file of input.source.sourceFiles) {
    factories.set(file, Object.freeze(input.factories.factories.filter(factory => factory.sourceFile === file)));
    if (file.IsDeclarationFile || input.identities.providerSourceFile.get(file) === true) continue;
    for (const statement of ast.statements(file)) {
      if (statement === undefined || input.evidence.compileTimeMetadata.get(statement) || input.operations.erasedStatement.get(statement)) continue;
      if (!moduleStatements.has(ast.kindName(statement))) {
        issues.push(Object.freeze({ code: "CSHARP_TOP_LEVEL_STATEMENT_NOT_PLANNED", category: "error", source: "tsonic-csharp", sourceNode: statement,
          message: "Top-level statement is outside the current C# planning surface." }));
        continue;
      }
      if (ast.is.IsVariableStatement(statement)) {
        const list = ast.as.AsVariableStatement(statement)?.DeclarationList;
        if (list === undefined || ast.variableDeclarationKind(list) === undefined) failTargetAnalysisInvariant("tsonic-csharp",
          "A top-level variable statement has a declaration list with a declaration kind.", statement);
      }
      if (!ast.is.IsExportAssignment(statement)) continue;
      const assignment = ast.as.AsExportAssignment(statement);
      // `export =` (a CommonJS module export) keeps its baseline C# refusal and text (Q94: no refusal-code move in
      // wave 1; listed for the maintainer as an I7 question). An export assignment always has an expression.
      if (assignment?.IsExportEquals) {
        issues.push(Object.freeze({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: statement,
          message: "Export equals requires finalized TSTS CommonJS module-export facts before C# emission." }));
        continue;
      }
      if (assignment?.Expression === undefined) failTargetAnalysisInvariant("tsonic-csharp",
        "An export assignment reached C# analysis without its expression.", statement);
    }
  }
  return Object.freeze({ records: createCsharpSourceFileEmissionRecords(factories), issues: Object.freeze(issues) });
}
