import assert from "node:assert/strict";
import test from "node:test";
import { targetUseSiteIdentity } from "@tsonic/target-api/analysis";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpNativeDemand, collectCsharpNativeUses } from "../../../dist/analysis/control-flow/native-demand/analyze.js";
import { csharpNativeUseSite } from "../../../dist/analysis/control-flow/native-demand/use-sites.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

const safetyOptions = { targetOptions: { languageDialect: "csharp15-preview", memorySafetyRules: "preview" } };

function compileProgram(options) {
  const compiled = compileCsharpSource(options);
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.result.diagnostics.length === 0, true, compiled.result.diagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  return compiled.result.program;
}

function ownerInput(program, participation = new Map(), expected = new Map()) {
  return {
    ast: program.source.ast,
    sourceFiles: program.sourceFiles,
    navigation: program.sourceNavigation,
    evidence: program.records,
    operations: program.records,
    valueReads: program.records,
    attributeApplications: program.records,
    classFactories: program.records,
    safetyApplications: program.records,
    participation: { get: (declaration) => participation.get(declaration) },
    expectedUse: { get: (site) => expected.get(site.subject)?.get(targetUseSiteIdentity(site)) },
  };
}

function sourceText(program, node) {
  const ast = program.source.ast;
  return String(ast.getSourceText(ast.getSourceFile(node))).slice(ast.pos(node), ast.end(node)).trim().replace(/\s+/g, " ");
}

function indexNodes(program) {
  const ast = program.source.ast;
  const nodes = [];
  const visit = (node) => {
    nodes.push(node);
    ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
  };
  for (const sourceFile of program.sourceFiles) {
    if (String(ast.getPath(sourceFile)).endsWith("/index.ts")) visit(sourceFile);
  }
  return nodes;
}

function findNode(program, kindName, text) {
  const ast = program.source.ast;
  return indexNodes(program).find((node) => ast.kindName(node) === kindName && sourceText(program, node) === text);
}

function describeUses(program, entries) {
  const ast = program.source.ast;
  return new Set(entries
    .filter(({ use }) => String(ast.getPath(ast.getSourceFile(use.expression))).endsWith("/index.ts"))
    .map(({ site, use }) => [site.role, sourceText(program, use.expression),
      `${use.kind} ${use.kind === "erased" ? use.cause : use.completion.kind}`].join(" | ")));
}

function usesText(uses, text) {
  return [...uses].some((description) => description.split(" | ")[1] === text);
}

function usesRole(uses, role, text) {
  return [...uses].some((description) => description.startsWith(`${role} | ${text} | `));
}

test("the native-use owner publishes one consumed use per slot with its ordered completion", () => {
  const program = compileProgram({ sourceText: `
    import type { int } from "@tsonic/csharp/types.js";
    function fail(): never { throw new Error("stop"); }
    function left(): int | undefined { return undefined; }
    function log(value: int): void {}
    export function f(flag: boolean, value: int): int {
      log(value);
      const chosen: int = flag ? value : 0 as int;
      const present: int = left() ?? fail();
      log(chosen);
      return present;
    }
    export function g(): int { return (fail(), 7 as int); }
  ` });
  const uses = describeUses(program, collectCsharpNativeUses(ownerInput(program)));
  const expected = [
    "effect | log(value) | effect void",
    "argument:source=0:effective=0 | value | value value",
    "initializer | flag ? value : 0 as int | value value",
    "condition | flag | value value",
    "branch:true | value | value value",
    "initializer | left() ?? fail() | value value",
    "operand:right | fail() | value never",
    "return | present | value value",
    "return | (fail(), 7 as int) | value never",
    "operand:left | fail() | value never",
  ];
  for (const description of expected) assert.equal(uses.has(description), true, description);
  assert.equal(usesText(uses, "7 as int"), false, "an operand after a never-completing sequence operand is not a native use");
});

test("erased statements and erased callables publish erased uses and nothing beneath them", () => {
  const program = compileProgram({ ...safetyOptions, sourceText: `
    import { safety } from "@tsonic/core/lang.js";
    import type { int } from "@tsonic/csharp/types.js";
    function use(value: int): int { return value; }
    function first(): int { return 1 as int; }
    function second(): int { return 2 as int; }
    function helper(): int { return second(); }
    export function h(): int {
      safety(use(3 as int)).requiresunsafe();
      const unused = (): int => first();
      return 4 as int;
    }
  ` });
  const participation = new Map([
    [findNode(program, "KindArrowFunction", "(): int => first()"), "erased"],
    [findNode(program, "KindFunctionDeclaration", "function helper(): int { return second(); }"), "erased"],
  ]);
  assert.equal([...participation.keys()].every((node) => node !== undefined), true, "the participation port is keyed by the program's own declarations");
  const uses = describeUses(program, collectCsharpNativeUses(ownerInput(program, participation)));
  for (const description of [
    "effect | safety(use(3 as int)).requiresunsafe() | erased erased-statement",
    "initializer | (): int => first() | erased discarded-callable",
    "return | 4 as int | value value",
  ]) assert.equal(uses.has(description), true, description);
  for (const text of ["use(3 as int)", "first()", "second()"]) assert.equal(usesText(uses, text), false, `${text} is not a native use`);
});

