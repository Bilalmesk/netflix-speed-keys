# Netflix Speed Keys

Control Netflix playback speed from the keyboard. Subtitles stay in sync automatically because they are timed to the video itself.

## What it does

| Key | Action |
| --- | --- |
| `+` (or numpad `+`) | Speed up by `0.25×` |
| `-` (or numpad `-`) | Slow down by `0.25×` |
| `0` | Reset to normal speed (`1×`) |

The physical `=` key also works for speeding up, so you don't have to hold Shift.

- Range: `0.25×` to `4×`
- The current speed is shown in a small on-screen indicator.
- The speed is saved and automatically re-applied after reloads and episode changes.
- If Netflix resets the speed internally, the script puts it back.
- Pitch correction is enabled, so voices sound natural instead of chipmunk-like.

Subtitles need no separate control: Netflix renders its subtitles from the video's timestamp, so they speed up or slow down with the video and remain in sync.

## Option 1: Tampermonkey userscript (easiest)

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension.
2. Open the Tampermonkey dashboard and choose **Create a new script**.
3. Delete the template, paste the entire contents of `netflix-speed.user.js`, and save.
4. Open or reload a Netflix video and press `+` / `-`.

You can also open `netflix-speed.user.js` in a browser with Tampermonkey installed; Tampermonkey may offer to install it directly.

## Option 2: Chrome / Edge extension

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `netflix-speed-extension` folder.
5. Open or reload a Netflix video and press `+` / `-`.

Install only one of the two options. Both do the same thing, and running both at once is unnecessary.

## Notes and troubleshooting

- Click somewhere in the Netflix page once so the player has keyboard focus.
- `+` is usually **Shift + =** on a US keyboard. The physical `=` key also works, as does the numpad `+`.
- The keys are ignored while you are typing in a search box or another text field.
- Netflix's own playback-speed menu may still show `1×`; this script changes the video element directly, so use the `+` / `-` keys instead.
- At very high or very low speeds, some browsers mute audio automatically. That is a browser/Netflix limitation, not the script.
- If the indicator does not appear, check that the script/extension is enabled for `www.netflix.com`, reload the watch page, and click on the video once. The script only responds while a Netflix video is loaded.
- When installing the userscript, use **Tampermonkey → Utilities → Import from file** instead of copying from a chat or a numbered code view. A stray line such as `line 8` inside the `==UserScript==` header prevents Tampermonkey from running the script.
