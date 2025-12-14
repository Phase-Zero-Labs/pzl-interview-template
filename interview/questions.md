# Discovery Questions

These questions guide the interview but aren't meant to have single "correct" answers. The goal is to see how you approach analysis, not whether you arrive at a specific conclusion.

---

## Question 1: Medication Changes and Readmission

The dataset includes 23 medication columns (e.g., `metformin`, `insulin`, `glipizide`) showing whether dosage was changed during the encounter: `Up`, `Down`, `Steady`, or `No` (not prescribed).

**Explore**: Which medication changes, if any, are associated with 30-day readmission?

Things to consider:
- How would you define "associated with"?
- What confounders might exist?
- How do you handle the many medication columns?

---

## Question 2: Admission Source and Length of Stay

Patients arrive at the hospital through different channels: emergency room, physician referral, transfer from another facility, etc. (`admission_source_id`). They also stay varying lengths of time (`time_in_hospital`).

**Explore**: Does the interaction between admission source and length of stay predict outcomes differently than either variable alone?

Things to consider:
- What outcome are you predicting?
- How would you test for an interaction effect?
- Are there patterns that make clinical sense?

---

## Question 3: Disparities in Testing

HbA1c is a key diabetes marker. The `A1Cresult` column shows whether it was measured and what the result was (`>7`, `>8`, `Norm`, or `None` if not measured).

**Explore**: Are there racial disparities in HbA1c testing rates, controlling for clinical factors?

Things to consider:
- What clinical factors should you control for?
- How do you handle missing race data?
- What would "disparity" mean here, and how would you quantify it?

---

## Open Exploration

After working through the guided questions, you'll have 15 minutes to explore freely.

Some directions you might consider (or ignore entirely):
- Diagnosis code patterns (ICD-9 codes in `diag_1`, `diag_2`, `diag_3`)
- Payer/insurance effects on care
- Temporal patterns in the data
- Anything else that catches your attention

The best findings are often unexpected.
