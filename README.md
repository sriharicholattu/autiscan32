# AutiScan — Early Autism Screening Platform

AI-powered early autism screening for children aged 2–6. Built with React + Vite, Supabase, Razorpay, deployed on Vercel.

---

## 🚀 Step-by-Step Setup

### Step 1 — Install Node.js
Download and install from https://nodejs.org (choose LTS version)

### Step 2 — Open this project in VS Code
```
File → Open Folder → select the autiscan-react folder
```

### Step 3 — Install dependencies
Open Terminal in VS Code (Ctrl + `) and run:
```bash
npm install
```

### Step 4 — Set up Supabase (free database + auth)

1. Go to https://supabase.com → Sign up → New Project
2. Wait for project to be ready
3. Go to **SQL Editor** → paste everything from `supabase-schema.sql` → Run
4. Go to **Settings → API**
5. Copy **Project URL** and **anon public key**

### Step 5 — Set up Razorpay (payments)

1. Go to https://dashboard.razorpay.com → Sign up
2. Go to **Settings → API Keys → Generate Key**
3. Copy your **Key ID** (starts with `rzp_test_` for test mode)

### Step 6 — Create environment file
Create a file called `.env.local` in the project root:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_RAZORPAY_KEY_ID=rzp_test_your_key_here
```

### Step 7 — Run locally
```bash
npm run dev
```
Open http://localhost:5173 in Chrome

> ⚠️ Use Chrome for camera and microphone features.

---

## 🌐 Deploy to Vercel (free)

### Step 1 — Push to GitHub
1. Go to https://github.com → New repository → name it `autiscan`
2. In VS Code Terminal:
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/autiscan.git
git push -u origin main
```

### Step 2 — Deploy on Vercel
1. Go to https://vercel.com → Sign up with GitHub
2. Click **New Project** → Import your `autiscan` repo
3. Framework: **Vite** (auto-detected)
4. Click **Environment Variables** → Add these 3 variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_RAZORPAY_KEY_ID`
5. Click **Deploy**

Your app will be live at `https://autiscan.vercel.app` 🎉

---

## 🏗️ Project Structure

```
autiscan-react/
├── src/
│   ├── pages/
│   │   ├── LoginPage.jsx          # Login/Register for all 3 roles
│   │   ├── ClinicDashboard.jsx    # Clinic portal + Razorpay payments
│   │   ├── ClinicianDashboard.jsx # Patient list + report review
│   │   └── PatientSession.jsx     # 5 games + camera + mic
│   ├── hooks/
│   │   └── useAuth.jsx            # Supabase auth context
│   ├── lib/
│   │   ├── supabase.js            # Supabase client
│   │   └── razorpay.js            # Razorpay plans + checkout
│   ├── styles/
│   │   └── global.css             # All styles
│   ├── App.jsx                    # Routes + role guards
│   └── main.jsx                   # Entry point
├── supabase-schema.sql            # Run this in Supabase SQL Editor
├── .env.example                   # Copy to .env.local
├── vercel.json                    # Vercel SPA routing fix
├── vite.config.js
└── package.json
```

---

## 🔐 How the 3-Role System Works

| Role | Registers with | Gets | Can do |
|------|---------------|------|--------|
| **Clinic** | Name + Email | Clinic ID (CL-XXXX) | Manage clinicians, buy plans |
| **Clinician** | Clinic ID | Clinician ID (DR-XXXX) | View patients, write reports |
| **Patient** | Clinician ID | Patient ID (PT-XXXX) | Play games, submit sessions |

---

## 💳 Razorpay Payment Flow

- Clinic selects a plan (monthly/yearly)
- Razorpay checkout opens (UPI, Cards, Net Banking)
- On success → payment recorded in Supabase → plan activated
- Switch to **live mode** in Razorpay dashboard before going live

---

## 📷 Camera & Mic Notes

- Camera and microphone **only work on http://localhost or https://** (not file://)
- Use **Chrome** for best speech recognition support
- If camera is unavailable, click **"AI Simulation"** for animated face tracking

---

## 🛠️ Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + Vite |
| Routing | React Router v6 |
| Auth + DB | Supabase |
| Payments | Razorpay |
| Hosting | Vercel |
| Camera | WebRTC / getUserMedia |
| Voice | Web Speech API |
