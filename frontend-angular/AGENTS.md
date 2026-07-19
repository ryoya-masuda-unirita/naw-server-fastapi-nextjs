# Codex Instructions

This repository includes Codex-specific project guidance under `@/.codex/`.

## Always Read

- Read `@/.codex/CODEX.md` first for project context, architecture, and development commands.
- For any `NAW-XXXX` ticket work, follow the spec-driven workflow in `@/.codex/CODEX.md` before implementation.

## Task-Specific References

- For implementation rules, follow `@/.codex/CODING_GUIDELINES.md`.
- For test design and test-writing rules, follow `@/.codex/TEST_GUIDELINES.md`.
- For spec-driven design document work, follow `@/.codex/commands/spec.md`.
- For reviewing the current branch, follow `@/.codex/commands/self-review.md`.

## Notes

- The `.claude/` directory remains the source for Claude Code-specific settings.
- The `.codex/` directory mirrors the same operational documentation for Codex use.
- For ticket work, Codex should first create and maintain `private/documents/NAW-XXXX/` documents, then stop at the required approval gates.
- After `01_要件定義.md` and `02_基本設計.md` are complete, Codex must ask the user to choose either `Human in the Loop` or `全自動` before proceeding to 03+.
