#!/usr/bin/env python3
"""一次性整理：只保留第一張地圖（map0）可見的內容與已實裝的夥伴、技能、裝備。

刪除：
- 第二張以後的地圖、怪物、掉落、商店階段、BOSS 詞條、專屬強化綁定與其素材。
- availability=hidden 的夥伴，以及只屬於這些夥伴的技能與被動。
保留：
- 技能機制設定（skill-settings、skill-system、statuses、reference）與職業技能。
執行後請跑 node scripts/balance-modules.cjs build。
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / 'data' / 'balance'
KEEP_MAP = 0


def load(rel):
    return json.loads((ROOT / rel).read_text(encoding='utf-8'))


def save(rel, data):
    (ROOT / rel).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def map_of(ref):
    m = re.match(r'^map(\d+)(_|$)', str(ref))
    return int(m.group(1)) if m else None


# ── 地圖 ──
maps = load('world/maps.json')
maps['levelRanges'] = maps['levelRanges'][:1]
maps['catalog'] = [m for m in maps['catalog'] if m['id'] == 'map0']
save('world/maps.json', maps)

# ── 怪物 ──
monsters = load('world/monsters.json')
removed_monsters = [m for m in monsters['catalog'] if m['mapIndex'] != KEEP_MAP]
kept_monsters = [m for m in monsters['catalog'] if m['mapIndex'] == KEEP_MAP]
monsters['catalog'] = kept_monsters
save('world/monsters.json', monsters)
kept_ids = {m['id'] for m in kept_monsters}
kept_materials = {m.get('material') for m in kept_monsters if m.get('material')}
removed_materials = {m.get('material') for m in removed_monsters if m.get('material')} - kept_materials
removed_materials.add('日蝕王冠')  # 終焉王座 BOSS 素材

# ── 掉落 ──
drops = load('world/drops.json')
out = []
for e in drops['entries']:
    srcs = e.get('sources') or []
    if srcs:
        keep = [s for s in srcs if map_of(s) is None or map_of(s) == KEEP_MAP]
        if not keep:
            continue
        e['sources'] = keep
    if e.get('type') == 'sourceMaterial' and e.get('name', '').split('（')[0] in removed_materials:
        continue
    out.append(e)
drops['entries'] = out
save('world/drops.json', drops)

# ── 夥伴 ──
companions = load('characters/companions.json')
# 已實裝夥伴：序章發放招募券的洛恩（10）與艾琳（13）。其餘夥伴（含 visible 但無取得途徑者）一律刪除。
IMPLEMENTED_COMPANIONS = {10, 13}
hidden = [c for c in companions if c.get('availability') == 'hidden' or c['id'] not in IMPLEMENTED_COMPANIONS]
hidden_ids = {c['id'] for c in hidden} | (set(range(10, 30)) - IMPLEMENTED_COMPANIONS)
companions = [c for c in companions if c['id'] not in hidden_ids]
for c in companions:
    c.pop('statTemplateId', None)
save('characters/companions.json', companions)
partner_prefix = tuple(f'partner{i}-' for i in sorted(hidden_ids))

passives = load('characters/passives.json')
passives = [p for p in passives if not str(p.get('id', '')).startswith(partner_prefix) and p.get('partnerId') not in hidden_ids]
save('characters/passives.json', passives)

skills = load('combat/skills.json')
skills = [s for s in skills if not s['id'].startswith(partner_prefix) and s.get('partnerId') not in hidden_ids]
save('combat/skills.json', skills)

classes = load('characters/classes.json')
for c in classes:
    c['skills'] = [s for s in c['skills'] if not s['id'].startswith(partner_prefix) and s.get('partnerId') not in hidden_ids]
save('characters/classes.json', classes)


# 職業技能的解鎖條件若指向已刪除的地圖，改指第一張地圖。
def retarget(rows):
    for r in rows:
        u = r.get('unlockConditions') or {}
        for key in ('bossKills', 'eliteKills', 'bossEquipment'):
            for row in u.get(key) or []:
                if isinstance(row.get('mapIndex'), int) and row['mapIndex'] > KEEP_MAP:
                    row['mapIndex'] = KEEP_MAP


skills = load('combat/skills.json'); retarget(skills); save('combat/skills.json', skills)
classes = load('characters/classes.json')
for c in classes:
    retarget(c['skills'])
save('characters/classes.json', classes)
support = load('characters/support-skills.json')
for grp in support:
    retarget(grp)
save('characters/support-skills.json', support)

# ── 裝備 ──
power = load('equipment/power-system.json')
power['bossAffixes'] = [b for b in power['bossAffixes'] if b['id'] == 'legacy_low_0']
save('equipment/power-system.json', power)

settings = load('equipment/settings.json')
settings['exclusiveEnhance']['bindings'] = [b for b in settings['exclusiveEnhance']['bindings'] if b['monster'] in kept_ids]
save('equipment/settings.json', settings)

shop = load('systems/shop.json')
shop['equipmentStages'] = [s for s in shop['equipmentStages'] if s.get('mapId') == 'map0']
for s in shop['equipmentStages']:
    s['unlockMapIds'] = [m for m in s.get('unlockMapIds', []) if m == 'map0']
save('systems/shop.json', shop)

# ── 素材價格與圖示 ──
economy = load('systems/economy.json')
economy['materialPrices'] = [p for p in economy['materialPrices'] if p['key'] not in removed_materials]
save('systems/economy.json', economy)

icons = load('items/inventory-icons.json')


def keep_icon(x):
    if x['kind'] == 'material' and re.sub(r'^【[^】]*】', '', x['key']) in removed_materials:
        return False
    if x['kind'] == 'equipment':
        m = re.match(r"^boss:(\d+)(:|$)", str(x["key"]))
        if m and int(m.group(1)) != KEEP_MAP:
            return False
    return True


icons = [x for x in icons if keep_icon(x)]
save('items/inventory-icons.json', icons)

print('removed monsters', len(removed_monsters), 'companions', sorted(hidden_ids), 'materials', len(removed_materials))

# ── 夥伴支援技能與技能引擎對照 ──
support = load('characters/support-skills.json')
support = [[s for s in grp if s.get('partnerId') not in hidden_ids] for grp in support]
save('characters/support-skills.json', support)
classes = load('characters/classes.json')
passives = load('characters/passives.json')
core_pos = [{s['id']: i for i, s in enumerate(c['skills'])} for c in classes]
sup_pos = [{s['id']: i for i, s in enumerate(g)} for g in support]
pas_pos = {p['id']: i for i, p in enumerate(passives)}
skills = load('combat/skills.json')
for s in skills:
    for a in s.get('adapters') or ([s['adapter']] if s.get('adapter') else []):
        sid = s['id'] + '-job' + str(a['job']) if s.get('adapters') else s['id']
        if a['kind'] == 'core':
            a['index'] = core_pos[a['job']][sid]
        elif a['kind'] == 'support':
            a['index'] = sup_pos[a['job']][sid]
        elif a['kind'] == 'passive':
            a['index'] = pas_pos[s['id']]
    # 多職業技能另有一份主要對照（adapter），與 adapters 中同職業的項目保持一致。
    if s.get('adapters') and s.get('adapter'):
        for a in s['adapters']:
            if a['job'] == s['adapter']['job'] and a['kind'] == s['adapter']['kind']:
                s['adapter']['index'] = a['index']
save('combat/skills.json', skills)

# ── 隱藏夥伴的招募券圖示 ──
icons = load('items/inventory-icons.json')
icons = [x for x in icons if not (re.match(r'^companion-ticket-(\d+)$', str(x['key'])) and int(x['key'].rsplit('-', 1)[1]) in hidden_ids)]
save('items/inventory-icons.json', icons)
