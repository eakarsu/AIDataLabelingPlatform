# Audit Apply Notes — AIDataLabelingPlatform

Source: `/Users/erolakarsu/projects/_AUDIT/reports/batch_02.md` (lines 913-943).

The audit reports 0 AI endpoints. Inspection shows ~8 AI endpoints
(`active-learning`, `conflict-resolver`, `bias-scan`, `qa-sample` in
`routes/aiFeatures.js`; `run`, `single`, `results` in `routes/autoLabeling.js`).
Audit metadata is stale.

The existing endpoints already cover essentially all audit gaps
(`/auto-label`, `/suggest-labels`, `/detect-disagreement`, `/active-learning`).
This pass is **backlog-only** to avoid duplicating endpoints.

## Original audit recommendations

### Missing AI counterparts (audit, mostly already covered)
- `/auto-label` — `autoLabeling/run`, `autoLabeling/single`.
- `/suggest-labels` — covered by autoLabeling endpoints.
- `/detect-disagreement` — `conflict-resolver`.
- `/identify-ambiguous-items` — partly via active-learning ranking.
- `/recommend-label-strategy` — not covered.
- `/active-learning` — already exists.

### Missing non-AI features
- Dataset management or versioning.
- User/labeler management and quality control.
- Label schema definition and validation.
- ML training pipeline integration.
- Audit trail for label changes (note: `ai_results` table partially does this).

### Custom feature suggestions
- Active learning engine (already exists).
- Crowd consensus & conflict resolution (already exists).
- Label quality prediction.
- Semantic similarity clustering.
- Labeler quality scoring.

## Implemented in this pass

None. Backlog-only.

## Backlog (prioritized)

### Mechanical, low-risk
1. `/api/ai-features/recommend-label-strategy` — given a dataset summary,
   output a labeling strategy recommendation.
2. `/api/ai-features/labeler-quality-score` — given a labeler's history,
   output a quality score.
3. `/api/ai-features/identify-ambiguous-items` — explicit endpoint that
   enumerates ambiguous items (separate from active-learning).

### Needs product decision
- Dataset versioning model (immutable snapshots vs. log-of-changes).
- Label schema validation rules.

### Needs credentials / external SDK
- ML training pipeline integration (MLflow, SageMaker, Vertex).

### Too risky / large refactor
- Real-time labeler routing engine.
- Semantic clustering at scale (vector store).

## Apply pass 3 (frontend)

LEFT-AS-IS. `frontend/src/pages/AIFeatures.jsx`, `AIServices.jsx`, `AutoLabel.jsx` already
wire all `/api/ai-features/*` and `/api/ai/*` endpoints with Bearer auth via the
axios interceptor in `src/api.js` (token from `localStorage`). Errors (incl. 503
no-key) shown via toast + error banner. No FE changes required.

## Apply pass 4 (mechanical backlog)

LEFT-AS-IS. All three "Mechanical, low-risk" backlog items from this note are
already implemented end-to-end (BE + FE) by prior passes:

1. `POST /api/ai-features/recommend-label-strategy` — `backend/routes/aiFeatures.js` (lines 348-403); FE call at `frontend/src/pages/AIFeatures.jsx:123`.
2. `POST /api/ai-features/labeler-quality-score` — `backend/routes/aiFeatures.js` (lines 407-475); FE call at `AIFeatures.jsx:138`.
3. `POST /api/ai-features/identify-ambiguous-items/:project_id` — `backend/routes/aiFeatures.js` (lines 479-536); FE call at `AIFeatures.jsx:157`.

All endpoints surface 503 via `e.statusCode = 503` thrown from `callAI` when
`OPENROUTER_API_KEY` is unset. `router.use(authMiddleware)` enforces JWT bearer
on every route. Remaining backlog is NEEDS-PRODUCT-DECISION / NEEDS-CREDS /
TOO-RISKY only — none added this pass.
