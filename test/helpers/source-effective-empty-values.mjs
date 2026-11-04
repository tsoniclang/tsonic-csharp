import assert from "node:assert/strict";
import { assertPublishedRefusal, compileEffectiveSource } from "./source-effective-types.mjs";

export function assertUnfilledEmptyObject(surface, sourceText) {
  const compiled = compileEffectiveSource(surface, sourceText);
  assertPublishedRefusal(compiled, "TSONIC_UNTYPED_OBJECT_LITERAL", "{}");
  return compiled;
}

export function annotatedEmptyValues(sourceText) {
  let annotations = 0;
  let selected = sourceText.replace(/const (direct|empty) = \{\};/gu, (_match, name) => {
    annotations += 1;
    return `const ${name}: ExplicitEmptyValue = {};`;
  });
  selected = selected.replace(/retain\(\{\}\)/gu, () => {
    annotations += 1;
    return "retain({} as ExplicitEmptyValue)";
  });
  selected = selected.replace(/(same|different)\(empty, \{\}\)/gu, (_match, operation) => {
    annotations += 1;
    return `${operation}(empty, {} as ExplicitEmptyValue)`;
  });
  if (annotations === 0) return sourceText;
  assert.equal(sourceText.includes("ExplicitEmptyValue"), false, "the companion introduces no conflicting authored declaration");
  return `class ExplicitEmptyValue {}\n${selected}`;
}
