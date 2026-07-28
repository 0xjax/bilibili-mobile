---
name: writing-rules
description: Use when changing AGENTS.md or CLAUDE.md shims
---

# Writing Rules

Rules inject into every conversation. Every token is a tax. Goal: **fewest tokens, maximum behavioral change.**

## Iron Rules

1. **Default delete** — can't justify keeping it? Delete it
2. **Constraints only, never knowledge** — if the model already knows it, it's waste
3. **Every line must change behavior** — remove a line; if AI acts the same, the line was dead weight
4. **Explanations are tax** — `NEVER Exa fetch` > `NEVER use Exa fetch because it's a paid API`; constraint > justification
5. **Merge over split** — two lines about one thing → one line; two files about one thing → one file
6. **Self-describing things don't repeat** — skill/tool already documents itself; rule states only the constraint it adds
7. **Naming follows scope** — content evolved past the filename? Rename

## Compression Arsenal

- **Terminology over description**: `RFC 2119` not "MUST means required"; `Conventional Commits` not "commit messages should have feat:/fix: prefixes"
- **`→` for mappings**: `cat → Read`, `WebFetch fails → agent-browser`
- **Negative-space**: "NEVER X" > "do Y instead"
- **Parallel bullets**: one bullet, comma-separated directives

## Quality Gate

> **Delete this line. Does AI behavior change?**
> - No → permanently delete
> - Yes → keep, but compress further

## Good vs Bad

<good-example>
- **WebFetch** (default): SSG/SSR, docs, static content
- **Exa search**: web search, preferred for finding information; NEVER Exa fetch
- WebFetch fails (403/empty/SPA) → agent-browser
</good-example>

<bad-example>
# Web Fetching

## Tool Selection

- **WebFetch** (default): SSG/SSR, docs, static content
- **Exa search**: web search, preferred for finding information
- **agent-browser**: CSR SPA, interaction (click/fill/scroll), visual verification
- NEVER use Exa fetch — paid API; use WebFetch for full page content

## Fallback Chain

WebFetch fails (403/empty/SPA) → agent-browser snapshot → curl (last resort)
</bad-example>

## Anti-Patterns

Each violates an Iron Rule — self-check before finalizing:

| Anti-pattern | Violates | Fix |
|---|---|---|
| Explains *why* | #4 | Drop motivation; state constraint only |
| Repeats tool/skill description | #6 | Only state what the rule *adds* |
| States model-known facts | #2 | Delete — knowledge ≠ constraint |
| `##` subsections in short files | — | Flat bullets only |
| Heading + <6 lines body | — | Drop the heading |
| "A; B" where B restates A | #5 | Keep A only |
| Overlapping files | #5 | Merge into one file |
| Hypothetical edge cases | #3 | If no real scenario triggers it, delete |
