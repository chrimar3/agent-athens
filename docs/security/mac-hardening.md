# MacBook baseline for running the pipeline

The container limits what the pipeline can reach; these settings protect the
Mac around it. About 15 minutes, once.

| Setting | Where | Why |
|---|---|---|
| FileVault on | System Settings → Privacy & Security | A lost or stolen laptop doesn't hand over tokens and data |
| Firewall on, stealth mode on | System Settings → Network → Firewall → Options | Nothing on the network can connect in, including to a dev server started by mistake |
| Automatic security updates | System Settings → General → Software Update → Automatic updates: all on | Closes browser and OS holes that scraped pages could use |
| Docker Desktop file sharing limited | Docker Desktop → Settings → Resources → File sharing | Only the repo, `~/agent-athens-backups`, `~/.config/agentathens` (see `docker/README.md`) |
| Docker Desktop updates on | Docker Desktop → Settings → Software updates | The container boundary is only as good as the Docker VM |
| Time Machine to an external or network disk | System Settings → General → Time Machine | An off-machine copy of `~/agent-athens-backups` that the pipeline cannot delete |
| Separate admin account | System Settings → Users & Groups | Day-to-day and pipeline work run as a standard user; installing software asks for the admin password |
| `~/.config/agentathens` locked down | `chmod 700 ~/.config/agentathens && chmod 600 ~/.config/agentathens/*` | Other local processes and users can't read the tokens |

Check yourself: `fdesetup status` (FileVault), `/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate --getstealthmode` (firewall), `tmutil destinationinfo` (Time Machine).
