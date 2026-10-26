import assert from "node:assert/strict";
import test from "node:test";
import { substituteTargetTypeParameters } from "../../../dist/policy/types/resolution/substitution.js";
import { csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType,
  getCsharpRuntimeUnionArms, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

const value = Object.freeze({ kind: "type-parameter", identity: "native-union:Value", name: "Value" });
const other = Object.freeze({ kind: "type-parameter", identity: "native-union:Other", name: "Other" });
const integer = csharpSourcePrimitiveTargetType("int32");
const text = csharpStringTargetType();

test("checked native Promise results join source payloads before selecting the Task carrier", () => {
  const compiled = compileCsharpSource({ sourceText:
    "export function chain(): Promise<number> {\n" +
    "  return Promise.resolve(1).then((value: number): number => value + 1);\n" +
    "}\n",
  });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.targetDiagnostics.map(diagnostic => [diagnostic.code, diagnostic.message]), [[
    "CSHARP_UNSUPPORTED_AST",
    "Declaration/provider identifier 'Promise' requires a selected target operation or type-position usage before C# emission.",
  ]], "the unsupported native continuation retains its actual declaration refusal, not an invented invariant Task<Union<double,double>> result");
  assert.equal(compiled.artifacts.size, 0, "unsupported native continuation calls publish no target artifacts");
});

for (const depth of [1, 2, 4]) {
  for (const [name, replacement] of [["equal payload", integer], ["reference payload", text], ["open payload", other]]) {
    test(`native union substitution retains arity and declaration order: ${name}, depth ${depth}`, () => {
      let open = value;
      let expected = replacement;
      for (let index = 0; index < depth; index += 1) {
        open = csharpRuntimeUnionTargetType([integer, open]);
        expected = csharpRuntimeUnionTargetType([integer, expected]);
      }
      const selected = substituteTargetTypeParameters(open, new Map([[value.identity, replacement]]));
      assert.equal(targetTypeRefEquals(selected, expected), true, "native type arguments and nested arm metadata retain the declared ABI");
      let nested = selected;
      for (let index = 0; index < depth; index += 1) {
        const arms = getCsharpRuntimeUnionArms(nested);
        assert.equal(nested.kind === "target-named" && nested.id === "Tsonic.CSharp.Runtime.Union`2" &&
          nested.typeArguments.length === 2 && arms.length === 2 && targetTypeRefEquals(arms[0], integer), true,
        "every native generic struct retains both ordered slots, including identical closed arguments");
        nested = arms[1];
      }
      assert.equal(targetTypeRefEquals(nested, replacement), true, "the original final payload is substituted, never boxed or flattened");
    });
  }
}

test("native union substitution retains duplicate payload slots inside invariant array and tuple positions", () => {
  const payload = csharpRuntimeUnionTargetType([value, other]);
  const type = Object.freeze({ kind: "tuple", elements: Object.freeze([
    Object.freeze({ kind: "array", element: payload }), payload,
  ]) });
  const selected = substituteTargetTypeParameters(type, new Map([[value.identity, text], [other.identity, text]]));
  const expected = csharpRuntimeUnionTargetType([text, text]);
  assert.equal(selected.kind === "tuple" && selected.elements[0].kind === "array" &&
    targetTypeRefEquals(selected.elements[0].element, expected) && targetTypeRefEquals(selected.elements[1], expected), true,
  "native Union<string,string> remains the element and tuple payload instead of becoming string");
});
