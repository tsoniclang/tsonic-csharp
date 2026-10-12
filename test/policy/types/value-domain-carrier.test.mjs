import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram, Node_Initializer } from "@tsonic/target-api/source";
import { createSourceStorageQuery } from "@tsonic/target-api/analysis";
import { csharpValueDomainHasTargetType } from "../../../dist/policy/types/objects/value-domain-carrier.js";
import { csharpEmptyObjectTargetType } from "../../../dist/target-model/types/runtime-carriers.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/nullable.js";
import { substituteObjectShapeFactTargetTypeParameters } from "../../../dist/target-model/types/substitution.js";

function fixture() {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src",
    compilerOptions: { strict: true, target: "es2022", module: "esnext", moduleResolution: "bundler" },
    files: {
      "/src/owner.ts": `
        export class Holder<Value> {
          constructor(public value: Value, public other: Value, public optional?: Value) {}
        }
        export class Stranger<Value> { constructor(public value: Value) {} }
      `,
      "/src/index.ts": `
        import { Holder } from "./owner.js";
        const first = new Holder<object>({}, {});
        const records: Holder<object>[] = [first];
        const pair: [Holder<object>] = [first];
        const selected: object = first.value;
        const optional: object | undefined = first.optional;
      `,
    },
  }).checkSource();
  assert.equal(checked.diagnostics.length, 0, "checked cross-file generic source");
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/src/index.ts");
  const nodes = new Map();
  const visit = node => {
    if (source.ast.is.IsVariableDeclaration(node)) nodes.set(source.ast.text(source.ast.name(node)), node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  const storage = createSourceStorageQuery(source, source.navigation.sourceFiles);
  const first = storage.subject(nodes.get("first"));
  assert.equal(first.kind, "resolved");
  const firstType = storage.typeFor(first.subject);
  assert.equal(firstType.kind, "resolved");
  const queries = source.semantics.forFile(file);
  const relationship = queries.types.structuralMembers(firstType.type, firstType.type);
  assert.equal(relationship.kind, "available");
  const members = new Map(relationship.members.map(pair => [pair.source.property.name, pair.source]));
  return { source, file, storage, nodes, queries, members, firstType: firstType.type };
}

function domain(input, carrier, projection, root = "first", selected = "selected") {
  const node = input.nodes.get(root);
  const origin = input.storage.subject(node, "value", projection);
  assert.equal(origin.kind, "resolved", "exact projection is interned by shared storage");
  const typed = input.storage.typeFor(origin.subject);
  assert.equal(typed.kind, "resolved", "exact projection has checked selected field type");
  const expression = Node_Initializer(input.source.ast, input.nodes.get(selected));
  const host = {
    sourceStorage: { ...input.storage,
      closedOriginsFor: () => ({ kind: "complete", origins: [{ subject: origin.subject, type: typed.type, sourceFile: typed.sourceFile }] }),
    },
    semantics: file => input.source.semantics.forFile(file),
    types: { resolveNode(selectedNode, file) {
      assert.equal(selectedNode === node && file === input.file, true, "retain original physical owner, never resolve field source type");
      return carrier;
    } },
  };
  return { host, expression, origin: origin.subject };
}

const member = input => ({ kind: "member", declaration: input.members.get("value").declarations[0] });

const broad = { kind: "source-primitive", name: "object" };

function shape(input, selected, field = "value", options = {}) {
  const evidence = input.members.get(field);
  const carrier = { kind: "target-named", id: "Physical.Holder", typeArguments: [selected] };
  const member = { sourceName: field, sourceKey: { kind: "property", name: field }, targetName: field,
    sourceSubjects: evidence.declarations, sourceTypes: [evidence.property.type], memberKind: "property",
    type: selected, optional: field === "optional", ...options };
  return { carrier, fact: { targetType: carrier, sourceType: input.firstType, members: [member] } };
}

function selectShape(host, value) {
  host.objectShapes = { resolveTarget(owner) {
    assert.equal(owner === value.carrier, true, "query actual physical owner, including generic arguments");
    return value.fact;
  } };
}

test("member origins use exact physical declarations, not equal source types or field names", () => {
  const input = fixture();
  const exact = csharpEmptyObjectTargetType();
  for (const actual of [exact, broad]) {
    const value = shape(input, actual);
    const selected = domain(input, value.carrier, [member(input)]);
    selectShape(selected.host, value);
    assert.equal(csharpValueDomainHasTargetType(selected.host, selected.expression, exact), actual === exact);
  }
  const value = shape(input, exact, "value", { sourceSubjects: [input.members.get("other").declarations[0]] });
  const selected = domain(input, value.carrier, [member(input)]);
  selectShape(selected.host, value);
  assert.equal(csharpValueDomainHasTargetType(selected.host, selected.expression, exact), false, "same spelling cannot replace declaration identity");
});

test("member projection composes with exact array and tuple physical owners", () => {
  const input = fixture();
  const exact = csharpEmptyObjectTargetType();
  const value = shape(input, exact);
  for (const [root, carrier, prefix] of [
    ["records", { kind: "array", element: value.carrier }, { kind: "array-element" }],
    ["pair", { kind: "tuple", elements: [value.carrier] }, { kind: "tuple-element", index: 0 }],
  ]) {
    const selected = domain(input, carrier, [prefix, member(input)], root);
    selectShape(selected.host, value);
    assert.equal(csharpValueDomainHasTargetType(selected.host, selected.expression, exact), true, root);
  }
});

test("optional physical fields retain their native absence carrier", () => {
  const input = fixture();
  const exact = csharpEmptyObjectTargetType();
  const absent = csharpNullableTargetType(exact);
  const value = shape(input, absent, "optional");
  const projection = [{ kind: "member", declaration: input.members.get("optional").declarations[0] }];
  const selected = domain(input, value.carrier, projection, "first", "optional");
  selectShape(selected.host, value);
  assert.equal(csharpValueDomainHasTargetType(selected.host, selected.expression, exact), false, "no erasure of optional field storage");
  assert.equal(csharpValueDomainHasTargetType(selected.host, selected.expression, absent), true);
});

test("nominal generic fields use the physical instantiation and exact checked property", () => {
  const input = fixture();
  const parameter = { kind: "type-parameter", name: "Value", identity: "/src/owner.ts:Holder:Value" };
  const exact = csharpEmptyObjectTargetType();
  const template = shape(input, parameter);
  for (const [root, prefix] of [["first", []], ["records", [{ kind: "array-element" }]], ["pair", [{ kind: "tuple-element", index: 0 }]]]) {
    for (const physical of [exact, broad]) {
      const fact = substituteObjectShapeFactTargetTypeParameters(template.fact, new Map([[parameter.identity, physical]]));
      const owner = fact.targetType;
      const carrier = root === "records" ? { kind: "array", element: owner }
        : root === "pair" ? { kind: "tuple", elements: [owner] } : owner;
      const selected = domain(input, carrier, [...prefix, member(input)], root);
      let calls = 0;
      selected.host.objectShapes = { resolveTarget(actualOwner) {
        calls += 1;
        assert.equal(actualOwner === owner, true, "exact physical generic instance");
        assert.equal(fact.members[0].sourceSubjects[0] === input.members.get("value").declarations[0], true, "exact generic declaration");
        assert.equal(fact.members[0].sourceTypes[0] === input.members.get("value").property.type, true, "source evidence retained independently");
        return fact;
      } };
      assert.equal(csharpValueDomainHasTargetType(selected.host, selected.expression, exact), physical === exact);
      assert.equal(calls, 1, "one physical projection, not a second source type resolver");
    }
  }
});

test("member proofs fail closed for unavailable, accessor and exhausted evidence", () => {
  const input = fixture();
  const exact = csharpEmptyObjectTargetType();
  for (const control of ["missing", "accessor", "method", "budget", "open", "ambiguous"]) {
    const value = shape(input, exact, "value", control === "accessor"
      ? { accessor: { getter: true, setter: false } } : control === "method" ? { memberKind: "method" } : {});
    const selected = domain(input, value.carrier, [member(input)]);
    selectShape(selected.host, value);
    if (control === "missing") selected.host.objectShapes = { resolveTarget: () => undefined };
    if (control === "ambiguous") value.fact.members.push({ ...value.fact.members[0], targetName: "different" });
    if (control === "budget") selected.host.sourceStorage.failureReason = () => "bounded failure";
    if (control === "open") selected.host.sourceStorage.closedOriginsFor = () => ({ kind: "open", origins: [] });
    assert.equal(csharpValueDomainHasTargetType(selected.host, selected.expression, exact), false, control);
  }
});
