"""Gera os sons de notificação 8-bit do GamePlay (originais, sintetizados)."""
import math, struct, wave
SR = 22050

def env(i, n, a=0.004, r=0.03):
    t = i / SR; tot = n / SR
    if t < a: return t / a
    if t > tot - r: return max(0.0, (tot - t) / r)
    return 1.0

def square(f, dur, duty=0.5, vol=0.32, decay=0.0):
    n = int(SR * dur); out = []
    for i in range(n):
        ph = (i * f / SR) % 1.0
        v = (1 if ph < duty else -1) * vol * env(i, n) * math.exp(-decay * i / SR)
        out.append(v)
    return out

def tri_sweep(f0, f1, dur, vol=0.38):
    n = int(SR * dur); out = []; ph = 0.0
    for i in range(n):
        f = f0 + (f1 - f0) * (i / n); ph = (ph + f / SR) % 1.0
        v = (4 * abs(ph - 0.5) - 1) * vol * env(i, n)
        out.append(v)
    return out

silence = lambda d: [0.0] * int(SR * d)
note = lambda n: 440 * 2 ** ((n - 69) / 12)   # MIDI → Hz

def save(name, samples):
    with wave.open(f'assets/sounds/{name}.wav', 'w') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, s)) * 32767)) for s in samples))

# 1 · LEVEL UP: arpejo subindo (Dó, Mi, Sol, Dó)
lv = []
for m in (84, 88, 91):
    lv += square(note(m), 0.07, 0.5)
lv += square(note(96), 0.28, 0.5, decay=6)
save('gp_levelup', lv)

# 2 · BIP DUPLO: dois bipes curtos, estilo menu de fliperama
bp = square(note(93), 0.08, 0.25) + silence(0.06) + square(note(93), 0.08, 0.25) + square(note(98), 0.16, 0.25, decay=10)
save('gp_bip', bp)

# 3 · POWER-UP: subida rápida e um acorde final
pw = tri_sweep(330, 1320, 0.22) + square(note(88), 0.06, 0.5) + square(note(95), 0.22, 0.5, decay=7)
save('gp_power', pw)
print('ok')
