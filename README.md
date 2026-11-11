# Barrett

Household task board for Jack and Alyssa. Tasks earn points, closing a task needs a quick photo or screenshot, and a scoreboard keeps a weekly and monthly tally.

Built with Next.js, Supabase and DnD Kit. Deployed on Vercel.

## What is in this version

- **Board view:** Backlog, Ready to start, In progress, Complete. Drag cards or use the arrows.
- **Week view:** the same tasks laid out by day, with points and time to earn per day.
- **Points:** suggested values of 5, 10 and 20, editable per task. Either person can flag a value as too high or too low.
- **Proof:** a photo or screenshot is required to close a task. Photos go to a private storage bucket.
- **Shared credit:** pick who did it when closing: you, the other person, or together (both get the points).
- **Recurring tasks:** daily, weekly or monthly. An unfinished one rolls over until it is done.
- **Focus timer:** start and stop on any In progress task. The other person sees who is on what.
- **Recap and prizes:** week and month totals with an editable prize for each.
- **Add, edit, delete, restore:** deleted tasks sit in a Deleted list until restored.
- **Live sync:** changes show up on the other device within a second or so.
- **Login:** email and password, with an optional second step by authenticator app or text message.
- **Light and dark mode.**

## Not built yet

- **Reminders.** "Remind if not done by" times are saved and shown, but nothing sends a notification yet. That needs web push, which is the next phase.
- **Scroll guard.** The focus timer is recorded in the database so a browser extension can read it. The extension itself (a fork of Escape the Algorithm) is a separate piece of work. On iPhone, use the Normal app alongside for now.
- **Reordering cards within a lane.**

## Setup

### 1. Create the Supabase project

Create a project at supabase.com. From Project Settings, API, copy the project URL and the anon (publishable) key.

### 2. Create the database

Open the SQL editor, paste the contents of `supabase/migrations/0001_init.sql`, and run it once.

### 3. Create the two accounts

In Authentication, Users, choose Add user and create one account each for Jack and Alyssa with an email and password. Tick "Auto confirm user".

Then, in Authentication, Sign In / Providers, turn off "Allow new users to sign up". Nobody else can get in either way, because access depends on step 4, but there is no reason to leave signups open.

### 4. Add both accounts to the household

Run this in the SQL editor with your real email addresses:

```sql
insert into public.profiles (id, display_name, color)
select id, 'Jack', 'terracotta' from auth.users where email = 'jack@example.com';

insert into public.profiles (id, display_name, color)
select id, 'Alyssa', 'sapphire' from auth.users where email = 'alyssa@example.com';
```

To swap colors later, update the `color` column.

### 5. Second sign-in step (optional but recommended)

- **Authenticator app:** works out of the box. After signing in, open Account and choose "Add an authenticator app".
- **Text message:** in Authentication, Multi-Factor, enable Phone, and connect an SMS provider such as Twilio under Authentication, Sign In / Providers, Phone. Then add your number on the Account page. Text messages cost a small amount each.

Once a second step is set up for an account, the database refuses that account's requests until the code has been entered.

### 6. Run it locally

```bash
cp .env.example .env.local   # then fill in the two values from step 1
npm install
npm run dev
```

Open http://localhost:3000.

### 7. Deploy on Vercel

Import this repository in Vercel. Add the same two environment variables (`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`) in the project settings, then deploy.

In Supabase, Authentication, URL Configuration, set the Site URL to the Vercel address.

### 8. Put it on your phones

Open the Vercel address in Safari, tap Share, then Add to Home Screen. This gives it its own icon and full screen, and it is required later for push notifications on iPhone.

## How recurring tasks work

Each repeating task is a rule. When the app loads, it asks the database to create this period's copy of every rule (`generate_recurring`). If the last copy was never finished, no new one is made and the old one stays open, marked as rolled over. Finishing a rolled-over task counts for the period it was finished in.

Periods use Pacific time. To change that, edit `period_start` in the migration.

## Project layout

```
supabase/migrations/0001_init.sql   tables, access rules, storage bucket, functions
src/proxy.ts                        session refresh and sign-in redirects
src/app/                            pages: board, login, second step, account
src/components/BarrettApp.tsx       data loading, live sync, scoreboard, both views
src/components/                     cards, lanes, task editor, proof dialog
src/lib/                            Supabase clients, types, date and image helpers
```
