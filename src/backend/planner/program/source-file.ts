import type { CsharpPlanningContext } from "../context.js";
import { planCsharpNativeMemberHiding } from "../declarations/modifiers.js";
import { planGenericClassStaticMembers } from "../declarations/classes/generic-static-members.js";
import { createCsharpMemberPlanningContext } from "../context.js";
import {
  AsExportAssignment,
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
} from "../../target-ast/syntax/index.js";
import {
  getCsharpTypeForNode,
  predefined,
  qualifiedCsharpType,
} from "../types/index.js";
import { planTopLevelVariableStatement, topLevelBindingMember, topLevelFieldAssignment } from "./top-level-variables.js";
import { consumeCsharpPlannedValue } from "../statements/statement-output.js";
import {
  csharpModuleInitMethodName,
} from "./module-initialization-names.js";
import { planClassDeclaration, planEnumDeclaration, planFunctionDeclaration, planInterfaceDeclaration } from "../declarations/index.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";
import { planExpression } from "../expressions/index.js";
import { planClassFactoryDeclaration, planClassFactoryIdentity } from "../declarations/classes/factories.js";
import { sanitizeIdentifier } from "../../../target-model/names/identifiers.js";
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
import { csharpCompilationRequiresUnsafe, withCsharpSafetyModifiers } from "../safety/explicit-safety.js";

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
): PlannedCsharpSourceFile | undefined {
  const moduleInitialization = input.program.records;
  const fileName = SourceFile_FileName(input.program.source.ast, sourceFile);
  if (sourceFile.IsDeclarationFile || isProviderVirtualSourceFile(input, sourceFile)) {
    return undefined;
  }
  input = createCsharpMemberPlanningContext(input);
  const moduleClassName = sourceFileClassName(input, fileName);
  const hasModuleInitializer = moduleInitialization.requiresModuleInitializer.get(
    sourceFile,
  );
  const asyncModuleInitializer = hasModuleInitializer &&
    moduleInitialization.asyncModuleInitializer.get(sourceFile);
  const members: CsharpTypeMember[] = [];
  const namespaceMembers: CsharpTypeDeclaration[] = [];
  const scopedTypeMembers = new Map<string, CsharpTypeDeclaration[]>();
  const localTypeScopes: CsharpCompilationUnit["members"][number][] = [];
  const appendTypeDeclaration = (node: Node, declaration: CsharpTypeDeclaration): void => {
    const scopeName = input.program.records.projectDeclaration.get(node)?.scopeName;
    if (scopeName === undefined) {
      namespaceMembers.push(declaration);
    } else {
      const declarations = scopedTypeMembers.get(scopeName) ?? [];
      declarations.push(declaration);
      scopedTypeMembers.set(scopeName, declarations);
    }
  };
  const factories = input.program.records.moduleFactories.get(sourceFile);
  if (factories === undefined) failCsharpPlannerInvariant("An admitted source module requires its sealed local class inventory.", sourceFile);
  for (const factory of factories) {
    const instance = planClassDeclaration(factory.declaration, sourceFile, input, diagnostics);
    localTypeScopes.push({ kind: "NamespaceDeclaration", name: `${readNamespace(input)}.${factory.instanceScope}`,
      members: [instance.declaration] });
    namespaceMembers.push(planClassFactoryDeclaration(factory, instance.constructorParameters, input, diagnostics));
    const identity = planClassFactoryIdentity(factory, input, diagnostics);
    if (identity !== undefined) namespaceMembers.push(identity);
  }
  const topLevelStatements: CsharpStatement[] = [];
  const topLevelState = createDestructuringPlannerState(sourceFile, input.program.source.ast);
  const plannedTopLevelStatements = planResourceManagedSourceFileStatements(
    sourceFile,
    input,
    topLevelState,
    () => {
      for (const statement of sourceFile.Statements?.Nodes ?? []) {
        if (statement === undefined || input.program.records.compileTimeMetadata.get(statement)) {
          continue;
        }
        if (input.program.records.erasedStatement.get(statement)) {
          continue;
        }
        switch (input.program.source.ast.kindName(statement)) {
          case KindImportDeclaration:
          case KindTypeAliasDeclaration:
          case KindExportDeclaration:
            continue;
          case KindExportAssignment: {
            const exportMember = planExportAssignment(statement, sourceFile, input, diagnostics, topLevelStatements);
            if (exportMember !== undefined) {
              members.push(exportMember);
            }
            break;
          }
          case KindInterfaceDeclaration:
            appendTypeDeclaration(statement, planInterfaceDeclaration(statement, sourceFile, input, diagnostics));
            break;
          case KindEnumDeclaration:
            appendTypeDeclaration(statement, planEnumDeclaration(statement, sourceFile, input, diagnostics));
            break;
          case KindFunctionDeclaration:
            if (input.program.records.nativeParticipation.get(statement) === "body") {
              members.push(planFunctionDeclaration(statement, sourceFile, input, diagnostics));
            }
            break;
          case KindClassDeclaration: {
            appendTypeDeclaration(statement, planClassDeclaration(statement, sourceFile, input, diagnostics).declaration);
            const statics = planGenericClassStaticMembers(statement, sourceFile, input, diagnostics);
            if (statics !== undefined) appendTypeDeclaration(statement, statics);
            break;
          }
          case KindVariableStatement:
            planTopLevelVariableStatement(statement, sourceFile, input, diagnostics, appendTypeDeclaration, members, topLevelStatements, topLevelState);
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
            failCsharpPlannerInvariant("An admitted native source module contains an unplanned top-level statement.", statement);
        }
      }
      return topLevelStatements;
    },
  );
  if (hasModuleInitializer) {
    const initializationStatements = [
      ...moduleInitialization.moduleInitializationDependencies.get(sourceFile)
        .filter((dependency) => dependency !== sourceFile)
        .map((dependency) =>
          createModuleInitializerCall(
            sourceFileClassName(
              input,
              SourceFile_FileName(input.program.source.ast, dependency),
            ),
            moduleInitialization.asyncModuleInitializer.get(dependency),
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
        modifiers: withCsharpSafetyModifiers(["private", "static", "async"], sourceFile, "declaration", input),
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
        modifiers: withCsharpSafetyModifiers(["private", "static"], sourceFile, "declaration", input),
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
  members.push(...input.scope.generatedMethods!.values());
  if (members.length > 0) {
    namespaceMembers.unshift({
      kind: "ClassDeclaration",
      name: moduleClassName,
      modifiers: ["public", "static"],
      members,
    });
  }
  if (namespaceMembers.length === 0 && scopedTypeMembers.size === 0 && localTypeScopes.length === 0) {
    return undefined;
  }
  const unit: CsharpCompilationUnit = {
    kind: "CompilationUnit",
    usings: [],
    members: [...(namespaceMembers.length === 0 ? [] : [{
      kind: "NamespaceDeclaration" as const,
      name: readNamespace(input),
      members: namespaceMembers,
    }]), ...localTypeScopes, ...[...scopedTypeMembers].map(([scopeName, declarations]) => ({
      kind: "NamespaceDeclaration" as const, name: `${readNamespace(input)}.${scopeName}`, members: declarations,
    }))],
  };
  const finalized = finalizeCsharpCompilationUnit(
    unit,
    csharpCompilationRequiresUnsafe(sourceFile, input),
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

function planExportAssignment(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  statements: CsharpStatement[],
): CsharpTypeMember | undefined {
  const assignment = AsExportAssignment(input.program.source.ast, node)!;
  if (assignment.IsExportEquals) {
    failCsharpPlannerInvariant("An admitted default export requires native module-export syntax.", node);
  }
  if (assignment.Expression === undefined) {
    failCsharpPlannerInvariant("An admitted default export requires its checked expression.", node);
  }
  const name = sanitizeIdentifier("default");
  const type = getCsharpTypeForNode(assignment.Expression, sourceFile, input, diagnostics);
  const planned = planExpression(assignment.Expression, sourceFile, input, diagnostics);
  if (planned === undefined) return undefined;
  statements.push(...consumeCsharpPlannedValue(planned, value => [topLevelFieldAssignment(name, value)]));
  return topLevelBindingMember(name, type, "public",
    planCsharpNativeMemberHiding(input.program.records.nativeMemberHiding, { kind: "source", declaration: node, role: "member" }), false);
}
