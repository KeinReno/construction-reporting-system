"""Build only explicit sanitized fixtures and schematic images; never read customer files."""
import json,shutil
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
def prepare():
    out=ROOT/'demo/generated';out.mkdir(parents=True,exist_ok=True)
    raw=(ROOT/'demo/reports.json').read_bytes();(out/'reports.json').write_bytes(raw)
    for i,_ in enumerate(json.loads(raw)['reports']):
        im=Image.new('RGB',(800,460),'#eef3f7');d=ImageDraw.Draw(im)
        d.rectangle((30,30,770,430),outline='#becbd5',width=3)
        for x in range(110,700,125):
            d.line((x,125,x,330),fill='#59717e',width=15)
        d.line((110,145,610,145),fill='#d79b39',width=18);d.line((110,305,610,305),fill='#59717e',width=15)
        d.text((50,50),'DEMO / SCHEMATIC / NOT A SITE PHOTO',fill='#1b3442',font=ImageFont.load_default(size=24))
        d.text((50,375),f'Report {i+1} / illustrative construction frame',fill='#1b3442',font=ImageFont.load_default(size=20))
        im.save(out/f'report-{i+1}.png')
    target=ROOT/'android/app/src/demo/assets/demo';target.mkdir(parents=True,exist_ok=True)
    for p in out.iterdir():shutil.copy2(p,target/p.name)
    return out
if __name__=='__main__':prepare()
