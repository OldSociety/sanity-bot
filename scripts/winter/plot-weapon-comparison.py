"""Standard ReportLab chart output, with analytic fixed-level combat rates.

No simulator or live data writes. PNG rasterization is a separate Sharp step.
"""
import csv
import json
import math
from pathlib import Path
import sys
import numpy as np
from reportlab.graphics.charts.lineplots import LinePlot
from reportlab.graphics.shapes import Drawing, String, Line, Polygon, Rect
from reportlab.graphics import renderSVG, renderPDF
from reportlab.lib.colors import HexColor, Color

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / 'artifacts/winter-weapon-comparison-2026-10-29'
DATA = json.loads((OUT / 'summary.json').read_text(encoding='utf-8'))
C = DATA['config']
WEAPONS = DATA['weapons']
TEXT = HexColor('#172d42')
MUTED = HexColor('#566878')
GRID = HexColor('#e0e8ed')


def added_hp(k):
    q, r = divmod(k, 100)
    return k if not q else 100 + 500*q*(q-1) + 10*q*r


def nb_kill(r, p, nmax):
    """Probability that the r-th success happens on attempt k."""
    values = np.zeros(nmax + 1)
    if r <= nmax:
        for k in range(r, nmax + 1):
            values[k] = math.exp(math.lgamma(k) - math.lgamma(r) - math.lgamma(k-r+1)
                                 + r*math.log(p) + (k-r)*math.log1p(-p))
    return values


def fixed_level(row, level, weapon):
    """Renewal calculation with the 1/2/3-second player phase after deaths.

    Enemy death-hit distribution is truncated after total residual probability
    <1e-14. Ties are player-first. Damage reports actual HP loss, not overkill.
    """
    k = level - 1
    enemy_hp = row['hp'] + added_hp(k)
    enemy_damage = row['damage'] + k//25
    player_hp = DATA['player']['hp']
    damage = weapon['damage']
    pp, pe = C['playerAccuracy'], C['enemyAccuracy']
    needed_player = math.ceil(enemy_hp / damage)
    needed_enemy = math.ceil(player_hp / enemy_damage)
    alive, truncated_moment, deaths = [1.0], [0.0], [0.0]
    probs = np.zeros(needed_enemy)
    probs[0] = 1
    for j in range(1, 1000):
        death = probs[-1] * pe
        probs = probs*(1-pe) + np.r_[0, probs[:-1]]*pe
        alive.append(float(probs.sum()))
        truncated_moment.append(float(np.dot(np.arange(needed_enemy), probs)))
        deaths.append(death)
        if alive[-1] < 1e-14:
            break
    jmax = len(deaths) - 1
    nmax = math.floor((10*jmax-1)/3) + 1
    player_kill = nb_kill(needed_player, pp, nmax)
    player_alive = np.maximum(0, 1-np.cumsum(player_kill))
    if needed_player == 1:
        player_moment = np.zeros(nmax+1)
    else:
        previous_alive = np.maximum(0, 1-np.cumsum(nb_kill(needed_player-1, pp, nmax)))
        player_moment = np.r_[0, np.arange(1, nmax+1)*pp*previous_alive[:-1]]
    transitions = np.zeros((3, 3))
    stats = []
    for phase in (1, 2, 3):
        win = lose = seconds = incoming = outgoing_losses = 0.0
        for shot in range(needed_player, nmax + 1):
            t = phase + 3*(shot-1)
            m = (t-1)//10  # Player acts before the enemy on timestamp ties.
            if m > jmax:
                continue
            chance = player_kill[shot]*alive[m]
            win += chance
            seconds += t*chance
            incoming += enemy_damage*player_kill[shot]*truncated_moment[m]
        for j in range(needed_enemy, jmax+1):
            shots = (10*j-phase)//3 + 1
            chance = deaths[j]*player_alive[shots]
            lose += chance
            seconds += 10*j*chance
            incoming += player_hp*chance
            outgoing_losses += deaths[j]*damage*player_moment[shots]
            next_phase = phase + 3*shots - 10*j
            transitions[phase-1, next_phase-1] += chance
        transitions[phase-1, 2] += win
        if abs(win + lose - 1) > 2e-10:
            raise ValueError(f'Outcome probabilities do not reconcile: {win+lose}')
        stats.append((win, seconds, incoming, enemy_hp*win + outgoing_losses))
    # Long-run phase distribution; wins reset to phase=3, losses preserve grid.
    matrix = transitions.T - np.eye(3)
    matrix[-1] = 1
    rhs = np.array([0., 0., 1.])
    phase_weights = np.linalg.solve(matrix, rhs)
    if min(phase_weights) < -1e-9:
        raise ValueError('Invalid phase weights')
    phase_weights = np.maximum(0, phase_weights)
    phase_weights /= phase_weights.sum()
    win, seconds, incoming, outgoing = phase_weights @ np.array(stats)
    win = float(np.clip(win, 0, 1))  # Remove floating-point overshoot at probability one.
    return {'tier': row['tier'], 'level': level, 'weapon': weapon['id'], 'enemy_hp': enemy_hp,
            'enemy_damage': enemy_damage, 'win_probability': float(win), 'seconds_per_attempt': float(seconds),
            'hp_lost_per_attempt': float(incoming), 'hp_dealt_per_attempt': float(outgoing),
            'hp_lost_per_minute': float(incoming / seconds * 60),
            'hp_dealt_per_minute': float(outgoing / seconds * 60),
            'combat_sweat_per_hour': float(win / seconds * 3600 * row['sweat'])}


