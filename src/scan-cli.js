#!/usr/bin/env node
/**
 * Standalone scan entry point. The host plugin runs the filesystem walk in a
 * child process (this file) instead of in-process: a directory read that
 * blocks — classically a macOS TCC privacy prompt for a guarded folder —
 * must never stall the Harness host or exhaust its thread pool. The parent
 * kills this process on timeout and reports the affected root as an error.
 *
 * Usage: node src/scan-cli.js '{"roots":["/abs"],"maxDepth":4,"exclude":[]}'
 * Prints one JSON object: { candidates, errors, truncated }.
 *
 * @module dsh-plugin-workspace-discovery/scan-cli
 */
import { scanRoots } from './scan.js'

const options = JSON.parse(process.argv[2] ?? '{}')
const result = await scanRoots(options)
process.stdout.write(JSON.stringify(result))
