import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpNativeTypeIdentity, targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { createCsharpMetadataBudget, CsharpMetadataResourceLimitFailure } from "../../../dist/target-model/metadata/immutable.js";

const primitive = name => Object.freeze({ kind: "source-primitive", name });
const named = (id, typeArguments) => Object.freeze({ kind: "target-named", id,
  typeArguments: Object.freeze(typeArguments), csharpAllowsRefLikeTypeArguments: Object.freeze(typeArguments.map(() => false)) });

for (const purpose of ["physical", "emission", "storage"]) {
  test(`${purpose} program identity charges first work once across shared Pair children and distinct wrappers`, () => {
    const dimensions = [16, 32, 64];
    assert.deepEqual(dimensions, [16, 32, 64], "the complete scaling domain precedes actual inventory checks");
    const work = [];
    for (const dimension of dimensions) {
      const budget = createCsharpMetadataBudget();
      const owner = createCsharpNativeTypeIdentity(budget);
      const key = value => purpose === "storage" ? owner.storageKey(value) : owner.key(value, purpose);
      const leaf = primitive("int32");
      const nodes = [leaf];
      let child = leaf;
      for (let index = 0; index < dimension; index += 1) {
        child = named("fixture.Pair`2", [child, child]);
        nodes.push(child);
      }
      const wrappers = Array.from({ length: dimension }, (_, index) => named(`fixture.Wrapper${index}\`1`, [child]));
      assert.equal(nodes.length, dimension + 1, "every shared physical Pair level remains present");
      assert.equal(wrappers.length, dimension, "every separately requested wrapper remains present");
      const initial = budget.remaining();
      const keys = wrappers.map(key);
      const domain = [...nodes, ...wrappers].map(key);
      assert.equal(new Set(domain).size, 2 * dimension + 1,
        "the complete expected leaf/Pair/wrapper key domain must exist before work is compared");
      work.push(initial - budget.remaining());
      const completed = budget.remaining();
      assert.deepEqual(wrappers.map(key), keys);
      assert.equal(budget.remaining(), completed, "completed graph lookup does not charge or re-expand a shared subtree");
      assert.equal(key(named("fixture.Pair`2", [child, child])),
        key(named("fixture.Pair`2", [child, child])), "equal separate parent objects have one content identity");
      assert.notEqual(key(named("fixture.Pair`2", [child, primitive("int64")])),
        key(named("fixture.Pair`2", [primitive("int64"), child])), "both ordered Native child positions are authoritative");
    }
    assert.equal(work.length, dimensions.length);
    assert.equal(work[1] < work[0] * 3 && work[2] < work[1] * 3, true,
      "doubling the complete shared graph keeps first work linear, not wrappers times shared subtree");
  });
}

test("one program identity preserves scoped binders, SZ-array rank presence and lookup-only sealing", () => {
  const owner = createCsharpNativeTypeIdentity(createCsharpMetadataBudget());
  const first = Object.freeze({ kind: "type-parameter", identity: "original:first", name: "First" });
  const second = Object.freeze({ kind: "type-parameter", identity: "original:second", name: "Second" });
  const firstScope = new Map([[first.identity, 0]]);
  const secondScope = new Map([[second.identity, 0]]);
  assert.equal(owner.scopedKey(first, firstScope), owner.scopedKey(second, secondScope));
  assert.notEqual(owner.key(first), owner.key(second), "independent original binders remain distinct outside their scope");
  const element = primitive("int32");
  const vector = Object.freeze({ kind: "array", element });
  const rectangular = Object.freeze({ kind: "array", element, rank: 1 });
  assert.notEqual(owner.key(vector), owner.key(rectangular), "SZ vector is not CLR rank-one [*]");
  const annotated = Object.freeze({ ...named("fixture.Reference`1", [element]), csharpNullableReference: true });
  const present = named("fixture.Reference`1", [element]);
  assert.notEqual(owner.key(annotated), owner.key(present), "physical admission retains the reference annotation");
  assert.equal(owner.storageKey(annotated), owner.storageKey(present), "the same canonical storage comparison ignores only CLR reference annotations");
  assert.notEqual(owner.storageKey(vector), owner.storageKey(rectangular), "storage identity retains the actual CLR array kind");
  assert.equal(targetTypeRefEquals(owner, vector, vector), true);
  assert.equal(targetTypeRefKey(owner, vector), owner.key(vector));
  const completed = owner.key(vector, "emission");
  const sealed = owner.seal();
  assert.equal(sealed.key(vector, "emission"), completed);
  assert.equal(sealed.scopedKey(first, firstScope), sealed.scopedKey(second, secondScope));
  assert.throws(() => sealed.key(primitive("uint32")), /already-enrolled|new type identity/u);
  assert.throws(() => owner.seal(), /exactly once/u);
  assert.throws(() => targetTypeRefKey(vector), TypeError, "the superseded ownerless identity form has no fallback");
});

test("canonical Native identity forwards the original finite-resource failure before node publication", () => {
  const budget = createCsharpMetadataBudget();
  const failure = new CsharpMetadataResourceLimitFailure("original Native identity resource", "entries", 1);
  let exhausted = false;
  const owner = createCsharpNativeTypeIdentity({ remaining: budget.remaining,
    reserve(entries, depth) { if (exhausted) throw failure; budget.reserve(entries, depth); } });
  exhausted = true;
  assert.throws(() => owner.key(named("fixture.Pair`2", [primitive("int32"), primitive("int32")])),
    error => error === failure, "no cutoff, replacement refusal, fallback key or partially completed root");
});
