-- Cleanup Test Users and All Associated Data
-- Run with: psql -U emmanuelochiba -d fitai -f scripts/cleanup_test_users.sql

-- STEP 1: Preview all users (identify test vs real)
\echo '=== ALL USERS (Preview) ==='
SELECT 
    id,
    email,
    name,
    created_at,
    (SELECT COUNT(*) FROM chat_messages WHERE user_id = users.id) as chat_count,
    (SELECT COUNT(*) FROM workout_sessions WHERE user_id = users.id) as workout_count,
    (SELECT COUNT(*) FROM training_logs WHERE user_id = users.id) as training_log_count
FROM users
ORDER BY created_at DESC;

-- STEP 2: Identify test users (modify this pattern as needed)
\echo ''
\echo '=== TEST USERS TO DELETE (Preview) ==='
SELECT 
    id,
    email,
    name,
    created_at,
    (SELECT COUNT(*) FROM chat_messages WHERE user_id = users.id) as chat_count,
    (SELECT COUNT(*) FROM workout_sessions WHERE user_id = users.id) as workout_count
FROM users
WHERE 
    -- Common test email patterns
    email ILIKE '%test%' 
    OR email ILIKE '%fake%'
    OR email ILIKE '%demo%'
    OR email ILIKE '%example%'
    OR email ILIKE '%tester%'
    OR email LIKE 'test@%'
    OR email LIKE 'fake@%'
    OR email LIKE 'demo@%'
    -- Add specific test emails here if needed
    -- OR email IN ('test1@example.com', 'test2@example.com')
    OR name ILIKE '%test%'
    OR name ILIKE '%fake%'
    OR name ILIKE '%demo%'
ORDER BY created_at DESC;

-- STEP 3: Count total records that will be deleted (DRY RUN)
\echo ''
\echo '=== DELETION SUMMARY (DRY RUN) ==='
WITH test_user_ids AS (
    SELECT id FROM users
    WHERE 
        email ILIKE '%test%' 
        OR email ILIKE '%fake%'
        OR email ILIKE '%demo%'
        OR email ILIKE '%example%'
        OR email ILIKE '%tester%'
        OR email LIKE 'test@%'
        OR email LIKE 'fake@%'
        OR email LIKE 'demo@%'
        OR name ILIKE '%test%'
        OR name ILIKE '%fake%'
        OR name ILIKE '%demo%'
)
SELECT 
    (SELECT COUNT(*) FROM test_user_ids) as test_users_count,
    (SELECT COUNT(*) FROM chat_messages WHERE user_id IN (SELECT id FROM test_user_ids)) as chat_messages_count,
    (SELECT COUNT(*) FROM workout_sessions WHERE user_id IN (SELECT id FROM test_user_ids)) as workout_sessions_count,
    (SELECT COUNT(*) FROM exercise_logs WHERE workout_session_id IN (SELECT id FROM workout_sessions WHERE user_id IN (SELECT id FROM test_user_ids))) as exercise_logs_count,
    (SELECT COUNT(*) FROM training_logs WHERE user_id IN (SELECT id FROM test_user_ids)) as training_logs_count,
    (SELECT COUNT(*) FROM user_memory WHERE user_id IN (SELECT id FROM test_user_ids)) as user_memory_count;

-- STEP 4: ACTUAL DELETION (Uncomment to execute)
-- BEGIN;
-- 
-- WITH test_user_ids AS (
--     SELECT id FROM users
--     WHERE 
--         email ILIKE '%test%' 
--         OR email ILIKE '%fake%'
--         OR email ILIKE '%demo%'
--         OR email ILIKE '%example%'
--         OR email ILIKE '%tester%'
--         OR email LIKE 'test@%'
--         OR email LIKE 'fake@%'
--         OR email LIKE 'demo@%'
--         OR name ILIKE '%test%'
--         OR name ILIKE '%fake%'
--         OR name ILIKE '%demo%'
-- )
-- DELETE FROM users WHERE id IN (SELECT id FROM test_user_ids);
-- 
-- -- Verify deletion
-- \echo ''
-- \echo '=== REMAINING USERS ==='
-- SELECT COUNT(*) as remaining_users FROM users;
-- 
-- COMMIT;

\echo ''
\echo '=== TO EXECUTE DELETION: ==='
\echo '1. Review the test users listed above'
\echo '2. Modify the WHERE clause if needed to match your test users'
\echo '3. Uncomment the BEGIN/COMMIT block in STEP 4'
\echo '4. Re-run this script'

