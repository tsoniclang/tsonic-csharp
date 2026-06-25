import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  SourceFile,
  Symbol,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  csharpArrayBoundaryFactKey,
  csharpArrayCarrierFactKey,
} from "../../../csharp-facts.js";
import type {
  CsharpArrayBoundaryFact,
  CsharpArrayCarrierFact,
  CsharpArrayCarrierLane,
} from "../../../csharp-facts.js";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
  visitAstReaderNodes,
} from "../../ast-utils.js";
import type {
  CsharpOperationsProviderHost,
} from "../../operations-provider.js";
import {
  getSymbolForDeclarationLookup,
} from "../../symbol-utils.js";
import {
  csharpEnumerableTargetType,
  csharpListTargetType,
  csharpReadOnlyListTargetType,
} from "../../target-types.js";
import {
  getBinaryOperatorText,
} from "../../operator-syntax.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../../runtime-carriers.js";
import {
  getSourceLibraryMember,
} from "../../source-library.js";
import type {
  SourceLibraryMember,
} from "../../source-library.js";
import {
  csharpJsArrayCarrierTargetType,
} from "./array-carriers.js";

type ArrayUse =
  | "sequential-read"
  | "index-read"
  | "length-read"
  | "dense-mutation"
  | "full-js";

type LifecycleContext = {
  readonly host: ExtensionObservationContext["host"];
  readonly compiler?: ExtensionObservationContext["compiler"];
};

export function recordCsharpJsArrayCarrierFactsBeforeFinalization(
  lifecycleContext: LifecycleContext,
  host: Pick<CsharpOperationsProviderHost, "getTargetTypeRefForSubject">,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    for (const parameter of collectArrayParameters(sourceFile, lifecycleContext, host)) {
      recordArrayParameterFacts(parameter, sourceFile, lifecycleContext, context);
    }
    for (const returnType of collectArrayReturnTypeNodes(sourceFile, lifecycleContext, host)) {
      recordArrayReturnFacts(returnType, lifecycleContext);
    }
  }
}

interface ArrayParameterAnalysis {
  readonly parameter: Node;
  readonly name: Node;
  readonly typeNode: Node;
  readonly symbol: Symbol | undefined;
  readonly semanticType: Type | undefined;
  readonly elementType: TargetTypeRef;
  readonly uses: ReadonlySet<ArrayUse>;
}

function collectArrayParameters(
  sourceFile: SourceFile,
  lifecycleContext: LifecycleContext,
  host: Pick<CsharpOperationsProviderHost, "getTargetTypeRefForSubject">,
): readonly ArrayParameterAnalysis[] {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return [];
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  const parameters: ArrayParameterAnalysis[] = [];
  visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
    if (!compiler.ast.is.IsParameterDeclaration(node)) {
      return;
    }
    const typeNode = asNodeSubject(getNodeField(node, "Type"));
    if (typeNode === undefined || !compiler.ast.is.IsArrayTypeNode(typeNode)) {
      return;
    }
    const name = asNodeSubject(getNodeField(node, "name"));
    if (name === undefined || !compiler.ast.is.IsIdentifier(name)) {
      return;
    }
    const elementTypeNode = asNodeSubject(getNodeField(typeNode, "ElementType"));
    const elementType = host.getTargetTypeRefForSubject(elementTypeNode, context, { allowSemanticTypeQuery: true, sourceFile });
    if (elementType === undefined) {
      return;
    }
    const symbol = getSymbolForDeclarationLookup(compiler.ast, compiler.checker, node, sourceFile) ??
      getSymbolForDeclarationLookup(compiler.ast, compiler.checker, name, sourceFile);
    const semanticType = compiler.checker.getTypeFromTypeNode(typeNode, { sourceFile }) ??
      compiler.checker.getTypeAtLocation(name, { sourceFile });
    parameters.push({
      parameter: node,
      name,
      typeNode,
      symbol,
      semanticType,
      elementType,
      uses: collectArrayUsesForSymbol(sourceFile, symbol, lifecycleContext),
    });
  });
  return parameters;
}

