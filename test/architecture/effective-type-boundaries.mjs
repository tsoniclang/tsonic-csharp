import { readArchitectureTypeScript } from "../../../tsonic/test/architecture/tooling/typescript-source.mjs";

const resolverOwners = /^src\/analysis\/source-evidence\/types\/resolution\/(?:semantic-types|scope|engine|model|query-cache)\.ts$/u;
const shapeOwners = /^src\/analysis\/objects\/shapes\//u;
const converters = new Set(["resolveType", "resolveTypeWithState", "bindCsharpSourceTypeArguments", "resolveSemanticTypeArguments", "deriveMembers"]);
const valueQueries = new Set(["expressionType", "declaredValueType", "typeOfSymbol", "declaredSymbolType", "writeSymbolType", "selectValueTypeRefinement"]);
const valueFields = new Set(["sourceReadType", "sourceWriteType", "sourceElementType", "sourceResultType", "selectedSignature", "sourceSelectedMethodTypeArguments", "sourceSelectedSignatureParameters"]);
const transparentKinds = new Set(["KindParenthesizedExpression", "KindAsExpression", "KindTypeAssertionExpression", "KindNonNullExpression", "KindSatisfiesExpression"]);

export const declarationConverterAllowances = Object.freeze([
  ["src/analysis/callables/calls/source-callable-abi.ts", "selectCsharpSourceCallableAbi", "policy.types.resolveType", "checked.returnType", "selected declared callable return ABI"],
  ["src/analysis/callables/calls/source-callable-abi.ts", "constructorReturnType", "policy.types.resolveType", "policy.semantics(sourceFile).declarations.declaredType(parent)", "enclosing class instance declaration"],
  ["src/analysis/control-flow/resource-management.ts", "selectCsharpResourceManagement", "input.types.resolveType", "alternative.sourceType", "pinned disposal signature alternative"],
  ["src/analysis/declarations/analyze.ts", "resolveType", "policy.types.resolveType", "type", "authored native return union-layout component"],
  ["src/analysis/operations/collections/indexed-records.ts", "selectCsharpIndexedRecordProperty", "host.types.resolveType", "index.keyType", "declared string-index signature key contract"],
  ["src/analysis/operations/constructs.ts", "analyzeCsharpOperationConstruct", "policy.types.resolveType", "type", "selected constructor signature instance metadata"],
  ["src/analysis/operations/iteration/selection.ts", "selectCsharpIteration", "input.types.resolveType", "source.sourceElementType", "for-in property-key contract after for-of and for-await exits", "source.sourceElementType"],
  ["src/analysis/operations/memory-bindings.ts", "selectCsharpMemoryBinding", "input.objectShapes.resolveType", "operation.sourceType", "explicitly authored record layout schema"],
  ["src/analysis/operations/typed-locations.ts", "selectCsharpTypedLocationOperation", "input.types.resolveType", "source.sourcePointeeType", "declared pointee ABI rather than the location value"],
  ["src/analysis/operations/source-references.ts", "analyzeCsharpSourceReferences", "input.evidence.semanticType.get", "sourceType", "intrinsic absence classification only", "sourceType"],
  ["src/analysis/program/type-system.ts", "resolveType", "objectShapes.resolveTypeWithState", "type", "declared structural and alias conversion capability"],
  ["src/analysis/program/records/program/source-profile-inputs.ts", "createCsharpSourceProfileInputs", "host.types.resolveType", "argument.typeParameter", "selected declaration binder metadata only"],
  ["src/analysis/source-evidence/analyze.ts", "classifyType", "types.resolveType", "type", "intrinsic declared and contextual metadata classification", "type"],
  ["src/analysis/source-evidence/analyze.ts", "visit", "types.resolveType", "staticType", "class declaration's static constructor-side identity", "staticType"],
  ["src/analysis/source-evidence/analyze.ts", "visit", "types.resolveType", "source.semantics.forNode(node).declarations.declaredType(node)", "actual TypeParameter declaration and constraints"],
  ["src/analysis/objects/shapes/member-evidence.ts", "deriveMember", "host.typeResolver.resolveType", "sourceType", "actual method declaration's callable component, not an initializer", "sourceType"],
  ["src/analysis/objects/shapes/member-evidence.ts", "resolvePropertyType", "host.typeResolver.resolveType", "sourceType", "declaration component only after original initializer nodes returned without a Type fallback", "sourceType"],
  ["src/analysis/objects/shapes/member-evidence.ts", "resolveInheritedMemberType", "host.typeResolver.resolveType", "semantics.types.expressionType(declaration)", "selected inherited method declaration's signature, not a body value", "semantics.types.expressionType(declaration)"],
  ["src/analysis/source-evidence/types/resolution/pointer-storage.ts", "resolveCsharpPointerStoragePointee", "scope.resolveTypeWithState", "storage.type", "retained pointer storage pointee schema"],
  ["src/analysis/source-evidence/types/resolution/selected-values.ts", "resolveAuthoredAndSelectedSourceType", "resolveTypeWithState", "selectedType", "authored declared component and native union refinement"],
  ["src/analysis/source-evidence/types/resolution/selected-values.ts", "resolveAuthoredAndSelectedSourceType", "resolveTypeWithState", "type", "selected nullish member of an authored declaration"],
  ["src/analysis/source-evidence/types/resolution/public-api.ts", "resolveType", "resolveTypeWithState", "type", "public Type-only declaration entry implementation"],
  ["src/analysis/source-evidence/types/resolution/constructors.ts", "resolveCsharpConstructorValueType", "scope.resolveTypeWithState", "result", "selected constructor signature's instance return component"],
  ["src/analysis/source-evidence/types/resolution/calls.ts", "resolveSourceCallSelectedType", "scope.resolveTypeWithState", "declared", "generic declaration identity"],
  ["src/analysis/source-evidence/types/resolution/generic-arguments.ts", "bindCsharpSourceTypeArguments", "scope.resolveTypeWithState", "binding.argumentType", "checked declaration application outside a published call instantiation"],
  ["src/analysis/source-evidence/types/resolution/union-definitions.ts", "resolve", "resolveType", "binding.argument", "declared union alias application argument"],
  ["src/analysis/source-evidence/types/resolution/union-definitions.ts", "resolve", "resolveType", "binding.parameter", "declared union alias binder"],
  ["src/analysis/source-evidence/types/resolution/union-definitions.ts", "resolve", "resolveType", "declared", "declared union template definition"],
  ["src/analysis/source-evidence/types/resolution/source-evidence.ts", "resolveCsharpUnionMemberCarrier", "scope.resolveTypeWithState", "selectedType", "retained authored union arm"],
  ["src/analysis/source-evidence/types/resolution/conditional-types.ts", "resolveCsharpConditionalApplication", "scope.resolveTypeWithState", "sourceType", "checked conditional type application component"],
  ["src/analysis/source-evidence/types/resolution/conditional-types.ts", "resolveCsharpSemanticConditionalType", "scope.resolveTypeWithState", "binding.argument", "conditional declaration type argument"],
  ["src/analysis/source-evidence/types/resolution/nodes.ts", "resolveNodeResultWithState", "resolveTypeWithState", "queries.types.authoredType(node)", "authored array type syntax"],
  ["src/analysis/source-evidence/types/resolution/nodes.ts", "resolveNodeResultWithState", "resolveTypeWithState", "selected", "authored any or unknown union syntax"],
  ["src/analysis/source-evidence/types/resolution/nodes.ts", "resolveFallbackNodeCarrier", "resolveTypeWithState", "queries.types.expressionType(node)", "only reached after the original node's Host outcome was absent"],
  ["src/analysis/source-evidence/types/resolution/source-references.ts", "resolveSourceValueResult", "resolveTypeWithState", "declaredSourceType", "declaration fallback only outside the Host publication domain"],
  ["src/analysis/source-evidence/types/resolution/source-references.ts", "resolveSourceValueResult", "resolveTypeWithState", "selectedSource", "selected metadata only outside the Host publication domain"],
  ["src/analysis/source-evidence/types/resolution/source-references.ts", "resolveSourceValueResult", "resolveTypeWithState", "selectedValueType", "union refinement only outside the Host publication domain"],
  ["src/analysis/source-evidence/types/resolution/public-api.ts", "resolveSelectedValueResultWithState", "resolveTypeWithState", "type", "declared constructor alternative outside the Host publication domain"],
  ["src/analysis/source-evidence/types/resolution/public-api.ts", "resolveSelectedValueResultWithState", "resolveTypeWithState", "selectedType", "selected declared refinement outside the Host publication domain"],
  ["src/analysis/source-evidence/types/resolution/project-types.ts", "resolveProjectSourceSemanticType", "resolveTypeWithState", "apparent", "same-symbol apparent declared class or interface"],
  ["src/analysis/source-evidence/types/resolution/project-types.ts", "projectSourceDeclarationTargetType", "scope.resolveTypeWithState", "base.selectedType", "selected declared base ABI"],
  ["src/analysis/source-evidence/types/resolution/project-types.ts", "projectSourceDeclarationTargetType", "scope.resolveTypeWithState", "source", "selected authored project declaration"],
  ["src/analysis/source-evidence/types/resolution/source-references.ts", "resolveTypeReferenceNode", "resolveTypeWithState", "semanticType", "authored type-reference syntax"],
  ["src/analysis/source-evidence/types/resolution/source-references.ts", "resolveCheckerTransformedSourceType", "resolveTypeWithState", "element.type", "checked tuple transformation element component"],
  ["src/analysis/source-evidence/types/resolution/source-references.ts", "resolveCheckerTransformedSourceType", "host.structuralTypes.resolveType", "selectedType", "authored checker-transformed alias construction"],
  ["src/analysis/source-evidence/types/resolution/source-references.ts", "resolveStandardSourceTypeTransformation", "host.structuralTypes.resolveType", "selectedType", "authored structural type transformation"],
  ["src/analysis/source-evidence/types/resolution/source-references.ts", "selectCsharpContextualParameterCarrier", "bindCsharpSourceTypeArguments", "scope", "retained contextual callable declaration and selected call"],
  ["src/analysis/source-evidence/types/resolution/source-profiles.ts", "resolveUnionType", "resolveTypeWithState", "member", "actual declared union member"],
  ["src/analysis/source-evidence/types/resolution/source-profiles.ts", "resolveSourceTypeComponentEvidence", "resolveTypeWithState", "component.selectedType", "retained declared Source component without authored syntax"],
  ["src/analysis/source-evidence/types/resolution/source-union-refinement.ts", "selectCsharpAuthoredUnionRefinement", "resolveType", "member", "actual authored union refinement arm"],
  ["src/policy/conversions/union-relations.ts", "select", "input.resolveType", "type", "authored union arm-layout comparison"],
].map(([file, owner, callee, argument, basis, metadataLeaf]) => Object.freeze({ file, owner, callee, argument, basis, metadataLeaf })));

