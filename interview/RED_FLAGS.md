# Red Flags to Watch For

These patterns suggest a candidate may struggle with AI-assisted data science work.

---

## AI Collaboration Red Flags

### 1. "Copy-Paste and Pray"
**Pattern**: Accepts Claude's output without inspection, runs code blindly

**Example**:
```
Claude: [generates code]
Candidate: [runs it immediately]
Candidate: "It worked!" [doesn't check if output makes sense]
```

**Why it matters**: Real-world AI output often needs adjustment. Blind trust leads to errors.

### 2. "Prompt and Forget"
**Pattern**: Asks Claude once, never iterates

**Example**:
```
Candidate: "Claude, analyze this data"
Claude: [gives basic summary]
Candidate: [moves on without follow-up]
```

**Why it matters**: Good AI collaboration requires iteration and refinement.

### 3. "Doesn't Read Errors"
**Pattern**: Immediately asks Claude to fix errors without understanding them

**Example**:
```
Error: KeyError: 'readmission'
Candidate: "Claude, fix this error"
```

**Better**: "Let me check what columns exist... oh, it's 'readmitted' not 'readmission'"

### 4. "Over-reliance on AI"
**Pattern**: Asks Claude for things they should know or can easily check

**Example**:
```
Candidate: "Claude, what does pandas groupby do?"
```

**Why it matters**: Suggests gaps in fundamental knowledge or poor judgment about when to use AI.

### 5. "Argumentative with AI"
**Pattern**: Insists AI is wrong without verification

**Example**:
```
Claude: [correct suggestion]
Candidate: "No, that's not right, do it this other way"
[other way is worse]
```

**Why it matters**: Confidence without verification indicates poor judgment.

---

## Technical Red Flags

### 1. "Correlation = Causation"
**Pattern**: Interprets associations as causal without qualification

**Example**:
```
"Insulin changes CAUSE readmission"
```

**Better**: "Insulin changes are associated with readmission, but causality is unclear"

### 2. "Ignores Missing Data"
**Pattern**: Proceeds with analysis without addressing missingness

**Example**:
```
df.groupby('race')['outcome'].mean()
# Doesn't notice or address the "?" values
```

### 3. "Wrong Statistical Test"
**Pattern**: Uses inappropriate methods for the question

**Examples**:
- Correlation on categorical variables
- T-test on heavily skewed data without transformation
- Multiple comparisons without correction

### 4. "Surface-Level Only"
**Pattern**: Stops at basic summary statistics, never digs deeper

**Example**:
```
Candidate: "The average length of stay is 4.4 days"
Interviewer: "What else can you tell me?"
Candidate: "Um... the median is 4 days"
```

### 5. "Doesn't Validate"
**Pattern**: Never checks if results make sense

**Example**:
```
# Gets readmission rate of 95%
Candidate: "So 95% of patients are readmitted within 30 days"
# [Doesn't question this obviously wrong result]
```

---

## Communication Red Flags

### 1. "Silent Worker"
**Pattern**: Works in silence, only speaks when prompted

**Why it matters**: Can't evaluate thinking process, hard to collaborate with

### 2. "Jargon Without Understanding"
**Pattern**: Uses technical terms incorrectly or without explanation

**Example**:
```
"I'll use a random forest because it handles the heteroscedasticity"
[random forest doesn't address heteroscedasticity in any meaningful way]
```

### 3. "Can't Explain Choices"
**Pattern**: Makes decisions but can't articulate why

**Example**:
```
Interviewer: "Why did you choose logistic regression?"
Candidate: "I don't know, it seemed right"
```

### 4. "Defensive About Questions"
**Pattern**: Treats clarifying questions as challenges

**Example**:
```
Interviewer: "What assumptions does this model make?"
Candidate: "Are you saying I did it wrong?"
```

---

## Process Red Flags

### 1. "Analysis Paralysis"
**Pattern**: Spends too long planning, never starts doing

**Example**:
```
[10 minutes in]
Candidate: "I'm still thinking about the best approach..."
[has not written any code]
```

### 2. "Rabbit Hole Diver"
**Pattern**: Gets stuck on minor details, loses sight of goal

**Example**:
```
[Spends 15 minutes trying to perfectly format a minor visualization]
```

### 3. "No Hypothesis"
**Pattern**: Explores randomly without forming expectations

**Example**:
```
"Let me try groupby... now let me try this... now this..."
[no coherent thread connecting analyses]
```

### 4. "Doesn't Prioritize"
**Pattern**: Treats all findings as equally important

**Example**:
```
"I found that age is distributed across bins, and race has some missing values,
and the average number of medications is 16, and..."
[no sense of what matters]
```

---

## Yellow Flags (Context Matters)

These are concerning but might have explanations:

### "Nervous Silence"
Could be interview anxiety vs. actual communication issues. Give them a few minutes to warm up.

### "Unfamiliar with Tools"
Hamilton/uv might be new to them. Focus on their adaptability, not prior knowledge.

### "Different Coding Style"
R users writing Python-style R, or vice versa. Not a red flag if they're effective.

### "Asks Too Many Questions"
Could be thorough vs. indecisive. Clarifying questions are good; stalling is not.

---

## How to Probe Concerns

If you see a yellow/red flag, probe gently:

**For silent workers**:
"Walk me through what you're thinking right now"

**For copy-paste behavior**:
"Before running that, what do you expect to see?"

**For over-reliance on AI**:
"Can you explain what that code does in your own words?"

**For surface-level analysis**:
"What question would you ask next?"

**For wrong conclusions**:
"Does that result seem reasonable? How would you verify it?"

---

## Remember

- One red flag ≠ automatic rejection
- Multiple red flags in different categories = concerning pattern
- Context matters - nervous candidates deserve benefit of doubt
- Some flags are more serious than others (can't validate > unfamiliar with tools)
