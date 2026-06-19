import {
  AsBlock,
  AsBreakStatement,
  AsCaseBlock,
  AsCaseOrDefaultClause,
  AsCatchClause,
  AsClassDeclaration,
  AsConstructorDeclaration,
  AsContinueStatement,
  AsDoStatement,
  AsExpressionStatement,
  AsForInOrOfStatement,
  AsForStatement,
  AsFunctionDeclaration,
  AsIdentifier,
  AsIfStatement,
  AsLabeledStatement,
  AsMethodDeclaration,
  AsParameterDeclaration,
  AsPropertyDeclaration,
  AsReturnStatement,
  AsSwitchStatement,
  AsThrowStatement,
  AsTryStatement,
  AsVariableDeclaration,
  AsVariableDeclarationList,
  AsVariableStatement,
  AsWhileStatement,
  KindBlock,
  KindBreakStatement,
  KindClassDeclaration,
  KindConstructor,
  KindContinueStatement,
  KindDebuggerStatement,
  KindDefaultClause,
  KindDoStatement,
  KindEmptyStatement,
  KindExportAssignment,
  KindExportDeclaration,
  KindExpressionStatement,
  KindForInStatement,
  KindForOfStatement,
  KindForStatement,
  KindFunctionDeclaration,
  KindIdentifier,
  KindIfStatement,
  KindImportDeclaration,
  KindInterfaceDeclaration,
  KindLabeledStatement,
  KindMethodDeclaration,
  KindPropertyDeclaration,
  KindReturnStatement,
  KindSwitchStatement,
  KindThrowStatement,
  KindTryStatement,
  KindTypeAliasDeclaration,
  KindVariableDeclarationList,
  KindVariableStatement,
  KindWhileStatement,
  Node_Text,
  SourceFile_FileName,
} from "@tsonic/tsts";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetArtifact, TargetCompileInput, TargetDiagnostic, TargetSourceFile } from "@tsonic/target-api";
import type {
  CsharpCompilationUnit,
  CsharpConstructorDeclaration,
  CsharpCatchClause,
  CsharpExpression,
  CsharpFieldDeclaration,
  CsharpForInitializer,
  CsharpClassDeclaration,
  CsharpLocalDeclaration,
  CsharpMethodDeclaration,
  CsharpParameter,
  CsharpStatement,
  CsharpSwitchSection,
  CsharpTypeDeclaration,
  CsharpTypeMember,
} from "../ast/csharp-ast.js";
import { printCsharpCompilationUnit } from "../../print/csharp-printer.js";
import { getCsharpTypeForNode, predefined, sameCsharpType } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { planExpression, planExpressionWithExpectedType } from "./expressions.js";
import { sanitizeIdentifier } from "./identifiers.js";
import { projectArtifact, readNamespace } from "./project-artifacts.js";
import { sourceFileArtifactPath, sourceFileClassName } from "./source-paths.js";

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

function planClassDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpClassDeclaration {
  const declaration = AsClassDeclaration(node)!;
  return {
    kind: "class",
    name: sanitizeIdentifier(declaration.name === undefined ? "AnonymousClass" : Node_Text(declaration.name)),
    modifiers: ["public"],
    members: (declaration.Members?.Nodes ?? []).flatMap((member): CsharpTypeMember[] => {
      if (member === undefined) {
        return [];
      }
      switch (member.Kind) {
        case KindConstructor:
          return [planConstructorDeclaration(member, declaration.name === undefined ? "AnonymousClass" : Node_Text(declaration.name), sourceFile, input, diagnostics)];
        case KindMethodDeclaration:
          return [planMethodDeclaration(member, sourceFile, input, diagnostics)];
        case KindPropertyDeclaration:
          return [planPropertyDeclaration(member, sourceFile, input, diagnostics)];
        default:
          diagnostics.push(unsupportedNodeDiagnostic(member, "Class member is outside the current C# planning surface."));
          return [];
      }
    }),
  };
}

