#!/usr/bin/env python3
from __future__ import annotations
import argparse, csv, hashlib, json, math, os, re, shutil
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from xml.sax.saxutils import escape

import yaml

TICKS_PER_INCH = 8
INCHES_PER_FOOT = 12
TICKS_PER_FOOT = TICKS_PER_INCH * INCHES_PER_FOOT


def parse_len(value) -> int:
    """Parse architectural length into integer 1/8-inch ticks."""
    if isinstance(value, (int, float)):
        return int(round(float(value) * TICKS_PER_INCH))
    s = str(value).strip().replace("−", "-")
    sign = -1 if s.startswith("-") else 1
    if sign < 0:
        s = s[1:].strip()
    feet = 0
    inches = Fraction(0)
    m = re.search(r"(\d+)\s*'", s)
    if m:
        feet = int(m.group(1))
        s = (s[:m.start()] + s[m.end():]).strip()
    s = s.replace('"', '').strip()
    if s:
        parts = s.split()
        if len(parts) == 1:
            inches = Fraction(parts[0])
        elif len(parts) == 2:
            inches = Fraction(parts[0]) + Fraction(parts[1])
        else:
            raise ValueError(f"Cannot parse length: {value}")
    total_inches = Fraction(feet * 12) + inches
    ticks = total_inches * TICKS_PER_INCH
    if ticks.denominator != 1:
        raise ValueError(f"Length {value!r} is finer than 1/8 inch")
    return sign * ticks.numerator


def ticks_to_inches(t: int) -> float:
    return t / TICKS_PER_INCH


def ticks_to_ft(t: int) -> float:
    return t / TICKS_PER_FOOT


def fmt_len(t: int) -> str:
    sign = "-" if t < 0 else ""
    t = abs(t)
    whole_inches, rem_ticks = divmod(t, TICKS_PER_INCH)
    feet, inches = divmod(whole_inches, 12)
    frac = ""
    if rem_ticks:
        frac = f" {Fraction(rem_ticks, TICKS_PER_INCH)}"
    if feet:
        return f"{sign}{feet}'-{inches}{frac}\""
    return f"{sign}{inches}{frac}\""


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def normalize_model(raw: dict) -> dict:
    out = json.loads(json.dumps(raw))
    length_keys = {"x1","y1","x2","y2","elevation","height","offset","width","sill"}
    for section in ["footprints"]:
        for _, obj in out[section].items():
            for k in list(obj):
                if k in length_keys:
                    obj[k] = parse_len(obj[k])
    for story in out["stories"]:
        story["elevation"] = parse_len(story["elevation"])
        story["height"] = parse_len(story["height"])
    for section in ["rooms", "walls", "openings"]:
        for obj in out[section]:
            for k in list(obj):
                if k in length_keys:
                    obj[k] = parse_len(obj[k])
    out["standards_ticks"] = {k: parse_len(v) for k,v in out["standards"].items()}
    return out


def wall_length(w: dict) -> int:
    return abs(w["x2"]-w["x1"]) + abs(w["y2"]-w["y1"])


def point_on_wall(w: dict, offset: int) -> tuple[int,int]:
    if w["x1"] == w["x2"]:
        direction = 1 if w["y2"] >= w["y1"] else -1
        return w["x1"], w["y1"] + direction * offset
    direction = 1 if w["x2"] >= w["x1"] else -1
    return w["x1"] + direction * offset, w["y1"]


def room_overlap(a,b) -> int:
    x1=max(a["x1"],b["x1"]); y1=max(a["y1"],b["y1"])
    x2=min(a["x2"],b["x2"]); y2=min(a["y2"],b["y2"])
    return max(0,x2-x1)*max(0,y2-y1)


