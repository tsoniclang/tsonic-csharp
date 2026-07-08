import {
  AsExportAssignment,
  AsFunctionDeclaration,
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
  KindReturnStatement,
  KindSwitchStatement,
  KindThrowStatement,
  KindTryStatement,
  KindTypeAliasDeclaration,
  KindVariableStatement,
  KindWhileStatement,
  SourceFile_FileName,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpCompilationUnit,
  CsharpStatement,
  CsharpTypeDeclaration,
  CsharpTypeMember,
} from "../roslyn/syntax.js";
import { diagnoseUnresolvedAttributeApplications, isErasedAttributeExpressionStatement } from "./attributes.js";
import { getCsharpTypeForNode, predefined } from "./csharp-types.js";
import { planTopLevelVariableStatement } from "./csharp-top-level-variables.js";
import {
  csharpModuleInitMethodName,
} from "./csharp-entrypoint-planner.js";
import type { CsharpModuleInitializationPlan } from "./csharp-module-initialization.js";
import { planClassDeclaration, planEnumDeclaration, planFunctionDeclaration, planInterfaceDeclaration } from "./declarations.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { planExpression } from "./expressions.js";
import { sanitizeIdentifier } from "./identifiers.js";
import { beginObjectShapeSourceFilePlanning, takeObjectShapeDeclarations } from "./object-shapes.js";
import { readNamespace } from "./project-artifacts.js";
import { isProviderVirtualSourceFile } from "./provider-virtual-source-files.js";
import { sourceFileClassName } from "./source-paths.js";
import { planStatements } from "./statements.js";
import { compilationUnitRequiresUnsafe, markCompilationUnitUnsafe } from "./unsafe.js";
import { createDestructuringPlannerState } from "./bindings.js";

export interface PlannedCsharpSourceFile {
  readonly fileName: string;
  readonly moduleClassName: string;
  readonly unit: CsharpCompilationUnit;
  readonly requiresUnsafe: boolean;
  readonly hasModuleInitializer: boolean;
}

export function planSourceFile(
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  moduleInitialization: CsharpModuleInitializationPlan,
): PlannedCsharpSourceFile | undefined {
  const fileName = SourceFile_FileName(sourceFile);
  if (sourceFile.IsDeclarationFile || isProviderVirtualSourceFile(input, sourceFile)) {
    return undefined;
  }
  const moduleClassName = sourceFileClassName(input, fileName);
  beginObjectShapeSourceFilePlanning(input, fileName);
  const hasModuleInitializer = hasRuntimeTopLevel(sourceFile, input) ||
    moduleInitialization.requiresInitializer(sourceFile);
  const members: CsharpTypeMember[] = [];
  const namespaceMembers: CsharpTypeDeclaration[] = [];
  const topLevelStatements: CsharpStatement[] = [];
  const topLevelState = createDestructuringPlannerState(sourceFile, input.ast);
  for (const statement of sourceFile.Statements?.Nodes ?? []) {
    if (statement === undefined) {
      continue;
    }
    if (isErasedAttributeExpressionStatement(statement, input)) {
      continue;
    }
    switch (input.ast.kindName(statement)) {
      case KindImportDeclaration:
      case KindTypeAliasDeclaration:
      case KindExportDeclaration:
        continue;
      case KindExportAssignment: {
        const exportMember = planExportAssignment(statement, sourceFile, input, diagnostics);
        if (exportMember !== undefined) {
          members.push(exportMember);
        }
        break;
      }
      case KindInterfaceDeclaration:
        namespaceMembers.push(planInterfaceDeclaration(statement, sourceFile, input, diagnostics));
        break;
      case KindEnumDeclaration:
        namespaceMembers.push(planEnumDeclaration(statement, sourceFile, input, diagnostics));
        break;
      case KindFunctionDeclaration:
        if (AsFunctionDeclaration(statement)?.Body !== undefined) {
          members.push(planFunctionDeclaration(statement, sourceFile, input, diagnostics));
        }
        break;
      case KindClassDeclaration:
        namespaceMembers.push(planClassDeclaration(statement, sourceFile, input, diagnostics));
        break;
      case KindVariableStatement:
        planTopLevelVariableStatement(statement, sourceFile, input, diagnostics, namespaceMembers, members, topLevelStatements, topLevelState, hasModuleInitializer);
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
        topLevelStatements.push(...planStatements(statement, sourceFile, input, diagnostics, topLevelState));
        break;
      default:
        diagnostics.push(unsupportedNodeDiagnostic(statement, "Top-level statement is outside the current C# planning surface."));
        break;
      }
  }
  diagnoseUnresolvedAttributeApplications(sourceFile, input, diagnostics);
  if (hasModuleInitializer) {
    members.push({
      kind: "StaticConstructorDeclaration",
      name: moduleClassName,
      body: {
        kind: "Block",
        statements: [
          ...moduleInitialization.dependenciesFor(sourceFile)
            .filter((dependency) => dependency !== sourceFile)
            .map((dependency) => createModuleInitializerCall(sourceFileClassName(input, SourceFile_FileName(dependency)))),
          ...topLevelStatements,
        ],
      },
    });
    members.push({
      kind: "MethodDeclaration",
      name: csharpModuleInitMethodName,
      modifiers: ["public", "static"],
      returnType: predefined("void"),
      parameters: [],
      body: { kind: "Block", statements: [] },
    });
  }
  if (members.length > 0) {
    namespaceMembers.unshift({
      kind: "ClassDeclaration",
      name: moduleClassName,
      modifiers: ["public", "static"],
      members,
    });
  }
  const shapeDeclarations = takeObjectShapeDeclarations(input, fileName);
  if (namespaceMembers.length === 0 && shapeDeclarations.length === 0) {
    return undefined;
  }
  const unit: CsharpCompilationUnit = {
    kind: "CompilationUnit",
    usings: [{ kind: "UsingDirective", namespace: "System" }],
    members: [{
      kind: "NamespaceDeclaration",
      name: readNamespace(input),
      members: [...shapeDeclarations, ...namespaceMembers],
    }],
  };
  const requiresUnsafe = compilationUnitRequiresUnsafe(unit);
  const finalUnit = withRequiredExternAliases(requiresUnsafe ? markCompilationUnitUnsafe(unit) : unit);
  return {
    fileName,
    moduleClassName,
    unit: finalUnit,
    requiresUnsafe,
    hasModuleInitializer,
  };
}

