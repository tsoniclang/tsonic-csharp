import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { compileCsharpSource, checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpBindingPatterns, isCsharpUnusedTupleDefault } from "../../../dist/analysis/control-flow/binding-patterns.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { csharpJsSetTargetType } from "../../../dist/target-model/types/carriers/js.js";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/relations/resolver.js";

const arrayMessage = "Array destructuring requires a finalized provider array or tuple runtime-carrier fact for the source expression. Runtime carrier fact is missing for the array destructuring source expression.";

function publishedProgram(sourceText, surface) {
  const compiled = compileCsharpSource({ sourceText, surface });
  assert.equal(compiled.sourceDiagnosticsText, "", "the source checks without diagnostics");
  assert.equal(compiled.result.program !== undefined, true, `the analysis publishes a program: ${compiled.result.diagnostics.map(({ code, message }) => `${code}: ${message}`).join("; ")}`);
  return { program: compiled.result.program, source: createTargetSourceProgram(compiled.source), target: compiled.target };
}

function factsInput(program, source, target) {
  return {
    ast: program.source.ast,
    semanticsFor: source.semantics.forNode,
    sourceFiles: program.sourceFiles,
    participation: program.records.nativeParticipation,
    evidence: program.records,
    operations: program.records,
    valueReads: program.records,
    objectShapes: program.objectShapes,
    storage: program.records,
    typePolicy: { resolveType: () => assert.fail("These array and object-shape fixtures require no source-owned member resolution.") },
    conversionPolicy: {
      target,
      typeDefinitions: program.typeDefinitions,
      objectShapes: program.objectShapes,
      providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
      projectTypes: { directSupertypes: type => {
        const heritage = program.projectTypes.heritageForTarget(type);
        return heritage === undefined ? undefined : heritage.baseType === undefined
          ? heritage.interfaces : [heritage.baseType, ...heritage.interfaces];
      } },
    },
  };
}

function sourceText(program, node) {
  const ast = program.source.ast;
  return String(ast.getSourceText(ast.getSourceFile(node))).slice(ast.pos(node), ast.end(node)).trim().replace(/\s+/g, " ");
}

function findNode(program, kindName, text) {
  const ast = program.source.ast;
  let found;
  const visit = (node) => {
    if (found === undefined && ast.kindName(node) === kindName && sourceText(program, node) === text) found = node;
    ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
  };
  for (const sourceFile of program.sourceFiles) {
    if (String(ast.getPath(sourceFile)).endsWith("/index.ts")) visit(sourceFile);
  }
  assert.equal(found !== undefined, true, `the program has a ${kindName} with text ${text}`);
  return found;
}

const float64Key = targetTypeRefKey(csharpSourcePrimitiveTargetType("float64"));

