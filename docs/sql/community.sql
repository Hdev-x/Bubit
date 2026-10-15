-- Manual migration only. Apply profile.sql first. No automatic startup DDL.
BEGIN;
SET LOCAL search_path = public;
CREATE TABLE IF NOT EXISTS community_posts (
    id BIGSERIAL PRIMARY KEY,
    parent_id BIGINT REFERENCES community_posts(id) ON DELETE CASCADE,
    scope VARCHAR(10) NOT NULL CHECK (scope IN ('feed', 'board')),
    exchange VARCHAR(20) NOT NULL DEFAULT '',
    market VARCHAR(10) NOT NULL DEFAULT '',
    symbol VARCHAR(40) NOT NULL DEFAULT '',
    title VARCHAR(120) NOT NULL DEFAULT '',
    body VARCHAR(2000) NOT NULL CHECK (LENGTH(TRIM(body)) > 0),
    author VARCHAR(255) NOT NULL REFERENCES members(email) ON DELETE CASCADE,
    image_id VARCHAR(36) UNIQUE,
    image_data BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((image_id IS NULL) = (image_data IS NULL))
);
CREATE INDEX IF NOT EXISTS community_feed_idx ON community_posts(scope, exchange, market, symbol, id DESC) WHERE parent_id IS NULL;
CREATE INDEX IF NOT EXISTS community_comments_idx ON community_posts(parent_id, id) WHERE parent_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS community_likes (
    post_id BIGINT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    member_id VARCHAR(255) NOT NULL REFERENCES members(email) ON DELETE CASCADE,
    PRIMARY KEY (post_id, member_id)
);
-- API server connects with the application role; browser-facing Supabase roles get no table access.
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_likes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON community_posts, community_likes FROM PUBLIC;
REVOKE ALL ON SEQUENCE community_posts_id_seq FROM PUBLIC;
-- When migration runs as an administrator, grant the dedicated server role access explicitly.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bubit_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON community_posts, community_likes TO bubit_app;
        GRANT USAGE, SELECT ON SEQUENCE community_posts_id_seq TO bubit_app;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'community_posts' AND policyname = 'community_server') THEN
            CREATE POLICY community_server ON community_posts TO bubit_app USING (true) WITH CHECK (true);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'community_likes' AND policyname = 'community_server') THEN
            CREATE POLICY community_server ON community_likes TO bubit_app USING (true) WITH CHECK (true);
        END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON community_posts, community_likes FROM anon;
        REVOKE ALL ON SEQUENCE community_posts_id_seq FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON community_posts, community_likes FROM authenticated;
        REVOKE ALL ON SEQUENCE community_posts_id_seq FROM authenticated;
    END IF;
END $$;
COMMIT;