def text(d, x, y, value, size=12, color=TEXT, anchor='start', bold=False):
    d.add(String(x, y, value, fontName='Helvetica-Bold' if bold else 'Helvetica',
                 fontSize=size, fillColor=color, textAnchor=anchor))


def frame(width, height, title, subtitle):
    d = Drawing(width, height)
    d.add(Rect(0, 0, width, height, fillColor=HexColor('#ffffff'), strokeColor=None))
    text(d, 45, height-43, title, 26, bold=True)
    text(d, 45, height-68, subtitle, 12, MUTED)
    return d


def legend(d, y):
    for i, w in enumerate(WEAPONS):
        x = 48 + i*290
        color = HexColor(w['color'])
        d.add(Line(x, y+4, x+30, y+4, strokeColor=color, strokeWidth=3))
        text(d, x+40, y, f"{w['name']}: {w['damage']} / hit; {w['damage']*.7*20:g} raw damage/min", 11)


def lineplot(d, x, y, width, height, series, xmin, xmax, ymin, ymax, xticks, yticks,
             xlabel='', ylabel='', ylabels=None):
    plot = LinePlot()
    plot.x, plot.y, plot.width, plot.height = x, y, width, height
    plot.data = [[(float(a), float(b)) for a, b in points] for points in series]
    plot.xValueAxis.valueMin, plot.xValueAxis.valueMax = xmin, xmax
    plot.yValueAxis.valueMin, plot.yValueAxis.valueMax = ymin, ymax
    plot.xValueAxis.valueSteps, plot.yValueAxis.valueSteps = xticks, yticks
    for axis in (plot.xValueAxis, plot.yValueAxis):
        axis.labels.fontName = 'Helvetica'
        axis.labels.fontSize = 9
        axis.labels.fillColor = MUTED
        axis.strokeColor = HexColor('#9aacb7')
        axis.visibleGrid = True
        axis.gridStrokeColor = GRID
        axis.gridStrokeWidth = .5
    if ylabels:
        plot.yValueAxis.labelTextFormat = lambda v: ylabels.get(v, str(v))
    for i, w in enumerate(WEAPONS):
        plot.lines[i].strokeColor = HexColor(w['color'])
        plot.lines[i].strokeWidth = 2.3
    d.add(plot)
    text(d, x+width/2, y-34, xlabel, 10, MUTED, 'middle')
    if ylabel:
        text(d, x, y+height+12, ylabel, 10, MUTED)
    return plot


def save(drawing, name):
    renderSVG.drawToFile(drawing, str(OUT / f'{name}.svg'))
    renderPDF.drawToFile(drawing, str(OUT / f'{name}.pdf'))