test("binding facts and tuple defaults are computed once for declaration, parameter, assignment and for-of patterns", () => {
  const { program, source, target } = publishedProgram(`
    export function run(pair: [number, number], optional: [number, number?], rows: [number, number][]): number {
      const [first = 1] = pair;
      const [, second = 3] = optional;
      let third = 0;
      [third] = pair;
      let total = first + second + third;
      for (const [left, right] of rows) total += left + right;
      return total;
    }
    export function parameter([head, tail]: [number, number]): number { return head + tail; }
  `, "native");
  const analysis = analyzeCsharpBindingPatterns(factsInput(program, source, target));
  const projection = analysis.bindingPatternProjection;
  const ast = program.source.ast;
  assert.equal(Object.isFrozen(analysis) && Object.isFrozen(analysis.candidates), true, "the analysis result is frozen");
  assert.equal(analysis.candidates.length === 0, true, "every pattern of the program has its facts and no candidate issue");
  assert.equal(Object.hasOwn(program.records, "bindingPatternProjection"), true, "the final admitted facts use the canonical record family");

  const declared = findNode(program, "KindArrayBindingPattern", "[first = 1]");
  assert.equal(projection.get(declared)?.source?.kind === "array-source" &&
    projection.get(declared).source.bindingCarrier.kind === "tuple", true, "the declaration pattern reads a tuple source");
  const unusedElement = findNode(program, "KindBindingElement", "first = 1");
  const unused = projection.get(unusedElement)?.element;
  assert.equal(unused?.kind === "array-element" && unused.index === 0 && unused.tupleDefault?.kind === "unused", true,
    "a non-nullable tuple element records an unused default");
  const unusedDefault = ast.as.AsBindingElement(unusedElement).Initializer;
  assert.equal(isCsharpUnusedTupleDefault(ast, projection, unusedDefault), true, "the unused default is answered from the facts");

  const plannedElement = findNode(program, "KindBindingElement", "second = 3");
  const planned = projection.get(plannedElement)?.element;
  assert.equal(planned?.kind === "array-element" && planned.index === 1 && planned.tupleDefault?.kind === "planned" &&
    targetTypeRefKey(planned.tupleDefault.carrier) === float64Key && Object.isFrozen(planned.tupleDefault), true,
  "an optional tuple element records a planned default at its value carrier");
  const plannedDefault = ast.as.AsBindingElement(plannedElement).Initializer;
  assert.equal(isCsharpUnusedTupleDefault(ast, projection, plannedDefault), false, "a planned default is not unused");

  const assignment = findNode(program, "KindBinaryExpression", "[third] = pair");
  const assigned = findNode(program, "KindArrayLiteralExpression", "[third]");
  assert.equal(projection.get(assignment)?.assignmentPattern?.kind === "array" &&
    projection.get(assignment).assignmentPattern.sourceNode === assigned, true, "the assignment records its pattern once");
  assert.equal(projection.get(assigned)?.source?.kind === "array-source", true, "the assignment pattern reads a tuple source");

  const loop = findNode(program, "KindArrayBindingPattern", "[left, right]");
  assert.equal(projection.get(loop)?.source?.kind === "array-source", true, "the for-of head pattern reads its element source");
  const right = projection.get(findNode(program, "KindBindingElement", "right"))?.element;
  assert.equal(right?.kind === "array-element" && right.index === 1 && targetTypeRefKey(right.elementCarrier) === float64Key, true,
    "a for-of head element records its element carrier");

  const parameter = findNode(program, "KindArrayBindingPattern", "[head, tail]");
  assert.equal(projection.get(parameter)?.source?.kind === "array-source", true, "a parameter pattern of a planned function has facts");
});

test("an unsupported pattern stays a candidate issue with its pattern root and nothing is rejected", () => {
  const sourceText = `
    export function example(): number { const [value] = new Set([1]); return value; }
  `;
  const checked = checkCsharpSource({ sourceText, surface: "js" });
  assert.equal(checked.sourceDiagnosticsText, "", "the original unsupported pattern remains source-valid");
  const source = createTargetSourceProgram(checked.source);
  const program = { source, sourceFiles: source.navigation.sourceFiles };
  const declaration = findNode(program, "KindVariableDeclaration", "[value] = new Set([1])");
  const pattern = findNode(program, "KindArrayBindingPattern", "[value]");
  const initializer = source.ast.as.AsVariableDeclaration(declaration).Initializer;
  const carrier = csharpJsSetTargetType(csharpSourcePrimitiveTargetType("float64"));
  const analysis = analyzeCsharpBindingPatterns({ ast: source.ast, semanticsFor: source.semantics.forNode,
    sourceFiles: program.sourceFiles, participation: { get: () => "body" },
    evidence: { compileTimeMetadata: { get: () => false } },
    operations: { nativeUnreachable: { get: () => false } },
    valueReads: { valueRead: { get: node => node === initializer ? { value: carrier } : undefined } },
    objectShapes: { resolveNode: () => undefined },
    storage: { storageType: { get: () => assert.fail("The unsupported source is refused before destination storage is queried.") } },
    typePolicy: { resolveType: () => assert.fail("The unsupported array source has no source-owned member resolution.") },
    conversionPolicy: {
      target: checked.target,
      objectShapes: { resolveTarget: () => undefined },
      providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
      projectTypes: { directSupertypes: () => undefined },
    } });
  assert.equal(analysis.candidates.length === 1, true, "one candidate issue");
  const [candidate] = analysis.candidates;
  assert.equal(candidate.node === pattern && candidate.root === declaration, true, "the candidate names its pattern and its declaration root");
  assert.equal(candidate.code === "CSHARP_UNSUPPORTED_AST" && candidate.message === arrayMessage && candidate.evidence.length === 0, true,
    "the candidate keeps the existing code and message");
  assert.equal(analysis.bindingPatternProjection.get(pattern) === undefined, true, "the unsupported pattern has no facts");
  const compiled = compileCsharpSource({ sourceText, surface: "js" });
  const errors = compiled.targetDiagnostics.filter(diagnostic => diagnostic.category === "error");
  assert.equal(errors.length === 1 && errors[0].code === candidate.code && errors[0].message === candidate.message, true,
    "actual demand admission rejects at the same owner before conversions and publication");
  assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
    "the admitted source refusal never publishes a partially sealed program");
});