function collectArrayUsesForSymbol(
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
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
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
    if (sourceMember.memberName === "length") {
      return parentIsWriteTarget(parent, ast) ? ["full-js"] : ["length-read"];
    }
    if (denseMutatingArrayMethods.has(sourceMember.memberName)) {
      return ["dense-mutation"];
    }
    if (fullJsArrayMethods.has(sourceMember.memberName)) {
      return ["full-js"];
    }
    if (readIndexableArrayMethods.has(sourceMember.memberName)) {
      return ["index-read"];
    }
    return [];
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
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
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
  if (sourceMember.declaringName === "Array") {
    if (argumentIndex !== 0) {
      return [];
    }
    switch (sourceMember.memberName) {
      case "from":
        return ["sequential-read"];
      case "isArray":
        return ["index-read"];
      default:
        return [];
    }
  }
  if (sourceMember.declaringName === "Object") {
    switch (sourceMember.memberName) {
      case "keys":
      case "values":
      case "entries":
        return argumentIndex === 0 ? ["full-js"] : [];
      case "assign":
        return argumentIndex > 0 ? ["full-js"] : [];
      default:
        return [];
    }
  }
  return [];
}

const denseMutatingArrayMethods = new Set([
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "reverse",
  "sort",
]);

const readIndexableArrayMethods = new Set([
  "at",
  "concat",
  "every",
  "filter",
  "find",
  "findIndex",
  "findLast",
  "findLastIndex",
  "forEach",
  "includes",
  "indexOf",
  "join",
  "lastIndexOf",
  "map",
  "reduce",
  "reduceRight",
  "slice",
  "some",
]);

const fullJsArrayMethods = new Set([
  "copyWithin",
  "fill",
  "flat",
  "flatMap",
  "toReversed",
  "toSorted",
  "toSpliced",
  "with",
]);

function parentIsWriteTarget(
  node: Node,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
): boolean {
  const parent = ast.parent(node);
  if (parent === undefined) {
    return false;
  }
  if (ast.is.IsBinaryExpression(parent) && asNodeSubject(getNodeField(parent, "Left")) === node) {
    return isAssignmentOperator(getBinaryOperatorText(ast, parent));
  }
  return (ast.is.IsPrefixUnaryExpression(parent) || ast.is.IsPostfixUnaryExpression(parent)) &&
    asNodeSubject(getNodeField(parent, "Operand")) === node;
}

function isAssignmentOperator(operator: string | undefined): boolean {
  switch (operator) {
    case "=":
    case "+=":
    case "-=":
    case "*=":
    case "/=":
    case "%=":
    case "&=":
    case "|=":
    case "^=":
    case "<<=":
    case ">>=":
    case ">>>=":
    case "&&=":
    case "||=":
    case "??=":
      return true;
    default:
      return false;
  }
}

function isDeleteExpressionOperand(
  node: Node,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
): boolean {
  const parent = ast.parent(node);
  return parent !== undefined &&
    ast.kindName(parent) === "KindDeleteExpression" &&
    asNodeSubject(getNodeField(parent, "Expression")) === node;
}

function getSelectedArraySourceLibraryMemberForPropertyAccess(
  propertyAccess: Node,
  sourceFile: SourceFile,
  lifecycleContext: LifecycleContext,
): SourceLibraryMember | undefined {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const symbol = compiler.checker.getSymbolAtLocation(propertyAccess, { sourceFile }) ??
    compiler.checker.getResolvedSymbol(propertyAccess, { sourceFile });
  return arraySourceLibraryMemberFromDeclaration(firstSymbolDeclaration(symbol), lifecycleContext);
}

function getSelectedArraySourceLibraryMemberForCall(
  call: Node,
  sourceFile: SourceFile,
  lifecycleContext: LifecycleContext,
): SourceLibraryMember | undefined {
  const signature = lifecycleContext.compiler?.checker.getResolvedSignature(call, { sourceFile });
  return arraySourceLibraryMemberFromDeclaration(getSignatureDeclaration(signature), lifecycleContext);
}

