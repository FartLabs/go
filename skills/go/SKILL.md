---
name: go
description: Manage shortlink JSON files using jq, following the go-link shortening IETF standard. Use this skill when the user wants to add, update, delete, sort, or validate shortlinks in a JSON file (e.g., links.json). Focus on maintaining a valid Record<string, string> structure where keys are aliases and values are destinations.
---

# Go-Link Manager

A skill for managing deterministic shortlink rulesets using `jq`.

## Overview

Shortlinks are stored as a flat JSON object (`Record<string, string>`). This
skill provides standard `jq` patterns to maintain these files accurately.

**Core principle:** Maintain purity of the data model. No regex, no complex
objects—just simple key-value pairs.

## Triggering

Trigger this skill when the user mentions:

- "manage shortlinks"
- "update links.json" (or any JSON file containing shortlinks)
- "add a new go-link"
- "delete a shortlink"
- "validate our shortlink file"
- "format/sort the links"

## Output format

The output should typically be:

1. A `jq` command to perform the requested operation.
2. The result of applying that command to the target file.
3. A confirmation that the resulting file follows the `go-link` standard.

## Standard jq patterns

### Validation

Check if the file is a valid flat object with string values.

```bash
jq 'if type == "object" and ([.[] | type == "string"] | all) then "valid" else "invalid" end' links.json
```

### Add or update a link

```bash
jq --arg alias "my-link" --arg dest "https://example.com" '. + {($alias): $dest}' links.json
```

### Delete a link

```bash
jq --arg alias "old-link" 'del(.[$alias])' links.json
```

### Sort alphabetically

```bash
jq --sort-keys . links.json
```

### Audit empty values

```bash
jq 'to_entries | map(select(.value == "")) | from_entries' links.json
```

## Safety constraints

- **Longest-prefix match** is the default resolution behavior. When adding
  links, ensure they don't unintentionally shadow each other unless intended
  (e.g., `docs` vs `docs/api`).
- **Internal Redirects**: Destinations starting with `/` are allowed.
- **Absolute Destinations**: Destinations starting with `http` are allowed.
- **Loop Protection**: Avoid creating circular redirects (e.g., `a -> /b`,
  `b -> /a`).
