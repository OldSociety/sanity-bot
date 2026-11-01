import json
import math
from pathlib import Path
import sys
from reportlab.graphics.charts.lineplots import LinePlot
from reportlab.graphics.shapes import Drawing, Rect, Line, Polygon, String
from reportlab.graphics import renderSVG, renderPDF
from reportlab.lib.colors import HexColor, Color

ROOT=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).resolve().parents[2]/'artifacts/winter-strength-investment-2026-10-29'
DATA=json.loads((ROOT/'summary.json').read_text(encoding='utf-8'))
POLICIES=DATA['policies']
SHORT={'fixed':'Fixed STR3','daily':'Daily','instant':'Immediate'}


def text(d,x,y,value,size=11,color='#20384a',bold=False,anchor='start'):
    d.add(String(x,y,value,fontName='Helvetica-Bold' if bold else 'Helvetica',fontSize=size,fillColor=HexColor(color),textAnchor=anchor))


def frame(width,height,title,subtitle):
    d=Drawing(width,height)
    d.add(Rect(0,0,width,height,strokeColor=None,fillColor=HexColor('#ffffff')))
    text(d,42,height-43,title,25,bold=True)
    text(d,42,height-68,subtitle,12,'#566c7a')
    for i,p in enumerate(POLICIES):
        x=45+i*350
        d.add(Line(x,height-99,x+30,height-99,strokeColor=HexColor(p['color']),strokeWidth=3))
        text(d,x+40,height-104,p['name'],12)
    return d


def panel(d,x,y,width,height,tier,weapon,passive,key='meanLevel',ymax=200):
    groups=[next(g for g in DATA['summary'] if g['tier']==tier and g['weapon']==weapon and g['passive']==passive and g['policy']==p['id']) for p in POLICIES]
    ymin=3 if key=='meanStrength' else 1
    for group,p in zip(groups,POLICIES):
        if key=='meanLevel':
            points=[(x+t['day']/31*width,y+(t['p10Level']-ymin)/(ymax-ymin)*height) for t in group['timeline']]
            points += [(x+t['day']/31*width,y+(t['p90Level']-ymin)/(ymax-ymin)*height) for t in reversed(group['timeline'])]
            color=HexColor(p['color'])
            d.add(Polygon([v for point in points for v in point],strokeColor=None,fillColor=Color(color.red,color.green,color.blue,alpha=.10)))
    chart=LinePlot()
    chart.x,chart.y,chart.width,chart.height=x,y,width,height
    chart.data=[[(t['day'],t[key]) for t in group['timeline']] for group in groups]
    chart.xValueAxis.valueMin,chart.xValueAxis.valueMax=0,31
    chart.yValueAxis.valueMin,chart.yValueAxis.valueMax=ymin,ymax
    chart.xValueAxis.valueSteps=[0,7,14,21,28,31]
    chart.yValueAxis.valueSteps=[3,25,50,75,100] if key=='meanStrength' else [1]+list(range(50,ymax+1,50))
    for axis in (chart.xValueAxis,chart.yValueAxis):
        axis.labels.fontName='Helvetica';axis.labels.fontSize=9;axis.labels.fillColor=HexColor('#617684')
        axis.strokeColor=HexColor('#a7b8c1');axis.visibleGrid=True;axis.gridStrokeColor=HexColor('#e3eaee');axis.gridStrokeWidth=.5
    for i,p in enumerate(POLICIES):
        chart.lines[i].strokeColor=HexColor(p['color']);chart.lines[i].strokeWidth=2.4
    d.add(chart)
    text(d,x+width/2,y-31,'Days elapsed',10,'#617684',anchor='middle')
    text(d,x,y+height+12,'Player STR' if key=='meanStrength' else 'Snowman level = 1 + victories',10,'#617684')
    labels=[]
    for group,p in zip(groups,POLICIES):
        value=group['timeline'][-1][key]
        yy=y+(value-ymin)/(ymax-ymin)*height
        labels.append((yy,p,value))
    previous=y-13
    for yy,p,value in sorted(labels,key=lambda r:r[0]):
        placed=max(yy+2,previous+14)
        if abs(placed-yy)>7:
            d.add(Line(x+width,yy,x+width+7,placed,strokeColor=HexColor(p['color']),strokeWidth=.7))
        text(d,x+width+9,placed,f"{SHORT[p['id']]} {value:.1f}",9,p['color'])
        previous=placed


