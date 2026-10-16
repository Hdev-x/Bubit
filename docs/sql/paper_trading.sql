-- Bubit - 모의투자(페이퍼 트레이딩) 테이블
-- DB 변경 승인 후 실행: psql <database_url> -f docs/sql/paper_trading.sql
-- 수동 모의투자 전용. paper_worker.sql 또는 trading 프로필은 필요하지 않다.
--
-- 가상 잔고(USDT)로 실시간 시세 기준 모의 매매. 실거래(bot_api_keys/trade_configs)와 완전 분리.
-- 가상계좌 1개/회원, 보유 포지션은 행 단위(같은 종목 중복 보유 허용).

BEGIN;
SET LOCAL search_path = public;

CREATE TABLE IF NOT EXISTS paper_accounts (
    member_id   VARCHAR(255) PRIMARY KEY,
    balance     NUMERIC(20,8) NOT NULL DEFAULT 10000,  -- 가용 USDT(자유 잔고)
    peak_equity NUMERIC(20,8) NOT NULL DEFAULT 10000,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);

ALTER TABLE paper_accounts ADD COLUMN IF NOT EXISTS peak_equity NUMERIC(20,8) NOT NULL DEFAULT 10000;

CREATE TABLE IF NOT EXISTS paper_positions (
    id           SERIAL PRIMARY KEY,
    member_id    VARCHAR(255)   NOT NULL,
    symbol       VARCHAR(30)    NOT NULL,        -- 'BTCUSDT' 등
    direction    VARCHAR(8)     NOT NULL,        -- 'long' | 'short'
    entry_price  NUMERIC(30,10) NOT NULL,
    size         NUMERIC(30,10) NOT NULL,        -- 코인 수량(명목/진입가)
    leverage     INT            NOT NULL DEFAULT 1,
    margin       NUMERIC(20,8)  NOT NULL,        -- 투입 증거금(USDT)
    opened_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_paper_positions_member ON paper_positions(member_id);

-- 지정가 미체결 주문(서버 루프가 현재가 닿으면 체결 → paper_positions로 전환). 증거금은 주문 시 잠금.
CREATE TABLE IF NOT EXISTS paper_orders (
    id           SERIAL PRIMARY KEY,
    member_id    VARCHAR(255)   NOT NULL,
    symbol       VARCHAR(30)    NOT NULL,
    direction    VARCHAR(8)     NOT NULL,        -- 'long' | 'short'
    limit_price  NUMERIC(30,10) NOT NULL,        -- 지정가
    size         NUMERIC(30,10) NOT NULL,        -- 체결 시 수량(증거금×레버리지/지정가)
    leverage     INT            NOT NULL DEFAULT 1,
    margin       NUMERIC(20,8)  NOT NULL,        -- 주문 시 잠근 증거금(USDT)
    status       VARCHAR(10)    NOT NULL DEFAULT 'pending', -- pending | filled | canceled
    created_at   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_paper_orders_member ON paper_orders(member_id);
CREATE INDEX IF NOT EXISTS idx_paper_orders_pending ON paper_orders(status);

-- member_id → members(email) FK (members 존재 시에만, 1회 실행)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'members')
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_paper_accounts_member') THEN
        ALTER TABLE paper_accounts
            ADD CONSTRAINT fk_paper_accounts_member
            FOREIGN KEY (member_id) REFERENCES members(email) ON DELETE CASCADE;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'members')
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_paper_positions_member') THEN
        ALTER TABLE paper_positions
            ADD CONSTRAINT fk_paper_positions_member
            FOREIGN KEY (member_id) REFERENCES members(email) ON DELETE CASCADE;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'members')
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.paper_orders'::regclass AND conname = 'fk_paper_orders_member') THEN
        ALTER TABLE paper_orders
            ADD CONSTRAINT fk_paper_orders_member
            FOREIGN KEY (member_id) REFERENCES members(email) ON DELETE CASCADE;
    END IF;
END $$;

-- 브라우저의 Supabase Data API 접근을 차단하고 JWT·소유권 검증을 하는 서버 역할만 허용한다.
-- bubit_app이 없는 로컬 DB에서는 테이블 소유자가 사용하며, 앱 역할을 만든 뒤 이 스크립트를 다시 적용한다.
ALTER TABLE paper_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON paper_accounts, paper_positions, paper_orders FROM PUBLIC;
REVOKE ALL ON SEQUENCE paper_positions_id_seq, paper_orders_id_seq FROM PUBLIC;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bubit_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON paper_accounts, paper_positions, paper_orders TO bubit_app;
        GRANT USAGE, SELECT ON SEQUENCE paper_positions_id_seq, paper_orders_id_seq TO bubit_app;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'paper_accounts' AND policyname = 'paper_server') THEN
            CREATE POLICY paper_server ON paper_accounts FOR ALL TO bubit_app USING (true) WITH CHECK (true);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'paper_positions' AND policyname = 'paper_server') THEN
            CREATE POLICY paper_server ON paper_positions FOR ALL TO bubit_app USING (true) WITH CHECK (true);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'paper_orders' AND policyname = 'paper_server') THEN
            CREATE POLICY paper_server ON paper_orders FOR ALL TO bubit_app USING (true) WITH CHECK (true);
        END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON paper_accounts, paper_positions, paper_orders FROM anon;
        REVOKE ALL ON SEQUENCE paper_positions_id_seq, paper_orders_id_seq FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON paper_accounts, paper_positions, paper_orders FROM authenticated;
        REVOKE ALL ON SEQUENCE paper_positions_id_seq, paper_orders_id_seq FROM authenticated;
    END IF;
END $$;
COMMIT;
