import { csharpTestSourceProgram } from "../../helpers/target-source-program.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { sourceTypeDescriptorStructure } from "../../../../tsonic/packages/target-api/dist/source-semantics/local-type-flow/terms.js";
import { compileCsharpSource, checkCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { getCsharpDelegateSignature } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpJsTypedArrayElementTargetType } from "../../../dist/target-model/types/carriers/js.js";

const families = Object.freeze([
  { name: "Int8Array", element: "int8", calculation: "int32" },
  { name: "Uint8Array", element: "uint8", calculation: "int32" },
  { name: "Uint8ClampedArray", element: "uint8", calculation: "int32" },
  { name: "Int16Array", element: "int16", calculation: "int32" },
  { name: "Uint16Array", element: "uint16", calculation: "int32" },
  { name: "Int32Array", element: "int32", calculation: "int32" },
  { name: "Uint32Array", element: "uint32", calculation: "uint32" },
  { name: "Float32Array", element: "float32", calculation: "float32" },
  { name: "Float64Array", element: "float64", calculation: "float64" },
]);

function projectNodes(program, predicate) {
  const pending = [...csharpProgramSourceFiles(program)];
  const nodes = [];
  while (pending.length > 0) {
    const node = pending.pop();
    if (predicate(node, program.source.syntax)) nodes.push(node);
    program.source.syntax.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
  }
  return nodes;
}

function primitive(type, expected) {
  return type?.kind === "primitive" && type.primitive === expected;
}

for (const family of families) {
  for (const mode of ["constructed", "declared", "omitted", "absent"]) {
    test(`inherited ${family.name} preserves ${mode} native callback bindings`, () => {
      const supplied = mode === "constructed" || mode === "declared";
      const argument = supplied ? "(left, right) => left - right" : mode === "absent" ? "undefined" : "";
      const sourceText = mode === "constructed"
        ? `export function run(): ${family.name} { const values = new ${family.name}(3); return values.sort(${argument}); }`
        : `export function run(values: ${family.name}): ${family.name} { return values.sort(${argument}); }`;
      const compiled = compileCsharpSource({ surface: "js", sourceText });
      assertCsharpCompilationSucceeded(compiled);
      const program = compiled.result.program;
      const calls = projectNodes(program, (node, ast) => ast.is.IsCallExpression(node));
      assert.equal(calls.length, 1);
      const call = calls[0];
      const selected = program.source.facts.selections.call(call);
      const publication = program.source.facts.instantiations.at(call);
      assert.equal(selected !== undefined && publication?.use === call && selected.use === call, true, "same selected Source invocation");
      const parameter = publication?.parameters[0];
      assert.equal(parameter?.kind === "optional", true, "the callback retains one optional parameter");
      const callable = parameter?.kind === "optional" ? sourceTypeDescriptorStructure(parameter.value) : undefined;
      assert.equal(callable?.kind === "callable" && callable.calls.length === 1, true, "one published callable signature");
      const signature = callable?.kind === "callable" ? callable.calls[0] : undefined;
      assert.equal(signature?.parameters.length === 2 &&
        signature.parameters.every(parameter => primitive(parameter.type, family.element)), true, "exact inherited element width");
      if (supplied) {
        const operands = projectNodes(program, (node, ast) => ast.is.IsParameterDeclaration(node)
          ? ["left", "right"].includes(ast.text(ast.name(node)))
          : ast.is.IsIdentifier(node) && ["left", "right"].includes(ast.text(node)) &&
            !ast.is.IsParameterDeclaration(ast.parent(node)));
        const values = operands.filter(node => program.source.facts.values.type(node) !== undefined);
        assert.equal(values.length, 4, "two actual callback declarations and two body reads publish");
        for (const node of values) {
          const outcome = program.source.facts.values.type(node);
          assert.equal(outcome.kind !== "refused" && primitive(outcome.type, family.element), true,
            "the actual parameter and body read use the same inherited native element");
        }
      }
      const calculation = supplied ? family.calculation : "float64";
      assert.equal(primitive(signature?.result, calculation), true, "present contribution or declared generic default");
      assert.equal(signature?.result === publication?.method[0]?.type, true, "one solved method-binder descriptor");
      const receiver = selected?.receiver;
      const receiverType = receiver === undefined ? undefined : program.source.facts.values.type(receiver);
      assert.equal(receiverType !== undefined && receiverType.kind !== "refused" && receiverType.type.kind === "declared" &&
        program.source.syntax.text(program.source.syntax.name(receiverType.type.declaration)) === family.name, true,
      "the actual receiver read is the concrete authored family");
      const result = program.records.nodeTargetType.get(call);
      const element = csharpJsTypedArrayElementTargetType(result);
      assert.equal(result?.kind === "target-named" && result.id === `Tsonic.CSharp.Js.${family.name}` &&
        element?.kind === "source-primitive" && element.name === family.element, true, "exact native result family and element");
      if (supplied) {
        const arrows = projectNodes(program, (node, ast) => ast.is.IsArrowFunction(node));
        assert.equal(arrows.length, 1);
        const native = getCsharpDelegateSignature(program.records.nodeTargetType.get(arrows[0]));
        assert.equal(native?.parameters.length === 2 && native.parameters.every(parameter =>
          parameter.kind === "source-primitive" && parameter.name === family.element), true, "native parameters retain element widths");
        assert.equal(native?.returnType.kind === "source-primitive" && native.returnType.name === calculation, true,
          "native callback result retains the actual calculation");
      }
      const output = [...compiled.artifacts.values()].join("\n");
      assert.doesNotMatch(output, /Convert\.|\(object\)/u);
    });
  }
}