def save(d,name):
    renderSVG.drawToFile(d,str(ROOT/f'{name}.svg'))
    renderPDF.drawToFile(d,str(ROOT/f'{name}.pdf'))


def overview(strength=False):
    name='player-strength-over-time' if strength else 'regular-investment-comparison'
    title='When does each policy actually raise player Strength?' if strength else 'Regular snowballs: reinvesting Sweat changes progression'
    d=frame(1600,1630,title,'Free STR3 | 50 HP | 70% accuracy | unlimited Regulars | continuous retries | destination-level training cost | cap STR100')
    for col,passive in enumerate((False,True)):
        text(d,70+col*790,1466,'Passive Sweat: ON' if passive else 'Passive Sweat: OFF',20,bold=True)
    ymax=100 if strength else max(200,math.ceil(max(g['p90Level'] for g in DATA['summary'] if g['weapon']=='regular')/50)*50)
    for row,tier in enumerate((1,2,3,4)):
        y=1160-row*295
        for col,passive in enumerate((False,True)):
            x=70+col*790
            text(d,x,y+246,f'Snowman {tier}',17,bold=True)
            panel(d,x,y,550,210,tier,'regular',passive,'meanStrength' if strength else 'meanLevel',ymax)
    text(d,42,64,'64 seeds per weapon / tier / policy / passive setting. Fixed STR3 banks Sweat; Daily buys at 24h, 48h, ...; Immediate buys when funded.',11,'#566c7a')
    text(d,42,43,'Passive ON: floor(STR/3) through STR25, then floor((25/3) x sqrt(STR/25)) Sweat/hour; fractions retained, purchases prospective.',11,'#566c7a')
    text(d,42,22,'No accuracy, armor or weapon upgrades and no tier switching. Mean curves; progress bands show 10th–90th percentile outcomes.',11,'#566c7a')
    save(d,name)


def by_tier(tier):
    d=frame(1800,1120,f'Snowman {tier}: three investment policies, with and without passive Sweat',
            'Free STR3 | 50 HP | 70% accuracy | unlimited ammunition | continuous retries | no purchases except STR | same target for 31 days')
    for row,passive in enumerate((False,True)):
        y=620-row*465
        text(d,45,y+350,'Passive Sweat: ON' if passive else 'Passive Sweat: OFF',19,bold=True)
        for col,w in enumerate(DATA['weapons']):
            x=65+col*595
            text(d,x,y+318,w['name']+(' (damage scales with STR)' if w['id']=='regular' else f" (fixed {w['base']} damage)"),16,bold=True)
            panel(d,x,y,430,285,tier,w['id'],passive)
    text(d,42,76,'Spicy and Ice lines overlap exactly: spending STR cannot change their fixed damage, so their combat outcomes match for all six variants.',11,'#566c7a')
    text(d,42,54,'Daily purchases use banked Sweat after each full 24h; immediate reinvestment buys as soon as combat or passive income funds the next level.',11,'#566c7a')
    text(d,42,32,'Starting STR3 is free; starting Sweat is zero. STR3 to STR4 costs 4 Sweat. No extra starter Sweat or automatic stat choices are assumed.',11,'#566c7a')
    save(d,f'snowman-{tier}-all-weapons')


overview();overview(strength=True)
for tier in (1,2,3,4):by_tier(tier)
print('Rendered six investment figures')