function arraySourceLibraryMemberFromDeclaration(
  declaration: Node | undefined,
  lifecycleContext: LifecycleContext,
): SourceLibraryMember | undefined {
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  const member = getSourceLibraryMember(declaration, context);
  return member !== undefined && (
    member.declaringName === "Array" ||
    member.declaringName === "ReadonlyArray" ||
    member.declaringName === "Object"
  )
    ? member
    : undefined;
}

function firstSymbolDeclaration(symbol: unknown): Node | undefined {
  return ((symbol as { readonly Declarations?: readonly Node[] } | undefined)?.Declarations ??
    (symbol as { readonly declarations?: readonly Node[] } | undefined)?.declarations)?.[0];
}

function getSignatureDeclaration(signature: unknown): Node | undefined {
  return asNodeSubject((signature as { readonly declaration?: unknown } | undefined)?.declaration);
}

function recordArrayParameterFacts(
  parameter: ArrayParameterAnalysis,
  sourceFile: SourceFile,
  lifecycleContext: LifecycleContext,
  context: ExtensionObservationContext,
): void {
  const boundary = boundaryFactForArrayParameter(parameter);
  const carrier: CsharpArrayCarrierFact = {
    sourceKind: "ts-array",
    lane: boundary.coreCarrierLane,
    elementType: parameter.elementType,
    carrierType: boundary.coreCarrierType,
    mutationVisibility: boundary.preservesMutationVisibility ? "caller-visible" : "none",
    boundary: "exported-api",
  };
  const evidence = [{
    message: `C# JS surface array carrier selected for exported TypeScript array parameter '${getParameterName(parameter.name)}' from observed checked array operations: ${Array.from(parameter.uses).sort().join(",") || "none"}.`,
  }];
  for (const subject of arrayFactSubjects(parameter)) {
    lifecycleContext.host.facts.set(subject, csharpArrayCarrierFactKey, carrier, evidence);
    lifecycleContext.host.facts.set(subject, csharpArrayBoundaryFactKey, boundary, evidence);
  }
  for (const subject of arrayRuntimeCarrierSubjects(parameter)) {
    lifecycleContext.host.facts.set(subject, runtimeCarrierFactKey, { carrier: boundary.coreCarrierType }, evidence);
  }
  void sourceFile;
  void context;
}

interface ArrayReturnAnalysis {
  readonly typeNode: Node;
  readonly elementType: TargetTypeRef;
}

function collectArrayReturnTypeNodes(
  sourceFile: SourceFile,
  lifecycleContext: LifecycleContext,
  host: Pick<CsharpOperationsProviderHost, "getTargetTypeRefForSubject">,
): readonly ArrayReturnAnalysis[] {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return [];
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  const returns: ArrayReturnAnalysis[] = [];
  visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
    const kind = compiler.ast.kindName(node);
    if (
      kind !== "KindFunctionDeclaration" &&
      kind !== "KindMethodDeclaration" &&
      kind !== "KindArrowFunction" &&
      kind !== "KindFunctionExpression"
    ) {
      return;
    }
    const typeNode = asNodeSubject(getNodeField(node, "Type"));
    if (typeNode === undefined || !compiler.ast.is.IsArrayTypeNode(typeNode)) {
      return;
    }
    const elementTypeNode = asNodeSubject(getNodeField(typeNode, "ElementType"));
    const elementType = host.getTargetTypeRefForSubject(elementTypeNode, context, { allowSemanticTypeQuery: true, sourceFile });
    if (elementType === undefined) {
      return;
    }
    returns.push({ typeNode, elementType });
  });
  return returns;
}