for (const name of ["Uint8Array", "Int32Array", "Float64Array"]) {
  for (const [mode, parameters, expression] of [
    ["numeric array", "values: int32[]", `new ${name}(values)`],
    ["typed array", "values: Uint8Array", `new ${name}(values)`],
    ["enumerable", "values: Set<int32>", `new ${name}(values)`],
    ["buffer view", "buffer: ArrayBuffer", `new ${name}(buffer, 0, 2)`],
  ]) {
    test(`inherited ${name} constructor retains its ${mode} overload`, () => {
      const sourceText = `import type { int32 } from "@tsonic/core/types.js"; export function run(${parameters}): ${name} { return ${expression}; }`;
      const compiled = compileCsharpSource({ surface: "js", sourceText });
      assertCsharpCompilationSucceeded(compiled);
      const program = compiled.result.program;
      const constructions = projectNodes(program, (node, ast) => ast.is.IsNewExpression(node));
      assert.equal(constructions.length, 1);
      const result = program.records.nodeTargetType.get(constructions[0]);
      assert.equal(result?.kind === "target-named" && result.id === `Tsonic.CSharp.Js.${name}`, true,
        "the selected overload consumes the exact published result");
      const output = [...compiled.artifacts.values()].join("\n");
      assert.doesNotMatch(output, /Convert\.|\(object\)/u);
    });
  }
}

for (const [name, declaration, invocation, expected] of [
  ["required absence", "function select<T>(value: T): T { return value; }", "select(undefined)", "absence"],
  ["nullable absent contribution", "function select<T>(value: T | undefined, fallback: T): T { return fallback; }", "select(undefined, 17)", "int64"],
  ["nullable null contribution", "function select<T>(value: T | null, fallback: T): T { return fallback; }", "select(null, 17)", "int64"],
]) {
  test(`generic inference distinguishes ${name} from optional omission`, () => {
    const checked = checkCsharpSource({
      surface: "js",
      sourceText: `${declaration} export function run() { return ${invocation}; }`,
    });
    assert.equal(checked.sourceDiagnosticsText, "");
    assert.equal(checked.extensionDiagnostics.length, 0);
    const source = csharpTestSourceProgram(checked.source);
    const file = checked.source.getSourceFile("/project/index.ts");
    assert.equal(file !== undefined, true);
    const pending = [file];
    const calls = [];
    while (pending.length > 0) {
      const node = pending.pop();
      if (source.syntax.is.IsCallExpression(node)) calls.push(node);
      source.syntax.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
    }
    assert.equal(calls.length, 1);
    const selected = source.facts.selections.call(calls[0]);
    const publication = source.facts.instantiations.at(calls[0]);
    assert.equal(selected !== undefined && publication?.use === calls[0], true, "the same original call publishes its binding");
    const binding = publication?.method[0]?.type;
    assert.equal(expected === "absence"
      ? binding?.kind === "intrinsic" && binding.intrinsic === "absence"
      : primitive(binding, expected), true, "a required absence contributes; a nullable absence does not replace the present binder");
    // The Host instantiation always publishes its result (SourceInstantiation.result); a present binder is the result.
    assert.equal(expected === "absence" ? publication?.result !== undefined : publication?.result === binding, true,
      "absence-only calls publish a result descriptor; present results retain the selected generic descriptor");
  });
}
