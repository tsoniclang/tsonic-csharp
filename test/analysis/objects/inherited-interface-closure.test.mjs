import test from "node:test";
import assert from "node:assert/strict";
import { collectCsharpInheritedInterfaces } from "../../../dist/analysis/objects/structural-interfaces.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";

const carrier = (id, kind = "interface", typeArguments = []) => ({
  kind: "target-named", id, typeArguments, csharpSourceDeclarationKind: kind,
});

function collect(source, shapes, parents) {
  return collectCsharpInheritedInterfaces({
    projectTypes: { directSupertypes: type => parents.get(targetTypeRefKey(type)) },
  }, source, type => shapes.get(targetTypeRefKey(type)));
}

test("native base inheritance includes generated interface contracts as well as authored bases", () => {
  const derived = carrier("test.Derived", "class");
  const base = carrier("test.Base", "class");
  const view = carrier("test.View");
  const protocol = carrier("test.MethodProtocol");
  const source = { targetType: derived, members: [] };
  const shapes = new Map([
    [targetTypeRefKey(base), { targetType: base, members: [], implements: [view] }],
    [targetTypeRefKey(view), { targetType: view, members: [], implements: [protocol] }],
  ]);
  const selected = collect(source, shapes, new Map([[targetTypeRefKey(derived), [base]]]));
  for (const type of [base, view, protocol]) {
    assert.equal(selected.all.has(targetTypeRefKey(type)), true, "the full native ancestor contract is retained");
    assert.equal(selected.nativeBase.has(targetTypeRefKey(type)), true, "a native superclass already supplies this implementation");
  }
});

test("an implemented interface does not become a native superclass implementation", () => {
  const derived = carrier("test.Derived", "class");
  const view = carrier("test.View");
  const protocol = carrier("test.MethodProtocol");
  const source = { targetType: derived, members: [], implements: [view] };
  const shapes = new Map([[targetTypeRefKey(view), { targetType: view, members: [], implements: [protocol] }]]);
  const selected = collect(source, shapes, new Map());
  assert.equal(selected.all.has(targetTypeRefKey(protocol)), true, "the interface still requires its inherited protocol");
  assert.equal(selected.nativeBase.has(targetTypeRefKey(protocol)), false, "the class must supply the protocol itself");
});

test("native inheritance preserves exact closed generic interface arguments", () => {
  const derived = carrier("test.Derived", "class");
  const base = carrier("test.Base", "class");
  const actual = carrier("test.View", "interface", [{ kind: "source-primitive", name: "int32" }]);
  const other = carrier("test.View", "interface", [{ kind: "source-primitive", name: "string" }]);
  const source = { targetType: derived, members: [] };
  const shapes = new Map([[targetTypeRefKey(base), { targetType: base, members: [], implements: [actual] }]]);
  const selected = collect(source, shapes, new Map([[targetTypeRefKey(derived), [base]]]));
  assert.equal(selected.nativeBase.has(targetTypeRefKey(actual)), true, "the actual closed implementation is inherited");
  assert.equal(selected.nativeBase.has(targetTypeRefKey(other)), false, "a different closed interface is never inferred");
});

test("a later native-base path strengthens an earlier ordinary interface path", () => {
  const derived = carrier("test.Derived", "class");
  const base = carrier("test.Base", "class");
  const view = carrier("test.View");
  const protocol = carrier("test.MethodProtocol");
  const source = { targetType: derived, members: [], implements: [view] };
  const shapes = new Map([
    [targetTypeRefKey(base), { targetType: base, members: [], implements: [view] }],
    [targetTypeRefKey(view), { targetType: view, members: [], implements: [protocol] }],
  ]);
  const selected = collect(source, shapes, new Map([[targetTypeRefKey(derived), [base]]]));
  assert.equal(selected.nativeBase.has(targetTypeRefKey(view)), true, "the later superclass path retains its provenance");
  assert.equal(selected.nativeBase.has(targetTypeRefKey(protocol)), true, "the provenance reaches every inherited protocol");
});
