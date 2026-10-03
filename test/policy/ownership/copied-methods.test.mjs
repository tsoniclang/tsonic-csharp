import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpCopiedMethodReceiver } from "../../../dist/policy/ownership/copied-methods.js";
import { csharpSourcePrimitiveTargetType, csharpDelegateTargetType, csharpTargetNamedType } from "../../../dist/target-model/types/index.js";

const integer = csharpSourcePrimitiveTargetType("int32");
const declaration = { kind: "KindMethodDeclaration", usesThis: true };
const ast = {
  is: { IsMethodDeclaration: node => node.kind === "KindMethodDeclaration" },
  body: node => node.kind === "KindMethodDeclaration" ? { kind: "KindBlock", usesThis: node.usesThis } : undefined,
  kindName: node => node.kind,
  children: node => node.kind === "KindBlock" && node.usesThis ? [{ kind: "KindThisKeyword" }] : [],
};
const owner = csharpTargetNamedType("fixture:NativeReceiver", [], { kind: "named", name: "NativeReceiver" });
const method = { sourceKey: { kind: "property", name: "identity" }, sourceName: "identity", targetName: "identity",
  memberKind: "method", type: csharpDelegateTargetType("System.Func", [integer], integer),
  methodValueContract: owner, sourceDeclarations: [declaration] };
const field = { sourceKey: { kind: "property", name: "count" }, sourceName: "count", targetName: "count",
  memberKind: "property", type: integer };
const source = { targetType: owner, members: [field, method], methodImplementation: {
  identity: "authored:identity", declaration: {}, captures: [], methods: [declaration],
} };

test("C# receiver-preserving copies reuse only one exact closed native implementation", () => {
  const selected = selectCsharpCopiedMethodReceiver([method, field], [source], ast);
  assert.equal(selected.kind, "selected");
  assert.equal(selected.shape === source, true);
  for (const members of [[method], [method, { ...field, optional: true }],
    [method, { ...field, type: csharpSourcePrimitiveTargetType("int64") }],
    [{ ...method, sourceDeclarations: [declaration, { ...declaration }] }, field],
    [{ ...method, sourceDeclarations: [{ ...declaration }] }, field]]) {
    assert.equal(selectCsharpCopiedMethodReceiver(members, [source], ast).kind, "rejected");
  }
  assert.equal(selectCsharpCopiedMethodReceiver(source.members, [source, { ...source,
    targetType: csharpTargetNamedType("fixture:OtherReceiver", [], { kind: "named", name: "OtherReceiver" }) }], ast).kind, "rejected");
  assert.equal(selectCsharpCopiedMethodReceiver(source.members, [source, { ...source,
    methodImplementation: { ...source.methodImplementation, identity: "other" } }], ast).kind, "rejected");
  assert.equal(selectCsharpCopiedMethodReceiver(source.members, [{ ...source, methodImplementation: undefined }], ast).kind, "none");
  const independent = { ...declaration, usesThis: false };
  assert.equal(selectCsharpCopiedMethodReceiver([{ ...method, sourceDeclarations: [independent] }, field],
    [{ ...source, members: [{ ...method, sourceDeclarations: [independent] }, field],
      methodImplementation: { ...source.methodImplementation, methods: [independent] } }], ast).kind, "none");
});
