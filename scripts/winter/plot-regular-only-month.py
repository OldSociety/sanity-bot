import json
import sys
from pathlib import Path
from reportlab.graphics.shapes import Drawing, Rect, Line, Polygon, String
from reportlab.graphics import renderSVG, renderPDF
from reportlab.lib.colors import HexColor

root = Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).resolve().parents[2]/'artifacts/winter-regular-only-month-2026-10-30'
data = json.loads((root/'summary.json').read_text())
colors = ['#7c3aed','#2563eb','#059669','#db6b1b','#be185d']
d=Drawing(1160,790)
d.add(Rect(0,0,1160,790,fillColor=HexColor('#ffffff'),strokeColor=None))
def text(x,y,t,size=11,color='#203047',bold=False):
    d.add(String(x,y,t,fontSize=size,fontName='Helvetica-Bold' if bold else 'Helvetica',fillColor=HexColor(color)))
text(45,751,'Regular snowballs + Strength: a full 31-day comparison',24,bold=True)
text(45,726,'32 seeds per policy | passive Sweat ON | Stone/STR3 start | 50 HP, except the coat sensitivity',12)
for i,g in enumerate(data['groups']):
    y=695-(i//3)*23; x=45+(i%3)*367
    d.add(Line(x,y,x+25,y,strokeColor=HexColor(colors[i]),strokeWidth=3))
    text(x+33,y-4,g['name'],11)
def panel(x,y,w,h,key,maxy,ticks,title):
    text(x,y+h+23,title,16,bold=True)
    for v,label in ticks:
        yy=y+h*v/maxy
        d.add(Line(x,yy,x+w,yy,strokeColor=HexColor('#e1e7ef'),strokeWidth=1))
        text(x-48,yy-4,label,10)
    for day in [0,5,10,15,20,25,31]:
        xx=x+w*day/31
        d.add(Line(xx,y,xx,y+h,strokeColor=HexColor('#f0f3f7'),strokeWidth=.6))
        text(xx-6,y-19,str(day),10)
    text(x+w/2-20,y-40,'Days',11)
    for i,g in enumerate(data['groups']):
        pts=[]
        for day in g['daily']: pts.extend([x+w*day['day']/31,y+h*day[key]['p10']/maxy])
        for day in reversed(g['daily']): pts.extend([x+w*day['day']/31,y+h*day[key]['p90']/maxy])
        c=HexColor(colors[i]);c.alpha=.10
        d.add(Polygon(pts,fillColor=c,strokeColor=None))
        rows=g['daily']
        for a,b in zip(rows,rows[1:]):
            d.add(Line(x+w*a['day']/31,y+h*a[key]['median']/maxy,x+w*b['day']/31,y+h*b[key]['median']/maxy,strokeColor=HexColor(colors[i]),strokeWidth=2.6))
panel(95,388,1005,230,'stage',315,[(0,'S1 start'),(100,'S2 start'),(200,'S3 start'),(300,'S4 wall')],'Snowman progression (median; shaded 10th-90th percentile)')
panel(95,103,1005,200,'strength',105,[(0,'0'),(25,'25'),(50,'50'),(75,'75'),(100,'100')],'Strength progression')
text(45,39,'S4 is immune to regulars. The automated ceiling refreshes Throw after every defeat and trains immediately; it is not human play.',10)
text(45,22,'Tutorial/Gym preparation excluded. S3/S4 are design-only forecasts; live development currently ends at the S3 purchase.',10)
renderSVG.drawToFile(d,str(root/'regular-only-month.svg'))
renderPDF.drawToFile(d,str(root/'regular-only-month.pdf'))
try:
    import fitz
    doc=fitz.open(root/'regular-only-month.pdf')
    doc[0].get_pixmap(matrix=fitz.Matrix(1.5,1.5)).save(root/'regular-only-month.png')
except ImportError:
    pass
