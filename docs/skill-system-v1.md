# Skill and equipment system v1

The canonical balance field is `skillSystem`. `definitions` owns stable skill IDs; `classRules` references them for initial/advanced unlocks and slot counts. Positional class/support/passive arrays are generated adapters for the existing combat engine. Existing positions are retained so legacy affixes continue to target the original skill.

Main-character configuration uses `skillLoadout.{active,proc,support}` and `activeSkillEquipmentId`. A first-job character has 3/1/1 slots; advancement expands this to 3/2/2. The twelve new class actives unlock at LV1/3/5. Other skills require their quest, equipment or advancement source, with existing mastery and weapon conditions retained. The current introductory story completion satisfies the legacy tutorial quest source. Companion plans project every unlocked owned skill automatically; token equipment restrictions remain in force.

An equipment instance owns `skillId` and `skillSockets:{version,count,gems,firstMode}`. Sockets are generated once, using actual equipment level and source rules. Explicit monster equipment drops resolve final form/difficulty before skill selection. Only the selected worn instance grants a candidate skill; it must also occupy a legal loadout slot. Inactive equipment uses base gem effects. Selected equipment uses its own skill effects, with only socket 1 offering a saved base/skill choice. Invalid combinations are refused; previously saved incompatible gems fall back to explicitly displayed base effects. Sale and salvage refund socketed gems inside the existing storage transaction.

Save migration is marked with `skillSystemVersion:1`. Legacy three-kind gem IDs first pass through the existing gem migration. Shared team gem-instance IDs refund once; companion skill gems also return to account inventory. Legacy equipment receives zero sockets without randomization, preserving IDs, stats, affixes, upgrades and locks. Repeated load/export/import does not repeat refunds. Unsupported or malformed data throws before overwriting the original save.

Runtime effects are cached from worn equipment and refreshed on configuration, inventory, balance and save changes; attacks do not scan the whole bag. Visible, BOSS and offline combat use the same runtime. Creation previews read the canonical class rules and descriptions directly.

The private balance editor embeds the same model, adds stable-ID editing plus complete JSON controls for class rules, equipment pools/socket distributions and gem modes, and retains import/export/drafts/diff/version operations. Publication checks the target runtime's `skillSystemVersion:1` capability. New JSON must not be promoted to an older production runtime. The game `main` branch is outside this change.

## Verification

Behavioral checks cover all twelve initial skills; slot/type/source checks; mastery requirements; quest completion; advancement; automatic companions; four legacy save fixtures; team copy/switch/clear/delete and storage failure; multiple skill equipment; gem modes and free replacement; atomic refunds; explicit monster form/difficulty; shop, strengthening/reroll and BOSS-stage settlement. Tests use the production runtime and balance data, with controlled fixtures where appropriate.

Offline checks compare the visible timeline against the event scheduler with identical random input, restore a mid-turn cursor, and resume a durable checkpoint. The final long-run check used the production mage skills/drop engine and a deliberately increased test bag limit: 8h = 5,102 kills, 50,017 ms simulation, 42 gear, 89,903 serialized characters; 24h = 15,178 kills, 145,170 ms simulation, 93 gear, 146,570 characters. Each completed without engine errors and retained identical gem counts after reload. Timings include concurrent validation work and are workload observations, not a device-independent performance guarantee.

Run relevant checks with `node --test --test-concurrency=1` and the `skill-system-*.test.cjs`, `equipment-skill-system.test.cjs`, `equipment-acquisition.test.cjs`, `gear-inventory.test.cjs`, `team-plan-management.test.cjs`, `offline-exploration.test.cjs` and `offline-checkpoints.test.cjs` files. Run the long workload with `node tests/skill-system-offline.cjs`. Sequential execution avoids CPU-contention timeouts when booting many full runtimes at once.

## Deliberate compatibility choices

Legacy gear gains zero sockets rather than a fresh lottery. Skill deletion leaves a disabled tombstone to preserve engine/index mappings; referenced skills cannot be deleted. Advanced authoring fields use validated JSON controls. Existing saves keep their original legacy skill-index affix targets, which can therefore refer to skills now obtained from equipment or quests rather than the twelve new class actives.
