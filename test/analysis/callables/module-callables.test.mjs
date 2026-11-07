import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { hostProgram } from "../../representation/host-fixture.mjs";
import { analyzeCsharpModuleCallables } from "../../../dist/analysis/callables/module-callables.js";
import { analyzeCsharpCallableDeclarationEmission } from "../../../dist/analysis/callables/emission/declaration-emission.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/index.js";

test("module callable identities are early, canonical, frozen and restricted to original const owners", () => {
  // nextgen C-2542: a Host program (authored syntax); node lists come from a syntax walk (no navigation.nodesForFiles).
  const program = hostProgram(`export const arrow = (value: number): number => value;
      export const wrapped = ((function(value: number): number { return value; }) as (value: number) => number);
      const alias = arrow;
      let mutable = (value: number): number => value;
      function local() { const nested = (value: number): number => value; return nested; }
      const [destructured] = [(value: number): number => value];`,
    { files: { "other.ts": "export const foreign = (value: number): number => value;" } });
  const source = Object.freeze({ syntax: program.ast });
  const nodesOf = root => { const found = []; const walk = node => { found.push(node);
    source.syntax.forEachChild(node, child => { if (child !== undefined) walk(child); }); }; walk(root); return found; };
  const file = program.files.find(file => source.syntax.getFileName(file) === "/project/index.ts");
  assert.equal(file !== undefined, true);
  const nodes = nodesOf(file);
  const identities = analyzeCsharpModuleCallables(source.syntax, nodes);
  assert.equal(Object.isFrozen(identities), true);
  const declarations = nodes.filter(node => source.syntax.is.IsVariableDeclaration(node));
  const declaration = name => declarations.find(node => source.syntax.text(source.syntax.name(node)) === name);
  for (const name of ["arrow", "wrapped"]) {
    const owner = declaration(name);
    const identity = identities.get(owner);
    assert.equal(identity !== undefined && identity.sourceOwner === owner, true, name);
    assert.equal(identities.get(identity.callable) === identity, true, "both checked identities share one frozen observation");
    assert.equal(Object.isFrozen(identity), true);
    assert.equal(source.syntax.is.IsArrowFunction(identity.callable) || source.syntax.is.IsFunctionExpression(identity.callable), true);
  }
  for (const name of ["alias", "mutable", "nested"]) assert.equal(identities.get(declaration(name)) === undefined, true, name);
  const other = program.files.find(file => source.syntax.getFileName(file) === "/project/other.ts");
  assert.equal(other !== undefined, true);
  for (const node of nodesOf(other)) assert.equal(identities.get(node) === undefined, true, "foreign inventory is not guessed");
  assert.equal(identities.get({}) === undefined, true, "an unrelated node has no source identity");
  assert.equal(existsSync(new URL("../../../src/target-model/syntax/module-callables.ts", import.meta.url)), false,
    "the target-model syntax layer has no parallel semantic classifier");
});

test("declaration sealing preserves the exact early module identity for owner and callable readers", () => {
  const owner = Object.freeze({});
  const callable = Object.freeze({});
  const identity = Object.freeze({ callable, sourceOwner: owner });
  const moduleCallables = Object.freeze({ get: node => node === owner || node === callable ? identity : undefined });
  const contract = Object.freeze({});
  const integer = csharpSourcePrimitiveTargetType("int32");
  const selected = analyzeCsharpCallableDeclarationEmission({ moduleCallables,
    ast: { body: node => node === callable ? {} : undefined,
      is: { IsFunctionDeclaration: () => false, IsFunctionExpression: () => false, IsArrowFunction: node => node === callable,
        IsMethodDeclaration: () => false, IsGetAccessorDeclaration: () => false }, hasModifierKind: () => false },
    nodes: [owner, callable], admitted: () => true,
    declarations: { returnContract: { get: node => node === callable ? { kind: "resolved", type: integer } : undefined } },
    generators: { generator: { get: () => undefined } }, callables: { get: () => contract },
  });
  assert.equal(selected.issues.length, 0);
  const emitted = selected.records.callableDeclaration.get(callable);
  assert.equal(emitted !== undefined && emitted.sourceIdentity === identity, true);
  assert.equal(selected.records.callableDeclaration.get(owner) === emitted, true, "the planner reads the same sealed declaration, never reclassifies syntax");
  assert.equal(emitted.contract === contract && emitted.returnCarrier === integer, true);
  assert.equal(Object.isFrozen(emitted), true);
});
