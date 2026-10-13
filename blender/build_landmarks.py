"""
Cyber Life landmark builder.

Builds every landmark into the "CyberLife" scene (one collection per org under
"Landmarks"), exports each to public/models/<id>.glb, and lays out a mini-Abuja
overview with collection instances so the whole city can be browsed in Blender.

Run inside Blender (Text Editor or via MCP):
    p = r"<repo>/blender/build_landmarks.py"
    exec(compile(open(p).read(), p, "exec"), {"__file__": p, "__name__": "__main__"})

Conventions
- 1 Blender unit = 1 three.js world unit. A city block is 10.4 x 10.4.
- Z is up. The main facade faces -Y and the side facade faces +X; glTF export
  turns those into +Z / +X, the two faces the isometric city camera sees.
- Each landmark sits on z=0, centred on its block (or its span of blocks).
- To edit a landmark by hand: un-exclude "Landmarks" in the outliner, edit its
  collection, then re-export just that collection (File > Export > glTF,
  "Active Collection") to public/models/<id>.glb. Re-running this script
  rebuilds everything from code and overwrites hand edits.
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.normpath(os.path.join(HERE, "..", "public", "models"))
CELL = 14  # keep in sync with src/orgs.js

# Mirror of src/orgs.js placement, used only for the Blender overview:
# id -> (i, j, span_x, span_y)
LAYOUT = {
    # Central Business District
    "national-mosque": (-4, -1, 2, 2),
    "cbn": (-2, -1, 2, 1),
    "nnpc": (0, -1, 2, 2),
    "nrs": (4, -1, 1, 1),
    "wtc": (2, 0, 2, 1),
    "galaxy-backbone": (2, 1, 2, 1),
    "min-finance": (-4, 1, 1, 1),
    "min-digital": (5, 0, 1, 1),
    # Maitama
    "taj-bank": (-1, -3, 1, 1),
    "atlantic-trust": (-4, -3, 1, 1),
    "maitama-capital": (2, -3, 1, 1),
    "zuma-mutual": (4, -2, 1, 1),
    "naira-pay": (-2, -4, 1, 1),
    "savanna-tel": (1, -4, 1, 1),
    "delta-energy": (4, -4, 1, 1),
    # Garki
    "ship-house": (-1, 3, 3, 1),
}
CITY_GATE_POS = (-9.0, -100.0, 0.0)  # Blender coords of three.js (-9, 0, 100)
ASO_ROCK_POS = (-115.0, 125.0, -0.6)  # Blender coords of three.js (-115, -0.6, -125)


# ---------------------------------------------------------------- materials

def _lin(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0]


def M(hexcol, rough=0.85, emit=None):
    name = "CL_" + hexcol.lstrip("#").lower() + (f"_r{int(rough * 100)}" if rough != 0.85 else "") + ("_glow" if emit else "")
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        p = m.node_tree.nodes["Principled BSDF"]
        p.inputs["Base Color"].default_value = _lin(hexcol)
        p.inputs["Roughness"].default_value = rough
        if emit:
            p.inputs["Emission Color"].default_value = _lin(emit)
            p.inputs["Emission Strength"].default_value = 3.0
    return m


# ---------------------------------------------------------------- text

_FONTS = {}


def _font(bold):
    path = r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf"
    if path not in _FONTS:
        _FONTS[path] = bpy.data.fonts.load(path, check_existing=True) if os.path.exists(path) else None
    return _FONTS[path]


def _text_mesh(body, size, depth, bold):
    cu = bpy.data.curves.new("cl_tmp_text", "FONT")
    cu.body, cu.size, cu.extrude, cu.align_x = body, size, depth, "LEFT"
    f = _font(bold)
    if f:
        cu.font = f
    ob = bpy.data.objects.new("cl_tmp_text", cu)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    xs = [v.co.x for v in me.vertices]
    return me, (max(xs) - min(xs)) if xs else 0.0


def text_width(body, size, bold=True):
    me, w = _text_mesh(body, size, 0.1, bold)
    bpy.data.meshes.remove(me)
    return w


# ---------------------------------------------------------------- builder

class Builder:
    """Accumulates primitives into one bmesh with per-face materials."""

    def __init__(self):
        self.bm = bmesh.new()
        self.mats = []
        self.T = Matrix()  # applied to everything added; set it to build rotated sub-assemblies

    def _paint(self, verts, m):
        if m not in self.mats:
            self.mats.append(m)
        i = self.mats.index(m)
        for f in {f for v in verts for f in v.link_faces}:
            f.material_index = i

    def box(self, sx, sy, sz, x, y, z, m, rz=0.0, rx=0.0):
        """Box whose bottom sits at z."""
        mat = self.T @ Matrix.Translation((x, y, z + sz / 2)) @ Matrix.Rotation(rz, 4, "Z") @ Matrix.Rotation(rx, 4, "X") @ Matrix.Diagonal((sx, sy, sz, 1))
        self._paint(bmesh.ops.create_cube(self.bm, size=1.0, matrix=mat)["verts"], m)

    def cyl(self, r1, r2, h, x, y, z, m, seg=8, rz=0.0, rx=0.0):
        """Cylinder/cone whose base sits at z (before rx tilt)."""
        mat = self.T @ Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, "Z") @ Matrix.Rotation(rx, 4, "X") @ Matrix.Translation((0, 0, h / 2))
        self._paint(bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h, matrix=mat)["verts"], m)

    def beam(self, p0, p1, t, m, t2=None):
        p0, p1 = self.T @ Vector(p0), self.T @ Vector(p1)
        d = p1 - p0
        up = "X" if abs(d.normalized().y) > 0.99 else "Y"
        rot = d.to_track_quat("Z", up).to_matrix().to_4x4()
        mat = Matrix.Translation((p0 + p1) / 2) @ rot @ Matrix.Diagonal((t, t2 or t, d.length, 1))
        self._paint(bmesh.ops.create_cube(self.bm, size=1.0, matrix=mat)["verts"], m)

    def prism(self, pts, h, m, mat=Matrix()):
        """Extrude a CCW polygon (local XY) by h along local Z, then transform."""
        bm = self.bm
        mat = self.T @ mat
        bot = [bm.verts.new(mat @ Vector((px, py, 0))) for px, py in pts]
        top = [bm.verts.new(mat @ Vector((px, py, h))) for px, py in pts]
        n = len(pts)
        bm.faces.new(bot[::-1])
        bm.faces.new(top)
        for i in range(n):
            bm.faces.new((bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i]))
        self._paint(bot + top, m)

    def dome(self, r, x, y, z, m, seg=16):
        vs = bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=seg // 2, radius=r)["verts"]
        bmesh.ops.delete(self.bm, geom=[v for v in vs if v.co.z < -1e-4], context="VERTS")
        vs = [v for v in vs if v.is_valid]
        bmesh.ops.transform(self.bm, matrix=self.T @ Matrix.Translation((x, y, z)), verts=vs)
        self._paint(vs, m)

    def sphere(self, r, x, y, z, m, sx=1.0, sy=1.0, sz=1.0, seg=10):
        mat = self.T @ Matrix.Translation((x, y, z)) @ Matrix.Diagonal((sx, sy, sz, 1))
        self._paint(bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=max(4, seg // 2), radius=r, matrix=mat)["verts"], m)

    def text(self, body, size, x, y, z, m, bold=True, depth=0.12, rz=0.0):
        """Upright extruded text facing -Y, left edge at x, baseline at z."""
        me, w = _text_mesh(body, size, depth, bold)
        me.transform(self.T @ Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, "Z") @ Matrix.Rotation(math.pi / 2, 4, "X"))
        n0 = len(self.bm.verts)
        self.bm.from_mesh(me)
        self.bm.verts.ensure_lookup_table()
        self._paint([self.bm.verts[i] for i in range(n0, len(self.bm.verts))], m)
        bpy.data.meshes.remove(me)
        return w

    def finish(self, name, coll):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(name, me)
        coll.objects.link(ob)
        return ob


# ---------------------------------------------------------------- shared details

def banded_box(b, w, d, h, x, y, z, body, band, step=3.0, grow=0.08, t=0.18):
    b.box(w, d, h, x, y, z, body)
    k = z + step
    while k < z + h - 0.5:
        b.box(w + grow * 2, d + grow * 2, t, x, y, k, band)
        k += step


def flagpole(b, x, y, h, colors, w=1.2):
    b.cyl(0.05, 0.04, h, x, y, 0, M("#e8e8e8"), seg=6)
    for i, c in enumerate(colors):
        b.box(w / len(colors), 0.03, 0.75, x + 0.08 + w / len(colors) * (i + 0.5), y, h - 0.85, M(c))


NIGERIA = ["#008751", "#ffffff", "#008751"]


def star(r, inner=0.42, points=5):
    n = points * 2
    return [
        ((r if i % 2 == 0 else r * inner) * math.cos(math.pi / 2 + i * 2 * math.pi / n),
         (r if i % 2 == 0 else r * inner) * math.sin(math.pi / 2 + i * 2 * math.pi / n))
        for i in range(n)
    ]


def chamfer_rect(w, d, c):
    x, y = w / 2, d / 2
    return [(-x + c, -y), (x - c, -y), (x, -y + c), (x, y - c), (x - c, y), (-x + c, y), (-x, y - c), (-x, -y + c)]


def rounded_rect(w, d, n=28, k=0.6):
    """Superellipse outline (CCW); k < 1 squares it off."""
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        c, s = math.cos(t), math.sin(t)
        pts.append((w / 2 * math.copysign(abs(c) ** k, c), d / 2 * math.copysign(abs(s) ** k, s)))
    return pts


# ---------------------------------------------------------------- vegetation & street furniture

def round_tree(b, x, y, s=1.0, z=0.0, col="#5f8f45"):
    b.cyl(0.18 * s, 0.14 * s, 1.6 * s, x, y, z, M("#7a5c3e"), seg=6)
    b.sphere(1.5 * s, x, y, z + 2.5 * s, M(col), sz=0.85, seg=8)


def palm(b, x, y, h=6.0, z=0.0):
    top = Vector((x + 0.3, y + 0.15, z + h))
    b.beam((x, y, z), top, 0.28, M("#8a7458"))
    for k in range(8):
        a = k * 2 * math.pi / 8 + 0.2
        mid = top + Vector((math.cos(a) * 1.2, math.sin(a) * 1.2, 0.35))
        tip = top + Vector((math.cos(a) * 2.5, math.sin(a) * 2.5, -1.0))
        b.beam(top, mid, 0.55, M("#3f7a3a"), t2=0.1)
        b.beam(mid, tip, 0.45, M("#3f7a3a"), t2=0.08)


def pine(b, x, y, h=7.0, z=0.0):
    """Norfolk Island pine: tiered, very common around Abuja offices."""
    b.cyl(0.16, 0.08, h, x, y, z, M("#6b5038"), seg=5)
    for k in range(5):
        r = 1.5 * (1 - k / 5.5)
        b.cyl(r, 0.1, 0.9, x, y, z + 1.6 + k * (h - 2.2) / 5, M("#2f5d3a"), seg=7)


def cypress(b, x, y, h=6.0, z=0.0):
    b.cyl(0.12, 0.1, 0.8, x, y, z, M("#6b5038"), seg=5)
    b.sphere(0.85, x, y, z + 0.6 + h / 2, M("#3d6b35"), sz=h / 1.7, seg=8)


def agave(b, x, y, z=0.0, s=1.0):
    for k in range(6):
        a = k * math.pi / 3
        b.beam((x, y, z), (x + math.cos(a) * 0.7 * s, y + math.sin(a) * 0.7 * s, z + 0.9 * s), 0.18 * s, M("#4f7a4a"), t2=0.05)


def lattice_mast(b, x, y, z, h, base, top, m, t=0.09, step=1.4):
    def at(k, zz):
        s = (base + (top - base) * zz / h) / 2
        sx, sy = (-1, 1, 1, -1)[k], (-1, -1, 1, 1)[k]
        return (x + sx * s, y + sy * s, z + zz)

    for k in range(4):
        b.beam(at(k, 0), at(k, h), t, m)
    zz, flip = 0.0, False
    while zz + step <= h + 1e-6:
        for k in range(4):
            n = (k + 1) % 4
            b.beam(at(k, zz + step), at(n, zz + step), t * 0.8, m)
            a, c = (k, n) if flip else (n, k)
            b.beam(at(a, zz), at(c, zz + step), t * 0.6, m)
        zz += step
        flip = not flip
    b.cyl(0.06, 0.03, 2.5, x, y, z + h, m, seg=6)


# ---------------------------------------------------------------- real landmarks (from SourceImages)

def taj_bank(coll):
    b = Builder()
    W, D, cx = 8.4, 7.6, 0.6
    fy = -D / 2
    white, perf, dark, core = M("#f3f2ee"), M("#bcc0c5"), M("#34363a"), M("#4a4d52")
    glass, red, mull, black = M("#28303a", 0.3), M("#d71f26"), M("#5d636b"), M("#1c1e21")

    # ground floor + storefront + ATM sign
    b.box(W, D, 3.2, cx, 0, 0, dark)
    b.box(W - 0.8, 0.1, 2.3, cx, fy - 0.05, 0.3, glass)
    b.box(1.8, 0.12, 0.45, cx - 2.2, fy - 0.12, 2.6, white)

    # upper floors: dark core wrapped in a white / perforated checkerboard
    b.box(W, D, 10.0, cx, 0, 3.2, core)
    for side in (-1, 1):
        for col in range(2):
            for row in range(3):
                x, z = cx + side * (1.6 + 0.675 + col * 1.35), 3.25 + row * 3.33
                b.box(1.28, 0.2, 3.22, x, fy - 0.1, z, white)
                if (col + row + (side > 0)) % 2:
                    b.box(1.0, 0.06, 2.8, x, fy - 0.22, z + 0.2, perf)
    sx = cx + W / 2
    for col in range(5):
        for row in range(3):
            y, z = -D / 2 + 0.76 + col * 1.52, 3.25 + row * 3.33
            b.box(0.2, 1.45, 3.22, sx + 0.1, y, z, white)
            if (col + row) % 2:
                b.box(0.06, 1.15, 2.8, sx + 0.22, y, z + 0.2, perf)

    # central dark bay with the red picture frame
    b.box(3.2, 0.4, 10.2, cx, fy - 0.2, 3.2, dark)
    yr = fy - 0.5
    b.box(2.7, 0.22, 0.25, cx, yr, 4.0, red)
    b.box(2.7, 0.22, 0.25, cx, yr, 11.9, red)
    for s in (-1, 1):
        b.box(0.25, 0.22, 8.15, cx + s * 1.225, yr, 4.0, red)
    b.box(2.2, 0.1, 7.9, cx, fy - 0.45, 4.25, glass)
    for s in (-1, 1):
        b.box(0.06, 0.06, 7.9, cx + s * 0.37, fy - 0.52, 4.25, mull)
    for z in (6.2, 8.2, 10.2):
        b.box(2.2, 0.06, 0.06, cx, fy - 0.52, z, mull)

    # recessed glass top floor with the rooftop sign
    b.box(W, D, 0.25, cx, 0, 13.2, dark)
    b.box(W - 0.8, D - 0.8, 2.9, cx, 0.2, 13.2, glass)
    w1, w2 = text_width("TAJ", 1.5, True), text_width("Bank", 1.25, False)
    x0 = cx - (w1 + 0.15 + w2) / 2
    b.text("TAJ", 1.5, x0, fy + 0.3, 13.5, red, bold=True)
    b.text("Bank", 1.25, x0 + w1 + 0.15, fy + 0.3, 13.5, M("#d3d6da"), bold=False)

    # thin floating roof canopy
    b.box(9.8, 8.8, 0.35, cx, 0.1, 16.2, white)
    b.box(9.8, 0.1, 0.55, cx, -4.35, 16.0, white)
    for s in (-1, 1):
        b.box(0.12, 0.12, 3.0, cx + s * 3.9, -3.3, 13.2, dark)

    # glass lift / stair tower on the west side
    lx = cx - W / 2 - 0.8
    b.box(1.6, 2.0, 14.6, lx, -1.4, 0, glass)
    z = 0.0
    while z <= 14.6:
        b.box(1.66, 2.06, 0.14, lx, -1.4, z, black)
        z += 1.8
    for dx in (-0.78, 0.78):
        for dy in (-0.98, 0.98):
            b.box(0.1, 0.1, 14.6, lx + dx, -1.4 + dy, 0, black)

    # flags + pylon sign out front
    flagpole(b, cx + 1.6, fy - 1.0, 7.5, NIGERIA)
    flagpole(b, cx + 2.6, fy - 1.0, 7.5, ["#ffffff"])
    flagpole(b, cx + 3.6, fy - 1.0, 7.5, ["#ffffff"])
    b.box(1.1, 0.3, 3.6, cx - 3.4, fy - 1.0, 0, white, rz=0.2)
    b.box(0.35, 0.32, 3.0, cx - 3.9, fy - 0.9, 0, red, rz=0.2)
    b.box(0.9, 0.34, 0.5, cx - 3.6, fy - 0.95, 3.5, red, rz=0.2)
    b.finish("taj-bank_Building", coll)


def nrs(coll):
    b = Builder()
    glass, band, white, red = M("#4f8fd8", 0.25), M("#e3ebf3"), M("#f4f2ec"), M("#d71920")
    dark, podium, steel = M("#262a30"), M("#2f5d86", 0.3), M("#c3c8cf")
    # Folded "W" front: two wide faceted bays, a protruding centre bay, two notches.
    pts = [(-4.8, -2.4), (-4.2, -3.4), (-2.6, -3.9), (-1.5, -3.0), (-0.75, -3.9), (0.75, -3.9),
           (1.5, -3.0), (2.6, -3.9), (4.2, -3.4), (4.8, -2.4), (4.8, 2.6), (4.2, 3.4), (-4.2, 3.4), (-4.8, 2.6)]
    Z0, H = 6.8, 40.0

    # glass podium with white cantilevered slab
    b.box(9.4, 8.0, Z0, 0, 0.4, 0, podium)
    b.box(10.4, 9.2, 0.45, 0, 0, Z0 - 0.45, white)

    # tower, floor bands, mullions, roof
    b.prism(pts, H, glass, Matrix.Translation((0, 0, Z0)))
    grow = [(x * 1.03, y * 1.04) for x, y in pts]
    z = Z0 + 2.5
    while z < Z0 + H - 0.3:
        b.prism(grow, 0.16, band, Matrix.Translation((0, 0, z)))
        z += 2.5
    b.prism([(x * 1.035, y * 1.045) for x, y in pts], 0.6, band, Matrix.Translation((0, 0, Z0 + H)))
    for x, y in pts[:10]:
        b.box(0.1, 0.1, H, x * 1.01, y * 1.01, Z0, band)

    # full-height red fin with white stars and the NRS mark
    FX, FY = 3.5, -3.9
    b.box(1.8, 1.4, Z0 + H + 2.5, FX, FY, 0, red)
    for z in (14, 22, 30, 38):
        b.prism(star(0.42), 0.08, white, Matrix.Translation((FX, FY - 0.7, z)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    b.box(1.5, 0.1, 0.8, FX, FY - 0.75, Z0 + H + 0.9, white)
    w = text_width("NRS", 0.5)
    b.text("NRS", 0.5, FX - w / 2, FY - 0.82, Z0 + H + 1.05, red)

    # red billboard frames in the two notches
    for x in (-1.5, 1.5):
        b.box(1.3, 0.3, 4.6, x, -3.15, 17.5, red)
        b.box(0.85, 0.05, 3.7, x, -3.33, 17.95, dark)

    # red entrance steps
    b.box(3.6, 1.0, 0.25, -1.2, -4.7, 0, red)
    b.box(3.6, 0.6, 0.5, -1.2, -4.5, 0, red)

    # twin lattice telecom masts
    lattice_mast(b, -1.6, -0.4, Z0 + H + 0.6, 12, 1.6, 0.35, steel)
    lattice_mast(b, 1.4, 0.9, Z0 + H + 0.6, 10, 1.4, 0.3, steel)
    b.finish("nrs_Building", coll)


def galaxy_backbone(coll):
    b = Builder()
    copper, bronze, louvre, silver = M("#c47a52"), M("#4b4039", 0.3), M("#c9ccd0"), M("#b5babf")
    canopy, dark, white, cream = M("#eceef0"), M("#34373b"), M("#f2f1ec"), M("#e7e0cf")
    mull, top_glass = M("#8a817a"), M("#2c3138", 0.3)
    yc, d, w, H = 0.8, 8.0, 9.2, 22.0
    fy = yc - d / 2

    for cx, east in ((-6.7, False), (6.7, True)):
        b.box(w - 0.6, d - 0.6, 3.0, cx, yc, 0, dark)
        b.box(w, d, 0.4, cx, yc, 3.0, white)
        b.box(w - 0.4, d - 0.4, H - 3.4, cx, yc, 3.4, bronze)
        z = 3.4 + 2.7
        while z < H:
            b.box(w - 0.3, d - 0.3, 0.12, cx, yc, z, mull)
            z += 2.7
        # copper picture frame on the front and east faces
        ff, sf = fy - 0.3, cx + w / 2 + 0.3
        for s in (-1, 1):
            b.box(0.8, 0.6, H - 3.4, cx + s * (w / 2 - 0.4), ff, 3.4, copper)
            b.box(0.6, 0.8, H - 3.4, sf, yc + s * (d / 2 - 0.4), 3.4, copper)
        b.box(w, 0.6, 1.0, cx, ff, H - 1.0, copper)
        b.box(w, 0.6, 0.9, cx, ff, 3.4, copper)
        b.box(0.6, d, 1.0, sf, yc, H - 1.0, copper)
        b.box(0.6, d, 0.9, sf, yc, 3.4, copper)
        # silver louvre bands + thin white rods
        for k in range(5):
            z = 5.2 + k * 3.1
            b.box(w - 3.0, 0.5, 1.3, cx, ff - 0.05, z, louvre)
            b.box(0.5, d - 2.8, 1.3, sf + 0.05, yc, z, louvre)
        for k in range(7):
            b.box(0.07, 0.07, H - 5.2, cx - 3.0 + k, ff - 0.45, 4.3, white)
        # recessed top floor under a thin floating canopy, tilted up to the street
        b.box(w - 1.4, d - 1.4, 2.8, cx, yc, H, top_glass)
        for s in (-1, 1):
            b.cyl(0.15, 0.15, 2.8, cx + s * (w / 2 - 1.0), fy + 0.9, H, white)
        b.box(w + 2.6, d + 3.2, 0.45, cx + 0.5, yc - 0.9, H + 2.8, canopy, rx=math.radians(-4))
        if east:
            b.cyl(0.3, 0.3, H + 3.0, cx + w / 2 + 1.2, fy - 1.6, 0, white, seg=10)

    # silver cladding with vertical louvre panel on the west block
    b.box(3.6, 0.8, H - 3.0, -9.5, fy - 0.45, 3.0, silver)
    for k in range(9):
        b.box(0.12, 0.1, 9.0, -10.4 + k * 0.22, fy - 0.9, 8.0, M("#8e949a"))

    # glazed link with the white steel truss
    b.box(4.6, 6.0, H - 2.0, 0, yc + 0.8, 0, top_glass)
    ty, z0, z1 = -1.6, 9.0, 11.2
    b.beam((-2.3, ty, z0), (2.3, ty, z0), 0.2, white)
    b.beam((-2.3, ty, z1), (2.3, ty, z1), 0.2, white)
    for k in range(4):
        x0 = -2.3 + k * 1.15
        if k % 2 == 0:
            b.beam((x0, ty, z0), (x0 + 1.15, ty, z1), 0.14, white)
        else:
            b.beam((x0, ty, z1), (x0 + 1.15, ty, z0), 0.14, white)

    # perimeter fence
    x = -11.8
    while x <= 11.81:
        b.box(0.45, 0.45, 1.5, x, -5.0, 0, cream)
        x += 1.65
    b.box(23.6, 0.08, 0.9, 0, -5.0, 0.3, dark)

    # the big satellite dish out front
    b.cyl(0.25, 0.3, 1.6, 0, -3.9, 0, white, seg=10)
    b.cyl(0.3, 2.0, 0.6, 0, -3.9, 1.7, white, seg=20, rx=math.radians(55))
    b.beam((0, -3.9, 2.0), (0, -5.2, 2.9), 0.08, white)
    b.finish("galaxy-backbone_Building", coll)


def city_gate(coll):
    """Abuja City Gate on the airport expressway, with its plaza, fountain and flag rows."""
    b = Builder()
    white, shade = M("#f4f2ec"), M("#dedad1")
    pave, lawn, cream = M("#d9cdb4"), M("#7fa24f"), M("#ece4d2")
    D = 1.6

    # plaza, lawns, steps
    b.box(26, 24, 0.2, 0, 0, 0, pave)
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.box(7.5, 6.0, 0.24, sx * 8.5, sy * 6.5, 0, lawn)
    for k in range(3):
        b.box(10 - k * 2, 0.5, 0.2 + k * 0.08, 0, -11.75 + k * 0.5, 0, cream)

    def pillar(s, top, fx, fz):
        x_out, x_in = s * 4.5, s * 3.0
        b.box(1.5, D, top, s * 3.75, 0, 0, white)
        b.box(0.9, D * 0.9, 1.0, s * 3.45, 0, top, white)  # stepped cap
        # concave flare sweeping outward to the ground, extruded through the depth
        prof = [(0.0, 0.0), (fx, 0.0)] + [(fx * (1 - t / 10) ** 2, fz * t / 10) for t in range(1, 10)] + [(0.0, fz)]
        b.prism(prof, D, white, Matrix(((s, 0, 0, x_out), (0, 0, 1, -D / 2), (0, 1, 0, 0), (0, 0, 0, 1))))
        # secondary blade on the opening side
        b.prism([(0.0, 0.0), (1.1, 0.0), (0.0, fz * 0.55)], D * 0.7, shade,
                Matrix(((-s, 0, 0, x_in), (0, 0, 1, -D * 0.35), (0, 1, 0, 0), (0, 0, 0, 1))))
        # plinth
        b.box(fx + 2.2, D + 0.6, 0.3, s * (3.0 + (fx + 1.5) / 2), 0, 0.2, shade)

    pillar(-1, 15.0, 5.0, 10.0)
    pillar(1, 19.0, 6.2, 12.5)

    # lintel with "YOU ARE WELCOME" and the coat of arms, front and back
    b.box(6.0, D * 0.9, 2.8, 0, 0, 8.2, white)
    green = M("#1e7a3c")
    w = text_width("YOU ARE WELCOME", 0.42)
    b.text("YOU ARE WELCOME", 0.42, -w / 2, -D * 0.45 - 0.02, 8.55, green)
    b.text("YOU ARE WELCOME", 0.42, w / 2, D * 0.45 + 0.02, 8.55, green, rz=math.pi)
    yf = -D * 0.45 - 0.05
    b.box(1.4, 0.06, 0.16, 0, yf, 9.2, green)                  # grassy base
    b.box(0.55, 0.08, 0.7, 0, yf - 0.02, 9.36, M("#1d1d1d"))   # black shield
    b.beam((-0.18, yf - 0.07, 9.95), (0, yf - 0.07, 9.7), 0.07, white)
    b.beam((0.18, yf - 0.07, 9.95), (0, yf - 0.07, 9.7), 0.07, white)
    b.beam((0, yf - 0.07, 9.7), (0, yf - 0.07, 9.42), 0.07, white)
    for sx in (-1, 1):
        b.box(0.22, 0.06, 0.65, sx * 0.45, yf, 9.36, white)    # supporting horses
    b.box(0.5, 0.06, 0.28, 0, yf, 10.1, M("#c62828"))         # eagle

    # the flag, held between the pillars by cables
    for i, c in enumerate(NIGERIA):
        b.box(0.6, 0.05, 1.3, -0.6 + i * 0.6, 0, 12.4, M(c))
    cable = M("#d0d0d0")
    for (fx_, fz_), (px, pz) in (((-0.9, 13.7), (-3.0, 14.4)), ((-0.9, 12.4), (-3.0, 11.3)),
                                 ((0.9, 13.7), (3.0, 16.6)), ((0.9, 12.4), (3.0, 11.3))):
        b.beam((fx_, 0, fz_), (px, 0, pz), 0.05, cable)

    # fountain behind the gate (city side) and rows of flagpoles
    b.cyl(2.3, 2.3, 0.5, 0, 7.0, 0, cream, seg=20)
    b.cyl(2.0, 2.0, 0.52, 0, 7.0, 0.02, M("#7fc4e0", 0.2), seg=20)
    b.cyl(0.35, 0.05, 6.5, 0, 7.0, 0.5, M("#bfe3f2", 0.2), seg=10)
    flag_cols = [NIGERIA, ["#ffffff", "#1565c0", "#ffffff"], ["#fdd835", "#2e7d32", "#c62828"], ["#1565c0", "#ffffff", "#c62828"]]
    for i, x in enumerate(range(-12, 13, 3)):
        flagpole(b, x, 10.8, 6.5, flag_cols[i % len(flag_cols)], w=0.9)

    # planting
    for x, y in ((-2.4, -6.0), (2.4, -6.0), (-5.5, 3.0), (5.5, 3.0)):
        agave(b, x, y, 0.24)
    for x, y in ((-11.5, -10.5), (11.5, -10.5), (-11.5, 3.0), (11.5, 3.0)):
        round_tree(b, x, y, s=1.1)
    b.finish("city-gate_Monument", coll)


def national_mosque(coll):
    """Abuja National Mosque: golden dome, four minarets, courtyard in front (-Y)."""
    b = Builder()
    sand, sand2, cream, terra = M("#d8c39a"), M("#c9ad80"), M("#f0e4cc"), M("#b5653e")
    tile, gold, green, tan = M("#2c6e73"), M("#e0aa2a", 0.35), M("#3e8f6a"), M("#dcb878")
    pave, pave2, dark = M("#e7c793"), M("#c98a5a"), M("#3a3330")
    FY = -10.2  # front wall line

    # platform + patterned courtyard
    b.box(24, 22, 0.6, 0, 0.8, 0, cream)
    b.box(22.4, 10.0, 0.08, 0, -5.1, 0.6, pave)
    for cx in (-5.5, 5.5):
        b.prism(star(2.0, 0.6, points=8), 0.05, pave2, Matrix.Translation((cx, -2.0, 0.66)))
    for x in (-8.5, 0.0, 8.5):
        b.box(0.6, 10.0, 0.05, x, -5.1, 0.66, pave2)
    b.box(22.4, 0.6, 0.05, 0, -5.1, 0.66, pave2)

    # arcaded perimeter walls with pointed-arch recesses and crenellations
    def arcade(x0, y0, x1, y1):
        L = math.hypot(x1 - x0, y1 - y0)
        b.T = Matrix.Translation((x0, y0, 0.6)) @ Matrix.Rotation(math.atan2(y1 - y0, x1 - x0), 4, "Z")
        b.box(L, 0.8, 2.4, L / 2, 0, 0, cream)
        k = 0.7
        while k < L - 0.4:
            b.box(0.7, 0.1, 1.4, k, -0.42, 0.3, terra)
            b.cyl(0.35, 0.0, 0.5, k, -0.42, 1.7, terra, seg=4, rz=math.pi / 4)
            b.box(0.35, 0.8, 0.45, k + 0.33, 0, 2.4, cream)
            k += 1.3
        b.T = Matrix()

    arcade(-11.6, -0.2, -11.6, FY)
    arcade(11.6, FY, 11.6, -0.2)
    arcade(-11.6, FY, -2.4, FY)
    arcade(2.4, FY, 11.6, FY)

    # front gateway arch + steps
    b.box(4.6, 1.6, 5.4, 0, FY, 0.6, terra)
    b.box(3.0, 0.2, 4.0, 0, FY - 0.85, 0.6, cream)
    b.box(1.8, 0.22, 2.3, 0, FY - 0.9, 0.6, dark)
    b.cyl(0.9, 0.9, 0.22, 0, FY - 0.79, 2.9, dark, seg=14, rx=math.pi / 2)
    for k in range(3):
        b.box(9 - k * 1.6, 0.6, 0.6 - k * 0.2, 0, FY - 1.1 - k * 0.55, 0, cream)

    # main prayer hall
    HH, HY = 9.0, 5.7
    b.box(16, 11, HH, 0, HY, 0.6, sand)
    for x in (-6.6, -4.0, 4.0, 6.6):
        b.box(2.3, 0.5, HH - 0.4, x, 0.15, 0.6, sand2)
    for x in (-5.3, -2.7, 2.7, 5.3):
        b.box(0.35, 0.55, HH - 1.0, x, 0.15, 1.0, tile)
    for y in (1.6, 4.3, 7.0, 9.7):
        b.box(0.5, 2.3, HH - 0.4, 8.15, y, 0.6, sand2)
    for y in (2.95, 5.65, 8.35):
        b.box(0.55, 0.35, HH - 1.0, 8.15, y, 1.0, tile)
    x = -7.6
    while x <= 7.6:
        b.box(0.4, 0.4, 0.5, x, 0.3, 0.6 + HH, cream)
        x += 0.8
    y = 0.6
    while y <= 10.8:
        b.box(0.4, 0.4, 0.5, 7.8, y, 0.6 + HH, cream)
        y += 0.8

    # tiled portal with the green stepped canopy and gold doors
    b.box(4.6, 0.8, HH + 0.8, 0, -0.1, 0.6, terra)
    b.box(4.0, 0.2, HH + 0.3, 0, -0.58, 0.6, tile)
    b.box(3.0, 0.2, HH - 0.6, 0, -0.72, 0.6, cream)
    b.box(1.4, 0.1, 2.4, 0, -0.86, 0.6, gold)
    for k in range(4):
        b.box(2.2 - k * 0.5, 0.35, 0.7, 0, -0.95, 5.4 + k * 0.7, green)

    # drum with gold colonnade, golden dome, finial
    zt = 0.6 + HH
    b.cyl(4.4, 4.4, 1.4, 0, HY, zt, cream, seg=24)
    for k in range(24):
        a = k * 2 * math.pi / 24
        b.cyl(0.12, 0.12, 1.2, 4.5 * math.cos(a), HY + 4.5 * math.sin(a), zt + 0.1, gold, seg=6)
    b.dome(4.4, 0, HY, zt + 1.4, gold, seg=24)
    b.cyl(0.08, 0.05, 1.6, 0, HY, zt + 5.8, gold, seg=6)
    b.cyl(0.55, 0.55, 0.08, 0, HY + 0.04, zt + 7.6, gold, seg=14, rx=math.pi / 2)
    for x, y in ((-6.6, 1.6), (6.6, 1.6), (-6.6, 9.8), (6.6, 9.8)):
        b.cyl(1.0, 1.0, 0.6, x, y, zt, cream, seg=12)
        b.dome(1.0, x, y, zt + 0.6, gold, seg=12)

    # four minarets (front pair taller)
    def minaret(x, y, h):
        b.box(1.9, 1.9, 6.0, x, y, 0.6, sand2)
        b.cyl(0.62, 0.55, h * 0.72, x, y, 6.6, tan, seg=14)
        z1 = 6.6 + h * 0.72
        b.cyl(0.55, 1.0, 0.6, x, y, z1, cream, seg=14)
        b.cyl(1.0, 1.0, 0.35, x, y, z1 + 0.6, cream, seg=14)
        b.cyl(0.48, 0.45, h * 0.12, x, y, z1 + 0.95, tan, seg=14)
        z2 = z1 + 0.95 + h * 0.12
        b.cyl(0.48, 0.75, 0.35, x, y, z2, cream, seg=14)
        b.cyl(0.55, 0.0, 2.2, x, y, z2 + 0.35, cream, seg=14)
        b.cyl(0.05, 0.03, 1.2, x, y, z2 + 2.55, gold, seg=6)

    minaret(-9.2, 0.2, 34)
    minaret(9.2, 0.2, 34)
    minaret(-9.2, 11.2, 29)
    minaret(9.2, 11.2, 29)

    # courtyard trees in planters + garden trees
    for x in (-5.5, 5.5):
        b.box(3.2, 3.2, 0.5, x, -6.0, 0.6, terra)
        round_tree(b, x, -6.0, s=1.6, z=1.1)
    for x, y in ((-11.6, -11.4), (11.6, -11.4), (-11.8, 11.6), (11.8, 11.6)):
        round_tree(b, x, y, s=1.2)
    b.finish("national-mosque_Mosque", coll)


def cbn(coll):
    """Central Bank of Nigeria: concave front of stepped stone piers and dark-blue glass."""
    b = Builder()
    glass, stone, band = M("#2e3f63", 0.3), M("#d9cdb8"), M("#56688f")
    white, steel = M("#f4f2ec"), M("#c3c8cf")
    H, L, Dp, a = 34.0, 10.5, 6.0, math.radians(10)

    for s in (-1, 1):
        b.T = Matrix.Translation((s * 1.5, -1.5, 0)) @ Matrix.Rotation(-s * a, 4, "Z")
        b.box(L, Dp, H, s * L / 2, Dp / 2, 0, glass)
        z = 2.6
        while z < H:
            b.box(L + 0.05, Dp + 0.05, 0.1, s * L / 2, Dp / 2, z, band)
            z += 2.6
        for x in (0.7, 3.6, 6.9, 9.9):
            b.box(1.6, 0.8, H, s * x, -0.3, 0, stone)
            b.box(1.0, 0.6, H - 5, s * x, -0.95, 0, stone)
            b.box(0.5, 0.5, H - 11, s * x, -1.45, 0, stone)
        b.box(0.8, Dp, H + 0.6, s * (L - 0.4), Dp / 2, 0, stone)
        b.box(L, Dp, 0.8, s * L / 2, Dp / 2, H, stone)
        b.T = Matrix()

    # recessed centre bay with the bank's green emblem
    b.box(3.2, 5.5, H - 1, 0, 1.6, 0, glass)
    b.box(1.8, 0.2, 2.4, 0, -1.25, 23.0, M("#1f8a4c"))
    b.box(1.0, 0.22, 1.4, 0, -1.27, 23.5, M("#d4a62a"))
    b.box(0.45, 0.15, 16.0, 0, -1.2, 5.0, M("#2e9c5e"))
    for z in range(6, 21, 3):
        b.box(0.3, 0.17, 0.5, 0, -1.22, z, M("#d4a62a"))

    # roof: plant room, glass pyramid skylight, satellite dishes, mast
    b.box(4.5, 3.5, 4.0, 0, 3.4, H, white)
    b.cyl(2.4, 0.2, 2.0, 0, 0.4, H - 1, M("#7fa7c9", 0.2), seg=4, rz=math.pi / 4)
    for x, y, rz in ((-3.2, 2.0, 0.3), (-4.6, 3.6, -0.4), (3.4, 2.4, 0.5)):
        b.cyl(0.15, 0.2, 0.9, x, y, H + 0.8, white, seg=6)
        b.cyl(0.2, 1.2, 0.45, x, y, H + 1.5, white, seg=14, rz=rz, rx=math.radians(55))
    lattice_mast(b, 1.6, 4.4, H + 4.0, 7.0, 1.0, 0.25, steel)

    # white "sail" sculpture, front trees and flags
    for k in range(4):
        b.prism([(0, 0), (2.6, 0), (0.3, 3.4 - k * 0.4)], 0.15, white,
                Matrix.Translation((7.0 + k * 0.55, -3.6 + k * 0.25, 0)) @ Matrix.Rotation(0.5 - k * 0.15, 4, "Z") @ Matrix.Rotation(math.pi / 2, 4, "X"))
    for x, y in ((-1.8, -3.6), (0.4, -4.2), (2.6, -3.5)):
        round_tree(b, x, y, s=1.3)
    flagpole(b, -4.0, -3.9, 6.0, NIGERIA)
    flagpole(b, -5.4, -3.6, 6.0, ["#1f8a4c", "#ffffff", "#1f8a4c"])
    b.finish("cbn_Building", coll)


def nnpc(coll):
    """NNPC Towers: four towers around an octagonal pavilion on a red granite podium."""
    b = Builder()
    stone, bronze, silver, granite = M("#cdb9a0"), M("#5b4a3c", 0.3), M("#c9ccd0", 0.35), M("#8e4b3e")
    red, roofglass, white, ribbon = M("#9c3b2a"), M("#8fa0b0", 0.3), M("#f2f1ec"), M("#3d3530", 0.3)

    b.box(22, 20, 2.5, 0, 0.5, 0, granite)  # common plinth

    def tower(x, y, h, cyl_face):
        pts = chamfer_rect(8, 7, 1.2)
        b.prism(pts, h, stone, Matrix.Translation((x, y, 0)))
        z = 5.0
        while z < h - 2:
            b.prism([(px * 1.01, py * 1.01) for px, py in pts], 0.6, ribbon, Matrix.Translation((x, y, z)))
            z += 2.4
        b.box(4.6, 0.25, h - 6, x - 0.9, y - 3.55, 4.0, bronze)   # curtain walls on the two street faces
        b.box(0.25, 3.8, h - 6, x + 4.05, y + 0.4, 4.0, bronze)
        cx, cy = {"front": (x + 2.2, y - 3.7), "east": (x + 4.2, y - 2.0)}[cyl_face]
        b.cyl(1.0, 1.0, h + 1.5, cx, cy, 0, silver, seg=14)
        b.prism([(px * 1.03, py * 1.03) for px, py in pts], 0.7, red, Matrix.Translation((x, y, h)))
        b.sphere(3.0, x, y, h + 0.7, roofglass, sx=1.25, sy=1.1, sz=0.35, seg=12)
        b.cyl(0.05, 0.04, 4.0, x + 2.0, y + 1.5, h + 0.7, M("#cccccc"), seg=5)

    tower(-6.5, -5.5, 44, "front")
    tower(-6.0, 6.0, 40, "east")
    tower(6.0, 6.5, 34, "east")
    tower(7.5, -2.0, 32, "front")

    # NNPC TOWERS sign on the tallest tower
    w = text_width("NNPC TOWERS", 0.7)
    b.text("NNPC TOWERS", 0.7, -6.5 - w / 2 + 0.4, -9.2, 42.2, M("#c8962e"))
    b.cyl(0.4, 0.4, 0.1, -6.5 - w / 2 - 0.3, -9.1, 42.5, M("#d4a62a"), seg=12, rx=math.pi / 2)
    b.cyl(0.25, 0.25, 0.12, -6.5 - w / 2 - 0.3, -9.15, 42.5, M("#2e7d32"), seg=12, rx=math.pi / 2)

    # red granite podium (front right) with white lattice balconies
    b.box(9.5, 5.5, 6.0, 6.5, -8.0, 0, granite)
    b.box(9.55, 5.55, 0.5, 6.5, -8.0, 3.2, ribbon)
    for gx in (3.0, 5.3, 7.6, 9.9):
        y = -10.8
        for (x0, z0), (x1, z1) in (((-0.8, 1.6), (0.8, 2.8)), ((-0.8, 2.8), (0.8, 1.6)), ((-0.8, 1.6), (0.8, 1.6)), ((-0.8, 2.8), (0.8, 2.8))):
            b.beam((gx + x0, y, z0), (gx + x1, y, z1), 0.08, white)

    # central octagonal pavilion with ribbed pyramid roof
    b.cyl(3.2, 3.2, 2.5, -0.5, 1.0, 2.5, granite, seg=8, rz=math.pi / 8)
    b.cyl(3.8, 0.4, 3.0, -0.5, 1.0, 5.0, white, seg=8, rz=math.pi / 8)
    for k in range(8):
        a = k * math.pi / 4 + math.pi / 8
        b.beam((-0.5 + 3.8 * math.cos(a), 1.0 + 3.8 * math.sin(a), 5.0), (-0.5 + 0.4 * math.cos(a), 1.0 + 0.4 * math.sin(a), 8.0), 0.14, red)
    b.cyl(0.5, 0.5, 0.7, -0.5, 1.0, 8.0, white, seg=8)

    # glazed space-frame canopies at the tower bases
    for cx, cy in ((-6.5, -10.4), (-0.5, -6.5)):
        b.cyl(2.6, 0.3, 2.4, cx, cy, 0, roofglass, seg=4, rz=math.pi / 4)
        for sx in (-1, 1):
            for sy in (-1, 1):
                b.beam((cx + sx * 1.8, cy + sy * 1.8, 0), (cx, cy, 2.4), 0.09, white)

    # Norfolk pines along the street
    for x in (-11.4, -2.0, 1.6, 11.6):
        pine(b, x, -11.4, 7.5)
    for y in (-6.0, 1.0, 8.0):
        pine(b, 11.6, y, 7.0)
    b.finish("nnpc_Towers", coll)


def wtc(coll):
    """World Trade Center Abuja: office tower (west) and curved residential tower (east)."""
    b = Builder()
    dark, silver, band, col = M("#3b4a5c", 0.25), M("#aeb7c0", 0.3), M("#7d8b99"), M("#5a5f66")
    gl_low, cream = M("#2d3640", 0.3), M("#efe7da")
    H = 50.0

    b.box(24, 10, 0.3, 0, 0, 0, M("#cfc6b5"))  # plaza

    # office tower on pilotis
    ox = -6.0
    b.box(7.0, 6.0, 5.0, ox, 0, 0.3, gl_low)
    for x in (-3.4, -1.15, 1.15, 3.4):
        b.box(0.5, 0.5, 5.0, ox + x, -3.4, 0.3, col)
    b.box(8.4, 7.2, H - 5, ox, 0, 5.3, dark)
    b.box(0.08, 7.0, H - 5.6, ox + 4.22, 0, 5.4, silver)
    z = 6.5
    while z < H:
        b.box(8.45, 0.06, 0.18, ox, -3.62, z, band)
        z += 2.1
    y = -3.2
    while y < 3.3:
        b.box(0.06, 0.06, H - 5.6, ox + 4.27, y, 5.4, M("#c9d0d6"))
        y += 0.9
    b.box(5.0, 4.0, 1.6, ox, 0.5, H + 0.3, col)

    # residential tower with wrap-around curved balconies
    rx = 6.2
    core = rounded_rect(7.6, 6.6)
    b.prism(core, H, M("#4a6f93", 0.25), Matrix.Translation((rx, 0, 0.3)))
    slab = [(x * 1.13, y * 1.15) for x, y in core]
    z = 3.0
    while z < H:
        b.prism(slab, 0.28, cream, Matrix.Translation((rx, 0, z + 0.3)))
        z += 2.2
    b.prism([(x * 1.18, y * 1.2) for x, y in core], 0.9, M("#e7dccb"), Matrix.Translation((rx, 0, H + 0.3)))
    b.box(0.5, 0.2, H - 3, rx, -3.75, 2.0, M("#1f2a36"))

    # low link podium (with the exposed red columns seen in the photos)
    b.box(5.0, 5.5, 3.2, 0, 1.0, 0.3, M("#bfb8ad"))
    b.box(4.6, 0.1, 2.4, 0, -1.8, 0.4, gl_low)
    for x in (-1.6, -0.6, 0.6, 1.6):
        b.cyl(0.08, 0.08, 2.0, x, 2.0, 3.5, M("#b03a2e"), seg=6)

    for x, y in ((10.9, -4.5), (2.8, -4.4), (-11.0, -4.5)):
        cypress(b, x, y, 6.5)
    b.finish("wtc_Towers", coll)


def ship_house(coll):
    """Ship House (Ministry of Defence): a cream concrete 'ship' with bow, decks and funnels."""
    b = Builder()
    cream, light, tan, brown = M("#e8dcc0"), M("#f1e8d4"), M("#cfae7f"), M("#a8682e")
    dark, port, fin_dark = M("#4d4a45", 0.4), M("#5b6e7c", 0.3), M("#b8925f")

    def window_rows(x, w, y, z0, z1, step=2.4):
        z = z0
        while z < z1:
            b.box(w, 0.1, 0.9, x, y, z, brown)
            b.box(w - 0.4, 0.12, 0.5, x, y - 0.02, z + 0.2, dark)
            z += step

    # hull (4 floors) with the raised bow on raking struts at the west end
    b.box(33, 8, 10, 0.5, 0.5, 0, cream)
    window_rows(0.5, 32.6, -3.52, 1.5, 9.5)
    b.box(4.0, 7.0, 3.4, -17.8, 0.5, 7.6, cream)
    for y in (-2.6, 0.5, 3.6):
        b.beam((-15.6, y, 0), (-19.4, y, 7.6), 0.6, light)
        b.beam((-15.6, y, 0), (-17.2, y, 7.6), 0.45, light)
    b.box(3.0, 7.5, 8.0, 17.5, 0.5, 0, cream)  # stern step

    # fins along the hull rise above the roofline
    x = -15.8
    while x <= 16.5:
        b.box(0.25, 0.4, 11.0, x, -3.65, 0.4, light)
        x += 2.2

    # decks stepping up
    b.box(25, 6.4, 6.0, -0.5, 1.0, 10, cream)
    window_rows(-0.5, 24.6, -2.22, 11.2, 15.5)
    x = -12.5
    while x <= 11.6:
        b.box(0.22, 0.35, 7.0, x, -2.35, 10, light)
        x += 2.2
    b.box(15, 5.0, 3.6, 1.0, 1.2, 16, cream)
    window_rows(1.0, 14.6, -1.32, 17.2, 19.0)

    # porthole windows
    for x, y, z in ((-4, -2.2, 12.6), (-1, -2.2, 14.6), (2.5, -2.2, 12.6), (5.5, -2.2, 14.6),
                    (8.0, -2.2, 12.6), (-2, -1.3, 18.2), (3, -1.3, 18.2), (-9, -3.5, 8.6), (10, -3.5, 8.6)):
        b.cyl(0.45, 0.45, 0.12, x, y, z, port, seg=12, rx=math.pi / 2)

    # the two funnel towers
    for fx, fy, w, d, h in ((-7.5, 0.2, 3.2, 3.6, 25.0), (12.5, 0.8, 2.8, 3.2, 22.0)):
        b.box(w, d, h, fx, fy, 0, tan)
        for k in range(4):
            b.box(0.18, 0.3, h - 3, fx - w / 2 + 0.5 + k * (w - 1) / 3, fy - d / 2 - 0.1, 1.5, fin_dark)

    # curved shell over the entrance
    for k in range(4):
        b.box(3.2 - k * 0.3, 0.2, 0.9, 4.0, -4.3 - k * 0.15, 1.0 + k * 0.85, light, rx=math.radians(25 + k * 12))

    # boundary wall, hedge, palms and round bushy trees
    b.box(38, 0.25, 0.8, 0, -5.0, 0, M("#f2f0ea"))
    b.box(38, 0.6, 0.6, 0, -4.5, 0, M("#4f7d3a"))
    for x in (-14, -6, 2, 10, 17):
        palm(b, x, -4.4, 6.5)
    for x in (-18, -10, -2, 6, 14):
        round_tree(b, x, -4.4, s=1.0, col="#6f9e3c")
    b.finish("ship-house_Building", coll)


# ---------------------------------------------------------------- fictional tenants (placeholders)

def atlantic_trust(coll):
    b = Builder()
    glass, band, acc, base = M("#3d6f8e", 0.3), M("#d9e4ea"), M("#f2b134"), M("#e6e0d4")
    b.box(10, 8, 3, 0, 0, 0, base)
    banded_box(b, 3.8, 5.4, 36, -2.5, 0, 3, glass, band)
    banded_box(b, 3.8, 5.4, 30, 2.5, 0, 3, glass, band)
    b.box(4.2, 5.8, 1.6, -2.5, 0, 39, acc)
    b.box(4.2, 5.8, 1.6, 2.5, 0, 33, acc)
    for z in (18, 25):
        b.box(1.4, 2.6, 1.6, 0, 0, z, acc)
    b.finish("atlantic-trust_Building", coll)


def maitama_capital(coll):
    b = Builder()
    body, band, acc = M("#c86f4a"), M("#f1d9c9"), M("#2f4858")
    z = 0
    for w, h in ((9.4, 22), (7.2, 13), (5.0, 9)):
        banded_box(b, w, w, h, 0, 0, z, body, band, step=3.2)
        z += h
    b.box(3.0, 3.0, 1.5, 0, 0, z, acc)
    b.cyl(0.12, 0.06, 6, 0, 0, z + 1.5, M("#dddddd"), seg=6)
    b.finish("maitama-capital_Building", coll)


def zuma_mutual(coll):
    b = Builder()
    glass, band, acc, base = M("#7a9e7e", 0.4), M("#e4ede4"), M("#f4f1de"), M("#d9d2c2")
    b.cyl(4.8, 4.8, 2.5, 0, 0, 0, base, seg=20)
    b.cyl(4.0, 4.0, 30, 0, 0, 2.5, glass, seg=20)
    for k in range(1, 10):
        z = 2.5 + k * 3.0
        b.cyl(4.12, 4.12, 0.6 if k % 3 == 0 else 0.18, 0, 0, z, acc if k % 3 == 0 else band, seg=20)
    b.cyl(3.0, 2.6, 3.0, 0, 0, 32.5, acc, seg=20)
    b.finish("zuma-mutual_Building", coll)


def naira_pay(coll):
    b = Builder()
    body, band, acc = M("#5b5f97", 0.35), M("#dcdcf0"), M("#ffc145")
    banded_box(b, 8, 8, 30, 0, 0, 0, body, band)
    b.prism([(-4, 0), (4, 0), (-4, 7)], 8, acc, Matrix.Translation((0, 4, 30)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    for x in (-3.0, -1.0, 1.0, 3.0):
        b.box(0.25, 0.6, 30, x, -4.3, 0, acc)
    b.finish("naira-pay_Building", coll)


def savanna_tel(coll):
    b = Builder()
    shaft, glass, band, acc, white = M("#2a9d8f"), M("#1d5f58", 0.3), M("#cfeae5"), M("#e76f51"), M("#f7f4ee")
    b.box(10, 10, 3, 0, 0, 0, M("#e9e2d4"))
    b.box(10.2, 10.2, 0.4, 0, 0, 3.0, white)
    H, z0 = 40.0, 3.4
    b.cyl(4.3, 3.8, H, 0, 0, z0, shaft, rz=math.pi / 8)
    for k in range(1, int(H / 3.2)):
        z = z0 + k * 3.2
        r = 4.3 - 0.5 * (z - z0) / H
        b.cyl(r + 0.12, r + 0.12, 0.35, 0, 0, z, band, rz=math.pi / 8)
    for a in range(4):
        ang = a * math.pi / 2
        b.box(0.3, 1.0, H - 2, math.cos(ang) * 4.0, math.sin(ang) * 4.0, z0 + 1, glass, rz=ang)
    top = z0 + H
    b.cyl(3.0, 3.0, 5, 0, 0, top, acc, rz=math.pi / 8)
    b.cyl(3.3, 3.3, 0.4, 0, 0, top + 5, white, rz=math.pi / 8)
    b.cyl(1.6, 1.6, 2, 0, 0, top + 5.4, white, rz=math.pi / 8)
    for a in range(3):
        ang = a * 2 * math.pi / 3 + 0.4
        b.cyl(0.15, 0.9, 0.5, math.cos(ang) * 3.2, math.sin(ang) * 3.2, top + 2.8, white, seg=12, rz=ang + math.pi / 2, rx=math.pi / 2)
    b.cyl(0.25, 0.12, 12, 0, 0, top + 7.4, white)
    b.finish("savanna-tel_Building", coll)
    beacon = Builder()
    beacon.dome(0.6, 0, 0, top + 19.4, M("#ff3b3b", 0.5, emit="#ff2020"), seg=12)
    beacon.finish("savanna-tel_Beacon", coll)


def delta_energy(coll):
    b = Builder()
    body, band, acc = M("#6d597a", 0.35), M("#e2dbe6"), M("#e9c46a")
    b.box(10, 8, 2.5, 0, 0, 0, M("#e4ddd2"))
    banded_box(b, 8, 6, 32, 0, 0, 2.5, body, band)
    b.box(6, 4, 2.5, 0, 0, 34.5, acc)
    for x in (-3.2, -1.6, 0, 1.6, 3.2):
        b.box(0.22, 0.5, 32, x, -3.2, 2.5, acc)
    b.finish("delta-energy_Building", coll)


def ministry(coll, oid, body_hex, accent_hex):
    b = Builder()
    stone, white, body, acc = M("#efe8dc"), M("#fbf8f2"), M(body_hex), M(accent_hex)
    b.box(10.2, 9.6, 1.0, 0, 0, 0, stone)
    for k in range(3):
        b.box(5.0 - k * 0.0, 0.5, 0.33 * (k + 1), 0, -5.05 + k * 0.25 + 0.25, 0, stone)
    banded_box(b, 9.0, 6.5, 6.0, 0, 0.6, 1.0, body, M("#d8d0c0"), step=2.0, grow=0.06, t=0.12)
    for k in range(6):
        b.cyl(0.32, 0.32, 4.6, -3.0 + k * 1.2, -3.6, 1.0, white, seg=10)
    b.box(8.0, 1.8, 0.7, 0, -3.3, 5.6, white)
    b.prism([(-4.0, 0), (4.0, 0), (0, 1.6)], 1.8, white, Matrix.Translation((0, -2.4, 6.3)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    b.cyl(3.0, 3.0, 1.2, 0, 1.2, 7.0, white, seg=20)
    b.dome(3.0, 0, 1.2, 8.2, acc, seg=20)
    b.cyl(0.3, 0.1, 1.4, 0, 1.2, 11.1, acc, seg=8)
    flagpole(b, 4.3, -3.8, 8.0, NIGERIA)
    b.finish(f"{oid}_Building", coll)


# ---------------------------------------------------------------- Aso Rock backdrop

def aso_rock(coll):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=4, radius=1.0)
    for v in bm.verts:
        p = v.co.copy()
        n = noise.noise(p * 1.6) * 0.28 + noise.noise(p * 4.2) * 0.08
        q = p * (1 + n)
        q.x, q.y, q.z = q.x * 60, q.y * 40, q.z * 34
        q.x += q.z * 0.35  # lean like the real rock's sloped face
        q.z = max(q.z, 0.0)
        v.co = q
    bm.normal_update()
    mats = [M("#a3968a"), M("#8c8076"), M("#8d9a5c")]
    for f in bm.faces:
        c = f.calc_center_median()
        r = noise.noise(c * 0.07)
        f.material_index = 2 if (c.z < 5 or (f.normal.z > 0.7 and r > 0.05)) else (1 if r < -0.15 else 0)
    me = bpy.data.meshes.new("aso-rock_Rock")
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    coll.objects.link(bpy.data.objects.new("aso-rock_Rock", me))


LANDMARKS = {
    "city-gate": city_gate,
    "national-mosque": national_mosque,
    "cbn": cbn,
    "nnpc": nnpc,
    "wtc": wtc,
    "ship-house": ship_house,
    "nrs": nrs,
    "galaxy-backbone": galaxy_backbone,
    "taj-bank": taj_bank,
    "atlantic-trust": atlantic_trust,
    "maitama-capital": maitama_capital,
    "zuma-mutual": zuma_mutual,
    "naira-pay": naira_pay,
    "savanna-tel": savanna_tel,
    "delta-energy": delta_energy,
    "min-finance": lambda c: ministry(c, "min-finance", "#e8e0d0", "#2e7d32"),
    "min-digital": lambda c: ministry(c, "min-digital", "#e3e6ee", "#1565c0"),
    "aso-rock": aso_rock,
}


# ---------------------------------------------------------------- scene plumbing

def _child_coll(parent, name):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in parent.children:
        parent.children.link(c)
    return c


def _clear(coll):
    for o in list(coll.objects):
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if data is not None and data.users == 0 and isinstance(data, bpy.types.Mesh):
            bpy.data.meshes.remove(data)


def _find_layer(lc, name):
    if lc.collection.name == name:
        return lc
    for ch in lc.children:
        r = _find_layer(ch, name)
        if r:
            return r
    return None


def main(only=None):
    scn = bpy.data.scenes.get("CyberLife") or bpy.data.scenes.new("CyberLife")
    bpy.context.window.scene = scn
    vl = bpy.context.view_layer

    old = bpy.data.collections.get("LagoonTel")  # first prototype, superseded by savanna-tel
    if old:
        _clear(old)
        bpy.data.collections.remove(old)

    root = _child_coll(scn.collection, "Landmarks")
    _find_layer(vl.layer_collection, "Landmarks").exclude = False
    for c in list(root.children):
        if c.name not in LANDMARKS:
            name = c.name
            _clear(c)
            bpy.data.collections.remove(c)
            stale = os.path.join(MODELS, f"{name}.glb")
            if os.path.exists(stale):
                os.remove(stale)
    os.makedirs(MODELS, exist_ok=True)
    report = {}
    for oid, fn in LANDMARKS.items():
        if only and oid not in only:
            continue
        coll = _child_coll(root, oid)
        _clear(coll)
        fn(coll)
        vl.active_layer_collection = _find_layer(vl.layer_collection, oid)
        path = os.path.join(MODELS, f"{oid}.glb")
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_active_collection=True,
                                  use_active_scene=True, export_apply=True)
        tris = sum(len(p.vertices) - 2 for o in coll.objects for p in o.data.polygons)
        report[oid] = {"tris": tris, "kb": round(os.path.getsize(path) / 1024)}

    # Overview: a mini Abuja made of collection instances; sources stay excluded.
    vl.active_layer_collection = vl.layer_collection
    _find_layer(vl.layer_collection, "Landmarks").exclude = True
    ov = _child_coll(scn.collection, "Overview")
    _clear(ov)
    placements = {oid: ((i + (sx - 1) / 2) * CELL, -(j + (sy - 1) / 2) * CELL, 0.3) for oid, (i, j, sx, sy) in LAYOUT.items()}
    placements["city-gate"] = CITY_GATE_POS
    for oid, loc in placements.items():
        inst = bpy.data.objects.new(f"{oid}_instance", None)
        inst.instance_type = "COLLECTION"
        inst.instance_collection = bpy.data.collections[oid]
        inst.location = loc
        ov.objects.link(inst)
    rock = bpy.data.objects.new("aso-rock_instance", None)
    rock.instance_type = "COLLECTION"
    rock.instance_collection = bpy.data.collections["aso-rock"]
    rock.location = ASO_ROCK_POS
    ov.objects.link(rock)
    gb = Builder()
    gb.box(11 * CELL + 2, 9 * CELL + 2, 0.3, 0, 0, 0, M("#cfc8b8"))
    gb.box(600, 600, 0.1, 0, 0, -0.6, M("#d6cfa8"))
    gb.box(5, 160, 0.12, 7, -(63 + 80), -0.5, M("#55585d"))  # airport road toward the City Gate
    gb.finish("Ground", ov)
    return report


if __name__ == "__main__":
    result = main()
