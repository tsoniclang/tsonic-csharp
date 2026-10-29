import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`native ${surface} Error binding reads retain checked native members, defaults, identity and zero allocation`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      let sequence = 0;
      function fallback(): string { sequence = sequence * 10 + 2; return "absent"; }
      function original(value: Error): Error { sequence = sequence * 10 + 1; return value; }
      export function message({ message: renamed }: Error): string { return renamed; }
      export function name({ name }: Error): string { return name; }
      export function stack({ stack }: Error): string | undefined { return stack; }
      export function defaulted({ message: first = fallback(), stack: second = fallback() }: Error): string {
        return first + ":" + second;
      }
      export function order(value: Error): number {
        sequence = 0;
        const { message: first, stack: second = fallback() } = original(value);
        return first === "live" && second === "absent" ? sequence : -1;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const { program } = compiled.result;
    const { source } = program;
    const expected = new Map([
      ["message", "System.Exception.Message"],
      ["name", "Tsonic.CSharp.Runtime.ErrorObject.name"],
      ["stack", "Tsonic.CSharp.Runtime.ErrorObject.stack"],
    ]);
    for (const [name, memberId] of expected) {
      const declaration = source.navigation.nodes.find(node => source.ast.is.IsFunctionDeclaration(node) &&
        source.ast.text(source.ast.name(node)) === name);
      assert.equal(declaration !== undefined, true, `${name}: one actual authored declaration`);
      const parameter = source.ast.parameters(declaration)[0];
      const contract = program.records.callableDeclaration.get(declaration)?.contract;
      assert.equal(contract?.nativeParameters.length === 1 && contract.nativeParameters[0].sourceParameter === parameter, true,
        `${name}: the one original signature slot owns the native formal`);
      const carrier = contract.nativeParameters[0].targetParameter.type;
      assert.equal(carrier.kind === "target-named" && (carrier.id === "System.Exception" || carrier.id.endsWith("::System.Exception")), true,
        `${name}: the natural readonly formal retains its real native Exception ABI`);
      const pattern = source.ast.name(parameter);
      const fact = program.records.bindingPatternProjection.get(pattern)?.source;
      assert.equal(fact?.kind === "native-source", true, `${name}: native input is not relabelled as a source-owned shape`);
      const element = source.ast.elements(pattern)[0];
      const projection = program.records.bindingPatternProjection.get(element)?.element;
      assert.equal(projection?.kind === "native-member" && projection.property.member.id.endsWith(memberId), true,
        `${name}: the original checked member admits the exact native property/helper`);
      assert.equal(Object.isFrozen(projection) && Object.isFrozen(projection.property), true,
        `${name}: the source/member decision is immutable before rendering`);
    }
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(generated, /DynamicInvoke|System\.Reflection|FrozenObject|new .*ErrorObject/u,
      "native binding does not add a wrapper, reflection or runtime freeze state");
    executeCsharpConstruction(compiled, `native-error-bindings-${surface}`, false, false, [], `
using System;
using Generated = Tsonic.Generated.Index;
var writable = new Tsonic.CSharp.Runtime.Error("before");
Exception readonlyView = writable;
Exception immutable = new InvalidOperationException("native");
if (Generated.message(immutable) != "native" || Generated.name(immutable) != "InvalidOperationException" ||
    Generated.stack(immutable) is not null) throw new Exception("native readonly binding");
writable.message = "live";
if (Generated.message(readonlyView) != "live" || Generated.defaulted(readonlyView) != "live:absent" || Generated.order(writable) != 12)
    throw new Exception("live identity, default timing or source evaluation");
for (var index = 0; index < 1000; index++) {
    if (Generated.message(readonlyView) != "live" || Generated.name(readonlyView) != writable.name || Generated.stack(readonlyView) is not null)
        throw new Exception("native binding warmup");
}
var before = GC.GetAllocatedBytesForCurrentThread();
for (var index = 0; index < 10000; index++) {
    if (Generated.message(readonlyView) != "live" || Generated.name(readonlyView) != writable.name || Generated.stack(readonlyView) is not null)
        throw new Exception("native binding identity");
}
if (GC.GetAllocatedBytesForCurrentThread() != before) throw new Exception("native binding allocation");
if (writable.message != "live") throw new Exception("binding copied or replaced the original native object");
`);
  });
}