def progression(early=False):
    d = frame(1440, 1080, 'How far can one unlimited weapon take you?',
              'STR 0 | 50 HP | 70% accuracy on both sides | fixed stats | full-health retries | stay on the same snowman')
    legend(d, 976)
    ymax = math.ceil(max(s['p90Level'] for s in DATA['summary'])/50)*50
    maxday = 1 if early else 31
    for index, row in enumerate(C['snowmen']):
        col, r = index % 2, index // 2
        x, y = 72+col*715, 567-r*424
        width, height = 525, 300
        text(d, x, y+height+50, f"Snowman {row['tier']}", 18, bold=True)
        text(d, x, y+height+31, f"Starts at {row['hp']} HP / {row['damage']} damage; difficulty rises with its own wins", 10, MUTED)
        groups = [next(s for s in DATA['summary'] if s['tier'] == row['tier'] and s['weapon'] == w['id']) for w in WEAPONS]
        for group in groups:
            points = [p for p in group['timeline'] if p['day'] <= maxday]
            poly = [(x+p['day']/maxday*width, y+(p['p10Level']-1)/(ymax-1)*height) for p in points]
            poly += [(x+p['day']/maxday*width, y+(p['p90Level']-1)/(ymax-1)*height) for p in reversed(points)]
            color = HexColor(group['color'])
            d.add(Polygon([v for point in poly for v in point], strokeColor=None, fillColor=Color(color.red, color.green, color.blue, alpha=.12)))
        series = [[(p['day']*24 if early else p['day'], p['meanLevel']) for p in group['timeline'] if p['day'] <= maxday] for group in groups]
        lineplot(d, x, y, width, height, series, 0, 24 if early else 31, 1, ymax,
                 [0, 6, 12, 18, 24] if early else [0, 7, 14, 21, 28, 31],
                 [1]+list(range(50, ymax+1, 50)), 'Hours left alone' if early else 'Days left alone', 'Snowman level = 1 + victories')
        labels = []
        for group in groups:
            final = next(p for p in reversed(group['timeline']) if p['day'] <= maxday)
            yy = y+(final['meanLevel']-1)/(ymax-1)*height
            labels.append((yy, group, final))
        previous = y-12
        for yy, group, final in sorted(labels, key=lambda item: item[0]):
            placed = max(yy+3, previous+14)
            color = HexColor(group['color'])
            if abs(placed-yy) > 8:
                d.add(Line(x+width, yy, x+width+6, placed, strokeColor=color, strokeWidth=.7))
            digits = 2 if final['meanLevel'] < 2 else 1
            text(d, x+width+8, placed, f"{group['name']} L{final['meanLevel']:.{digits}f}", 9, color)
            previous = placed
        # Level 101 is the working 100-win unlock, but these runs never switch.
        yy = y+100/(ymax-1)*height
        d.add(Line(x, yy, x+width, yy, strokeColor=HexColor('#8396a2'), strokeWidth=.8, strokeDashArray=[4, 3]))
    text(d, 45, 60, 'Solid line: mean of 64 independent seeds per weapon/tier. Shading: 10th–90th percentile outcomes; these are not hard caps.', 11, MUTED)
    text(d, 45, 41, 'Gray line: 100 wins (level 101), the proposed next-tier unlock. All tiers/recipes are supplied independently for this comparison.', 11, MUTED)
    text(d, 45, 22, 'Unlimited Regular, Spicy and Ice only. No spending, training, armor changes or tier switching. S5–S10 and brown/yellow damage remain undefined.', 10, MUTED)
    save(d, 'progress-first-day' if early else 'progress-31-days')


