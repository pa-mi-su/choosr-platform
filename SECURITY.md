# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or include secrets,
tokens, phone numbers, private messages, or user content in GitHub.

Repository maintainers should use GitHub's private vulnerability reporting
feature for coordinated reports. If that feature is unavailable, contact the
repository owner through a previously verified private channel.

Include only the minimum information needed to reproduce the issue:

- affected environment and app version;
- affected component or endpoint;
- reproduction steps using test data;
- impact and any known mitigations.

Do not access another person's data, attempt denial of service, or continue
testing after confirming the issue.

## Supported versions

Security fixes are applied to the current `dev` line, validated in UAT, and
promoted to the current production release. Older mobile builds may be retired
when a fix requires server-side enforcement.

## Maintainer response

Maintainers should acknowledge a report promptly, preserve relevant security
events, rotate exposed credentials, and deploy server-side containment before
waiting for mobile-store review when practical.
