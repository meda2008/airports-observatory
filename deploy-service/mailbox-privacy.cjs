'use strict';
// Public explanation only. Never interpolate account configuration or secrets.
const policy=`Airports Observatory Mail — Gmail privacy notice
Updated: 2026-11-18

Purpose
This is the operator's private mailbox integration for the Airports Observatory
collection service. It retrieves fresh login verification codes for explicitly
configured airport-service accounts so that the operator can collect website
information. It is not a public mailbox service.

Google data access
The integration requests only the Gmail read-only OAuth scope. That scope allows
reading mailbox messages; the application checks the authorized mailbox identity
and filters requests by the configured recipient, service subject, time window
and exact sender. It checks Inbox and, if necessary, Spam. Matching message bodies
are processed to extract a fresh verification code. It does not send, modify or
delete mail, download attachments, or use mailbox data for advertising, sale or
model training. Verification codes are submitted only to the configured service's
normal login form, not to external recognition providers.

Storage and access
OAuth credentials and site sessions are held in private server configuration with
restricted filesystem access. The mailbox configuration is mounted read-only in
the collector container. Message bodies and verification codes are processed in
memory and are not intentionally stored in collection evidence, public data or
logs. Non-secret execution outcomes may be retained for diagnosing failures.
Website evidence and public catalogue data are separate from mailbox contents.

Control and retention
The operator can revoke the application's Gmail access in Google Account's
third-party connections settings. The collector must then stop mailbox access.
Stored OAuth configuration persists until the operator removes or replaces it;
private backup copies must be handled separately by the operator. A session at
an airport service may persist independently until that service expires it or
the operator terminates it. No fixed session lifetime is promised.

Google API use
Use and transfer of information received from Google APIs follow the Google API
Services User Data Policy, including its Limited Use requirements. This notice
does not claim that Google has verified the application.

Contact
Use the user-support email displayed for Airports Observatory Mail on Google's
OAuth consent screen to contact the operator about access or deletion.
`;
module.exports={policy};
