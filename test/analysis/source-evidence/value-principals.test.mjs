import assert from "node:assert/strict";
import test from "node:test";
import { checkCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { csharpFlowReadPrincipalDeclaration } from "../../../dist/analysis/source-evidence/source-values.js";

test("flow principals follow actual value bindings, not selected constant or callable members", () => {
  const checked = checkCsharpSource({ projectRoot: "/principal", sourceText: `interface RecordValue { field: number; }
      enum Named { key = 1 }
      class Container { stored: number = 1; get selected(): number { return this.stored; }
        method(): number { return this.stored; } }
      function run(parameter: number, record: RecordValue): number {
        let local = parameter; const { field: bound } = record;
        return local + bound + record.field + new Container().stored + Named.key +
          new Container().selected + new Container().method();
      }
      void run;`, compilerOptions: { strict: true } });
  assertCsharpCheckingSucceeded(checked);
  const source = checked.source;
  const file = source.sourceFiles.find(file => source.ast.getPath(file) === "/principal/index.ts");
  assert.equal(file !== undefined, true, "the exact original program is enrolled");
  const nodes = [];
  const visit = node => { nodes.push(node); source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  visit(file);
  const values = new Set(["local", "bound", "parameter", "record", "stored", "field"]);
  const nonvalues = new Set(["key", "selected", "method", "run"]);
  const observed = new Set();
  for (const node of nodes) {
    const reference = source.facts.navigation.sourceReferenceFor(node);
    if (reference === undefined) continue;
    const name = source.ast.name(reference.declaration);
    if (name === undefined || !source.ast.is.IsIdentifier(name)) continue;
    const label = source.ast.text(name);
    if (!values.has(label) && !nonvalues.has(label)) continue;
    const actual = csharpFlowReadPrincipalDeclaration(source.ast, source.facts.navigation, node);
    assert.equal(values.has(label) ? actual === reference.declaration : actual === undefined, true,
      label + ": the exact declaration association, never a member spelling or target shape, owns principal storage");
    observed.add(label);
  }
  assert.equal(observed.size, values.size + nonvalues.size, "each lexical, member, constant and callable opposite is actually observed");
});
