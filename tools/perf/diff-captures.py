import sys, os
from PIL import Image
import numpy as np
a, b = sys.argv[1], sys.argv[2]
out = sys.argv[3] if len(sys.argv) > 3 else None
if out: os.makedirs(out, exist_ok=True)
tot = 0
for f in sorted(os.listdir(a)):
    if not f.endswith('.png') or not os.path.exists(os.path.join(b, f)): continue
    x = np.asarray(Image.open(os.path.join(a, f)).convert('RGB')).astype(int)
    y = np.asarray(Image.open(os.path.join(b, f)).convert('RGB')).astype(int)
    if x.shape != y.shape: print(f, 'TAILLE', x.shape, y.shape); continue
    d = np.abs(x - y).max(axis=2)
    n2, n8, n32 = (d > 2).sum(), (d > 8).sum(), (d > 32).sum()
    if n2:
        tot += 1
        ys, xs = np.nonzero(d > 2)
        print(f'{f:40s} >2:{n2:6d} >8:{n8:6d} >32:{n32:6d} max:{d.max():3d} zone x{xs.min()}-{xs.max()} y{ys.min()}-{ys.max()}')
        if out:
            m = np.zeros_like(x); m[..., 0] = np.minimum(255, d * 8)
            Image.fromarray(np.concatenate([x, y, m], axis=1).astype('uint8')).save(os.path.join(out, f))
print('fichiers différents:', tot)
