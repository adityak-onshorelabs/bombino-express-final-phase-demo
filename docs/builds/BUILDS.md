# Bombino Express — build log

Every deploy of the app, newest first. The app shows its build at the bottom of
**My Profile** and the side menu, e.g. `Bombino Express v26.10.13 #2`.
Match the build in a screenshot to a row here to know exactly what a user had.

## How the build is named

`v26.10.13 #2` = the 2nd deploy on 13 Oct 2026 (year.month.day, then the deploy
number that day; a new day starts again at #1).

It lives in `build.json` at the repo root. Before each deploy:

```bash
npm run build:next   # bumps build.json, prints the new label
# commit it with the change, push, then add the row below with the commit
```

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

| Build | Date | Target | Commit | Notes |
|---|---|---|---|---|
| v26.10.13 #1 | 13 Oct 2026 | Web (Railway bombino-staging) | 3d0ac14 | Handover code sheet above the iOS keyboard; no SMS-code autofill. Before the label existed. |
