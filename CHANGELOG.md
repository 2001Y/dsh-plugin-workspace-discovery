# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Scans no longer stall the Harness host on macOS: the walk runs in a child
  process with a 25-second per-root timeout, and home traversal skips the
  TCC-guarded folders (Documents/Downloads/Desktop/Pictures/Movies/Music/
  Library) unless one is named as a scan root explicitly. Found on first
  real-machine run: reading `~/Documents` from the DSH host process blocked
  on a privacy prompt (host CPU ~0% while the scan never returned).

## [0.1.0] - 2026-10-26

### Added

- Filesystem scan for local git repositories under configurable roots
  (`roots`, `maxDepth`, `exclude`), detecting both `.git` directories and
  `.git` files (worktrees/submodules), without spawning `git`.
- Sidebar panel ("Discover projects") with an unregistered-count badge,
  root/depth editing, search, per-row selection, and bulk registration.
- Registration through the official `workspaceRegistry` API — idempotent per
  canonical directory, per-path failure isolation.
- Model-facing tools `workspace_discover` and
  `workspace_register_discovered`.
- Host-shared configuration at `$DSH_HOME/workspace-discovery.config.json`,
  with optional opt-in `autoRegister` at startup.
- Panel UI in English, Simplified Chinese and Japanese; README in the same
  three languages.
