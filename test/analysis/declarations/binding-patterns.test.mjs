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

const arrayAssignmentMessage = "Array destructuring assignment requires a finalized provider array or tuple runtime-carrier fact for the source expression. Runtime carrier fact is missing for the array destructuring assignment source expression.";
const objectAssignmentSourceMessage = "Object destructuring assignment requires finalized provider object-shape facts before C# emission.";
const assignmentTargetMessage = "Destructuring assignment target supports source-owned identifiers and nested destructuring patterns only.";
const assignmentRestTargetMessage = "Object rest destructuring assignment requires an identifier assignment target.";

function destructuringAssignments(value) {
  return ofKind(value, "KindBinaryExpression").filter(node => value.result.value.records.binaryOperation.get(node)?.destructuring?.kind === "resolved");
}

for (const surface of ["native", "js"]) {
  test(`${surface} destructuring assignments publish their sealed pattern and projections`, () => {
    const value = analyze(`
      interface Point { x: number; y: number; w: boolean }
      interface Holder { inner: Point; b: number }
      export function assign(p: Point, t: [number, number, number], xs: number[], h: Holder): number {
        let a = 0; let b = 0; let x = 0; let y = 0; let first = 0;
        let tail: [number, number] = [0, 0];
        let rest: { y: number; w: boolean } = { y: 0, w: false };
        [a, b] = [b, a];
        [, b] = xs;
        [first, ...tail] = t;
        ({ x, ...rest } = p);
        ({ inner: { y }, b } = h);
        return a + b + first + tail[0] + x + rest.y + y;
      }
    `, surface);
    assert.equal(value.result.kind, "resolved", value.result.kind === "rejected" ? value.result.diagnostics.map(d => d.message).join("\n") : "");
    const records = value.result.value.records;
    const assignments = destructuringAssignments(value);
    assert.equal(assignments.length, 5);
    assert.deepEqual(assignments.map(node => records.bindingPatternProjection.get(node)?.assignmentPattern?.kind), ["array", "array", "array", "object", "object"]);
    const sources = [...ofKind(value, "KindArrayLiteralExpression"), ...ofKind(value, "KindObjectLiteralExpression")]
      .map(node => records.bindingPatternProjection.get(node)?.source?.kind).filter(kind => kind !== undefined).sort();
    assert.deepEqual(sources, ["array-source", "array-source", "array-source", "object-shape-source", "object-shape-source", "object-shape-source"]);
    const elementKinds = [...ofKind(value, "KindIdentifier"), ...ofKind(value, "KindSpreadElement"), ...ofKind(value, "KindSpreadAssignment"),
      ...ofKind(value, "KindShorthandPropertyAssignment"), ...ofKind(value, "KindPropertyAssignment")]
      .map(node => records.bindingPatternProjection.get(node)?.element?.kind).filter(kind => kind !== undefined).sort();
    assert.deepEqual(elementKinds, ["array-element", "array-element", "array-element", "array-element",
      "object-shape-member", "object-shape-member", "object-shape-member", "object-shape-member", "object-shape-rest", "tuple-rest"]);
    assertCsharpCompilationSucceeded(value.compiled);
  });

  test(`${surface} destructuring assignment target rejections move to the binding owner`, () => {
    rejectedBeforePublication(`export function f(): number { const o = { x: 0 }; [o.x] = [1]; return o.x; }`, surface, [assignmentTargetMessage]);
    rejectedBeforePublication(`export function f(xs: number[][]): number { const o = { x: 0 }; [[o.x]] = xs; return o.x; }`, surface, [assignmentTargetMessage]);
    rejectedBeforePublication(`interface P { x: number } export function f(p: P): number { const o = { v: 0 }; ({ x: o.v } = p); return o.v; }`, surface, [assignmentTargetMessage]);
    rejectedBeforePublication(`interface P { x: number; y: number } export function f(p: P): number { let x = 0; const o = { r: { y: 0 } }; ({ x, ...o.r } = p); return x; }`, surface, [assignmentRestTargetMessage]);
    rejectedBeforePublication(`export function f(r: Record<string, number>, key: string): number { let v = 0; ({ [key]: v } = r); return v; }`, surface, [objectAssignmentSourceMessage]);
    rejectedBeforePublication(`export function f(p: { 0: number }): number { let a = 0; ({ 0: a } = p); return a; }`, surface, [
      "Object destructuring assignment from object-shape facts supports only identifier or string-literal property names.",
      "Object destructuring assignment property must match a finalized provider object-shape member.",
    ]);
  });

  test(`${surface} destructuring assignments whose source never completes are not planned`, () => {
    const value = analyze(`
      function fail(): never { throw new Error("x"); }
      export function f(): number { let a = 0; ({ a } = fail()); return a; }
    `, surface);
    assert.equal(value.result.kind, "resolved");
    const [assignment] = destructuringAssignments(value);
    assert.equal(value.result.value.records.bindingPatternProjection.get(assignment)?.assignmentPattern?.kind, "object");
    assert.equal(ofKind(value, "KindObjectLiteralExpression").every(node => value.result.value.records.bindingPatternProjection.get(node)?.source === undefined), true,
      "the pattern under a never-completing source has no projection");
    assertCsharpCompilationSucceeded(value.compiled);
  });
}

