# Explorer Sidebar Simplification Design

## Goal

Remove duplicated repository summary information from the Code graph sidebar. Keep the sidebar focused on repository navigation and expose the existing unused-code details from the Summary page.

## Code Graph Sidebar

The Code graph sidebar contains only:

- An `Explorer` heading.
- The active folder filter and its clear action when a filter is applied.
- The existing virtualized repository tree.
- The existing resize handle.

Remove the Code graph title block, health score, color controls, files/functions/links/unused metrics, lines-of-code total, and language breakdown from this sidebar.

The graph canvas, inspector, node selection, folder filtering, and tree interactions remain unchanged. Graph coloring keeps its existing default mode; this change does not add a replacement color control.

## Summary Page

The Summary page remains the single location for health, repository metrics, languages, and focus areas.

Remove the `Repository overview` eyebrow and the subtitle `A focused snapshot of structure, maintainability, and the areas worth opening next.` Collapse their spacing so the repository name becomes the first heading. Keep the `Analysis complete` badge beside the repository name.

The existing `Unused code` focus-area row becomes interactive through a new `onOpenUnused` callback. Clicking it opens the existing unused-functions modal without changing the active workspace section.

The health card's `Unused` signal may use the same callback so both visible unused-code entry points behave consistently.

## Unused-Code Modal

Reuse the existing modal and state owned by the workspace engine. Do not create or duplicate a second modal component.

The modal remains on the Summary page and supports:

- Dead-function, dead-line, and affected-file counts.
- Expand/collapse per function.
- Expand all and collapse all.
- Inline source snippets and the existing source-preview action.

Clicking a modal result must not switch to Explorer or change the active section. Any control that currently selects a file and closes the modal is removed or converted into a non-navigating label.

## Top-Bar Search

The command-palette control is compact by default and shows only the search icon and `⌘ K` shortcut. Hovering the control or moving keyboard focus into it expands the control to reveal the `Search code` label. Expansion uses CSS so no additional interaction state is required.

Clicking the control or using the existing keyboard shortcut continues to open the command palette. The compact state must keep the icon and shortcut legible without shifting other top-bar controls.

## Account Menu

Replace the separate user display and Sign out button with one account-menu button. The closed button shows the avatar and username. Clicking it opens a dropdown containing:

- Avatar and username.
- Connected status.
- Account settings action that opens the existing workspace Settings section.
- Sign out action.

Sign out keeps the existing authenticated logout request and redirect behavior. The menu closes when the user clicks outside it or presses Escape. The standalone Sign out button is removed from the top bar.

## Data Flow

1. `WorkspaceOverview` receives `onOpenUnused` from `LegacyWorkspaceEngine`.
2. Summary unused-code controls call `onOpenUnused` only when unused findings exist.
3. `LegacyWorkspaceEngine` sets the existing `showUnused` state to `true`.
4. The existing modal renders from `data.deadFunctions`.
5. Closing the modal leaves `activeSection` equal to `overview`.
6. The search control expands through CSS hover/focus state and continues opening the existing command palette.
7. The account menu owns the existing sign-out handler and closes on outside click or Escape.

## Accessibility

- Summary unused-code controls remain semantic buttons.
- Disabled/no-findings behavior does not open an empty modal.
- Modal close behavior, overlay dismissal, and button labels remain available.
- The account-menu button exposes `aria-expanded` and the dropdown has an accessible menu label.
- Search expansion works for pointer hover and keyboard focus.

## Verification

- Client TypeScript production build passes.
- Code graph sidebar renders only the Explorer controls and tree.
- Summary `Unused code` opens the existing modal when findings exist.
- Summary starts with the repository name and status badge; the removed eyebrow and subtitle leave no empty spacing.
- Expanding modal entries works without changing the active workspace section.
- Closing the modal returns to the unchanged Summary page.
- Search renders as icon plus `⌘ K`, expands on hover/focus, and opens the command palette.
- Account dropdown opens and closes correctly, Account settings is reachable, and Sign out completes the existing logout flow.
