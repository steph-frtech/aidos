# mp-skills

A [Claude Code plugin](https://code.claude.com/docs/en/plugins) that packages [Matt Pocock's agent skills](https://github.com/mattpocock/skills) for easy installation.

Skills are auto-synced daily from the upstream repo via GitHub Actions.

## Install

### Via [Summon](https://github.com/ai-summon/summon)

```bash
summon install mp-skills
```

### Via Claude Code CLI

```bash
claude plugin marketplace add ai-summon/summon-marketplace # (once)

claude plugin install mp-skills@summon-marketplace
```

### Via Copilot CLI

```bash
copilot plugin marketplace add ai-summon/summon-marketplace # (once)

copilot plugin install mp-skills@summon-marketplace
```

## Usage

Skills are namespaced under `mp-skills`:

```
/mp-skills:tdd
/mp-skills:grill-me
/mp-skills:to-prd
/mp-skills:design-an-interface
```

Run `/help` to see all available skills.

## Update

### Via Summon

```bash
summon update mp-skills
```

### Via Claude Code CLI

```bash
claude plugin update mp-skills@summon-marketplace
```

### Via Copilot CLI

```bash
copilot plugin update mp-skills@summon-marketplace
```

## How sync works

A daily [GitHub Actions workflow](.github/workflows/sync-upstream.yml) checks for new commits in [mattpocock/skills](https://github.com/mattpocock/skills). When changes are detected it:

1. Shallow-clones the upstream repo
2. Copies all skill directories into `skills/`
3. Bumps the plugin patch version
4. Opens a pull request with the changes

The last synced upstream commit SHA is tracked in `.upstream-sha`.

## Manual sync

```bash
bash scripts/sync-skills.sh
bash scripts/bump-version.sh
```

## License

MIT — same as the [upstream repo](https://github.com/mattpocock/skills/blob/main/LICENSE).
