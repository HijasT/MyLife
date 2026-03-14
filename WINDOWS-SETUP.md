# MyLife App — Windows Setup Guide
## Complete step-by-step from zero to running app

---

## TOOLS TO INSTALL (in this order)

### 1. Node.js
**What it is:** Runs JavaScript on your computer. Next.js needs this.
**Download:** https://nodejs.org → click the big "LTS" button (Long Term Support)
**Install:** Run the downloaded `.msi` file, click Next through everything, keep all defaults.
**Verify:** Open Command Prompt and type:
```
node --version
npm --version
```
Both should print a version number like `v20.x.x`

---

### 2. Git
**What it is:** Version control. Also needed to deploy to Vercel later.
**Download:** https://git-scm.com/download/win → download the installer
**Install:** Run installer, keep all defaults. When asked about default editor, pick Notepad if you don't have VS Code yet.
**Verify:**
```
git --version
```

---

### 3. VS Code (code editor)
**What it is:** The editor you'll write code in.
**Download:** https://code.visualstudio.com
**Install:** Run installer, tick "Add to PATH" and "Open with Code" options during install.

**Recommended extensions to install inside VS Code:**
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- TypeScript (usually pre-installed)

---

## ACCOUNTS TO CREATE (all free)

### 4. Supabase account
1. Go to https://supabase.com
2. Click **Start your project** → sign up with GitHub or Google
3. Once in, click **New project**
4. Fill in:
   - **Name:** mylife-app
   - **Database password:** make a strong one, save it somewhere
   - **Region:** West EU (Frankfurt) — closest to Dubai
5. Click **Create new project** — takes about 2 minutes to set up

---

### 5. Vercel account (for deployment later)
1. Go to https://vercel.com
2. Sign up with GitHub — easiest option
3. You don't need to do anything else here yet

---

### 6. GitHub account (to connect Vercel to your code)
1. Go to https://github.com
2. Sign up for free
3. You don't need to do anything else here yet

---

## PROJECT SETUP

### 7. Extract the project files
1. Download `mylife-app-phase1.zip` from the chat
2. Right-click the zip → **Extract All**
3. Extract to somewhere easy like `C:\Projects\` or your Desktop
4. You should now have a folder called `mylife-app`

---

### 8. Open the project in VS Code
1. Open VS Code
2. **File → Open Folder** → select the `mylife-app` folder
3. VS Code will open the project

---

### 9. Open the terminal inside VS Code
- Press `` Ctrl + ` `` (backtick, the key above Tab)
- A terminal panel opens at the bottom
- You should see something like `PS C:\Projects\mylife-app>`
- This is PowerShell — it works fine for everything below

---

### 10. Install project dependencies
In the VS Code terminal, type:
```
npm install
```
This downloads all the libraries the app needs. Takes 1-2 minutes.
You'll see a `node_modules` folder appear in the sidebar when done.

---

## SUPABASE CONFIGURATION

