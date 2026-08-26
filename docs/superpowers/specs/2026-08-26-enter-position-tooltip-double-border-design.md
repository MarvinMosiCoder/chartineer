# Enter Position tooltip double-border correction

## Purpose

Remove the nested duplicate border around the Isolated and leverage controls in Enter Position while preserving their hover explanations, disabled behavior, sizing, and actions.

## Cause

`IconTooltipButton` currently applies its `className` to both the outer tooltip-event wrapper and the inner button. The Enter Position callers include visual classes such as `border`, `rounded`, background, and height in that value, so both DOM elements render as controls and appear as two nested boxes. The portaled tooltip label itself does not create the duplicate.

## Design

Add an optional `wrapperClassName` property to `IconTooltipButton`.

- Existing callers that omit it retain the current behavior, avoiding unrelated toolbar layout regressions.
- When supplied, the wrapper receives `wrapperClassName` and the inner button continues to receive `className`.
- The Isolated and leverage controls pass only grid-item sizing through `wrapperClassName`; their border, background, typography, height, and interaction styling remain on the actual button.
- Tooltip events remain on the wrapper so the disabled Isolated button can still expose its explanation in browsers that do not dispatch hover events to disabled buttons.

## Alternatives rejected

- Manually wire two tooltip hooks in Enter Position: this duplicates the shared tooltip behavior and portal lifecycle.
- Change `IconTooltipButton` globally so `className` applies only to the button: existing callers rely on wrapper-level flex/grid sizing and could regress.

## Error handling

No new state or failure mode is introduced. An omitted or empty `wrapperClassName` follows the existing compatibility path.

## Testing

- Run `npm run build`.
- Open Enter Position in futures mode and confirm Isolated and leverage each render one border in dark and light themes.
- Confirm the Isolated explanation still appears on hover despite the disabled button.
- Confirm the leverage tooltip appears and clicking the control still opens the leverage dialog.
- Check representative existing `IconTooltipButton` callers to ensure their sizing remains unchanged.
