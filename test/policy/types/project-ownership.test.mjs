// Project type ownership in the one descriptor -> TargetTypeRef mapping (nextgen C-2542, I2, I6).
// A declared descriptor maps to a generated project type only through the C# project-type catalog. A foreign
// declaration (provider type literal, profile mapped type, native class/interface, profile alias) is never classified
// by asking a checker or the Host value facts again; without a project definition, profile carrier or provider
// binding it is one .NET refusal.
import assert from "node:assert/strict";
import test from "node:test";
import { csharpRepresentationContext, representSourceType } from "../../../dist/representation/index.js";
import { hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";

const untouched = new Proxy({}, { get: (_target, key) => { throw new Error(`Host facts must not be read (${String(key)}).`); } });
const syntax = new Proxy({}, { get: (_target, key) => key === "is" || key === "as"
  ? new Proxy({}, { get: () => () => false }) : () => undefined });

test("project type classification rejects foreign declarations before any Source query", () => {
  for (const kind of ["provider-type-literal", "source-profile-mapped-type", "native-interface", "native-class", "source-profile-alias"]) {
    const declaration = Object.freeze({ kind });
    const site = Object.freeze({ kind: "site" });
    const selected = [];
    const services = Object.freeze({
      facts: untouched, syntax, profile: "native", sourceFacts: Object.freeze({ getFact: () => undefined }),
      platform: Object.freeze({ nativeIntegerBits: 64, targetFramework: "net10.0" }),
      projectTypes: Object.freeze({
        definitionForDeclaration(node) { selected.push(node); return undefined; },
        targetTypeForDeclaration: () => assert.fail("a foreign declaration has no project target type"),
      }),
      providers: Object.freeze({ resolveType: () => assert.fail("no provider fact was published for this declaration") }),
    });
    const result = representSourceType(Object.freeze({ kind: "declared", declaration, typeArguments: Object.freeze([]) }),
      csharpRepresentationContext(services, site, "storage"));
    assert.equal(result.kind, "csharp-refused", kind);
    assert.equal(result.code, "CSHARP_DECLARATION_BINDING");
    assert.equal(result.site, site, "the refusal names the representing occurrence");
    assert.deepEqual(selected, [declaration], "the project catalog is asked exactly once, for the declaration itself");
  }
});

test("a project class declaration maps through the project catalog, with its Host type arguments", () => {
  const program = hostProgram(`
export class Box<T> { constructor(public value: T) {} }
export function make(): Box<string> { return new Box("x"); }
`);
  const make = program.named("make");
  const result = program.callableReturn(make);
  assert.equal(result.kind, "declared");
  assert.equal(result.declaration, program.named("Box"), "the Host descriptor names the project declaration");
  const carrier = represented(representations(representationServices(program)).type(result, make, "return"));
  assert.equal(carrier.kind === "target-named" && carrier.id === "global::Fixture.Box", true);
  assert.equal(carrier.typeArguments?.length, 1);
  assert.equal(carrier.typeArguments[0].id, "System.String", "the type argument is the represented Host argument");
});
