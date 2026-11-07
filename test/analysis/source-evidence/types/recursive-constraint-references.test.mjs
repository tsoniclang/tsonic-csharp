import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { csharpSourceTypeParameter } from "../../../../dist/source/extension/type-parameters.js";
import { csharpProjectedType } from "../../../../dist/target-model/types/projections.js";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTargetNamedType } from "../../../../dist/target-model/types/factories.js";
import { createCsharpSourceTypeParameterEnvironment } from "../../../../dist/analysis/source-evidence/types/resolution/type-parameter-environment.js";
import { closeCsharpOwnerTypeParameterEnvironment } from "../../../../dist/analysis/source-evidence/types/resolution/owner-type-parameter-environment.js";

function fixture() {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: {
    "/src/index.ts": "export interface NativeOwner<Value, Self extends NativeOwner<Value, Self>> {}",
    "/src/foreign.ts": "export interface Foreign<Value> {}",
  }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0, "the recursive and foreign binders are real checked declarations");
  const source = createTargetSourceProgram(checked);
  const ast = source.ast;
  const nodes = [];
  const visit = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  source.navigation.sourceFiles.filter(file => ast.getFileName(file).startsWith("/src/")).forEach(visit);
  const declarations = nodes.filter(node => ast.is.IsInterfaceDeclaration(node));
  const owner = declarations.find(node => ast.text(ast.name(node)) === "NativeOwner");
  const foreign = declarations.find(node => ast.text(ast.name(node)) === "Foreign");
  const [value, self] = ast.typeParameters(owner).map(node => csharpSourceTypeParameter(node, ast));
  const foreignValue = ast.typeParameters(foreign)[0];
  assert.equal(value !== undefined && self !== undefined && foreignValue !== undefined, true,
    "all native binder identities come from exact original Source declaration Nodes");
  const resolve = declaration => declaration === value.csharpDeclaration || declaration === self.csharpDeclaration
    ? { kind: "resolved", constraints: [] } : { kind: "unsupported", reason: "Foreign Source declaration." };
  const environment = () => createCsharpSourceTypeParameterEnvironment(ast, resolve);
  const key = csharpProjectedType({ kind: "collection-key", arguments: [value] });
  const reference = parameter => Object.freeze({ kind: "type-parameter", identity: parameter.identity, name: parameter.name });
  return { ast, value, self, foreignValue, key, environment, reference };
}

test("an exact collection-key projection self reference reuses its one sealed definition", () => {
  const input = fixture();
  const closed = closeCsharpOwnerTypeParameterEnvironment([input.key], input.environment());
  const selected = closed.find(parameter => parameter.identity === input.key.identity);
  assert.equal(closed.length === 2 && closed.every(parameter => parameter.csharpConstraints?.kind === "resolved"), true,
    "the key projection and actual element binder each have one complete constraint record");
  assert.equal(selected.csharpProjection.kind === "collection-key" && selected.csharpConstraints.constraints.length === 2, true,
    "struct and ICollectionKey constraints are retained rather than bypassed");
  const contract = selected.csharpConstraints.constraints.find(constraint => constraint.kind === "type").type;
  assert.equal(contract.typeArguments[1].identity === selected.identity &&
    contract.typeArguments[1].csharpConstraints === undefined, true,
  "the recursive argument is a reference, not a second copied constraint definition");
});

test("an authored native CRTP declaration and its bare self reference share original binder authority", () => {
  const input = fixture();
  const contract = csharpTargetNamedType("Tsonic.CSharp.Js.ICollectionKey`2", [input.value, input.reference(input.self)],
    { kind: "named", name: "ICollectionKey", genericArity: 2 }, { allowsRefLikeTypeArguments: [false, false] });
  const definition = { ...input.self, csharpConstraints: { kind: "resolved", constraints: [
    { kind: "keyword", keyword: "struct" }, { kind: "type", type: contract },
  ] } };
  const closed = closeCsharpOwnerTypeParameterEnvironment([definition], input.environment());
  assert.equal(closed.length === 2 && closed.every(parameter => parameter.csharpConstraints.kind === "resolved"), true,
    "recursive declaration closure neither re-infers nor loses the exact native constraints");
  assert.equal(closed.find(parameter => parameter.identity === definition.identity).csharpDeclaration === definition.csharpDeclaration,
    true, "the original Source declaration remains the binder authority");
});

test("a missing definition does not turn a bare native binder reference into an unconstrained declaration", () => {
  const input = fixture();
  const closed = closeCsharpOwnerTypeParameterEnvironment([input.reference(input.key)], input.environment());
  assert.equal(closed.length === 1 && closed[0].csharpConstraints.kind === "unsupported", true,
    "a reference is usable only after its own exact native definition has been sealed");
});

test("an explicit conflicting definition cannot hide behind a previously sealed reference identity", () => {
  const input = fixture();
  const conflicting = { ...input.key, csharpConstraints: { kind: "resolved", constraints: [{ kind: "keyword", keyword: "class" }] } };
  assert.throws(() => closeCsharpOwnerTypeParameterEnvironment([input.key, conflicting], input.environment()),
    /conflicting constraint evidence/u, "genuine contradictory definitions still fail the existing owner check");
});

test("same identity with a different collection projection remains a competing definition", () => {
  const input = fixture();
  const other = csharpProjectedType({ kind: "collection-key", arguments: [csharpSourcePrimitiveTargetType("float64")] });
  const conflicting = { ...other, identity: input.key.identity, name: input.key.name };
  assert.throws(() => closeCsharpOwnerTypeParameterEnvironment([input.key, conflicting], input.environment()),
    /conflicting constraint evidence/u, "projection metadata is never treated as a bare reference");
});

test("a foreign original declaration cannot borrow a sealed binder through identical spelling", () => {
  const input = fixture();
  const foreign = { ...input.key, csharpDeclaration: input.foreignValue };
  assert.throws(() => closeCsharpOwnerTypeParameterEnvironment([input.key, foreign], input.environment()),
    /conflicting constraint evidence/u, "exact original declaration identity remains independently checked");
});

test("a differently spelled forged reference is not the already sealed native binder", () => {
  const input = fixture();
  const foreign = { ...input.reference(input.key), name: "Foreign" };
  assert.throws(() => closeCsharpOwnerTypeParameterEnvironment([input.key, foreign], input.environment()),
    /conflicting constraint evidence/u, "name consistency is required in addition to the exact original identity");
});
