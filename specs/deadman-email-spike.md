# Deadman Email Spike — BLOCKED on Gmail credential

**Date:** 2026-06-29 (Session A)
**Status:** 🔴 Channel mechanics proven; authentication rejected by Gmail.

## What works
The transport path is correct and reaches Gmail:
- `msmtp` resolves (`/opt/homebrew/bin/msmtp`), `~/.msmtprc` present at `-rw-------`.
- Connects to `smtp.gmail.com:587`, negotiates STARTTLS, attempts `AUTH PLAIN`.
- Keychain item `msmtp-gmail` (account `cmaragre@gmail.com`) is reachable; `passwordeval` pulls it at send time — the rc file holds no plaintext secret.

So `config/monitoring.json` (`msmtp_account: "gmail"`), the rc file, and the Keychain wiring are all correct.

## What fails
```
msmtp: authentication failed (method PLAIN)
msmtp: server message: 535-5.7.8 Username and Password not accepted.
msmtp: server message: 535 5.7.8  https://support.google.com/mail/?p=BadCredentials
msmtp: could not send mail (account gmail from /Users/chrism/.msmtprc)
exit=77
```

## Diagnosis performed (no secret revealed)
1. Stored value was **20 chars with 4 spaces** — a 16-char app-password saved with Google's display spaces.
2. Stripped spaces in place and re-stored as exactly **16 chars** (verified length, value never printed).
3. Re-sent → **same `535 BadCredentials`**.

→ Spaces were not the (only) cause. The 16-char secret itself is not a credential Gmail accepts for `cmaragre@gmail.com`.

## Likely causes (user to resolve in Google account UI)
- 2-Step Verification not actually enabled → app-passwords can't authenticate.
- App-password mistyped / belongs to a different Google account / was revoked.
- App-password generated but for the wrong "app" context, or account is a restricted Workspace account.

## Next action (user)
1. Confirm 2FA is **on** for `cmaragre@gmail.com` (myaccount.google.com → Security → 2-Step Verification).
2. Generate a **fresh** app-password (Security → App passwords → Mail). Copy the 16 chars.
3. Re-store, **no spaces**:
   ```
   security delete-generic-password -a cmaragre@gmail.com -s msmtp-gmail
   security add-generic-password -a cmaragre@gmail.com -s msmtp-gmail -w
   ```
   (paste the 16 chars with spaces removed when prompted)
4. Tell Claude "re-try the spike" — the rest of the verification (force-stale → notification + received email → reset thresholds) runs unchanged once auth succeeds.

## Unaffected by this block
The watchdog is built, committed (`7b87013cb`), and running every 6h. Local notification + heartbeat layers work. Only the email *delivery* leg is pending this credential.