### 11. Run the database schema
1. Go to https://supabase.com → open your **mylife-app** project
2. In the left sidebar click **SQL Editor**
3. Click **New query** (top right)
4. Go back to VS Code → open the file `supabase-schema.sql` (it's in the root of the project)
5. Press `Ctrl+A` to select all, `Ctrl+C` to copy
6. Go back to Supabase SQL Editor, click in the editor, `Ctrl+V` to paste
7. Click the green **Run** button
8. You should see "Success. No rows returned" — this means all tables were created

---

### 12. Enable Google login in Supabase

**Part A — Create Google OAuth credentials**
1. Go to https://console.cloud.google.com
2. Sign in with your Google account
3. Click the project dropdown at the top → **New Project**
   - Name: `mylife-app` → **Create**
4. Make sure your new project is selected in the dropdown
5. In the search bar type **"OAuth consent screen"** → click it
6. Choose **External** → **Create**
7. Fill in:
   - App name: `MyLife`
   - User support email: your email
   - Developer contact email: your email
   - Click **Save and Continue** through the rest (no need to add scopes)
   - On the last screen click **Back to Dashboard**
8. In the search bar type **"Credentials"** → click it
9. Click **+ Create Credentials** → **OAuth client ID**
10. Application type: **Web application**
11. Name: `mylife-app`
12. Under **Authorized redirect URIs** click **+ Add URI** and paste:
    ```
    https://your-project-ref.supabase.co/auth/v1/callback
    ```
    (Find your project ref: Supabase → Settings → General → it's the part before `.supabase.co`)
13. Click **Create**
14. A popup shows your **Client ID** and **Client Secret** — copy both, keep this tab open

**Part B — Add credentials to Supabase**
1. Go back to Supabase → **Authentication** → **Providers**
2. Find **Google** → click to expand → toggle it **on**
3. Paste your **Client ID** and **Client Secret** from Part A
4. Click **Save**

---

### 13. Get your Supabase API keys
1. Supabase → **Settings** (gear icon, bottom left sidebar) → **API**
2. You need two values:
   - **Project URL** — e.g. `https://abcxyz123.supabase.co`
   - **anon / public** key — the long `eyJ...` string under "Project API Keys"
3. Keep this tab open for the next step

---

## ENVIRONMENT VARIABLES

### 14. Create the .env.local file

**Option A — using VS Code**
1. In VS Code file explorer (left sidebar), right-click on `.env.local.example`
2. Click **Copy**, then right-click → **Paste** in the same folder
3. Right-click the copy → **Rename** → rename it to `.env.local`
4. Open `.env.local` — it looks like this:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```
5. Replace the two placeholder values with your actual keys from Step 13
6. Press `Ctrl+S` to save

**Option B — using terminal**
```
copy .env.local.example .env.local
```
Then open it in VS Code and fill in the values.

Your completed `.env.local` should look like:
```
NEXT_PUBLIC_SUPABASE_URL=https://abcxyz123.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## RUN THE APP

### 15. Start the development server
In the VS Code terminal:
```
npm run dev
```
You'll see:
```
▲ Next.js 14.x.x
- Local: http://localhost:3000
```

### 16. Open the app
Go to http://localhost:3000 in your browser.
You'll be redirected to the login page.
Click **Continue with Google** — it should sign you in and land on the dashboard.

---

## DEPLOY TO THE WEB (so you can access from phone/tablet)

### 17. Push code to GitHub
In VS Code terminal:
```
git init
git add .
git commit -m "Phase 1 - app shell"
```
Then:
1. Go to https://github.com → **New repository**
2. Name: `mylife-app` → **Private** → **Create repository**
3. GitHub will show you commands — run the ones under "push an existing repository":
```
git remote add origin https://github.com/YOUR-USERNAME/mylife-app.git
git branch -M main
git push -u origin main
```

---

### 18. Deploy on Vercel
1. Go to https://vercel.com → **Add New Project**
2. Import your `mylife-app` GitHub repository
3. Click **Deploy** — Vercel auto-detects Next.js, no config needed
4. After deploy succeeds, go to **Settings → Environment Variables**
5. Add the same two variables from your `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL` = your URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your key
6. Go to **Deployments** → click the three dots on the latest deploy → **Redeploy**

---

### 19. Update Supabase with your live URL
1. Copy your Vercel URL — e.g. `https://mylife-app-abc.vercel.app`
2. Supabase → **Authentication** → **URL Configuration**
3. **Site URL**: paste your Vercel URL
4. **Redirect URLs**: add `https://mylife-app-abc.vercel.app/auth/callback`
5. Also go back to Google Cloud Console → Credentials → your OAuth client
6. Add `https://mylife-app-abc.vercel.app/auth/callback` to **Authorized redirect URIs**
7. Save

Your app is now live and accessible from any device. 🎉

---

## QUICK REFERENCE

| Command | What it does |
|---|---|
| `npm install` | Install dependencies (run once) |
| `npm run dev` | Start local development server |
| `npm run build` | Build for production |
| `git add . && git commit -m "message"` | Save your changes |
| `git push` | Push to GitHub (Vercel auto-deploys) |

## Troubleshooting

**"npm is not recognized"** → Node.js didn't install correctly. Restart your computer and try again.

**Login redirects back to login page** → Your Supabase redirect URL doesn't match. Check Step 19.

**"Cannot find module"** → Run `npm install` again.

**White screen / build error** → Check that `.env.local` has the correct keys with no extra spaces.