test("expected uses from the expected port become converted, constructed and forwarded uses at the same site", () => {
  const program = compileProgram({ sourceText: `
    import type { int } from "@tsonic/csharp/types.js";
    export function k(value: int): int {
      const a = value;
      const b = [value];
      const c = a;
      return c;
    }
  ` });
  const declaration = (name) => findNode(program, "KindVariableDeclaration", name);
  const converted = csharpNativeUseSite(declaration("a = value"), { kind: "initializer" });
  const constructed = csharpNativeUseSite(declaration("b = [value]"), { kind: "initializer" });
  const forwarded = csharpNativeUseSite(declaration("c = a"), { kind: "initializer" });
  const forwardedChildren = Object.freeze([converted]);
  const target = csharpStringTargetType();
  const expectedUse = (site, representation, children) => [site.subject, new Map([[targetUseSiteIdentity(site), Object.freeze({
    expression: program.source.ast.as.AsVariableDeclaration(site.subject).Initializer,
    target, strength: "required", representation, mode: "implicit", children })]])];
  const expected = new Map([
    expectedUse(converted, "convert", Object.freeze([])),
    expectedUse(constructed, "construct", Object.freeze([])),
    expectedUse(forwarded, "forward", forwardedChildren),
  ]);
  const uses = analyzeCsharpNativeDemand(ownerInput(program, new Map(), expected)).nativeUse;
  const convertedUse = uses.get(converted);
  assert.equal(convertedUse?.kind === "converted" && Object.isFrozen(convertedUse), true, "a convert request publishes one frozen converted use");
  assert.equal(convertedUse?.mode === "implicit" && targetTypeRefKey(convertedUse.target) === targetTypeRefKey(target), true,
    "the converted use carries the requested target and mode");
  assert.equal(convertedUse?.input.kind === "value" && targetTypeRefKey(convertedUse.input.carrier) !== targetTypeRefKey(target), true,
    "the converted use keeps the source completion as its input");
  assert.equal(convertedUse?.completion.kind === "value" && targetTypeRefKey(convertedUse.completion.carrier) === targetTypeRefKey(target), true,
    "the converted use completes with the requested target");
  assert.equal(convertedUse?.children.length === 0 && Object.isFrozen(convertedUse.children), true, "an identifier has no ordered children");
  const constructedUse = uses.get(constructed);
  assert.equal(constructedUse?.kind === "constructed" && constructedUse.children.length === 1 &&
    constructedUse.children[0].role === "element:0", true, "a construct request publishes the literal's ordered element sites");
  const forwardedUse = uses.get(forwarded);
  assert.equal(forwardedUse?.kind === "forwarded" && forwardedUse.children === forwardedChildren, true,
    "a forward request publishes the requested children");
  const plain = uses.get(csharpNativeUseSite(findNode(program, "KindReturnStatement", "return c;"), { kind: "return" }));
  assert.equal(plain?.kind === "value" && plain.completion.kind === "value", true, "a use without a request is a value use");
});

test("receivers and statements the planner does not read are not native uses", () => {
  const program = compileProgram({
    sourceText: `
      import * as Store from "./store.js";
      export function read(pair: [number, string], values: number[]): number {
        let x = 0;
        let y = 0;
        [x, y] = values;
        return Store.get() + pair[0] + x + y;
      }
    `,
    files: { "store.ts": "export function get(): number { return 1; }\n" },
  });
  const uses = describeUses(program, collectCsharpNativeUses(ownerInput(program)));
  for (const description of [
    "callee | Store.get | value value",
    "receiver | pair | value value",
    "operand:right | values | value value",
  ]) assert.equal(uses.has(description), true, description);
  for (const [role, text, label] of [
    ["receiver", "Store", "a namespace-imported module function reads no receiver"],
    ["key", "0", "a tuple element index is not a native use"],
    ["effect", "[x, y] = values", "a statement-level destructuring assignment is not an effect use"],
  ]) assert.equal(usesRole(uses, role, text), false, label);
});
