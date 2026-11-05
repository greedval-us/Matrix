# Matrix desktop appearance

The desktop client follows the user's Apple-inspired direction: a calm macOS-style workspace with a translucent navigation rail, crisp content surfaces and purposeful motion. This is a visual update of the existing workflows; RPC, storage and export contracts stay unchanged.

## Tokens

- Canvas: `#F5F5F7`; rail: `#ECECEF`; content: `#FFFFFF`.
- Primary text: `#202126`; secondary text: `#535966`; Matrix green accent: `#15803D` in light mode and the original `#22C55E` in dark mode. The light variant keeps white button labels and green icons readable.
- Typography: native system UI (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI Variable`, `Segoe UI`). No remote fonts.
- Corners: controls 12px, panels 18px, dialogs 24px. Borders and shadows convey hierarchy, with blur confined to navigation, toolbar and modal backdrop.
- Motion: 120ms press feedback, 180ms control changes, 240–260ms page/dialog transitions. Reduced motion removes spatial transitions.

## Composition

The navigation rail stays on the left. A compact toolbar exposes page context, appearance switching and connection settings. Home puts the primary search action before saved notes, tasks and history. Search uses a left query inspector and a larger results area; tabs act as an understated segmented control. Secondary settings stay progressively disclosed.

Branding uses the supplied `src/public/matrix.png` in the navigation rail and launch screen; `matrix.ico` remains the Windows application icon. The launch screen keeps the original black background and green Matrix rain effect.

Appearance defaults to light and can switch to dark; the choice is stored locally. Both palettes use the same semantic variables. Error, warning and success surfaces have independent readable theme colors.

## Validation

Check home, search, results, dialogs, settings, catalogue and batch screens in light/dark modes. Inspect desktop and minimum window sizes, keyboard focus, modal Escape and reduced motion. Build a Windows portable executable and installer from the resulting sources. No backend access is needed to inspect the interface.
