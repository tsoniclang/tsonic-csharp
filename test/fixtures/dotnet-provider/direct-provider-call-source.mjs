import assert from "node:assert/strict";
import { createCompilerSessionFromFiles, createSourceSemanticsExtension, formatDiagnostics, sourcePrimitive } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";

export function checkedProviderCall(spec) {
  const files = {
    "/src/index.ts": spec.sourceText,
    "/src/node_modules/@fixture/provider/package.json": JSON.stringify({ name: "@fixture/provider",
      version: "1.0.0", type: "module", exports: { ".": "./index.d.ts" } }),
    "/src/node_modules/@fixture/provider/index.d.ts": spec.declarations,
    "/src/node_modules/@fixture/words/package.json": JSON.stringify({ name: "@fixture/words",
      version: "1.0.0", type: "module", exports: { ".": "./index.d.ts" } }),
    "/src/node_modules/@fixture/words/index.d.ts": "export {};\n" + spec.words.map(word =>
      `export type ${word.exportName} = ${word.backing};`).join("\n"),
  };
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files,
    compilerOptions: { strict: true, target: "es2022", module: "esnext", moduleResolution: "bundler" },
    extensionHostOptions: { extensions: [createSourceSemanticsExtension({ modules: [{
      moduleSpecifier: "@fixture/words", packageName: "@fixture/words",
      exports: spec.words.map(word => sourcePrimitive(word.exportName, word.name, word.backing)),
    }] })] },
  }).checkSource();
  assert.equal(checked.diagnostics.length, 0, formatDiagnostics(checked.diagnostics.filter(issue => issue !== undefined)).slice(0, 2048));
  assert.equal(checked.extensionDiagnostics.length, 0, "the Native unit's authored Source declarations pass extension checking");
  const program = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/src/index.ts");
  assert.equal(file !== undefined, true, "the actual checked call file exists");
  const calls = [];
  const visit = node => {
    if (program.ast.is.IsCallExpression(node) || program.ast.is.IsNewExpression(node)) calls.push(node);
    program.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  assert.equal(calls.length, 1, "one actual authored call owns this Native relation fixture");
  const call = calls[0];
  const sourceFile = program.ast.getSourceFile(call);
  const queries = program.semantics.forNode(call);
  const evidence = queries.operations.call(call);
  assert.equal(evidence?.call === call && sourceFile === file, true,
    "the exact selected call and the eagerly computed Host publication share the original checked occurrence");
  const signatureDeclaration = queries.declarations.signatureDeclaration(evidence.selectedSignature);
  assert.equal(signatureDeclaration !== undefined, true, "the actual selected declaration is retained");
  const result = Object.freeze({ program, sourceFile, call, signatureDeclaration, evidence });
  return result;
}

