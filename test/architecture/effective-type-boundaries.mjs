import { readArchitectureTypeScript } from "../../../tsonic/test/architecture/tooling/typescript-source.mjs";

const resolverOwners = /^src\/analysis\/source-evidence\/types\/resolution\/(?:semantic-types|scope|engine|model|query-cache)\.ts$/u;
const shapeOwners = /^src\/analysis\/objects\/shapes\//u;
const converters = new Map([["resolveType", 0], ["resolveTypeWithState", 0], ["bindCsharpSourceTypeArguments", 1],
  ["resolveSemanticTypeArguments", 1], ["deriveMembers", 0]]);
const valueQueries = new Set(["expressionType", "declaredValueType", "typeOfSymbol", "declaredSymbolType", "writeSymbolType", "selectValueTypeRefinement"]);
const valueFields = new Set(["sourceReadType", "sourceWriteType", "sourceElementType", "sourceResultType", "selectedSignature", "sourceSelectedMethodTypeArguments", "sourceSelectedSignatureParameters"]);
const transparentKinds = new Set(["KindParenthesizedExpression", "KindAsExpression", "KindTypeAssertionExpression", "KindNonNullExpression", "KindSatisfiesExpression"]);

export const declarationConverterAllowances = Object.freeze([
  ["src/analysis/control-flow/resource-management.ts", "selectCsharpResourceManagement", "input.types.resolveType", "alternative.sourceType", "pinned disposal signature alternative"],
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
  ["src/analysis/source-evidence/types/resolution/source-references.ts", "selectCsharpContextualParameterCarrier", "bindCsharpSourceTypeArguments", "contextual.component.selectedType", "retained contextual callable declaration and selected call", "contextual.component.selectedType"],
  ["src/analysis/source-evidence/types/resolution/calls.ts", "resolveSourceCallSelectedType", "bindCsharpSourceTypeArguments", "receiver.type", "pinned receiver generic declarations consume the same Host call instantiation", "receiver.type"],
  ["src/analysis/source-evidence/types/resolution/calls.ts", "resolveSourceCallReceiverTargetType", "resolveTypeWithState", "source.sourceResultType", "selected constructor instance declaration only outside the same call's Host publication domain"],
  ["src/analysis/source-evidence/types/resolution/source-profiles.ts", "resolveUnionType", "resolveTypeWithState", "member", "actual declared union member"],
  ["src/analysis/source-evidence/types/resolution/source-profiles.ts", "resolveSourceTypeComponentEvidence", "resolveTypeWithState", "component.selectedType", "retained declared Source component without authored syntax"],
  ["src/analysis/source-evidence/types/resolution/source-union-refinement.ts", "selectCsharpAuthoredUnionRefinement", "resolveType", "member", "actual authored union refinement arm"],
  ["src/policy/conversions/union-relations.ts", "select", "input.resolveType", "type", "authored union arm-layout comparison"],
].map(([file, owner, callee, argument, basis, metadataLeaf]) => Object.freeze({ file, owner, callee, argument, basis, metadataLeaf })));

const checkedSourceInputs = new Map();

function checkedSource(sourceFiles) {
  const key = JSON.stringify([...sourceFiles]);
  let selected = checkedSourceInputs.get(key);
  if (selected === undefined) {
    selected = readArchitectureTypeScript(sourceFiles);
    checkedSourceInputs.set(key, selected);
  }
  return selected;
}

