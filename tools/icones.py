"""Génère les icônes PNG de la PWA (sans dépendance). Usage : python tools/icones.py"""
import struct, zlib, os

FOND = (58, 79, 140)
CASE = (35, 42, 84)
BLOCS = [  # (colonne, ligne, largeur, couleur) sur une grille 5x5
    (0, 1, 3, (232, 184, 48)),
    (1, 2, 4, (205, 50, 56)),
    (0, 3, 2, (60, 170, 70)),
    (2, 3, 3, (60, 100, 220)),
]

def png(taille, marge, chemin):
    px = bytearray()
    zone = taille - 2 * marge
    cell = zone / 5
    def couleur(x, y):
        if not (marge <= x < taille - marge and marge <= y < taille - marge):
            return FOND
        cx, cy = (x - marge) / cell, (y - marge) / cell
        for c, l, w, col in BLOCS:
            if c <= cx < c + w and l <= cy < l + 1:
                fx, fy = cx - c, cy - l
                if fy < 0.07 or fy > 0.93 or fx < 0.04 or fx > w - 0.04:
                    return tuple(int(v * 0.8) for v in col)
                return col
        return CASE
    for y in range(taille):
        px.append(0)
        for x in range(taille):
            px.extend(couleur(x, y))
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", taille, taille, 8, 2, 0, 0, 0)) \
        + chunk(b"IDAT", zlib.compress(bytes(px), 9)) + chunk(b"IEND", b"")
    open(chemin, "wb").write(data)

ici = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
png(192, 0, os.path.join(ici, "icon-192.png"))
png(512, 0, os.path.join(ici, "icon-512.png"))
png(512, 64, os.path.join(ici, "icon-maskable-512.png"))  # zone sûre : contenu réduit au centre