function planConstructorDeclaration(
  node: Node,
  className: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpConstructorDeclaration {
  const declaration = AsConstructorDeclaration(node)!;
  return {
    kind: "constructor",
    name: sanitizeIdentifier(className),
    modifiers: ["public"],
    parameters: planParameters(declaration.Parameters?.Nodes ?? [], sourceFile, input),
    body: {
      statements: planBlockStatements(declaration.Body, sourceFile, input, diagnostics),
    },
  };
}

function planMethodDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpMethodDeclaration {
  const declaration = AsMethodDeclaration(node)!;
  return {
    kind: "method",
    name: sanitizeIdentifier(declaration.name === undefined ? "method" : Node_Text(declaration.name)),
    modifiers: ["public"],
    returnType: getCsharpTypeForNode(declaration.Type, sourceFile, input, predefined("void")),
    parameters: planParameters(declaration.Parameters?.Nodes ?? [], sourceFile, input),
    body: {
      statements: planBlockStatements(declaration.Body, sourceFile, input, diagnostics),
    },
  };
}

function planPropertyDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpFieldDeclaration {
  const declaration = AsPropertyDeclaration(node)!;
  const type = getCsharpTypeForNode(declaration.Type ?? declaration.name, sourceFile, input);
  return {
    kind: "field",
    name: sanitizeIdentifier(declaration.name === undefined ? "field" : Node_Text(declaration.name)),
    modifiers: ["public"],
    type,
    ...(declaration.Initializer !== undefined
      ? { initializer: planExpressionWithExpectedType(declaration.Initializer, sourceFile, input, diagnostics, type) }
      : {}),
  };
}

function planFunctionDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpMethodDeclaration {
  const declaration = AsFunctionDeclaration(node)!;
  const name = declaration.name === undefined ? "__anonymous" : sanitizeIdentifier(Node_Text(declaration.name));
  return {
    kind: "method",
    name,
    modifiers: ["public", "static"],
    returnType: getCsharpTypeForNode(declaration.Type, sourceFile, input, predefined("void")),
    parameters: planParameters(declaration.Parameters?.Nodes ?? [], sourceFile, input),
    body: {
      statements: planBlockStatements(declaration.Body, sourceFile, input, diagnostics),
    },
  };
}

function planParameters(
  parameterNodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: TargetCompileInput,
): readonly CsharpParameter[] {
  return parameterNodes.map((parameterNode) => {
    const parameter = AsParameterDeclaration(parameterNode)!;
    return {
      name: sanitizeIdentifier(parameter.name === undefined ? "arg" : Node_Text(parameter.name)),
      type: getCsharpTypeForNode(parameter.Type ?? parameter.name, sourceFile, input),
    };
  });
}

function planBlockStatements(
  blockNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpStatement[] {
  if (blockNode === undefined) {
    return [];
  }
  const block = AsBlock(blockNode)!;
  return (block.Statements?.Nodes ?? []).flatMap((statement) =>
    statement === undefined ? [] : planStatements(statement, sourceFile, input, diagnostics));
}

function planStatements(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpStatement[] {
  switch (node.Kind) {
    case KindEmptyStatement:
      return [];
    case KindBlock:
      return [{
        kind: "block",
        body: {
          statements: planBlockStatements(node, sourceFile, input, diagnostics),
        },
      }];
    case KindReturnStatement: {
      const statement = AsReturnStatement(node)!;
      return [{
        kind: "return",
        ...(statement.Expression !== undefined
          ? { expression: planExpression(statement.Expression, sourceFile, input, diagnostics) }
        : {}),
      }];
    }
    case KindBreakStatement: {
      const statement = AsBreakStatement(node)!;
      if (statement.Label !== undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Labeled break requires control-flow rewriting and is not implemented yet."));
      }
      return [{ kind: "break" }];
    }
    case KindContinueStatement: {
      const statement = AsContinueStatement(node)!;
      if (statement.Label !== undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Labeled continue requires control-flow rewriting and is not implemented yet."));
      }
      return [{ kind: "continue" }];
    }
    case KindThrowStatement: {
      const statement = AsThrowStatement(node)!;
      if (statement.Expression === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Throw statement must have an expression."));
        return [expressionStatement({ kind: "identifier", name: "__unsupported" })];
      }
      return [{
        kind: "throw",
        expression: planExpression(statement.Expression, sourceFile, input, diagnostics),
      }];
    }
    case KindDebuggerStatement:
      return [expressionStatement({
        kind: "call",
        callee: {
          kind: "member",
          receiver: {
            kind: "member",
            receiver: {
              kind: "member",
              receiver: { kind: "identifier", name: "System" },
              name: "Diagnostics",
            },
            name: "Debugger",
          },
          name: "Break",
        },
        arguments: [],
      })];
    case KindLabeledStatement: {
      const statement = AsLabeledStatement(node)!;
      return [{
        kind: "label",
        name: sanitizeIdentifier(Node_Text(statement.Label!)),
        statement: planSingleStatement(statement.Statement, sourceFile, input, diagnostics),
      }];
    }
    case KindSwitchStatement:
      return [planSwitchStatement(node, sourceFile, input, diagnostics)];
    case KindTryStatement:
      return [planTryStatement(node, sourceFile, input, diagnostics)];
    case KindExpressionStatement:
      return [expressionStatement(planExpression(AsExpressionStatement(node)!.Expression!, sourceFile, input, diagnostics))];
    case KindIfStatement: {
      const statement = AsIfStatement(node)!;
      return [{
        kind: "if",
        condition: planExpression(statement.Expression!, sourceFile, input, diagnostics),
        thenBody: {
          statements: planNestedStatementBody(statement.ThenStatement, sourceFile, input, diagnostics),
        },
        ...(statement.ElseStatement !== undefined
          ? { elseBody: { statements: planNestedStatementBody(statement.ElseStatement, sourceFile, input, diagnostics) } }
          : {}),
      }];
    }
    case KindWhileStatement: {
      const statement = AsWhileStatement(node)!;
      return [{
        kind: "while",
        condition: planExpression(statement.Expression!, sourceFile, input, diagnostics),
        body: {
          statements: planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics),
        },
      }];
    }
    case KindDoStatement: {
      const statement = AsDoStatement(node)!;
      return [{
        kind: "do",
        body: {
          statements: planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics),
        },
        condition: planExpression(statement.Expression!, sourceFile, input, diagnostics),
      }];
    }
    case KindForStatement: {
      const statement = AsForStatement(node)!;
      return [{
        kind: "for",
        ...(statement.Initializer !== undefined
          ? { initializer: planForInitializer(statement.Initializer, sourceFile, input, diagnostics) }
          : {}),
        ...(statement.Condition !== undefined
          ? { condition: planExpression(statement.Condition, sourceFile, input, diagnostics) }
          : {}),
        ...(statement.Incrementor !== undefined
          ? { incrementor: planExpression(statement.Incrementor, sourceFile, input, diagnostics) }
          : {}),
        body: {
          statements: planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics),
        },
      }];
    }
    case KindForInStatement:
      diagnostics.push(unsupportedNodeDiagnostic(node, "For-in requires target property enumeration semantics and is not implemented yet."));
      return [expressionStatement({ kind: "identifier", name: "__unsupported" })];
    case KindForOfStatement: {
      const statement = AsForInOrOfStatement(node)!;
      if (statement.AwaitModifier !== undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "For-await-of requires async iteration semantics and is not implemented yet."));
      }
      return [planForOfStatement(statement, sourceFile, input, diagnostics)];
    }
    case KindVariableStatement: {
      const declarationList = AsVariableStatement(node)!.DeclarationList;
      const declarations = AsVariableDeclarationList(declarationList)!.Declarations?.Nodes ?? [];
      if (declarations.length === 0) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Variable statement has no declaration."));
        return [expressionStatement({ kind: "identifier", name: "__unsupported" })];
      }
      return declarations
        .filter((declaration): declaration is Node => declaration !== undefined)
        .map((declaration) => ({
            kind: "local",
            ...planLocalDeclaration(declaration, sourceFile, input, diagnostics),
        }));
    }
    default:
      diagnostics.push(unsupportedNodeDiagnostic(node, "Statement is outside the current C# planning surface."));
      return [expressionStatement({ kind: "identifier", name: "__unsupported" })];
  }
}

