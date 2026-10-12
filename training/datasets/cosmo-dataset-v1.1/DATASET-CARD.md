# COSMO Dataset v1.1 / cosmo-alpha-eval-v1.1

This preparation release contains 300 training examples, 70 validation examples,
and 70 held-out tasks, defined by `training/dataset_v11.py`. The old v1.0 source,
pilot, and held-out set are preserved. The old held-out prompts are read only by
the leakage audit, never supplied to the trainer.

## Provenance and coverage

All examples are ORBIT-authored controlled synthetic tasks. No private chats,
application Memory/Knowledge, Sense data, history, credentials, or user documents
are inputs. This is an authored, mechanically checked dataset, not an independently
human-annotated corpus. No claims of broad real-world benchmark validity are made.

Four training variants per family give 20 examples in most categories; Ukrainian
has 40 examples over ten language-edit families. Every validation and held-out
category has five tasks. Categories are reasoning, code, Memory, Knowledge,
context, Russian, Ukrainian, English, JSON, hallucination, source conflict,
tool formatting, prompt injection, and layout/style. Across all partitions,
350 examples are Ukrainian, 60 English, 30 Russian. The code category has some
Ukrainian phrasing inside English code-output instructions; language metadata
describes the intended primary task, not strict monolingual annotation.

Memory covers exact Cyrillic IDs, leading zeroes, dates, and 2/4/6/8 facts.
Validation exercises selection and joins; held-out tasks add correction, retention,
entity separation, and undo. Tool tests format a declared schema; they do not
execute tools. Knowledge supplies synthetic evidence; it does not invoke live RAG.
Vision is outside this text-only dataset and must remain NOT VERIFIED.

## Split and leakage policy

Families are assigned before row expansion; no family crosses a split. There are
215 authored families in total. Only training families have parameter variants.
Held-out tasks have distinct IDs and family labels, but this alone does not prove
statistical independence or eliminate conceptual overlap between related skills.

The audit verifies exact prompt deduplication and compares all new prompts with
the 14 old held-out tasks. The maximum old/new word-set Jaccard similarity is
0.261. It also publishes 76 cross-split lexical pairs above 0.8. These are retained
for transparency: short grammar edits and JSON/unknown-field/source-conflict
contracts share instruction boilerplate. They are not silently discarded.
Cross-split scenarios and payloads differ, but correlated template coverage is a
limitation. A later independent review should expand scenario diversity before
using these scores to make general assistant claims.

## Separate scores, frozen before inference

Semantic correctness and protocol compliance are separate booleans; joint requires
both. JSON semantics compare exact typed objects, rejecting extra or duplicate
keys; fenced correct JSON can pass semantics while failing protocol. Memory values
must retain exact characters. Citation semantics check the supplied fact, and
protocol independently checks the exact source marker. Numeric answers reject
negation and competing values. Language normalization tolerates only casing,
whitespace, terminal punctuation and apostrophe shape; the allowed answers are
fixed before any model output. This bounded recognizer is not a universal semantic
judge: unlisted valid paraphrases can fail, especially for language and Knowledge.

The audit checked 440 reference answers and 830 negative/separation cases. Token
length was measured with the actual pinned tokenizer: maximum 268 tokens including
the supervised answer. No training labels are silently truncated.

## Training and promotion policy

The pinned original Gemma base is loaded afresh for every stage, never the old
pilot adapter. Configuration is NF4, rank 8, alpha 16, dropout 0.05, batch 1,
accumulation 8, seed 42, maximum sequence 512. Stages are capped at 32, 96, and 192
optimizer steps. Validation alone controls escalation; held-out results must not
be used to select the next stage. All trained adapters get fresh-process reload
and the same full held-out evaluation. Scores from this suite must not be compared
numerically with v1.0's 6/28 because both tasks and rubric changed.

No production role or COSMO Brain Alpha is created by generating this dataset.
