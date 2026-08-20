import type { CsharpPlanningContext } from "../context.js";
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
} from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpCompilationUnit,
  CsharpExpression,
  CsharpStatement,
  CsharpTypeDeclaration,
  CsharpTypeMember,
  CsharpTypeNode,
} from "../../target-ast/roslyn/index.js";
import { diagnoseUnresolvedAttributeApplications, isErasedAttributeExpressionStatement } from "../declarations/attributes.js";
import {
  getCsharpTypeForNode,
  predefined,
  qualifiedCsharpType,
} from "../types/index.js";
import { planTopLevelVariableStatement } from "./top-level-variables.js";
import {
  csharpModuleInitMethodName,
} from "./module-initialization.js";
import type { CsharpModuleInitializationPlan } from "./module-initialization.js";
import { planClassDeclaration, planEnumDeclaration, planFunctionDeclaration, planInterfaceDeclaration } from "../declarations/index.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { planExpression } from "../expressions/index.js";
import { sanitizeIdentifier } from "../../../policy/names/identifiers.js";
import { readNamespace } from "../project/project-artifacts.js";
import { isProviderVirtualSourceFile } from "./provider-virtual-source-files.js";
import { sourceFileClassName } from "../artifacts/source-paths.js";
import { planStatements } from "../statements/index.js";
import { createDestructuringPlannerState } from "../bindings/index.js";
import {
  finalizeCsharpCompilationUnit,
} from "./compilation-unit.js";
import {
  planResourceManagedSourceFileStatements,
} from "../statements/resource-management.js";
import {
  diagnoseCsharpSafetyApplications,
  isErasedSafetyExpressionStatement,
} from "../safety/explicit-safety.js";

export interface PlannedCsharpSourceFile {
  readonly fileName: string;
  readonly moduleClassName: string;
  readonly unit: CsharpCompilationUnit;
  readonly requiresUnsafe: boolean;
  readonly hasModuleInitializer: boolean;
  readonly asyncModuleInitializer: boolean;
}

const csharpModuleInitializationFieldName =
  "__tsonic_module_initialization";
const csharpModuleInitializationCoreMethodName =
  "__tsonic_module_init_core";

