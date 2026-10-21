import assert from "node:assert/strict";
import test from "node:test";
import { csharpTargetTypeRenderingRejection, csharpTargetTypeRendersAsUnqualifiedIdentifier } from "../../../dist/policy/types/model/renderability.js";
import { csharpTypeFromTargetTypeRef } from "../../../dist/backend/planner/types/render.js";
import { csharpRuntimeUnionTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpVoidTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

const integer = { kind: "source-primitive", name: "int32" };
const opaque = { kind: "opaque", id: "unrenderable" };
const named = (shape = { kind: "named", name: "Carrier" }, typeArguments = []) => ({
  kind: "target-named", id: "Control", csharpAllowsRefLikeTypeArguments: typeArguments.map(() => false), typeArguments, csharpRender: shape,
});
const plain = named();
const pointer = (args, result = csharpVoidTargetType(), abi) => ({ kind: "function-pointer", args, result, ...(abi === undefined ? {} : { abi }) });
const binder = name => ({ kind: "type-parameter", identity: "binder", name });
const method = owner => ({ ...plain, csharpMethodValue: {
  owner, method: "read", identity: "read", contract: named(), typeParameters: [], allowsRefLikeTypeArguments: [],
} });

const reasons = [
  ["opaque", opaque, plain],
  ["missing-render-shape", { kind: "target-named", id: "NoNativeRender", csharpAllowsRefLikeTypeArguments: [] }, plain],
  ["predefined-arity", named({ kind: "predefined", name: "int" }, [integer]), named({ kind: "predefined", name: "int" })],
  ["nullable-arity", named({ kind: "nullable" }), named({ kind: "nullable" }, [integer])],
  ["invalid-name", named({ kind: "named", name: "not-a-name" }), plain],
  ["using-namespace", named({ kind: "named", name: "Carrier", usingNamespace: [] }), named({ kind: "named", name: "Carrier", usingNamespace: ["Native"] })],
  ["segment-arity", named({ kind: "named", name: "Carrier", genericArity: 1 }), named({ kind: "named", name: "Carrier", genericArity: 1 }, [integer])],
  ["extern-alias", named({ kind: "named", name: "Carrier", externAlias: "$alias" }), named({ kind: "named", name: "Carrier", externAlias: "Native" })],
  ["type-parameter-name", binder("$value"), binder("Value")],
  ["function-pointer-abi", pointer([], csharpVoidTargetType(), ["managed", "Cdecl"]), pointer([], csharpVoidTargetType(), ["unmanaged", "Cdecl"])],
];

function agrees(type, label, expectedReason, names) {
  const rejection = csharpTargetTypeRenderingRejection(type);
  assert.equal(rejection?.reason, expectedReason, `${label}: exact admission reason`);
  let syntax;
  if (expectedReason === "invalid-name") {
    assert.throws(() => csharpTypeFromTargetTypeRef(type, names), /Invalid C# identifier/u, `${label}: original renderer refusal`);
  } else syntax = csharpTypeFromTargetTypeRef(type, names);
  assert.equal(rejection === undefined, syntax !== undefined, `${label}: admission and rendering agree`);
  assert.equal(csharpTargetTypeRendersAsUnqualifiedIdentifier(type), syntax?.kind === "IdentifierName", `${label}: exact physical unqualified-name rule`);
}

test("every renderability rejection reason has its own rejected and accepted twin", () => {
  assert.deepEqual(reasons.map(([reason]) => reason).sort(), ["extern-alias", "function-pointer-abi", "invalid-name", "missing-render-shape",
    "nullable-arity", "opaque", "predefined-arity", "segment-arity", "type-parameter-name", "using-namespace"].sort());
  for (const [reason, rejected, accepted] of reasons) {
    agrees(rejected, reason, reason);
    agrees(accepted, `${reason} accepted twin`, undefined);
  }
});

test("all native type kinds and every rendered recursive component retain the same admission domain", () => {
  const containers = [
    ["generic argument", inner => named({ kind: "named", name: "Carrier", genericArity: 1 }, [inner])],
    ["array element", inner => ({ kind: "array", element: inner, rank: 2 })],
    ["tuple element", inner => ({ kind: "tuple", elements: [integer, inner] })],
    ["pointer pointee", inner => ({ kind: "pointer", pointee: inner })],
    ["function pointer argument", inner => pointer([inner])],
    ["function pointer result", inner => pointer([integer], inner)],
    ["method physical owner", inner => method(inner)],
    ["native union payload", inner => csharpRuntimeUnionTargetType([integer, inner], [undefined, { targetType: inner, members: [] }])],
  ];
  for (const [name, wrap] of containers) {
    agrees(wrap(opaque), `${name} rejects its real opaque component`, "opaque");
    agrees(wrap(plain), `${name} accepted twin`, undefined);
  }
  agrees(integer, "source primitive", undefined);
  agrees(binder("Value"), "physical type parameter", undefined);
  agrees(csharpVoidTargetType(), "canonical native void", undefined);
  const never = { kind: "target-named", id: "Tsonic.CSharp.Runtime.Never", csharpAllowsRefLikeTypeArguments: [],
    csharpRender: { kind: "named", name: "Never", usingNamespace: ["Tsonic", "CSharp", "Runtime"] } };
  agrees(never, "native Never", undefined);
});

test("named segment arity, namespace and alias interactions have independent controls", () => {
  const controls = [
    ["nested arguments", named({ kind: "named", name: "Outer", genericArity: 1, nested: [{ name: "Inner", genericArity: 1 }] }, [integer, plain]), undefined],
    ["missing nested argument", named({ kind: "named", name: "Outer", genericArity: 1, nested: [{ name: "Inner", genericArity: 1 }] }, [integer]), "segment-arity"],
    ["surplus nested argument", named({ kind: "named", name: "Outer", nested: [{ name: "Inner" }] }, [integer]), "segment-arity"],
    ["all nested arguments consumed", named({ kind: "named", name: "Outer", nested: [{ name: "Inner" }] }), undefined],
    ["surplus nullable argument", named({ kind: "nullable" }, [integer, plain]), "nullable-arity"],
    ["namespace and using", named({ kind: "named", name: "Carrier", namespace: ["Native"], usingNamespace: ["Other"] }), "using-namespace"],
    ["alias and using", named({ kind: "named", name: "Carrier", externAlias: "Native", usingNamespace: ["Other"] }), "using-namespace"],
    ["qualified alias", named({ kind: "named", name: "Carrier", externAlias: "Native", namespace: ["Assembly"] }), undefined],
    ["invalid namespace", named({ kind: "named", name: "Carrier", namespace: ["not-a-name"] }), "invalid-name"],
    ["invalid using namespace", named({ kind: "named", name: "Carrier", usingNamespace: ["not-a-name"] }), "invalid-name"],
    ["invalid nested name", named({ kind: "named", name: "Outer", nested: [{ name: "not-a-name" }] }), "invalid-name"],
    ["escaped native keyword", named({ kind: "named", name: "class" }), undefined],
  ];
  for (const [name, carrier, reason] of controls) agrees(carrier, name, reason);
});

test("function pointer ABI vocabulary is the actual shared native convention contract", () => {
  for (const abi of [undefined, [], ["target-default"], ["managed"], ["unmanaged"],
    ...["Cdecl", "Fastcall", "MemberFunction", "Stdcall", "SuppressGCTransition", "Swift", "Thiscall"].map(name => ["unmanaged", name])]) {
    agrees(pointer([integer], csharpVoidTargetType(), abi), `accepted ABI ${JSON.stringify(abi)}`, undefined);
  }
  for (const abi of [["unknown"], ["target-default", "Cdecl"], ["managed", "Cdecl"], ["unmanaged", "unknown"]]) {
    agrees(pointer([integer], csharpVoidTargetType(), abi), `rejected ABI ${JSON.stringify(abi)}`, "function-pointer-abi");
  }
});

test("the matrix states the physical binder domain and keeps contextual owner unification assigned to C03", () => {
  const physical = binder("Value");
  agrees(physical, "valid identity scope mapping", undefined, new Map([["binder", "OtherValue"]]));
  const authored = binder("$value");
  assert.equal(csharpTargetTypeRenderingRejection(authored)?.reason, "type-parameter-name", "an invalid raw name is outside admission's physical-name domain");
  assert.equal(csharpTypeFromTargetTypeRef(authored, new Map([["binder", "Value"]]))?.kind, "IdentifierName",
    "the renderer's extra physical scope map is an explicit C02-M2-RENDER-OWNER obligation, not a false agreement claim");
});
