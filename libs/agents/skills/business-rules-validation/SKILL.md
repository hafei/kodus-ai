---
name: business-rules-validation
description: Validate PR code changes against task requirements to identify missing, forgotten, or overlooked business logic implementations
allowed-tools: KODUS_GET_PULL_REQUEST KODUS_GET_PULL_REQUEST_DIFF
metadata:
    version: '1.0.0'
    kodus:
        capabilities:
            - pr.metadata.read
            - pr.diff.read
            - task.context.read
        fetcher-policy:
            tool-mode: any
            allow-without-tools: false
        execution-policy:
            on-missing-mcp: fail
            on-mcp-connect-error: fail
            fetcher-timeout-ms: 120000
            analyzer-timeout-ms: 120000
            fetcher-max-iterations: 2
            analyzer-max-iterations: 1
        contracts:
            input:
                required-context-fields:
                    - organizationAndTeamData.organizationId
                    - organizationAndTeamData.teamId
                    - prepareContext.pullRequest.pullRequestNumber
                    - prepareContext.repository.id
            output:
                required-fields:
                    - needsMoreInfo
                    - summary
        required-mcps:
            - category: task-management
              label: Task Management
              examples: Jira, Linear, Notion, ClickUp
---

# Business Rules Gap Analysis

## Goal

Find what is **MISSING**, **FORGOTTEN**, or **OVERLOOKED** — not what is present.
Every validation must be grounded in specific business requirements from the external task.

## Input (pre-fetched in context)

- **TASK_CONTEXT**: Requirements, acceptance criteria, and business rules from the external task management system (Jira, Notion, Linear, etc.)
- **PR_DIFF**: Code changes for this pull request
- **TASK_QUALITY**: `EMPTY` | `MINIMAL` | `PARTIAL` | `COMPLETE` — quality assessment of task context

`TASK_QUALITY` is classified by the runtime deterministic stage. Do not reclassify it.
Apply the task-quality policy exactly as provided in the user prompt.

## Critical Analysis Questions

- ❌ What business requirements are **NOT implemented** in the code?
- ❌ What **validation rules** were forgotten?
- ❌ What **business edge cases** were overlooked?
- ❌ What **security or compliance** requirements are missing?
- ❌ What **business assumptions** might be incorrect?
- ❌ What **potential business risks** exist in the implementation?

## Output Format

Return a single JSON object. Do not include any text outside the JSON.

```json
{
  "needsMoreInfo": boolean,
  "missingInfo": "Explanation of what is missing — only present when needsMoreInfo is true",
  "summary": "Complete markdown with structured findings — only present when needsMoreInfo is false"
}
```

### When `needsMoreInfo = true`

Set `missingInfo` to a user-friendly explanation explaining what is needed:

- Why the task context is insufficient
- What specific information would enable the validation
- How the user can provide it (e.g., link a Jira ticket, add acceptance criteria)

Use this structure in `missingInfo`:

```
## 🤔 Need Task Information

[Main message explaining what's needed]

### 🔍 What I need to validate:
- [bullet points]

### 💡 Examples of how to provide it:
- [practical examples]

### ⚠️ Important:
[Final note]
```

### When `needsMoreInfo = false`

Set `summary` to a complete markdown validation report using this structure:

```
## Business Rules Validation

**Status:** Issues Found / Compliant
**Confidence:** high | medium | low

### Findings

#### MUST_FIX: [finding title]
**Requirement:** [task requirement excerpt]
**Missing in code:** [what is absent or wrong in the implementation]
**Suggested action:** [concrete implementation action]

#### SUGGESTION: [finding title]
**Requirement:** [task requirement excerpt]
**Missing in code:** [what is partially covered or risky]
**Suggested action:** [concrete improvement]

#### INFO: [finding title]
**Requirement:** [task requirement excerpt]
**Missing in code:** [non-blocking observation]
**Suggested action:** [optional follow-up]

### Implemented Correctly
[What was correctly implemented per task requirements]

---
*Analysis performed by Kodus AI Business Rules Validator*
```

## Language

Respond in the user's configured language. Default to English (`en-US`) if no preference is set.
Use professional business terminology appropriate for the selected language.

See the reference files for detailed output examples and quality classification rules.