export function planSourceFile(
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  moduleInitialization: CsharpModuleInitializationPlan,
): PlannedCsharpSourceFile | undefined {
  const fileName = SourceFile_FileName(input.program.source.ast, sourceFile);
  if (sourceFile.IsDeclarationFile || isProviderVirtualSourceFile(input, sourceFile)) {
    return undefined;
  }
  const moduleClassName = sourceFileClassName(input, fileName);
  const hasModuleInitializer = hasRuntimeTopLevel(sourceFile, input) ||
    moduleInitialization.requiresInitializer(sourceFile);
  const asyncModuleInitializer = hasModuleInitializer &&
    moduleInitialization.isAsync(sourceFile);
  const members: CsharpTypeMember[] = [];
  const namespaceMembers: CsharpTypeDeclaration[] = [];
  const topLevelStatements: CsharpStatement[] = [];
  const topLevelState = createDestructuringPlannerState(sourceFile, input.program.source.ast);
  const plannedTopLevelStatements = planResourceManagedSourceFileStatements(
    sourceFile,
    input,
    diagnostics,
    topLevelState,
    () => {
      for (const statement of sourceFile.Statements?.Nodes ?? []) {
        if (statement === undefined) {
          continue;
        }
        if (
          isErasedAttributeExpressionStatement(statement, input) ||
          isErasedSafetyExpressionStatement(statement, input)
        ) {
          continue;
        }
        switch (input.program.source.ast.kindName(statement)) {
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
            if (AsFunctionDeclaration(input.program.source.ast, statement)?.Body !== undefined) {
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
      return topLevelStatements;
    },
  );
  diagnoseUnresolvedAttributeApplications(sourceFile, input, diagnostics);
  diagnoseCsharpSafetyApplications(sourceFile, input, diagnostics);
  if (hasModuleInitializer) {
    const initializationStatements = [
      ...moduleInitialization.dependenciesFor(sourceFile)
        .filter((dependency) => dependency !== sourceFile)
        .map((dependency) =>
          createModuleInitializerCall(
            sourceFileClassName(
              input,
              SourceFile_FileName(input.program.source.ast, dependency),
            ),
            moduleInitialization.isAsync(dependency),
          )),
      ...plannedTopLevelStatements,
    ];
    if (asyncModuleInitializer) {
      const taskType = qualifiedCsharpType(
        "System.Threading.Tasks",
        "Task",
      );
      const lazyTaskType = lazyType(taskType);
      members.push({
        kind: "FieldDeclaration",
        name: csharpModuleInitializationFieldName,
        modifiers: ["private", "static", "readonly"],
        type: lazyTaskType,
        initializer: {
          kind: "ObjectCreationExpression",
          type: lazyTaskType,
          arguments: [{
            kind: "Argument",
            expression: {
              kind: "LambdaExpression",
              parameters: [],
              body: moduleInitializationCoreCall(),
            },
          }],
        },
      });
      members.push({
        kind: "MethodDeclaration",
        name: csharpModuleInitializationCoreMethodName,
        modifiers: ["private", "static", "async"],
        returnType: taskType,
        parameters: [],
        body: {
          kind: "Block",
          statements: initializationStatements,
        },
      });
      members.push({
        kind: "MethodDeclaration",
        name: csharpModuleInitMethodName,
        modifiers: ["public", "static"],
        returnType: taskType,
        parameters: [],
        body: {
          kind: "Block",
          statements: [{
            kind: "ReturnStatement",
            expression: moduleInitializationValue(),
          }],
        },
      });
    } else {
      const nullableObjectType = {
        kind: "NullableType",
        inner: predefined("object"),
      } as const satisfies CsharpTypeNode;
      const lazyObjectType = lazyType(nullableObjectType);
      members.push({
        kind: "FieldDeclaration",
        name: csharpModuleInitializationFieldName,
        modifiers: ["private", "static", "readonly"],
        type: lazyObjectType,
        initializer: {
          kind: "ObjectCreationExpression",
          type: lazyObjectType,
          arguments: [{
            kind: "Argument",
            expression: {
              kind: "LambdaExpression",
              parameters: [],
              body: moduleInitializationCoreCall(),
            },
          }],
        },
      });
      members.push({
        kind: "MethodDeclaration",
        name: csharpModuleInitializationCoreMethodName,
        modifiers: ["private", "static"],
        returnType: nullableObjectType,
        parameters: [],
        body: {
          kind: "Block",
          statements: [
            ...initializationStatements,
            {
              kind: "ReturnStatement",
              expression: { kind: "LiteralExpression", value: null },
            },
          ],
        },
      });
      members.push({
        kind: "MethodDeclaration",
        name: csharpModuleInitMethodName,
        modifiers: ["public", "static"],
        returnType: predefined("void"),
        parameters: [],
        body: {
          kind: "Block",
          statements: [{
            kind: "ExpressionStatement",
            expression: {
              kind: "AssignmentExpression",
              left: { kind: "IdentifierName", name: "_" },
              operatorToken: { kind: "EqualsToken" },
              right: moduleInitializationValue(),
            },
          }],
        },
      });
    }
  }
  if (members.length > 0) {
    namespaceMembers.unshift({
      kind: "ClassDeclaration",
      name: moduleClassName,
      modifiers: ["public", "static"],
      members,
    });
  }
  if (namespaceMembers.length === 0) {
    return undefined;
  }
  const unit: CsharpCompilationUnit = {
    kind: "CompilationUnit",
    usings: [{ kind: "UsingDirective", namespace: "System" }],
    members: [{
      kind: "NamespaceDeclaration",
      name: readNamespace(input),
      members: namespaceMembers,
    }],
  };
  const finalized = finalizeCsharpCompilationUnit(
    unit,
    input.program.configuration.languageDialect,
  );
  return {
    fileName,
    moduleClassName,
    unit: finalized.unit,
    requiresUnsafe: finalized.requiresUnsafe,
    hasModuleInitializer,
    asyncModuleInitializer,
  };
}

function lazyType(valueType: CsharpTypeNode): CsharpTypeNode {
  return {
    kind: "QualifiedName",
    left: { kind: "IdentifierName", name: "System" },
    name: "Lazy",
    typeArguments: [valueType],
  };
}

function moduleInitializationCoreCall(): CsharpExpression {
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "IdentifierName",
      name: csharpModuleInitializationCoreMethodName,
    },
    arguments: [],
  };
}

function moduleInitializationValue(): CsharpExpression {
  return {
    kind: "SimpleMemberAccessExpression",
    receiver: {
      kind: "IdentifierName",
      name: csharpModuleInitializationFieldName,
    },
    name: "Value",
  };
}

function createModuleInitializerCall(
  moduleClassName: string,
  async: boolean,
): CsharpStatement {
  const invocation = {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: { kind: "IdentifierName", name: moduleClassName },
      name: csharpModuleInitMethodName,
    },
    arguments: [],
  } as const;
  return {
    kind: "ExpressionStatement",
    expression: async
      ? { kind: "AwaitExpression", expression: invocation }
      : invocation,
  };
}

function hasRuntimeTopLevel(sourceFile: SourceFile, input: CsharpPlanningContext): boolean {
  for (const statement of sourceFile.Statements?.Nodes ?? []) {
    if (statement === undefined || isErasedAttributeExpressionStatement(statement, input)) {
      continue;
    }
    switch (input.program.source.ast.kindName(statement)) {
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
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpTypeMember | undefined {
  const assignment = AsExportAssignment(input.program.source.ast, node)!;
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
