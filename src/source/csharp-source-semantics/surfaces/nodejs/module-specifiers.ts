import {
  nodeAssertModuleSpecifier,
} from "./assert.js";
import {
  nodeBufferModuleSpecifier,
} from "./buffer.js";
import {
  nodeCryptoModuleSpecifier,
} from "./crypto.js";
import {
  nodeFsModuleSpecifier,
} from "./filesystem/index.js";
import {
  nodeOsModuleSpecifier,
} from "./os.js";
import {
  nodePathModuleSpecifier,
} from "./path.js";
import {
  nodeProcessModuleSpecifier,
} from "./process.js";
import {
  nodeUtilModuleSpecifier,
} from "./util.js";
import {
  nodeUrlModuleSpecifier,
} from "./url.js";

const canonicalBySpecifier = new Map<string, string>([
  ["assert", nodeAssertModuleSpecifier],
  [nodeAssertModuleSpecifier, nodeAssertModuleSpecifier],
  ["assert/strict", nodeAssertModuleSpecifier],
  ["node:assert/strict", nodeAssertModuleSpecifier],
  ["buffer", nodeBufferModuleSpecifier],
  [nodeBufferModuleSpecifier, nodeBufferModuleSpecifier],
  ["crypto", nodeCryptoModuleSpecifier],
  [nodeCryptoModuleSpecifier, nodeCryptoModuleSpecifier],
  ["fs", nodeFsModuleSpecifier],
  [nodeFsModuleSpecifier, nodeFsModuleSpecifier],
  ["os", nodeOsModuleSpecifier],
  [nodeOsModuleSpecifier, nodeOsModuleSpecifier],
  ["path", nodePathModuleSpecifier],
  [nodePathModuleSpecifier, nodePathModuleSpecifier],
  ["process", nodeProcessModuleSpecifier],
  [nodeProcessModuleSpecifier, nodeProcessModuleSpecifier],
  ["util", nodeUtilModuleSpecifier],
  [nodeUtilModuleSpecifier, nodeUtilModuleSpecifier],
  ["url", nodeUrlModuleSpecifier],
  [nodeUrlModuleSpecifier, nodeUrlModuleSpecifier],
]);

export function canonicalNodejsModuleSpecifier(specifier: string | undefined): string | undefined {
  return specifier === undefined ? undefined : canonicalBySpecifier.get(specifier);
}

export function isSupportedNodejsModuleSpecifier(specifier: string | undefined): boolean {
  return canonicalNodejsModuleSpecifier(specifier) !== undefined;
}
