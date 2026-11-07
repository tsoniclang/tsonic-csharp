import assert from "node:assert/strict";
import test from "node:test";
import { capturedCallbackAritySource } from "../../../../tsonic/test/fixtures/captured-callback-arity.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpSourceNodes } from "../../../dist/analysis/program/source-nodes.js";

for (const surface of [undefined, "js"]) {
  test(`captured native methods retain their sealed arity independently of contextual callbacks (${surface ?? "native"})`,
    { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText: capturedCallbackAritySource });
      assertCsharpCompilationSucceeded(compiled);
      const generated = [...compiled.artifacts.values()].join("\n");
      const program = compiled.result.program;
      // nextgen C-2542: the analysis program's source is the TargetSourceProgramFacts (syntax reader `.syntax`); its node
      // inventory is the C# syntax walk over the program's source files (analysis/program/source-nodes.ts).
      const ast = program.source.syntax;
      const nodes = csharpSourceNodes(ast, program.sourceFiles);
      const lambdas = nodes.filter(node => ast.is.IsArrowFunction(node) || ast.is.IsFunctionExpression(node));
      assert.equal(lambdas.length, 6, "all six original callback/value bodies retain their own source contracts");
      const expectedNames = [[], [], ["first", "second"], ["first"], ["first", "second", "third"], []];
      for (const [index, lambda] of lambdas.entries()) {
        const contract = program.records.callableDeclaration.get(lambda)?.contract;
        assert.equal(contract?.kind, "source", "the original declaration owns its completed native body contract");
        assert.equal(contract.sourceDeclaration === lambda, true);
        assert.deepEqual(contract.nativeParameters.map(parameter => ast.text(ast.name(parameter.sourceParameter))), expectedNames[index],
          "the authored zero/two/one/three native body vector is not replaced by its contextual callback vector");
        assert.equal(contract.nativeParameters.every((parameter, parameterIndex) =>
          parameter.sourceParameter === contract.parameters[parameterIndex] &&
          parameter.targetParameter.type.kind === "source-primitive" && parameter.targetParameter.type.name === "float64" &&
          parameter.targetParameter.passingMode === "by-value" && parameter.targetParameter.paramsArray !== true &&
          parameter.targetParameter.optional !== true), true, "native widths, passing and authored arity remain exact");
        const creation = program.records.callableCreation.get(lambda);
        assert.equal(creation?.kind, "selected", "each source body has its completed native delegate creation");
        assert.equal(program.records.typeEmission.get(creation.carrier)?.lambda?.parameters.length, index === 5 ? 0 : 3,
          "the actual Handler ABI has three native slots, independently of each authored body vector");
        assert.equal(Object.isFrozen(contract) && Object.isFrozen(contract.nativeParameters) && Object.isFrozen(creation), true);
      }
      for (const name of ["result", "later"]) {
        const declarations = nodes.filter(node => ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === name);
        assert.equal(declarations.length, 1, "one actual activation place for " + name);
        const place = program.records.capturedPlace.get(declarations[0]);
        assert.equal(place !== undefined && place.declaration === declarations[0], true, "all bodies retain the original place");
        assert.equal(place.initialization, name === "later" ? "deferred" : "initialized");
        assert.equal(program.records.capturedBinding.get(declarations[0]), undefined,
          "ordinary native closures do not require a second explicit class/protocol frame");
      }
      assert.doesNotMatch(generated, /\b(?:ObjectShape_capture_|__TsonicCapture_)/u,
        "the required native closure is not paired with a redundant generated environment");
      executeCsharpConstruction(compiled, `captured-callback-arity-${surface ?? "native"}`, false, false, [], `
using Index = Tsonic.Generated.Index;
for (var warmup = 0; warmup < 10000; warmup++) {
    if (!Index.run() || !Handwritten()) throw new System.Exception("native callback arity values");
}
var before = System.GC.GetAllocatedBytesForCurrentThread();
var generated = 0;
for (var iteration = 0; iteration < 4096; iteration++) if (Index.run()) generated++;
var generatedCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
before = System.GC.GetAllocatedBytesForCurrentThread();
var native = 0;
for (var iteration = 0; iteration < 4096; iteration++) if (Handwritten()) native++;
var nativeCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (generated != 4096 || native != generated || generatedCost != nativeCost)
    throw new System.Exception($"native callback arity allocation {generatedCost} != {nativeCost}");
static bool Handwritten() => Create()() == 20;
static System.Func<double> Create() {
    double result = 0;
    double later = 0;
    System.Action<double, double, double> pending = (_, _, _) => { result += later; };
    later = 3;
    Invoke(pending);
    Invoke((_, _, _) => { result += later; });
    Invoke((first, second, unused) => { result += first + second; });
    Invoke((first, _, _) => { result += first; });
    Invoke((first, second, third) => { result += first + second + third; });
    return () => result;
}
static void Invoke(System.Action<double, double, double> callback) => callback(1, 2, 7);
`);
    });
}
