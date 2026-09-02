import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(new URL("../..", import.meta.url).pathname);
const tsonicRoot = resolve(repositoryRoot, "../tsonic");
const referenceRoot = resolve(tsonicRoot, "docs/reference/targets/csharp");

test("C# package delegates product documentation to the canonical Tsonic tree", () => {
  const readme = readFileSync(resolve(repositoryRoot, "README.md"), "utf8");
  assert.match(readme, /tsonic\/tree\/main\/docs\/manual\/targets\/csharp/u);
  assert.match(readme, /tsonic\/tree\/main\/docs\/reference\/targets\/csharp/u);
  assert.equal(existsSync(resolve(repositoryRoot, "docs")), false);
});

test("canonical C# configuration lists every accepted option", () => {
  const source = readFileSync(resolve(repositoryRoot, "src/options/csharp-target-options.ts"), "utf8");
  const reference = readFileSync(resolve(referenceRoot, "configuration.md"), "utf8");
  for (const option of extractFrozenStringList(source, "supportedCsharpTargetOptionKeys")) {
    assert.ok(reference.includes("| `" + option + "` |"), option);
  }
});

test("canonical C# source-module reference lists every public source alias", () => {
  const modules = readFileSync(resolve(repositoryRoot, "src/source/profiles/source-modules.ts"), "utf8");
  const safety = readFileSync(resolve(repositoryRoot, "src/source/extension/explicit-safety.ts"), "utf8");
  const rankedArrays = readFileSync(resolve(repositoryRoot, "src/source/profiles/ranked-arrays.ts"), "utf8");
  const reference = readFileSync(resolve(referenceRoot, "source-modules.md"), "utf8");
  const names = new Set([
    ...[...modules.matchAll(/sourcePrimitive\("([^"]+)"/gu)].map((match) => match[1]),
    ...[...modules.matchAll(/exportName:\s*"([^"]+)"/gu)].map((match) => match[1]),
    ...extractObjectStringValues(safety, "csharpSafetyProviderNames"),
    "ptr",
  ]);
  for (const name of names) {
    if (name.startsWith("__")) continue;
    assert.ok(reference.includes("`" + name), name);
  }

  const descriptorRange = rankedArrays.match(
    /Array\.from\(\{ length: (\d+) \}, \(_, index\) => \{\s*const rank = index \+ (\d+);/u,
  );
  assert.ok(descriptorRange?.[1] !== undefined && descriptorRange[2] !== undefined);
  const firstRank = Number(descriptorRange[2]);
  const lastRank = firstRank + Number(descriptorRange[1]) - 1;
  assert.ok(reference.includes(
    "`array" + firstRank + "<T>` … `array" + lastRank + "<T>`",
  ));
  assert.match(reference, new RegExp(`ranks ${firstRank} through ${lastRank}`, "u"));
});

function extractFrozenStringList(source, name) {
  const match = source.match(new RegExp(`${name}\\s*=\\s*Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\)`, "u"));
  assert.ok(match?.[1] !== undefined, name);
  return [...match[1].matchAll(/"([^"]+)"/gu)].map((entry) => entry[1]);
}

function extractObjectStringValues(source, name) {
  const match = source.match(new RegExp(`${name}[^=]*=\\s*Object\\.freeze\\(\\{([\\s\\S]*?)\\}\\)`, "u"));
  assert.ok(match?.[1] !== undefined, name);
  return [...match[1].matchAll(/:\s*"([^"]+)"/gu)].map((entry) => entry[1]);
}
