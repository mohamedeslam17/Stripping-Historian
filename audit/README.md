# Audit exchange

A shared handoff folder. Two agents work here and **never write the same file**, so
pushes cannot conflict.

| File | Written by | Read by |
|---|---|---|
| `TASK.md` | Opus (the reviewer) | Haiku |
| `RESULTS.tsv` | Haiku (the runner) | Opus |
| `NOTES.md` | Opus | the human |

## Branch

Everything lives on **`claude/cloudflare-pages-hosting-tajgyw`**.

Both agents:

```bash
git fetch origin claude/cloudflare-pages-hosting-tajgyw
git checkout claude/cloudflare-pages-hosting-tajgyw
git pull origin claude/cloudflare-pages-hosting-tajgyw
```

## Protocol

1. **Opus** writes the case list to `TASK.md`, commits, pushes.
2. **Haiku** pulls, reads `TASK.md`, runs the cases, and writes results to `RESULTS.tsv`
   — *only* that file. Commit, push.
3. **Opus** pulls, reads `RESULTS.tsv`, separates real defects from harness artifacts,
   writes findings to `NOTES.md` and the next round to `TASK.md`.

## Rules

- **Haiku writes `RESULTS.tsv` and nothing else.** No edits to `index.html`, no edits to
  `TASK.md`, no fixes, no other files. The audit is read-only with respect to the app.
- Any scratch harness goes in `/tmp`, never in the repo.
- If a push is rejected, `git pull --rebase` and push again. Because each agent owns
  distinct files, a rebase will never conflict.
- `RESULTS.tsv` is overwritten wholesale each round, not appended.
