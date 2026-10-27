import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`a declared native interface method keeps method storage when its implementations need exact native return bridges on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32 } from "@tsonic/core/types.js";
interface NumberReader { read(): number; }
export class Direct implements NumberReader { read(): int32 { return 7; } }
class Base { read(): int32 { return 13; } }
export class Inherited extends Base implements NumberReader {}
class Parent {}
class Child extends Parent {}
interface ReferenceReader { read(): Parent; }
export class Reference implements ReferenceReader {
  value: Child = new Child();
  read(): Child { return this.value; }
}
export function direct(value: Direct): number { const reader: NumberReader = value; return reader.read(); }
export function inherited(value: Inherited): number { const reader: NumberReader = value; return reader.read(); }
export function reference(value: Reference): boolean {
  const reader: ReferenceReader = value;
  return reader.read() === value.value;
}
` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    assert.equal(program !== undefined, true, "native interface implementation evidence is published before planning");
    const interfaces = program.objectShapes.knownShapes().filter(shape => shape.targetType.kind === "target-named" &&
      shape.targetType.csharpSourceDeclarationKind === "interface");
    assert.equal(interfaces.length >= 2, true, "numeric and reference native method obligations are both observed");
    for (const shape of interfaces) {
      for (const member of shape.members.filter(member => member.memberKind === "method")) {
        assert.equal(member.methodValueStorage === undefined, true,
          "a declared native method is not reclassified as an externally supplied mutable delegate slot");
      }
    }
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.equal((generated.match(/double NumberReader\.read\(/gu) ?? []).length, 2,
      "the direct and inherited int32 bodies each get one exact native numeric bridge");
    assert.equal((generated.match(/Parent ReferenceReader\.read\(/gu) ?? []).length, 1,
      "reference covariance retains one exact native interface bridge");
    executeCsharpConstruction(compiled, `native-interface-method-storage-${surface}`, false, false, [], `
if (Tsonic.Generated.Index.direct(new Tsonic.Generated.Direct()) != 7 ||
    Tsonic.Generated.Index.inherited(new Tsonic.Generated.Inherited()) != 13 ||
    !Tsonic.Generated.Index.reference(new Tsonic.Generated.Reference()))
    throw new System.Exception("native interface method bridge and identity");
`);
  });
}
