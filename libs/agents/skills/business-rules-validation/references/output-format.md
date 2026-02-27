# Output Format Reference

## Finding Structure

Each finding MUST include:
- **Severity**: MUST_FIX | SUGGESTION | INFO
- **What**: What is missing, wrong, or risky
- **Evidence (Task)**: Requirement excerpt that supports the finding
- **Evidence (Code)**: Diff excerpt or explicit absence in diff
- **Action**: Concrete change expected from the developer

## Severity Rules

- **MUST_FIX**: A required business rule is not implemented, is incorrect, or contradicts task requirements.
- **SUGGESTION**: A relevant edge case, robustness, or maintainability point is not covered.
- **INFO**: Useful observation that does not block compliance.

## Example: Gaps Found

```json
{
  "needsMoreInfo": false,
  "summary": "## Business Rules Validation\n\n**Status:** Issues Found\n**Confidence:** high\n\n### Findings\n\n#### MUST_FIX: Team scope missing in rule lookup\n**Requirement:** \"Rules must be resolved by organization and team to avoid cross-workspace billing mismatch.\"\n**Missing in code:** Diff keeps lookup keyed only by `organizationId`.\n**Evidence (Code):** No `teamId` filter was added where rules are queried.\n**Suggested action:** Add `teamId` to rule persistence and query filters, plus migration/backfill strategy.\n\n#### SUGGESTION: Missing fallback behavior for mixed license state\n**Requirement:** \"When teams have different subscription states, behavior must remain deterministic.\"\n**Missing in code:** No explicit fallback path when selected team has inactive plan.\n**Evidence (Code):** No guard branch handling inactive subscription result.\n**Suggested action:** Add deterministic fallback and clear error message scoped to team.\n\n#### INFO: Migration impact should be explicit\n**Requirement:** \"Assess side effects before changing rule model.\"\n**Missing in code:** No migration notes in PR diff.\n**Evidence (Code):** Schema usage changed without migration plan reference.\n**Suggested action:** Add migration notes and rollout steps in PR description.\n\n### Implemented Correctly\n- Existing organization-level lookup still works for legacy data.\n- Validation flow preserves current authorization checks.\n"
}
```

## Example: All Compliant

```json
{
  "needsMoreInfo": false,
  "summary": "## Business Rules Validation\n\n**Status:** Compliant\n**Confidence:** high\n\n### Findings\n\n#### INFO: Requirements covered\n**Requirement:** Team-scoped rule resolution and deterministic billing behavior.\n**Missing in code:** None.\n**Evidence (Code):** Diff adds `teamId` in persistence, lookups, and conflict checks.\n**Suggested action:** None.\n\n### Implemented Correctly\n- Rule reads/writes now include `organizationId + teamId`.\n- Multi-workspace billing path is deterministic.\n- Backward compatibility path is present for legacy records.\n"
}
```

## Example: Needs More Info

```json
{
  "needsMoreInfo": true,
  "missingInfo": "## Need Task Information\n\nI could not validate business rule compliance because the task context is too vague.\n\n### What I need to validate:\n- Explicit business requirements or acceptance criteria\n- Scope boundaries (which teams/workspaces are affected)\n- Expected behavior for edge cases (inactive subscription, missing team binding)\n\n### Examples of how to provide it:\n- Link the Jira/Linear/Notion task with acceptance criteria\n- Paste the business rules directly in the PR comment\n- Add expected input/output behavior for key scenarios\n\n### Important:\nWithout requirement-level context, validation would be speculative and unreliable."
}
```
