import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { getCsharpMethodValue } from "../../../dist/target-model/types/method-values.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { selectCsharpPublishedMethodValue } from "../../../dist/analysis/objects/method-values.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

const sourceText = `
import type { int32 } from "@tsonic/core/types.js";
function make(seed: int32) { return { count: seed, read(): int32 { return this.count; } }; }
function foreign(seed: int32) { return { other: seed, read(): int32 { return this.other; } }; }
export function run(): boolean {
  const value = make(7);
  const alias = value;
  const first = value.read;
  const second = alias.read;
  alias.count = 11;
  return first === second && first() === 11 && value.read() === 11;
}
`;

function fixture(surface) {
  const compiled = compileCsharpSource({ surface, sourceText });
  assertCsharpCompilationSucceeded(compiled);
  const program = compiled.result.program;
  const { ast } = program.source;
  const nodes = [];
  const visit = node => {
    nodes.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  program.source.navigation.sourceFiles.filter(file => ast.getFileName(file) === "/project/index.ts").forEach(visit);
  const reads = nodes.filter(node => ast.is.IsPropertyAccessExpression(node) && ast.text(ast.name(node)) === "read");
  const declaration = nodes.find(node => ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === "first");
  const method = program.source.effectiveTypes.get(reads[0]).type.calls[0].declaration;
  const foreign = nodes.find(node => ast.is.IsMethodDeclaration(node) && node !== method);
  return { compiled, program, ast, nodes, reads, declaration, method, foreign };
}

for (const surface of ["native", "js"]) {
  test(`${surface} published fixed-method reads retain one receiver protocol before local storage`, () => {
    const value = fixture(surface);
    const carriers = value.reads.slice(0, 2).map(node => value.program.records.nodeTargetType.get(node));
    assert.equal(carriers.every(carrier => getCsharpMethodValue(carrier) !== undefined), true,
      "the earliest selected Native read already retains the fixed method protocol");
    assert.equal(targetTypeRefEquals(carriers[0], carriers[1]), true,
      "receiver aliasing preserves the same exact original method carrier");
    assert.equal(getCsharpMethodValue(value.program.records.storageType.get(value.declaration)) !== undefined, true,
      "unannotated local storage does not replace the selected receiver with a fresh delegate");
    assert.equal(getCsharpMethodValue(value.program.records.nodeTargetType.get(value.reads[2])) === undefined, true,
      "a direct method invocation keeps its selected native call contract");
  });
}

test("fixed-method projection rejects missing owners foreign declarations and mismatched native contracts", () => {
  const value = fixture("native");
  const physical = value.program.records.valueRead.get(value.reads[0]).value;
  const selected = getCsharpMethodValue(physical);
  assert.equal(selected !== undefined, true, "the actual original compilation supplies the method and native contract");
  const host = { ast: value.ast, structuralTypes: { resolveTarget: type => value.program.objectShapes.resolveTarget(type) } };
  assert.equal(selectCsharpPublishedMethodValue(undefined, value.method, selected.contract, host) === undefined, true,
    "an absent physical receiver supplies no method authority");
  assert.equal(selectCsharpPublishedMethodValue(selected.owner, value.foreign, selected.contract, host) === undefined, true,
    "a same-signature method on another original object is not this receiver's member");
  const different = csharpDelegateTargetType("System.Func", [], csharpSourcePrimitiveTargetType("int64"));
  assert.equal(selectCsharpPublishedMethodValue(selected.owner, value.method, different, host) === undefined, true,
    "native return-width disagreement cannot acquire a method protocol");
});

test("an authored callable slot and a mutable method preserve their native delegate contracts", () => {
  const compiled = compileCsharpSource({ sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    export function run(): int32 {
      const value = { read(): int32 { return 7; } };
      value.read = (): int32 => 11;
      const selected: () => int32 = value.read;
      return selected();
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const program = compiled.result.program;
  const { ast } = program.source;
  const declarations = [];
  const visit = node => {
    if (ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === "selected") declarations.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  program.source.navigation.sourceFiles.filter(file => ast.getFileName(file) === "/project/index.ts").forEach(visit);
  assert.equal(declarations.length, 1);
  assert.equal(getCsharpMethodValue(program.records.storageType.get(declarations[0])) === undefined, true,
    "the explicit callable contract and mutable slot are not replaced by a fixed receiver protocol");
});

for (const [label, local] of [
  ["written binding", "let selected = value.read; selected = alias.read;"],
  ["authored optional slot", "const selected: (() => int32) | undefined = value.read;"],
  ["non-property initializer", "const selected = flag ? value.read : alias.read;"],
]) {
  test(`${label} supplies no unannotated fixed-property storage authority`, () => {
    const compiled = compileCsharpSource({ sourceText: `
      import type { int32 } from "@tsonic/core/types.js";
      function make() { return { read(): int32 { return 7; } }; }
      export function run(flag: boolean): int32 {
        const value = make();
        const alias = value;
        ${local}
        if (selected === undefined) return 0;
        return selected();
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const { ast } = program.source;
    const declarations = [];
    const visit = node => {
      if (ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === "selected") declarations.push(node);
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    program.source.navigation.sourceFiles.filter(file => ast.getFileName(file) === "/project/index.ts").forEach(visit);
    assert.equal(declarations.length, 1);
    assert.equal(getCsharpMethodValue(program.records.storageType.get(declarations[0])) === undefined, true,
      "the exact non-fixed storage contract is retained");
  });
}
