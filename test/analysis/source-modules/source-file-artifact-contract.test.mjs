import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpSourceArtifacts } from "../../../dist/analysis/source-modules/artifacts.js";

function select(files, references = new Map(), constructions = []) {
  return analyzeCsharpSourceArtifacts({
    ast: { getPath: file => file.path },
    navigation: { sourceFiles: files, moduleReferences: file => (references.get(file) ?? []).map(sourceFile => ({ sourceFile })) },
  }, { entries: () => constructions });
}

const file = path => Object.freeze({ path });
const owner = source => 'source-file:' + source.path;

test("source-file contracts retain exact public dependencies before sealing", () => {
  const root = file("/project/index.ts");
  const dependency = file("/project/dependency.ts");
  const result = select([root, dependency], new Map([[root, [dependency]]]));
  assert.equal(result.issues.length, 0);
  const selected = result.records.sourceArtifacts.get().find(entry => entry.sourceFile === root);
  assert.deepEqual(selected.dependencies, [{ owner: owner(dependency), facet: "source-file-public-surface" }]);
  assert.equal(Object.isFrozen(selected) && Object.isFrozen(selected.dependencies), true);
  assert.equal(result.records.sourceArtifacts.get() === result.records.sourceArtifacts.get(), true);
});

test("constructed modules retain implementation and public facets separately", () => {
  const root = file("/project/index.ts");
  const dependency = file("/project/worker.ts");
  const result = select([root, dependency], new Map([[root, [dependency]]]), [{ sourceFile: root, targetSourceFile: dependency }]);
  assert.equal(result.issues.length, 0);
  const selected = result.records.sourceArtifacts.get().find(entry => entry.sourceFile === root);
  assert.deepEqual(selected.dependencies, [
    { owner: owner(dependency), facet: "source-file-implementation" },
    { owner: owner(dependency), facet: "source-file-public-surface" },
  ]);
});

test("mutual source imports produce one finite immutable dependency set", () => {
  const root = file("/project/index.ts");
  const peer = file("/project/peer.ts");
  const result = select([root, peer], new Map([[root, [peer, peer, root]], [peer, [root]]]));
  assert.equal(result.issues.length, 0);
  const records = result.records.sourceArtifacts.get();
  assert.equal(records.length, 2);
  for (const [source, dependency] of [[root, peer], [peer, root]]) {
    assert.deepEqual(records.find(entry => entry.sourceFile === source).dependencies,
      [{ owner: owner(dependency), facet: "source-file-public-surface" }]);
  }
});

test("transitive source contracts retain their exact direct owners without backend reconstruction", () => {
  const root = file("/project/index.ts");
  const caller = file("/project/caller.ts");
  const callee = file("/project/callee.ts");
  const result = select([root, caller, callee], new Map([[root, [caller]], [caller, [callee]]]));
  assert.equal(result.issues.length, 0);
  const records = result.records.sourceArtifacts.get();
  for (const [source, dependency] of [[root, caller], [caller, callee]]) {
    assert.deepEqual(records.find(entry => entry.sourceFile === source).dependencies,
      [{ owner: owner(dependency), facet: "source-file-public-surface" }]);
  }
  assert.deepEqual(records.find(entry => entry.sourceFile === callee).dependencies, []);
  assert.equal(Object.hasOwn(result.records, "reconstructArtifact"), false);
});

test("a missing exact source dependency is refused at its source owner", () => {
  const root = file("/project/index.ts");
  const absent = file("/project/absent.ts");
  const result = select([root], new Map([[root, [absent]]]));
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].code, "CSHARP_SOURCE_FILE_DEPENDENCY_IDENTITY_MISSING");
  assert.equal(result.issues[0].sourceNode === root, true);
});
