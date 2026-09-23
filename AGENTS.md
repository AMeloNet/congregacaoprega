# AGENTS.md — congregacaoprega

## Project

Repository: https://github.com/AMeloNet/congregacaoprega

Responsive multi-tenant web application for managing preaching equipment,
locations, schedules, participants, and assignments for congregations.

Approved stack: TypeScript, React, NestJS, PostgreSQL, Prisma, and Docker.
The project is licensed under `AGPL-3.0-only`.

Current status: the technical foundation and initial identity data model exist,
but authentication, reservations, and deployment are not implemented. Do not
describe planned or unexecuted checks as completed. See
`docs/testes/tec-001-evidencias.md` and `docs/testes/idn-001-revisao-pr7.md`.

## Mandatory workflow

For every change:

1. Read the relevant specification and inspect the current repository state.
   Preserve unrelated and existing work.
2. Record the expected behavior, scope, acceptance criteria, and impacts on
   data and permissions before implementation.
3. For executable behavior, write and run tests first. Confirm that they fail
   for the missing behavior rather than because of an environment problem.
4. Implement the smallest complete change that satisfies the criteria.
5. Run affected tests after each increment, then run the relevant regression,
   formatting, linting, type, build, and documentation checks before delivery.
6. Update affected documentation, API contracts, operational instructions,
   and migrations. Review the final diff for unrelated files or sensitive data.
7. Report the commands run, their results, limitations, and any checks that
   were not executed.

Start bug fixes with a reproducing test. Protect refactors with tests that
preserve existing behavior. Documentation-only changes require content,
Markdown, link, and example review rather than artificial functional tests.

Ask before implementing a missing business rule that would change the expected
result or before materially expanding scope. Routine technical decisions within
an approved scope do not require additional approval.

## Implementation and security

- Keep business rules, persistence, and presentation separated. Validate input
  and authorization on the server, even when the UI also validates them.
- Derive tenant access from the authenticated identity and authorized
  membership; never trust a client-provided tenant identifier alone.
- Enforce integrity and concurrency rules in both the server and database.
- Keep contracts explicitly typed and error handling consistent.
- Add dependencies only when justified; verify maintenance, version, and
  license compatibility. Pin runtime and tool versions and commit the lockfile.
- Keep changes small and focused. Avoid unrelated formatting or refactoring.
- Build accessible, responsive UI in Brazilian Portuguese, including keyboard
  navigation and clear loading, empty, and error states.
- Define and test date, interval, overlap, and time-zone behavior explicitly.
- Never commit credentials, tokens, `.env` files, backups, production data, or
  personal data. Use fictional examples and controlled local substitutes for
  external effects such as email.
- Grant CI and application accounts minimum privileges. Do not expose secrets
  or credential-bearing URLs in commands, logs, or test reports.

## Tests and database changes

- Use unit tests for isolated rules, integration tests for API and persistence,
  and end-to-end tests for critical browser journeys.
- Integration and migration tests must use disposable PostgreSQL matching the
  target major version. Mocks do not replace transaction, constraint, isolation,
  or concurrency tests.
- Keep tests independent and deterministic. Control time and randomness, and
  never target production systems or real recipients.
- Cover success, failure, boundaries, tenant isolation, permissions,
  concurrency, overlap, cancellation, and request idempotency where relevant.
- Do not disable tests or weaken correct expectations to bypass failures.

Every schema, constraint, index, database permission, or required data change
must have a reviewed and versioned Prisma migration. Never edit, delete, or
reorder a migration already merged into `main` or applied to a shared database;
correct it with a new migration.

Validate both a clean database built from the complete migration history and an
upgrade from the previous supported version with representative data. Check
data preservation, constraints, tenant isolation, repeat application behavior,
and schema drift. Do not use direct schema synchronization, automatic migration
generation, or database reset in staging or production.

Destructive data changes require documented impact, a recoverable backup, a
tested recovery procedure, and explicit maintainer authorization. Prefer
expand-migrate-contract changes and account for older application versions that
may still be running.

## Documentation and language

- Keep documentation versioned with the code and link requirements, tests,
  migrations, and pull requests by identifier.
- Record architecture decisions as ADRs with context, alternatives, decision,
  consequences, and status.
- Document API contracts, data models, environment variables, installation,
  testing, upgrades, backup, and recovery as they are introduced.
- Documentation, user communication, issues, and pull request descriptions are
  in Portuguese. Code, database identifiers, migration names, and commit
  messages are in English. The initial UI is Brazilian Portuguese.
- Use fictional data and reproducible commands in examples.
- Real project commands are documented in `CONTRIBUTING.md`.

## Git and delivery

- Work on short, cohesive branches such as `docs/project-rules`,
  `feat/booking`, or `fix/booking-conflict`.
- Use English commits in the form `type(scope): summary`, with types such as
  `docs`, `test`, `feat`, `fix`, `refactor`, `ci`, and `chore`.
- Agents may create branches, push verified commits, and open pull requests for
  authorized work. The maintainer decides whether to merge into `main`.
- Never merge, enable auto-merge, bypass required checks, or rewrite shared
  history unless the maintainer explicitly instructs it.
- Pull requests must describe the problem, result, related requirement,
  documentation, executed tests, and database/recovery impact.
- Production release requires explicit maintainer approval.

## Definition of done

A change is complete only when its acceptance criteria are met, documentation
and tests match the delivered behavior, relevant checks have passed, database
changes include reviewed migrations and recovery guidance, and the diff contains
no unrelated files, real data, or secrets.

Report local preparation, GitHub push, merge, and production release as separate
states. State exactly which one was reached.
