# ORBIT native release gate

Run on a disposable Windows 10/11 x64 account after building. Browser harness results do not replace these checks.

- Install the actual NSIS bundle. Confirm ORBIT icon on installer, executable, taskbar, Desktop, Start Menu and tray.
- Close all Vite/core development servers. Launch via Desktop shortcut. Confirm only the ORBIT window appears.
- Launch again: one instance; existing window receives focus.
- First run without a key: no crash; all six onboarding stages work. Choose a folder through the native Windows picker.
- Enter a real Anthropic key; Test connection succeeds without displaying the key. Try an invalid key; error must not contain the supplied key.
- Check Windows Credential Manager entry; verify settings, SQLite, logs and subprocess command lines do not contain the key.
- Run "Find and fix the failing test." Approve plan, commands and diff. Confirm real file changes, independent verification and completion.
- Undo Task restores original content. Close, reopen, and verify history, projects, settings, window position/size/maximized state and credentials.
- Pause before a tool boundary; no new tool starts. Resume continues. Existing task timeout still applies.
- Exit while task is active: Keep running hides to tray, Cancel keeps the app open, Stop and exit cancels and drains I/O before exiting.
- Enable tray mode; first close explains it. Use every tray action and notification preference.
- Try a conflicting global shortcut: app remains usable and reports the conflict. Change global and local shortcuts.
- Toggle launch on Windows startup; verify default off and both registration/removal.
- Disconnect network: Projects, Files, History, Settings work; AI reports unavailable instead of crashing.
- Kill an active test instance deliberately. Restart and confirm INTERRUPTED status; inspect file/Undo consistency.
- Run with no system Node/npm and no PostgreSQL. The packaged runtime must suffice.
- Uninstall through Windows Settings. Program files/shortcuts removed, user data retained.
- Validate upgrades on an existing 0.3 data directory. Repeat migration without data loss.
- Record actual installer path, executable path, SHA256, tests, OS/runtime versions and native outcomes in the report.

The CI installation script is restricted to CI=true and a disposable runner. Never use its removal/reinstallation flow against an everyday ORBIT installation.
