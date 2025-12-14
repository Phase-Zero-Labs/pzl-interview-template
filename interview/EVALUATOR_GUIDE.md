# Evaluator Guide

## Overview

This interview assesses how candidates collaborate with AI tools for data science work. We're evaluating **process over results**.

## Time Breakdown

| Section | Duration | What to Observe |
|---------|----------|-----------------|
| Setup & Orientation | 10 min | Can they get running? How do they orient to unfamiliar code? |
| Guided Analysis | 20 min | How do they iterate with AI? Do they question outputs? |
| Open Exploration | 15 min | What catches their interest? How do they prioritize? |
| Debrief | 10 min | Self-awareness about AI collaboration |

## Before the Interview

1. Ensure candidate has:
   - Cloned the repo
   - Working Python environment (uv preferred)
   - Claude Code or similar AI assistant access

2. Have candidate share their screen

3. Note: Dataset is ~18MB, may take a moment to load first time

## Section 1: Setup & Orientation (10 min)

**Goal**: Get environment running, initial data exploration

**Prompts**:
- "Go ahead and get the environment set up. Talk me through what you're doing."
- "Once you've loaded the data, tell me what you notice about it."

**Watch for**:
- Can they follow setup instructions?
- Do they read error messages carefully?
- How do they orient to a new dataset?
- Do they ask Claude for help appropriately?

**Green flags**:
- Checks shape, dtypes, missing values naturally
- Notices the `?` values representing missing data
- Asks about the target variable distribution
- Looks at a few rows, not just summary stats

**Yellow flags**:
- Stuck on environment issues without trying to debug
- Jumps straight to analysis without exploration
- Doesn't notice data quality issues

## Section 2: Guided Analysis (20 min)

Work through 1-2 questions from `interview/questions.md`. Don't rush through all three.

### Question 1: Medication Changes

**Good approaches**:
- Creates binary "any medication changed" feature first
- Considers defining readmission as binary (<30 vs not)
- Uses appropriate stats (chi-square, logistic regression, etc.)
- Acknowledges confounders (sicker patients get more med changes)

**Sample insight**: "Insulin changes correlate with readmission, but causality is unclear - patients with poorly controlled diabetes probably get insulin adjustments AND are more likely to be readmitted."

### Question 2: Admission Source Interaction

**Good approaches**:
- Maps admission_source_id to meaningful categories first
- Considers interaction term in regression
- Visualizes the relationship before modeling
- Thinks about clinical meaning

**Sample insight**: "ER admissions with short stays might be different from ER admissions with long stays - the former could be less severe, the latter more complex."

### Question 3: Disparities in Testing

**Good approaches**:
- Defines clear outcome (A1C tested yes/no)
- Considers what clinical factors to control for
- Addresses missing race data thoughtfully
- Discusses what "disparity" means (adjusted vs unadjusted)

**Sample insight**: "Raw rates show disparity, but we need to control for clinical factors. Even then, residual disparity could reflect provider bias or patient factors we can't measure."

**Prompts during this section**:
- "Walk me through why you asked Claude that question."
- "The output doesn't look quite right - how would you fix it?"
- "What assumptions is this analysis making?"
- "How confident are you in this result?"

## Section 3: Open Exploration (15 min)

Let them explore freely. Minimal guidance.

**Prompts**:
- "You have 15 minutes to find something interesting. Use Claude however you want."
- (If stuck after 3 min): "What patterns haven't we looked at yet?"

**Watch for**:
- How they generate hypotheses
- Whether they validate findings
- Time management
- Storytelling ability

**Interesting directions they might take**:
- ICD-9 code analysis (requires some domain knowledge or lookup)
- Payer effects on care quality
- Temporal patterns (year, length of stay)
- Multi-medication interactions
- Discharge disposition patterns

## Section 4: Debrief (10 min)

**Questions to ask**:

1. "When did Claude help you most during this exercise?"
   - Looking for: specific examples, awareness of strengths

2. "When did Claude slow you down or lead you astray?"
   - Looking for: honesty, specific examples

3. "What would you do differently if you had more time?"
   - Looking for: prioritization, awareness of shortcuts taken

4. "If you were training someone to use AI for data science, what's your #1 tip?"
   - Looking for: synthesized insight, teaching ability

## Evaluation Rubric

### AI Collaboration (weight: 35%)

| Score | Description |
|-------|-------------|
| 1 | Accepts AI output without question, no iteration |
| 2 | Some iteration, but doesn't catch obvious errors |
| 3 | Good iteration, questions suspicious outputs |
| 4 | Strategic prompting, knows when to trust vs verify |
| 5 | Excellent judgment, uses AI as true collaborator |

### Technical Depth (weight: 30%)

| Score | Description |
|-------|-------------|
| 1 | Surface-level only, basic stats misapplied |
| 2 | Appropriate methods, but doesn't validate assumptions |
| 3 | Sound methodology, considers confounders |
| 4 | Sophisticated approach, validates carefully |
| 5 | Expert-level, considers multiple approaches |

### Communication (weight: 20%)

| Score | Description |
|-------|-------------|
| 1 | Silent or incoherent |
| 2 | Explains when asked, but unclear |
| 3 | Clear explanations, appropriate detail |
| 4 | Naturally narrates thinking, good pacing |
| 5 | Exceptional clarity, adapts to audience |

### Curiosity & Judgment (weight: 15%)

| Score | Description |
|-------|-------------|
| 1 | Only does what's asked |
| 2 | Limited exploration, obvious angles only |
| 3 | Good exploration, asks thoughtful questions |
| 4 | Finds non-obvious patterns, strong intuition |
| 5 | Exceptional curiosity, deep insight |

## Common Issues

**If they're stuck on setup**:
- Give them 5 minutes, then help directly
- Note the issue but don't penalize heavily

**If Claude gives bad output**:
- This is actually good - watch how they handle it
- Don't intervene unless they're completely stuck

**If they go down a rabbit hole**:
- Let it play out for a few minutes
- Gently redirect: "That's interesting - let's also try..."

**If they're nervous**:
- Remind them we care about process, not perfect answers
- Give positive reinforcement early

## Notes Section

Use this space during the interview:

```
Candidate: _______________
Date: _______________

Setup (10 min):
- Time to get running: ___
- Initial exploration notes:


Guided Analysis (20 min):
- Question attempted:
- Approach taken:
- AI collaboration observations:


Open Exploration (15 min):
- Direction chosen:
- Findings:


Debrief (10 min):
- Key quotes:


Scores:
- AI Collaboration: __ /5
- Technical Depth: __ /5
- Communication: __ /5
- Curiosity: __ /5
- Weighted Total: __ /5

Recommendation: [ ] Strong Yes [ ] Yes [ ] No [ ] Strong No

Notes:
```
