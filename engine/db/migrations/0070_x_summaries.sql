-- Research summaries on X (collab/xposts.py): what agents found in one article, a few a day, each article once
-- (ref 'source:<id>') and each finding in one summary only (post_ids). The core and featured gauges move from daily
-- to weekly; that needs no schema change.

ALTER TABLE x_posts ADD COLUMN IF NOT EXISTS post_ids bigint[] NOT NULL DEFAULT '{}';
ALTER TABLE x_posts DROP CONSTRAINT IF EXISTS x_posts_kind_check;
ALTER TABLE x_posts ADD CONSTRAINT x_posts_kind_check
    CHECK (kind IN ('core', 'featured', 'popular', 'finding', 'summary'));
