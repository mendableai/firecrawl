-- Create the 'public' schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS public;

-- Set the search path to the 'public' schema
SET search_path TO public;

--
-- Table structure for table 'teams'
--

CREATE TABLE teams (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    stripe_customer_id text
);

--
-- Table structure for table 'users'
--

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name text,
    email text NOT NULL,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    team_id uuid REFERENCES teams(id) ON DELETE SET NULL
);

--
-- Table structure for table 'api_keys'
--

CREATE TABLE api_keys (
    key uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    plan text
);


--
-- Table structure for table 'prices'
--

CREATE TABLE prices (
    id text PRIMARY KEY,
    product_id text,
    active boolean DEFAULT true NOT NULL,
    credits integer DEFAULT 0 NOT NULL,
    description text,
    lookup_key text,
    metadata jsonb,
    unit_amount integer,
    interval text,
    interval_count integer
);

--
-- Table structure for table 'subscriptions'
--

CREATE TABLE subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    status text DEFAULT 'trialing' NOT NULL,
    metadata jsonb,
    price_id text REFERENCES prices(id) ON DELETE SET NULL,
    quantity integer,
    cancel_at_period_end boolean,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    ended_at timestamp with time zone,
    trial_start timestamp with time zone,
    trial_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cancel_at timestamp with time zone,
    cancelled_at timestamp with time zone
);

--
-- Table structure for table 'credit_usage'
--

CREATE TABLE credit_usage (
    id bigserial PRIMARY KEY,
    team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
    credits_used integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Table structure for table 'coupons'
--

CREATE TABLE coupons (
    id bigserial PRIMARY KEY,
    code text NOT NULL,
    credits integer DEFAULT 0 NOT NULL,
    team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
    status text DEFAULT 'inactive' NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--- type

CREATE TYPE "Mode" AS ENUM (
  'scrape',
  'single_urls',
  'sitemap',
  'crawl'
);

--
-- Table structure for table 'firecrawl_jobs'
--

CREATE TABLE firecrawl_jobs (
    id uuid PRIMARY KEY,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
    crawl_type text,
    mode "Mode" NOT NULL,
    url text,
    status text DEFAULT 'queued' NOT NULL,
    message text,
    docs jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    crawler_options jsonb,
    page_options jsonb,
    extractor_options jsonb,
    retry boolean,
    crawl_id uuid REFERENCES firecrawl_jobs(id) ON DELETE SET NULL,

    page_insights jsonb,
    lighthouse_reports jsonb,
    crawl_depth integer,
    total_pages integer,
    total_issues integer,
    scan_options jsonb
);


--
-- Table structure for table 'scrape_logs'
--

CREATE TABLE scrape_logs (
    id bigserial PRIMARY KEY,
    url text,
    scraper text,
    success boolean,
    response_code integer,
    time_taken_seconds double precision,
    proxy text,
    retried boolean,
    error_message text,
    date_added timestamp with time zone DEFAULT now() NOT NULL,
    html text,
    ipv4_support boolean,
    ipv6_support boolean
);

-- New tables based on the provided models

CREATE TYPE "https_status_code" AS ENUM (
  'OK',
  'CREATED',
  'ACCEPTED',
  'NO_CONTENT',
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'INTERNAL_SERVER_ERROR'
);

CREATE TYPE "data_type" AS ENUM (
  'TEXT',
  'HTML',
  'JSON'
);

CREATE TABLE "websites" (
  "id" SERIAL PRIMARY KEY,
  "url" TEXT UNIQUE NOT NULL,
  "domain" TEXT UNIQUE NOT NULL,
  "crawl_date" TIMESTAMP DEFAULT now(),
  "robotsTxt" TEXT,
  "sitemap" TEXT
);

CREATE TABLE "pages" (
  "id" SERIAL PRIMARY KEY,
  "website_id" INTEGER NOT NULL,
  "url" TEXT UNIQUE NOT NULL,
  "content" TEXT,
  "title" TEXT,
  "meta_description" TEXT,
  "status_code" "https_status_code" DEFAULT 'OK',
  "crawl_date" TIMESTAMP DEFAULT now(),
  CONSTRAINT "page_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "websites"("id")
);

CREATE TABLE "links" (
  "id" SERIAL PRIMARY KEY,
  "src_page_id" INTEGER NOT NULL,
  "tgt_page_id" INTEGER,
  "anchor_text" TEXT,
  CONSTRAINT "link_src_page_id_fkey" FOREIGN KEY ("src_page_id") REFERENCES "pages"("id"),
  CONSTRAINT "link_tgt_page_id_fkey" FOREIGN KEY ("tgt_page_id") REFERENCES "pages"("id")
);

CREATE TABLE "extracted_datas" (
  "id" SERIAL PRIMARY KEY,
  "page_id" INTEGER NOT NULL,
  "page_url" TEXT UNIQUE NOT NULL,
  "data_type" "data_type" DEFAULT 'TEXT',
  "data_value" TEXT,
  CONSTRAINT "extracted_data_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id")
);

CREATE TABLE "crawl_errors" (
  "id" SERIAL PRIMARY KEY,
  "page_id" INTEGER NOT NULL,
  "page_url" TEXT UNIQUE NOT NULL,
  "error_type" TEXT,
  "error_message" TEXT,
  "timestamp" TIMESTAMP DEFAULT now(),
  CONSTRAINT "crawl_error_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id")
);


--
-- Create indexes
--

CREATE UNIQUE INDEX users_email_unique ON users USING btree (lower((email)::text));
CREATE INDEX "page_website_id_url_idx" ON "pages" ("website_id", "url");
CREATE INDEX "link_src_page_id_tgt_page_id_idx" ON "links" ("src_page_id", "tgt_page_id");

--
-- Add foreign key constraints
--
/* 
ALTER TABLE ONLY api_keys
    ADD CONSTRAINT api_keys_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id);

ALTER TABLE ONLY credit_usage
    ADD CONSTRAINT credit_usage_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES subscriptions(id);

ALTER TABLE ONLY credit_usage
    ADD CONSTRAINT credit_usage_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id);

ALTER TABLE ONLY coupons
    ADD CONSTRAINT coupons_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id);

ALTER TABLE ONLY firecrawl_jobs
    ADD CONSTRAINT firecrawl_jobs_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id);

ALTER TABLE ONLY firecrawl_jobs
    ADD CONSTRAINT firecrawl_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE ONLY subscriptions
    ADD CONSTRAINT subscriptions_price_id_fkey FOREIGN KEY (price_id) REFERENCES prices(id);

ALTER TABLE ONLY subscriptions
    ADD CONSTRAINT subscriptions_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id);

ALTER TABLE ONLY users
    ADD CONSTRAINT users_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id);

     */