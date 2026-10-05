-- soma base schema.
--
-- Creates every table soma reads and writes, on an empty Postgres database
-- (14 or newer). It already includes everything in migrations/, so a new
-- install runs only this file:
--
--   psql "$DATABASE_URL" -f web/lib/db/schema.sql
--
-- The files in migrations/ are for databases created before this file existed.
-- Generated with pg_dump --schema-only from the running database. No data.

--
-- PostgreSQL database dump
--

-- Dumped from database version 17.9 (Homebrew)
-- Dumped by pg_dump version 17.9 (Homebrew)

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

--
-- Name: activity_routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_routes (
    activity_id bigint NOT NULL,
    samples jsonb NOT NULL,
    sample_count integer NOT NULL,
    derived_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: activity_sync_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_sync_log (
    id bigint NOT NULL,
    source_platform character varying(50) NOT NULL,
    source_id character varying(200) NOT NULL,
    destination character varying(50) NOT NULL,
    destination_id character varying(200),
    rule_id integer,
    status character varying(20) NOT NULL,
    error_message text,
    processed_at timestamp with time zone DEFAULT now()
);

--
-- Name: activity_sync_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.activity_sync_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: activity_sync_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.activity_sync_log_id_seq OWNED BY public.activity_sync_log.id;

--
-- Name: analytics_weight_trend; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analytics_weight_trend (
    date date NOT NULL,
    weight_kg real NOT NULL,
    avg_7d real,
    avg_30d real,
    delta_7d real,
    delta_30d real,
    calculated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: app_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_cache (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);

--
-- Name: backfill_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backfill_progress (
    source character varying(50) NOT NULL,
    oldest_date_done date,
    last_page integer DEFAULT 0,
    total_items integer DEFAULT 0,
    items_completed integer DEFAULT 0,
    status character varying(20) DEFAULT 'pending'::character varying,
    updated_at timestamp with time zone DEFAULT now()
);

--
-- Name: banister_params; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.banister_params (
    id integer NOT NULL,
    p0 double precision NOT NULL,
    k1 double precision NOT NULL,
    k2 double precision NOT NULL,
    tau1 double precision NOT NULL,
    tau2 double precision NOT NULL,
    n_anchors integer DEFAULT 0 NOT NULL,
    fitted_at timestamp without time zone DEFAULT now() NOT NULL,
    current_vdot double precision
);

--
-- Name: banister_params_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.banister_params_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: banister_params_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.banister_params_id_seq OWNED BY public.banister_params.id;

--
-- Name: calibration_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calibration_state (
    id integer NOT NULL,
    phase integer DEFAULT 1,
    data_days integer DEFAULT 0,
    weights jsonb,
    correlations jsonb,
    force_equal boolean DEFAULT false,
    updated_at timestamp with time zone DEFAULT now(),
    computed_at timestamp with time zone DEFAULT now()
);

--
-- Name: calibration_state_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.calibration_state_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: calibration_state_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.calibration_state_id_seq OWNED BY public.calibration_state.id;

--
-- Name: capture_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.capture_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mime character varying(40) NOT NULL,
    bytes bytea NOT NULL,
    byte_size integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    transcript text,
    transcript_source character varying(30)
);

--
-- Name: custom_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_mappings (
    hevy_name text NOT NULL,
    category integer NOT NULL,
    subcategory integer DEFAULT 0 NOT NULL
);

--
-- Name: daily_health_summary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_health_summary (
    date date NOT NULL,
    total_steps integer,
    total_distance_meters real,
    floors_climbed integer,
    active_time_seconds integer,
    sedentary_time_seconds integer,
    moderate_intensity_minutes integer,
    vigorous_intensity_minutes integer,
    total_kilocalories integer,
    active_kilocalories integer,
    bmr_kilocalories integer,
    resting_heart_rate integer,
    min_heart_rate integer,
    max_heart_rate integer,
    avg_stress_level integer,
    max_stress_level integer,
    body_battery_charged integer,
    body_battery_drained integer,
    body_battery_max integer,
    body_battery_min integer,
    sleep_time_seconds integer,
    hrv_weekly_avg integer,
    hrv_last_night_avg integer,
    hrv_status character varying(20),
    spo2_avg real,
    synced_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    body_battery_at_wake integer,
    avg_overnight_hrv double precision,
    hrv_baseline double precision,
    rhr_7day_avg double precision,
    avg_sleep_stress double precision,
    training_readiness_score integer,
    training_readiness_level character varying(20),
    garmin_hm_prediction_seconds integer
);

--
-- Name: daily_readiness; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_readiness (
    date date NOT NULL,
    hrv_z_score double precision,
    sleep_z_score double precision,
    rhr_z_score double precision,
    body_battery_z_score double precision,
    composite_score double precision,
    traffic_light character varying(10),
    flags jsonb,
    weight_method character varying(20) DEFAULT 'equal'::character varying,
    computed_at timestamp with time zone DEFAULT now()
);

--
-- Name: drink_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drink_log (
    id integer NOT NULL,
    date date NOT NULL,
    drink_type character varying(50) NOT NULL,
    name character varying(120) NOT NULL,
    quantity real DEFAULT 1.0 NOT NULL,
    quantity_ml real NOT NULL,
    calories real NOT NULL,
    carbs real DEFAULT 0 NOT NULL,
    alcohol_grams real DEFAULT 0 NOT NULL,
    fat_oxidation_pause_hours real DEFAULT 0 NOT NULL,
    logged_at timestamp with time zone DEFAULT now()
);

--
-- Name: drink_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.drink_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: drink_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.drink_log_id_seq OWNED BY public.drink_log.id;

--
-- Name: fitness_trajectory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fitness_trajectory (
    date date NOT NULL,
    vo2max double precision,
    efficiency_factor double precision,
    decoupling_pct double precision,
    weight_kg double precision,
    vdot_adjusted double precision,
    race_prediction_seconds integer,
    computed_at timestamp with time zone DEFAULT now()
);

--
-- Name: garmin_activity_raw; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.garmin_activity_raw (
    id bigint NOT NULL,
    activity_id bigint NOT NULL,
    endpoint_name character varying(100) NOT NULL,
    raw_json jsonb NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: garmin_activity_raw_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.garmin_activity_raw_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: garmin_activity_raw_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.garmin_activity_raw_id_seq OWNED BY public.garmin_activity_raw.id;

--
-- Name: garmin_profile_raw; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.garmin_profile_raw (
    id bigint NOT NULL,
    endpoint_name character varying(100) NOT NULL,
    raw_json jsonb NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: garmin_profile_raw_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.garmin_profile_raw_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: garmin_profile_raw_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.garmin_profile_raw_id_seq OWNED BY public.garmin_profile_raw.id;

--
-- Name: garmin_raw_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.garmin_raw_data (
    id bigint NOT NULL,
    date date NOT NULL,
    endpoint_name character varying(100) NOT NULL,
    raw_json jsonb NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: garmin_raw_data_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.garmin_raw_data_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: garmin_raw_data_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.garmin_raw_data_id_seq OWNED BY public.garmin_raw_data.id;

--
-- Name: garmin_workouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.garmin_workouts (
    workout_id text NOT NULL,
    workout_name text NOT NULL,
    sport_type text DEFAULT 'running'::text,
    steps_summary text,
    segments jsonb,
    raw_json jsonb NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: hevy_raw_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hevy_raw_data (
    id bigint NOT NULL,
    hevy_id character varying(100),
    endpoint_name character varying(100) NOT NULL,
    raw_json jsonb NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: hevy_raw_data_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hevy_raw_data_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: hevy_raw_data_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hevy_raw_data_id_seq OWNED BY public.hevy_raw_data.id;

--
-- Name: hr_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_cache (
    hevy_id text NOT NULL,
    data jsonb NOT NULL,
    cached_at timestamp with time zone DEFAULT now()
);

--
-- Name: ingredient_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingredient_proposals (
    id integer NOT NULL,
    query text NOT NULL,
    name text NOT NULL,
    calories_per_100g real,
    protein_per_100g real,
    carbs_per_100g real,
    fat_per_100g real,
    fiber_per_100g real,
    category character varying(40),
    unit character varying(20) DEFAULT 'g'::character varying,
    grams_per_unit real,
    is_raw boolean,
    raw_to_cooked_ratio real,
    source character varying(24) NOT NULL,
    source_id text,
    source_url text,
    confidence real,
    rationale text,
    flags text[] DEFAULT '{}'::text[] NOT NULL,
    status character varying(16) DEFAULT 'pending'::character varying NOT NULL,
    confirmed_ingredient_id character varying(60),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: ingredient_proposals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ingredient_proposals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: ingredient_proposals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ingredient_proposals_id_seq OWNED BY public.ingredient_proposals.id;

--
-- Name: ingredients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingredients (
    id character varying(60) NOT NULL,
    name character varying(120) NOT NULL,
    calories_per_100g real NOT NULL,
    protein_per_100g real NOT NULL,
    carbs_per_100g real NOT NULL,
    fat_per_100g real NOT NULL,
    fiber_per_100g real DEFAULT 0 NOT NULL,
    is_raw boolean DEFAULT false NOT NULL,
    raw_to_cooked_ratio real,
    category character varying(40),
    usda_fdc_id integer,
    created_at timestamp with time zone DEFAULT now(),
    shrink_priority integer DEFAULT 2,
    unit character varying(20) DEFAULT 'g'::character varying,
    grams_per_unit real,
    unit_step real DEFAULT 0.25,
    is_favorite boolean DEFAULT false,
    status character varying(16) DEFAULT 'confirmed'::character varying NOT NULL,
    source character varying(24),
    source_id text,
    source_url text,
    confidence real,
    research_notes text,
    researched_at timestamp with time zone
);

--
-- Name: meal_capture; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meal_capture (
    id bigint NOT NULL,
    date date NOT NULL,
    meal_slot character varying,
    mode character varying DEFAULT 'log'::character varying NOT NULL,
    status character varying DEFAULT 'captured'::character varying NOT NULL,
    messages jsonb DEFAULT '[]'::jsonb NOT NULL,
    proposal jsonb,
    resolved jsonb,
    meal_log_id integer,
    error text,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tz character varying(64)
);

--
-- Name: meal_capture_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.meal_capture_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: meal_capture_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.meal_capture_id_seq OWNED BY public.meal_capture.id;

--
-- Name: meal_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meal_log (
    id integer NOT NULL,
    date date NOT NULL,
    meal_slot character varying(20) NOT NULL,
    source character varying(20),
    preset_meal_id character varying(60),
    portion_multiplier real DEFAULT 1.0 NOT NULL,
    items jsonb NOT NULL,
    calories real NOT NULL,
    protein real NOT NULL,
    carbs real NOT NULL,
    fat real NOT NULL,
    fiber real DEFAULT 0 NOT NULL,
    notes text,
    weigh_method character varying(20),
    logged_at timestamp with time zone DEFAULT now(),
    planned boolean DEFAULT false
);

--
-- Name: meal_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.meal_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: meal_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.meal_log_id_seq OWNED BY public.meal_log.id;

--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    id integer NOT NULL,
    enabled boolean DEFAULT true,
    on_sync_workout boolean DEFAULT true,
    on_sync_run boolean DEFAULT true,
    on_sync_error boolean DEFAULT true,
    on_milestone boolean DEFAULT true,
    on_playlist_ready boolean DEFAULT false,
    updated_at timestamp with time zone DEFAULT now()
);

--
-- Name: notification_preferences_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_preferences_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: notification_preferences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_preferences_id_seq OWNED BY public.notification_preferences.id;

--
-- Name: nutrition_day; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nutrition_day (
    date date NOT NULL,
    plan jsonb,
    target_calories integer,
    target_protein real,
    target_carbs real,
    target_fat real,
    target_fiber real,
    tdee_used real,
    exercise_calories real,
    step_calories real,
    deficit_used real,
    adjustment_reason text,
    sleep_quality_score real,
    training_day_type character varying(20),
    planned_workouts jsonb,
    step_goal integer,
    is_refeed boolean DEFAULT false,
    is_diet_break boolean DEFAULT false,
    status character varying(20) DEFAULT 'active'::character varying,
    actual_calories real DEFAULT 0,
    actual_protein real DEFAULT 0,
    actual_carbs real DEFAULT 0,
    actual_fat real DEFAULT 0,
    actual_fiber real DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    skipped_slots text[] DEFAULT '{}'::text[],
    run_enabled boolean DEFAULT true,
    selected_workouts text[] DEFAULT '{}'::text[],
    expected_steps integer,
    manual_override boolean DEFAULT false,
    planned_run_km real,
    closed_by text,
    CONSTRAINT nutrition_day_closed_by_check CHECK ((closed_by = ANY (ARRAY['user'::text, 'auto'::text])))
);

--
-- Name: nutrition_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nutrition_profile (
    id integer DEFAULT 1 NOT NULL,
    weight_kg real,
    height_cm real,
    age integer,
    sex character varying(10),
    activity_level character varying(20),
    goal character varying(20),
    target_calories integer,
    target_protein real,
    target_carbs real,
    target_fat real,
    target_fiber real,
    estimated_bf_pct real,
    estimated_ffm_kg real,
    target_bf_pct real,
    target_date date,
    tdee_estimate real,
    tdee_confidence character varying(20),
    daily_deficit real,
    protein_g_per_kg real DEFAULT 2.2,
    fat_g_per_kg real DEFAULT 0.8,
    step_goal integer DEFAULT 10000,
    creatine_dose_g real DEFAULT 5.0,
    creatine_start_date date,
    creatine_dose_change_date date,
    vo2max real,
    sentinel_exercises jsonb,
    updated_at timestamp with time zone DEFAULT now(),
    deficit_mode text DEFAULT 'standard'::text NOT NULL,
    deficit_phase_start_date date,
    capture_mode_default character varying DEFAULT 'log'::character varying NOT NULL,
    CONSTRAINT nutrition_profile_deficit_mode_check CHECK ((deficit_mode = ANY (ARRAY['standard'::text, 'aggressive'::text, 'reverse'::text, 'maintenance'::text, 'bulk'::text, 'injured'::text]))),
    CONSTRAINT nutrition_profile_id_check CHECK ((id = 1))
);

--
-- Name: platform_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_credentials (
    platform character varying(50) NOT NULL,
    auth_type character varying(20) NOT NULL,
    credentials jsonb DEFAULT '{}'::jsonb NOT NULL,
    connected_at timestamp with time zone,
    expires_at timestamp with time zone,
    status character varying(20) DEFAULT 'disconnected'::character varying
);

--
-- Name: playlist_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playlist_preferences (
    segment_type text NOT NULL,
    sync_mode text DEFAULT 'auto'::text,
    bpm_min integer,
    bpm_max integer,
    bpm_tolerance integer DEFAULT 8,
    valence_min double precision,
    valence_max double precision,
    updated_at timestamp with time zone DEFAULT now()
);

--
-- Name: playlist_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playlist_sessions (
    id integer NOT NULL,
    workout_plan_id integer,
    garmin_activity_id text,
    source_playlist_ids text[] DEFAULT '{}'::text[],
    genre_selection text[] DEFAULT '{}'::text[],
    genre_threshold double precision DEFAULT 0.03,
    song_assignments jsonb DEFAULT '{}'::jsonb,
    excluded_track_ids text[] DEFAULT '{}'::text[],
    spotify_playlist_id text,
    spotify_playlist_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

--
-- Name: playlist_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.playlist_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: playlist_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.playlist_sessions_id_seq OWNED BY public.playlist_sessions.id;

--
-- Name: pmc_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pmc_daily (
    date date NOT NULL,
    ctl double precision NOT NULL,
    atl double precision NOT NULL,
    tsb double precision NOT NULL,
    daily_load double precision DEFAULT 0 NOT NULL,
    computed_at timestamp with time zone DEFAULT now()
);

--
-- Name: preset_meals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preset_meals (
    id character varying(60) NOT NULL,
    name character varying(120) NOT NULL,
    items jsonb NOT NULL,
    tags text[],
    meal_slot character varying(20),
    total_calories real,
    total_protein real,
    total_carbs real,
    total_fat real,
    total_fiber real,
    is_system boolean DEFAULT true,
    use_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: pump_up_songs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pump_up_songs (
    track_id text NOT NULL,
    name text NOT NULL,
    artist_name text NOT NULL,
    tempo double precision,
    energy double precision,
    added_at timestamp with time zone DEFAULT now()
);

--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id integer NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now(),
    last_used_at timestamp with time zone DEFAULT now()
);

--
-- Name: push_subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.push_subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: push_subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.push_subscriptions_id_seq OWNED BY public.push_subscriptions.id;

--
-- Name: sleep_detail; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sleep_detail (
    date date NOT NULL,
    sleep_start timestamp with time zone,
    sleep_end timestamp with time zone,
    total_sleep_seconds integer,
    deep_sleep_seconds integer,
    light_sleep_seconds integer,
    rem_sleep_seconds integer,
    awake_seconds integer,
    sleep_score integer,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: spotify_artist_genres; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spotify_artist_genres (
    artist_id text NOT NULL,
    artist_name text NOT NULL,
    genres text[] DEFAULT '{}'::text[],
    macro_genres text[] DEFAULT '{}'::text[],
    source text DEFAULT 'spotify'::text,
    cached_at timestamp with time zone DEFAULT now()
);

--
-- Name: spotify_track_features; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spotify_track_features (
    track_id text NOT NULL,
    name text NOT NULL,
    artist_id text NOT NULL,
    artist_name text NOT NULL,
    duration_ms integer NOT NULL,
    tempo double precision,
    energy double precision,
    valence double precision,
    danceability double precision,
    genres text[] DEFAULT '{}'::text[],
    raw_genres text[] DEFAULT '{}'::text[],
    cached_at timestamp with time zone DEFAULT now()
);

--
-- Name: strava_bridge_uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.strava_bridge_uploads (
    garmin_activity_id bigint NOT NULL,
    strava_activity_id bigint,
    uploaded_at timestamp with time zone DEFAULT now()
);

--
-- Name: strava_photo_uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.strava_photo_uploads (
    garmin_activity_id bigint NOT NULL,
    strava_activity_id bigint NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: strava_raw_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.strava_raw_data (
    id bigint NOT NULL,
    strava_id bigint NOT NULL,
    endpoint_name character varying(100) NOT NULL,
    raw_json jsonb NOT NULL,
    synced_at timestamp with time zone DEFAULT now()
);

--
-- Name: strava_raw_data_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.strava_raw_data_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: strava_raw_data_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.strava_raw_data_id_seq OWNED BY public.strava_raw_data.id;

--
-- Name: strava_web_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.strava_web_session (
    id integer DEFAULT 1 NOT NULL,
    cookies jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: sync_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_log (
    id bigint NOT NULL,
    sync_type character varying(50) NOT NULL,
    status character varying(20) NOT NULL,
    records_synced integer DEFAULT 0,
    error_message text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);

--
-- Name: sync_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sync_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: sync_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sync_log_id_seq OWNED BY public.sync_log.id;

--
-- Name: sync_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_rules (
    id integer NOT NULL,
    source_platform character varying(50) NOT NULL,
    activity_type character varying(50) DEFAULT '*'::character varying,
    preprocessing text[] DEFAULT '{}'::text[],
    destinations jsonb NOT NULL,
    enabled boolean DEFAULT true,
    priority integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: sync_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sync_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: sync_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sync_rules_id_seq OWNED BY public.sync_rules.id;

--
-- Name: synced_workouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.synced_workouts (
    hevy_id text NOT NULL,
    garmin_activity_id text,
    title text,
    synced_at timestamp with time zone DEFAULT now(),
    calories integer,
    avg_hr integer,
    status character varying(20) DEFAULT 'success'::character varying,
    hevy_updated_at text,
    sync_method text DEFAULT 'upload'::text
);

--
-- Name: tdee_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tdee_history (
    date date NOT NULL,
    bmr real,
    active_calories real,
    total_calories real,
    garmin_total_kcal real,
    activity_minutes real,
    source character varying(20),
    created_at timestamp with time zone DEFAULT now(),
    raw_weight real,
    smoothed_weight real,
    creatine_adjusted_weight real,
    intake_calories real,
    tdee_estimate real,
    confidence_interval real
);

--
-- Name: track_exclude_counts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.track_exclude_counts (
    track_id text NOT NULL,
    exclude_count integer DEFAULT 1,
    last_excluded_at timestamp with time zone DEFAULT now()
);

--
-- Name: training_load; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_load (
    id bigint NOT NULL,
    activity_date date NOT NULL,
    activity_id bigint,
    hevy_id character varying(100),
    source character varying(50) NOT NULL,
    load_metric character varying(20) NOT NULL,
    load_value double precision NOT NULL,
    duration_seconds integer,
    details jsonb,
    computed_at timestamp with time zone DEFAULT now()
);

--
-- Name: training_load_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.training_load_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: training_load_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.training_load_id_seq OWNED BY public.training_load.id;

--
-- Name: training_plan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_plan (
    id integer NOT NULL,
    plan_name character varying(100) NOT NULL,
    race_date date NOT NULL,
    race_distance_km double precision NOT NULL,
    goal_time_seconds integer,
    created_at timestamp with time zone DEFAULT now(),
    status character varying(20) DEFAULT 'active'::character varying,
    dropped_at timestamp with time zone
);

--
-- Name: training_plan_day; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_plan_day (
    id integer NOT NULL,
    plan_id integer NOT NULL,
    day_date date NOT NULL,
    week_number integer NOT NULL,
    day_of_week integer NOT NULL,
    run_type character varying(30),
    run_title character varying(200),
    run_description text,
    target_distance_km double precision,
    target_duration_min double precision,
    workout_steps jsonb,
    gym_workout character varying(20),
    gym_notes text,
    load_level character varying(20),
    completed boolean DEFAULT false,
    actual_distance_km double precision,
    actual_duration_min double precision,
    garmin_workout_id text,
    garmin_push_status character varying(20) DEFAULT 'none'::character varying
);

--
-- Name: training_plan_day_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.training_plan_day_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: training_plan_day_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.training_plan_day_id_seq OWNED BY public.training_plan_day.id;

--
-- Name: training_plan_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.training_plan_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: training_plan_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.training_plan_id_seq OWNED BY public.training_plan.id;

--
-- Name: usda_foods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usda_foods (
    fdc_id integer NOT NULL,
    description text NOT NULL,
    brand_owner text,
    data_type character varying(20),
    calories real,
    protein real,
    carbs real,
    fat real,
    fiber real,
    sugar real,
    sodium real,
    serving_size_g real,
    serving_description text,
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, description)) STORED
);

--
-- Name: user_blacklist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_blacklist (
    track_id text NOT NULL,
    name text,
    artist_name text,
    blacklisted_at timestamp with time zone DEFAULT now()
);

--
-- Name: user_foods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_foods (
    id integer NOT NULL,
    name text NOT NULL,
    brand text,
    calories real NOT NULL,
    protein real NOT NULL,
    carbs real NOT NULL,
    fat real NOT NULL,
    fiber real DEFAULT 0,
    serving_size_g real DEFAULT 100,
    serving_description text,
    barcode character varying(20),
    source character varying(20) DEFAULT 'manual'::character varying,
    source_id character varying(60),
    use_count integer DEFAULT 0,
    is_favorite boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: user_foods_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_foods_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: user_foods_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_foods_id_seq OWNED BY public.user_foods.id;

--
-- Name: weight_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weight_log (
    id bigint NOT NULL,
    date date NOT NULL,
    weight_grams real NOT NULL,
    bmi real,
    body_fat_pct real,
    body_water_pct real,
    bone_mass_grams real,
    muscle_mass_grams real,
    source_type character varying(20),
    synced_at timestamp with time zone DEFAULT now() NOT NULL,
    external_id text,
    pushed_garmin_at timestamp with time zone,
    pushed_strava_at timestamp with time zone,
    measured_at timestamp with time zone
);

--
-- Name: weight_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.weight_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: weight_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.weight_log_id_seq OWNED BY public.weight_log.id;

--
-- Name: workout_enrichment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workout_enrichment (
    id bigint NOT NULL,
    hevy_id character varying(100) NOT NULL,
    garmin_activity_id bigint,
    hr_source character varying(20) NOT NULL,
    avg_hr integer,
    max_hr integer,
    min_hr integer,
    hr_samples jsonb,
    hr_sample_count integer,
    calories integer,
    duration_s double precision,
    exercise_count integer,
    total_sets integer,
    hevy_title character varying(500),
    workout_date date,
    status character varying(20) DEFAULT 'enriched'::character varying NOT NULL,
    processed_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    garmin_enriched boolean DEFAULT false,
    telegram_sent boolean DEFAULT false
);

--
-- Name: workout_enrichment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workout_enrichment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: workout_enrichment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workout_enrichment_id_seq OWNED BY public.workout_enrichment.id;

--
-- Name: workout_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workout_plans (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    sport_type text DEFAULT 'running'::text,
    segments jsonb DEFAULT '[]'::jsonb NOT NULL,
    total_duration_s integer,
    source text DEFAULT 'manual'::text,
    garmin_activity_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    garmin_workout_id text,
    garmin_push_status text DEFAULT 'none'::text
);

--
-- Name: workout_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workout_plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: workout_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workout_plans_id_seq OWNED BY public.workout_plans.id;

--
-- Name: activity_sync_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_sync_log ALTER COLUMN id SET DEFAULT nextval('public.activity_sync_log_id_seq'::regclass);

--
-- Name: banister_params id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banister_params ALTER COLUMN id SET DEFAULT nextval('public.banister_params_id_seq'::regclass);

--
-- Name: calibration_state id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calibration_state ALTER COLUMN id SET DEFAULT nextval('public.calibration_state_id_seq'::regclass);

--
-- Name: drink_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drink_log ALTER COLUMN id SET DEFAULT nextval('public.drink_log_id_seq'::regclass);

--
-- Name: garmin_activity_raw id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garmin_activity_raw ALTER COLUMN id SET DEFAULT nextval('public.garmin_activity_raw_id_seq'::regclass);

--
-- Name: garmin_profile_raw id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garmin_profile_raw ALTER COLUMN id SET DEFAULT nextval('public.garmin_profile_raw_id_seq'::regclass);

--
-- Name: garmin_raw_data id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garmin_raw_data ALTER COLUMN id SET DEFAULT nextval('public.garmin_raw_data_id_seq'::regclass);

--
-- Name: hevy_raw_data id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hevy_raw_data ALTER COLUMN id SET DEFAULT nextval('public.hevy_raw_data_id_seq'::regclass);

--
-- Name: ingredient_proposals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredient_proposals ALTER COLUMN id SET DEFAULT nextval('public.ingredient_proposals_id_seq'::regclass);

--
-- Name: meal_capture id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_capture ALTER COLUMN id SET DEFAULT nextval('public.meal_capture_id_seq'::regclass);

--
-- Name: meal_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_log ALTER COLUMN id SET DEFAULT nextval('public.meal_log_id_seq'::regclass);

--
-- Name: notification_preferences id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences ALTER COLUMN id SET DEFAULT nextval('public.notification_preferences_id_seq'::regclass);

--
-- Name: playlist_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist_sessions ALTER COLUMN id SET DEFAULT nextval('public.playlist_sessions_id_seq'::regclass);

--
-- Name: push_subscriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.push_subscriptions_id_seq'::regclass);

--
-- Name: strava_raw_data id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strava_raw_data ALTER COLUMN id SET DEFAULT nextval('public.strava_raw_data_id_seq'::regclass);

--
-- Name: sync_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_log ALTER COLUMN id SET DEFAULT nextval('public.sync_log_id_seq'::regclass);

--
-- Name: sync_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_rules ALTER COLUMN id SET DEFAULT nextval('public.sync_rules_id_seq'::regclass);

--
-- Name: training_load id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_load ALTER COLUMN id SET DEFAULT nextval('public.training_load_id_seq'::regclass);

--
-- Name: training_plan id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_plan ALTER COLUMN id SET DEFAULT nextval('public.training_plan_id_seq'::regclass);

--
-- Name: training_plan_day id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_plan_day ALTER COLUMN id SET DEFAULT nextval('public.training_plan_day_id_seq'::regclass);

--
-- Name: user_foods id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_foods ALTER COLUMN id SET DEFAULT nextval('public.user_foods_id_seq'::regclass);

--
-- Name: weight_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weight_log ALTER COLUMN id SET DEFAULT nextval('public.weight_log_id_seq'::regclass);

--
-- Name: workout_enrichment id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_enrichment ALTER COLUMN id SET DEFAULT nextval('public.workout_enrichment_id_seq'::regclass);

--
-- Name: workout_plans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plans ALTER COLUMN id SET DEFAULT nextval('public.workout_plans_id_seq'::regclass);

--
-- Name: activity_routes activity_routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_routes
    ADD CONSTRAINT activity_routes_pkey PRIMARY KEY (activity_id);

--
-- Name: activity_sync_log activity_sync_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_sync_log
    ADD CONSTRAINT activity_sync_log_pkey PRIMARY KEY (id);

--
-- Name: analytics_weight_trend analytics_weight_trend_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_weight_trend
    ADD CONSTRAINT analytics_weight_trend_pkey PRIMARY KEY (date);

--
-- Name: app_cache app_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_cache
    ADD CONSTRAINT app_cache_pkey PRIMARY KEY (key);

--
-- Name: backfill_progress backfill_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backfill_progress
    ADD CONSTRAINT backfill_progress_pkey PRIMARY KEY (source);

--
-- Name: banister_params banister_params_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banister_params
    ADD CONSTRAINT banister_params_pkey PRIMARY KEY (id);

--
-- Name: calibration_state calibration_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calibration_state
    ADD CONSTRAINT calibration_state_pkey PRIMARY KEY (id);

--
-- Name: capture_media capture_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capture_media
    ADD CONSTRAINT capture_media_pkey PRIMARY KEY (id);

--
-- Name: custom_mappings custom_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_mappings
    ADD CONSTRAINT custom_mappings_pkey PRIMARY KEY (hevy_name);

--
-- Name: daily_health_summary daily_health_summary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_health_summary
    ADD CONSTRAINT daily_health_summary_pkey PRIMARY KEY (date);

--
-- Name: daily_readiness daily_readiness_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_readiness
    ADD CONSTRAINT daily_readiness_pkey PRIMARY KEY (date);

--
-- Name: drink_log drink_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drink_log
    ADD CONSTRAINT drink_log_pkey PRIMARY KEY (id);

--
-- Name: fitness_trajectory fitness_trajectory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fitness_trajectory
    ADD CONSTRAINT fitness_trajectory_pkey PRIMARY KEY (date);

--
-- Name: garmin_activity_raw garmin_activity_raw_activity_id_endpoint_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garmin_activity_raw
    ADD CONSTRAINT garmin_activity_raw_activity_id_endpoint_name_key UNIQUE (activity_id, endpoint_name);

--
-- Name: garmin_activity_raw garmin_activity_raw_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garmin_activity_raw
    ADD CONSTRAINT garmin_activity_raw_pkey PRIMARY KEY (id);

--
-- Name: garmin_profile_raw garmin_profile_raw_endpoint_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garmin_profile_raw
    ADD CONSTRAINT garmin_profile_raw_endpoint_name_key UNIQUE (endpoint_name);

--
-- Name: garmin_profile_raw garmin_profile_raw_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garmin_profile_raw
    ADD CONSTRAINT garmin_profile_raw_pkey PRIMARY KEY (id);

--
-- Name: garmin_raw_data garmin_raw_data_date_endpoint_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garmin_raw_data
    ADD CONSTRAINT garmin_raw_data_date_endpoint_name_key UNIQUE (date, endpoint_name);

--
-- Name: garmin_raw_data garmin_raw_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garmin_raw_data
    ADD CONSTRAINT garmin_raw_data_pkey PRIMARY KEY (id);

--
-- Name: garmin_workouts garmin_workouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garmin_workouts
    ADD CONSTRAINT garmin_workouts_pkey PRIMARY KEY (workout_id);

--
-- Name: hevy_raw_data hevy_raw_data_hevy_id_endpoint_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hevy_raw_data
    ADD CONSTRAINT hevy_raw_data_hevy_id_endpoint_name_key UNIQUE (hevy_id, endpoint_name);

--
-- Name: hevy_raw_data hevy_raw_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hevy_raw_data
    ADD CONSTRAINT hevy_raw_data_pkey PRIMARY KEY (id);

--
-- Name: hr_cache hr_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_cache
    ADD CONSTRAINT hr_cache_pkey PRIMARY KEY (hevy_id);

--
-- Name: ingredient_proposals ingredient_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredient_proposals
    ADD CONSTRAINT ingredient_proposals_pkey PRIMARY KEY (id);

--
-- Name: ingredients ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredients
    ADD CONSTRAINT ingredients_pkey PRIMARY KEY (id);

--
-- Name: meal_capture meal_capture_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_capture
    ADD CONSTRAINT meal_capture_pkey PRIMARY KEY (id);

--
-- Name: meal_log meal_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_log
    ADD CONSTRAINT meal_log_pkey PRIMARY KEY (id);

--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);

--
-- Name: nutrition_day nutrition_day_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutrition_day
    ADD CONSTRAINT nutrition_day_pkey PRIMARY KEY (date);

--
-- Name: nutrition_profile nutrition_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutrition_profile
    ADD CONSTRAINT nutrition_profile_pkey PRIMARY KEY (id);

--
-- Name: platform_credentials platform_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_credentials
    ADD CONSTRAINT platform_credentials_pkey PRIMARY KEY (platform);

--
-- Name: playlist_preferences playlist_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist_preferences
    ADD CONSTRAINT playlist_preferences_pkey PRIMARY KEY (segment_type);

--
-- Name: playlist_sessions playlist_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist_sessions
    ADD CONSTRAINT playlist_sessions_pkey PRIMARY KEY (id);

--
-- Name: pmc_daily pmc_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pmc_daily
    ADD CONSTRAINT pmc_daily_pkey PRIMARY KEY (date);

--
-- Name: preset_meals preset_meals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preset_meals
    ADD CONSTRAINT preset_meals_pkey PRIMARY KEY (id);

--
-- Name: pump_up_songs pump_up_songs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pump_up_songs
    ADD CONSTRAINT pump_up_songs_pkey PRIMARY KEY (track_id);

--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);

--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);

--
-- Name: sleep_detail sleep_detail_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sleep_detail
    ADD CONSTRAINT sleep_detail_pkey PRIMARY KEY (date);

--
-- Name: spotify_artist_genres spotify_artist_genres_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spotify_artist_genres
    ADD CONSTRAINT spotify_artist_genres_pkey PRIMARY KEY (artist_id);

--
-- Name: spotify_track_features spotify_track_features_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spotify_track_features
    ADD CONSTRAINT spotify_track_features_pkey PRIMARY KEY (track_id);

--
-- Name: strava_bridge_uploads strava_bridge_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strava_bridge_uploads
    ADD CONSTRAINT strava_bridge_uploads_pkey PRIMARY KEY (garmin_activity_id);

--
-- Name: strava_photo_uploads strava_photo_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strava_photo_uploads
    ADD CONSTRAINT strava_photo_uploads_pkey PRIMARY KEY (garmin_activity_id);

--
-- Name: strava_raw_data strava_raw_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strava_raw_data
    ADD CONSTRAINT strava_raw_data_pkey PRIMARY KEY (id);

--
-- Name: strava_raw_data strava_raw_data_strava_id_endpoint_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strava_raw_data
    ADD CONSTRAINT strava_raw_data_strava_id_endpoint_name_key UNIQUE (strava_id, endpoint_name);

--
-- Name: strava_web_session strava_web_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strava_web_session
    ADD CONSTRAINT strava_web_session_pkey PRIMARY KEY (id);

--
-- Name: sync_log sync_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_log
    ADD CONSTRAINT sync_log_pkey PRIMARY KEY (id);

--
-- Name: sync_rules sync_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_rules
    ADD CONSTRAINT sync_rules_pkey PRIMARY KEY (id);

--
-- Name: synced_workouts synced_workouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.synced_workouts
    ADD CONSTRAINT synced_workouts_pkey PRIMARY KEY (hevy_id);

--
-- Name: tdee_history tdee_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tdee_history
    ADD CONSTRAINT tdee_history_pkey PRIMARY KEY (date);

--
-- Name: track_exclude_counts track_exclude_counts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track_exclude_counts
    ADD CONSTRAINT track_exclude_counts_pkey PRIMARY KEY (track_id);

--
-- Name: training_load training_load_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_load
    ADD CONSTRAINT training_load_pkey PRIMARY KEY (id);

--
-- Name: training_plan_day training_plan_day_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_plan_day
    ADD CONSTRAINT training_plan_day_pkey PRIMARY KEY (id);

--
-- Name: training_plan_day training_plan_day_plan_id_day_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_plan_day
    ADD CONSTRAINT training_plan_day_plan_id_day_date_key UNIQUE (plan_id, day_date);

--
-- Name: training_plan training_plan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_plan
    ADD CONSTRAINT training_plan_pkey PRIMARY KEY (id);

--
-- Name: usda_foods usda_foods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usda_foods
    ADD CONSTRAINT usda_foods_pkey PRIMARY KEY (fdc_id);

--
-- Name: user_blacklist user_blacklist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blacklist
    ADD CONSTRAINT user_blacklist_pkey PRIMARY KEY (track_id);

--
-- Name: user_foods user_foods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_foods
    ADD CONSTRAINT user_foods_pkey PRIMARY KEY (id);

--
-- Name: weight_log weight_log_date_weight_grams_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weight_log
    ADD CONSTRAINT weight_log_date_weight_grams_key UNIQUE (date, weight_grams);

--
-- Name: weight_log weight_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weight_log
    ADD CONSTRAINT weight_log_pkey PRIMARY KEY (id);

--
-- Name: workout_enrichment workout_enrichment_hevy_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_enrichment
    ADD CONSTRAINT workout_enrichment_hevy_id_key UNIQUE (hevy_id);

--
-- Name: workout_enrichment workout_enrichment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_enrichment
    ADD CONSTRAINT workout_enrichment_pkey PRIMARY KEY (id);

--
-- Name: workout_plans workout_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plans
    ADD CONSTRAINT workout_plans_pkey PRIMARY KEY (id);

--
-- Name: idx_activity_sync_log_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_sync_log_lookup ON public.activity_sync_log USING btree (source_platform, source_id, destination, status);

--
-- Name: idx_capture_media_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_capture_media_created ON public.capture_media USING btree (created_at);

--
-- Name: idx_drink_log_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drink_log_date ON public.drink_log USING btree (date);

--
-- Name: idx_enrichment_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrichment_date ON public.workout_enrichment USING btree (workout_date);

--
-- Name: idx_enrichment_garmin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrichment_garmin ON public.workout_enrichment USING btree (garmin_activity_id);

--
-- Name: idx_garmin_activity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_garmin_activity_id ON public.garmin_activity_raw USING btree (activity_id);

--
-- Name: idx_garmin_activity_raw_endpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_garmin_activity_raw_endpoint ON public.garmin_activity_raw USING btree (endpoint_name);

--
-- Name: idx_garmin_raw_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_garmin_raw_date ON public.garmin_raw_data USING btree (date);

--
-- Name: idx_garmin_raw_endpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_garmin_raw_endpoint ON public.garmin_raw_data USING btree (endpoint_name);

--
-- Name: idx_hevy_raw_data_endpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hevy_raw_data_endpoint ON public.hevy_raw_data USING btree (endpoint_name);

--
-- Name: idx_hevy_raw_endpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hevy_raw_endpoint ON public.hevy_raw_data USING btree (endpoint_name);

--
-- Name: idx_hevy_raw_hevy_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hevy_raw_hevy_id ON public.hevy_raw_data USING btree (hevy_id);

--
-- Name: idx_ingredient_proposals_query; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingredient_proposals_query ON public.ingredient_proposals USING btree (query, created_at DESC);

--
-- Name: idx_meal_log_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meal_log_date ON public.meal_log USING btree (date);

--
-- Name: idx_plan_day_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plan_day_date ON public.training_plan_day USING btree (day_date);

--
-- Name: idx_plan_day_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plan_day_plan ON public.training_plan_day USING btree (plan_id);

--
-- Name: idx_pmc_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pmc_date ON public.pmc_daily USING btree (date);

--
-- Name: idx_stf_genres; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stf_genres ON public.spotify_track_features USING gin (genres);

--
-- Name: idx_stf_tempo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stf_tempo ON public.spotify_track_features USING btree (tempo);

--
-- Name: idx_strava_raw_endpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_strava_raw_endpoint ON public.strava_raw_data USING btree (endpoint_name);

--
-- Name: idx_strava_raw_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_strava_raw_id ON public.strava_raw_data USING btree (strava_id);

--
-- Name: idx_sync_log_dest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sync_log_dest ON public.activity_sync_log USING btree (destination, destination_id);

--
-- Name: idx_sync_log_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sync_log_source ON public.activity_sync_log USING btree (source_platform, source_id);

--
-- Name: idx_sync_log_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sync_log_started_at ON public.sync_log USING btree (started_at DESC);

--
-- Name: idx_training_load_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_load_activity ON public.training_load USING btree (activity_id);

--
-- Name: idx_training_load_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_load_date ON public.training_load USING btree (activity_date);

--
-- Name: idx_usda_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usda_search ON public.usda_foods USING gin (search_vector);

--
-- Name: idx_usda_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usda_trgm ON public.usda_foods USING gin (description public.gin_trgm_ops);

--
-- Name: idx_weight_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weight_date ON public.weight_log USING btree (date);

--
-- Name: idx_weight_external_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_weight_external_id ON public.weight_log USING btree (external_id) WHERE (external_id IS NOT NULL);

--
-- Name: meal_capture_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meal_capture_date_idx ON public.meal_capture USING btree (date);

--
-- Name: meal_capture_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meal_capture_status_idx ON public.meal_capture USING btree (status, created_at);

--
-- Name: uq_training_load_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_training_load_activity ON public.training_load USING btree (activity_id, load_metric) WHERE (activity_id IS NOT NULL);

--
-- Name: uq_training_load_hevy; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_training_load_hevy ON public.training_load USING btree (hevy_id, load_metric) WHERE (hevy_id IS NOT NULL);

--
-- Name: activity_sync_log activity_sync_log_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_sync_log
    ADD CONSTRAINT activity_sync_log_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.sync_rules(id);

--
-- Name: drink_log drink_log_date_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drink_log
    ADD CONSTRAINT drink_log_date_fkey FOREIGN KEY (date) REFERENCES public.nutrition_day(date);

--
-- Name: meal_capture meal_capture_meal_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_capture
    ADD CONSTRAINT meal_capture_meal_log_id_fkey FOREIGN KEY (meal_log_id) REFERENCES public.meal_log(id) ON DELETE SET NULL;

--
-- Name: meal_log meal_log_date_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_log
    ADD CONSTRAINT meal_log_date_fkey FOREIGN KEY (date) REFERENCES public.nutrition_day(date);

--
-- Name: playlist_sessions playlist_sessions_workout_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist_sessions
    ADD CONSTRAINT playlist_sessions_workout_plan_id_fkey FOREIGN KEY (workout_plan_id) REFERENCES public.workout_plans(id) ON DELETE SET NULL;

--
-- Name: training_plan_day training_plan_day_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_plan_day
    ADD CONSTRAINT training_plan_day_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.training_plan(id);

--
-- PostgreSQL database dump complete
--