def validate(m: dict) -> list[tuple[str,str]]:
    checks=[]
    errors=[]
    def ok(name): checks.append(("PASS",name))
    def fail(name): checks.append(("FAIL",name)); errors.append(name)

    # IDs
    for sec in ["rooms","walls","openings"]:
        ids=[x["id"] for x in m[sec]]
        (ok if len(ids)==len(set(ids)) else fail)(f"Unique IDs in {sec}")

    # Axis aligned walls and positive room rectangles
    bad_w=[w["id"] for w in m["walls"] if not ((w["x1"]==w["x2"]) ^ (w["y1"]==w["y2"]))]
    (ok if not bad_w else fail)("All walls are nonzero, axis-aligned segments" + ("" if not bad_w else f": {bad_w}"))
    bad_r=[r["id"] for r in m["rooms"] if r["x2"]<=r["x1"] or r["y2"]<=r["y1"]]
    (ok if not bad_r else fail)("All room rectangles have positive area" + ("" if not bad_r else f": {bad_r}"))

    # Room overlaps by story
    overlaps=[]
    for story in [s["id"] for s in m["stories"]]:
        rs=[r for r in m["rooms"] if r["story"]==story]
        for i,a in enumerate(rs):
            for b in rs[i+1:]:
                area=room_overlap(a,b)
                if area>0:
                    overlaps.append((a["id"],b["id"],area))
    (ok if not overlaps else fail)("No positive-area room rectangle overlaps" + ("" if not overlaps else f": {overlaps}"))

    # Room containment
    footprints={"F1":m["footprints"]["first_floor_main"],"F2":m["footprints"]["second_floor"]}
    outside=[]
    for r in m["rooms"]:
        fp=footprints[r["story"]]
        if not (r["x1"]>=fp["x1"] and r["y1"]>=fp["y1"] and r["x2"]<=fp["x2"] and r["y2"]<=fp["y2"]):
            outside.append(r["id"])
    (ok if not outside else fail)("All conditioned room rectangles are within their story footprints" + ("" if not outside else f": {outside}"))

    # Program counts
    bedroom_count=sum(r["type"]=="bedroom" for r in m["rooms"])
    bath_count=sum(r["type"]=="bathroom" for r in m["rooms"])
    theater_count=sum(r["type"]=="theater" for r in m["rooms"])
    (ok if bedroom_count==4 else fail)(f"Program contains exactly 4 bedrooms (found {bedroom_count})")
    (ok if bath_count==4 else fail)(f"Program contains exactly 4 full-bath rooms (found {bath_count})")
    (ok if theater_count==1 else fail)(f"Program contains exactly 1 theater (found {theater_count})")

    # Openings and overlap on hosts
    walls={w["id"]:w for w in m["walls"]}
    invalid=[]
    for o in m["openings"]:
        w=walls.get(o["host"])
        if not w or w["story"]!=o["story"]:
            invalid.append((o["id"],"missing/wrong-story host")); continue
        if o["offset"]<0 or o["width"]<=0 or o["offset"]+o["width"]>wall_length(w):
            invalid.append((o["id"],"outside host wall"))
        sill=o.get("sill",0)
        sh=next(s["height"] for s in m["stories"] if s["id"]==o["story"])
        if sill<0 or o["height"]<=0 or sill+o["height"]>sh:
            invalid.append((o["id"],"vertical opening exceeds wall"))
    (ok if not invalid else fail)("All openings fit their host walls and story heights" + ("" if not invalid else f": {invalid}"))

    overlap_open=[]
    by_host={}
    for o in m["openings"]: by_host.setdefault(o["host"],[]).append(o)
    for host, ops in by_host.items():
        ops=sorted(ops,key=lambda o:o["offset"])
        for a,b in zip(ops,ops[1:]):
            if a["offset"]+a["width"]>b["offset"]:
                overlap_open.append((host,a["id"],b["id"]))
    (ok if not overlap_open else fail)("No openings overlap on the same wall" + ("" if not overlap_open else f": {overlap_open}"))

    # Upper footprint inside main footprint
    f1=m["footprints"]["first_floor_main"]; f2=m["footprints"]["second_floor"]
    upper_inside=f2["x1"]>=f1["x1"] and f2["y1"]>=f1["y1"] and f2["x2"]<=f1["x2"] and f2["y2"]<=f1["y2"]
    (ok if upper_inside else fail)("Second-floor footprint is fully supported within main first-floor footprint")

    # Stair alignment: overlap percentage between F1 Stair and F2 Stair/Landing
    s1=next(r for r in m["rooms"] if r["story"]=="F1" and r["type"]=="stair")
    s2=next(r for r in m["rooms"] if r["story"]=="F2" and r["type"]=="stair")
    stair_overlap=room_overlap(s1,s2)
    s2_area=(s2["x2"]-s2["x1"])*(s2["y2"]-s2["y1"])
    (ok if stair_overlap==s2_area else fail)("Second-floor stair/landing footprint is vertically aligned inside first-floor stair core")

    # Semantic circulation graph reachability
    edges=m.get("circulation_graph",{}).get("edges",[])
    graph={}
    for a,b in edges:
        graph.setdefault(a,set()).add(b); graph.setdefault(b,set()).add(a)
    def reachable(src,dst):
        seen={src}; stack=[src]
        while stack:
            n=stack.pop()
            if n==dst: return True
            for q in graph.get(n,[]):
                if q not in seen: seen.add(q); stack.append(q)
        return False
    targets=["Living","Dining","Kitchen","Bedroom 2","Primary Bedroom","Bedroom 3","Bedroom 4","Bath 3","Bath 4"]
    front_ok=all(reachable("Exterior Front",t) for t in targets)
    garage_ok=all(reachable("Garage",t) for t in ["Kitchen","Living","Primary Bedroom"])
    (ok if front_ok else fail)("Circulation graph connects front entry to all principal rooms")
    (ok if garage_ok else fail)("Circulation graph connects garage to kitchen/living/primary suite")

    # Shared garage wall sanity: no windows below garage north limit on W102
    garage=m["footprints"]["garage"]
    bad_shared=[]
    for o in m["openings"]:
        if o["host"]=="W102" and o["type"]=="window":
            _,y0=point_on_wall(walls["W102"],o["offset"])
            _,y1=point_on_wall(walls["W102"],o["offset"]+o["width"])
            if min(y0,y1)<garage["y2"]:
                bad_shared.append(o["id"])
    (ok if not bad_shared else fail)("No windows open from the house into the attached garage zone" + ("" if not bad_shared else f": {bad_shared}"))

    if errors:
        raise ValueError("Validation failed:\n - " + "\n - ".join(errors))
    return checks


