import {
  AsExportDeclaration,
  AsVariableDeclarationList,
  AsVariableStatement,
  KindClassDeclaration,
  KindDebuggerStatement,
  KindDoStatement,
  KindEnumDeclaration,
  KindExportAssignment,
  KindExportDeclaration,
  KindExpressionStatement,
  KindForStatement,
  KindForOfStatement,
  KindFunctionDeclaration,
  KindIfStatement,
  KindImportDeclaration,
  KindInterfaceDeclaration,
  KindLabeledStatement,
  NodeFlagsConst,
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
import { isErasedAttributeExpressionStatement } from "./attributes.js";
import { predefined } from "./csharp-types.js";
import { planClassDeclaration, planEnumDeclaration, planFunctionDeclaration, planInterfaceDeclaration } from "./declarations.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { planLocalDeclaration } from "./locals.js";
import { beginObjectShapePlanning, takeObjectShapeDeclarations } from "./object-shapes.js";
import { projectArtifact, readNamespace } from "./project-artifacts.js";
import { sourceFileArtifactPath, sourceFileClassName } from "./source-paths.js";
import { planStatements } from "./statements.js";
import { planValueTypeDeclaration } from "./value-types.js";

export interface CsharpPlanningResult {
  readonly artifacts: readonly TargetArtifact[];
  readonly diagnostics: readonly TargetDiagnostic[];
}

interface PlannedCsharpSourceFile {
  readonly fileName: string;
  readonly moduleClassName: string;
  readonly unit: CsharpCompilationUnit;
}

export function planCsharpArtifacts(input: TargetCompileInput): CsharpPlanningResult {
  const diagnostics: TargetDiagnostic[] = [];
  const plannedSources: PlannedCsharpSourceFile[] = [];
  for (const sourceFile of input.sourceFiles) {
    const plannedSource = planSourceFile(sourceFile, input, diagnostics);
    if (plannedSource !== undefined) {
      plannedSources.push(plannedSource);
    }
  }
  if (diagnostics.length > 0) {
    return {
      artifacts: [],
      diagnostics,
    };
  }
  const sourceArtifacts: TargetSourceFile[] = plannedSources.map((source) => ({
    kind: "source",
    language: "csharp",
    path: sourceFileArtifactPath(input, source.fileName, source.moduleClassName),
    text: printCsharpCompilationUnit(source.unit),
  }));
  const artifacts: TargetArtifact[] = [];
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
): PlannedCsharpSourceFile | undefined {
  const fileName = SourceFile_FileName(sourceFile);
  if (sourceFile.IsDeclarationFile || fileName.startsWith("tsts-provider://")) {
    return undefined;
  }
  beginObjectShapePlanning(input);
  const moduleClassName = sourceFileClassName(input, fileName);
  const members: CsharpTypeMember[] = [];
  const namespaceMembers: CsharpTypeDeclaration[] = [];
  const topLevelStatements: CsharpStatement[] = [];
  for (const statement of sourceFile.Statements?.Nodes ?? []) {
    if (statement === undefined) {
      continue;
    }
    if (isErasedAttributeExpressionStatement(statement, input)) {
      continue;
    }
    switch (statement.Kind) {
      case KindImportDeclaration:
      case KindTypeAliasDeclaration:
        continue;
      case KindExportDeclaration: {
        const exportDeclaration = AsExportDeclaration(statement)!;
        if (exportDeclaration.ModuleSpecifier !== undefined) {
          diagnostics.push(unsupportedNodeDiagnostic(statement, "Re-export declarations require finalized TSTS module-export facts before C# emission."));
        }
        continue;
      }
      case KindExportAssignment:
        diagnostics.push(unsupportedNodeDiagnostic(statement, "Export assignments require finalized TSTS module-export facts before C# emission."));
        break;
      case KindInterfaceDeclaration:
        namespaceMembers.push(planInterfaceDeclaration(statement, sourceFile, input, diagnostics));
        break;
      case KindEnumDeclaration:
        namespaceMembers.push(planEnumDeclaration(statement, sourceFile, input, diagnostics));
        break;
      case KindFunctionDeclaration:
        members.push(planFunctionDeclaration(statement, sourceFile, input, diagnostics));
        break;
      case KindClassDeclaration:
        namespaceMembers.push(planClassDeclaration(statement, sourceFile, input, diagnostics));
        break;
      case KindVariableStatement:
        planTopLevelVariableStatement(statement, sourceFile, input, diagnostics, namespaceMembers, members, topLevelStatements);
        break;
      case KindExpressionStatement:
      case KindIfStatement:
      case KindWhileStatement:
      case KindDoStatement:
      case KindForStatement:
      case KindForOfStatement:
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
  const shapeDeclarations = takeObjectShapeDeclarations(input);
  if (namespaceMembers.length === 0 && shapeDeclarations.length === 0) {
    return undefined;
  }
  const unit: CsharpCompilationUnit = {
    usings: [{ namespace: "System" }],
    members: [{
      kind: "namespace",
      name: readNamespace(input),
      members: [...shapeDeclarations, ...namespaceMembers],
    }],
  };
  return {
    fileName,
    moduleClassName,
    unit,
  };
}

function planTopLevelVariableStatement(
  statement: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  namespaceMembers: CsharpTypeDeclaration[],
  moduleMembers: CsharpTypeMember[],
  topLevelStatements: CsharpStatement[],
): void {
  const declarationList = AsVariableStatement(statement)!.DeclarationList;
  const variableDeclarationList = AsVariableDeclarationList(declarationList)!;
  const declarations = variableDeclarationList.Declarations?.Nodes ?? [];
  const isConst = (variableDeclarationList.Flags & NodeFlagsConst) !== 0;
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
    const field = planLocalDeclaration(declaration, sourceFile, input, diagnostics);
    moduleMembers.push({
      kind: "field",
      name: field.name,
      type: field.type,
      modifiers: isConst ? ["public", "static", "readonly"] : ["public", "static"],
      ...(field.initializer === undefined ? {} : { initializer: field.initializer }),
    });
  }
}
