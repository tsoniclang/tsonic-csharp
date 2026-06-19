import {
  KindClassDeclaration,
  KindDebuggerStatement,
  KindDoStatement,
  KindExportAssignment,
  KindExportDeclaration,
  KindExpressionStatement,
  KindForStatement,
  KindFunctionDeclaration,
  KindIfStatement,
  KindImportDeclaration,
  KindInterfaceDeclaration,
  KindLabeledStatement,
  KindReturnStatement,
  KindSwitchStatement,
  KindThrowStatement,
  KindTryStatement,
  KindTypeAliasDeclaration,
  KindVariableStatement,
  KindWhileStatement,
  SourceFile_FileName,
} from "@tsonic/tsts";
import type { SourceFile } from "@tsonic/tsts";
import type { TargetArtifact, TargetCompileInput, TargetDiagnostic, TargetSourceFile } from "@tsonic/target-api";
import type {
  CsharpCompilationUnit,
  CsharpStatement,
  CsharpTypeDeclaration,
  CsharpTypeMember,
} from "../ast/csharp-ast.js";
import { printCsharpCompilationUnit } from "../../print/csharp-printer.js";
import { predefined } from "./csharp-types.js";
import { planClassDeclaration, planFunctionDeclaration } from "./declarations.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { projectArtifact, readNamespace } from "./project-artifacts.js";
import { sourceFileArtifactPath, sourceFileClassName } from "./source-paths.js";
import { planStatements } from "./statements.js";

export interface CsharpPlanningResult {
  readonly artifacts: readonly TargetArtifact[];
  readonly diagnostics: readonly TargetDiagnostic[];
}

export function planCsharpArtifacts(input: TargetCompileInput): CsharpPlanningResult {
  const diagnostics: TargetDiagnostic[] = [];
  const artifacts: TargetArtifact[] = [];
  const sourceArtifacts: TargetSourceFile[] = [];
  for (const sourceFile of input.sourceFiles) {
    const sourceArtifact = planSourceFile(sourceFile, input, diagnostics);
    if (sourceArtifact !== undefined) {
      sourceArtifacts.push(sourceArtifact);
    }
  }
  artifacts.push(projectArtifact(input, sourceArtifacts));
  artifacts.push(...sourceArtifacts);
  return {
    artifacts,
    diagnostics,
  };
}

function planSourceFile(
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): TargetSourceFile | undefined {
  const fileName = SourceFile_FileName(sourceFile);
  if (sourceFile.IsDeclarationFile || fileName.startsWith("tsts-provider://")) {
    return undefined;
  }
  const moduleClassName = sourceFileClassName(input, fileName);
  const members: CsharpTypeMember[] = [];
  const namespaceMembers: CsharpTypeDeclaration[] = [];
  const topLevelStatements: CsharpStatement[] = [];
  for (const statement of sourceFile.Statements?.Nodes ?? []) {
    if (statement === undefined) {
      continue;
    }
    switch (statement.Kind) {
      case KindImportDeclaration:
      case KindExportDeclaration:
      case KindExportAssignment:
      case KindInterfaceDeclaration:
      case KindTypeAliasDeclaration:
        continue;
      case KindFunctionDeclaration:
        members.push(planFunctionDeclaration(statement, sourceFile, input, diagnostics));
        break;
      case KindClassDeclaration:
        namespaceMembers.push(planClassDeclaration(statement, sourceFile, input, diagnostics));
        break;
      case KindExpressionStatement:
      case KindVariableStatement:
      case KindIfStatement:
      case KindWhileStatement:
      case KindDoStatement:
      case KindForStatement:
      case KindReturnStatement:
      case KindThrowStatement:
      case KindSwitchStatement:
      case KindTryStatement:
      case KindDebuggerStatement:
      case KindLabeledStatement:
        topLevelStatements.push(...planStatements(statement, sourceFile, input, diagnostics));
        break;
      default:
        diagnostics.push(unsupportedNodeDiagnostic(statement, "Top-level statement is outside the current C# planning surface."));
        break;
    }
  }
  if (topLevelStatements.length > 0) {
    members.unshift({
      kind: "method",
      name: "Main",
      modifiers: ["public", "static"],
      returnType: predefined("void"),
      parameters: [],
      body: { statements: topLevelStatements },
    });
  }
  if (members.length > 0) {
    namespaceMembers.unshift({
      kind: "class",
      name: moduleClassName,
      modifiers: ["public", "static"],
      members,
    });
  }
  if (namespaceMembers.length === 0) {
    return undefined;
  }
  const unit: CsharpCompilationUnit = {
    usings: [{ namespace: "System" }],
    members: [{
      kind: "namespace",
      name: readNamespace(input),
      members: namespaceMembers,
    }],
  };
  return {
    kind: "source",
    language: "csharp",
    path: sourceFileArtifactPath(input, fileName, moduleClassName),
    text: printCsharpCompilationUnit(unit),
  };
}
