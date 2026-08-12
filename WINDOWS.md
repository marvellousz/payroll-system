# Windows Desktop App (Tauri)

Payroll ships as a **native Windows app** (`.exe` / NSIS installer).  
The installer bundles:

- the Next.js server (API + UI)
- a portable Node.js runtime  
- your `.env` Supabase credentials (copied at build time)

Clients do **not** need to install Node separately.

---

## One-time setup on the Windows build PC

1. Install **[Node.js 20 LTS](https://nodejs.org/)**  
2. Install **[Rust](https://rustup.rs/)** (`rustup` default toolchain)  
3. Install **[Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)**  
   - Workload: **Desktop development with C++**  
4. WebView2 is included on Windows 10/11 (install [Evergreen runtime](https://developer.microsoft.com/microsoft-edge/webview2/) if missing)

---

## Configure env

In the project root, create `.env` (same keys as web):

```env
DATABASE_URL=...
DIRECT_URL=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Apply schema + seed once (against your Supabase DB):

```bat
npm install
npx prisma generate
npx prisma db push
npm run seed
```

---

## Dev (desktop window + hot reload)

```bat
npm run tauri:dev
```

This starts `next dev` and opens the Tauri window at `http://localhost:3000`.

---

## Build Windows installer for the client

```bat
npm run tauri:build
```

Output (typical paths):

- `src-tauri\target\release\Payroll.exe` — portable binary  
- `src-tauri\target\release\bundle\nsis\*.exe` — **installer for the client**

Give the client the **NSIS installer**. After install they launch **Payroll** from the Start Menu.

---

## Notes

- Build the Windows installer **on Windows**. Cross-compiling from Linux/macOS is not supported by this setup.  
- `.env` is embedded into the app resources at build time — rebuild if credentials change.  
- Logs for the bundled server: `%APPDATA%\com.payroll.app\server.log` (folder name may vary slightly by OS app-data rules).  
- Internet is still required at runtime (Supabase Auth + Postgres).
