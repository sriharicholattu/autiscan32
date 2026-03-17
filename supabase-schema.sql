-- AutiScan Supabase Schema
-- Run this in Supabase → SQL Editor

-- CLINICS
create table clinics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  clinic_id text unique not null,
  clinic_name text not null,
  name text,
  email text,
  phone text,
  city text,
  plan text default 'starter',
  plan_period text default 'monthly',
  subscription_active boolean default false,
  last_payment_id text,
  last_payment_amount bigint,
  created_at timestamptz default now()
);

-- CLINICIANS
create table clinicians (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  clinician_id text unique not null,
  clinic_id text references clinics(clinic_id),
  name text not null,
  email text,
  specialization text default 'General',
  created_at timestamptz default now()
);

-- PATIENTS
create table patients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  patient_id text unique not null,
  clinician_id text references clinicians(clinician_id),
  name text not null,
  email text,
  dob date,
  sessions int default 0,
  last_conclusion text,
  created_at timestamptz default now()
);

-- REPORTS
create table reports (
  id uuid primary key default gen_random_uuid(),
  patient_id text references patients(patient_id),
  clinician_id text references clinicians(clinician_id),
  session_no int not null,
  score_eye int, score_move int, score_face int, score_voice int, score_react int,
  score_bubble int, score_animal int, score_simon int, score_color int, score_sound int,
  ai_summary text,
  conclusion text,
  notes text,
  reviewed boolean default false,
  created_at timestamptz default now()
);

-- PAYMENTS
create table payments (
  id uuid primary key default gen_random_uuid(),
  clinic_id text references clinics(clinic_id),
  payment_id text unique not null,
  plan text,
  period text,
  amount bigint,
  status text default 'success',
  created_at timestamptz default now()
);

-- ROW LEVEL SECURITY
alter table clinics     enable row level security;
alter table clinicians  enable row level security;
alter table patients    enable row level security;
alter table reports     enable row level security;
alter table payments    enable row level security;

-- Policies: users can read/write their own data
create policy "clinic own" on clinics     for all using (auth.uid() = user_id);
create policy "clinician own" on clinicians for all using (auth.uid() = user_id);
create policy "patient own" on patients   for all using (auth.uid() = user_id);

-- Clinicians can read patients assigned to them
create policy "clinician read patients" on patients for select
  using (clinician_id in (select clinician_id from clinicians where user_id = auth.uid()));

-- Clinicians can read/update reports assigned to them
create policy "clinician reports" on reports for all
  using (clinician_id in (select clinician_id from clinicians where user_id = auth.uid()));

-- Patients can insert their own reports
create policy "patient insert report" on reports for insert
  with check (patient_id in (select patient_id from patients where user_id = auth.uid()));

-- Patients can read their own reports
create policy "patient read reports" on reports for select
  using (patient_id in (select patient_id from patients where user_id = auth.uid()));

-- Clinics can read clinicians and patients under them
create policy "clinic read clinicians" on clinicians for select
  using (clinic_id in (select clinic_id from clinics where user_id = auth.uid()));

create policy "clinic read patients" on patients for select
  using (clinician_id in (
    select clinician_id from clinicians
    where clinic_id in (select clinic_id from clinics where user_id = auth.uid())
  ));

create policy "clinic payments" on payments for all
  using (clinic_id in (select clinic_id from clinics where user_id = auth.uid()));

-- REFERRAL SYSTEM (add these columns to clinics table)
alter table clinics add column if not exists referral_code text;
alter table clinics add column if not exists trial_plan text;
alter table clinics add column if not exists trial_expires_at timestamptz;
alter table clinics add column if not exists referral_used boolean default false;

-- Track which codes have been used (optional uniqueness enforcement)
create table if not exists referral_usage (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  clinic_id text references clinics(clinic_id),
  used_at timestamptz default now()
);
alter table referral_usage enable row level security;
create policy "clinic own referral" on referral_usage for all using (
  clinic_id in (select clinic_id from clinics where user_id = auth.uid())
);
