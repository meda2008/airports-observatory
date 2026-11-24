# ViewTurbo public financial collection

Current official origin: `https://web.vtpro.xyz`. Live raw evidence and review receipts:
`work/collection-runs/unread-official-financial-20261104-v7/`.

The `/charge` route canonicalizes to `/charge/`; accept both, without guessing other origins.
The first rendered page can contain headings but no time/data plan cards, and can show only
some payment buttons. Wait for the Private Email payment group, Stripe WeChatPay and USDT.
A readiness timeout is a checkpoint; do not remove a payment method because an early snapshot
omits it. Extract the actual final visible body, which may exclude the global footer.

The payment group applies to Private Email, USD 1 including one day of unlimited data.
Do not propagate its buttons to ordinary subscriptions or claim successful payment. Never
enter an email or click payment buttons in this read-only recipe. Retain older observations.
Use `statementObservations` and a scoped summary for the existing public API/display contract.
`observations` alone is retained in the database but is not displayed in reviewed change cards.

The current Terms of Use page and the channel refund search contained no refund rules.
This does not prove that no policy exists. Refund remains unknown. The operator's own linked
channel is not an independent source. The successful test covers the literal parser and local
publication using retained live evidence; it is not a deployed unattended collection acceptance.