function withRequiredExternAliases(unit: CsharpCompilationUnit): CsharpCompilationUnit {
  const aliases = collectExternAliases(unit);
  return aliases.length === 0
    ? unit
    : {
        ...unit,
        externAliases: aliases,
      };
}

function collectExternAliases(value: unknown): readonly string[] {
  const aliases = new Set<string>();
  const seen = new WeakSet<object>();
  visitCsharpAstValue(value, aliases, seen);
  return Array.from(aliases).sort((left, right) => left.localeCompare(right));
}

function visitCsharpAstValue(
  value: unknown,
  aliases: Set<string>,
  seen: WeakSet<object>,
): void {
  if (value === null || typeof value !== "object") {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (const element of value) {
      visitCsharpAstValue(element, aliases, seen);
    }
    return;
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (record.kind === "AliasQualifiedName" && typeof record.alias === "string") {
    aliases.add(record.alias);
  }
  for (const field of Object.values(record)) {
    visitCsharpAstValue(field, aliases, seen);
  }
}

function createModuleInitializerCall(moduleClassName: string): CsharpStatement {
  return {
    kind: "ExpressionStatement",
    expression: {
      kind: "InvocationExpression",
      callee: {
        kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: moduleClassName },
        name: csharpModuleInitMethodName,
      },
      arguments: [],
    },
  };
}

function hasRuntimeTopLevel(sourceFile: SourceFile, input: TargetCompileInput): boolean {
  for (const statement of sourceFile.Statements?.Nodes ?? []) {
    if (statement === undefined || isErasedAttributeExpressionStatement(statement, input)) {
      continue;
    }
    switch (input.ast.kindName(statement)) {
      case KindImportDeclaration:
      case KindTypeAliasDeclaration:
      case KindExportDeclaration:
      case KindInterfaceDeclaration:
      case KindEnumDeclaration:
      case KindFunctionDeclaration:
      case KindClassDeclaration:
        continue;
      case KindVariableStatement:
        return true;
      default:
        return true;
    }
  }
  return false;
}

function planExportAssignment(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpTypeMember | undefined {
  const assignment = AsExportAssignment(node)!;
  if (assignment.IsExportEquals) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Export equals requires finalized TSTS CommonJS module-export facts before C# emission."));
    return undefined;
  }
  if (assignment.Expression === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Default export assignment must have an expression."));
    return undefined;
  }
  return {
    kind: "FieldDeclaration",
    name: sanitizeIdentifier("default"),
    modifiers: ["public", "static", "readonly"],
    type: getCsharpTypeForNode(assignment.Expression, sourceFile, input, undefined, diagnostics),
    initializer: planExpression(assignment.Expression, sourceFile, input, diagnostics),
  };
}