function planForOfStatement(
  statement: NonNullable<ReturnType<typeof AsForInOrOfStatement>>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpStatement {
  const binding = planForOfBinding(statement.Initializer, sourceFile, input, diagnostics);
  return {
    kind: "foreach",
    itemType: binding.type,
    itemName: binding.name,
    collection: planExpression(statement.Expression!, sourceFile, input, diagnostics),
    body: {
      statements: planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics),
    },
  };
}

function planForOfBinding(
  initializer: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpLocalDeclaration {
  if (initializer === undefined) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_FOR_OF_BINDING",
      category: "error",
      source: "tsonic-csharp",
      message: "For-of statement has no initializer.",
    });
    return {
      name: "__unsupported",
      type: predefined("object"),
    };
  }
  if (initializer.Kind === KindVariableDeclarationList) {
    const declarations = AsVariableDeclarationList(initializer)!.Declarations?.Nodes ?? [];
    const first = declarations.find((declaration): declaration is Node => declaration !== undefined);
    if (first === undefined || declarations.filter((declaration) => declaration !== undefined).length !== 1) {
      diagnostics.push(unsupportedNodeDiagnostic(initializer, "For-of variable declaration must contain exactly one binding."));
      return {
        name: "__unsupported",
        type: predefined("object"),
      };
    }
    return planLocalDeclaration(first, sourceFile, input, diagnostics);
  }
  if (initializer.Kind === KindIdentifier) {
    const identifier = AsIdentifier(initializer)!;
    return {
      name: sanitizeIdentifier(identifier.Text),
      type: getCsharpTypeForNode(initializer, sourceFile, input),
    };
  }
  diagnostics.push(unsupportedNodeDiagnostic(initializer, "For-of initializer binding is outside the current C# planning surface."));
  return {
    name: "__unsupported",
    type: predefined("object"),
  };
}

