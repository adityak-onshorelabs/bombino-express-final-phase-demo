# Bombino Express — build log

Every deploy of the app, newest first. The app shows its build at the bottom of
**My Profile** and the side menu, e.g. `Bombino Express v1.0.0 · 3d0ac14 · 13 Oct 2026`.
Match the commit in a screenshot to a row here to know exactly what a user had.

## How the version is made

| Part | Where it comes from |
|---|---|
| `v1.0.0` | `"version"` in `package.json`. Bump it by hand for a release. |
| `3d0ac14` | Git commit the bundle was built from: `RAILWAY_GIT_COMMIT_SHA` on Railway, local `git` otherwise. |
| `13 Oct 2026` | When the bundle was built (India time). |
| `App iOS 1.2 (5)` | Second line, only inside the iOS/Android shell and only if the shell includes Capacitor's App plugin. That is the store version. |

The iOS and Android apps are shells that load the live site (`server.url`). So a
web deploy updates the app on every phone without a store release. A store release
only changes the shell line.

## Targets

| Target | Where | Deploys from |
|---|---|---|
| Web (Railway) | `bombino-staging` service, project zucchini-gratitude, env production | `production` branch, auto on push |
| Web (app domain) | `bombino.onshorelabs.co.in`, other Railway project (not in Aditya's workspace) | ask its owner |
| iOS | App Store, Capacitor shell (separate repo) | — |
| Android | Play Store, Capacitor shell (separate repo) | — |

## Log

| Date | Target | Version | Commit | Notes |
|---|---|---|---|---|
| 13 Oct 2026 | Web (Railway bombino-staging) | 1.0.0 | 3d0ac14 | Handover code sheet sits above the iOS keyboard; no SMS-code autofill. Built before the version label existed. |
