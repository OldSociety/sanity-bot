import json
from pathlib import Path
import sys
from reportlab.graphics.shapes import Drawing, Rect, Line, String
from reportlab.graphics import renderSVG, renderPDF
from reportlab.lib.colors import HexColor

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / 'artifacts/winter-first-defeat-2026-10-29'
data = json.loads((root/'summary.json').read_text(encoding='utf-8'))
d = Drawing(1380, 930)
d.add(Rect(0, 0, 1380, 930, fillColor=HexColor('#ffffff'), strokeColor=None))


def text(x, y, label, size=12, color='#21384a', bold=False, anchor='start'):
    d.add(String(x, y, label, fontName='Helvetica-Bold' if bold else 'Helvetica', fontSize=size,
                 fillColor=HexColor(color), textAnchor=anchor))


text(40, 882, 'Stopping at the first defeat cuts progression sharply', 25, bold=True)
text(40, 855, 'STR 0 | 50 HP | unlimited weapons | same snowman throughout | level = 1 + victories', 12, '#586a78')
d.add(Rect(42, 814, 26, 11, fillColor=HexColor('#435c74'), strokeColor=None))
text(78, 814, 'Stop permanently after first defeat', 11)
d.add(Rect(410, 814, 26, 11, fillColor=HexColor('#e3e9ee'), strokeColor=HexColor('#9caebc')))
text(446, 814, 'Continue retrying for 31 days', 11)

for tier in range(1, 5):
    col, row = (tier-1) % 2, (tier-1)//2
    left, bottom = 45+col*690, 451-row*345
    plotx, width, scale = left+80, 420, 200
    text(left, bottom+275, f'Snowman {tier}', 18, bold=True)
    for tick in (1, 50, 100, 150, 200):
        x = plotx+(tick-1)/199*width
        d.add(Line(x, bottom+48, x, bottom+246, strokeColor=HexColor('#e2e9ee'), strokeWidth=.7))
        text(x, bottom+30, str(tick), 9, '#687c89', anchor='middle')
    for i, weapon in enumerate(data['weapons']):
        s = next(s for s in data['summary'] if s['tier'] == tier and s['weapon'] == weapon['id'])
        y = bottom+210-i*65
        color = weapon['color']
        text(left, y+4, weapon['name'], 12, color, bold=True)
        before = (s['meanLevel']-1)/199*width
        after = (s['continuous31DayMeanLevel']-1)/199*width
        d.add(Rect(plotx, y-10, max(after, 1.5), 28, fillColor=HexColor('#e3e9ee'), strokeColor=None))
        d.add(Rect(plotx, y-3, max(before, 1.5), 14, fillColor=HexColor(color), strokeColor=None))
        def f(v):
            return f'{v:.2f}' if v < 2 else f'{v:.1f}'
        text(plotx+max(after, before)+8, y+3, f"{f(s['meanLevel'])} / {f(s['continuous31DayMeanLevel'])}", 10, color)
    text(plotx+width/2, bottom+7, 'Mean snowman level reached', 10, '#586a78', anchor='middle')

text(40, 65, 'Labels: first-defeat level / 31-day retry level. First-defeat means use 4,096 seeds per case; retry means use the previous 64-seed study.', 10, '#586a78')
text(40, 44, 'All first defeats occurred within the 31-day horizon. A first defeat is a failed level, not a mathematical limit on later victories.', 10, '#586a78')
text(40, 23, 'After stopping, the player remains idle for the rest of the period: no further attacks, ammunition use, combat Sweat or incoming damage.', 10, '#586a78')
renderSVG.drawToFile(d, str(root/'first-defeat-vs-retries.svg'))
renderPDF.drawToFile(d, str(root/'first-defeat-vs-retries.pdf'))
print(root/'first-defeat-vs-retries.svg')
