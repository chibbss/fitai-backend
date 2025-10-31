-- Fix metadata for all documents after re-ingestion
-- Run this after ./scripts/reingest_all_docs.sh completes

-- 1. Update Growing Stronger: mobility → strength_training, set source
UPDATE chunks
SET meta_data = jsonb_set(
    jsonb_set(meta_data, '{subcategory}', '"strength_training"'),
    '{source}', '"CDC-Tufts"'
)
WHERE meta_data->>'title' ILIKE '%Growing Stronger%';

-- 2. Update Concepts of Fitness: ensure general_fitness, set source
UPDATE chunks
SET meta_data = jsonb_set(
    jsonb_set(meta_data, '{subcategory}', '"general_fitness"'),
    '{source}', '"GALILEO-UGA"'
)
WHERE meta_data->>'title' ILIKE '%Concepts of Fitness and Wellness%';

-- 3. Update Clemson Fitness Handbook: ensure general_fitness, set source
UPDATE chunks
SET meta_data = jsonb_set(
    jsonb_set(meta_data, '{subcategory}', '"general_fitness"'),
    '{source}', '"Clemson-ROTC"'
)
WHERE meta_data->>'title' ILIKE '%Personal Fitness and Wellness%';

-- 4. Update ACSM: ensure strength_training, set proper source
UPDATE chunks
SET meta_data = jsonb_set(meta_data, '{source}', '"ACSM"')
WHERE meta_data->>'title' ILIKE '%resistance%training%'
   OR meta_data->>'title' ILIKE '%acsm%';

-- 5. Update HHS Physical Activity Guidelines
UPDATE chunks
SET meta_data = jsonb_set(meta_data, '{source}', '"HHS"')
WHERE meta_data->>'title' ILIKE '%Physical Activity Guidelines%';

-- 6. Update WHO Physical Activity
UPDATE chunks
SET meta_data = jsonb_set(meta_data, '{source}', '"WHO"')
WHERE meta_data->>'title' ILIKE '%WHO%'
   OR meta_data->>'title' ILIKE '%Global%recommendation%';

-- 7. Update Self-Determination Theory
UPDATE chunks
SET meta_data = jsonb_set(meta_data, '{source}', '"SDT"')
WHERE meta_data->>'title' ILIKE '%Self%Determination%'
   OR meta_data->>'title' ILIKE '%Ryan%Deci%';

-- 8. Update Nutrition for Nurses
UPDATE chunks
SET meta_data = jsonb_set(meta_data, '{source}', '"NCBI"')
WHERE meta_data->>'title' ILIKE '%Nutrition%Nurses%';

-- Verification queries
\echo ''
\echo '=========================================='
\echo 'VERIFICATION: Chunk quality check'
\echo '=========================================='

-- Check for clean starts (should be high %)
SELECT 
    COUNT(*) FILTER (WHERE text ~ '^[A-Z0-9#•\-\*\[]') AS clean_starts,
    COUNT(*) AS total_chunks,
    ROUND(COUNT(*) FILTER (WHERE text ~ '^[A-Z0-9#•\-\*\[]') * 100.0 / COUNT(*), 1) AS clean_start_percentage
FROM chunks
WHERE chunk_index > 0;

\echo ''
\echo 'Documents by subcategory:'
SELECT 
    meta_data->>'category' AS category,
    meta_data->>'subcategory' AS subcategory,
    meta_data->>'source' AS source,
    COUNT(*) AS chunks,
    COUNT(DISTINCT document_id) AS documents
FROM chunks
GROUP BY category, subcategory, source
ORDER BY chunks DESC;

\echo ''
\echo 'Total counts:'
SELECT COUNT(*) AS total_chunks FROM chunks;
SELECT COUNT(*) AS total_documents FROM documents;