export function effectiveTypeBoundaryFindings(sourceFiles, allowances = declarationConverterAllowances) {
  const source = checkedSource(sourceFiles);
  const ast = source.ast;
  const findings = [];
  const usedAllowances = new Set();
  const buffers = new Map(source.sourceFiles.map(file => [file, Buffer.from(ast.getSourceText(file))]));
  const rawTexts = new WeakMap();
  const raw = node => {
    if (node === undefined) return "";
    const existing = rawTexts.get(node);
    if (existing !== undefined) return existing;
    const buffer = buffers.get(ast.getSourceFile(node));
    if (buffer === undefined) throw new Error("Architecture analysis requires the checked declaration's exact source file.");
    const text = buffer.subarray(ast.pos(node), ast.end(node)).toString("utf8").trim();
    rawTexts.set(node, text);
    return text;
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
  const carrierTexts = new WeakMap();
  const typeKeyedCarrierText = node => {
    if (node === undefined) return false;
    if (carrierTexts.has(node)) return carrierTexts.get(node);
    const text = raw(node);
    const maps = [...text.matchAll(/\b(?:WeakMap|Map)\s*<\s*([\w$]+)\s*,/gu)];
    const selected = maps.some(match => checkedTypeNames.has(match[1])) &&
      [...text.matchAll(/\b[\w$]+\b/gu)].some(match => carrierTypeNames.has(match[0]));
    carrierTexts.set(node, selected);
    return selected;
  };
  const declarations = new WeakMap();
  const declaration = node => {
    if (node === undefined || !ast.is.IsIdentifier(node) && !ast.is.IsPropertyAccessExpression(node)) return undefined;
    if (declarations.has(node)) return declarations.get(node);
    const checker = source.getSourceFileQueries(ast.getSourceFile(node)).checker;
    let symbol = ast.is.IsIdentifier(node) ? checker.getLexicallyResolvedSymbol(node) : checker.getResolvedSymbolOrNil(node);
    if (symbol === undefined) {
      declarations.set(node, undefined);
      return undefined;
    }
    if (checker.getSymbolDeclarations(symbol).some(owner => ["KindImportSpecifier", "KindNamespaceImport", "KindImportClause"].includes(ast.kindName(owner)))) {
      symbol = checker.getAliasedSymbol(symbol);
    }
    const selected = symbol === undefined ? undefined : checker.getSymbolValueDeclaration(symbol) ?? checker.getPrimarySymbolDeclaration(symbol);
    declarations.set(node, selected);
    return selected;
  };
  const functions = new WeakMap();
  const functionFor = (node, seen = new Set()) => {
    if (node === undefined || seen.has(node)) return undefined;
    if (functions.has(node)) return functions.get(node);
    seen.add(node);
    const selected = declaration(node);
    let owner;
    if (selected !== undefined && ["KindFunctionDeclaration", "KindMethodDeclaration", "KindFunctionExpression", "KindArrowFunction"].includes(ast.kindName(selected))) owner = selected;
    else if (selected !== undefined && ast.is.IsVariableDeclaration(selected)) {
      const initializer = ast.as.AsVariableDeclaration(selected)?.Initializer;
      owner = initializer !== undefined && ["KindArrowFunction", "KindFunctionExpression"].includes(ast.kindName(initializer))
        ? initializer : functionFor(initializer, seen);
    }
    functions.set(node, owner);
    return owner;
  };
  const label = node => node !== undefined && (ast.is.IsIdentifier(node) || ast.kindName(node) === "KindStringLiteral" || ast.kindName(node) === "KindNumericLiteral")
    ? ast.text(node) : node !== undefined && ast.is.IsPropertyAccessExpression(node) ? ast.text(ast.name(node)) : undefined;
  const aliases = new Map();
  const addAlias = (original, selected) => {
    if (original === undefined || selected === undefined) return;
    const names = aliases.get(original) ?? new Set();
    names.add(selected);
    aliases.set(original, names);
  };
  const callsByName = new Map();
  const collectCalls = node => {
    if (ast.is.IsCallExpression(node)) {
      const callee = ast.as.AsCallExpression(node)?.Expression;
      if (callee !== undefined && (ast.is.IsIdentifier(callee) || ast.is.IsPropertyAccessExpression(callee))) {
        const name = label(callee);
        const existing = callsByName.get(name) ?? [];
        existing.push(node);
        callsByName.set(name, existing);
      }
    }
    if (ast.is.IsVariableDeclaration(node)) {
      const initializer = ast.as.AsVariableDeclaration(node)?.Initializer;
      addAlias(label(initializer), label(ast.name(node)));
      if (initializer !== undefined && ast.kindName(initializer) === "KindFunctionExpression") addAlias(label(ast.name(initializer)), label(ast.name(node)));
    }
    if (ast.kindName(node) === "KindImportSpecifier") addAlias(label(ast.as.AsImportSpecifier(node)?.PropertyName ?? ast.name(node)), label(ast.name(node)));
    if (ast.kindName(node) === "KindExportSpecifier") addAlias(label(ast.as.AsExportSpecifier(node)?.PropertyName ?? ast.name(node)), label(ast.name(node)));
    if (ast.kindName(node) === "KindImportClause") addAlias("default", label(ast.as.AsImportClause(node)?.name));
    ast.forEachChild(node, child => { if (child !== undefined) collectCalls(child); });
  };
  for (const file of source.sourceFiles) collectCalls(file);
  const callsForOwners = new WeakMap();
  const callsFor = owner => {
    if (callsForOwners.has(owner)) return callsForOwners.get(owner);
    const names = new Set(["default"]);
    const ownerName = label(ast.name(owner) ?? ast.name(ast.parent(owner)));
    if (ownerName !== undefined) names.add(ownerName);
    for (const name of names) for (const alias of aliases.get(name) ?? []) names.add(alias);
    const candidates = ownerName === undefined ? [...callsByName.values()].flat()
      : [...names].flatMap(name => callsByName.get(name) ?? []);
    const callers = new Set();
    for (const call of candidates) {
      if (functionFor(ast.as.AsCallExpression(call)?.Expression) === owner) callers.add(call);
    }
    const selected = [...callers];
    callsForOwners.set(owner, selected);
    return selected;
  };
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
      const match = /^const([\w$]+)=resolveCsharpSourceEffectiveType\(scope,([\w$.]+),(?:state|\{depth:0\})\);$/u.exec(text);
      return match === null ? [] : [[match[1], match[2]]];
    }));
    const guarded = (condition, absent) => condition === `host.effectiveTypes.get(${subject})${absent ? "===" : "!=="}undefined` ||
      condition === `scope.host.effectiveTypes.get(${subject})${absent ? "===" : "!=="}undefined` ||
      [...effectiveNames].some(([name, selected]) => selected === subject && condition === `${name}${absent ? "===" : "!=="}undefined`);
    for (let current = node; current !== owner;) {
      const parent = ast.parent(current);
      if (parent === undefined) break;
      if (ast.is.IsConditionalExpression(parent)) {
        const branch = ast.as.AsConditionalExpression(parent);
        if (branch?.WhenTrue === current && guarded(compact(branch.Condition), true) ||
          branch?.WhenFalse === current && guarded(compact(branch.Condition), false)) return true;
      }
      if (ast.is.IsIfStatement(parent)) {
        const branch = ast.as.AsIfStatement(parent);
        if (branch?.ThenStatement === current && guarded(compact(branch.Expression), true) ||
          branch?.ElseStatement === current && guarded(compact(branch.Expression), false)) return true;
      }
      current = parent;
    }
    for (const statement of statements) {
      if (ast.pos(statement) >= ast.pos(node)) break;
      if (!ast.is.IsIfStatement(statement)) continue;
      const branch = ast.as.AsIfStatement(statement);
      const condition = compact(branch?.Expression);
      if (!guarded(condition, false)) continue;
      const then = branch?.ThenStatement;
      const terminal = then !== undefined && ast.kindName(then) === "KindBlock" ? ast.statements(then).at(-1) : then;
      if (terminal !== undefined && ast.kindName(terminal) === "KindReturnStatement" && ast.pos(node) > ast.end(statement)) return true;
    }
    const callers = callsFor(owner);
    const parameter = ast.parameters(owner).findIndex(parameter => raw(ast.name(parameter)) === subject);
    return parameter >= 0 && callers.length > 0 && callers.every(call =>
      outsideEffectiveDomain(call, raw(ast.arguments(call)[parameter]), new Set(seen)));
  };
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
  const reachability = describe => {
    const records = new Map();
    const pending = [];
    const positive = [];
    const retain = node => {
      node = unwrap(node);
      if (node === undefined) return undefined;
      let record = records.get(node);
      if (record === undefined) {
        record = { node, value: false, dependents: [] };
        records.set(node, record);
        pending.push(record);
      }
      return record;
    };
    return node => {
      const selected = retain(node);
      if (selected === undefined) return false;
      while (pending.length > 0) {
        const current = pending.pop();
        const described = describe(current.node);
        if (described.value && !current.value) {
          current.value = true;
          positive.push(current);
        }
        for (const dependency of described.dependencies) {
          const input = retain(dependency);
          if (input === undefined) continue;
          input.dependents.push(current);
          if (input.value && !current.value) {
            current.value = true;
            positive.push(current);
          }
        }
      }
      while (positive.length > 0) {
        const current = positive.pop();
        for (const dependent of current.dependents) {
          if (dependent.value) continue;
          dependent.value = true;
          positive.push(dependent);
        }
      }
      return selected.value;
    };
  };
  const returnedValues = new WeakMap();
  const returnsFor = owner => {
    if (returnedValues.has(owner)) return returnedValues.get(owner);
    const body = ast.body(owner);
    const values = [];
    const visit = child => {
      if (child !== body && ["KindFunctionDeclaration", "KindFunctionExpression", "KindArrowFunction", "KindMethodDeclaration"].includes(ast.kindName(child))) return;
      if (ast.kindName(child) === "KindReturnStatement") values.push(ast.as.AsReturnStatement(child)?.Expression);
      ast.forEachChild(child, nested => { if (nested !== undefined) visit(nested); });
    };
    if (body !== undefined) {
      if (ast.kindName(body) === "KindBlock") visit(body);
      else values.push(body);
    }
    returnedValues.set(owner, values);
    return values;
  };
  const queryDomains = new WeakMap();
  const queryOutsideDomain = node => {
    if (!queryDomains.has(node)) queryDomains.set(node, outsideEffectiveDomain(node, raw(ast.arguments(node)[0])));
    return queryDomains.get(node);
  };
  const valueFacts = new Map();
  const isValue = (node, metadataLeaf) => {
    let selected = valueFacts.get(metadataLeaf);
    if (selected === undefined) {
      selected = reachability(current => {
        const dependencies = [];
        if (metadataLeaf !== undefined && raw(current) === metadataLeaf) return { value: false, dependencies };
        if (ast.is.IsCallExpression(current)) {
          const callee = ast.as.AsCallExpression(current)?.Expression;
          if (valueQueries.has(name(callee))) return { value: !queryOutsideDomain(current), dependencies };
          const owner = functionFor(callee);
          if (owner !== undefined) dependencies.push(...returnsFor(owner));
        }
        const property = member(current);
        if (property !== undefined) {
          const key = name(current);
          if (valueFields.has(key) || key === "type" && /(?:^|\.)(?:argument|receiver)$/u.test(raw(property.Expression))) {
            return { value: key !== "sourceResultType" || !outsideEffectiveDomain(current, `${raw(property.Expression)}.call`), dependencies };
          }
          dependencies.push(property.Expression);
        }
        if (ast.is.IsIdentifier(current)) {
          const declared = declaration(current);
          if (declared !== undefined && ast.kindName(declared) === "KindParameter") {
            const owner = ast.parent(declared);
            const index = owner === undefined ? -1 : ast.parameters(owner).indexOf(declared);
            if (index >= 0) for (const call of callsFor(owner)) dependencies.push(ast.arguments(call)[index]);
          }
          for (const input of initializers(current)) {
            if (input === undefined) continue;
            if ("bindingOrigin" in input) {
              if (valueFields.has(input.bindingKey) || input.bindingKey === "type" &&
                  /(?:^|\.)(?:argument|receiver)$/u.test(raw(input.bindingOrigin))) return { value: true, dependencies };
              dependencies.push(input.bindingOrigin);
            } else dependencies.push(input);
          }
        }
        ast.forEachChild(current, child => { if (child !== undefined) dependencies.push(child); });
        return { value: false, dependencies };
      });
      valueFacts.set(metadataLeaf, selected);
    }
    return selected(node);
  };
  const isTypeKeyedCarrierMap = reachability(node => {
    const dependencies = [];
    if (typeKeyedCarrierText(node)) return { value: true, dependencies };
    if (ast.is.IsIdentifier(node) || ast.is.IsPropertyAccessExpression(node)) {
      const selected = declaration(node);
      if (selected !== undefined && typeKeyedCarrierText(ast.typeNode(selected))) return { value: true, dependencies };
      if (selected !== undefined && ["KindPropertyDeclaration", "KindPropertyAssignment"].includes(ast.kindName(selected))) dependencies.push(selected.Initializer);
      for (const input of initializers(node)) if (input !== undefined && !("bindingOrigin" in input)) dependencies.push(input);
    }
    return { value: false, dependencies };
  });
  for (const file of source.sourceFiles) {
    const path = ast.getFileName(file).slice("/architecture/".length);
    const text = sourceFiles.get(path);
    if (text === undefined) continue;
    const privateResolver = resolverOwners.test(path) || shapeOwners.test(path);
    const add = (node, rule) => findings.push({ file: path, line: text.slice(0, ast.pos(node)).split("\n").length, rule });
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
          const argument = args[converters.get(selectedName) ?? 0];
          const allowed = allowances.find(row => row.file === path && row.owner === ownerName(node) &&
            row.callee === raw(callee) && row.argument === raw(argument));
          if (allowed !== undefined) usedAllowances.add(allowed);
          if (argument !== undefined && isValue(argument, allowed?.metadataLeaf)) add(node, "value-type-reaches-converter");
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
