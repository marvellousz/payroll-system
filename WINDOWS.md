# Windows Desktop App

Two packaging options:

- **Electron** (`src-electron`) — recommended Windows installer
- **Tauri** (`src-tauri`) — previous wrapper (needs Rust)

Both bundle the Next.js server + a portable Node runtime + `.env`. Clients do **not** need to install Node.

---

## Electron (recommended)

On the Windows build PC you only need **[Node.js 20 LTS](https://nodejs.org/)**.

`.env` in the project root (same keys as web):

```env
DATABASE_URL=...
DIRECT_URL=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Dev

```bat
npm install
npm run electron:dev
```

Opens a desktop window. If Next is not already running, it starts `npm run dev` for you.

### Build installer

```bat
npm run electron:build
```

Output:

- `dist-electron\Payroll-Setup.exe` — installer for the client
- `dist-electron\Payroll-Portable.exe` — no-install exe

Upload `Payroll-Setup.exe` as a GitHub Release asset named **Payroll-Setup.exe** for the website Download button.

Logs: `%APPDATA%\payroll-system\server.log`

---

## Tauri

1. Install **[Node.js 20 LTS](https://nodejs.org/)**  
2. Install **[Rust](https://rustup.rs/)** (`rustup` default toolchain)  
3. Install **[Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)**  
   - Workload: **Desktop development with C++**  
4. WebView2 is included on Windows 10/11 (install [Evergreen runtime](https://developer.microsoft.com/microsoft-edge/webview2/) if missing)

```bat
npm run tauri:dev
npm run tauri:build
```

---

## Website download button

The landing page **Download the app** button uses this Google Drive file:

https://drive.google.com/file/d/1rE6WSFwZCDvp8NiZVVhFrAb2fVLtbcnZ/view?usp=drivesdk

The file must be shared as **Anyone with the link**. To use a different file later, set `NEXT_PUBLIC_APP_DOWNLOAD_URL` on Vercel.

---

## Notes

- Build the Windows installer **on Windows**.
- `.env` is copied into the app at build time — rebuild if credentials change.
- Internet is still required at runtime (Supabase Auth + Postgres).