test("binding traversal consumes final participation and skips the complete unused-default subtree", () => {
  const { program, source, target } = publishedProgram(`
    export function run(pair: [number, number]): number {
      function unused(): number { const [hidden] = pair; return hidden; }
      (() => { const [discarded] = pair; return discarded; });
      const [present = (() => { const [defaulted] = pair; return defaulted; })()] = pair;
      return present;
    }
  `, "native");
  const projection = analyzeCsharpBindingPatterns(factsInput(program, source, target)).bindingPatternProjection;
  for (const name of ["hidden", "discarded", "defaulted"]) {
    const pattern = findNode(program, "KindArrayBindingPattern", `[${name}]`);
    assert.equal(projection.get(pattern) === undefined, true, `${name}: no facts for an erased or unused root`);
  }
  const selected = findNode(program, "KindBindingElement", "present = (() => { const [defaulted] = pair; return defaulted; })()");
  const fact = projection.get(selected);
  assert.equal(fact?.element?.tupleDefault?.kind, "unused", "binding-patterns:135: fact?.element?.tupleDefault?.kind");
  assert.equal(Object.isFrozen(fact) && Object.isFrozen(fact.element) && projection.get(selected) === fact, true,
    "final lookup retains immutable identity");
  let reads = 0;
  const foreign = Object.defineProperty({}, "kind", { get() { reads += 1; throw Error("foreign syntax read"); } });
  assert.equal(projection.get(foreign) === undefined, true, "the sealed lookup does not inspect foreign syntax");
  assert.equal(reads, 0, "binding-patterns:141: reads");
});

test("object and tuple rest facts preserve finalized member identities and nested projections", () => {
  const { program, source, target } = publishedProgram(`
    export interface Pair { first: number; second: number; }
    export function run(source: Pair, nested: [[number, number], number]): number {
      const { first, ...rest } = source;
      const [[head], ...tail] = nested;
      return first + rest.second + head + tail[0];
    }
  `, "native");
  const analysis = analyzeCsharpBindingPatterns(factsInput(program, source, target));
  assert.equal(analysis.candidates.length, 0, "all finalized rest contracts are admitted as facts");
  const rest = analysis.bindingPatternProjection.get(findNode(program, "KindBindingElement", "...rest"))?.element;
  assert.equal(rest?.kind === "object-shape-rest" && rest.members.length === 1 && rest.members[0].source.sourceName === "second" &&
    rest.members[0].rest.sourceName === "second", true, "rest uses exact source and destination members");
  const tail = analysis.bindingPatternProjection.get(findNode(program, "KindBindingElement", "...tail"))?.element;
  assert.equal(tail?.kind === "tuple-rest" && tail.start === 1 && tail.restCarrier.elements.length === 1, true, "binding-patterns:159: tail?.kind === \"tuple-rest\" && tail.start === 1 && tail.restCarrier.elements.length === 1");
  const head = analysis.bindingPatternProjection.get(findNode(program, "KindBindingElement", "head"))?.element;
  assert.equal(head?.kind === "array-element" && head.index === 0, true, "nested tuple projection uses its produced carrier");
});

test("missing loop-head evidence keeps the actual for-of root private until demand admission", () => {
  const { program, source, target } = publishedProgram(`
    export function run(rows: [number, number][]): number {
      let total = 0;
      for (const [left, right] of rows) total += left + right;
      return total;
    }
  `, "native");
  const input = factsInput(program, source, target);
  const head = findNode(program, "KindVariableDeclaration", "[left, right]");
  const loop = findNode(program, "KindForOfStatement", "for (const [left, right] of rows) total += left + right;");
  const analysis = analyzeCsharpBindingPatterns({ ...input,
    valueReads: { valueRead: { get: node => node === head ? undefined : input.valueReads.valueRead.get(node) } } });
  assert.equal(analysis.candidates.length, 1, "binding-patterns:177: analysis.candidates.length");
  assert.equal(analysis.candidates[0].root === loop && Object.isFrozen(analysis.candidates[0]) &&
    Object.isFrozen(analysis.candidates[0].evidence), true, "loop-root candidate is precise and private");
  assert.equal(Object.hasOwn(analysis, "issues"), false, "candidate issues are not globally aggregated");
});
