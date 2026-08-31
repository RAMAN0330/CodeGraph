# Project-owned repository flow

## Goal

Adopt the landing and organization flow from `/Users/raman/Desktop/light/client` in CodeGraph. A repository belongs to a project rather than being selected globally after authentication.

## Scope

- Preserve CodeGraph's existing GitHub OAuth session, repository APIs, and analysis workspace.
- Replace the main-path use of `/select-repo` with workspace and project selection.
- Store workspaces and projects locally in the browser for this iteration; do not add database tables, Supabase, a PAT flow, or shared collaboration.
- Use the `light` project's interaction model: a repository is attached and verified during project creation, and opening a project launches its attached repository in CodeGraph.

## Navigation and state flow

```text
Landing page
  -> GitHub OAuth
  -> Workspaces page
  -> Projects page for the selected workspace
  -> Create project and attach repository
  -> CodeGraph analysis workspace
```

After GitHub OAuth completes, the app reads the browser-local organization state. If no workspace exists, it presents the workspace empty state. If a workspace exists, it opens its projects page. The old repository selector is retained only as a compatibility route and is not linked from the standard flow.

## Screens

### Landing

Port the visual language and primary call-to-action structure from `light`'s landing page, adapted to CodeGraph's name, logo, and GitHub OAuth endpoint. The primary action starts GitHub connection; a connected user is sent to their workspaces.

### Workspaces

Provide a `light`-inspired workspace picker with an empty state, create workspace action, workspace cards, and a sign-out control. A workspace has an ID, name, and timestamps.

### Projects

Provide a project picker scoped to the selected workspace. It supports creating, opening, and locally deleting projects. A project has an ID, workspace ID, name, optional instructions, repository full name, and timestamps.

### Create project and attach repository

The project creation dialog asks for the project name, optional instructions, and a repository in `owner/repository` form. It verifies the repository through CodeGraph's existing authenticated GitHub repository endpoint before enabling creation. The repository picker/list comes from the authenticated GitHub account when available, with a validated `owner/repository` input as the fallback for public repositories. Private repositories use the current GitHub OAuth session; this iteration does not collect or persist personal access tokens.

## Opening a project

Opening a project requires an attached, verified repository. The app navigates to the existing `/workspace` route with the project's repository in the query string and starts the existing analysis flow. The workspace header/breadcrumb shows the selected workspace and project, with a way back to projects.

## Errors and edge cases

- Unauthenticated users are returned to the landing page before organization screens load.
- Repository verification failures stay in the dialog with an actionable error; no incomplete project is created.
- Projects saved before a reload retain their selected repository through browser-local storage.
- A project whose repository is no longer accessible shows a reconnect/choose-another-repository state instead of launching analysis.
- Browser storage errors degrade to an in-memory session and explain that organization data will not persist.

## Testing

- Unit tests cover local workspace/project persistence, validation, and navigation decisions.
- Component tests cover creating a workspace, creating a verified project, and opening the project's repository workspace.
- Existing GitHub auth, repository selection, and workspace UI tests continue to pass.

## Out of scope

- Supabase integration, multi-user workspaces, invitations, roles, shared project data, and backend persistence.
- GitHub personal access-token collection or storage.
- Changes to CodeGraph's analysis algorithms and existing repository API contracts.
