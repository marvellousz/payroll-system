# Payroll

Multi-outlet payroll & attendance app (Next.js + Supabase + Prisma).

## Web (browser)

```bash
npm install
cp .env.example .env   # then fill Supabase keys
npx prisma generate
npx prisma db push
npm run seed
npm run dev
```

Open http://localhost:3000

## Windows desktop app

See **[WINDOWS.md](./WINDOWS.md)** for the full Tauri setup.

Quick reference (on a Windows build PC):

```bat
npm install
npm run tauri:dev      :: development desktop window
npm run tauri:build    :: produces NSIS installer for the client
```
