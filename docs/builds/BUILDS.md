# Bombino Express — build log

Every deploy of the app, newest first. The app shows its build at the bottom of
**My Profile** and the side menu, e.g. `Bombino Express V1 (Build 81.261013.10)`.
Match the build in a screenshot to a row here to know exactly what a user had.

## How the build is named

`V1 (Build 81.261013.10)`

| Part | Meaning |
|---|---|
| `V1` | Major version. Changed by hand for a big release. |
| `81` | Total deploys ever. Never repeats — quote this one ("build 81"). |
| `261013` | Deploy date, yymmdd (India time). |
| `10` | Which deploy that day. Back to 1 on a new day. |

The total was counted from Railway's history of `bombino-staging`: 80 good
deploys from 18 Sep to 13 Oct 2026 (1 failed deploy on 1 Oct not counted).
Deploys of the app-domain project (other Railway workspace) are not in it.

It lives in `build.json` at the repo root, which always holds the **upcoming**
build — the one the next push will deploy.

- Every commit message starts with it: `[81.261013.10] feat(app): ...`. A local
  `prepare-commit-msg` hook (`.git/hooks/`, not versioned) adds it from
  `build.json`; it skips messages that already start with `[`.
- Right after each deploy, start the next build and log the one just shipped:

```bash
npm run build:next   # bumps build.json to the next build, prints its label
# add the row below for the build just deployed; build.json goes in with the next commit
```

If the push lands on a later day than the bump, update `date`/`number` in
`build.json` (and the unpushed commit prefixes) before pushing.

The git commit is not in the label but is on the element (`title` /
`data-commit`) and in the log below.

Inside the iOS/Android shell a second line shows the store version, e.g.
`App iOS 1.2 (5)`, if the shell includes Capacitor's App plugin. The shells load
the live site (`server.url`), so a web deploy updates every phone without a
store release; a store release only changes that second line.

## Targets

| Target | Where | Deploys from |
|---|---|---|
| Web (Railway) | `bombino-staging` service, project zucchini-gratitude, env production | `production` branch, auto on push |
| Web (app domain) | `bombino.onshorelabs.co.in`, other Railway project (not in Aditya's workspace) | ask its owner |
| iOS | App Store, Capacitor shell (separate repo) | — |
| Android | Play Store, Capacitor shell (separate repo) | — |

## Log

| Total | Build | Date | Target | Commit | Notes |
|---|---|---|---|---|---|
| 82 | V1 (Build 82.261014.1) | 14 Oct 2026 | Web (Railway bombino-staging + app domain) | ec09a41 | Test orders and test accounts hidden from all real staff (super admin too); TEST AWBs, never ITD; test staff get an All/Real/Test filter; 9000000011 can mark orders test or real. 25 old test orders backfilled. |
| 81 | V1 (Build 81.261013.10) | 13 Oct 2026 | Web (Railway bombino-staging) | f5aa1ad | First build with the label: build shown on customer/guest/agent Profile, ops Settings and side menu; handover code sheet opens from the top; commits prefixed with the build. |
| 80 | V1 (Build 80.261013.9) | 13 Oct 2026 | Web (Railway bombino-staging) | 3d0ac14 | Handover code sheet above the iOS keyboard; no SMS-code autofill. Before the label existed. |
| 1–79 | — | 18 Sep – 13 Oct 2026 | Web (Railway bombino-staging) | — | Earlier deploys, counted from Railway history, not logged one by one. |