function planSingleStatement(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpStatement {
  const statements = planNestedStatementBody(node, sourceFile, input, diagnostics);
  if (statements.length === 1) {
    return statements[0]!;
  }
  return {
    kind: "block",
    body: { statements },
  };
}

function planSwitchStatement(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpStatement {
  const statement = AsSwitchStatement(node)!;
  return {
    kind: "switch",
    expression: planExpression(statement.Expression!, sourceFile, input, diagnostics),
    sections: planSwitchSections(statement.CaseBlock, sourceFile, input, diagnostics),
  };
}

function planSwitchSections(
  caseBlockNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpSwitchSection[] {
  if (caseBlockNode === undefined) {
    return [];
  }
  const caseBlock = AsCaseBlock(caseBlockNode)!;
  const sections = (caseBlock.Clauses?.Nodes ?? [])
    .filter((clause): clause is Node => clause !== undefined)
    .map((clause) => planSwitchSection(clause, sourceFile, input, diagnostics));
  for (const section of sections) {
    const last = section.statements[section.statements.length - 1];
    if (section.statements.length > 0 && (last === undefined || !statementTerminatesSwitchSection(last))) {
      diagnostics.push({
        code: "CSHARP_UNSUPPORTED_SWITCH_FALLTHROUGH",
        category: "error",
        source: "tsonic-csharp",
        message: "Switch case fallthrough requires control-flow lowering and is not implemented yet.",
      });
    }
  }
  return sections;
}

function planSwitchSection(
  clauseNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpSwitchSection {
  const clause = AsCaseOrDefaultClause(clauseNode)!;
  return {
    label: clauseNode.Kind === KindDefaultClause
      ? { kind: "default" }
      : { kind: "case", expression: planExpression(clause.Expression!, sourceFile, input, diagnostics) },
    statements: (clause.Statements?.Nodes ?? [])
      .filter((statement): statement is Node => statement !== undefined)
      .flatMap((statement) => planStatements(statement, sourceFile, input, diagnostics)),
  };
}

function statementTerminatesSwitchSection(statement: CsharpStatement): boolean {
  switch (statement.kind) {
    case "break":
    case "continue":
    case "return":
    case "throw":
      return true;
    case "block": {
      const last = statement.body.statements[statement.body.statements.length - 1];
      return last !== undefined && statementTerminatesSwitchSection(last);
    }
    default:
      return false;
  }
}

function planTryStatement(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpStatement {
  const statement = AsTryStatement(node)!;
  return {
    kind: "try",
    tryBody: {
      statements: planBlockStatements(statement.TryBlock, sourceFile, input, diagnostics),
    },
    ...(statement.CatchClause !== undefined
      ? { catchClause: planCatchClause(statement.CatchClause, sourceFile, input, diagnostics) }
      : {}),
    ...(statement.FinallyBlock !== undefined
      ? { finallyBody: { statements: planBlockStatements(statement.FinallyBlock, sourceFile, input, diagnostics) } }
      : {}),
  };
}

function planCatchClause(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpCatchClause {
  const clause = AsCatchClause(node)!;
  return {
    ...(clause.VariableDeclaration !== undefined
      ? { variableName: sanitizeIdentifier(Node_Text(AsVariableDeclaration(clause.VariableDeclaration)!.name!)) }
      : {}),
    body: {
      statements: planBlockStatements(clause.Block, sourceFile, input, diagnostics),
    },
  };
}

function planForInitializer(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpForInitializer {
  if (node.Kind === KindVariableDeclarationList) {
    const declarations = AsVariableDeclarationList(node)!.Declarations?.Nodes ?? [];
    const locals = declarations
      .filter((declaration): declaration is Node => declaration !== undefined)
      .map((declaration) => planLocalDeclaration(declaration, sourceFile, input, diagnostics));
    const first = locals[0];
    if (first !== undefined && locals.some((local) => !sameCsharpType(local.type, first.type))) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "C# for-initializer cannot represent mixed local declaration types without statement rewriting."));
    }
    return {
      kind: "locals",
      locals,
    };
  }
  return {
    kind: "expression",
    expression: planExpression(node, sourceFile, input, diagnostics),
  };
}

function planLocalDeclaration(
  declarationNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpLocalDeclaration {
  const variable = AsVariableDeclaration(declarationNode)!;
  const type = getCsharpTypeForNode(variable.Type ?? variable.name, sourceFile, input);
  return {
    name: sanitizeIdentifier(variable.name === undefined ? "local" : Node_Text(variable.name)),
    type,
    ...(variable.Initializer !== undefined
      ? { initializer: planExpressionWithExpectedType(variable.Initializer, sourceFile, input, diagnostics, type) }
      : {}),
  };
}

function planNestedStatementBody(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpStatement[] {
  if (node === undefined) {
    return [];
  }
  if (node.Kind === KindBlock) {
    return planBlockStatements(node, sourceFile, input, diagnostics);
  }
  return planStatements(node, sourceFile, input, diagnostics);
}

function expressionStatement(expression: CsharpExpression): CsharpStatement {
  return {
    kind: "expression",
    expression,
  };
}