export function effectiveTypeBoundaryFindings(sourceFiles, allowances = declarationConverterAllowances) {
  const source = readArchitectureTypeScript(sourceFiles);
  const ast = source.ast;
  const findings = [];
  const usedAllowances = new Set();
  const buffers = new Map(source.sourceFiles.map(file => [file, Buffer.from(ast.getSourceText(file))]));
  const raw = node => {
    if (node === undefined) return "";
    const buffer = buffers.get(ast.getSourceFile(node));
    if (buffer === undefined) throw new Error("Architecture analysis requires the checked declaration's exact source file.");
    return buffer.subarray(ast.pos(node), ast.end(node)).toString("utf8").trim();
  };
  const checkedTypeNames = new Set(["Type"]);
  const carrierTypeNames = new Set(["TargetTypeRef", "CsharpSourceTypeResolution"]);
  const collectTypeNames = node => {
    if (ast.kindName(node) === "KindImportSpecifier") {
      const match = /^(?:type\s+)?(Type|TargetTypeRef|CsharpSourceTypeResolution)(?:\s+as\s+([\w$]+))?$/u.exec(raw(node));
      if (match !== null) (match[1] === "Type" ? checkedTypeNames : carrierTypeNames).add(match[2] ?? match[1]);
    }
    ast.forEachChild(node, child => { if (child !== undefined) collectTypeNames(child); });
  };
  for (const file of source.sourceFiles) collectTypeNames(file);
  const typeKeyedCarrierText = node => {
    const text = raw(node);
    const maps = [...text.matchAll(/\b(?:WeakMap|Map)\s*<\s*([\w$]+)\s*,/gu)];
    return maps.some(match => checkedTypeNames.has(match[1])) &&
      [...text.matchAll(/\b[\w$]+\b/gu)].some(match => carrierTypeNames.has(match[0]));
  };
  const declaration = node => {
    if (node === undefined || !ast.is.IsIdentifier(node) && !ast.is.IsPropertyAccessExpression(node)) return undefined;
    const checker = source.getSourceFileQueries(ast.getSourceFile(node)).checker;
    let symbol = ast.is.IsIdentifier(node) ? checker.getLexicallyResolvedSymbol(node) : checker.getResolvedSymbolOrNil(node);
    if (symbol === undefined) return undefined;
    if (checker.getSymbolDeclarations(symbol).some(owner => ["KindImportSpecifier", "KindNamespaceImport", "KindImportClause"].includes(ast.kindName(owner)))) {
      symbol = checker.getAliasedSymbol(symbol);
    }
    return symbol === undefined ? undefined : checker.getSymbolValueDeclaration(symbol) ?? checker.getPrimarySymbolDeclaration(symbol);
  };
  const functionFor = (node, seen = new Set()) => {
    if (node === undefined || seen.has(node)) return undefined;
    seen.add(node);
    const selected = declaration(node);
    if (selected === undefined) return undefined;
    if (["KindFunctionDeclaration", "KindMethodDeclaration", "KindFunctionExpression", "KindArrowFunction"].includes(ast.kindName(selected))) return selected;
    if (ast.is.IsVariableDeclaration(selected)) {
      const initializer = ast.as.AsVariableDeclaration(selected)?.Initializer;
      return initializer !== undefined && ["KindArrowFunction", "KindFunctionExpression"].includes(ast.kindName(initializer))
        ? initializer : functionFor(initializer, seen);
    }
    return undefined;
  };
  const calls = new Map();
  const collectCalls = node => {
    if (ast.is.IsCallExpression(node)) {
      const owner = functionFor(ast.as.AsCallExpression(node)?.Expression);
      if (owner !== undefined) {
        const existing = calls.get(owner) ?? [];
        existing.push(node);
        calls.set(owner, existing);
      }
    }
    ast.forEachChild(node, child => { if (child !== undefined) collectCalls(child); });
  };
  for (const file of source.sourceFiles) collectCalls(file);
  const enclosingFunction = node => {
    for (let current = ast.parent(node); current !== undefined; current = ast.parent(current)) {
      if (["KindFunctionDeclaration", "KindMethodDeclaration", "KindArrowFunction", "KindFunctionExpression"].includes(ast.kindName(current))) return current;
    }
    return undefined;
  };
  const outsideEffectiveDomain = (node, subject, seen = new Set()) => {
    const owner = enclosingFunction(node);
    if (owner === undefined || subject === undefined || seen.has(owner)) return false;
    seen.add(owner);
    const body = ast.body(owner);
    const statements = body === undefined || ast.kindName(body) !== "KindBlock" ? [] : ast.statements(body);
    const compact = value => raw(value).replace(/\s+/gu, "");
    const effectiveNames = new Map(statements.flatMap(statement => {
      if (ast.kindName(statement) !== "KindVariableStatement") return [];
      const text = compact(statement);
      const match = /^const([\w$]+)=resolveCsharpSourceEffectiveType\(scope,([\w$]+),(?:state|\{depth:0\})\);$/u.exec(text);
      return match === null ? [] : [[match[1], match[2]]];
    }));
    for (const statement of statements) {
      if (ast.pos(statement) >= ast.pos(node)) break;
      if (!ast.is.IsIfStatement(statement)) continue;
      const branch = ast.as.AsIfStatement(statement);
      const condition = compact(branch?.Expression);
      const direct = /^(?:scope\.)?host\.effectiveTypes\.get\(([\w$]+)\)!==undefined$/u.exec(condition);
      if (direct?.[1] !== subject && ![...effectiveNames].some(([name, selected]) => selected === subject && condition === `${name}!==undefined`)) continue;
      const then = branch?.ThenStatement;
      const terminal = then !== undefined && ast.kindName(then) === "KindBlock" ? ast.statements(then).at(-1) : then;
      if (terminal !== undefined && ast.kindName(terminal) === "KindReturnStatement" && ast.pos(node) > ast.end(statement)) return true;
    }
    const callers = calls.get(owner) ?? [];
    const parameter = ast.parameters(owner).findIndex(parameter => raw(ast.name(parameter)) === subject);
    return parameter >= 0 && callers.length > 0 && callers.every(call =>
      outsideEffectiveDomain(call, raw(ast.arguments(call)[parameter]), new Set(seen)));
  };
  for (const file of source.sourceFiles) {
    const path = ast.getFileName(file).slice("/architecture/".length);
    const text = sourceFiles.get(path);
    if (text === undefined) continue;
    const privateResolver = resolverOwners.test(path) || shapeOwners.test(path);
    const add = (node, rule) => findings.push({ file: path, line: text.slice(0, ast.pos(node)).split("\n").length, rule });
    const member = node => ast.is.IsPropertyAccessExpression(node) ? ast.as.AsPropertyAccessExpression(node) : undefined;
    const name = node => ast.is.IsIdentifier(node) ? ast.text(node) : ast.is.IsPropertyAccessExpression(node) ? ast.text(ast.name(node)) : undefined;
    const unwrap = node => {
      while (node !== undefined && transparentKinds.has(ast.kindName(node))) node = node.Expression;
      return node;
    };
    const initializers = node => {
      const selected = declaration(node);
      if (selected === undefined) return [];
      if (ast.is.IsVariableDeclaration(selected)) return [ast.as.AsVariableDeclaration(selected)?.Initializer];
      if (ast.kindName(selected) === "KindBindingElement") {
        const pattern = ast.parent(selected);
        const owner = pattern === undefined ? undefined : ast.parent(pattern);
        const input = owner !== undefined && ast.is.IsVariableDeclaration(owner) ? ast.as.AsVariableDeclaration(owner)?.Initializer : undefined;
        const key = selected.PropertyName ?? ast.name(selected);
        return [{ bindingOrigin: input, bindingKey: key === undefined ? undefined : ast.text(key) }];
      }
      return [];
    };
    const converterCallee = (node, seen = new Set()) => {
      node = unwrap(node);
      if (node === undefined || seen.has(node)) return node;
      seen.add(node);
      if (ast.is.IsIdentifier(node)) {
        const inputs = initializers(node).filter(input => input !== undefined && !("bindingOrigin" in input));
        if (inputs.length === 1) return converterCallee(inputs[0], seen);
      }
      return node;
    };
    const isValue = (node, seen = new Set(), metadataLeaf) => {
      node = unwrap(node);
      if (node === undefined || seen.has(node)) return false;
      if (metadataLeaf !== undefined && raw(node) === metadataLeaf) return false;
      seen.add(node);
      if (ast.is.IsCallExpression(node)) {
        const callee = ast.as.AsCallExpression(node)?.Expression;
        if (valueQueries.has(name(callee))) return !outsideEffectiveDomain(node, raw(ast.arguments(node)[0]));
        const owner = functionFor(callee);
        if (owner !== undefined) {
          const body = ast.body(owner);
          let returned = false;
          const visitReturn = child => {
            if (child !== body && ["KindFunctionDeclaration", "KindFunctionExpression", "KindArrowFunction", "KindMethodDeclaration"].includes(ast.kindName(child))) return;
            if (ast.kindName(child) === "KindReturnStatement" && isValue(ast.as.AsReturnStatement(child)?.Expression, new Set(seen), metadataLeaf)) returned = true;
            ast.forEachChild(child, nested => { if (nested !== undefined) visitReturn(nested); });
          };
          if (body !== undefined) {
            if (ast.kindName(body) === "KindBlock") visitReturn(body);
            else returned = isValue(body, new Set(seen), metadataLeaf);
          }
          if (returned) return true;
        }
      }
      const property = member(node);
      if (property !== undefined) {
        const key = name(node);
        if (valueFields.has(key)) return true;
        if (key === "type" && /(?:^|\.)(?:argument|receiver)$/u.test(raw(property.Expression))) return true;
        if (isValue(property.Expression, new Set(seen), metadataLeaf)) return true;
      }
      if (ast.is.IsIdentifier(node)) {
        const selected = declaration(node);
        if (selected !== undefined && ast.kindName(selected) === "KindParameter") {
          const owner = ast.parent(selected);
          const index = owner === undefined ? -1 : ast.parameters(owner).indexOf(selected);
          if (index >= 0 && (calls.get(owner) ?? []).some(call => isValue(ast.arguments(call)[index], new Set(seen), metadataLeaf))) return true;
        }
        for (const input of initializers(node)) {
          if (input === undefined) continue;
          if ("bindingOrigin" in input) {
            if (valueFields.has(input.bindingKey) || input.bindingKey === "type" &&
                /(?:^|\.)(?:argument|receiver)$/u.test(raw(input.bindingOrigin))) return true;
            if (isValue(input.bindingOrigin, new Set(seen), metadataLeaf)) return true;
          } else if (isValue(input, new Set(seen), metadataLeaf)) return true;
        }
      }
      let found = false;
      ast.forEachChild(node, child => { if (child !== undefined && isValue(child, new Set(seen), metadataLeaf)) found = true; });
      return found;
    };
    const isTypeKeyedCarrierMap = (node, seen = new Set()) => {
      node = unwrap(node);
      if (node === undefined || seen.has(node)) return false;
      seen.add(node);
      if (typeKeyedCarrierText(node)) return true;
      if (ast.is.IsIdentifier(node) || ast.is.IsPropertyAccessExpression(node)) {
        const selected = declaration(node);
        if (selected !== undefined && typeKeyedCarrierText(ast.typeNode(selected))) return true;
        if (selected !== undefined && ["KindPropertyDeclaration", "KindPropertyAssignment"].includes(ast.kindName(selected)) &&
            isTypeKeyedCarrierMap(selected.Initializer, new Set(seen))) return true;
        return initializers(node).some(input => input !== undefined &&
          !("bindingOrigin" in input) && isTypeKeyedCarrierMap(input, new Set(seen)));
      }
      return false;
    };
    const ownerName = node => {
      for (let current = ast.parent(node); current !== undefined; current = ast.parent(current)) {
        if (["KindFunctionDeclaration", "KindMethodDeclaration", "KindArrowFunction", "KindFunctionExpression"].includes(ast.kindName(current))) {
          const selected = ast.name(current) ?? ast.name(ast.parent(current));
          if (selected !== undefined) return ast.text(selected);
        }
      }
      return "<module>";
    };
    const visit = node => {
      if (ast.is.IsCallExpression(node)) {
        const callee = unwrap(ast.as.AsCallExpression(node)?.Expression);
        const resolvedCallee = converterCallee(callee);
        const property = member(resolvedCallee);
        const selectedName = name(resolvedCallee);
        const args = ast.arguments(node);
        const providerQuery = property !== undefined && /(?:^|\.)(?:providers|relationCatalog)$/u.test(raw(property.Expression));
        const typeLookup = selectedName === "get" && /(?:^|\.)(?:semanticTargetType|semanticType)$/u.test(raw(property?.Expression));
        if (!providerQuery && (converters.has(selectedName) || typeLookup)) {
          const allowed = allowances.find(row => row.file === path && row.owner === ownerName(node) &&
            row.callee === raw(callee) && row.argument === raw(args[0]));
          if (allowed !== undefined) usedAllowances.add(allowed);
          if (args.some(argument => isValue(argument, new Set(), argument === args[0] ? allowed?.metadataLeaf : undefined))) add(node, "value-type-reaches-converter");
          if (!resolverOwners.test(path) && !shapeOwners.test(path)) {
            if (allowed === undefined) add(node, "unclassified-type-only-converter");
          }
        }
        if (selectedName === "get" && (isTypeKeyedCarrierMap(property?.Expression) &&
            (!privateResolver || args.some(argument => isValue(argument))) ||
            /(?:^|\.)inputs\.types$/u.test(raw(property?.Expression)))) add(node, "type-keyed-value-result");
      }
      if (["KindVariableDeclaration", "KindPropertyDeclaration", "KindPropertySignature"].includes(ast.kindName(node))) {
        const initializer = ast.as.AsVariableDeclaration(node)?.Initializer;
        if (!privateResolver && (initializer !== undefined && isTypeKeyedCarrierMap(initializer) ||
            typeKeyedCarrierText(ast.typeNode(node)))) add(node, "type-keyed-carrier-map");
      }
      if (/^host\/source-semantics\/local-type-flow\//u.test(path) && ast.is.IsImportDeclaration(node)) {
        const specifier = ast.as.AsImportDeclaration(node)?.ModuleSpecifier;
        if (specifier !== undefined && /(?:target-analysis|source-storage|tsonic-csharp|tsonic-rust|providers\/native)/u.test(ast.text(specifier))) {
          add(node, "host-solver-imports-target-or-storage");
        }
      }
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    visit(file);
  }
  for (const row of allowances) {
    if (sourceFiles.has(row.file) && !usedAllowances.has(row)) findings.push({ file: row.file, line: 1, rule: "stale-declaration-converter-allowance" });
  }
  return findings;
}
