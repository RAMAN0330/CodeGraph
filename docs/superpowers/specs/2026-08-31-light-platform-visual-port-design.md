# Light platform visual port

## Goal

Make CodeGraph's landing, workspace, and project pages visually match the platform pages in `/Users/raman/Desktop/light/client` while retaining CodeGraph's GitHub OAuth, repository verification, and browser-local organization state.

## Visual system

Port the One Dark palette, typography, surface hierarchy, borders, compact buttons, search controls, cards, dialogs, Lucide icon treatment, and restrained Framer Motion entrance transitions from `light`. Replace Orbital naming and orbit marks with CodeGraph naming and GitGraph marks.

## Screens

- Landing: use Light's grid-backed hero, navigation, workspace preview, workflow strip, capability cards, and closing call-to-action; copy describes CodeGraph's GitHub-to-project-to-analysis flow.
- Workspaces: use Light's workspace catalog and empty state, including the search field, selectable cards, and compact create action.
- Projects: use Light's project picker layout, searchable cards, create-project card, and project-owned repository attachment dialog.

## Functional boundaries

- Keep the existing `/workspaces`, `/workspaces/:workspaceId/projects`, `/workspace`, GitHub OAuth, and repository verification paths.
- Do not port Supabase, chat, invitations, member lists, roles, organization APIs, or personal access token storage.
- Use the existing local workspace and project store.

## Validation

- Component/source tests verify the Light-derived screen structures and routes.
- Client and server TypeScript builds pass.
- Docker client rebuild exposes the new pages at port 8080.
