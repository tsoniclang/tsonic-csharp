import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { authoredObjectMethodEvidenceSource } from "../../../../tsonic/test/fixtures/generic-object-methods.mjs";
import { factorySharedChooserSource, mutableMethodSources } from "./authored-object-methods.fixtures.mjs";

for (const surface of Array.from(["native", "js"]).slice(0, 1)) {
for (const [name, sourceText] of Array.from(mutableMethodSources).slice(5, 11)) {
test(`mutable native methods retain ${name} (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const shapes = program.objectShapes.knownShapes().filter(shape => shape.methodImplementation !== undefined);
    const methods = shapes.flatMap(shape => program.records.objectMethods.get(shape) ?? []);
    assert.equal(methods.some(method => method.emission.value.kind !== "fixed"), true,
      "the complete checked native body has a real mutable callable-value owner");
    const source = [...compiled.artifacts.values()].join("\n");
    assert.equal(/Func<__TsonicShape_/u.test(source), false,
      "a native body never allocates an open synthetic receiver delegate");
    assert.equal(/dynamic|\.GetType\(/u.test(source), false,
      "the exact stored delegate or protocol never needs dynamic invocation");
    executeCsharpConstruction(compiled, `mutable-authored-${name.replaceAll(" ", "-")}-${surface}`);
  });
}
}

for (const surface of Array.from(["native", "js"]).slice(1, 2)) {
for (const [name, sourceText] of Array.from(mutableMethodSources).slice(0, 1)) {
test(`mutable native methods retain ${name} (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const shapes = program.objectShapes.knownShapes().filter(shape => shape.methodImplementation !== undefined);
    const methods = shapes.flatMap(shape => program.records.objectMethods.get(shape) ?? []);
    assert.equal(methods.some(method => method.emission.value.kind !== "fixed"), true,
      "the complete checked native body has a real mutable callable-value owner");
    const source = [...compiled.artifacts.values()].join("\n");
    assert.equal(/Func<__TsonicShape_/u.test(source), false,
      "a native body never allocates an open synthetic receiver delegate");
    assert.equal(/dynamic|\.GetType\(/u.test(source), false,
      "the exact stored delegate or protocol never needs dynamic invocation");
    executeCsharpConstruction(compiled, `mutable-authored-${name.replaceAll(" ", "-")}-${surface}`);
  });
}
}
