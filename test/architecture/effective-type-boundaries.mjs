import { readArchitectureTypeScript } from "../../../tsonic/test/architecture/tooling/typescript-source.mjs";
import { checkerImportFindings } from "../../../tsonic/test/architecture/tooling/source-boundaries.mjs";
import { publicModuleDependency } from "../../../tsonic/test/architecture/tooling/public-declarations.mjs";
const checkerQueries = new Set([
  "getTypeAtLocation", "getTypeFromTypeNode", "getContextualType", "getResolvedSignature", "getResolvedCallInfo",
  "getResolvedPropertyAccessInfo", "getResolvedElementAccessInfo", "getTypeOfSymbol", "getDeclaredTypeOfSymbol",
  "expressionType", "declaredValueType", "typeOfSymbol", "declaredSymbolType", "writeSymbolType",
  "selectValueTypeRefinement", "resolveTypeWithState", "resolveSemanticTypeArguments", "bindCsharpSourceTypeArguments",
]);
const retiredProperties = new Set(["semantics", "semanticsFor", "effectiveTypes", "semanticType", "semanticTargetType",
  "sourceSelectedSignatureParameters"]);
const resolverObjects = new Set(["types", "structuralTypes", "objectShapes", "host"]);

export function sourceEvidenceBoundaryFindings(sourceFiles) {
  const source = readArchitectureTypeScript(sourceFiles);
  const ast = source.ast;
  const findings = [];
  for (const file of source.sourceFiles) {
    const path = ast.getFileName(file).slice("/architecture/".length);
    if (!sourceFiles.has(path)) continue;
    const native = path.startsWith("src/");
    const hostFlow = path.startsWith("host/source-semantics/local-type-flow/");
    if (native || hostFlow) findings.push(...checkerImportFindings(source, file));
    const text = ast.getSourceText(file);
    const add = (node, rule) => findings.push(Object.freeze({ file: path,
      line: text.slice(0, ast.authoredRange(node).start).split("\n").length, rule }));
    const label = node => {
      if (node === undefined) return undefined;
      if (ast.is.IsIdentifier(node)) return ast.text(node);
      if (ast.is.IsPropertyAccessExpression(node)) return ast.text(ast.name(node));
      return undefined;
    };
    const unwrap = original => {
      let node = original;
      while (node !== undefined) {
        if (ast.is.IsParenthesizedExpression(node)) node = ast.as.AsParenthesizedExpression(node).Expression;
        else if (ast.is.IsAsExpression(node)) node = ast.as.AsAsExpression(node).Expression;
        else if (ast.is.IsTypeAssertion(node)) node = ast.as.AsTypeAssertion(node).Expression;
        else if (ast.is.IsNonNullExpression(node)) node = ast.as.AsNonNullExpression(node).Expression;
        else if (ast.is.IsSatisfiesExpression(node)) node = ast.as.AsSatisfiesExpression(node).Expression;
        else break;
      }
      return node;
    };
    const visit = node => {
      const dependency = publicModuleDependency(ast, node);
      if (dependency !== undefined) {
        const name = ast.text(dependency.specifier);
        if (native && (name === "@tsonic/host" || name.startsWith("@tsonic/host/") ||
          name === "@tsonic/source-core/host" || /(?:^|\/)tsonic\/packages\//u.test(name))) {
          add(node, "native-imports-private-host");
        }
        if (hostFlow && /(?:target-analysis|source-storage|tsonic-csharp|tsonic-rust|providers\/native)/u.test(name)) {
          add(node, "host-solver-imports-target-or-storage");
        }
      }
      if (native && ast.is.IsPropertyAccessExpression(node)) {
        const property = ast.as.AsPropertyAccessExpression(node);
        const name = label(node);
        if (retiredProperties.has(name)) add(node, "retired-source-query-channel");
        if (name === "resolveType" && resolverObjects.has(label(property?.Expression))) add(node, "raw-type-resolver-reference");
      }
      if (native && ast.is.IsCallExpression(node)) {
        const callee = unwrap(ast.as.AsCallExpression(node)?.Expression);
        if (checkerQueries.has(label(callee))) add(node, "native-checker-query");
      }
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    visit(file);
  }
  return Object.freeze(findings);
}