function recordArrayReturnFacts(
  returnType: ArrayReturnAnalysis,
  lifecycleContext: LifecycleContext,
): void {
  const list = csharpListTargetType(returnType.elementType);
  const evidence = [{ message: "C# JS surface array return boundary selected List<T> for ordinary TypeScript Array<T> return value." }];
  lifecycleContext.host.facts.set(returnType.typeNode, csharpArrayBoundaryFactKey, {
    publicShape: "List<T>",
    publicType: list,
    coreCarrierLane: "native-dense-mutable",
    coreCarrierType: list,
    preservesMutationVisibility: true,
    requiresCopyIn: false,
    requiresCopyOut: false,
  }, evidence);
  lifecycleContext.host.facts.set(returnType.typeNode, csharpArrayCarrierFactKey, {
    sourceKind: "ts-array",
    lane: "native-dense-mutable",
    elementType: returnType.elementType,
    carrierType: list,
    mutationVisibility: "caller-visible",
    boundary: "exported-api",
  }, evidence);
  lifecycleContext.host.facts.set(returnType.typeNode, runtimeCarrierFactKey, { carrier: list }, evidence);
}

function boundaryFactForArrayParameter(parameter: ArrayParameterAnalysis): CsharpArrayBoundaryFact {
  const lane = laneForArrayUses(parameter.uses);
  if (lane === "native-dense-mutable") {
    const list = csharpListTargetType(parameter.elementType);
    return {
      publicShape: "List<T>",
      publicType: list,
      coreCarrierLane: lane,
      coreCarrierType: list,
      preservesMutationVisibility: true,
      requiresCopyIn: false,
      requiresCopyOut: false,
    };
  }
  if (lane === "native-read-indexable") {
    const readOnlyList = csharpReadOnlyListTargetType(parameter.elementType);
    return {
      publicShape: "IReadOnlyList<T>",
      publicType: readOnlyList,
      coreCarrierLane: lane,
      coreCarrierType: readOnlyList,
      preservesMutationVisibility: false,
      requiresCopyIn: false,
      requiresCopyOut: false,
    };
  }
  if (lane === "native-read-sequence") {
    const enumerable = csharpEnumerableTargetType(parameter.elementType);
    return {
      publicShape: "IEnumerable<T>",
      publicType: enumerable,
      coreCarrierLane: lane,
      coreCarrierType: enumerable,
      preservesMutationVisibility: false,
      requiresCopyIn: false,
      requiresCopyOut: false,
    };
  }
  if (lane === "js-full-internal") {
    const carrier = csharpJsArrayCarrierTargetType(parameter.elementType);
    return {
      publicShape: "compat-facade",
      publicType: csharpEnumerableTargetType(parameter.elementType),
      coreCarrierLane: lane,
      coreCarrierType: carrier,
      preservesMutationVisibility: false,
      requiresCopyIn: true,
      requiresCopyOut: false,
    };
  }
  return {
    publicShape: "T[]",
    publicType: { kind: "array", element: parameter.elementType },
    coreCarrierLane: "native-array-required",
    coreCarrierType: { kind: "array", element: parameter.elementType },
    preservesMutationVisibility: false,
    requiresCopyIn: false,
    requiresCopyOut: false,
  };
}

function laneForArrayUses(uses: ReadonlySet<ArrayUse>): CsharpArrayCarrierLane {
  if (uses.has("full-js")) {
    return "js-full-internal";
  }
  if (uses.has("dense-mutation")) {
    return "native-dense-mutable";
  }
  if (uses.has("index-read") || uses.has("length-read")) {
    return "native-read-indexable";
  }
  if (uses.has("sequential-read")) {
    return "native-read-sequence";
  }
  return "native-array-required";
}

function arrayFactSubjects(parameter: ArrayParameterAnalysis): readonly ExtensionFactSubject[] {
  const subjects: readonly (ExtensionFactSubject | undefined)[] = [
    parameter.parameter,
    parameter.name,
    parameter.typeNode,
    parameter.symbol,
  ];
  return subjects.filter((subject): subject is ExtensionFactSubject => subject !== undefined);
}

function arrayRuntimeCarrierSubjects(parameter: ArrayParameterAnalysis): readonly ExtensionFactSubject[] {
  const subjects: readonly (ExtensionFactSubject | undefined)[] = [
    parameter.name,
    parameter.symbol,
  ];
  return subjects.filter((subject): subject is ExtensionFactSubject => subject !== undefined);
}

function getParameterName(name: Node): string {
  const text = (name as { readonly Text?: unknown }).Text;
  return typeof text === "string" ? text : "<array>";
}
