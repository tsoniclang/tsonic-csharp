import {
  nodeBufferModuleSpecifier,
} from "./buffer.js";
import {
  nodeCryptoModuleSpecifier,
} from "./crypto.js";
import {
  nodeFsModuleSpecifier,
} from "./filesystem.js";
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

const canonicalBySpecifier = new Map<string, string>([
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
]);

export function canonicalNodejsModuleSpecifier(specifier: string | undefined): string | undefined {
  return specifier === undefined ? undefined : canonicalBySpecifier.get(specifier);
}

export function isSupportedNodejsModuleSpecifier(specifier: string | undefined): boolean {
  return canonicalNodejsModuleSpecifier(specifier) !== undefined;
}
