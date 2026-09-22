# Contributing

Contributions are welcome — translations (see [TRANSLATING.md](TRANSLATING.md)),
bug fixes, features, docs.

## Before you open a pull request

- Run `npm run lint` and `npm run build`.
- For a new language, run `npm run check:i18n` until it prints `✓ <locale>`.
- Keep the change focused; one topic per pull request.

## Licensing of contributions

This project is dual-licensed: it is published under the **GNU AGPL v3** (see
[LICENSE](LICENSE)), and a separate commercial licence is offered to people who
cannot use the AGPL (see [COMMERCIAL.md](COMMERCIAL.md)). That second option
only works if the maintainer can license *all* of the code, including yours.

So, by submitting a contribution you confirm that:

1. **You wrote it, or you have the right to submit it.** It is your own work, or
   you have permission from whoever owns it (for example your employer), and you
   are not knowingly including code under an incompatible licence.
2. **You license it under the AGPL v3**, like the rest of the project.
3. **You additionally grant Payam Shariat a perpetual, worldwide, irrevocable,
   non-exclusive, royalty-free right to relicense your contribution under other
   terms, including proprietary commercial licences.**
4. **You keep your copyright.** This is a licence you grant, not a transfer. You
   may keep using and relicensing your own contribution however you like.
5. You understand your contribution is public and is distributed with the
   project.

To record this, add a `Signed-off-by` line to each commit:

```bash
git commit -s -m "Add Japanese translation"
```

which appends:

```
Signed-off-by: Your Name <your.email@example.com>
```

Use your real name and an address you can be reached at. A pull request without
sign-off cannot be merged — please don't take that personally, it is what keeps
the commercial-licence option available at all.

If you would rather not grant point 3, say so in the pull request. The
contribution may still be usable as an AGPL-only patch outside the main history,
or as a suggestion the maintainer implements independently.
