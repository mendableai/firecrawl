-- Script to enable robots.txt respect for scrapes for a specific team
-- This is an opt-in feature that makes scrapes respect robots.txt rules

-- Replace 'YOUR_TEAM_ID' with the actual team ID
-- You can find your team ID in the teams table or from API responses

UPDATE teams
SET flags = jsonb_set(
  COALESCE(flags, '{}'::jsonb),
  '{respectRobotsOnScrapes}',
  'true'::jsonb
)
WHERE id = 'YOUR_TEAM_ID';

-- To verify the flag was set:
-- SELECT id, flags FROM teams WHERE id = 'YOUR_TEAM_ID';

-- To disable the flag:
-- UPDATE teams
-- SET flags = jsonb_set(
--   COALESCE(flags, '{}'::jsonb),
--   '{respectRobotsOnScrapes}',
--   'false'::jsonb
-- )
-- WHERE id = 'YOUR_TEAM_ID';