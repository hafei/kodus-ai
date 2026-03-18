---
name: kodus-kody-rules
description: Use when the user wants to create, update or view Kody Rules via `kodus rules` command.
---

# Kodus Kody Rules

## Overview

Kody Rules are a set of guidelines that Kody follows when generating code. They help ensure that the generated code is consistent, high-quality, and aligned with the user's preferences and project requirements.

## How to Use

Read individual rule files for detailed explanations and examples:

- [rules/create-kody-rule.md](rules/create-kody-rule.md): Guidelines for creating new Kody Rules.
- [rules/update-kody-rule.md](rules/update-kody-rule.md): Guidelines for updating existing Kody Rules.
- [rules/view-kody-rules.md](rules/view-kody-rules.md): Guidelines for viewing and retrieving Kody Rules.

## Structure of a Kody Rule

A Kody Rule typically consists of the following components:

- **Title**: A concise title that captures the essence of the rule.
- **Rule**: A detailed explanation of what the rule is and why it is important.
- **Severity**: A level indicating the importance of the rule (one of "low", "medium", "high" or "critical").
    - **Low**: The rule is a suggestion and can be ignored without significant consequences.
    - **Medium**: The rule should be followed, but violations are not critical. Default severity level.
    - **High**: The rule is important and should be followed to avoid potential issues.
    - **Critical**: The rule is essential and must be followed to prevent severe issues or failures.
- **Scope**: The level at which the rule applies (one of "pull request" or "file").
    - **Pull Request**: The rule applies to the entire pull request and is evaluated based on the overall changes in the PR.
    - **File**: The rule applies to individual files and is evaluated on a per-file basis. Default scope level.
- **Path**: An optional glob pattern indicating which files the rule applies to.
    - For example, `src/**/*.js` would apply the rule to all JavaScript files in the `src` directory and its subdirectories.
    - Default is all files, `**/*`.

## Example of a Kody Rule

**Title**: Use Async/Await for Asynchronous Operations

**Rule**: Ensure that all asynchronous operations in the codebase use async/await syntax for better readability and error handling. Avoid using raw Promises or callback functions for asynchronous code.

**Severity**: High

**Scope**: File

**Path**: `**/*.ts`
