import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readSourceInventory } from "../../../tsonic/test/architecture/tooling/file-inventory.mjs";
import { buildTypeScriptModuleAnalysis } from "../../../tsonic/test/architecture/tooling/module-graph.mjs";
import { createSourceCodeMask } from "./source-code-mask.mjs";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const domain = "src/backend/planner/objects/object-literals/";
const entrypoint = `${domain}planning.ts`;
const owners = new Map([
  ["planObjectLiteralExpression", entrypoint],
  ["planObjectShapeLiteralAssignment", `${domain}assignments.ts`],
  ["planObjectShapeAccessorMemberAssignment", `${domain}accessors.ts`],
  ["planObjectShapeMethodMemberAssignment", `${domain}methods.ts`],
  ["planObjectShapeSpreadAssignments", `${domain}spread.ts`],
]);

test("own-property order proofs belong to analysis and planners consume completed selections", () => {
  const model = "src/target-model/types/object-shape-projection.ts";
  const readers = ["src/analysis/objects/native-demand/requests.ts", "src/analysis/objects/native-demand/references.ts"];
  const renderer = "src/backend/planner/objects/enumerable-keys.ts";
  const mask = createSourceCodeMask(new Map([model, ...readers, renderer]
    .map(file => [file, readFileSync(resolve(repositoryRoot, file), "utf8")])));
  assert.doesNotMatch(mask(model), /\bAstReader\b|\bast\s*\.|\borderEnumerableOwnStringProperties\b/u);
  for (const file of readers) {
    const source = mask(file);
    assert.doesNotMatch(source, /\bresolveCsharpObjectShape(?:PropertyOrder|AssignmentSourceOrder)\b/u);
    assert.match(source, /objectShapes\.propertyOrder\(/u);
  }
  assert.match(mask(renderer), /records\.enumerableKeys\.get\(shape\)/u);
  assert.doesNotMatch(mask(renderer), /objectShapes\.propertyOrder|resolveCsharpObjectShapePropertyOrder/u);
});

test("object-literal implementations and consumers use one canonical planning domain", () => {
  const sourceFiles = new Map(
    [...readSourceInventory(resolve(repositoryRoot, "src"), { extensions: [".ts"] })]
      .map(([file, source]) => [`src/${file}`, source]),
  );
  assert.deepEqual(ownershipFindings(sourceFiles), []);
});

test("object-literal ownership rejects implementation moves and old-path forwarding aliases", () => {
  const canonical = canonicalSources();
  assert.deepEqual(ownershipFindings(canonical), []);

  const moved = new Map(canonical);
  const spread = `${domain}spread.ts`;
  const oldPath = "src/backend/planner/expressions/expression-object-literal-support.ts";
  moved.set(oldPath, moved.get(spread));
  moved.delete(spread);
  assert.ok(ownershipFindings(moved).includes(`implementation-owner:planObjectShapeSpreadAssignments`));
  assert.ok(ownershipFindings(moved).includes(`old-path:${oldPath}`));

  const alias = new Map(canonical);
  alias.set(oldPath, 'export * from "../objects/object-literals/spread.js";');
  assert.ok(ownershipFindings(alias).includes(`old-path:${oldPath}`));
});

test("object-literal consumers cannot bypass planning or keep unresolved old imports", () => {
  const consumer = "src/backend/planner/expressions/consumer.ts";
  const bypass = canonicalSources();
  bypass.set(consumer, 'import { planObjectShapeSpreadAssignments } from "../objects/object-literals/spread.js";');
  assert.ok(ownershipFindings(bypass).includes(`private-domain-import:${consumer}:${domain}spread.ts`));

  const stale = canonicalSources();
  stale.set(consumer, 'import { planObjectLiteralExpressionWithExpectedType } from "./expression-object-literals.js";');
  assert.ok(ownershipFindings(stale).includes(`old-import:${consumer}:./expression-object-literals.js`));
});

function canonicalSources() {
  return new Map([
    ...[...owners].map(([symbol, file]) => [file, `export function ${symbol}() {}`]),
    [
      "src/backend/planner/expressions/consumer.ts",
      'import { planObjectLiteralExpression } from "../objects/object-literals/planning.js";',
    ],
  ]);
}

function ownershipFindings(sourceFiles) {
  const findings = [];
  const mask = createSourceCodeMask(sourceFiles);
  const codeFiles = [...sourceFiles.keys()].map(file => [file, mask(file)]);
  for (const [symbol, owner] of owners) {
    const declaration = new RegExp(`\\bexport\\s+function\\s+${symbol}\\s*\\(`, "u");
    const implementations = codeFiles.filter(([, source]) => declaration.test(source))
      .map(([file]) => file);
    if (implementations.length !== 1 || implementations[0] !== owner) {
      findings.push(`implementation-owner:${symbol}`);
    }
  }
  for (const file of sourceFiles.keys()) {
    if (file.includes("/expression-object-literal")) {
      findings.push(`old-path:${file}`);
    }
  }
  for (const edge of buildTypeScriptModuleAnalysis(sourceFiles).edges) {
    if (edge.specifier.includes("expression-object-literal")) {
      findings.push(`old-import:${edge.source}:${edge.specifier}`);
    }
    if (edge.source.startsWith(domain) && edge.unresolved) {
      findings.push(`unresolved-domain-import:${edge.source}:${edge.specifier}`);
    }
    if (!edge.source.startsWith(domain) && edge.target?.startsWith(domain) && edge.target !== entrypoint) {
      findings.push(`private-domain-import:${edge.source}:${edge.target}`);
    }
  }
  return findings.sort();
}
