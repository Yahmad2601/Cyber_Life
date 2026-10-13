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

# Mirror of src/orgs.js placement, used only for the Blender overview: id -> (i, j, span_x)
LAYOUT = {
    "nrs": (0, 0, 1),
    "galaxy-backbone": (2, 0, 2),
    "reserve-authority": (-2, 0, 1),
    "min-finance": (-4, 1, 1),
    "min-digital": (5, 0, 1),
    "taj-bank": (-1, -3, 1),
    "atlantic-trust": (-4, -3, 1),
    "maitama-capital": (2, -3, 1),
    "zuma-mutual": (4, -2, 1),
    "naira-pay": (-3, 3, 1),
    "savanna-tel": (0, 3, 1),
    "delta-energy": (3, 3, 1),
}
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

    def _paint(self, verts, m):
        if m not in self.mats:
            self.mats.append(m)
        i = self.mats.index(m)
        for f in {f for v in verts for f in v.link_faces}:
            f.material_index = i

    def box(self, sx, sy, sz, x, y, z, m, rz=0.0, rx=0.0):
        """Box whose bottom sits at z."""
        mat = Matrix.Translation((x, y, z + sz / 2)) @ Matrix.Rotation(rz, 4, "Z") @ Matrix.Rotation(rx, 4, "X") @ Matrix.Diagonal((sx, sy, sz, 1))
        self._paint(bmesh.ops.create_cube(self.bm, size=1.0, matrix=mat)["verts"], m)

    def cyl(self, r1, r2, h, x, y, z, m, seg=8, rz=0.0, rx=0.0):
        """Cylinder/cone whose base sits at z (before rx tilt)."""
        mat = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, "Z") @ Matrix.Rotation(rx, 4, "X") @ Matrix.Translation((0, 0, h / 2))
        self._paint(bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h, matrix=mat)["verts"], m)

    def beam(self, p0, p1, t, m):
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        up = "X" if abs(d.normalized().y) > 0.99 else "Y"
        rot = d.to_track_quat("Z", up).to_matrix().to_4x4()
        mat = Matrix.Translation((p0 + p1) / 2) @ rot @ Matrix.Diagonal((t, t, d.length, 1))
        self._paint(bmesh.ops.create_cube(self.bm, size=1.0, matrix=mat)["verts"], m)

    def prism(self, pts, h, m, mat=Matrix()):
        """Extrude a CCW polygon (local XY) by h along local Z, then transform."""
        bm = self.bm
        bot = [bm.verts.new(mat @ Vector((px, py, 0))) for px, py in pts]
        top = [bm.verts.new(mat @ Vector((px, py, h))) for px, py in pts]
        n = len(pts)
        bm.faces.new(bot[::-1])
        bm.faces.new(top)
        for i in range(n):
            bm.faces.new((bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i]))
        self._paint(bot + top, m)

    def dome(self, r, x, y, z, m, seg=16):
        vs = bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=seg // 2, radius=r, matrix=Matrix.Translation((x, y, z)))["verts"]
        bmesh.ops.delete(self.bm, geom=[v for v in vs if v.co.z < z - 1e-4], context="VERTS")
        self._paint([v for v in vs if v.is_valid], m)

    def text(self, body, size, x, y, z, m, bold=True, depth=0.12, rz=0.0):
        """Upright extruded text facing -Y, left edge at x, baseline at z."""
        me, w = _text_mesh(body, size, depth, bold)
        me.transform(Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, "Z") @ Matrix.Rotation(math.pi / 2, 4, "X"))
        n0 = len(self.bm.verts)
        self.bm.from_mesh(me)
        self.bm.verts.ensure_lookup_table()
        self._paint([self.bm.verts[i] for i in range(n0, len(self.bm.verts))], m)
        bpy.data.meshes.remove(me)
        return w

    def finish(self, name, coll):
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


def star(r, inner=0.42):
    return [
        ((r if i % 2 == 0 else r * inner) * math.cos(math.pi / 2 + i * math.pi / 5),
         (r if i % 2 == 0 else r * inner) * math.sin(math.pi / 2 + i * math.pi / 5))
        for i in range(10)
    ]


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


def reserve_authority(coll):
    b = Builder()
    body, band, acc, stone = M("#8d6e63"), M("#e9dcd5"), M("#2e7d32"), M("#efe8dc")
    b.box(10.2, 10.2, 2.0, 0, 0, 0, stone)
    for k in range(7):
        b.cyl(0.3, 0.3, 4.0, -3.6 + k * 1.2, -4.7, 2.0, stone, seg=10)
    z = 2.0
    for w, h in ((9.0, 20), (7.0, 12), (5.0, 8)):
        banded_box(b, w, w, h, 0, 0.3, z, body, band, step=3.2)
        z += h
    b.box(3.0, 3.0, 1.5, 0, 0.3, z, acc)
    flagpole(b, 2.0, 0.3, z + 6, NIGERIA)
    b.finish("reserve-authority_Building", coll)


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
    "nrs": nrs,
    "galaxy-backbone": galaxy_backbone,
    "taj-bank": taj_bank,
    "atlantic-trust": atlantic_trust,
    "maitama-capital": maitama_capital,
    "zuma-mutual": zuma_mutual,
    "naira-pay": naira_pay,
    "savanna-tel": savanna_tel,
    "delta-energy": delta_energy,
    "reserve-authority": reserve_authority,
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
    for oid, (i, j, span) in LAYOUT.items():
        inst = bpy.data.objects.new(f"{oid}_instance", None)
        inst.instance_type = "COLLECTION"
        inst.instance_collection = bpy.data.collections[oid]
        inst.location = ((i + (span - 1) / 2) * CELL, -j * CELL, 0.3)
        ov.objects.link(inst)
    rock = bpy.data.objects.new("aso-rock_instance", None)
    rock.instance_type = "COLLECTION"
    rock.instance_collection = bpy.data.collections["aso-rock"]
    rock.location = ASO_ROCK_POS
    ov.objects.link(rock)
    gb = Builder()
    gb.box(11 * CELL + 2, 9 * CELL + 2, 0.3, 0, 0, 0, M("#cfc8b8"))
    gb.box(600, 600, 0.1, 0, 0, -0.6, M("#d6cfa8"))
    gb.finish("Ground", ov)
    return report


if __name__ == "__main__":
    result = main()
