#!/usr/bin/env python3
from pathlib import Path
import hashlib, shutil, subprocess, tempfile

ROOT=Path(__file__).resolve().parents[1]
GEN=ROOT/'generate.py'; SPEC=ROOT/'house.yaml'
# GLB is excluded from byte-for-byte requirement because third-party GLB exporters may
# change metadata/order between library versions. OBJ is the canonical deterministic 3D geometry.
DETERMINISTIC=[
    'normalized_model.json','A1.1_first_floor.svg','A1.2_second_floor.svg',
    'farmhouse.dxf','farmhouse_mass_model.obj','room_schedule.csv',
    'opening_schedule.csv','validation_report.txt'
]
def h(p): return hashlib.sha256(p.read_bytes()).hexdigest()
with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
    for target in [a,b]:
        subprocess.run(['python',str(GEN),'--spec',str(SPEC),'--out',target],check=True,capture_output=True,text=True)
    bad=[]
    for name in DETERMINISTIC:
        ha,hb=h(Path(a)/name),h(Path(b)/name)
        if ha!=hb: bad.append((name,ha,hb))
    if bad:
        raise SystemExit('NON-DETERMINISTIC OUTPUTS: '+repr(bad))
    print('PASS: deterministic outputs reproduced byte-for-byte twice')
    for name in DETERMINISTIC:
        print(name,h(Path(a)/name))
