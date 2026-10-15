-- 수동 적용 대상. 배포 전에 별도 승인 후 적용한다. 앱은 자동 실행하지 않는다.
-- login / me에서 사진을 조회하므로 이 테이블을 먼저 준비해야 한다.
-- 원본 사진/파일명/EXIF는 저장하지 않고 최대 256px PNG만 보관한다.
BEGIN;
SET LOCAL search_path = public;
CREATE TABLE IF NOT EXISTS member_profiles (
    member_id VARCHAR(255) PRIMARY KEY REFERENCES members(email) ON DELETE CASCADE,
    avatar_id UUID NOT NULL UNIQUE,
    avatar_data BYTEA NOT NULL CHECK (octet_length(avatar_data) <= 524288),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE member_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON member_profiles FROM PUBLIC;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bubit_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON member_profiles TO bubit_app;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'member_profiles' AND policyname = 'profile_server') THEN
            CREATE POLICY profile_server ON member_profiles TO bubit_app USING (true) WITH CHECK (true);
        END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON member_profiles FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON member_profiles FROM authenticated;
    END IF;
END $$;
COMMIT;