export function providerCallSource(options, binding, member) {
  const words = new Map();
  const named = new Map();
  const ownerParameters = binding.typeParameters ?? [];
  const methodParameters = member.typeParameters ?? [];
  const selectedArguments = options.nativeTypeArguments ?? [];
  const constructor = member.kind === "constructor";
  const freeCall = !constructor && (options.receiver === false ||
    member.static === true && options.receiver?.kind !== "target-parameter");
  const bindingAtCall = options.bindingTypeArgumentSource === "selected-operation-type-arguments";
  const sourceNames = new Map([
    ...ownerParameters.map(parameter => [parameter.identity, parameter.name]),
    ...methodParameters.map(parameter => [parameter.identity, parameter.name]),
  ]);
  const count = selectedArguments.length || methodParameters.length;
  const sourceType = type => {
    assert.equal(type !== undefined, true, "each authored fixture type has an existing Native leaf");
    if (type.csharpNullableReference === true) return `(${sourceType({ ...type, csharpNullableReference: false })} | undefined)`;
    if (type.kind === "source-primitive") {
      if (type.name === "bool") return "boolean";
      const backing = /^u?int(?:64|128)$/u.test(type.name) ? "bigint" : "number";
      let word = words.get(type.name);
      if (word === undefined) {
        word = { name: type.name, exportName: `Word${words.size}`, backing };
        words.set(type.name, word);
      }
      return `Words.${word.exportName}`;
    }
    if (type.kind === "void") return "void";
    if (type.kind === "type-parameter") {
      const name = sourceNames.get(type.identity);
      assert.equal(name !== undefined, true, "a Native generic pattern has its actual authored declaration binder");
      return name;
    }
    if (type.kind === "array") return `(${sourceType(type.element)})[]`;
    if (type.kind === "tuple") return `[${type.elements.map(sourceType).join(", ")}]`;
    if (type.kind === "target-named") {
      if (type.id === "System.Void") return "void";
      if (type.id === "System.Boolean") return "boolean";
      if (type.id === "System.String" || type.csharpJsStringCarrier === true) return "string";
      if (type.id === "System.Object") return "object";
      if (type.csharpSpecialType === "nullable") return `(${sourceType(type.typeArguments[0])} | undefined)`;
      let entry = named.get(type.id);
      if (entry === undefined) {
        entry = { name: `Native${named.size}`, arity: type.typeArguments?.length ?? 0 };
        named.set(type.id, entry);
      }
      const arguments_ = type.typeArguments ?? [];
      assert.equal(arguments_.length === entry.arity, true, "one Native declaration retains its exact generic arity");
      return `${entry.name}${arguments_.length === 0 ? "" : `<${arguments_.map(sourceType).join(", ")}>`}`;
    }
    throw new Error(`The concrete Native fixture needs an authored Source type for '${type.kind}'.`);
  };
  const argumentTargets = options.sourceArgumentTargets ?? [];
  const suppliedParameters = options.sourceParameters;
  const parameterCount = suppliedParameters?.length ?? argumentTargets.length;
  const sourceParameters = Array.from({ length: parameterCount }, (_unused, index) => {
    const supplied = suppliedParameters?.[index];
    const target = member.parameters[index]?.type;
    const actual = argumentTargets[index] ?? target;
    const type = sourceType(actual);
    return `${supplied?.rest ? "..." : ""}value${index}${supplied?.acceptsOmission && !supplied.rest ? "?" : ""}: ${type}${supplied?.rest ? "[]" : ""}`;
  });
  const leafArguments = selectedArguments.map(argument => argument.explicitTarget ?? argument.selectedTarget);
  const generics = Array.from({ length: count }, (_unused, index) => {
    const name = methodParameters[index]?.name ??
      (bindingAtCall ? ownerParameters[index]?.name : undefined) ?? `Invocation${index}`;
    const selected = leafArguments[index];
    return name + (selected === undefined ? "" : ` = ${sourceType(selected)}`);
  });
  const methodGenerics = generics.length === 0 ? "" : `<${generics.join(", ")}>`;
  const explicit = selectedArguments.length > 0 && selectedArguments.every(argument => argument.explicitTarget !== undefined);
  const invocationGenerics = explicit ? `<${leafArguments.map(sourceType).join(", ")}>` : "";
  const inputDeclarations = argumentTargets.flatMap((type, index) =>
    options.argumentExpressions?.[index]?.syntaxKind === "IsNumericLiteral" ? [] :
      [`declare const input${index}: ${sourceType(type)};`]).join("\n");
  const arguments_ = argumentTargets.map((_type, index) =>
    options.argumentExpressions?.[index]?.syntaxKind === "IsNumericLiteral"
      ? options.argumentExpressions[index].text : `input${index}`).join(", ");
  const result = sourceType(member.returnType);
  const ownerGenerics = ownerParameters.length === 0 ? "" : `<${ownerParameters.map(parameter => parameter.name).join(", ")}>`;
  const ownerArguments = options.receiverTarget?.typeArguments ?? ownerParameters.map(() => ({ kind: "target-named", id: "System.String" }));
  const receiverType = `Provider.Receiver${ownerParameters.length === 0 ? "" : `<${ownerArguments.map(sourceType).join(", ")}>`}`;
  const declaration = constructor
    ? `export declare class Receiver${ownerGenerics} { constructor(${sourceParameters.join(", ")}); }`
    : freeCall
      ? `export declare function member${methodGenerics}(${sourceParameters.join(", ")}): ${result};`
      : `export interface Receiver${ownerGenerics} { member${methodGenerics}(${sourceParameters.join(", ")}): ${result}; }`;
  const invocation = constructor
    ? options.projectConstructor === true ? `new Project(${arguments_});`
      : `new Provider.Receiver${invocationGenerics}(${arguments_});`
    : freeCall
      ? `Provider.member${invocationGenerics}(${arguments_});`
      : `receiver.member${invocationGenerics}(${arguments_});`;
  const namedDeclarations = [...named.values()].map(entry => {
    const parameters = Array.from({ length: entry.arity }, (_unused, index) => `Argument${index}`);
    return `export declare class ${entry.name}${parameters.length === 0 ? "" : `<${parameters.join(", ")}>`} { private identity: ${parameters[0] ?? "object"}; }`;
  }).join("\n");
  return {
    sourceText: `import * as Provider from "@fixture/provider"; import type * as Words from "@fixture/words";\n${named.size === 0 ? "" : `import type { ${[...named.values()].map(entry => entry.name).join(", ")} } from "@fixture/provider";`}\n${inputDeclarations}\n${options.projectConstructor === true ? `class Project extends ${receiverType} {}` : ""}\n${options.projectMethodAlias === true ? `interface Project { member: ${receiverType}["member"]; }` : ""}\n${constructor || freeCall ? "" : `declare const receiver: ${options.projectMethodAlias === true ? "Project" : receiverType};`}\n${invocation}`,
    declarations: `import type * as Words from "@fixture/words";\n${namedDeclarations}\n${declaration}`,
    words: [...words.values()],
  };
}
