# Security Policy

## Scope

LabPlanner is a local-only application: the FastAPI server binds to `127.0.0.1` by
default, has no authentication, and is designed to be run by a single user on their
own machine — not exposed to a network or the internet. If you're deploying it
somewhere multi-user or internet-facing, treat that as your own responsibility;
`api.py` currently has no auth, CORS, or rate-limiting middleware to defend against
that scenario.

## Reporting a vulnerability

Please report security issues privately rather than opening a public GitHub issue:

- Preferred: open a [GitHub Security Advisory](https://github.com/Mavrikant/LabPlanner/security/advisories/new)
  for this repository.
- Otherwise: email the maintainer listed on the [GitHub profile](https://github.com/Mavrikant).

Include what you found, how to reproduce it, and its potential impact. We'll get back
to you as soon as we can — this is a small open-source project maintained on a
best-effort basis, so please be patient.

## Supported versions

Only the latest released version is supported. See [RELEASING.md](RELEASING.md) for
how releases are cut and [CHANGELOG.md](CHANGELOG.md) for what changed.
