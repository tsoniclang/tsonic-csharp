import assert from "node:assert/strict";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";
import { assertCsharpCheckingSucceeded, compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpTargetProgram } from "../../../dist/analysis/program/index.js";
import { analyzeCsharpBindingPatterns } from "../../../dist/analysis/control-flow/binding-patterns.js";
import { compileCsharpTarget } from "../../../dist/backend/compile.js";

function analyze(sourceText, surface = "native") {
  let source;
  let result;
  const compiled = compileCsharpSource({ sourceText, surface, compileTarget: (request, observer) => {
    source = request.input.source;
    result = analyzeCsharpTargetProgram(request);
    return compileCsharpTarget(request, observer);
  } });
  assertCsharpCheckingSucceeded(compiled);
  const nodes = [];
  const visit = node => { nodes.push(node); source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  for (const file of source.navigation.sourceFiles) visit(file);
  return { source, result, compiled, nodes, ast: source.ast };
}

function ofKind(value, kindName) {
  return value.nodes.filter(node => value.ast.kindName(node) === kindName);
}

const plannedOwnerKinds = ["KindFunctionDeclaration", "KindMethodDeclaration", "KindMethodSignature", "KindTypeAliasDeclaration"];

function patternProjectionLabels(value) {
  return [...ofKind(value, "KindObjectBindingPattern"), ...ofKind(value, "KindArrayBindingPattern")].map(pattern => {
    let owner = value.ast.parent(pattern);
    while (owner !== undefined && !plannedOwnerKinds.includes(value.ast.kindName(owner))) owner = value.ast.parent(owner);
    const name = owner === undefined ? undefined : value.ast.name(owner);
    const label = owner === undefined ? "none" : `${value.ast.kindName(owner)}:${name === undefined ? "" : value.ast.text(name)}`;
    return `${label}:${value.result.value.records.bindingPatternProjection.get(pattern) !== undefined}`;
  }).sort();
}

const arrayMessage = "Array destructuring requires a finalized provider array or tuple runtime-carrier fact for the source expression. Runtime carrier fact is missing for the array destructuring source expression.";
const objectSourceMessage = "Object destructuring requires an exact source-owned declaration or target object-shape policy.";

function rejectedBeforePublication(sourceText, surface, expected) {
  const value = analyze(sourceText, surface);
  assert.equal(value.result.kind, "rejected", "the binding owner rejects before the program is published");
  assert.deepEqual(value.result.diagnostics.map(diagnostic => `${diagnostic.code}:${diagnostic.message}`), expected.map(message => `CSHARP_UNSUPPORTED_AST:${message}`));
  assert.deepEqual(value.result.diagnostics.map(diagnostic => diagnostic.sourceNode !== undefined), expected.map(() => true), "each rejection keeps its source node");
  assert.equal(value.compiled.result.program === undefined, true, "no program is published");
  assert.deepEqual(value.compiled.result.diagnostics.map(diagnostic => diagnostic.message), expected, "compilation reports the same diagnostics");
  assert.equal(value.compiled.artifacts.size, 0, "no C# is emitted");
}

for (const surface of ["native", "js"]) {
  test(`${surface} declaration, parameter, loop and nested binding patterns publish sealed projections`, () => {
    const value = analyze(`
      interface Point { x: number; y: number; w: boolean }
      interface Holder { inner: Point }
      class Owned { a = 1; b = 2; }
      export function read(p: Point, t: [number, number, number], ps: Point[], h: Holder): number {
        const [a, b] = [1, 2];
        const [first, ...tail] = t;
        const { x, ...rest } = p;
        const { inner: { y } } = h;
        const { a: ownedA } = new Owned();
        let sum = a + b + first + tail[0] + x + rest.y + y + ownedA;
        for (const { x: px } of ps) sum += px;
        return sum;
      }
      export function parameter({ x }: Point, [left]: [number, boolean]): number { return x + left; }
    `, surface);
    assert.equal(value.result.kind, "resolved", value.result.kind === "rejected" ? value.result.diagnostics.map(d => d.message).join("\n") : "");
    const records = value.result.value.records;
    const sources = [...ofKind(value, "KindArrayBindingPattern"), ...ofKind(value, "KindObjectBindingPattern")]
      .map(node => records.bindingPatternProjection.get(node)?.source?.kind);
    assert.equal(sources.every(kind => kind !== undefined), true, "every planned pattern has a sealed source");
    assert.deepEqual(sources.filter(kind => kind === "array-source").length, 3, "array, tuple and parameter tuple patterns");
    assert.equal(sources.includes("object-shape-source"), true);
    assert.equal(sources.includes("source-owned-source") || sources.filter(kind => kind === "object-shape-source").length === 6, true,
      "source-owned or shape-backed object sources are both sealed data");
    const elements = ofKind(value, "KindBindingElement").map(node => records.bindingPatternProjection.get(node)?.element);
    assert.equal(elements.every(element => element !== undefined), true, "every planned binding element has a sealed projection");
    const tupleRest = elements.find(element => element.kind === "tuple-rest");
    assert.equal(tupleRest?.restCarrier.kind, "tuple");
    assert.equal(tupleRest.restCarrier.elements.length, 2);
    const objectRest = elements.find(element => element.kind === "object-shape-rest");
    assert.deepEqual(objectRest?.members.map(member => member.rest.sourceName).sort(), ["w", "y"]);
    for (const member of objectRest.members) {
      assert.equal(member.rest.sourceName, member.source.sourceName, "rest members pair with their exact source members");
      assert.equal(isDeepStrictEqual(member.rest.type, member.source.type), true, `rest member ${member.rest.sourceName} keeps its source carrier`);
    }
    for (const node of [...ofKind(value, "KindBindingElement"), ...ofKind(value, "KindArrayBindingPattern")]) {
      const fact = records.bindingPatternProjection.get(node);
      assert.equal(Object.isFrozen(fact), true, `${value.ast.kindName(node)} projection is frozen`);
      assert.equal(records.bindingPatternProjection.get(node) === fact, true, `${value.ast.kindName(node)} lookup keeps decision identity`);
    }
    assert.equal(records.bindingPatternProjection.get({}) === undefined, true, "a foreign node has no projection");
    assertCsharpCompilationSucceeded(compileCsharpSource({ surface, sourceText: `
      interface Point { x: number; y: number }
      export function read(p: Point): number { const { x, ...rest } = p; return x + rest.y; }
    ` }));
  });

  test(`${surface} only patterns the planner consumes receive projections`, () => {
    const value = analyze(`
      export type Callback = ({ a }: { a: number }) => number;
      export function overload({ a }: { a: number }): number;
      export function overload(o: { a: number }): number { return o.a; }
      export abstract class Base { abstract m({ a }: { a: number }): number; }
      export function done(): number { function unused(): number { const [a] = [1]; return a; } return 1; }
    `, surface);
    assert.equal(value.result.kind, "resolved");
    assert.deepEqual(patternProjectionLabels(value), [
      "KindFunctionDeclaration:overload:false",
      "KindFunctionDeclaration:unused:false",
      "KindMethodDeclaration:m:true",
      "KindTypeAliasDeclaration:Callback:false",
    ], "type positions, overload signatures and unused local functions are not planned; abstract methods are");
    assertCsharpCompilationSucceeded(value.compiled);
  });

  test(`${surface} patterns whose source never completes are not planned and stay accepted`, () => {
    const value = analyze(`
      function fail(): never { throw new Error("x"); }
      export function f(): number { const { a } = fail(); return a; }
    `, surface);
    assert.equal(value.result.kind, "resolved");
    assert.deepEqual(patternProjectionLabels(value), ["KindFunctionDeclaration:f:false"]);
    assertCsharpCompilationSucceeded(value.compiled);
  });

  test(`${surface} interface method patterns are planned and keep the interface diagnostic`, () => {
    const value = analyze(`
      export interface Q { m({ a }: { a: number }): number; n?({ b }: { b: number }): number }
      export function g(): number { return 1; }
    `, surface);
    assert.equal(value.result.kind, "resolved");
    assert.deepEqual(patternProjectionLabels(value), ["KindMethodSignature:m:true", "KindMethodSignature:n:false"],
      "required interface methods are planned; optional interface methods are not");
    assert.deepEqual(value.compiled.result.diagnostics.map(diagnostic => diagnostic.message), ["Interface methods cannot publish destructuring parameter preludes."]);
  });
}

test("js array and object destructuring rejections move to the binding owner with their exact diagnostics", () => {
  rejectedBeforePublication(`export function f(): number { const [a, b] = new Set([1, 2]); return a + b; }`, "js", [arrayMessage]);
  rejectedBeforePublication(`export function f(xs: Set<number>[]): number { const [[a]] = xs; return a; }`, "js", [arrayMessage]);
  rejectedBeforePublication(`export const [a] = new Set([1]); export function f(): number { return a; }`, "js", [arrayMessage]);
  rejectedBeforePublication(`export function f(r: Record<string, number>, key: string): number { const { [key]: v } = r; return v; }`, "js", [objectSourceMessage]);
  rejectedBeforePublication(`export function f(xs: number[]): number { const { length } = xs; return length; }`, "js", [objectSourceMessage]);
});

for (const surface of ["native", "js"]) {
  test(`${surface} numeric property names keep both object-shape diagnostics at their source nodes`, () => {
    rejectedBeforePublication(`export function f(p: { 0: number; 1: string }): number { const { 0: first } = p; return first; }`, surface, [
      "Object destructuring from object-shape facts supports only identifier or string-literal property names.",
      "Object destructuring property must match a finalized provider object-shape member.",
    ]);
  });

  test(`${surface} unreachable destructuring is not planned and stays accepted`, () => {
    const sourceText = surface === "js"
      ? `export function f(): number { return 1; const [a, b] = new Set([1, 2]); }`
      : `export function f(xs: number[]): number { return 1; const { length } = xs as unknown as Record<string, number>; }`;
    const value = analyze(sourceText, surface);
    assert.equal(value.result.kind, "resolved");
    assertCsharpCompilationSucceeded(value.compiled);
  });
}

test("js destructuring in unused local functions is not planned and stays accepted", () => {
  const value = analyze(`export function f(): number {
    function g(): number { const [a] = new Set([1]); return a; }
    function h([b]: Set<number>): number { return b; }
    return 1;
  }`, "js");
  assert.equal(value.result.kind, "resolved");
  assertCsharpCompilationSucceeded(value.compiled);
});

function sealedInputs(sourceText, surface = "native") {
  const value = analyze(sourceText, surface);
  assert.equal(value.result.kind, "resolved");
  const program = value.result.value;
  return {
    value,
    program,
    input: (objectShapes = program.objectShapes, overrides = {}) => ({
      ast: value.ast,
      sourceFiles: value.source.navigation.sourceFiles,
      navigation: value.source.navigation,
      captureClosure: program.records.captureClosure,
      evidence: {
        compileTimeMetadata: program.records.compileTimeMetadata,
        sourceOwnedProjectShape: overrides.sourceOwnedProjectShape ?? program.records.sourceOwnedProjectShape,
        nodeTargetType: program.records.nodeTargetType,
      },
      operations: { nativeUnreachable: program.records.nativeUnreachable },
      valueReads: overrides.valueReads ?? { valueRead: program.records.valueRead },
      objectShapes,
    }),
  };
}

function messages(classifications) {
  return classifications.issues.map(issue => issue.message);
}

test("object-shape member and rest decisions are made once by the binding owner", () => {
  const sealed = sealedInputs(`
    interface Point { a: number; b: number }
    export function f(p: Point): number { const { a, ...rest } = p; return a + rest.b; }
  `);
  const initializer = sealed.value.nodes.find(node => sealed.value.ast.kindName(node) === "KindIdentifier" &&
    sealed.value.ast.text(node) === "p" && sealed.value.ast.kindName(sealed.value.ast.parent(node)) === "KindVariableDeclaration");
  const rest = sealed.value.nodes.find(node => sealed.value.ast.kindName(node) === "KindIdentifier" && sealed.value.ast.text(node) === "rest" &&
    sealed.value.ast.kindName(sealed.value.ast.parent(node)) === "KindBindingElement");
  const shapes = sealed.program.objectShapes;
  const sourceShape = shapes.resolveNode(initializer);
  assert.equal(sourceShape !== undefined, true, "the source has an object shape");
  const restShape = shapes.resolveCopyShape(shapes.resolveNode(rest));
  const replace = (patch) => ({ ...shapes, resolveNode: shapes.resolveNode, resolveCopyShape: shapes.resolveCopyShape, ...patch });

  const admitted = analyzeCsharpBindingPatterns(sealed.input());
  assert.deepEqual(messages(admitted), []);

  const missingMember = analyzeCsharpBindingPatterns(sealed.input(replace({
    resolveNode: (node, file) => node === initializer ? { ...sourceShape, members: sourceShape.members.filter(member => member.sourceName !== "a") } : shapes.resolveNode(node, file),
  })));
  assert.equal(messages(missingMember)[0].startsWith("Object destructuring property source member 'a'"), true, messages(missingMember)[0]);

  const missingRest = analyzeCsharpBindingPatterns(sealed.input(replace({ resolveCopyShape: () => undefined })));
  assert.deepEqual(messages(missingRest), ["Object rest destructuring requires finalized provider object-shape facts for the rest binding."]);

  const staleRest = analyzeCsharpBindingPatterns(sealed.input(replace({ resolveCopyShape: () => sourceShape })));
  assert.deepEqual(messages(staleRest), ["Object rest destructuring rest shape must exclude explicitly extracted member 'a'."]);

  const changedCarrier = analyzeCsharpBindingPatterns(sealed.input(replace({
    resolveCopyShape: () => ({ ...restShape, members: restShape.members.map(member => ({ ...member, type: { kind: "source-primitive", name: "boolean" } })) }),
  })));
  assert.deepEqual(messages(changedCarrier), ["Object rest destructuring member 'b' requires matching finalized source and rest member carriers."]);
});

test("source-owned object patterns admit only plain identifier members", () => {
  const sealed = sealedInputs(`
    export function f(v: { a: number; b: number }): number {
      const { a, ...r } = v;
      const { b = 1 } = v;
      const { "a-b": c } = v as unknown as { "a-b": number };
      return a + r.b + b + c;
    }
  `);
  const initializers = new Set(sealed.value.nodes.filter(node => sealed.value.ast.kindName(sealed.value.ast.parent(node) ?? node) === "KindVariableDeclaration" &&
    sealed.value.ast.as.AsVariableDeclaration(sealed.value.ast.parent(node))?.Initializer === node));
  const sourceOwned = analyzeCsharpBindingPatterns(sealed.input(
    { ...sealed.program.objectShapes, resolveNode: () => undefined, resolveCopyShape: () => undefined },
    { sourceOwnedProjectShape: { get: node => initializers.has(node) ? true : undefined } },
  ));
  assert.deepEqual(messages(sourceOwned), [
    "Object rest destructuring requires finalized provider object-spread semantics before C# emission.",
    "Destructuring defaults require finalized undefined/default-value semantics before C# emission.",
    "Object destructuring from source-owned declarations supports only identifier property names until provider object-shape facts supply target member names.",
  ]);
  const unproven = analyzeCsharpBindingPatterns(sealed.input(
    { ...sealed.program.objectShapes, resolveNode: () => undefined, resolveCopyShape: () => undefined },
    { valueReads: { valueRead: { get: () => undefined } } },
  ));
  assert.equal(messages(unproven).filter(message => message.startsWith("Destructuring source expression requires a finalized runtime carrier fact before C# emission.")).length, 3);
  assert.deepEqual(unproven.issues[0].evidence, ["C# type policy found no exact runtime representation."]);
});