def damage_charts(rates, maxlevel):
    d = frame(1560, 1060, 'Damage output and damage received as each snowman levels',
              'STR 0 | 50 HP | unlimited ammunition | average rates across full-health repeated attempts at the indicated fixed snowman level')
    legend(d, 956)
    for col, row in enumerate(C['snowmen']):
        x, width = 70+col*385, 292
        text(d, x, 916, f"Snowman {row['tier']}", 18, bold=True)
        text(d, x, 895, f"Level 1: {row['hp']} HP / {row['damage']} damage", 10, MUTED)
        for r, (key, title, ymax, step) in enumerate([
            ('hp_dealt_per_minute', 'Enemy HP damage / minute', 360, 90),
            ('hp_lost_per_minute', 'Player HP lost / minute', 120, 30),
        ]):
            y = 545 if r == 0 else 155
            series = [[(p['level'], p[key]) for p in rates if p['tier'] == row['tier'] and p['weapon'] == w['id']] for w in WEAPONS]
            if r == 1:
                ymax = math.ceil(max(p['hp_lost_per_minute'] for p in rates)/30)*30
            lineplot(d, x, y, width, 275, series, 1, maxlevel, 0, ymax,
                     [1]+list(range(50, maxlevel+1, 50)), list(range(0, ymax+1, step)), 'Snowman level (1 + wins)', title)
    text(d, 45, 73, 'Both rows exclude overkill. Damage dealt during a lost attempt is erased by the full-health retry; dealing damage does not guarantee progress.', 11, MUTED)
    text(d, 45, 52, 'Curves overlap where weapons produce the same incoming rate. Rates hold the level fixed; the progress graphs simulate increasing difficulty.', 11, MUTED)
    text(d, 45, 31, 'Analytic retry/attack-phase model, 70% hit rates. Enemy damage rises by 1 per 25 wins; rising HP requirements make victories increasingly rare.', 11, MUTED)
    save(d, 'damage-by-snowman-level')


def damage_over_time():
    d = frame(1440, 1030, 'How much HP do you lose while leaving each weapon running?',
              'STR 0 | 50 HP | unlimited ammunition | actual cumulative HP lost across victories and defeats; 31 elapsed days')
    legend(d, 926)
    ymax = math.ceil(max(s['meanHpLost'] for s in DATA['summary'])/500000)*500000
    for index, row in enumerate(C['snowmen']):
        col, r = index % 2, index // 2
        x, y, width, height = 75+col*715, 515-r*398, 525, 275
        text(d, x, y+height+45, f"Snowman {row['tier']}", 18, bold=True)
        groups = [next(s for s in DATA['summary'] if s['tier'] == row['tier'] and s['weapon'] == w['id']) for w in WEAPONS]
        series = [[(p['day'], p['meanHpLost']/1000) for p in g['timeline']] for g in groups]
        lineplot(d, x, y, width, height, series, 0, 31, 0, ymax/1000, [0, 7, 14, 21, 28, 31],
                 list(range(0, int(ymax/1000)+1, 500)), 'Days left alone', 'Cumulative player HP lost (thousands)')
        # Keep similar endpoint labels in a compact key under the panel title.
        for i, g in enumerate(groups):
            text(d, x+i*180, y+height+24, f"{g['name']}: {g['meanHpLost']/1000:.1f}k HP", 10, HexColor(g['color']))
    text(d, 45, 65, 'Mean of 64 seeded runs per weapon/tier. Every battle begins at full HP; cumulative damage can exceed the 50 HP held at one time.', 11, MUTED)
    text(d, 45, 44, 'Advancing to harder levels increases incoming damage. Read this alongside the progression figure when comparing weapons.', 11, MUTED)
    text(d, 45, 23, 'Unlimited supply isolates weapon strength. These graphs do not price ammunition or represent production-funded progression.', 11, MUTED)
    save(d, 'hp-lost-over-time')


def main():
    maxlevel = max(250, math.ceil(max(s['p90Level'] for s in DATA['summary'])/50)*50)
    rates = []
    for row in C['snowmen']:
        for weapon in WEAPONS:
            for level in range(1, maxlevel+1):
                rates.append(fixed_level(row, level, weapon))
    (OUT / 'analytic-rates.json').write_text(json.dumps(rates, indent=2)+'\n', encoding='utf-8')
    with (OUT / 'analytic-rates.csv').open('w', newline='', encoding='utf-8') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rates[0]))
        writer.writeheader(); writer.writerows(rates)
    with (OUT / 'level-summary.csv').open('w', newline='', encoding='utf-8') as stream:
        fields = ['tier', 'name', 'meanLevel', 'p10Level', 'p90Level', 'meanLosses', 'meanHpLost', 'meanDamageDealt', 'meanRawDamageDealt', 'meanCombatSweat']
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader(); writer.writerows({k: s[k] for k in fields} for s in DATA['summary'])
    progression(); progression(early=True); damage_charts(rates, maxlevel); damage_over_time()
    print(json.dumps({'figures': 4, 'fixedLevelAnalyticRows': len(rates), 'maxLevel': maxlevel}))


if __name__ == '__main__':
    main()
