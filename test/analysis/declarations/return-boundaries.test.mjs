import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

const localClass = constructorBody => `export function make() {
  class Local {
    tag: number = 2;
${constructorBody}
  }
  return new Local().tag;
}
`;

function makeContract(sourceText) {
  const compiled = compileCsharpSource({ sourceText });
  assert.equal(compiled.sourceDiagnosticsText, "");
  const program = compiled.result.program;
  assert.ok(program, "C# analysis publishes the program");
  const { ast } = compiled.source;
  const nodes = [];
  const visit = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  program.sourceFiles.forEach(visit);
  const make = nodes.find(node => ast.is.IsFunctionDeclaration(node) && ast.text(ast.name(node)) === "make");
  assert.ok(make);
  const output = compiled.result.artifacts.filter(artifact => artifact.path.endsWith(".cs"))
    .map(artifact => artifact.text).join("\n");
  return { compiled, contract: program.records.returnContract.get(make), signature: output.match(/public static \w+ make\(\)/u)?.[0] };
}

test("a constructor returning this inside a local class is not a return of the enclosing function", { timeout: 300_000 }, () => {
  const expected = makeContract(localClass(""));
  const actual = makeContract(localClass("    constructor() {\n      return this;\n    }"));
  assertCsharpCompilationSucceeded(expected.compiled);
  assertCsharpCompilationSucceeded(actual.compiled);
  assert.equal(expected.contract?.kind, "resolved");
  assert.deepEqual(actual.contract, expected.contract);
  assert.equal(actual.signature, "public static double make()");
  assert.equal(actual.signature, expected.signature);
});

test("a constructor returning an object inside a local class is not a return of the enclosing function", { timeout: 300_000 }, () => {
  const expected = makeContract(localClass(""));
  const actual = makeContract(localClass("    constructor() {\n      return { tag: 1 };\n    }"));
  assert.equal(expected.contract?.kind, "resolved");
  assert.deepEqual(actual.contract, expected.contract,
    "the enclosing function's inferred return ignores the constructor's object return");
});

test("accessor returns inside a local class are not returns of the enclosing function", { timeout: 300_000 }, () => {
  const expected = makeContract(localClass(""));
  const actual = makeContract(`export function make() {
  class Local {
    tag: number = 2;
    get label(): string { return "text"; }
    set label(next: string) { this.tag = 3; return; }
  }
  return new Local().tag;
}
`);
  assertCsharpCompilationSucceeded(actual.compiled);
  assert.deepEqual(actual.contract, expected.contract);
  assert.equal(actual.signature, expected.signature);
});
