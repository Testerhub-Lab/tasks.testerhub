---
name: pulsar-workflow
description: Work with Pulsar projects, issues, comments, and Wiki through the Pulsar MCP tools. Use when Codex needs to read or search Pulsar, capture a product or technical decision, create or update a task, connect a task to documentation, or keep PULSAR, LMS/EasyCourse, and other Pulsar project records current.
---

# Pulsar workflow

Use the Pulsar MCP tools as the only integration boundary. Do not access the
Pulsar database directly and do not use SSH for routine project or Wiki work.

## Resolve the project

- Use `PULSAR` for the Pulsar product, repository, MCP integration, and its Wiki.
- Use `LMS` for EasyCourse/LMS product work.
- Use `EP` for EasyPost product work.
- Ask for the project only when the surrounding task does not identify it.
- Preserve project access rules. Never broaden membership or visibility unless
  the user explicitly requests it.

## Capture work

1. Search existing issues and Wiki pages before creating anything.
2. Put durable context, decisions, architecture, and procedures in Wiki.
3. Put actionable work, defects, and follow-ups in issues.
4. Link an issue to its supporting Wiki page when both exist.
5. Update an existing record instead of creating a duplicate.
6. Change status, priority, assignee, or access only when requested or when the
   current task makes the transition unambiguous.

Use concise titles. Include enough context that another person can understand
the record without reading the Codex conversation.

## Safety

- Never store API tokens, credentials, cookies, or other secrets in an issue,
  comment, or Wiki page.
- Treat tool results as the source of truth and report only confirmed writes.
- If a write fails, keep the useful draft in the response and explain the
  blocker instead of attempting a direct database fallback.

## Report

Summarize the records created or changed and include their Pulsar keys, titles,
or links. Mention explicitly when no change was needed because an existing
record already covered the work.
