#!/usr/bin/env node
/*
 * Links the library into the example's node_modules.
 *
 * The library is the repository ROOT, and yarn does not self-link a root workspace into
 * node_modules, so neither Metro nor tsc can resolve it by package name. This creates the symlink
 * that a published install would produce, which keeps the example honest: it resolves the package
 * by name and goes through the `exports` map, exactly as a merchant's app does.
 */
import { mkdirSync, rmSync, symlinkSync, existsSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exampleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const libraryRoot = path.resolve(exampleRoot, '..');
const scope = path.join(exampleRoot, 'node_modules', '@juspay-tech');
const target = path.join(scope, 'react-native-hyperswitch-vault');

mkdirSync(scope, { recursive: true });
if (existsSync(target) || lstatSync(target, { throwIfNoEntry: false })) {
  rmSync(target, { recursive: true, force: true });
}
symlinkSync(libraryRoot, target, 'dir');
console.log('[link-library] example -> @juspay-tech/react-native-hyperswitch-vault');
