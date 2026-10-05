# Reroll and birthday safety; shop closure

Live in both bots on October 5, 2026, on `feature/S-1-checkin`, continuing the completed Fate audit. Player self-grants remain an intentional, authorized bookkeeping workflow with their existing public bot receipt. Their eligibility, caps and owner-only Bank overflow are unchanged.

## Rerolls

The command acknowledges Discord before database work. A unique interaction receipt and the 10-point debit commit in one SQLite transaction. Bank is spent first, then normal Fate makes up any remainder. Concurrent delivery, retry after a failed reply, and restart replay the recorded result without another debit. A new interaction is a new paid reroll. Insufficient-funds receipts also remain failed if retried after a refill; a fresh command can use the new balance. Identity checks reject reuse by another user/guild. Conditional wallet writes and the shared connection queue preserve seasonal and manual wallet updates.

## Birthdays

One exceptional +10 Bank reward per selected guild/user/Pacific calendar year, with the existing Bank100 cap and no reduction of any legacy above-cap balance. The annual receipt and credit commit together. Changing a birthday later in the same year cannot earn another reward issued by this implementation. The receipt freezes actual credited points and before/after balances for the development birthday card; production retains its text greeting. Missing channels, absent/noncampaign members and bots do not receive a credit. Member lookup is fresh and scoped to the configured guild. Each person's failure is contained so the other birthdays continue.

Notification delivery is separate from payment and is reserved before calling Discord. Successful sends store the message ID. Failed/uncertain sends or a crash during sending remain marked for manual inspection and are not automatically resent; this favors preventing duplicate greetings. The bonus remains saved even if Discord cannot deliver its greeting. This is not a guarantee of delivery. The existing 06:00 Pacific cron is retained without startup catch-up or historical backfill: prior birthday payments cannot be reliably reconstructed from the old wallet totals. Protection covers rewards issued from this cutover onward.

## Shop

`/shop` is removed from both live guild registries, excluded from every environment's future command registration, and blocked privately by both the dispatcher and the command itself. All old purchase/catalog mutation code has been removed from the active module; Git retains its history. No wallet, stock, item or badge was removed or refunded. The future shop will use non-game rewards such as badges after the catalog is decided. Before reopening it, implement transactional stock/payment/receipt handling and persisted item identities; audit findings A04/A05 are mitigated by closure, not by a completed redesign. Spooky purchases are separate and unchanged.

## Validation and deployment

495/495 full isolated tests, 13/13 focused wallet/command checks, and three final actual-command tests pass. Coverage includes concurrent retries, insufficient-funds replay after refill, rollback when receipt insertion fails, capped/legacy Bank birthdays, concurrent notification claims, failed delivery isolation, real command responses and durable SQLite close/reopen. Offline registry definition audit and whitespace checks pass; the source eligibility change hides Shop without changing other definitions. A separate compatibility probe exercises the actual deployed production command/services against a disposable in-memory legacy User schema.

Both writers were stopped before verified exclusive backups. Only an empty additive `WalletOperations` table was introduced into each authoritative database. Every existing table's row count and canonical contents hash remained unchanged, including retired booster history. Production received only the reviewed wallet/birthday/shop modules and a scoped dispatcher patch, preserving its independent deployment and absence of Community/Profile/Sanity activation. Targeted Discord DELETEs removed only Shop; all other live registry entries were verified unchanged and development `/game` was retained. Both registries now contain 12 commands.

Production PID17872 and development PID29164 are online/Ready after one named restart each, with zero new error-log bytes and PM2 saved. Backups, source rollback copies, hashes, registry snapshots and process evidence are retained under ignored `.runtime/wallet-safety`. No real reroll, birthday test payment, manual balance correction, XP reset, leveling launch, main merge or push was performed.

Rollback requires stopping the affected writer and reviewing receipt-bearing balances before any database restore. Restoring a pre-cutover database after real activity would discard that activity and is not an automatic rollback step. Keep the additive receipt table even if reverting source, and never restore the old shop handler without its payment/stock corrections.
