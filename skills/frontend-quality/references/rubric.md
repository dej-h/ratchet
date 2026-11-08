# Quality rubric

Use these principles to select observable checks for the affected surface. The
bundled runner checks a subset mechanically; the reviewer judges the rendered
result and whether the chosen assertions actually cover the person's task.

| Area | Standard | Evidence |
| --- | --- | --- |
| Audience | Labels, content and primary actions serve the user's task. Internal process language appears only when useful to that audience. | Reviewer follows the main task and reads labels, errors and empty states. |
| Information | Show relevant information once unless repetition helps a workflow. Metrics and drilldowns answer a concrete question. Missing values distinguish expected absence from exceptional data loss. | Render normal, empty, filtered and exceptional states; assert the distinction. |
| Hierarchy | Page titles, section headings, body text and supporting detail have consistent roles, readable line heights and deliberate emphasis. Group by proximity before adding enclosing panels. | Compare affected and related pages at the same viewport and state. |
| Cohesion | Reuse shared typography, spacing, surfaces, controls and the existing brand assets. Keep deliberate exceptions local. Preserve approved focal elements. | Before/after screenshots plus related-page review; verify the actual rendered font when typography changes. |
| Affordance | Controls look actionable; inert elements look inert. Sorting, selection, focus and disabled states remain visible against the final surfaces. | Pointer and keyboard assertions; inspect screenshots for lost cues. |
| State | Loading, empty, normal, filtered, error and exceptional states have appropriate presentation. Independent sections stay usable while another loads or fails. | State scenarios and controlled slow/failing responses. |
| Data | Routes or equivalent entry points start independent queries together. Canonical resource definitions own keys, parameters, freshness and cancellation. Local view changes reuse loaded data when appropriate. | Query lint, real cache tests and throttled request-contract checks. |
| Copy | Names match the user's mental model and remain consistent through an action. Errors explain the problem and available recovery. Never ask users to perform admin actions outside their access. | Reviewer reads complete action and recovery flows. |
| Accessibility | Semantic controls, accessible names, keyboard operation, visible focus and announced state changes support the task. Colour is never the only status cue. Tooltips work on focus as well as hover. | Axe plus explicit keyboard, focus, status and tooltip assertions. Axe alone is insufficient. |
| Navigation | Navigation labels, location and titles agree. Counts equal the destination's contents; unavailable counts are not zero. Role-specific controls follow access rules, with authorization still enforced on the server. | Navigate, compare counts, test relevant roles and verify old links when renaming routes. |
| Responsive layout | Components respond to their available width. Wide content scrolls in its own wrapper; the page does not scroll sideways. Controls do not collide or become unreachable. | Phone and content-driven desktop widths, including 1280, 1440 and 1600 px where relevant, with expanded/collapsed navigation. |
| Repeated data | Tables are scannable, numeric columns align, sorting announces its state, repeated actions have concise recognizable controls, and unknown status is explicit. | Sort by keyboard, inspect dense/empty layouts, and assert labels and `aria-sort`. |
| Freshness and charts | Synced data distinguishes last-good time from stale data. Charts resize with their container and offer keyboard access and an equivalent data view. | Resize, test stale data, operate tooltips by keyboard, and compare chart values with the accessible alternative. |
| Interaction recovery | Cancellation, dismissal and failure preserve the user's work and permissions. Focus returns to a useful place. Stale async responses cannot overwrite a newer choice. | Exercise cancellation, failure, reordered responses and focus restoration for the actual interaction. |

Use official assets and one consistent icon style. Icon-only controls need
accessible names; decorative icons should be hidden from assistive technology.
Verify intended font families and weights really render rather than trusting
the CSS declaration. The runner's optional `fonts` checks use Chromium's rendered
font inspection on text-bearing selectors.

Do not impose one sidebar design, heading casing, dialog implementation, colour
palette or font on every application. Preserve established behavior unless the
task calls for changing it. The rubric defines outcomes; the application's
contract supplies the implementation and the proving assertions.
