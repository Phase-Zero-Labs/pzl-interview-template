# Git Workflow Skill

Use this skill when committing code changes.

## Commit Message Style

### Core Principles
1. **Succinct and direct** - No fluff, no mentions of AI assistance
2. **Let code speak** - Focus on WHAT changed, briefly WHY if not obvious
3. **Small, atomic commits** - One logical change per commit
4. **Present tense** - "Add feature" not "Added feature"
5. **ABSOLUTELY NO EMOJIS EVER** - Clean, professional messages only

### Structure
```
<verb> <what>

[optional: 2-3 bullet points for complex changes]
- Detail 1
- Detail 2
```

### Good Examples
```
Add Docker and Dagster deployment configuration

- Add dagster.yaml for SQLite storage
- Configure workspace.yaml for dag_local module
- Update Dockerfile for production deployment
```

```
Fix import paths after package rename

All assets now reference dag_local instead of old package names.
```

```
Migrate utilities to dag_local package

Move root utils/ to dag_local/utils/ for better organization. Add new
modules for metadata and period handling.
```

### Bad Examples (DON'T DO THIS)
```
"Updated some files to make things better"
"feat: Add amazing new feature!"
"Fixed bug with help from AI assistant"
"WIP commit - still testing"
"changes"
"updates"
"stuff"
```

## Commit Workflow

### Before Committing
1. **Review changes**: `git diff` - understand what you're committing
2. **Check for secrets**: grep for API keys, passwords, tokens
3. **Verify .gitignore**: No data files, results, or large files
4. **Group logically**: Related changes go together

### Staging Strategy
- **Infrastructure**: Config files, Docker, deployment setup
- **Core changes**: Package reorganization, major refactors
- **Features**: New functionality, asset additions
- **Fixes**: Bug fixes, import corrections
- **Docs**: README, CLAUDE.md, comments

### For Small Teams (2-5 people)
- **Commit often**: Every logical unit of work
- **Push regularly**: Don't hoard commits locally
- **Descriptive messages**: Your teammates should understand changes without asking
- **No WIP commits**: Finish the thought before committing

### For 10x Coding
- **Keep commits atomic**: Easy to revert, cherry-pick, bisect
- **Write for future you**: 6 months from now, will you understand?
- **No mixed concerns**: Don't bundle unrelated changes
- **Test before commit**: Broken commits waste everyone's time

## Anti-Patterns to Avoid
- Mentioning tools used (IDE, AI assistant, editor)
- **Emoji spam or ANY emojis in commit messages**
- Committing broken/untested code
- Large monolithic commits covering multiple concerns
- Vague messages like "updates", "changes", "fixes stuff"
- Including personal notes or TODOs in commit messages
- Long-winded explanations - keep it brief

## Pre-Push Checklist
- [ ] No secrets or credentials in code
- [ ] .gitignore covers data/results/temp files
- [ ] All commits have clear messages
- [ ] Code runs without errors
- [ ] No debug print statements left behind
- [ ] Large files (>10MB) are gitignored
- [ ] NO EMOJIS in any commit messages

## Commit Message Format

### Standard Format
```
<imperative verb> <concise description>

[Optional bullets for complex changes]
- Key change 1
- Key change 2
```

### Examples by Category

**Infrastructure:**
```
Add Docker deployment configuration
Update SQLite storage settings
Configure network sidecar
```

**Features:**
```
Add data enrichment pipeline
Implement dataset integration
Create dose-response curve plotting
```

**Refactoring:**
```
Migrate utilities to scripts package
Reorganize assets into v2 structure
Extract event matching logic to utils
```

**Fixes:**
```
Fix import paths after package rename
Correct period calculations for baseline gaps
Update database connection pooling
```

**Documentation:**
```
Update CLAUDE.md with Sandbox guidelines
Add deployment instructions to README
Document pipeline architecture
```

## Remember
- Code tells WHAT changed
- Commit message tells WHY (if not obvious)
- Keep it professional and emoji-free
- Make it easy to understand in 6 months