def svg_plan(m:dict, story_id:str, path:Path):
    # Sheet coordinates in pixels; geometry exact in tick space, converted only for presentation.
    fp = m["footprints"]["first_floor_main" if story_id=="F1" else "second_floor"]
    if story_id=="F1":
        maxx=m["footprints"]["garage"]["x2"]; minx=min(fp["x1"],m["footprints"]["front_porch"]["x1"])
        miny=m["footprints"]["front_porch"]["y1"]; maxy=m["footprints"]["rear_porch"]["y2"]
    else:
        minx,maxx,miny,maxy=fp["x1"],fp["x2"],fp["y1"],fp["y2"]
    scale=0.95 # px per tick = 7.6 px/in = 91.2 px/ft; large vector viewBox
    margin=170
    geom_w=(maxx-minx)*scale; geom_h=(maxy-miny)*scale
    width=int(geom_w+2*margin+500); height=int(geom_h+2*margin+170)
    def XY(x,y): return margin+(x-minx)*scale, margin+(maxy-y)*scale+100
    ext_t=m["standards_ticks"]["exterior_wall_thickness"]*scale
    int_t=m["standards_ticks"]["interior_wall_thickness"]*scale

    walls=[w for w in m["walls"] if w["story"]==story_id]
    ops=[o for o in m["openings"] if o["story"]==story_id]
    rooms=[r for r in m["rooms"] if r["story"]==story_id]
    op_by_host={}
    for o in ops: op_by_host.setdefault(o["host"],[]).append(o)

    s=[]
    s.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">')
    s.append('<rect width="100%" height="100%" fill="white"/>')
    s.append('<style>text{font-family:Arial,Helvetica,sans-serif;fill:#111}.room{font-size:20px;font-weight:700}.dim{font-size:15px}.small{font-size:13px}.title{font-size:34px;font-weight:700}.subtitle{font-size:18px}</style>')
    s.append(f'<text x="60" y="58" class="title">{escape(m["project"]["name"])} — {"First" if story_id=="F1" else "Second"} Floor</text>')
    s.append(f'<text x="60" y="90" class="subtitle">Geometry v{escape(m["project"]["geometry_version"])} | source: house.yaml | integer resolution: 1/8 inch</text>')

    # Porches on F1
    if story_id=="F1":
        for name in ["front_porch","rear_porch"]:
            q=m["footprints"][name]; x1,y2=XY(q["x1"],q["y1"]); x2,y1=XY(q["x2"],q["y2"])
            s.append(f'<rect x="{x1:.3f}" y="{y1:.3f}" width="{x2-x1:.3f}" height="{y2-y1:.3f}" fill="#f6f6f6" stroke="#777" stroke-width="2"/>')
            cx=(x1+x2)/2; cy=(y1+y2)/2
            s.append(f'<text x="{cx:.3f}" y="{cy:.3f}" text-anchor="middle" class="small">{name.replace("_"," ").upper()}</text>')

    # walls
    wallmap={w["id"]:w for w in walls}
    for w in walls:
        x1,y1=XY(w["x1"],w["y1"]); x2,y2=XY(w["x2"],w["y2"])
        sw=ext_t if w["kind"]=="exterior" else int_t
        s.append(f'<line x1="{x1:.3f}" y1="{y1:.3f}" x2="{x2:.3f}" y2="{y2:.3f}" stroke="#111" stroke-width="{sw:.3f}" stroke-linecap="butt"/>')

    # openings erase wall then add symbols
    for o in ops:
        w=wallmap.get(o["host"])
        if not w: continue
        p1=point_on_wall(w,o["offset"]); p2=point_on_wall(w,o["offset"]+o["width"])
        x1,y1=XY(*p1); x2,y2=XY(*p2)
        sw=(ext_t if w["kind"]=="exterior" else int_t)+3
        s.append(f'<line x1="{x1:.3f}" y1="{y1:.3f}" x2="{x2:.3f}" y2="{y2:.3f}" stroke="white" stroke-width="{sw:.3f}"/>')
        if o["type"] in ("window","slider"):
            s.append(f'<line x1="{x1:.3f}" y1="{y1:.3f}" x2="{x2:.3f}" y2="{y2:.3f}" stroke="#245" stroke-width="3"/>')
            if w["x1"]==w["x2"]:
                s.append(f'<line x1="{x1-5:.3f}" y1="{y1:.3f}" x2="{x2-5:.3f}" y2="{y2:.3f}" stroke="#245" stroke-width="1.5"/>')
            else:
                s.append(f'<line x1="{x1:.3f}" y1="{y1-5:.3f}" x2="{x2:.3f}" y2="{y2-5:.3f}" stroke="#245" stroke-width="1.5"/>')
        else:
            # deterministic door leaf; swing is diagrammatic only, geometry is opening span.
            if w["x1"]==w["x2"]:
                leaf=o["width"]*scale
                s.append(f'<line x1="{x1:.3f}" y1="{y1:.3f}" x2="{x1+leaf:.3f}" y2="{y1:.3f}" stroke="#333" stroke-width="2"/>')
            else:
                leaf=o["width"]*scale
                s.append(f'<line x1="{x1:.3f}" y1="{y1:.3f}" x2="{x1:.3f}" y2="{y1-leaf:.3f}" stroke="#333" stroke-width="2"/>')

    # room labels
    for r in rooms:
        cx,cy=XY((r["x1"]+r["x2"])//2,(r["y1"]+r["y2"])//2)
        nominal=f'{fmt_len(r["x2"]-r["x1"])} × {fmt_len(r["y2"]-r["y1"])}'
        s.append(f'<text x="{cx:.3f}" y="{cy-8:.3f}" text-anchor="middle" class="room">{escape(r["name"])}</text>')
        s.append(f'<text x="{cx:.3f}" y="{cy+17:.3f}" text-anchor="middle" class="small">NOMINAL {escape(nominal)}</text>')

    # Overall dimensions
    if story_id=="F1":
        overall_x1=m["footprints"]["first_floor_main"]["x1"]
        overall_x2=m["footprints"]["garage"]["x2"]
        x1,_=XY(overall_x1,miny); x2,_=XY(overall_x2,miny)
        y=height-75
        s.append(f'<line x1="{x1:.3f}" y1="{y}" x2="{x2:.3f}" y2="{y}" stroke="#333" stroke-width="1"/>')
        s.append(f'<text x="{(x1+x2)/2:.3f}" y="{y-10}" text-anchor="middle" class="dim">OVERALL {escape(fmt_len(overall_x2-overall_x1))}</text>')
    else:
        x1,_=XY(fp["x1"],fp["y1"]); x2,_=XY(fp["x2"],fp["y1"]); y=height-75
        s.append(f'<line x1="{x1:.3f}" y1="{y}" x2="{x2:.3f}" y2="{y}" stroke="#333" stroke-width="1"/>')
        s.append(f'<text x="{(x1+x2)/2:.3f}" y="{y-10}" text-anchor="middle" class="dim">UPPER WIDTH {escape(fmt_len(fp["x2"]-fp["x1"]))}</text>')

    # metadata note panel
    nx=width-430; ny=145
    s.append(f'<rect x="{nx}" y="{ny}" width="360" height="250" fill="#fafafa" stroke="#444"/>')
    notes=[
        f'Geometry: {m["project"]["geometry_version"]}',
        f'Coordinate resolution: 1/8 inch',
        f'Exterior wall: {fmt_len(m["standards_ticks"]["exterior_wall_thickness"])}',
        f'Interior wall: {fmt_len(m["standards_ticks"]["interior_wall_thickness"])}',
        'Room sizes shown are nominal grid bounds.',
        'Wall/opening geometry is exact to source ticks.',
        'Not permit/stamped construction documents.'
    ]
    for i,t in enumerate(notes):
        s.append(f'<text x="{nx+18}" y="{ny+34+i*29}" class="small">{escape(t)}</text>')

    s.append('</svg>')
    path.write_text("\n".join(s),encoding="utf-8")


def svg_to_png(svg_path:Path,png_path:Path):
    try:
        import cairosvg
        cairosvg.svg2png(url=str(svg_path),write_to=str(png_path),output_width=2200)
        return True
    except Exception:
        return False


def write_csvs(m:dict,out:Path):
    with (out/"room_schedule.csv").open("w",newline="",encoding="utf-8") as f:
        w=csv.writer(f); w.writerow(["ID","Story","Type","Name","Nominal Width","Nominal Depth","Nominal Area sf"])
        for r in sorted(m["rooms"],key=lambda x:x["id"]):
            dx=r["x2"]-r["x1"]; dy=r["y2"]-r["y1"]
            area=ticks_to_ft(dx)*ticks_to_ft(dy)
            w.writerow([r["id"],r["story"],r["type"],r["name"],fmt_len(dx),fmt_len(dy),f"{area:.2f}"])
    walls={w["id"]:w for w in m["walls"]}
    with (out/"opening_schedule.csv").open("w",newline="",encoding="utf-8") as f:
        w=csv.writer(f); w.writerow(["ID","Story","Type","Name","Host Wall","Offset","Width","Height","Sill"])
        for o in sorted(m["openings"],key=lambda x:x["id"]):
            w.writerow([o["id"],o["story"],o["type"],o["name"],o["host"],fmt_len(o["offset"]),fmt_len(o["width"]),fmt_len(o["height"]),fmt_len(o.get("sill",0))])


def write_dxf(m:dict,path:Path):
    # Minimal deterministic ASCII DXF R12 in inches. No generated handles/timestamps.
    lines=["0","SECTION","2","HEADER","9","$ACADVER","1","AC1009","0","ENDSEC","0","SECTION","2","TABLES","0","ENDSEC","0","SECTION","2","ENTITIES"]
    def add_line(layer,x1,y1,x2,y2):
        vals=["0","LINE","8",layer,"10",f"{ticks_to_inches(x1):.6f}","20",f"{ticks_to_inches(y1):.6f}","30","0.0","11",f"{ticks_to_inches(x2):.6f}","21",f"{ticks_to_inches(y2):.6f}","31","0.0"]
        lines.extend(vals)
    def add_text(layer,x,y,text,height=3.0):
        vals=["0","TEXT","8",layer,"10",f"{ticks_to_inches(x):.6f}","20",f"{ticks_to_inches(y):.6f}","30","0.0","40",f"{height:.3f}","1",text.replace("\n"," ")]
        lines.extend(vals)
    for w in sorted(m["walls"],key=lambda x:x["id"]):
        add_line(f'{w["story"]}_WALL_{w["kind"].upper()}',w["x1"],w["y1"],w["x2"],w["y2"])
    wallmap={w["id"]:w for w in m["walls"]}
    for o in sorted(m["openings"],key=lambda x:x["id"]):
        w=wallmap[o["host"]]; p1=point_on_wall(w,o["offset"]); p2=point_on_wall(w,o["offset"]+o["width"])
        add_line(f'{o["story"]}_{o["type"].upper()}',*p1,*p2)
    for r in sorted(m["rooms"],key=lambda x:x["id"]):
        add_text(f'{r["story"]}_ROOM_TEXT',(r["x1"]+r["x2"])//2,(r["y1"]+r["y2"])//2,r["name"],2.5)
    lines.extend(["0","ENDSEC","0","EOF"])
    path.write_text("\n".join(lines)+"\n",encoding="ascii",errors="replace")


def split_wall_boxes(w:dict, openings:list[dict], story:dict, thickness:int) -> list[tuple[float,float,float,float,float,float,str]]:
    """Return deterministic axis-aligned boxes in inches: cx,cy,cz,dx,dy,dz,id."""
    L=wall_length(w)
    cuts={0,L}
    for o in openings:
        cuts.add(o["offset"]); cuts.add(o["offset"]+o["width"])
    cuts=sorted(cuts)
    boxes=[]
    elev=story["elevation"]; H=story["height"]
    vertical=(w["x1"]==w["x2"])
    # full-height pieces between openings
    for a,b in zip(cuts,cuts[1:]):
        mid=(a+b)//2
        overlapping=[o for o in openings if o["offset"]<=mid<o["offset"]+o["width"]]
        p1=point_on_wall(w,a); p2=point_on_wall(w,b)
        seglen=b-a
        cx=(p1[0]+p2[0])/2; cy=(p1[1]+p2[1])/2
        if not overlapping:
            boxes.append((ticks_to_inches(cx),ticks_to_inches(cy),ticks_to_inches(elev+H/2),
                          ticks_to_inches(thickness if vertical else seglen),ticks_to_inches(seglen if vertical else thickness),ticks_to_inches(H),w["id"]))
        else:
            # There should be at most one due validator.
            o=overlapping[0]; sill=o.get("sill",0); top=sill+o["height"]
            if sill>0:
                boxes.append((ticks_to_inches(cx),ticks_to_inches(cy),ticks_to_inches(elev+sill/2),
                              ticks_to_inches(thickness if vertical else seglen),ticks_to_inches(seglen if vertical else thickness),ticks_to_inches(sill),w["id"]+"_sill"))
            if top<H:
                zh=H-top
                boxes.append((ticks_to_inches(cx),ticks_to_inches(cy),ticks_to_inches(elev+top+zh/2),
                              ticks_to_inches(thickness if vertical else seglen),ticks_to_inches(seglen if vertical else thickness),ticks_to_inches(zh),w["id"]+"_head"))
    return boxes


def write_obj(m:dict,path:Path):
    stories={s["id"]:s for s in m["stories"]}; opby={}
    for o in m["openings"]: opby.setdefault(o["host"],[]).append(o)
    ext=m["standards_ticks"]["exterior_wall_thickness"]; interior=m["standards_ticks"]["interior_wall_thickness"]
    boxes=[]
    for w in sorted(m["walls"],key=lambda x:x["id"]):
        boxes += split_wall_boxes(w,sorted(opby.get(w["id"],[]),key=lambda x:x["offset"]),stories[w["story"]],ext if w["kind"]=="exterior" else interior)
    # Slabs: exact simple mass slabs for F1 main + garage and F2 footprint
    def fpbox(fp,z,depth,name):
        x1,y1,x2,y2=[fp[k] for k in ("x1","y1","x2","y2")]
        return (ticks_to_inches((x1+x2)/2),ticks_to_inches((y1+y2)/2),ticks_to_inches(z+depth/2),ticks_to_inches(x2-x1),ticks_to_inches(y2-y1),ticks_to_inches(depth),name)
    slab_depth=parse_len('12"')
    boxes.append(fpbox(m["footprints"]["first_floor_main"],-slab_depth,slab_depth,"SLAB_F1"))
    boxes.append(fpbox(m["footprints"]["garage"],-slab_depth,slab_depth,"SLAB_GARAGE"))
    f2e=stories["F2"]["elevation"]
    floor_depth=m["standards_ticks"]["floor_system_depth"]
    boxes.append(fpbox(m["footprints"]["second_floor"],f2e-floor_depth,floor_depth,"FLOOR_F2"))

    verts=[]; faces=[]; groups=[]
    def add_box(cx,cy,cz,dx,dy,dz,name):
        base=len(verts)+1
        xs=[cx-dx/2,cx+dx/2]; ys=[cy-dy/2,cy+dy/2]; zs=[cz-dz/2,cz+dz/2]
        vv=[(xs[0],ys[0],zs[0]),(xs[1],ys[0],zs[0]),(xs[1],ys[1],zs[0]),(xs[0],ys[1],zs[0]),
            (xs[0],ys[0],zs[1]),(xs[1],ys[0],zs[1]),(xs[1],ys[1],zs[1]),(xs[0],ys[1],zs[1])]
        verts.extend(vv)
        ff=[(1,2,3,4),(5,8,7,6),(1,5,6,2),(2,6,7,3),(3,7,8,4),(5,1,4,8)]
        groups.append((name,[[base+i-1 for i in f] for f in ff]))
    for b in boxes: add_box(*b)
    out=["# Reproducible farmhouse mass model", "# Units: inches"]
    for v in verts: out.append(f"v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}")
    for name,ff in groups:
        out.append("g "+name)
        for f in ff: out.append("f "+" ".join(map(str,f)))
    path.write_text("\n".join(out)+"\n",encoding="ascii")


def obj_to_glb(obj_path:Path,glb_path:Path) -> bool:
    try:
        import trimesh
        scene=trimesh.load(str(obj_path),force="scene",process=False)
        data=scene.export(file_type="glb")
        glb_path.write_bytes(data)
        return True
    except Exception:
        return False


def make_manifest(out:Path,checks:list[tuple[str,str]],include_glb=True):
    files=[]
    for p in sorted(out.iterdir(),key=lambda q:q.name):
        if p.is_file() and p.name!="manifest.json":
            files.append({"file":p.name,"sha256":sha256(p),"bytes":p.stat().st_size})
    manifest={"geometry_version":"1.0.0","validation":"PASS","checks":checks,"files":files}
    (out/"manifest.json").write_text(json.dumps(manifest,indent=2,sort_keys=True)+"\n",encoding="utf-8")


def generate(spec:Path,out:Path):
    out.mkdir(parents=True,exist_ok=True)
    raw=yaml.safe_load(spec.read_text(encoding="utf-8"))
    m=normalize_model(raw)
    checks=validate(m)
    (out/"normalized_model.json").write_text(json.dumps(m,indent=2,sort_keys=True)+"\n",encoding="utf-8")
    svg_plan(m,"F1",out/"A1.1_first_floor.svg")
    svg_plan(m,"F2",out/"A1.2_second_floor.svg")
    svg_to_png(out/"A1.1_first_floor.svg",out/"A1.1_first_floor.png")
    svg_to_png(out/"A1.2_second_floor.svg",out/"A1.2_second_floor.png")
    write_csvs(m,out)
    write_dxf(m,out/"farmhouse.dxf")
    write_obj(m,out/"farmhouse_mass_model.obj")
    obj_to_glb(out/"farmhouse_mass_model.obj",out/"farmhouse_mass_model.glb")
    with (out/"validation_report.txt").open("w",encoding="utf-8") as f:
        f.write("REPRODUCIBLE FARMHOUSE VALIDATION REPORT\n")
        f.write("Geometry version: "+m["project"]["geometry_version"]+"\n")
        f.write("Source resolution: 1/8 inch integer ticks\n\n")
        for status,name in checks: f.write(f"[{status}] {name}\n")
        f.write("\nRESULT: PASS\n")
        f.write("This validates internal encoded geometry, not jurisdiction-specific building-code or structural compliance.\n")
    make_manifest(out,checks)
    return checks


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--spec",default="house.yaml")
    ap.add_argument("--out",default="output")
    args=ap.parse_args()
    spec=Path(args.spec).resolve(); out=Path(args.out).resolve()
    checks=generate(spec,out)
    print(f"PASS: {len(checks)} validation checks")
    print(f"Generated: {out}")

if __name__=="__main__": main()
