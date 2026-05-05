-- Dump body of the CORRECT function (p_hero_entries jsonb = OID 18193)
WITH src AS (
  SELECT pg_get_functiondef(p.oid) AS body
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  p.proname = 'rpc_simulate_battle'
    AND  n.nspname = 'public'
    AND  pg_get_function_arguments(p.oid) LIKE '%hero_entries%'
  ORDER  BY p.oid DESC
  LIMIT  1
),
numbered AS (
  SELECT generate_series(1, length(body), 2000) AS pos, body FROM src
)
SELECT
  pos                                   AS "start",
  LEAST(pos + 1999, length(body))       AS "end",
  substring(body FROM pos FOR 2000)     AS "chunk"
FROM numbered
ORDER BY pos;
