# Security Policy

## Reporting a vulnerability

If you find a security issue in ussdkit, please do not open a public issue.

Use GitHub's private reporting form:
https://github.com/omoyolab/ussdkit/security/advisories/new

Or email **xanderabim@gmail.com** with "ussdkit security" in the subject.

You will get an acknowledgement within 72 hours and a fix or a plan within 14 days for
confirmed issues. Credit is given in the release notes unless you prefer otherwise.

## Scope

ussdkit handles requests from USSD gateways and stores session state. Things that count
as vulnerabilities:

- One phone number being able to read or affect another's session.
- Input from the gateway reaching a handler unsanitised in a way that lets it alter
  navigation or session data it should not.
- Stack traces or internal details leaking to the phone.
- Anything that lets a crafted request crash the process.

Things that are out of scope:

- Authentication of the gateway itself. Gateways call your URL over HTTP; restricting
  who can reach it (IP allow lists, a shared secret in the path) is your deployment's job.
  See the README for guidance.
- Bugs in your own screens and handlers.

## Supported versions

Only the latest minor release receives security fixes.
