import {
  AsVariableDeclarationList,
  AsVariableStatement,
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
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetArtifact, TargetCompileInput, TargetDiagnostic, TargetSourceFile } from "@tsonic/target-api";
import type {
  CsharpCompilationUnit,
  CsharpStatement,
  CsharpTypeDeclaration,
  CsharpTypeMember,
} from "../ast/csharp-ast.js";
import { printCsharpCompilationUnit } from "../../print/csharp-printer.js";
import { predefined } from "./csharp-types.js";
import { planClassDeclaration, planFunctionDeclaration, planInterfaceDeclaration } from "./declarations.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { planLocalDeclaration } from "./locals.js";
import { projectArtifact, readNamespace } from "./project-artifacts.js";
import { sourceFileArtifactPath, sourceFileClassName } from "./source-paths.js";
import { planStatements } from "./statements.js";
import { planValueTypeDeclaration } from "./value-types.js";

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
      case KindTypeAliasDeclaration:
        continue;
      case KindInterfaceDeclaration:
        namespaceMembers.push(planInterfaceDeclaration(statement, sourceFile, input, diagnostics));
        break;
      case KindFunctionDeclaration:
        members.push(planFunctionDeclaration(statement, sourceFile, input, diagnostics));
        break;
      case KindClassDeclaration:
        namespaceMembers.push(planClassDeclaration(statement, sourceFile, input, diagnostics));
        break;
      case KindVariableStatement:
        planTopLevelVariableStatement(statement, sourceFile, input, diagnostics, namespaceMembers, topLevelStatements);
        break;
      case KindExpressionStatement:
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

function planTopLevelVariableStatement(
  statement: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  namespaceMembers: CsharpTypeDeclaration[],
  topLevelStatements: CsharpStatement[],
): void {
  const declarationList = AsVariableStatement(statement)!.DeclarationList;
  const declarations = AsVariableDeclarationList(declarationList)!.Declarations?.Nodes ?? [];
  if (declarations.length === 0) {
    topLevelStatements.push(...planStatements(statement, sourceFile, input, diagnostics));
    return;
  }
  for (const declaration of declarations) {
    if (declaration === undefined) {
      continue;
    }
    const valueType = input.facts.getValueTypeFact(declaration);
    if (valueType !== undefined) {
      namespaceMembers.push(planValueTypeDeclaration(declaration, valueType, sourceFile, input, diagnostics));
      continue;
    }
    topLevelStatements.push({
      kind: "local",
      ...planLocalDeclaration(declaration, sourceFile, input, diagnostics),
    });
  }
}
