-- プロフィール（1行のみ）
create table profile (
  id int primary key default 1 check (id = 1),
  height_cm numeric not null,
  birth_date date not null,
  sex text not null check (sex in ('male', 'female')),
  activity_factor numeric not null default 1.5,  -- 1.2〜1.9
  protein_per_kg numeric not null default 2.0,   -- g/kg 体重
  fat_ratio numeric not null default 0.22,       -- 摂取kcalに占める脂質割合
  updated_at timestamptz not null default now()
);

-- フェーズ履歴
create table phases (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('bulk', 'cut', 'maintain')),
  started_on date not null,
  ended_on date,                      -- null = 現行フェーズ
  target_weight_kg numeric,
  pace_kg_per_week numeric,           -- 増量なら正、減量なら負
  created_at timestamptz not null default now()
);

-- 体重
create table weight_logs (
  logged_on date primary key,         -- 1日1件、上書き
  weight_kg numeric not null,
  created_at timestamptz not null default now()
);

-- 食事
create table meals (
  id bigint generated always as identity primary key,
  eaten_on date not null,
  meal_slot text not null check (meal_slot in ('breakfast','lunch','dinner','snack')),
  raw_input text not null,            -- ユーザーの元の自由文
  items jsonb not null,               -- [{name, amount, kcal, protein_g, fat_g, carbs_g}]
  total_kcal numeric not null,
  total_protein_g numeric not null,
  total_fat_g numeric not null,
  total_carbs_g numeric not null,
  created_at timestamptz not null default now()
);
create index on meals (eaten_on);

-- 運動
create table exercise_logs (
  id bigint generated always as identity primary key,
  done_on date not null,
  raw_input text not null,
  description text not null,          -- 正規化した内容 例: "ベンチプレス 60kg 5x5 + ランニング30分"
  kcal_burned numeric not null,
  created_at timestamptz not null default now()
);
create index on exercise_logs (done_on);

-- チャット履歴
create table chat_messages (
  id bigint generated always as identity primary key,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
