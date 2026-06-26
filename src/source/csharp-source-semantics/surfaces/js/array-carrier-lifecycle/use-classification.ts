import type {
  Node,
  SourceFile,
  Symbol,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
  visitAstReaderNodes,
} from "../../../ast-utils.js";
import {
  getBinaryOperatorText,
} from "../../../operator-syntax.js";
import {
  getSymbolForDeclarationLookup,
} from "../../../symbol-utils.js";
import {
  isDeleteExpressionOperand,
  parentIsWriteTarget,
} from "./mutation-classification.js";
import {
  getSelectedArraySourceLibraryMemberForCall,
  getSelectedArraySourceLibraryMemberForPropertyAccess,
} from "./source-library-selection.js";
import {
  classifySourceLibraryArrayPropertyUse,
  classifySourceLibraryStaticCallArgumentUse,
} from "./array-use-policy.js";
import type {
  ArrayUse,
  CsharpArrayLifecycleAst,
  LifecycleContext,
} from "./types.js";

export function collectArrayUsesForSymbol(
  sourceFile: SourceFile,
  symbol: Symbol | undefined,
  lifecycleContext: LifecycleContext,
): ReadonlySet<ArrayUse> {
  const compiler = lifecycleContext.compiler;
  const uses = new Set<ArrayUse>();
  if (compiler === undefined || symbol === undefined) {
    return uses;
  }
  visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
    if (!compiler.ast.is.IsIdentifier(node)) {
      return;
    }
    const referenced = getSymbolForDeclarationLookup(compiler.ast, compiler.checker, node, sourceFile);
    if (referenced !== symbol) {
      return;
    }
    for (const use of classifyIdentifierArrayUse(node, sourceFile, lifecycleContext, compiler.ast)) {
      uses.add(use);
    }
  });
  return uses;
}

function classifyIdentifierArrayUse(
  identifier: Node,
  sourceFile: SourceFile,
  lifecycleContext: LifecycleContext,
  ast: CsharpArrayLifecycleAst,
): readonly ArrayUse[] {
  const parent = ast.parent(identifier);
  if (parent === undefined) {
    return [];
  }
  if (ast.is.IsElementAccessExpression(parent) && asNodeSubject(getNodeField(parent, "Expression")) === identifier) {
    if (isDeleteExpressionOperand(parent, ast)) {
      return ["full-js"];
    }
    return parentIsWriteTarget(parent, ast) ? ["dense-mutation"] : ["index-read"];
  }
  if (ast.is.IsBinaryExpression(parent) && asNodeSubject(getNodeField(parent, "Right")) === identifier && getBinaryOperatorText(ast, parent) === "in") {
    return ["full-js"];
  }
  if (ast.is.IsPropertyAccessExpression(parent) && asNodeSubject(getNodeField(parent, "Expression")) === identifier) {
    const sourceMember = getSelectedArraySourceLibraryMemberForPropertyAccess(parent, sourceFile, lifecycleContext);
    if (sourceMember === undefined) {
      return [];
    }
    return classifySourceLibraryArrayPropertyUse(sourceMember, parentIsWriteTarget(parent, ast));
  }
  if (ast.is.IsForOfStatement(parent) && asNodeSubject(getNodeField(parent, "Expression")) === identifier) {
    return ["sequential-read"];
  }
  if (ast.is.IsForInStatement(parent) && asNodeSubject(getNodeField(parent, "Expression")) === identifier) {
    return ["index-read", "length-read"];
  }
  if (ast.kindName(parent) === "KindSpreadElement" && asNodeSubject(getNodeField(parent, "Expression")) === identifier) {
    return ["sequential-read"];
  }
  if (ast.is.IsVariableDeclaration(parent) && asNodeSubject(getNodeField(parent, "Initializer")) === identifier) {
    return classifyArrayBindingPatternUse(asNodeSubject(getNodeField(parent, "name")), ast);
  }
  if (ast.is.IsCallExpression(parent) && getNodeList(getNodeField(parent, "Arguments")).includes(identifier)) {
    return classifyArrayStaticCallArgumentUse(parent, identifier, sourceFile, lifecycleContext);
  }
  return [];
}

function classifyArrayBindingPatternUse(
  pattern: Node | undefined,
  ast: CsharpArrayLifecycleAst,
): readonly ArrayUse[] {
  if (pattern === undefined || ast.kindName(pattern) !== "KindArrayBindingPattern") {
    return [];
  }
  const uses = new Set<ArrayUse>(["index-read"]);
  for (const element of getNodeList(getNodeField(pattern, "Elements"))) {
    if (ast.kindName(element) !== "KindBindingElement") {
      continue;
    }
    if (getNodeField(element, "DotDotDotToken") !== undefined || getNodeField(element, "Initializer") !== undefined) {
      uses.add("length-read");
    }
  }
  return Array.from(uses);
}

function classifyArrayStaticCallArgumentUse(
  call: Node,
  identifier: Node,
  sourceFile: SourceFile,
  lifecycleContext: LifecycleContext,
): readonly ArrayUse[] {
  const sourceMember = getSelectedArraySourceLibraryMemberForCall(call, sourceFile, lifecycleContext);
  if (sourceMember === undefined) {
    return [];
  }
  const argumentIndex = getNodeList(getNodeField(call, "Arguments")).indexOf(identifier);
  return classifySourceLibraryStaticCallArgumentUse(sourceMember, argumentIndex);
}