test("js destructuring assignment carrier rejections move to the binding owner", () => {
  rejectedBeforePublication(`export function f(): number { let a = 0; let b = 0; [a, b] = new Set([1, 2]); return a + b; }`, "js", [arrayAssignmentMessage]);
  rejectedBeforePublication(`export function f(xs: Set<number>[]): number { let a = 0; [[a]] = xs; return a; }`, "js", [arrayAssignmentMessage]);
  rejectedBeforePublication(`let a = 0; [a] = new Set([1]); export function f(): number { return a; }`, "js", [arrayAssignmentMessage]);
  rejectedBeforePublication(`export function f(xs: number[]): number { let n = 0; ({ length: n } = xs); return n; }`, "js", [objectAssignmentSourceMessage]);
});

test("js destructuring assignments outside planned code stay accepted", () => {
  for (const sourceText of [
    `export function f(): number { let a = 0; return a; [a] = new Set([1]); }`,
    `export function f(): number { let a = 0; function g(): void { [a] = new Set([1]); } return a; }`,
  ]) {
    const value = analyze(sourceText, "js");
    assert.equal(value.result.kind, "resolved");
    assertCsharpCompilationSucceeded(value.compiled);
  }
});

test("defaulted nested assignment targets belong to their enclosing pattern", () => {
  const value = analyze(`export function f(ys: number[][]): number { let x = 0; [[x] = [1]] = ys; return x; }`, "js");
  assert.equal(value.result.kind, "resolved");
  const records = value.result.value.records;
  const binaries = ofKind(value, "KindBinaryExpression");
  assert.deepEqual(binaries.map(node => records.bindingPatternProjection.get(node)?.assignmentPattern !== undefined), [true, false],
    "only the statement-level assignment publishes an assignment pattern");
  assert.deepEqual(binaries.map(node => records.bindingPatternProjection.get(node)?.element?.kind), [undefined, "array-element"]);
  const nested = ofKind(value, "KindArrayLiteralExpression").filter(node => records.bindingPatternProjection.get(node)?.source !== undefined);
  assert.equal(nested.length, 2, "the outer and the defaulted nested pattern each have one array source");
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
      lambdaCreation: program.records.lambdaCreation,
      evidence: {
        compileTimeMetadata: program.records.compileTimeMetadata,
        sourceOwnedProjectShape: overrides.sourceOwnedProjectShape ?? program.records.sourceOwnedProjectShape,
        nodeTargetType: program.records.nodeTargetType,
      },
      operations: { nativeUnreachable: program.records.nativeUnreachable, binaryOperation: program.records.binaryOperation },
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

test("object-shape assignment member and rest decisions are made once by the binding owner", () => {
  const sealed = sealedInputs(`
    interface Point { a: number; b: number }
    export function f(p: Point): number { let a = 0; let rest: { b: number } = { b: 0 }; ({ a, ...rest } = p); return a + rest.b; }
  `);
  const ast = sealed.value.ast;
  const source = sealed.value.nodes.find(node => ast.kindName(node) === "KindIdentifier" && ast.text(node) === "p" &&
    ast.kindName(ast.parent(node)) === "KindBinaryExpression");
  const rest = sealed.value.nodes.find(node => ast.kindName(node) === "KindIdentifier" && ast.text(node) === "rest" &&
    ast.kindName(ast.parent(node)) === "KindSpreadAssignment");
  const shapes = sealed.program.objectShapes;
  const sourceShape = shapes.resolveNode(source);
  assert.equal(sourceShape !== undefined, true, "the assignment source has an object shape");
  const restShape = shapes.resolveCopyShape(shapes.resolveNode(rest));
  const replace = (patch) => ({ ...shapes, resolveNode: shapes.resolveNode, resolveCopyShape: shapes.resolveCopyShape, ...patch });

  assert.deepEqual(messages(analyzeCsharpBindingPatterns(sealed.input())), []);

  const missingMember = analyzeCsharpBindingPatterns(sealed.input(replace({
    resolveNode: (node, file) => node === source ? { ...sourceShape, members: sourceShape.members.filter(member => member.sourceName !== "a") } : shapes.resolveNode(node, file),
  })));
  assert.equal(messages(missingMember)[0].startsWith("Object destructuring assignment property source member 'a'"), true, messages(missingMember)[0]);

  assert.deepEqual(messages(analyzeCsharpBindingPatterns(sealed.input(replace({ resolveCopyShape: () => undefined })))),
    ["Object rest destructuring assignment requires finalized provider object-shape facts for the rest target."]);
  assert.deepEqual(messages(analyzeCsharpBindingPatterns(sealed.input(replace({ resolveCopyShape: () => sourceShape })))),
    ["Object rest destructuring assignment rest shape must exclude explicitly extracted member 'a'."]);
  assert.deepEqual(messages(analyzeCsharpBindingPatterns(sealed.input(replace({
    resolveCopyShape: () => ({ ...restShape, members: restShape.members.map(member => ({ ...member, type: { kind: "source-primitive", name: "boolean" } })) }),
  })))), ["Object rest destructuring assignment member 'b' requires matching finalized source and rest member carriers."]);

  const unproven = analyzeCsharpBindingPatterns(sealed.input(
    { ...shapes, resolveNode: () => undefined, resolveCopyShape: () => undefined },
    { valueReads: { valueRead: { get: () => undefined } } },
  ));
  assert.deepEqual(messages(unproven), [
    "Destructuring assignment source requires a finalized runtime carrier fact before C# emission. C# runtime representation is not proven by authored source facts, the selected source profile, project declarations, or an exact provider relation.",
    objectAssignmentSourceMessage,
  ]);
  assert.deepEqual(unproven.issues[0].evidence, ["C# type policy found no exact runtime representation."]);
});

test("js destructuring in discarded callables is not planned; invoked, returned and stored callables keep their rejection", () => {
  for (const sourceText of [
    "export function example(): number { (() => { const [value] = new Set([1]); return value; }); return 7; }",
    "export function example(): number { (function () { const [value] = new Set([1]); return value; }); return 7; }",
    "export function example(): number { (([value]: Set<number>) => value); return 7; }",
    "export function example(): number { (() => { (() => { const [value] = new Set([1]); return value; }); return 1; }); return 7; }",
  ]) {
    const value = analyze(sourceText, "js");
    assert.equal(value.result.kind, "resolved");
    assert.equal(ofKind(value, "KindArrayBindingPattern").every(node => value.result.value.records.bindingPatternProjection.get(node) === undefined), true,
      "a discarded callable's patterns have no projection");
    assertCsharpCompilationSucceeded(value.compiled);
  }
  for (const sourceText of [
    "export function example(): number { return (() => { const [value] = new Set([1]); return value; })(); }",
    "export function example(): () => number { return () => { const [value] = new Set([1]); return value; }; }",
    "export function example(): number { const f = () => { const [value] = new Set([1]); return value; }; return f(); }",
  ]) {
    rejectedBeforePublication(sourceText, "js", [arrayMessage]);
  }
});

test("the tuple default-use decision is made once and read by the traversal and both tuple planners", () => {
  const unusedDefault = "(() => { const [unused] = new Set([1]); return unused; })()";
  for (const sourceText of [
    `export function example(pair: [number, number]): number { const [value = ${unusedDefault}] = pair; return value; }`,
    `export function example(pair: [[number], number]): number { const [[value] = (() => { const [unused] = new Set([[1]]); return unused; })()] = pair; return value; }`,
    `export function example(pair: [number, number]): number { let value = 0; [value = ${unusedDefault}] = pair; return value; }`,
  ]) {
    const value = analyze(sourceText, "js");
    assert.equal(value.result.kind, "resolved");
    const records = value.result.value.records;
    const defaults = [...ofKind(value, "KindBindingElement"), ...ofKind(value, "KindBinaryExpression")]
      .map(node => records.bindingPatternProjection.get(node)?.element)
      .filter(element => element?.kind === "array-element" && element.tupleDefault !== undefined)
      .map(element => element.tupleDefault.kind);
    assert.deepEqual(defaults, ["unused"], "a non-nullable tuple element never consumes its default");
    assertCsharpCompilationSucceeded(value.compiled);
  }
  rejectedBeforePublication(`export function example(pair: [number, number?]): number { const [, value = ${unusedDefault}] = pair; return value; }`, "js", [arrayMessage]);
  rejectedBeforePublication(`export function example(pair: [number, number?]): number { let value = 0; [, value = ${unusedDefault}] = pair; return value; }`, "js", [arrayMessage]);
  rejectedBeforePublication(`export function example(xs: number[]): number { const [value = ${unusedDefault}] = xs; return value; }`, "js", [arrayMessage]);
  const planned = analyze("export function example(pair: [number, number?]): number { const [, value = 3] = pair; return value; }", "native");
  assert.equal(planned.result.kind, "resolved");
  const element = ofKind(planned, "KindBindingElement").map(node => planned.result.value.records.bindingPatternProjection.get(node)?.element)
    .find(candidate => candidate?.tupleDefault !== undefined);
  assert.equal(element?.tupleDefault.kind, "planned", "a nullable tuple element consumes its default");
  assert.equal(element.tupleDefault.carrier !== undefined && Object.isFrozen(element.tupleDefault), true);
  assertCsharpCompilationSucceeded(planned.compiled);
});

test("newly allocated array-binding descriptors and tuple slices are published frozen", () => {
  const value = analyze(`
    export function read(xs: number[], t: [number, string, boolean], nested: [[number, string], number]): number {
      const [first] = xs;
      const [head, ...tail] = t;
      const [[inner, ...innerTail]] = nested;
      return first + head + inner;
    }
  `, "native");
  assert.equal(value.result.kind, "resolved");
  const records = value.result.value.records;
  const sources = ofKind(value, "KindArrayBindingPattern").map(node => records.bindingPatternProjection.get(node)?.source);
  assert.deepEqual(sources.map(source => source?.bindingCarrier.kind), ["array", "tuple", "tuple", "tuple"]);
  assert.deepEqual(sources.map(source => source.bindingCarrier.kind === "array"
    ? Object.isFrozen(source.bindingCarrier)
    : source.bindingCarrier === source.sourceCarrier), [true, true, true, true],
  "newly allocated array descriptors are frozen; tuple carriers keep their exact source identity");
  const rests = ofKind(value, "KindBindingElement").map(node => records.bindingPatternProjection.get(node)?.element)
    .filter(element => element?.kind === "tuple-rest");
  assert.deepEqual(rests.map(rest => rest.restCarrier.elements.length), [2, 1]);
  assert.deepEqual(rests.map(rest => Object.isFrozen(rest.restCarrier) && Object.isFrozen(rest.restCarrier.elements)), [true, true],
    "tuple-rest slices and their element lists are frozen");
  assert.equal(Reflect.set(rests[0].restCarrier.elements, "length", 0), false);
  assert.equal(rests[0].restCarrier.elements.length, 2);
  assertCsharpCompilationSucceeded(value.compiled);
});
